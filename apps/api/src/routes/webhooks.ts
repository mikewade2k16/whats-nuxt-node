import { ChannelType, ConversationStatus, MessageDirection, MessageStatus } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import { prisma } from "../db.js";
import { publishEvent } from "../event-bus.js";
import { EvolutionClient } from "../services/evolution-client.js";
import { setLatestQrCode } from "../services/whatsapp-qr-cache.js";

interface IncomingWebhookPayload {
  [key: string]: unknown;
}

function normalizeEventName(value: string) {
  return value.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase();
}

function parseEventName(payload: IncomingWebhookPayload, pathEventName?: string) {
  const rawEvent =
    (payload.event as string | undefined) ??
    (payload.type as string | undefined) ??
    ((payload.data as Record<string, unknown> | undefined)?.event as string | undefined) ??
    pathEventName;

  return rawEvent ? normalizeEventName(rawEvent) : "";
}

function extractInstanceName(payload: IncomingWebhookPayload) {
  const data = (payload.data ?? {}) as Record<string, unknown>;
  return (
    (payload.instance as string | undefined) ??
    (payload.instanceName as string | undefined) ??
    (data.instance as string | undefined) ??
    (data.instanceName as string | undefined) ??
    ""
  );
}

function normalizeQrDataUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("data:image")) {
    return trimmed;
  }
  return `data:image/png;base64,${trimmed}`;
}

function extractQrCode(payload: IncomingWebhookPayload) {
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const qrcode = (data.qrcode ?? {}) as Record<string, unknown>;

  const candidates = [
    payload.base64,
    payload.qrcode,
    data.base64,
    data.qrcode,
    qrcode.base64,
    qrcode.code,
    (data.pairingCode as string | undefined) ?? (payload.pairingCode as string | undefined)
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return normalizeQrDataUrl(candidate);
    }
  }

  return null;
}

function normalizeAvatarUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("data:image")) {
    return trimmed;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  return null;
}

function pickFirstAvatar(candidates: unknown[]) {
  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    const avatar = normalizeAvatarUrl(candidate);
    if (avatar) {
      return avatar;
    }
  }
  return null;
}

function extractAvatarFromPayload(payload: unknown, priorityKeys: string[] = []) {
  const queue: unknown[] = [payload];
  let depth = 0;
  const defaultKeys = [
    "profilePicUrl",
    "profilePictureUrl",
    "pictureUrl",
    "photoUrl",
    "avatarUrl",
    "imageUrl",
    "imgUrl",
    "thumb"
  ];
  const keys = [...priorityKeys, ...defaultKeys];

  while (queue.length > 0 && depth < 300) {
    depth += 1;
    const current = queue.shift();
    if (!current || typeof current !== "object") {
      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const obj = current as Record<string, unknown>;

    for (const key of keys) {
      const value = obj[key];
      if (typeof value === "string") {
        const avatar = normalizeAvatarUrl(value);
        if (avatar) {
          return avatar;
        }
      }
    }

    queue.push(...Object.values(obj));
  }

  return null;
}

function parseIncomingMessage(raw: IncomingWebhookPayload) {
  const data = (raw.data ?? raw) as Record<string, unknown>;
  const key = (data.key ?? {}) as Record<string, unknown>;
  const message = (data.message ?? {}) as Record<string, unknown>;
  const extended = (message.extendedTextMessage ?? {}) as Record<string, unknown>;
  const imageMessage = (message.imageMessage ?? {}) as Record<string, unknown>;
  const audioMessage = (message.audioMessage ?? {}) as Record<string, unknown>;
  const contextInfo = (extended.contextInfo ?? {}) as Record<string, unknown>;
  const chat = (data.chat ?? {}) as Record<string, unknown>;
  const rawKey = (raw.key ?? {}) as Record<string, unknown>;

  const jidCandidates = [
    key.remoteJid,
    data.remoteJid,
    data.chatId,
    data.chatJid,
    chat.id,
    contextInfo.remoteJid,
    rawKey.remoteJid,
    raw.groupJid,
    raw.chatId,
    data.from,
    raw.from
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());

  const remoteJid =
    jidCandidates.find((value) => value.endsWith("@g.us")) ??
    jidCandidates[0] ??
    null;

  const participantJid =
    (key.participant as string | undefined) ??
    (data.participant as string | undefined) ??
    (contextInfo.participant as string | undefined) ??
    (raw.participant as string | undefined);

  const text =
    (message.conversation as string | undefined) ??
    (extended.text as string | undefined) ??
    (imageMessage.caption as string | undefined) ??
    (data.text as string | undefined) ??
    (raw.text as string | undefined) ??
    (audioMessage.url ? "[audio]" : undefined);

  const isGroup = Boolean(
    remoteJid?.endsWith("@g.us") ||
      (data.isGroup as boolean | undefined) ||
      (raw.isGroup as boolean | undefined)
  );

  const senderNameCandidate =
    (data.pushName as string | undefined) ??
    (data.participantName as string | undefined) ??
    (raw.pushName as string | undefined) ??
    (raw.senderName as string | undefined) ??
    null;

  const participantPhone = participantJid ? extractPhone(participantJid) : null;
  const senderName =
    senderNameCandidate?.trim() ||
    (isGroup ? participantPhone || "Participante" : "Contato");

  const groupName =
    (data.groupName as string | undefined) ??
    (data.groupSubject as string | undefined) ??
    (data.subject as string | undefined) ??
    (data.chatName as string | undefined) ??
    (chat.name as string | undefined) ??
    (chat.subject as string | undefined) ??
    (raw.subject as string | undefined) ??
    (raw.groupName as string | undefined) ??
    null;

  const senderAvatarUrl = pickFirstAvatar([
    data.senderProfilePicUrl,
    data.senderAvatarUrl,
    data.participantProfilePicUrl,
    data.participantAvatarUrl,
    data.pushProfilePicture,
    raw.senderAvatarUrl
  ]) ??
    extractAvatarFromPayload(data, [
      "senderProfilePicUrl",
      "senderAvatarUrl",
      "participantProfilePicUrl",
      "participantAvatarUrl",
      "profilePicUrl",
      "profilePictureUrl"
    ]) ??
    extractAvatarFromPayload(raw, [
      "senderProfilePicUrl",
      "senderAvatarUrl",
      "participantProfilePicUrl",
      "participantAvatarUrl",
      "profilePicUrl",
      "profilePictureUrl"
    ]);

  const groupAvatarUrl = pickFirstAvatar([
    data.groupProfilePicUrl,
    data.groupPictureUrl,
    data.groupAvatarUrl,
    raw.groupAvatarUrl
  ]);

  const externalMessageId =
    (key.id as string | undefined) ??
    (data.id as string | undefined) ??
    (raw.id as string | undefined) ??
    null;

  const fromMe = Boolean(
    (key.fromMe as boolean | undefined) ??
      (data.fromMe as boolean | undefined) ??
      (raw.fromMe as boolean | undefined)
  );

  return {
    remoteJid,
    text,
    senderName,
    participantJid: participantJid ?? null,
    externalMessageId,
    fromMe,
    isGroup,
    groupName,
    senderAvatarUrl,
    groupAvatarUrl
  };
}

function extractPhone(externalId: string) {
  const digits = externalId.replace(/\D/g, "");
  return digits.length > 0 ? digits : externalId;
}

function buildFallbackGroupName(remoteJid: string) {
  const numeric = extractPhone(remoteJid);
  if (!numeric) {
    return "Grupo";
  }
  if (numeric.length <= 8) {
    return `Grupo ${numeric}`;
  }
  return `Grupo ${numeric.slice(-8)}`;
}

function sanitizeGroupName(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }
  if (normalized.endsWith("@g.us")) {
    return null;
  }
  return normalized;
}

function extractGroupNameFromPayload(payload: unknown) {
  const queue: unknown[] = [payload];
  let depth = 0;

  while (queue.length > 0 && depth < 200) {
    depth += 1;
    const current = queue.shift();
    if (!current || typeof current !== "object") {
      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const obj = current as Record<string, unknown>;

    const prioritized = [
      obj.subject,
      obj.groupSubject,
      obj.groupName,
      obj.name
    ];

    for (const candidate of prioritized) {
      if (typeof candidate === "string") {
        const sanitized = sanitizeGroupName(candidate);
        if (sanitized) {
          return sanitized;
        }
      }
    }

    queue.push(...Object.values(obj));
  }

  return null;
}

function extractGroupAvatarFromPayload(payload: unknown) {
  return extractAvatarFromPayload(payload, [
    "groupProfilePicUrl",
    "groupPictureUrl",
    "groupAvatarUrl"
  ]);
}

function extractProfilePictureFromApiResponse(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const candidates = [
    record.profilePictureUrl,
    record.profilePicUrl,
    record.pictureUrl,
    record.avatarUrl,
    (record.data as Record<string, unknown> | undefined)?.profilePictureUrl,
    (record.data as Record<string, unknown> | undefined)?.profilePicUrl
  ];

  return pickFirstAvatar(candidates);
}

function normalizeJidForCompare(jid: string | null | undefined) {
  const value = jid?.trim().toLowerCase();
  if (!value) {
    return null;
  }
  return value;
}

function isSameParticipant(left: string | null | undefined, right: string | null | undefined) {
  const a = normalizeJidForCompare(left);
  const b = normalizeJidForCompare(right);
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }
  const aDigits = extractPhone(a);
  const bDigits = extractPhone(b);
  return Boolean(aDigits && bDigits && aDigits === bDigits);
}

function extractParticipantAvatarFromGroupInfo(payload: unknown, participantJid: string | null) {
  if (!participantJid) {
    return null;
  }

  const queue: unknown[] = [payload];
  let depth = 0;

  while (queue.length > 0 && depth < 400) {
    depth += 1;
    const current = queue.shift();
    if (!current || typeof current !== "object") {
      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const obj = current as Record<string, unknown>;
    const candidateJid =
      (obj.id as string | undefined) ??
      (obj.jid as string | undefined) ??
      (obj.participant as string | undefined) ??
      (obj.user as string | undefined) ??
      null;

    if (isSameParticipant(candidateJid, participantJid)) {
      const avatar = extractAvatarFromPayload(obj);
      if (avatar) {
        return avatar;
      }
    }

    queue.push(...Object.values(obj));
  }

  return null;
}

function createEvolutionClient(tenantApiKey: string | null) {
  if (!env.EVOLUTION_BASE_URL) {
    return null;
  }

  const apiKey = tenantApiKey ?? env.EVOLUTION_API_KEY;
  if (!apiKey) {
    return null;
  }

  return new EvolutionClient({
    baseUrl: env.EVOLUTION_BASE_URL,
    apiKey
  });
}

async function resolveGroupConversationName(params: {
  incomingGroupName: string | null;
  existingConversationName: string | null;
  remoteJid: string;
  groupInfo: Record<string, unknown> | null;
  senderName: string | null;
  participantJid: string | null;
}) {
  const fromIncoming = sanitizeGroupName(params.incomingGroupName);
  if (fromIncoming) {
    return fromIncoming;
  }

  const fromApi = params.groupInfo ? extractGroupNameFromPayload(params.groupInfo) : null;
  if (fromApi) {
    return fromApi;
  }

  const fromExisting = sanitizeGroupName(params.existingConversationName);
  if (fromExisting) {
    const sender = params.senderName?.trim().toLowerCase() ?? null;
    const existing = fromExisting.trim().toLowerCase();
    const participantPhone = params.participantJid ? extractPhone(params.participantJid) : null;
    const existingPhone = extractPhone(fromExisting);

    const looksLikeParticipantName = Boolean(sender && existing === sender);
    const looksLikeParticipantPhone = Boolean(
      participantPhone &&
        existingPhone &&
        participantPhone.length >= 7 &&
        existingPhone === participantPhone
    );

    if (!looksLikeParticipantName && !looksLikeParticipantPhone) {
      return fromExisting;
    }
  }

  return buildFallbackGroupName(params.remoteJid);
}

function shouldValidateWebhookToken() {
  const token = env.EVOLUTION_WEBHOOK_TOKEN?.trim();
  if (!token) {
    return false;
  }

  if (/^change-this-|^example-|^your-/i.test(token)) {
    return false;
  }

  return true;
}

export async function webhookRoutes(app: FastifyInstance) {
  const handleEvolutionWebhook = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = z
      .object({
        tenantSlug: z.string().min(2),
        eventName: z.string().min(2).optional()
      })
      .safeParse(request.params);

    if (!params.success) {
      return reply.code(400).send({ message: "Tenant invalido" });
    }

    if (shouldValidateWebhookToken()) {
      const token = request.headers["x-webhook-token"];
      if (token !== env.EVOLUTION_WEBHOOK_TOKEN) {
        return reply.code(401).send({ message: "Token de webhook invalido" });
      }
    }

    const tenant = await prisma.tenant.findUnique({
      where: { slug: params.data.tenantSlug }
    });

    if (!tenant) {
      return reply.code(404).send({ message: "Tenant nao encontrado" });
    }

    const payload = (request.body ?? {}) as IncomingWebhookPayload;
    const eventName = parseEventName(payload, params.data.eventName);
    const instanceName = extractInstanceName(payload) || tenant.whatsappInstance || "default";

    if (eventName.includes("QRCODE")) {
      const qrCode = extractQrCode(payload);
      if (qrCode) {
        await setLatestQrCode(tenant.id, instanceName, qrCode);
      }

      return reply.code(202).send({
        status: "ok",
        event: eventName,
        hasQrCode: Boolean(qrCode)
      });
    }

    const parsed = parseIncomingMessage(payload);

    if (!parsed.remoteJid) {
      return reply.code(202).send({ message: "Webhook recebido sem identificador de contato" });
    }

    const content = parsed.text?.trim();
    if (!content) {
      return reply.code(202).send({ message: "Webhook recebido sem conteudo textual" });
    }

    const existingConversation = await prisma.conversation.findUnique({
      where: {
        tenantId_externalId_channel: {
          tenantId: tenant.id,
          externalId: parsed.remoteJid,
          channel: ChannelType.WHATSAPP
        }
      }
    });

    let groupInfo: Record<string, unknown> | null = null;
    if (parsed.isGroup) {
      const shouldFetchGroupInfo =
        !sanitizeGroupName(parsed.groupName) ||
        !parsed.groupAvatarUrl ||
        !parsed.senderAvatarUrl;

      if (shouldFetchGroupInfo) {
        const client = createEvolutionClient(tenant.evolutionApiKey);
        if (client) {
          try {
            groupInfo = await client.findGroupInfo(instanceName, parsed.remoteJid);
          } catch {
            groupInfo = null;
          }
        }
      }
    }

    let directProfilePictureUrl: string | null = null;
    if (!parsed.isGroup && !parsed.senderAvatarUrl && !existingConversation?.contactAvatarUrl) {
      const client = createEvolutionClient(tenant.evolutionApiKey);
      const number = extractPhone(parsed.remoteJid);
      if (client && number) {
        try {
          const profile = await client.fetchProfilePictureUrl(instanceName, number);
          directProfilePictureUrl = extractProfilePictureFromApiResponse(profile);
        } catch {
          directProfilePictureUrl = null;
        }
      }
    }

    const conversationName = parsed.isGroup
      ? await resolveGroupConversationName({
          incomingGroupName: parsed.groupName,
          existingConversationName: existingConversation?.contactName ?? null,
          remoteJid: parsed.remoteJid,
          groupInfo,
          senderName: parsed.senderName,
          participantJid: parsed.participantJid
        })
      : parsed.fromMe
        ? existingConversation?.contactName ??
          existingConversation?.contactPhone ??
          extractPhone(parsed.remoteJid)
        : parsed.senderName;

    const conversationAvatarUrl = parsed.isGroup
      ? parsed.groupAvatarUrl ??
        existingConversation?.contactAvatarUrl ??
        (groupInfo ? extractGroupAvatarFromPayload(groupInfo) : null)
      : parsed.fromMe
        ? existingConversation?.contactAvatarUrl ?? directProfilePictureUrl ?? null
        : parsed.senderAvatarUrl ??
          directProfilePictureUrl ??
          existingConversation?.contactAvatarUrl ??
          null;

    const senderAvatarUrl = parsed.senderAvatarUrl ??
      (parsed.isGroup ? extractParticipantAvatarFromGroupInfo(groupInfo, parsed.participantJid) : null);

    const nextPhone = parsed.isGroup
      ? existingConversation?.contactPhone ?? null
      : extractPhone(parsed.remoteJid);

    const conversation = existingConversation
      ? await prisma.conversation.update({
          where: { id: existingConversation.id },
          data: {
            contactName: conversationName,
            contactAvatarUrl: conversationAvatarUrl,
            contactPhone: nextPhone
          }
        })
      : await prisma.conversation.create({
          data: {
            tenantId: tenant.id,
            channel: ChannelType.WHATSAPP,
            externalId: parsed.remoteJid,
            contactName: conversationName,
            contactAvatarUrl: conversationAvatarUrl,
            contactPhone: nextPhone,
            status: ConversationStatus.OPEN,
            lastMessageAt: new Date()
          }
        });

    const direction = parsed.fromMe ? MessageDirection.OUTBOUND : MessageDirection.INBOUND;

    let message =
      parsed.externalMessageId
        ? await prisma.message.findFirst({
            where: {
              tenantId: tenant.id,
              conversationId: conversation.id,
              externalMessageId: parsed.externalMessageId
            },
            orderBy: { createdAt: "desc" }
          })
        : null;

    let messageCreated = false;
    let messageUpdated = false;

    if (!message && parsed.fromMe) {
      const maybePendingOutbound = await prisma.message.findFirst({
        where: {
          tenantId: tenant.id,
          conversationId: conversation.id,
          direction: MessageDirection.OUTBOUND,
          status: {
            in: [MessageStatus.PENDING, MessageStatus.SENT]
          },
          externalMessageId: null,
          content
        },
        orderBy: { createdAt: "desc" }
      });

      if (maybePendingOutbound) {
        message = await prisma.message.update({
          where: { id: maybePendingOutbound.id },
          data: {
            status: MessageStatus.SENT,
            externalMessageId: parsed.externalMessageId ?? maybePendingOutbound.externalMessageId,
            senderAvatarUrl: senderAvatarUrl ?? maybePendingOutbound.senderAvatarUrl
          }
        });
        messageUpdated = true;
      }
    }

    if (message && parsed.externalMessageId && !message.externalMessageId) {
      message = await prisma.message.update({
        where: { id: message.id },
        data: {
          externalMessageId: parsed.externalMessageId,
          status: MessageStatus.SENT,
          senderAvatarUrl: senderAvatarUrl ?? message.senderAvatarUrl
        }
      });
      messageUpdated = true;
    }

    if (message && message.status !== MessageStatus.SENT) {
      message = await prisma.message.update({
        where: { id: message.id },
        data: {
          status: MessageStatus.SENT,
          senderAvatarUrl: senderAvatarUrl ?? message.senderAvatarUrl
        }
      });
      messageUpdated = true;
    }

    if (!message) {
      message = await prisma.message.create({
        data: {
          tenantId: tenant.id,
          conversationId: conversation.id,
          direction,
          senderName: parsed.senderName,
          senderAvatarUrl,
          content,
          status: MessageStatus.SENT,
          externalMessageId: parsed.externalMessageId
        }
      });
      messageCreated = true;
    }

    let conversationForEvent = conversation;

    if (messageCreated) {
      conversationForEvent = await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          status: ConversationStatus.OPEN,
          lastMessageAt: message.createdAt
        }
      });

      await publishEvent({
        type: "message.created",
        tenantId: tenant.id,
        payload: message as unknown as Record<string, unknown>
      });
    } else if (messageUpdated) {
      await publishEvent({
        type: "message.updated",
        tenantId: tenant.id,
        payload: {
          id: message.id,
          status: message.status,
          externalMessageId: message.externalMessageId,
          senderAvatarUrl: message.senderAvatarUrl,
          updatedAt: message.updatedAt
        }
      });
    }

    const conversationIdentityChanged =
      !existingConversation ||
      existingConversation.contactName !== conversationForEvent.contactName ||
      existingConversation.contactAvatarUrl !== conversationForEvent.contactAvatarUrl ||
      existingConversation.contactPhone !== conversationForEvent.contactPhone;

    if (messageCreated || conversationIdentityChanged) {
      await publishEvent({
        type: "conversation.updated",
        tenantId: tenant.id,
        payload: {
          id: conversationForEvent.id,
          channel: conversationForEvent.channel,
          status: conversationForEvent.status,
          externalId: conversationForEvent.externalId,
          contactName: conversationForEvent.contactName,
          contactAvatarUrl: conversationForEvent.contactAvatarUrl,
          contactPhone: conversationForEvent.contactPhone,
          assignedToId: conversationForEvent.assignedToId,
          createdAt: conversationForEvent.createdAt,
          updatedAt: conversationForEvent.updatedAt,
          lastMessageAt: conversationForEvent.lastMessageAt,
          lastMessage: {
            id: message.id,
            content: message.content,
            direction: message.direction,
            status: message.status,
            createdAt: message.createdAt
          }
        }
      });
    }

    return {
      status: "ok",
      created: messageCreated,
      deduplicated: !messageCreated,
      messageId: message.id,
      conversationId: conversation.id
    };
  };

  app.post("/webhooks/evolution/:tenantSlug", handleEvolutionWebhook);
  app.post("/webhooks/evolution/:tenantSlug/:eventName", handleEvolutionWebhook);
}
