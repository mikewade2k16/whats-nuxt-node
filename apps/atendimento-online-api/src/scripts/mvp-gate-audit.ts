type HttpMethod = "GET" | "POST";

import { loginWithCoreSession } from "./core-session.js";

type ConversationResponse = {
  id: string;
  externalId: string;
};

type MessageResponse = {
  id: string;
  conversationId: string;
  direction: "INBOUND" | "OUTBOUND";
  status: "PENDING" | "SENT" | "FAILED";
  messageType: "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";
  content: string;
  mediaUrl: string | null;
  externalMessageId: string | null;
  createdAt: string;
  updatedAt: string;
};

type MessagesListResponse = {
  conversationId: string;
  messages: MessageResponse[];
  hasMore: boolean;
};

type AuditEvent = {
  id: string;
  messageId: string | null;
  eventType: string;
};

type AuditEventsResponse = {
  events: AuditEvent[];
};

type CheckResult = {
  id: string;
  ok: boolean;
  expected: string;
  actual: string;
};

type OutboundPayload = {
  type: "TEXT" | "IMAGE" | "AUDIO" | "DOCUMENT";
  content?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaFileName?: string;
  mediaFileSizeBytes?: number;
  mediaCaption?: string;
  metadataJson?: Record<string, unknown>;
};

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:4000";
const TENANT_SLUG = process.env.GATE_TENANT_SLUG ?? "demo";
const USER_EMAIL = process.env.GATE_EMAIL ?? "admin@demo.local";
const USER_PASSWORD = process.env.GATE_PASSWORD ?? "123456";
const DESTINATION = process.env.GATE_DESTINATION_EXTERNAL_ID ?? `mvp-gate-${Date.now()}@invalid`;
const POLL_TIMEOUT_MS = Number(process.env.GATE_POLL_TIMEOUT_MS ?? 60_000);
const POLL_INTERVAL_MS = Number(process.env.GATE_POLL_INTERVAL_MS ?? 1_500);

function encodeDataUrl(mimeType: string, buffer: Buffer) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function buildSilentWav(durationSeconds = 1, sampleRate = 8_000) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const numSamples = Math.max(1, Math.trunc(durationSeconds * sampleRate));
  const dataSize = numSamples * blockAlign;
  const fileSize = 36 + dataSize;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(fileSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeErrorMessage(responseStatus: number, responseText: string, parsedBody: unknown) {
  if (parsedBody && typeof parsedBody === "object" && "message" in parsedBody) {
    const message = (parsedBody as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return `HTTP ${responseStatus}: ${message}`;
    }
  }

  if (responseText.length > 0) {
    return `HTTP ${responseStatus}: ${responseText.slice(0, 200)}`;
  }

  return `HTTP ${responseStatus}`;
}

async function apiRequest<T>(
  method: HttpMethod,
  path: string,
  token: string | null,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const raw = await response.text();
  const parsed: unknown = raw.length > 0 ? JSON.parse(raw) : null;

  if (!response.ok) {
    throw new Error(normalizeErrorMessage(response.status, raw, parsed));
  }

  return parsed as T;
}

async function webhookRequest(path: string, body: unknown) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  const explicitToken = process.env.GATE_WEBHOOK_TOKEN?.trim();
  if (explicitToken) {
    headers["x-webhook-token"] = explicitToken;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  const raw = await response.text();
  const parsed: unknown = raw.length > 0 ? JSON.parse(raw) : null;
  return {
    status: response.status,
    body: parsed
  };
}

async function login() {
  const auth = await loginWithCoreSession({
    tenantSlug: TENANT_SLUG,
    email: USER_EMAIL,
    password: USER_PASSWORD
  });

  return auth.token;
}

async function ensureConversation(token: string) {
  try {
    return await apiRequest<ConversationResponse>("GET", "/conversations/sandbox/test", token);
  } catch {
    return apiRequest<ConversationResponse>("POST", "/conversations", token, {
      channel: "WHATSAPP",
      externalId: DESTINATION,
      contactName: "Gate MVP Runner"
    });
  }
}

async function sendMessage(token: string, conversationId: string, payload: OutboundPayload) {
  return apiRequest<MessageResponse>("POST", `/conversations/${conversationId}/messages`, token, payload);
}

async function getMessage(token: string, conversationId: string, messageId: string) {
  return apiRequest<MessageResponse>("GET", `/conversations/${conversationId}/messages/${messageId}`, token);
}

async function listMessages(token: string, conversationId: string, limit = 200) {
  return apiRequest<MessagesListResponse>(
    "GET",
    `/conversations/${conversationId}/messages?limit=${limit}`,
    token
  );
}

async function listConversations(token: string) {
  return apiRequest<ConversationResponse[]>("GET", "/conversations", token);
}

async function hasTerminalAuditEvent(token: string, messageId: string) {
  const response = await apiRequest<AuditEventsResponse>(
    "GET",
    `/tenant/audit-events?limit=50&messageId=${encodeURIComponent(messageId)}`,
    token
  );

  return response.events.some(
    (entry) =>
      entry.messageId === messageId &&
      (entry.eventType === "MESSAGE_OUTBOUND_SENT" || entry.eventType === "MESSAGE_OUTBOUND_FAILED")
  );
}

async function waitForTerminalStatus(token: string, conversationId: string, messageId: string) {
  const startedAt = Date.now();
  let latest = await getMessage(token, conversationId, messageId);

  while (latest.status === "PENDING" && Date.now() - startedAt < POLL_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);
    latest = await getMessage(token, conversationId, messageId);
  }

  return {
    message: latest,
    durationMs: Date.now() - startedAt
  };
}

function pushCheck(
  checks: CheckResult[],
  id: string,
  ok: boolean,
  expected: string,
  actual: string
) {
  checks.push({
    id,
    ok,
    expected,
    actual
  });
}

function createInboundTextPayload(remoteJid: string, externalMessageId: string, text: string) {
  return {
    event: "MESSAGES_UPSERT",
    data: {
      key: {
        remoteJid,
        fromMe: false,
        id: externalMessageId
      },
      pushName: "Gate Inbound User",
      message: {
        conversation: text
      }
    }
  };
}

function createInboundImagePayload(
  remoteJid: string,
  externalMessageId: string,
  caption: string,
  imageBase64: string
) {
  return {
    event: "MESSAGES_UPSERT",
    data: {
      key: {
        remoteJid,
        fromMe: false,
        id: externalMessageId
      },
      pushName: "Gate Inbound User",
      message: {
        imageMessage: {
          caption,
          mimetype: "image/png",
          fileName: "gate-inbound-image.png",
          fileLength: imageBase64.length,
          base64: imageBase64
        }
      }
    }
  };
}

function createOutboundEchoPayload(
  remoteJid: string,
  externalMessageId: string,
  content: string
) {
  return {
    event: "MESSAGES_UPSERT",
    data: {
      key: {
        remoteJid,
        fromMe: true,
        id: externalMessageId
      },
      pushName: "Agent Echo",
      message: {
        conversation: content
      }
    }
  };
}

async function main() {
  const startedAt = new Date();
  const checks: CheckResult[] = [];

  const tinyPngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5V8AAAAASUVORK5CYII=";
  const tinyPngDataUrl = encodeDataUrl("image/png", Buffer.from(tinyPngBase64, "base64"));
  const tinyWav = buildSilentWav(1, 8_000);
  const tinyTxt = Buffer.from("gate mvp document", "utf-8");

  const token = await login();
  const outboundConversation = await ensureConversation(token);

  // 1) Outbound text stability
  const outboundTextContent = `gate-text-${Date.now()}`;
  const outboundText = await sendMessage(token, outboundConversation.id, {
    type: "TEXT",
    content: outboundTextContent
  });
  const outboundTextTerminal = await waitForTerminalStatus(token, outboundConversation.id, outboundText.id);
  const outboundTextAudit = await hasTerminalAuditEvent(token, outboundText.id);

  pushCheck(
    checks,
    "gate-text-terminal-status",
    outboundTextTerminal.message.status === "SENT" || outboundTextTerminal.message.status === "FAILED",
    "status terminal (SENT|FAILED)",
    `status=${outboundTextTerminal.message.status}; durationMs=${outboundTextTerminal.durationMs}`
  );
  pushCheck(
    checks,
    "gate-text-no-infinite-pending",
    outboundTextTerminal.message.status !== "PENDING",
    "nao ficar em PENDING",
    `status=${outboundTextTerminal.message.status}`
  );
  pushCheck(
    checks,
    "gate-text-has-audit",
    outboundTextAudit,
    "evento final de auditoria",
    `hasAudit=${String(outboundTextAudit)}`
  );

  // 2) Outbound media essential stability
  const mediaCases: Array<{ id: string; payload: OutboundPayload }> = [
    {
      id: "IMAGE",
      payload: {
        type: "IMAGE",
        content: "gate image",
        mediaCaption: "gate image",
        mediaUrl: tinyPngDataUrl,
        mediaMimeType: "image/png",
        mediaFileName: "gate-image.png",
        mediaFileSizeBytes: Buffer.from(tinyPngBase64, "base64").length
      }
    },
    {
      id: "AUDIO",
      payload: {
        type: "AUDIO",
        content: "gate audio",
        mediaUrl: encodeDataUrl("audio/wav", tinyWav),
        mediaMimeType: "audio/wav",
        mediaFileName: "gate-audio.wav",
        mediaFileSizeBytes: tinyWav.length
      }
    },
    {
      id: "DOCUMENT",
      payload: {
        type: "DOCUMENT",
        content: "gate document",
        mediaCaption: "gate document",
        mediaUrl: encodeDataUrl("text/plain", tinyTxt),
        mediaMimeType: "text/plain",
        mediaFileName: "gate-document.txt",
        mediaFileSizeBytes: tinyTxt.length
      }
    }
  ];

  for (const mediaCase of mediaCases) {
    const created = await sendMessage(token, outboundConversation.id, mediaCase.payload);
    const terminal = await waitForTerminalStatus(token, outboundConversation.id, created.id);
    const hasAudit = await hasTerminalAuditEvent(token, created.id);
    pushCheck(
      checks,
      `gate-media-${mediaCase.id.toLowerCase()}-terminal-status`,
      terminal.message.status === "SENT" || terminal.message.status === "FAILED",
      "status terminal (SENT|FAILED)",
      `status=${terminal.message.status}; durationMs=${terminal.durationMs}`
    );
    pushCheck(
      checks,
      `gate-media-${mediaCase.id.toLowerCase()}-no-infinite-pending`,
      terminal.message.status !== "PENDING",
      "nao ficar em PENDING",
      `status=${terminal.message.status}`
    );
    pushCheck(
      checks,
      `gate-media-${mediaCase.id.toLowerCase()}-has-audit`,
      hasAudit,
      "evento final de auditoria",
      `hasAudit=${String(hasAudit)}`
    );
  }

  // 3) Inbound text + media via webhook simulation
  const inboundExternalId = process.env.GATE_INBOUND_EXTERNAL_ID ?? `5511${Date.now().toString().slice(-8)}@s.whatsapp.net`;
  const inboundTextExternalMessageId = `gate-in-text-${Date.now()}`;
  const inboundTextContent = `gate inbound text ${Date.now()}`;

  const inboundTextWebhook = await webhookRequest(
    `/webhooks/evolution/${TENANT_SLUG}`,
    createInboundTextPayload(inboundExternalId, inboundTextExternalMessageId, inboundTextContent)
  );
  pushCheck(
    checks,
    "gate-inbound-text-webhook-accepted",
    inboundTextWebhook.status >= 200 && inboundTextWebhook.status < 300,
    "webhook text aceito",
    `status=${inboundTextWebhook.status}`
  );

  await sleep(500);
  const conversationsAfterText = await listConversations(token);
  const inboundConversation = conversationsAfterText.find((entry) => entry.externalId === inboundExternalId) ?? null;

  pushCheck(
    checks,
    "gate-inbound-conversation-created",
    Boolean(inboundConversation),
    "conversa inbound criada",
    `found=${String(Boolean(inboundConversation))}`
  );

  if (inboundConversation) {
    const inboundTextMessages = await listMessages(token, inboundConversation.id);
    const inboundTextMessage = inboundTextMessages.messages.find(
      (entry) => entry.externalMessageId === inboundTextExternalMessageId
    );

    pushCheck(
      checks,
      "gate-inbound-text-stored",
      Boolean(inboundTextMessage),
      "mensagem inbound texto persistida",
      `found=${String(Boolean(inboundTextMessage))}`
    );

    if (inboundTextMessage) {
      pushCheck(
        checks,
        "gate-inbound-text-type",
        inboundTextMessage.messageType === "TEXT",
        "messageType TEXT",
        `messageType=${inboundTextMessage.messageType}`
      );
      pushCheck(
        checks,
        "gate-inbound-text-direction",
        inboundTextMessage.direction === "INBOUND",
        "direction INBOUND",
        `direction=${inboundTextMessage.direction}`
      );
    }

    const inboundImageExternalMessageId = `gate-in-image-${Date.now()}`;
    const inboundImageWebhook = await webhookRequest(
      `/webhooks/evolution/${TENANT_SLUG}`,
      createInboundImagePayload(
        inboundExternalId,
        inboundImageExternalMessageId,
        "gate inbound image",
        tinyPngBase64
      )
    );

    pushCheck(
      checks,
      "gate-inbound-image-webhook-accepted",
      inboundImageWebhook.status >= 200 && inboundImageWebhook.status < 300,
      "webhook imagem aceito",
      `status=${inboundImageWebhook.status}`
    );

    await sleep(500);
    const inboundImageMessages = await listMessages(token, inboundConversation.id);
    const inboundImageMessage = inboundImageMessages.messages.find(
      (entry) => entry.externalMessageId === inboundImageExternalMessageId
    );

    pushCheck(
      checks,
      "gate-inbound-image-stored",
      Boolean(inboundImageMessage),
      "mensagem inbound imagem persistida",
      `found=${String(Boolean(inboundImageMessage))}`
    );

    if (inboundImageMessage) {
      pushCheck(
        checks,
        "gate-inbound-image-type",
        inboundImageMessage.messageType === "IMAGE",
        "messageType IMAGE",
        `messageType=${inboundImageMessage.messageType}`
      );
      pushCheck(
        checks,
        "gate-inbound-image-has-media",
        typeof inboundImageMessage.mediaUrl === "string" && inboundImageMessage.mediaUrl.length > 0,
        "mediaUrl preenchida",
        `hasMediaUrl=${String(Boolean(inboundImageMessage.mediaUrl))}`
      );
    }
  }

  // 4) Outbound echo dedupe (do not duplicate same outbound content)
  const dedupeContent = `gate-dedupe-${Date.now()}`;
  const outboundForDedupe = await sendMessage(token, outboundConversation.id, {
    type: "TEXT",
    content: dedupeContent
  });

  const dedupeWebhookExternalId = `gate-echo-${Date.now()}`;
  const dedupeWebhook = await webhookRequest(
    `/webhooks/evolution/${TENANT_SLUG}`,
    createOutboundEchoPayload(outboundConversation.externalId, dedupeWebhookExternalId, dedupeContent)
  );

  pushCheck(
    checks,
    "gate-dedupe-webhook-accepted",
    dedupeWebhook.status >= 200 && dedupeWebhook.status < 300,
    "webhook de eco aceito",
    `status=${dedupeWebhook.status}`
  );

  await sleep(500);

  const dedupeMessages = await listMessages(token, outboundConversation.id);
  const dedupeMatches = dedupeMessages.messages.filter(
    (entry) => entry.direction === "OUTBOUND" && entry.content === dedupeContent
  );

  pushCheck(
    checks,
    "gate-dedupe-single-outbound",
    dedupeMatches.length === 1,
    "apenas 1 mensagem outbound com mesmo conteudo",
    `count=${dedupeMatches.length}`
  );

  const dedupeTracked = await waitForTerminalStatus(token, outboundConversation.id, outboundForDedupe.id);
  pushCheck(
    checks,
    "gate-dedupe-tracked-message-terminal",
    dedupeTracked.message.status === "SENT" || dedupeTracked.message.status === "FAILED",
    "mensagem dedupe com status terminal",
    `status=${dedupeTracked.message.status}`
  );

  const finishedAt = new Date();
  const failed = checks.filter((entry) => !entry.ok);
  const report = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    apiBase: API_BASE,
    tenantSlug: TENANT_SLUG,
    conversationId: outboundConversation.id,
    summary: {
      total: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length
    },
    checks
  };

  console.log(JSON.stringify(report, null, 2));

  if (failed.length > 0) {
    process.exitCode = 2;
  }
}

void main();
