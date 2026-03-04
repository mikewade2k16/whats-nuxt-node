import { MessageDirection } from "@prisma/client";
import type { IncomingWebhookPayload } from "../shared.js";
import { createWebhookMessage } from "./message-upsert/persistence.js";
import { ensureWebhookMessageCorrelation } from "./message-upsert/correlation.js";
import { resolveMessageUpsertContext } from "./message-upsert/context.js";
import { publishMessageUpsertEvents } from "./message-upsert/events.js";
import { runMessageUpsertPreflight } from "./message-upsert/preflight.js";
import { resolveWebhookMessageSyncStage } from "./message-upsert/sync-stage.js";
import { resolveWebhookSenderAvatar } from "./message-upsert/sender-avatar.js";
import { buildMessageUpsertWebhookResult } from "./message-upsert/result.js";

interface HandleMessageUpsertWebhookParams {
  tenant: {
    id: string;
    evolutionApiKey: string | null;
  };
  instanceName: string;
  payload: IncomingWebhookPayload;
  webhookCorrelationId: string;
}

export async function handleMessageUpsertWebhook(params: HandleMessageUpsertWebhookParams) {
  const { tenant, instanceName, payload, webhookCorrelationId } = params;
  const preflight = runMessageUpsertPreflight(payload);
  if (!preflight.ok) {
    return preflight.response;
  }

  const { parsed, content } = preflight;
  const {
    existingConversation,
    conversation,
    evolutionClient,
    participantContact,
    messageMetadataJson,
    senderName,
    senderAvatarUrl: initialSenderAvatarUrl
  } = await resolveMessageUpsertContext({
    tenant,
    instanceName,
    parsed
  });

  let senderAvatarUrl = initialSenderAvatarUrl;

  const direction = parsed.fromMe ? MessageDirection.OUTBOUND : MessageDirection.INBOUND;
  const mediaMimeType = parsed.mediaMimeType?.trim() || null;
  const mediaFileName = parsed.mediaFileName?.trim() || null;
  const mediaCaption = parsed.mediaCaption?.trim() || null;

  const syncStage = await resolveWebhookMessageSyncStage({
    tenantId: tenant.id,
    conversationId: conversation.id,
    parsedFromMe: parsed.fromMe,
    messageType: parsed.messageType,
    content,
    externalMessageId: parsed.externalMessageId ?? null,
    senderAvatarUrl,
    mediaUrl: parsed.mediaUrl ?? null,
    mediaMimeType,
    mediaFileName,
    mediaFileSizeBytes: parsed.mediaFileSizeBytes ?? null,
    mediaCaption,
    mediaDurationSeconds: parsed.mediaDurationSeconds ?? null,
    metadataJson: messageMetadataJson
  });

  let message = syncStage.message;
  let messageCreated = false;
  let messageUpdated = syncStage.messageUpdated;

  senderAvatarUrl = await resolveWebhookSenderAvatar({
    senderAvatarUrl,
    isGroup: parsed.isGroup,
    fromMe: parsed.fromMe,
    participantJid: parsed.participantJid,
    participantContact,
    evolutionClient,
    instanceName
  });

  if (!message) {
    message = await createWebhookMessage({
      tenantId: tenant.id,
      conversationId: conversation.id,
      direction,
      messageType: parsed.messageType,
      senderName,
      senderAvatarUrl,
      content,
      mediaUrl: parsed.mediaUrl ?? null,
      mediaMimeType,
      mediaFileName,
      mediaFileSizeBytes: parsed.mediaFileSizeBytes ?? null,
      mediaCaption,
      mediaDurationSeconds: parsed.mediaDurationSeconds ?? null,
      metadataJson: messageMetadataJson,
      externalMessageId: parsed.externalMessageId ?? null
    });
    messageCreated = true;
  }

  const ensuredCorrelation = await ensureWebhookMessageCorrelation({
    message,
    externalMessageId: parsed.externalMessageId ?? null,
    webhookCorrelationId
  });
  const messageCorrelationId = ensuredCorrelation.messageCorrelationId;
  if (ensuredCorrelation.message) {
    message = ensuredCorrelation.message;
    messageUpdated = true;
  }

  await publishMessageUpsertEvents({
    tenantId: tenant.id,
    message,
    messageCreated,
    messageUpdated,
    messageCorrelationId,
    conversation,
    existingConversation
  });

  return buildMessageUpsertWebhookResult({
    created: messageCreated,
    messageId: message.id,
    conversationId: conversation.id
  });
}
