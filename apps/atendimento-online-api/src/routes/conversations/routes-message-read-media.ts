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
import { getTenantRuntimeOrFail } from "../../services/tenant-runtime.js";
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
  resolveEffectiveMediaMimeType,
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
import { mergeMessageScopeWhere, resolveConversationAccessScope } from "./access.js";
import { resolveConversationInstanceRouting } from "../../services/whatsapp-instances.js";


export function registerConversationMessageMediaRoute(protectedApp: FastifyInstance) {
    protectedApp.get("/conversations/:conversationId/messages/:messageId/media", async (request, reply) => {
      const accessScope = await resolveConversationAccessScope(request);
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
        where: mergeMessageScopeWhere(accessScope.messageWhere, {
          id: params.data.messageId,
          conversationId: params.data.conversationId,
          hiddenForUsers: {
            none: {
              userId: request.authUser.sub
            }
          }
        }),
        select: {
          id: true,
          tenantId: true,
          conversationId: true,
          instanceId: true,
          instanceScopeKey: true,
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
      const resolveMimeType = (fallbackMimeType?: string | null, fallbackFileName?: string | null) =>
        resolveEffectiveMediaMimeType({
          messageType: message.messageType,
          mediaMimeType: effectiveMediaMimeType,
          mediaFileName: fallbackFileName ?? effectiveMediaFileName,
          metadataJson: message.metadataJson,
          fallbackMimeType
        });

      const attemptEvolutionRehydrate = async (reason: string) => {
        if (rehydrateAttempted) {
          return false;
        }
        rehydrateAttempted = true;

        if (!message.externalMessageId?.trim()) {
          return false;
        }

        if (resolvedEvolutionClient === undefined) {
          const tenant = await getTenantRuntimeOrFail(request.authUser.tenantId, {
            accessToken: request.coreAccessToken
          });

          resolvedEvolutionClient = createEvolutionClientForTenant(tenant.evolutionApiKey);
          const routedInstance = await resolveConversationInstanceRouting({
            tenantId: tenant.id,
            conversation: {
              instanceId: message.instanceId,
              instanceScopeKey: message.instanceScopeKey
            }
          });
          resolvedInstanceName =
            routedInstance?.instanceName ||
            tenant?.whatsappInstance?.trim() ||
            env.EVOLUTION_DEFAULT_INSTANCE ||
            "default";
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

          const resolvedMimeType = resolveEffectiveMediaMimeType({
            messageType: message.messageType,
            mediaMimeType: effectiveMediaMimeType,
            mediaFileName: rehydratedMedia.fileName ?? effectiveMediaFileName,
            metadataJson: nextMetadata,
            fallbackMimeType: rehydratedMedia.mimeType
          });
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
          const mimeType = resolveMimeType(parsedDataUrl.mimeType);
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
        const mimeType = resolveMimeType(contentTypeFromProvider);
        const payload = Buffer.from(await upstreamResponse.arrayBuffer());
        applyMediaResponseHeaders();
        reply.type(mimeType);
        reply.header("Content-Length", String(payload.length));
        return reply.send(payload);
      }

      return reply.code(502).send({ message: "Falha ao carregar midia da mensagem" });
    });

}
