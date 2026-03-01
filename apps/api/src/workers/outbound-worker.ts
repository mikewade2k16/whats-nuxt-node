import axios from "axios";
import { AuditEventType, MessageStatus, MessageType, type Prisma } from "@prisma/client";
import { Worker } from "bullmq";
import { env } from "../config.js";
import { prisma } from "../db.js";
import { publishEvent } from "../event-bus.js";
import {
  deriveMessageCorrelationId,
  getCorrelationIdFromMetadata,
  normalizeCorrelationId,
  withCorrelationIdMetadata
} from "../lib/correlation.js";
import { outboundQueueName } from "../queue.js";
import { redisOptions, redisPublisher } from "../redis.js";
import { recordAuditEvent } from "../services/audit-log.js";
import {
  extractExternalMessageId,
  getEvolutionUrls,
  isMediaType,
  isPlaceholderContent,
  normalizeRecipient
} from "./senders/common.js";
import {
  sendAudioMessage,
  sendDocumentMessage,
  sendImageMessage,
  sendStickerMessage,
  sendVideoMessage
} from "./senders/send-media.js";
import { sendTextMessage } from "./senders/send-text.js";

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function extractEvolutionErrorMessages(payload: unknown) {
  const root = asRecord(payload);
  if (!root) {
    return [];
  }

  const response = asRecord(root.response);
  const fromResponse = response?.message;
  const fromRoot = root.message;
  const source = fromResponse ?? fromRoot;

  if (Array.isArray(source)) {
    return source
      .map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry)))
      .filter((entry) => entry.length > 0);
  }

  if (typeof source === "string") {
    return source.length > 0 ? [source] : [];
  }

  return [];
}

function isUnrecoverableEvolutionError(status: number | undefined, responseData: unknown) {
  if (!status) {
    return false;
  }

  if (status === 401 || status === 403 || status === 404 || status === 405) {
    return true;
  }

  if (status >= 500) {
    return false;
  }

  if (status === 400 || status === 422) {
    const normalized = extractEvolutionErrorMessages(responseData).join(" ").toLowerCase();

    if (normalized.includes("\"exists\":false") || normalized.includes("exists:false")) {
      return true;
    }

    if (normalized.includes("owned media must be a url or base64")) {
      return true;
    }

    if (normalized.includes("required") || normalized.includes("invalid")) {
      return true;
    }
  }

  return false;
}

interface SetStatusAuditOptions {
  eventType: AuditEventType;
  actorUserId?: string | null;
  conversationId?: string | null;
  payloadJson?: Prisma.InputJsonValue;
}

interface SetStatusParams {
  messageId: string;
  tenantId: string;
  status: MessageStatus;
  externalMessageId?: string | null;
  correlationId?: string | null;
  audit?: SetStatusAuditOptions;
}

function appendCorrelationToAuditPayload(payload: Prisma.InputJsonValue | undefined, correlationId: string | null) {
  if (!correlationId) {
    return payload;
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      correlationId
    } as Prisma.InputJsonValue;
  }

  return {
    ...(payload as Record<string, unknown>),
    correlationId
  } as Prisma.InputJsonValue;
}

function isStickerOutboundMessage(message: { messageType: MessageType; metadataJson: unknown }) {
  if (message.messageType !== MessageType.IMAGE) {
    return false;
  }

  const metadata = asRecord(message.metadataJson);
  const media = metadata ? asRecord(metadata.media) : null;

  return Boolean(media?.sendAsSticker === true);
}

async function setStatus(params: SetStatusParams) {
  const updated = await prisma.message.update({
    where: { id: params.messageId },
    data: {
      status: params.status,
      ...(params.externalMessageId !== undefined
        ? {
            externalMessageId: params.externalMessageId
          }
        : {})
    }
  });

  await publishEvent({
    type: "message.updated",
    tenantId: params.tenantId,
    payload: {
      id: updated.id,
      status: updated.status,
      externalMessageId: updated.externalMessageId,
      updatedAt: updated.updatedAt,
      correlationId: params.correlationId ?? null
    }
  });

  if (params.audit) {
    await recordAuditEvent({
      tenantId: params.tenantId,
      actorUserId: params.audit.actorUserId,
      conversationId: params.audit.conversationId,
      messageId: params.messageId,
      eventType: params.audit.eventType,
      payloadJson: appendCorrelationToAuditPayload(params.audit.payloadJson, params.correlationId ?? null)
    });
  }
}

const worker = new Worker(
  outboundQueueName,
  async (job) => {
    const messageId = String(job.data.messageId ?? "");
    if (!messageId) {
      throw new Error("Job sem messageId");
    }
    const jobCorrelationId = normalizeCorrelationId(job.data.correlationId);

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: true,
        tenant: true
      }
    });

    if (!message) {
      throw new Error(`Mensagem nao encontrada: ${messageId}`);
    }

    const correlationId =
      getCorrelationIdFromMetadata(message.metadataJson) ??
      deriveMessageCorrelationId(jobCorrelationId ?? null, message.id);

    if (!getCorrelationIdFromMetadata(message.metadataJson)) {
      await prisma.message.update({
        where: { id: message.id },
        data: {
          metadataJson: withCorrelationIdMetadata(message.metadataJson, correlationId) as Prisma.InputJsonValue
        }
      });
    }

    try {
      const instance = message.tenant.whatsappInstance ?? env.EVOLUTION_DEFAULT_INSTANCE;
      const { textUrl, mediaUrl, audioUrl, contactUrl, stickerUrl } = getEvolutionUrls(instance ?? "");

      if (!env.EVOLUTION_BASE_URL) {
        await setStatus({
          messageId: message.id,
          tenantId: message.tenantId,
          status: MessageStatus.SENT,
          correlationId,
          audit: {
            eventType: AuditEventType.MESSAGE_OUTBOUND_SENT,
            actorUserId: message.senderUserId,
            conversationId: message.conversationId,
            payloadJson: {
              messageType: message.messageType,
              provider: "mock-local",
              externalMessageId: null,
              correlationId
            }
          }
        });
        return;
      }

      const recipient = normalizeRecipient(message.conversation.externalId);
      const apiKey = message.tenant.evolutionApiKey ?? env.EVOLUTION_API_KEY;

      const isMediaMessage = isMediaType(message.messageType);
      const caption = message.mediaCaption ?? (isPlaceholderContent(message.content) ? null : message.content);
      const stickerMode = isStickerOutboundMessage(message);
      let responseData: unknown;

      if (!isMediaMessage) {
        if (!textUrl) {
          throw new Error("EVOLUTION_SEND_PATH nao configurado");
        }

        responseData = await sendTextMessage({
          textUrl,
          contactUrl,
          recipient,
          content: message.content,
          apiKey,
          metadataJson: message.metadataJson,
          conversationExternalId: message.conversation.externalId
        });
      } else {
        const mediaSource = message.mediaUrl?.trim();
        if (!mediaSource) {
          throw new Error(`Mensagem de midia sem mediaUrl: ${message.id}`);
        }

        const sendParams = {
          mediaUrl,
          audioUrl,
          stickerUrl,
          recipient,
          messageType: message.messageType,
          mediaSource,
          caption,
          fileName: message.mediaFileName,
          mimeType: message.mediaMimeType,
          apiKey
        };

        console.info("Dispatch outbound media", {
          messageId: message.id,
          correlationId,
          conversationId: message.conversationId,
          messageType: message.messageType,
          mimeType: message.mediaMimeType,
          fileName: message.mediaFileName,
          fileSizeBytes: message.mediaFileSizeBytes
        });

        switch (message.messageType) {
          case MessageType.IMAGE:
            responseData = stickerMode
              ? await sendStickerMessage(sendParams)
              : await sendImageMessage(sendParams);
            break;
          case MessageType.VIDEO:
            responseData = await sendVideoMessage(sendParams);
            break;
          case MessageType.DOCUMENT:
            responseData = await sendDocumentMessage(sendParams);
            break;
          case MessageType.AUDIO:
            responseData = await sendAudioMessage(sendParams);
            break;
          default:
            throw new Error(`Tipo de midia outbound nao suportado: ${message.messageType}`);
        }
      }

      const externalMessageId = extractExternalMessageId(responseData);

      await setStatus({
        messageId: message.id,
        tenantId: message.tenantId,
        status: MessageStatus.SENT,
        externalMessageId,
        correlationId,
        audit: {
          eventType: AuditEventType.MESSAGE_OUTBOUND_SENT,
          actorUserId: message.senderUserId,
          conversationId: message.conversationId,
          payloadJson: {
            messageType: message.messageType,
            provider: "evolution",
            externalMessageId: externalMessageId ?? null,
            correlationId
          }
        }
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const responseData = error.response?.data;
        const unrecoverable = isUnrecoverableEvolutionError(error.response?.status, responseData);
        console.error("Falha no envio outbound", {
          messageId: message.id,
          correlationId,
          conversationId: message.conversationId,
          status: error.response?.status,
          url: error.config?.url,
          response: responseData,
          responseErrors: extractEvolutionErrorMessages(responseData),
          unrecoverable
        });

        await setStatus({
          messageId: message.id,
          tenantId: message.tenantId,
          status: MessageStatus.FAILED,
          correlationId,
          audit: {
            eventType: AuditEventType.MESSAGE_OUTBOUND_FAILED,
            actorUserId: message.senderUserId,
            conversationId: message.conversationId,
            payloadJson: {
              messageType: message.messageType,
              provider: "evolution",
              statusCode: error.response?.status ?? null,
              errorCode: error.code ?? null,
              responseErrors: extractEvolutionErrorMessages(responseData),
              unrecoverable,
              correlationId
            }
          }
        });
        if (unrecoverable) {
          return;
        }
      } else {
        console.error("Falha no envio outbound", {
          messageId: message.id,
          correlationId,
          conversationId: message.conversationId,
          error
        });

        await setStatus({
          messageId: message.id,
          tenantId: message.tenantId,
          status: MessageStatus.FAILED,
          correlationId,
          audit: {
            eventType: AuditEventType.MESSAGE_OUTBOUND_FAILED,
            actorUserId: message.senderUserId,
            conversationId: message.conversationId,
            payloadJson: {
              messageType: message.messageType,
              provider: "internal",
              errorMessage: error instanceof Error ? error.message : String(error),
              correlationId
            }
          }
        });
        throw error;
      }

      throw error;
    }
  },
  {
    connection: redisOptions
  }
);

worker.on("completed", (job) => {
  console.log(`Job concluido: ${job.id}`, {
    messageId: String(job.data?.messageId ?? ""),
    correlationId: normalizeCorrelationId(job.data?.correlationId)
  });
});

worker.on("failed", (job, error) => {
  const correlationId = normalizeCorrelationId(job?.data?.correlationId);
  if (axios.isAxiosError(error)) {
    console.error(`Job falhou: ${job?.id}`, {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      url: error.config?.url,
      correlationId
    });
    return;
  }

  console.error(`Job falhou: ${job?.id}`, {
    error: error instanceof Error ? error.message : error,
    correlationId
  });
});

const shutdown = async () => {
  console.log("Encerrando worker...");
  await worker.close();
  await redisPublisher.quit();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
