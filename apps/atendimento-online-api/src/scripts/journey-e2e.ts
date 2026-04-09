type HttpMethod = "GET" | "POST";

import { loginWithCoreSession } from "./core-session.js";

type ConversationResponse = {
  id: string;
  externalId: string;
};

type MessageResponse = {
  id: string;
  conversationId: string;
  status: "PENDING" | "SENT" | "FAILED";
  direction: "INBOUND" | "OUTBOUND";
  messageType: "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";
  content: string;
  externalMessageId: string | null;
  metadataJson?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

type MessagesPageResponse = {
  conversationId: string;
  messages: MessageResponse[];
  hasMore: boolean;
};

type AuditEventResponse = {
  id: string;
  eventType: string;
  payloadJson?: Record<string, unknown> | null;
};

type AuditEventsListResponse = {
  events: AuditEventResponse[];
};

type CheckResult = {
  id: string;
  ok: boolean;
  expected: string;
  actual: string;
};

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:4000";
const TENANT_SLUG = process.env.JOURNEY_TENANT_SLUG ?? "demo";
const USER_EMAIL = process.env.JOURNEY_EMAIL ?? "admin@demo.local";
const USER_PASSWORD = process.env.JOURNEY_PASSWORD ?? "123456";
const POLL_TIMEOUT_MS = Number(process.env.JOURNEY_POLL_TIMEOUT_MS ?? 60_000);
const POLL_INTERVAL_MS = Number(process.env.JOURNEY_POLL_INTERVAL_MS ?? 1_500);

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
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

function normalizeErrorMessage(status: number, rawText: string, parsedBody: unknown) {
  const parsed = asRecord(parsedBody);
  const fromBody = parsed && typeof parsed.message === "string" ? parsed.message : "";
  if (fromBody) {
    return `HTTP ${status}: ${fromBody}`;
  }

  if (rawText.length > 0) {
    return `HTTP ${status}: ${rawText.slice(0, 300)}`;
  }

  return `HTTP ${status}`;
}

async function apiRequest<T>(params: {
  method: HttpMethod;
  path: string;
  token?: string | null;
  body?: unknown;
  correlationId?: string | null;
}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (params.token) {
    headers.Authorization = `Bearer ${params.token}`;
  }

  if (params.correlationId) {
    headers["x-correlation-id"] = params.correlationId;
  }

  const response = await fetch(`${API_BASE}${params.path}`, {
    method: params.method,
    headers,
    body: params.body === undefined ? undefined : JSON.stringify(params.body)
  });

  const rawText = await response.text();
  let parsedBody: unknown = null;
  if (rawText.length > 0) {
    try {
      parsedBody = JSON.parse(rawText);
    } catch {
      parsedBody = rawText;
    }
  }

  if (!response.ok) {
    throw new Error(normalizeErrorMessage(response.status, rawText, parsedBody));
  }

  return parsedBody as T;
}

async function webhookRequest(path: string, body: unknown, correlationId?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (correlationId) {
    headers["x-correlation-id"] = correlationId;
  }

  const explicitWebhookToken = process.env.JOURNEY_WEBHOOK_TOKEN?.trim();
  if (explicitWebhookToken) {
    headers["x-webhook-token"] = explicitWebhookToken;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  const rawText = await response.text();
  let parsedBody: unknown = null;
  if (rawText.length > 0) {
    try {
      parsedBody = JSON.parse(rawText);
    } catch {
      parsedBody = rawText;
    }
  }

  return {
    status: response.status,
    body: parsedBody
  };
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function login() {
  return loginWithCoreSession({
    tenantSlug: TENANT_SLUG,
    email: USER_EMAIL,
    password: USER_PASSWORD
  });
}

async function ensureConversation(token: string, externalId: string) {
  return apiRequest<ConversationResponse>({
    method: "POST",
    path: "/conversations",
    token,
    body: {
      channel: "WHATSAPP",
      externalId,
      contactName: "Journey E2E"
    }
  });
}

async function waitForTerminalMessageStatus(token: string, conversationId: string, messageId: string) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const message = await apiRequest<MessageResponse>({
      method: "GET",
      path: `/conversations/${conversationId}/messages/${messageId}`,
      token
    });

    if (message.status === "SENT" || message.status === "FAILED") {
      return message;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Timeout aguardando status terminal para messageId=${messageId}`);
}

function createInboundTextWebhookPayload(remoteJid: string, externalMessageId: string, text: string) {
  return {
    event: "MESSAGES_UPSERT",
    data: {
      key: {
        remoteJid,
        fromMe: false,
        id: externalMessageId
      },
      pushName: "Journey Inbound User",
      message: {
        conversation: text
      }
    }
  };
}

async function main() {
  const startedAt = new Date();
  const checks: CheckResult[] = [];

  const auth = await login();
  const token = auth.token;
  const now = Date.now();
  const conversationExternalId = `journey-${now}@invalid`;
  const outboundCorrelationId = `journey-outbound-${now}`;
  const inboundCorrelationId = `journey-inbound-${now}`;
  const inboundExternalMessageId = `journey-inbound-${now}`;
  const inboundContent = `journey inbound ${now}`;

  const createdConversation = await ensureConversation(token, conversationExternalId);
  pushCheck(
    checks,
    "journey-conversation-created",
    Boolean(createdConversation?.id),
    "conversa criada",
    `conversationId=${createdConversation?.id ?? "none"}`
  );

  const conversations = await apiRequest<ConversationResponse[]>({
    method: "GET",
    path: "/conversations",
    token
  });

  pushCheck(
    checks,
    "journey-conversation-listed",
    conversations.some((entry) => entry.id === createdConversation.id),
    "conversa aparece na inbox",
    `count=${conversations.length}`
  );

  const outboundMessage = await apiRequest<MessageResponse>({
    method: "POST",
    path: `/conversations/${createdConversation.id}/messages`,
    token,
    correlationId: outboundCorrelationId,
    body: {
      type: "TEXT",
      content: `journey outbound ${now}`
    }
  });

  const outboundMetadata = asRecord(outboundMessage.metadataJson);
  const outboundMessageCorrelation =
    outboundMetadata && typeof outboundMetadata.correlationId === "string"
      ? outboundMetadata.correlationId
      : null;

  pushCheck(
    checks,
    "journey-outbound-created",
    Boolean(outboundMessage.id),
    "mensagem outbound criada",
    `messageId=${outboundMessage.id}`
  );

  pushCheck(
    checks,
    "journey-outbound-correlation-present",
    typeof outboundMessageCorrelation === "string" && outboundMessageCorrelation.length > 0,
    "metadataJson.correlationId preenchido",
    `correlationId=${outboundMessageCorrelation ?? "none"}`
  );

  const outboundTerminal = await waitForTerminalMessageStatus(token, createdConversation.id, outboundMessage.id);
  pushCheck(
    checks,
    "journey-outbound-terminal-status",
    outboundTerminal.status === "SENT" || outboundTerminal.status === "FAILED",
    "status terminal SENT/FAILED",
    `status=${outboundTerminal.status}`
  );

  const outboundAudit = await apiRequest<AuditEventsListResponse>({
    method: "GET",
    path: `/tenant/audit-events?limit=30&messageId=${encodeURIComponent(outboundMessage.id)}`,
    token
  });

  const hasCorrelationInAudit = outboundAudit.events.some((entry) => {
    const payload = asRecord(entry.payloadJson);
    return payload && payload.correlationId === outboundMessageCorrelation;
  });

  pushCheck(
    checks,
    "journey-outbound-audit-correlation",
    hasCorrelationInAudit,
    "auditoria com correlationId da mensagem",
    `events=${outboundAudit.events.length}`
  );

  const inboundWebhook = await webhookRequest(
    `/webhooks/evolution/${TENANT_SLUG}`,
    createInboundTextWebhookPayload(conversationExternalId, inboundExternalMessageId, inboundContent),
    inboundCorrelationId
  );

  pushCheck(
    checks,
    "journey-inbound-webhook-accepted",
    inboundWebhook.status >= 200 && inboundWebhook.status < 300,
    "webhook inbound aceito",
    `status=${inboundWebhook.status}`
  );

  await sleep(600);
  const messagesAfterInbound = await apiRequest<MessagesPageResponse>({
    method: "GET",
    path: `/conversations/${createdConversation.id}/messages?limit=100`,
    token
  });

  const inboundMessage = messagesAfterInbound.messages.find(
    (entry) => entry.externalMessageId === inboundExternalMessageId
  );

  pushCheck(
    checks,
    "journey-inbound-persisted",
    Boolean(inboundMessage),
    "mensagem inbound persistida",
    `found=${String(Boolean(inboundMessage))}`
  );

  pushCheck(
    checks,
    "journey-inbound-direction",
    inboundMessage?.direction === "INBOUND",
    "direction INBOUND",
    `direction=${inboundMessage?.direction ?? "none"}`
  );

  const finishedAt = new Date();
  const passed = checks.filter((entry) => entry.ok).length;
  const failed = checks.filter((entry) => !entry.ok);

  const report = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    apiBase: API_BASE,
    summary: {
      total: checks.length,
      passed,
      failed: failed.length
    },
    checks,
    failedChecks: failed
  };

  console.log(JSON.stringify(report, null, 2));

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exit(1);
});

