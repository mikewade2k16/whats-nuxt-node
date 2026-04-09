type HttpMethod = "GET" | "POST";

import { loginWithCoreSession } from "./core-session.js";

type ConversationResponse = {
  id: string;
  externalId: string;
};

type MessageResponse = {
  id: string;
  status: "PENDING" | "SENT" | "FAILED";
  messageType: "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";
  content: string;
  createdAt: string;
  updatedAt: string;
};

type AuditEvent = {
  id: string;
  messageId: string | null;
  eventType: string;
};

type AuditEventsResponse = {
  events: AuditEvent[];
};

type OutboundPayload = {
  type: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";
  content?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaFileName?: string;
  mediaFileSizeBytes?: number;
  mediaCaption?: string;
};

type IntegrationCase = {
  id: string;
  payload: OutboundPayload;
};

type CaseReport = {
  id: string;
  messageId: string | null;
  initialStatus: string;
  finalStatus: string;
  durationMs: number;
  hasAuditEvent: boolean;
  error: string | null;
};

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:4000";
const TENANT_SLUG = process.env.MEDIA_IT_TENANT_SLUG ?? "demo";
const USER_EMAIL = process.env.MEDIA_IT_EMAIL ?? "admin@demo.local";
const USER_PASSWORD = process.env.MEDIA_IT_PASSWORD ?? "123456";
const DESTINATION = process.env.MEDIA_IT_DESTINATION_EXTERNAL_ID ?? `media-it-${Date.now()}@invalid`;
const POLL_TIMEOUT_MS = Number(process.env.MEDIA_IT_POLL_TIMEOUT_MS ?? 60_000);
const POLL_INTERVAL_MS = Number(process.env.MEDIA_IT_POLL_INTERVAL_MS ?? 1_500);

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

function buildCases(): IntegrationCase[] {
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5V8AAAAASUVORK5CYII=",
    "base64"
  );
  const tinyFakeMp4 = Buffer.from("00000020667479706d703432000000006d70343269736f6d", "hex");
  const tinyWav = buildSilentWav(1, 8_000);
  const tinyTxt = Buffer.from("media integration test document", "utf-8");

  return [
    {
      id: "IMAGE",
      payload: {
        type: "IMAGE",
        content: "IT imagem",
        mediaCaption: "IT imagem",
        mediaUrl: encodeDataUrl("image/png", tinyPng),
        mediaMimeType: "image/png",
        mediaFileName: "it-image.png",
        mediaFileSizeBytes: tinyPng.length
      }
    },
    {
      id: "VIDEO",
      payload: {
        type: "VIDEO",
        content: "IT video",
        mediaCaption: "IT video",
        mediaUrl: encodeDataUrl("video/mp4", tinyFakeMp4),
        mediaMimeType: "video/mp4",
        mediaFileName: "it-video.mp4",
        mediaFileSizeBytes: tinyFakeMp4.length
      }
    },
    {
      id: "AUDIO",
      payload: {
        type: "AUDIO",
        content: "IT audio",
        mediaUrl: encodeDataUrl("audio/wav", tinyWav),
        mediaMimeType: "audio/wav",
        mediaFileName: "it-audio.wav",
        mediaFileSizeBytes: tinyWav.length
      }
    },
    {
      id: "DOCUMENT",
      payload: {
        type: "DOCUMENT",
        content: "IT documento",
        mediaCaption: "IT documento",
        mediaUrl: encodeDataUrl("text/plain", tinyTxt),
        mediaMimeType: "text/plain",
        mediaFileName: "it-document.txt",
        mediaFileSizeBytes: tinyTxt.length
      }
    }
  ];
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiRequest<T>(
  method: HttpMethod,
  path: string,
  token: string | null,
  body?: unknown
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const raw = await response.text();
  const parsed: unknown = raw.length > 0 ? JSON.parse(raw) : null;

  if (!response.ok) {
    const message =
      parsed && typeof parsed === "object" && "message" in parsed
        ? String((parsed as { message?: unknown }).message ?? "")
        : `${response.status} ${response.statusText}`;
    throw new Error(`HTTP ${response.status} ${path}: ${message}`);
  }

  return parsed as T;
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
      contactName: "Media Integration Runner"
    });
  }
}

async function sendMessage(token: string, conversationId: string, payload: OutboundPayload) {
  return apiRequest<MessageResponse>("POST", `/conversations/${conversationId}/messages`, token, payload);
}

async function getMessage(token: string, conversationId: string, messageId: string) {
  return apiRequest<MessageResponse>("GET", `/conversations/${conversationId}/messages/${messageId}`, token);
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

async function hasAuditEventForMessage(token: string, messageId: string) {
  const audit = await apiRequest<AuditEventsResponse>(
    "GET",
    `/tenant/audit-events?limit=50&messageId=${encodeURIComponent(messageId)}`,
    token
  );
  return audit.events.some((entry) =>
    entry.messageId === messageId &&
    (entry.eventType === "MESSAGE_OUTBOUND_SENT" || entry.eventType === "MESSAGE_OUTBOUND_FAILED")
  );
}

async function main() {
  const startedAt = new Date();
  const token = await login();
  const conversation = await ensureConversation(token);
  const cases = buildCases();
  const report: CaseReport[] = [];

  for (const testCase of cases) {
    try {
      const created = await sendMessage(token, conversation.id, testCase.payload);
      const terminal = await waitForTerminalStatus(token, conversation.id, created.id);
      const hasAuditEvent = await hasAuditEventForMessage(token, created.id);

      const isTerminal = terminal.message.status === "SENT" || terminal.message.status === "FAILED";
      if (!isTerminal) {
        throw new Error(`Mensagem ficou em ${terminal.message.status}`);
      }

      if (!hasAuditEvent) {
        throw new Error("Evento de auditoria final nao encontrado");
      }

      report.push({
        id: testCase.id,
        messageId: created.id,
        initialStatus: created.status,
        finalStatus: terminal.message.status,
        durationMs: terminal.durationMs,
        hasAuditEvent,
        error: null
      });
    } catch (error) {
      report.push({
        id: testCase.id,
        messageId: null,
        initialStatus: "ERROR",
        finalStatus: "ERROR",
        durationMs: 0,
        hasAuditEvent: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const finishedAt = new Date();
  const failed = report.filter((entry) => entry.finalStatus === "ERROR" || entry.finalStatus === "PENDING");
  const output = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    apiBase: API_BASE,
    tenantSlug: TENANT_SLUG,
    conversationId: conversation.id,
    summary: {
      total: report.length,
      ok: report.length - failed.length,
      failed: failed.length
    },
    report
  };

  console.log(JSON.stringify(output, null, 2));

  if (failed.length > 0) {
    process.exitCode = 2;
  }
}

void main();
