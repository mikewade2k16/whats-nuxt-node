import {
  AuditEventType,
  ChannelType,
  ConversationStatus,
  MessageDirection,
  Prisma,
  MessageStatus,
  MessageType
} from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../config.js";
import { prisma } from "../../db.js";
import { publishEvent } from "../../event-bus.js";
import {
  deriveMessageCorrelationId,
  getCorrelationIdFromMetadata,
  withCorrelationIdMetadata
} from "../../lib/correlation.js";
import { requireConversationWrite } from "../../lib/guards.js";
import { outboundQueue, outboundRetryJobOptions } from "../../queue.js";
import { recordAuditEvent } from "../../services/audit-log.js";
import type { EvolutionClient } from "../../services/evolution-client.js";
import { validateOutboundUpload } from "../../services/upload-policy.js";
import { asRecord } from "./object-utils.js";
import {
  normalizeReactionEmoji,
  withMessageReactionMetadata
} from "./reactions.js";
import {
  collectRelatedRemoteJidsFromGroupInfo,
  createEvolutionClientForTenant,
  extractPhone,
  findContactByRemoteJid,
  mergeParticipantRecord,
  normalizeParticipantJid,
  parseGroupParticipantsFromPayload,
  shouldResolveParticipantName
} from "./participants.js";
import {
  buildConversationPreviewPayload,
  mapConversation,
  toRealtimeMessagePayload
} from "./realtime.js";
import {
  buildContentDispositionHeader,
  decodeDataUrl,
  extractEvolutionRehydratedMediaPayload,
  isLikelyEncryptedOrEphemeralMediaUrl,
  mediaTypeLabel,
  resolveMediaDownloadFileName,
  resolveOutboundMessageContent,
  sanitizeEncryptedMediaFileName
} from "./media.js";
import {
  isBlockedMediaProxyHost,
  isSandboxDestinationAllowed,
  resolveSandboxTestExternalId
} from "./sandbox.js";
import {
  buildDeletedForAllMetadata,
  cloneForwardMetadata
} from "./message-actions.js";
import {
  assignConversationSchema,
  bulkMessageIdsSchema,
  createConversationSchema,
  forwardMessagesSchema,
  messageMediaQuerySchema,
  reactToMessageSchema,
  reprocessBatchSchema,
  reprocessMessageSchema,
  sendMessageSchema,
  updateStatusSchema
} from "./schemas.js";
import type { GroupParticipantResponse } from "./types.js";

export { mapConversation } from "./realtime.js";

export function registerConversationCoreRoutes(protectedApp: FastifyInstance) {
    protectedApp.get("/conversations", async (request) => {
      const conversations = await prisma.conversation.findMany({
        where: { tenantId: request.authUser.tenantId },
        orderBy: { lastMessageAt: "desc" },
        include: {
          messages: {
            where: {
              hiddenForUsers: {
                none: {
                  userId: request.authUser.sub
                }
              }
            },
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              content: true,
              messageType: true,
              mediaUrl: true,
              direction: true,
              status: true,
              createdAt: true
            }
          }
        }
      });

      return conversations.map(mapConversation);
    });

    protectedApp.get("/conversations/sandbox/test", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      if (!env.SANDBOX_ENABLED) {
        return reply.code(400).send({
          message: "Sandbox desativado. Defina SANDBOX_ENABLED=true para usar conversa de teste."
        });
      }

      const externalId = resolveSandboxTestExternalId();
      const contactPhone = extractPhone(externalId) || null;

      const conversation = await prisma.conversation.upsert({
        where: {
          tenantId_externalId_channel: {
            tenantId: request.authUser.tenantId,
            externalId,
            channel: ChannelType.WHATSAPP
          }
        },
        update: {
          contactName: "Conversa de Teste (Sandbox)",
          contactPhone,
          status: ConversationStatus.OPEN,
          updatedAt: new Date()
        },
        create: {
          tenantId: request.authUser.tenantId,
          channel: ChannelType.WHATSAPP,
          externalId,
          contactName: "Conversa de Teste (Sandbox)",
          contactPhone,
          status: ConversationStatus.OPEN
        },
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              content: true,
              messageType: true,
              mediaUrl: true,
              direction: true,
              status: true,
              createdAt: true
            }
          }
        }
      });

      const payload = mapConversation(conversation);
      await publishEvent({
        type: "conversation.updated",
        tenantId: request.authUser.tenantId,
        payload
      });

      return payload;
    });

    protectedApp.post("/conversations", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const parsed = createConversationSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Payload invalido",
          errors: parsed.error.flatten()
        });
      }

      const { externalId, channel, contactName, contactAvatarUrl, contactPhone } = parsed.data;

      const conversation = await prisma.conversation.upsert({
        where: {
          tenantId_externalId_channel: {
            tenantId: request.authUser.tenantId,
            externalId,
            channel
          }
        },
        update: {
          contactName,
          contactAvatarUrl,
          contactPhone,
          updatedAt: new Date()
        },
        create: {
          tenantId: request.authUser.tenantId,
          channel,
          externalId,
          contactName,
          contactAvatarUrl,
          contactPhone
        },
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              content: true,
              messageType: true,
              mediaUrl: true,
              direction: true,
              status: true,
              createdAt: true
            }
          }
        }
      });

      const payload = mapConversation(conversation);
      await publishEvent({
        type: "conversation.updated",
        tenantId: request.authUser.tenantId,
        payload
      });

      return payload;
    });

}

export function registerConversationMessageReadRoutes(protectedApp: FastifyInstance) {
    protectedApp.get("/conversations/:conversationId/messages", async (request, reply) => {
      const params = z
        .object({
          conversationId: z.string().min(1)
        })
        .safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({ message: "Parametros invalidos" });
      }

      const query = z
        .object({
          limit: z.coerce.number().min(1).max(200).default(100),
          beforeId: z.string().min(1).optional()
        })
        .safeParse(request.query);

      const limit = query.success ? query.data.limit : 100;
      const beforeId = query.success ? query.data.beforeId : undefined;

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: params.data.conversationId,
          tenantId: request.authUser.tenantId
        }
      });

      if (!conversation) {
        return reply.code(404).send({ message: "Conversa nao encontrada" });
      }

      let beforeMessageCreatedAt: Date | null = null;
      if (beforeId) {
        const beforeMessage = await prisma.message.findFirst({
          where: {
            id: beforeId,
            tenantId: request.authUser.tenantId,
            conversationId: conversation.id
          },
          select: {
            createdAt: true
          }
        });
        beforeMessageCreatedAt = beforeMessage?.createdAt ?? null;
      }

      const messagesDesc = await prisma.message.findMany({
        where: {
          tenantId: request.authUser.tenantId,
          conversationId: conversation.id,
          hiddenForUsers: {
            none: {
              userId: request.authUser.sub
            }
          },
          ...(beforeMessageCreatedAt
            ? {
                createdAt: {
                  lt: beforeMessageCreatedAt
                }
              }
            : {})
        },
        orderBy: { createdAt: "desc" },
        take: limit
      });

      const messages = [...messagesDesc].reverse();

      let hasMore = false;
      if (messages.length > 0) {
        const oldest = messages[0];
        const older = await prisma.message.findFirst({
          where: {
            tenantId: request.authUser.tenantId,
            conversationId: conversation.id,
            createdAt: {
              lt: oldest.createdAt
            }
          },
          select: { id: true }
        });
        hasMore = Boolean(older);
      }

      return {
        conversationId: conversation.id,
        messages,
        hasMore
      };
    });

    protectedApp.get("/conversations/:conversationId/messages/:messageId", async (request, reply) => {
      const params = z
        .object({
          conversationId: z.string().min(1),
          messageId: z.string().min(1)
        })
        .safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({ message: "Parametros invalidos" });
      }

      const message = await prisma.message.findFirst({
        where: {
          id: params.data.messageId,
          conversationId: params.data.conversationId,
          tenantId: request.authUser.tenantId,
          hiddenForUsers: {
            none: {
              userId: request.authUser.sub
            }
          }
        }
      });

      if (!message) {
        return reply.code(404).send({ message: "Mensagem nao encontrada" });
      }

      return message;
    });

    protectedApp.get("/conversations/:conversationId/messages/:messageId/media", async (request, reply) => {
      const params = z
        .object({
          conversationId: z.string().min(1),
          messageId: z.string().min(1)
        })
        .safeParse(request.params);
      const query = messageMediaQuerySchema.safeParse(request.query ?? {});

      if (!params.success || !query.success) {
        return reply.code(400).send({ message: "Parametros invalidos" });
      }

      const message = await prisma.message.findFirst({
        where: {
          id: params.data.messageId,
          conversationId: params.data.conversationId,
          tenantId: request.authUser.tenantId,
          hiddenForUsers: {
            none: {
              userId: request.authUser.sub
            }
          }
        },
        select: {
          id: true,
          tenantId: true,
          conversationId: true,
          messageType: true,
          direction: true,
          content: true,
          mediaUrl: true,
          mediaMimeType: true,
          mediaFileName: true,
          mediaFileSizeBytes: true,
          metadataJson: true,
          externalMessageId: true,
          senderName: true,
          senderAvatarUrl: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          conversation: {
            select: {
              externalId: true
            }
          }
        }
      });

      if (!message) {
        return reply.code(404).send({ message: "Mensagem nao encontrada" });
      }

      const wantsDownload = query.data.download === true || query.data.download === "true";
      const disposition = query.data.disposition ?? (wantsDownload ? "attachment" : "inline");
      const conversationExternalId = message.conversation.externalId;

      let effectiveMediaUrl = message.mediaUrl?.trim() ?? "";
      let effectiveMediaMimeType = message.mediaMimeType?.trim() || null;
      let effectiveMediaFileName = message.mediaFileName?.trim() || null;
      let effectiveMediaFileSizeBytes = message.mediaFileSizeBytes ?? null;

      const applyMediaResponseHeaders = () => {
        const fileName = resolveMediaDownloadFileName({
          id: message.id,
          messageType: message.messageType,
          mediaFileName: effectiveMediaFileName,
          mediaMimeType: effectiveMediaMimeType
        });
        reply.header("Content-Disposition", buildContentDispositionHeader(disposition, fileName));
        reply.header("Cache-Control", "private, max-age=60");
      };

      let resolvedEvolutionClient: EvolutionClient | null | undefined;
      let resolvedInstanceName = env.EVOLUTION_DEFAULT_INSTANCE || "default";
      let rehydrateAttempted = false;

      const attemptEvolutionRehydrate = async (reason: string) => {
        if (rehydrateAttempted) {
          return false;
        }
        rehydrateAttempted = true;

        if (!message.externalMessageId?.trim()) {
          return false;
        }

        if (resolvedEvolutionClient === undefined) {
          const tenant = await prisma.tenant.findUnique({
            where: {
              id: request.authUser.tenantId
            },
            select: {
              whatsappInstance: true,
              evolutionApiKey: true
            }
          });

          resolvedEvolutionClient = tenant ? createEvolutionClientForTenant(tenant.evolutionApiKey) : null;
          resolvedInstanceName = tenant?.whatsappInstance?.trim() || env.EVOLUTION_DEFAULT_INSTANCE || "default";
        }

        if (!resolvedEvolutionClient) {
          return false;
        }

        const metadata = asRecord(message.metadataJson);
        const participantJid =
          metadata && typeof metadata.participantJid === "string"
            ? metadata.participantJid.trim()
            : "";

        const keyPayload: Record<string, unknown> = {
          id: message.externalMessageId,
          remoteJid: conversationExternalId,
          fromMe: message.direction === MessageDirection.OUTBOUND
        };

        if (participantJid && conversationExternalId.endsWith("@g.us")) {
          keyPayload.participant = participantJid;
        }

        try {
          const evolutionPayload = await resolvedEvolutionClient.getBase64FromMediaMessage(
            resolvedInstanceName,
            {
              message: {
                key: keyPayload
              },
              convertToMp4: false
            },
            env.EVOLUTION_REQUEST_TIMEOUT_MS
          );

          const rehydratedMedia = extractEvolutionRehydratedMediaPayload(
            evolutionPayload,
            effectiveMediaMimeType
          );
          if (!rehydratedMedia) {
            request.log.warn(
              {
                messageId: message.id,
                reason
              },
              "Nao foi possivel extrair base64 da Evolution para reidratacao de midia"
            );
            return false;
          }

          const resolvedMimeType = rehydratedMedia.mimeType || effectiveMediaMimeType || "application/octet-stream";
          const resolvedFileName =
            sanitizeEncryptedMediaFileName(
              rehydratedMedia.fileName ?? effectiveMediaFileName,
              resolvedMimeType,
              message.messageType
            ) ??
            resolveMediaDownloadFileName({
              id: message.id,
              messageType: message.messageType,
              mediaFileName: null,
              mediaMimeType: resolvedMimeType
            });

          const nextMetadata = {
            ...(asRecord(message.metadataJson) ?? {})
          } as Record<string, unknown>;

          if (!nextMetadata.legacyMediaUrl && effectiveMediaUrl) {
            nextMetadata.legacyMediaUrl = effectiveMediaUrl;
          }
          nextMetadata.hasMediaUrl = true;
          nextMetadata.mediaSourceKind = "base64";
          nextMetadata.requiresMediaDecrypt = false;
          nextMetadata.mediaRehydratedAt = new Date().toISOString();
          nextMetadata.mediaRehydratedBy = "conversation-media-proxy";
          nextMetadata.mediaRehydratedReason = reason;

          const updatedMessage = await prisma.message.update({
            where: {
              id: message.id
            },
            data: {
              mediaUrl: rehydratedMedia.dataUrl,
              mediaMimeType: resolvedMimeType,
              mediaFileName: resolvedFileName,
              mediaFileSizeBytes: rehydratedMedia.sizeBytes || effectiveMediaFileSizeBytes,
              metadataJson: nextMetadata as Prisma.InputJsonValue
            }
          });

          effectiveMediaUrl = updatedMessage.mediaUrl?.trim() ?? "";
          effectiveMediaMimeType = updatedMessage.mediaMimeType?.trim() || null;
          effectiveMediaFileName = updatedMessage.mediaFileName?.trim() || null;
          effectiveMediaFileSizeBytes = updatedMessage.mediaFileSizeBytes ?? null;

          await publishEvent({
            type: "message.updated",
            tenantId: request.authUser.tenantId,
            payload: toRealtimeMessagePayload(updatedMessage) as unknown as Record<string, unknown>
          });

          return Boolean(effectiveMediaUrl);
        } catch (error) {
          request.log.warn(
            {
              messageId: message.id,
              reason,
              error: error instanceof Error ? error.message : String(error)
            },
            "Falha ao reidratar midia legada via Evolution"
          );
          return false;
        }
      };

      const metadata = asRecord(message.metadataJson);
      const requiresDecrypt =
        metadata?.requiresMediaDecrypt === true || metadata?.mediaSourceKind === "url_encrypted";
      if (
        (!effectiveMediaUrl || requiresDecrypt || isLikelyEncryptedOrEphemeralMediaUrl(effectiveMediaUrl)) &&
        message.externalMessageId
      ) {
        await attemptEvolutionRehydrate("legacy-media");
      }

      if (!effectiveMediaUrl) {
        return reply.code(404).send({ message: "Midia nao encontrada na mensagem" });
      }

      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (effectiveMediaUrl.startsWith("data:")) {
          const parsedDataUrl = decodeDataUrl(effectiveMediaUrl);
          if (!parsedDataUrl) {
            return reply.code(422).send({ message: "Media data URL invalida" });
          }

          applyMediaResponseHeaders();
          const mimeType =
            effectiveMediaMimeType?.trim() || parsedDataUrl.mimeType || "application/octet-stream";
          reply.type(mimeType);
          reply.header("Content-Length", String(parsedDataUrl.buffer.length));
          return reply.send(parsedDataUrl.buffer);
        }

        let targetUrl: URL;
        try {
          targetUrl = new URL(effectiveMediaUrl);
        } catch {
          const rehydrated = await attemptEvolutionRehydrate("invalid-url");
          if (rehydrated) {
            continue;
          }
          return reply.code(422).send({ message: "mediaUrl invalida para download" });
        }

        if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
          return reply.code(422).send({ message: "Protocolo de midia nao suportado" });
        }

        if (isBlockedMediaProxyHost(targetUrl.hostname)) {
          return reply.code(403).send({ message: "Host de midia bloqueado por seguranca" });
        }

        let upstreamResponse: Response;
        const timeoutMs = Math.max(10_000, Math.min(env.EVOLUTION_REQUEST_TIMEOUT_MS, 120_000));
        const abortController = new AbortController();
        const timeoutHandle = setTimeout(() => {
          abortController.abort();
        }, timeoutMs);
        try {
          upstreamResponse = await fetch(targetUrl.toString(), {
            method: "GET",
            redirect: "follow",
            signal: abortController.signal
          });
        } catch {
          const rehydrated = await attemptEvolutionRehydrate("provider-fetch-failure");
          if (rehydrated) {
            continue;
          }
          return reply.code(502).send({ message: "Falha ao buscar midia no provedor" });
        } finally {
          clearTimeout(timeoutHandle);
        }

        if (!upstreamResponse.ok) {
          const rehydrated = await attemptEvolutionRehydrate(`provider-status-${upstreamResponse.status}`);
          if (rehydrated) {
            continue;
          }
          return reply.code(502).send({
            message: `Provedor de midia respondeu com erro (${upstreamResponse.status})`
          });
        }

        const contentTypeFromProvider = upstreamResponse.headers.get("content-type")?.split(";")[0]?.trim() ?? null;
        const mimeType =
          effectiveMediaMimeType?.trim() || contentTypeFromProvider || "application/octet-stream";
        const payload = Buffer.from(await upstreamResponse.arrayBuffer());
        applyMediaResponseHeaders();
        reply.type(mimeType);
        reply.header("Content-Length", String(payload.length));
        return reply.send(payload);
      }

      return reply.code(502).send({ message: "Falha ao carregar midia da mensagem" });
    });

}

export function registerConversationGroupRoutes(protectedApp: FastifyInstance) {
    protectedApp.get("/conversations/:conversationId/group-participants", async (request, reply) => {
      const params = z
        .object({
          conversationId: z.string().min(1)
        })
        .safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({ message: "Parametros invalidos" });
      }

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: params.data.conversationId,
          tenantId: request.authUser.tenantId
        }
      });

      if (!conversation) {
        return reply.code(404).send({ message: "Conversa nao encontrada" });
      }

      if (conversation.channel !== ChannelType.WHATSAPP || !conversation.externalId.endsWith("@g.us")) {
        return reply.code(400).send({ message: "Conversa nao e um grupo WhatsApp" });
      }

      const participantsMap = new Map<string, GroupParticipantResponse>();

      const recentMessages = await prisma.message.findMany({
        where: {
          tenantId: request.authUser.tenantId,
          conversationId: conversation.id,
          direction: MessageDirection.INBOUND
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 400,
        select: {
          senderName: true,
          senderAvatarUrl: true,
          metadataJson: true
        }
      });

      for (const messageEntry of recentMessages) {
        const metadata = asRecord(messageEntry.metadataJson);
        const participantJidRaw = metadata && typeof metadata.participantJid === "string"
          ? metadata.participantJid
          : null;

        if (participantJidRaw) {
          mergeParticipantRecord(participantsMap, {
            jid: participantJidRaw,
            name: messageEntry.senderName,
            avatarUrl: messageEntry.senderAvatarUrl
          });
        }

        const mentions = metadata ? asRecord(metadata.mentions) : null;
        const mentioned = mentions && Array.isArray(mentions.mentioned)
          ? mentions.mentioned.filter((entry): entry is string => typeof entry === "string")
          : [];
        const displayByJid = mentions ? asRecord(mentions.displayByJid) : null;

        for (const mentionedJid of mentioned) {
          mergeParticipantRecord(participantsMap, {
            jid: mentionedJid,
            name: displayByJid && typeof displayByJid[mentionedJid] === "string"
              ? String(displayByJid[mentionedJid])
              : null
          });
        }
      }

      const tenant = await prisma.tenant.findUnique({
        where: {
          id: request.authUser.tenantId
        },
        select: {
          evolutionApiKey: true,
          whatsappInstance: true
        }
      });

      const evolutionClient = tenant ? createEvolutionClientForTenant(tenant.evolutionApiKey) : null;
      const instanceName = tenant?.whatsappInstance?.trim() || env.EVOLUTION_DEFAULT_INSTANCE || "default";
      let groupInfo: Record<string, unknown> | null = null;

      if (evolutionClient) {
        try {
          groupInfo = await evolutionClient.findGroupInfo(instanceName, conversation.externalId);
          const apiParticipants = parseGroupParticipantsFromPayload(groupInfo);
          for (const participant of apiParticipants) {
            mergeParticipantRecord(participantsMap, participant);
          }
        } catch {
          // best-effort: fallback to participant list inferred from message history.
        }
      }

      if (evolutionClient) {
        for (const participant of [...participantsMap.values()]) {
          const normalizedParticipantJid = normalizeParticipantJid(participant.jid);
          if (!normalizedParticipantJid) {
            continue;
          }

          const remoteJidCandidates = new Set<string>();
          if (participant.phone) {
            remoteJidCandidates.add(`${participant.phone}@s.whatsapp.net`);
          }
          remoteJidCandidates.add(normalizedParticipantJid);

          if (groupInfo) {
            for (const relatedJid of collectRelatedRemoteJidsFromGroupInfo(groupInfo, normalizedParticipantJid)) {
              remoteJidCandidates.add(relatedJid);
            }
          }

          if (remoteJidCandidates.size === 0) {
            continue;
          }

          if (!shouldResolveParticipantName(participant) && participant.avatarUrl) {
            continue;
          }

          const contact = await findContactByRemoteJid(evolutionClient, instanceName, [...remoteJidCandidates]);
          if (!contact) {
            continue;
          }

          mergeParticipantRecord(participantsMap, {
            jid: normalizedParticipantJid,
            phone: contact.phone || participant.phone,
            name: contact.name,
            avatarUrl: contact.avatarUrl
          });
        }
      }

      const participants = [...participantsMap.values()]
        .sort((left, right) => left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" }));

      return {
        conversationId: conversation.id,
        participants
      };
    });

}

export function registerConversationMessageWriteRoutes(protectedApp: FastifyInstance) {
    protectedApp.post("/conversations/:conversationId/messages", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const params = z
        .object({
          conversationId: z.string().min(1)
        })
        .safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({ message: "Parametros invalidos" });
      }

      const body = sendMessageSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({
          message: "Payload invalido",
          errors: body.error.flatten()
        });
      }

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: params.data.conversationId,
          tenantId: request.authUser.tenantId
        }
      });

      if (!conversation) {
        return reply.code(404).send({ message: "Conversa nao encontrada" });
      }
      const messageCorrelationId = deriveMessageCorrelationId(request.correlationId);

      if (body.data.type !== MessageType.TEXT) {
        const tenantLimits = await prisma.tenant.findUnique({
          where: { id: request.authUser.tenantId },
          select: {
            maxUploadMb: true
          }
        });

        if (!tenantLimits) {
          return reply.code(404).send({ message: "Tenant nao encontrado" });
        }

        const uploadValidation = validateOutboundUpload(tenantLimits, {
          messageType: body.data.type,
          mediaUrl: body.data.mediaUrl,
          mediaMimeType: body.data.mediaMimeType,
          mediaFileSizeBytes: body.data.mediaFileSizeBytes
        });

        if (!uploadValidation.ok) {
          return reply.code(uploadValidation.error.statusCode).send({
            message: uploadValidation.error.message,
            code: uploadValidation.error.code,
            details: uploadValidation.error.details
          });
        }
      }

      if (!isSandboxDestinationAllowed(conversation.externalId)) {
        return reply.code(403).send({
          message: "Sandbox bloqueou envio para destino fora da allowlist.",
          sandbox: {
            enabled: true,
            destination: conversation.externalId
          }
        });
      }

      const content = resolveOutboundMessageContent(body.data);
      const outboundMetadataWithCorrelation = withCorrelationIdMetadata(
        body.data.metadataJson,
        messageCorrelationId
      );

      const message = await prisma.message.create({
        data: {
          tenant: {
            connect: {
              id: request.authUser.tenantId
            }
          },
          conversation: {
            connect: {
              id: conversation.id
            }
          },
          senderUser: {
            connect: {
              id: request.authUser.sub
            }
          },
          direction: MessageDirection.OUTBOUND,
          messageType: body.data.type,
          senderName: request.authUser.name,
          senderAvatarUrl: null,
          content,
          mediaUrl: body.data.mediaUrl?.trim() || null,
          mediaMimeType: body.data.mediaMimeType?.trim() || null,
          mediaFileName: body.data.mediaFileName?.trim() || null,
          mediaFileSizeBytes: body.data.mediaFileSizeBytes,
          mediaCaption: body.data.mediaCaption?.trim() || null,
          mediaDurationSeconds: body.data.mediaDurationSeconds,
          metadataJson: outboundMetadataWithCorrelation as Prisma.InputJsonValue,
          status: MessageStatus.PENDING
        }
      });

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: message.createdAt,
          status: ConversationStatus.OPEN
        }
      });

      try {
        await outboundQueue.add(
          "send-message",
          {
            tenantId: request.authUser.tenantId,
            conversationId: conversation.id,
            messageId: message.id,
            correlationId: messageCorrelationId
          },
          outboundRetryJobOptions
        );
      } catch (queueError) {
        const queueErrorMessage = queueError instanceof Error ? queueError.message : String(queueError);

        const failed = await prisma.message.update({
          where: { id: message.id },
          data: {
            status: MessageStatus.FAILED
          }
        });

        await publishEvent({
          type: "message.created",
          tenantId: request.authUser.tenantId,
          payload: {
            ...(toRealtimeMessagePayload(failed) as unknown as Record<string, unknown>),
            correlationId: messageCorrelationId
          }
        });

        await recordAuditEvent({
          tenantId: request.authUser.tenantId,
          actorUserId: request.authUser.sub,
          conversationId: conversation.id,
          messageId: failed.id,
          eventType: AuditEventType.MESSAGE_OUTBOUND_FAILED,
          payloadJson: {
            messageType: failed.messageType,
            provider: "queue",
            stage: "queue_add",
            errorMessage: queueErrorMessage,
            correlationId: messageCorrelationId
          } as Prisma.InputJsonValue
        });

        return reply.code(202).send(failed);
      }

      await publishEvent({
        type: "message.created",
        tenantId: request.authUser.tenantId,
        payload: {
          ...(toRealtimeMessagePayload(message) as unknown as Record<string, unknown>),
          correlationId: messageCorrelationId
        }
      });

      await recordAuditEvent({
        tenantId: request.authUser.tenantId,
        actorUserId: request.authUser.sub,
        conversationId: conversation.id,
        messageId: message.id,
        eventType: AuditEventType.MESSAGE_OUTBOUND_QUEUED,
        payloadJson: {
          messageType: message.messageType,
          status: message.status,
          queuedBy: {
            userId: request.authUser.sub,
            userName: request.authUser.name
          },
          correlationId: messageCorrelationId,
          queue: {
            name: "send-message",
            attempts: 3,
            backoffType: "exponential",
            backoffDelayMs: 2000
          }
        } as Prisma.InputJsonValue
      });

      return message;
    });

    protectedApp.post("/conversations/:conversationId/messages/delete-for-me", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const params = z
        .object({
          conversationId: z.string().min(1)
        })
        .safeParse(request.params);
      const body = bulkMessageIdsSchema.safeParse(request.body ?? {});

      if (!params.success || !body.success) {
        return reply.code(400).send({ message: "Payload invalido" });
      }

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: params.data.conversationId,
          tenantId: request.authUser.tenantId
        }
      });

      if (!conversation) {
        return reply.code(404).send({ message: "Conversa nao encontrada" });
      }

      const messageIds = [...new Set(body.data.messageIds)];
      const messagesToHide = await prisma.message.findMany({
        where: {
          tenantId: request.authUser.tenantId,
          conversationId: conversation.id,
          id: {
            in: messageIds
          }
        },
        select: {
          id: true
        }
      });

      const hiddenIds = messagesToHide.map((entry) => entry.id);
      const skippedIds = messageIds.filter((entry) => !hiddenIds.includes(entry));

      if (hiddenIds.length > 0) {
        await prisma.hiddenMessageForUser.createMany({
          data: hiddenIds.map((messageId) => ({
            tenantId: request.authUser.tenantId,
            userId: request.authUser.sub,
            messageId
          })),
          skipDuplicates: true
        });
      }

      const lastVisibleMessage = await prisma.message.findFirst({
        where: {
          tenantId: request.authUser.tenantId,
          conversationId: conversation.id,
          hiddenForUsers: {
            none: {
              userId: request.authUser.sub
            }
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        select: {
          id: true,
          content: true,
          messageType: true,
          mediaUrl: true,
          direction: true,
          status: true,
          createdAt: true
        }
      });

      return {
        deletedIds: hiddenIds,
        skippedIds,
        conversation: buildConversationPreviewPayload({
          conversation,
          lastMessage: lastVisibleMessage
        })
      };
    });

    protectedApp.post("/conversations/:conversationId/messages/delete-for-all", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const params = z
        .object({
          conversationId: z.string().min(1)
        })
        .safeParse(request.params);
      const body = bulkMessageIdsSchema.safeParse(request.body ?? {});

      if (!params.success || !body.success) {
        return reply.code(400).send({ message: "Payload invalido" });
      }

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: params.data.conversationId,
          tenantId: request.authUser.tenantId
        }
      });

      if (!conversation) {
        return reply.code(404).send({ message: "Conversa nao encontrada" });
      }

      const tenant = await prisma.tenant.findUnique({
        where: {
          id: request.authUser.tenantId
        },
        select: {
          evolutionApiKey: true,
          whatsappInstance: true
        }
      });

      if (!tenant) {
        return reply.code(404).send({ message: "Tenant nao encontrado" });
      }

      const instanceName = tenant.whatsappInstance?.trim() || env.EVOLUTION_DEFAULT_INSTANCE || "";
      const evolutionClient = createEvolutionClientForTenant(tenant.evolutionApiKey);

      if (!evolutionClient || !instanceName) {
        return reply.code(409).send({
          message: "WhatsApp nao esta configurado para apagar mensagens para todos."
        });
      }

      const messageIds = [...new Set(body.data.messageIds)];
      const messagesToDelete = await prisma.message.findMany({
        where: {
          tenantId: request.authUser.tenantId,
          conversationId: conversation.id,
          direction: MessageDirection.OUTBOUND,
          id: {
            in: messageIds
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      });

      const updatedMessages: typeof messagesToDelete = [];
      const updatedIds: string[] = [];
      const skippedIds = messageIds.filter((entry) => !messagesToDelete.some((message) => message.id === entry));
      const failedIds: string[] = [];

      for (const messageEntry of messagesToDelete) {
        if (!messageEntry.externalMessageId?.trim()) {
          skippedIds.push(messageEntry.id);
          continue;
        }

        const metadata = asRecord(messageEntry.metadataJson);
        const participantJid =
          metadata && typeof metadata.participantJid === "string"
            ? normalizeParticipantJid(metadata.participantJid)
            : null;

        const providerPayload: Record<string, unknown> = {
          id: messageEntry.externalMessageId,
          remoteJid: conversation.externalId,
          fromMe: true
        };

        if (participantJid && conversation.externalId.endsWith("@g.us")) {
          providerPayload.participant = participantJid;
        }

        try {
          await evolutionClient.deleteMessageForEveryone({
            instanceName,
            pathTemplate: env.EVOLUTION_DELETE_FOR_ALL_PATH,
            payload: providerPayload,
            timeoutMs: env.EVOLUTION_REQUEST_TIMEOUT_MS
          });
        } catch (error) {
          failedIds.push(messageEntry.id);
          request.log.error(
            {
              messageId: messageEntry.id,
              conversationId: conversation.id,
              error
            },
            "Falha ao apagar mensagem para todos na Evolution"
          );
          continue;
        }

        const correlationId =
          getCorrelationIdFromMetadata(messageEntry.metadataJson) ??
          deriveMessageCorrelationId(request.correlationId, messageEntry.id);

        const updated = await prisma.message.update({
          where: {
            id: messageEntry.id
          },
          data: {
            messageType: MessageType.TEXT,
            content: "Esta mensagem foi apagada.",
            mediaUrl: null,
            mediaMimeType: null,
            mediaFileName: null,
            mediaFileSizeBytes: null,
            mediaCaption: null,
            mediaDurationSeconds: null,
            metadataJson: withCorrelationIdMetadata(
              buildDeletedForAllMetadata(messageEntry.metadataJson, {
                userId: request.authUser.sub,
                userName: request.authUser.name
              }, {
                content: messageEntry.content,
                messageType: messageEntry.messageType
              }),
              correlationId
            ) as Prisma.InputJsonValue
          }
        });

        updatedMessages.push(updated);
        updatedIds.push(updated.id);

        await publishEvent({
          type: "message.updated",
          tenantId: request.authUser.tenantId,
          payload: {
            ...(toRealtimeMessagePayload(updated) as unknown as Record<string, unknown>),
            correlationId
          }
        });
      }

      return {
        updatedIds,
        skippedIds: [...new Set(skippedIds)],
        failedIds,
        messages: updatedMessages
      };
    });

    protectedApp.post("/conversations/:conversationId/messages/forward", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const params = z
        .object({
          conversationId: z.string().min(1)
        })
        .safeParse(request.params);
      const body = forwardMessagesSchema.safeParse(request.body ?? {});

      if (!params.success || !body.success) {
        return reply.code(400).send({ message: "Payload invalido" });
      }

      const [sourceConversation, targetConversation] = await prisma.$transaction([
        prisma.conversation.findFirst({
          where: {
            id: params.data.conversationId,
            tenantId: request.authUser.tenantId
          }
        }),
        prisma.conversation.findFirst({
          where: {
            id: body.data.targetConversationId,
            tenantId: request.authUser.tenantId
          }
        })
      ]);

      if (!sourceConversation) {
        return reply.code(404).send({ message: "Conversa origem nao encontrada" });
      }

      if (!targetConversation) {
        return reply.code(404).send({ message: "Conversa destino nao encontrada" });
      }

      if (!isSandboxDestinationAllowed(targetConversation.externalId)) {
        return reply.code(403).send({
          message: "Sandbox bloqueou encaminhamento para destino fora da allowlist.",
          sandbox: {
            enabled: true,
            destination: targetConversation.externalId
          }
        });
      }

      const messageIds = [...new Set(body.data.messageIds)];
      const sourceMessages = await prisma.message.findMany({
        where: {
          tenantId: request.authUser.tenantId,
          conversationId: sourceConversation.id,
          id: {
            in: messageIds
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      });

      if (sourceMessages.length === 0) {
        return reply.code(404).send({ message: "Nenhuma mensagem encontrada para encaminhar" });
      }

      const createdMessages: typeof sourceMessages = [];
      const queuedIds: string[] = [];
      const failedToQueueIds: string[] = [];

      for (const sourceMessage of sourceMessages) {
        const correlationId = deriveMessageCorrelationId(request.correlationId, sourceMessage.id);
        const created = await prisma.message.create({
          data: {
            tenant: {
              connect: {
                id: request.authUser.tenantId
              }
            },
            conversation: {
              connect: {
                id: targetConversation.id
              }
            },
            senderUser: {
              connect: {
                id: request.authUser.sub
              }
            },
            direction: MessageDirection.OUTBOUND,
            messageType: sourceMessage.messageType,
            senderName: request.authUser.name,
            senderAvatarUrl: null,
            content: sourceMessage.content,
            mediaUrl: sourceMessage.mediaUrl,
            mediaMimeType: sourceMessage.mediaMimeType,
            mediaFileName: sourceMessage.mediaFileName,
            mediaFileSizeBytes: sourceMessage.mediaFileSizeBytes,
            mediaCaption: sourceMessage.mediaCaption,
            mediaDurationSeconds: sourceMessage.mediaDurationSeconds,
            metadataJson: cloneForwardMetadata(sourceMessage.metadataJson, {
              id: sourceMessage.id,
              conversationId: sourceMessage.conversationId
            }, {
              userId: request.authUser.sub,
              userName: request.authUser.name
            }, correlationId),
            status: MessageStatus.PENDING
          }
        });

        createdMessages.push(created);

        try {
          await outboundQueue.add(
            "forward-message",
            {
              tenantId: request.authUser.tenantId,
              conversationId: targetConversation.id,
              messageId: created.id,
              correlationId
            },
            outboundRetryJobOptions
          );
          queuedIds.push(created.id);
        } catch (queueError) {
          failedToQueueIds.push(created.id);

          const failed = await prisma.message.update({
            where: {
              id: created.id
            },
            data: {
              status: MessageStatus.FAILED
            }
          });

          const index = createdMessages.findIndex((entry) => entry.id === failed.id);
          if (index >= 0) {
            createdMessages[index] = failed;
          }

          const queueErrorMessage = queueError instanceof Error ? queueError.message : String(queueError);
          await recordAuditEvent({
            tenantId: request.authUser.tenantId,
            actorUserId: request.authUser.sub,
            conversationId: targetConversation.id,
            messageId: failed.id,
            eventType: AuditEventType.MESSAGE_OUTBOUND_FAILED,
            payloadJson: {
              messageType: failed.messageType,
              provider: "queue",
              stage: "queue_add_forward",
              errorMessage: queueErrorMessage,
              correlationId
            } as Prisma.InputJsonValue
          });
        }

        await publishEvent({
          type: "message.created",
          tenantId: request.authUser.tenantId,
          payload: {
            ...(toRealtimeMessagePayload(
              createdMessages.find((entry) => entry.id === created.id) ?? created
            ) as unknown as Record<string, unknown>),
            correlationId
          }
        });
      }

      const lastCreatedMessage = createdMessages[createdMessages.length - 1] ?? null;
      if (lastCreatedMessage) {
        await prisma.conversation.update({
          where: {
            id: targetConversation.id
          },
          data: {
            lastMessageAt: lastCreatedMessage.createdAt,
            status: ConversationStatus.OPEN
          }
        });
      }

      return {
        sourceConversationId: sourceConversation.id,
        targetConversationId: targetConversation.id,
        createdCount: createdMessages.length,
        queuedCount: queuedIds.length,
        failedToQueueCount: failedToQueueIds.length,
        failedToQueueIds,
        messages: createdMessages
      };
    });

}

export function registerConversationOperationalRoutes(protectedApp: FastifyInstance) {
    protectedApp.post("/conversations/:conversationId/messages/:messageId/reaction", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const params = z
        .object({
          conversationId: z.string().min(1),
          messageId: z.string().min(1)
        })
        .safeParse(request.params);
      const body = reactToMessageSchema.safeParse(request.body ?? {});

      if (!params.success || !body.success) {
        return reply.code(400).send({ message: "Payload invalido" });
      }

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: params.data.conversationId,
          tenantId: request.authUser.tenantId
        }
      });

      if (!conversation) {
        return reply.code(404).send({ message: "Conversa nao encontrada" });
      }

      const message = await prisma.message.findFirst({
        where: {
          id: params.data.messageId,
          tenantId: request.authUser.tenantId,
          conversationId: conversation.id
        }
      });

      if (!message) {
        return reply.code(404).send({ message: "Mensagem nao encontrada" });
      }

      const normalizedEmoji = normalizeReactionEmoji(body.data.emoji);
      const tenant = await prisma.tenant.findUnique({
        where: {
          id: request.authUser.tenantId
        },
        select: {
          evolutionApiKey: true,
          whatsappInstance: true
        }
      });

      if (!tenant) {
        return reply.code(404).send({ message: "Tenant nao encontrado" });
      }

      if (env.EVOLUTION_BASE_URL) {
        if (!message.externalMessageId) {
          return reply.code(409).send({
            message: "Mensagem ainda sem identificador externo para enviar reacao."
          });
        }

        const instanceName = tenant.whatsappInstance?.trim() || env.EVOLUTION_DEFAULT_INSTANCE || "";
        const evolutionClient = createEvolutionClientForTenant(tenant.evolutionApiKey);
        if (evolutionClient && instanceName) {
          try {
            await evolutionClient.sendReaction({
              instanceName,
              pathTemplate: env.EVOLUTION_SEND_REACTION_PATH,
              payload: {
                key: {
                  remoteJid: conversation.externalId,
                  fromMe: message.direction === MessageDirection.OUTBOUND,
                  id: message.externalMessageId
                },
                reaction: normalizedEmoji ?? ""
              },
              timeoutMs: env.EVOLUTION_REQUEST_TIMEOUT_MS
            });
          } catch (error) {
            request.log.error(
              {
                messageId: message.id,
                conversationId: conversation.id,
                error
              },
              "Falha ao enviar reacao na Evolution"
            );
            return reply.code(502).send({
              message: "Nao foi possivel enviar a reacao para o WhatsApp."
            });
          }
        }
      }

      const nextMetadata = withMessageReactionMetadata({
        metadataJson: message.metadataJson,
        actorKey: `user:${request.authUser.sub}`,
        actorUserId: request.authUser.sub,
        actorName: request.authUser.name,
        actorJid: null,
        emoji: normalizedEmoji,
        source: "agent"
      });

      let updated = await prisma.message.update({
        where: { id: message.id },
        data: {
          metadataJson: nextMetadata as Prisma.InputJsonValue
        }
      });

      const correlationId =
        getCorrelationIdFromMetadata(updated.metadataJson) ??
        deriveMessageCorrelationId(request.correlationId, updated.id);

      if (!getCorrelationIdFromMetadata(updated.metadataJson)) {
        updated = await prisma.message.update({
          where: { id: updated.id },
          data: {
            metadataJson: withCorrelationIdMetadata(updated.metadataJson, correlationId) as Prisma.InputJsonValue
          }
        });
      }

      await publishEvent({
        type: "message.updated",
        tenantId: request.authUser.tenantId,
        payload: {
          ...(toRealtimeMessagePayload(updated) as unknown as Record<string, unknown>),
          correlationId
        }
      });

      return updated;
    });

    protectedApp.post("/conversations/:conversationId/messages/:messageId/reprocess", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const params = z
        .object({
          conversationId: z.string().min(1),
          messageId: z.string().min(1)
        })
        .safeParse(request.params);
      const body = reprocessMessageSchema.safeParse(request.body ?? {});

      if (!params.success || !body.success) {
        return reply.code(400).send({ message: "Payload invalido" });
      }

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: params.data.conversationId,
          tenantId: request.authUser.tenantId
        }
      });

      if (!conversation) {
        return reply.code(404).send({ message: "Conversa nao encontrada" });
      }

      if (!isSandboxDestinationAllowed(conversation.externalId)) {
        return reply.code(403).send({
          message: "Sandbox bloqueou reprocessamento para destino fora da allowlist.",
          sandbox: {
            enabled: true,
            destination: conversation.externalId
          }
        });
      }

      const message = await prisma.message.findFirst({
        where: {
          id: params.data.messageId,
          tenantId: request.authUser.tenantId,
          conversationId: conversation.id
        }
      });

      if (!message) {
        return reply.code(404).send({ message: "Mensagem nao encontrada" });
      }

      if (message.direction !== MessageDirection.OUTBOUND) {
        return reply.code(400).send({ message: "Somente mensagens outbound podem ser reprocessadas" });
      }

      const reprocessCorrelationId =
        getCorrelationIdFromMetadata(message.metadataJson) ??
        deriveMessageCorrelationId(request.correlationId, message.id);
      const metadataWithCorrelation = withCorrelationIdMetadata(message.metadataJson, reprocessCorrelationId);

      if (!body.data.force && message.status === MessageStatus.SENT) {
        return reply.code(409).send({
          message: "Mensagem ja enviada. Use force=true para reenviar."
        });
      }

      const updated = await prisma.message.update({
        where: { id: message.id },
        data: {
          status: MessageStatus.PENDING,
          externalMessageId: null,
          metadataJson: metadataWithCorrelation as Prisma.InputJsonValue
        }
      });

      try {
        await outboundQueue.add(
          "reprocess-message",
          {
            tenantId: request.authUser.tenantId,
            conversationId: conversation.id,
            messageId: updated.id,
            correlationId: reprocessCorrelationId
          },
          outboundRetryJobOptions
        );
      } catch (queueError) {
        const queueErrorMessage = queueError instanceof Error ? queueError.message : String(queueError);
        const failed = await prisma.message.update({
          where: { id: updated.id },
          data: {
            status: MessageStatus.FAILED
          }
        });

        await publishEvent({
          type: "message.updated",
          tenantId: request.authUser.tenantId,
          payload: {
            id: failed.id,
            status: failed.status,
            externalMessageId: failed.externalMessageId,
            updatedAt: failed.updatedAt,
            correlationId: reprocessCorrelationId
          }
        });

        await recordAuditEvent({
          tenantId: request.authUser.tenantId,
          actorUserId: request.authUser.sub,
          conversationId: conversation.id,
          messageId: failed.id,
          eventType: AuditEventType.MESSAGE_OUTBOUND_FAILED,
          payloadJson: {
            messageType: failed.messageType,
            provider: "queue",
            stage: "queue_add_reprocess_single",
            errorMessage: queueErrorMessage,
            correlationId: reprocessCorrelationId
          } as Prisma.InputJsonValue
        });

        return reply.code(202).send(failed);
      }

      await publishEvent({
        type: "message.updated",
        tenantId: request.authUser.tenantId,
        payload: {
          id: updated.id,
          status: updated.status,
          externalMessageId: updated.externalMessageId,
          updatedAt: updated.updatedAt,
          correlationId: reprocessCorrelationId
        }
      });

      return updated;
    });

    protectedApp.post("/conversations/:conversationId/messages/reprocess-failed", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const params = z
        .object({
          conversationId: z.string().min(1)
        })
        .safeParse(request.params);
      const body = reprocessBatchSchema.safeParse(request.body ?? {});

      if (!params.success || !body.success) {
        return reply.code(400).send({ message: "Payload invalido" });
      }

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: params.data.conversationId,
          tenantId: request.authUser.tenantId
        }
      });

      if (!conversation) {
        return reply.code(404).send({ message: "Conversa nao encontrada" });
      }

      if (!isSandboxDestinationAllowed(conversation.externalId)) {
        return reply.code(403).send({
          message: "Sandbox bloqueou reprocessamento para destino fora da allowlist.",
          sandbox: {
            enabled: true,
            destination: conversation.externalId
          }
        });
      }

      const failedMessages = await prisma.message.findMany({
        where: {
          tenantId: request.authUser.tenantId,
          conversationId: conversation.id,
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.FAILED
        },
        orderBy: {
          createdAt: "asc"
        },
        take: body.data.limit
      });

      if (failedMessages.length === 0) {
        return {
          queued: 0,
          totalFailed: 0,
          messageIds: []
        };
      }

      const failedIds = failedMessages.map((entry) => entry.id);
      const queuedIds: string[] = [];
      const failedToQueueIds: string[] = [];
      const now = new Date().toISOString();
      for (const failedMessage of failedMessages) {
        const correlationId =
          getCorrelationIdFromMetadata(failedMessage.metadataJson) ??
          deriveMessageCorrelationId(request.correlationId, failedMessage.id);

        const nextMetadata = withCorrelationIdMetadata(failedMessage.metadataJson, correlationId);

        await prisma.message.update({
          where: { id: failedMessage.id },
          data: {
            status: MessageStatus.PENDING,
            externalMessageId: null,
            metadataJson: nextMetadata as Prisma.InputJsonValue
          }
        });

        try {
          await outboundQueue.add(
            "reprocess-failed-message",
            {
              tenantId: request.authUser.tenantId,
              conversationId: conversation.id,
              messageId: failedMessage.id,
              correlationId
            },
            outboundRetryJobOptions
          );
          queuedIds.push(failedMessage.id);
        } catch (queueError) {
          const queueErrorMessage = queueError instanceof Error ? queueError.message : String(queueError);
          failedToQueueIds.push(failedMessage.id);

          await prisma.message.update({
            where: { id: failedMessage.id },
            data: {
              status: MessageStatus.FAILED
            }
          });

          await publishEvent({
            type: "message.updated",
            tenantId: request.authUser.tenantId,
            payload: {
              id: failedMessage.id,
              status: MessageStatus.FAILED,
              updatedAt: new Date().toISOString(),
              correlationId
            }
          });

          await recordAuditEvent({
            tenantId: request.authUser.tenantId,
            actorUserId: request.authUser.sub,
            conversationId: conversation.id,
            messageId: failedMessage.id,
            eventType: AuditEventType.MESSAGE_OUTBOUND_FAILED,
            payloadJson: {
              messageType: failedMessage.messageType,
              provider: "queue",
              stage: "queue_add_reprocess_batch",
              errorMessage: queueErrorMessage,
              correlationId
            } as Prisma.InputJsonValue
          });

          continue;
        }

        await publishEvent({
          type: "message.updated",
          tenantId: request.authUser.tenantId,
          payload: {
            id: failedMessage.id,
            status: MessageStatus.PENDING,
            updatedAt: now,
            correlationId
          }
        });
      }

      return {
        queued: queuedIds.length,
        totalFailed: failedIds.length,
        messageIds: queuedIds,
        failedToQueueCount: failedToQueueIds.length,
        failedToQueueMessageIds: failedToQueueIds
      };
    });

    protectedApp.patch("/conversations/:conversationId/assign", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const params = z
        .object({
          conversationId: z.string().min(1)
        })
        .safeParse(request.params);
      const body = assignConversationSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({ message: "Payload invalido" });
      }

      if (body.data.assignedToId) {
        const user = await prisma.user.findFirst({
          where: {
            id: body.data.assignedToId,
            tenantId: request.authUser.tenantId
          }
        });
        if (!user) {
          return reply.code(404).send({ message: "Usuario nao encontrado no tenant" });
        }
      }

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: params.data.conversationId,
          tenantId: request.authUser.tenantId
        },
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              content: true,
              messageType: true,
              mediaUrl: true,
              direction: true,
              status: true,
              createdAt: true
            }
          }
        }
      });

      if (!conversation) {
        return reply.code(404).send({ message: "Conversa nao encontrada" });
      }

      const updated = await prisma.conversation.update({
        where: { id: conversation.id },
        data: { assignedToId: body.data.assignedToId },
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              content: true,
              messageType: true,
              mediaUrl: true,
              direction: true,
              status: true,
              createdAt: true
            }
          }
        }
      });

      const payload = mapConversation(updated);
      await publishEvent({
        type: "conversation.updated",
        tenantId: request.authUser.tenantId,
        payload
      });

      if (conversation.assignedToId !== updated.assignedToId) {
        await recordAuditEvent({
          tenantId: request.authUser.tenantId,
          actorUserId: request.authUser.sub,
          conversationId: conversation.id,
          eventType: AuditEventType.CONVERSATION_ASSIGNED,
          payloadJson: {
            before: {
              assignedToId: conversation.assignedToId
            },
            after: {
              assignedToId: updated.assignedToId
            },
            changedBy: {
              userId: request.authUser.sub,
              userName: request.authUser.name
            }
          } as Prisma.InputJsonValue
        });
      }

      return payload;
    });

    protectedApp.patch("/conversations/:conversationId/status", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const params = z
        .object({
          conversationId: z.string().min(1)
        })
        .safeParse(request.params);
      const body = updateStatusSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({ message: "Payload invalido" });
      }

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: params.data.conversationId,
          tenantId: request.authUser.tenantId
        },
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              content: true,
              messageType: true,
              mediaUrl: true,
              direction: true,
              status: true,
              createdAt: true
            }
          }
        }
      });

      if (!conversation) {
        return reply.code(404).send({ message: "Conversa nao encontrada" });
      }

      const updated = await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: body.data.status },
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              content: true,
              messageType: true,
              mediaUrl: true,
              direction: true,
              status: true,
              createdAt: true
            }
          }
        }
      });

      const payload = mapConversation(updated);
      await publishEvent({
        type: "conversation.updated",
        tenantId: request.authUser.tenantId,
        payload
      });

      if (conversation.status !== updated.status) {
        await recordAuditEvent({
          tenantId: request.authUser.tenantId,
          actorUserId: request.authUser.sub,
          conversationId: conversation.id,
          eventType: AuditEventType.CONVERSATION_STATUS_CHANGED,
          payloadJson: {
            before: {
              status: conversation.status
            },
            after: {
              status: updated.status
            },
            changedBy: {
              userId: request.authUser.sub,
              userName: request.authUser.name
            }
          } as Prisma.InputJsonValue
        });
      }

      return payload;
    });
}

export async function conversationRoutes(app: FastifyInstance) {
  app.register(async (protectedApp) => {
    protectedApp.addHook("preHandler", protectedApp.authenticate);

    registerConversationCoreRoutes(protectedApp);
    registerConversationMessageReadRoutes(protectedApp);
    registerConversationGroupRoutes(protectedApp);
    registerConversationMessageWriteRoutes(protectedApp);
    registerConversationOperationalRoutes(protectedApp);
  });
}
