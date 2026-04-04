type HttpMethod = "GET" | "POST";

type AuthResponse = {
  token: string;
};

type ConversationResponse = {
  id: string;
  externalId: string;
  contactName?: string | null;
  channel?: string | null;
};

type MessageResponse = {
  id: string;
  status: "PENDING" | "SENT" | "FAILED";
  messageType: "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";
  content: string;
  createdAt: string;
  updatedAt: string;
};

type OutboundPayload = {
  type: "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";
  content?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaFileName?: string;
  mediaFileSizeBytes?: number;
  mediaCaption?: string;
};

type BatteryCase = {
  id: string;
  label: string;
  payload: OutboundPayload;
};

type BatteryResult = {
  id: string;
  label: string;
  messageId: string | null;
  initialStatus: string;
  finalStatus: string;
  durationMs: number;
  error: string | null;
};

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:4000";
const TENANT_SLUG = process.env.BATTERY_TENANT_SLUG ?? "demo";
const USER_EMAIL = process.env.BATTERY_EMAIL ?? "admin@demo.local";
const USER_PASSWORD = process.env.BATTERY_PASSWORD ?? "123456";
const DESTINATION =
  process.env.BATTERY_DESTINATION_EXTERNAL_ID ?? `mvp-media-battery-${Date.now()}@invalid`;
const TARGET_CONVERSATION_ID = process.env.BATTERY_CONVERSATION_ID?.trim() ?? "";
const TARGET_EXTERNAL_ID = process.env.BATTERY_EXISTING_EXTERNAL_ID?.trim() ?? "";
const TARGET_CONTACT_NAME = process.env.BATTERY_EXISTING_CONTACT_NAME?.trim() ?? "";
const LABEL_PREFIX =
  process.env.BATTERY_LABEL_PREFIX?.trim() || `Media battery ${new Date().toISOString()}`;
const POLL_TIMEOUT_MS = Number(process.env.BATTERY_POLL_TIMEOUT_MS ?? 75_000);
const POLL_INTERVAL_MS = Number(process.env.BATTERY_POLL_INTERVAL_MS ?? 2_000);

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

function buildCases(): BatteryCase[] {
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5V8AAAAASUVORK5CYII=",
    "base64"
  );
  const tinyFakeMp4 = Buffer.from("00000020667479706d703432000000006d70343269736f6d", "hex");
  const tinyWav = buildSilentWav(1, 8_000);
  const tinyTxt = Buffer.from("media battery document test", "utf-8");

  const imageDataUrl = encodeDataUrl("image/png", tinyPng);
  const videoDataUrl = encodeDataUrl("video/mp4", tinyFakeMp4);
  const audioDataUrl = encodeDataUrl("audio/wav", tinyWav);
  const documentDataUrl = encodeDataUrl("text/plain", tinyTxt);

  return [
    {
      id: "text",
      label: "Texto",
      payload: {
        type: "TEXT",
        content: `${LABEL_PREFIX}: texto`
      }
    },
    {
      id: "image",
      label: "Imagem",
      payload: {
        type: "IMAGE",
        content: `${LABEL_PREFIX}: imagem`,
        mediaCaption: `${LABEL_PREFIX}: imagem`,
        mediaUrl: imageDataUrl,
        mediaMimeType: "image/png",
        mediaFileName: "battery-image.png",
        mediaFileSizeBytes: tinyPng.length
      }
    },
    {
      id: "video",
      label: "Video",
      payload: {
        type: "VIDEO",
        content: `${LABEL_PREFIX}: video`,
        mediaCaption: `${LABEL_PREFIX}: video`,
        mediaUrl: videoDataUrl,
        mediaMimeType: "video/mp4",
        mediaFileName: "battery-video.mp4",
        mediaFileSizeBytes: tinyFakeMp4.length
      }
    },
    {
      id: "audio",
      label: "Audio",
      payload: {
        type: "AUDIO",
        content: `${LABEL_PREFIX}: audio`,
        mediaUrl: audioDataUrl,
        mediaMimeType: "audio/wav",
        mediaFileName: "battery-audio.wav",
        mediaFileSizeBytes: tinyWav.length
      }
    },
    {
      id: "document",
      label: "Documento",
      payload: {
        type: "DOCUMENT",
        content: `${LABEL_PREFIX}: documento`,
        mediaCaption: `${LABEL_PREFIX}: documento`,
        mediaUrl: documentDataUrl,
        mediaMimeType: "text/plain",
        mediaFileName: "battery-document.txt",
        mediaFileSizeBytes: tinyTxt.length
      }
    }
  ];
}

async function sleep(ms: number) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
  const auth = await apiRequest<AuthResponse>("POST", "/auth/login", null, {
    tenantSlug: TENANT_SLUG,
    email: USER_EMAIL,
    password: USER_PASSWORD
  });
  return auth.token;
}

async function listConversations(token: string) {
  return apiRequest<ConversationResponse[]>("GET", "/conversations", token);
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

async function resolveBatteryConversation(token: string) {
  if (!TARGET_CONVERSATION_ID && !TARGET_EXTERNAL_ID && !TARGET_CONTACT_NAME) {
    return createBatteryConversation(token);
  }

  const conversations = await listConversations(token);

  const match = conversations.find((conversation) => {
    if (TARGET_CONVERSATION_ID && conversation.id === TARGET_CONVERSATION_ID) {
      return true;
    }

    if (TARGET_EXTERNAL_ID && conversation.externalId === TARGET_EXTERNAL_ID) {
      return true;
    }

    if (TARGET_CONTACT_NAME && normalizeText(conversation.contactName).includes(normalizeText(TARGET_CONTACT_NAME))) {
      return true;
    }

    return false;
  });

  if (!match) {
    throw new Error("Conversa alvo nao encontrada para o media battery");
  }

  return match;
}

async function createBatteryConversation(token: string) {
  return apiRequest<ConversationResponse>("POST", "/conversations", token, {
    channel: "WHATSAPP",
    externalId: DESTINATION,
    contactName: "Media Battery Runner"
  });
}

async function sendMessage(token: string, conversationId: string, payload: OutboundPayload) {
  return apiRequest<MessageResponse>(
    "POST",
    `/conversations/${conversationId}/messages`,
    token,
    payload
  );
}

async function fetchMessage(token: string, conversationId: string, messageId: string) {
  return apiRequest<MessageResponse>(
    "GET",
    `/conversations/${conversationId}/messages/${messageId}`,
    token
  );
}

async function waitForTerminalStatus(token: string, conversationId: string, messageId: string) {
  const startedAt = Date.now();
  let latest = await fetchMessage(token, conversationId, messageId);

  while (latest.status === "PENDING" && Date.now() - startedAt < POLL_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);
    latest = await fetchMessage(token, conversationId, messageId);
  }

  return {
    message: latest,
    durationMs: Date.now() - startedAt
  };
}

function printReport(
  conversation: ConversationResponse,
  results: BatteryResult[],
  startedAt: Date,
  finishedAt: Date
) {
  const finalStatusCounts = results.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.finalStatus] = (acc[entry.finalStatus] ?? 0) + 1;
    return acc;
  }, {});

  const payload = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    destination: conversation.externalId || DESTINATION,
    conversationId: conversation.id,
    contactName: conversation.contactName ?? null,
    channel: conversation.channel ?? null,
    finalStatusCounts,
    results
  };

  console.log(JSON.stringify(payload, null, 2));
}

async function main() {
  const startedAt = new Date();
  const cases = buildCases();
  const token = await login();
  const conversation = await resolveBatteryConversation(token);
  const results: BatteryResult[] = [];

  for (const testCase of cases) {
    try {
      const created = await sendMessage(token, conversation.id, testCase.payload);
      const terminal = await waitForTerminalStatus(token, conversation.id, created.id);

      results.push({
        id: testCase.id,
        label: testCase.label,
        messageId: created.id,
        initialStatus: created.status,
        finalStatus: terminal.message.status,
        durationMs: terminal.durationMs,
        error: null
      });
    } catch (error) {
      results.push({
        id: testCase.id,
        label: testCase.label,
        messageId: null,
        initialStatus: "ERROR",
        finalStatus: "ERROR",
        durationMs: 0,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const finishedAt = new Date();
  printReport(conversation, results, startedAt, finishedAt);

  const hasPending = results.some((entry) => entry.finalStatus === "PENDING");
  const hasError = results.some((entry) => entry.finalStatus === "ERROR");
  if (hasPending || hasError) {
    process.exitCode = 2;
  }
}

void main();
