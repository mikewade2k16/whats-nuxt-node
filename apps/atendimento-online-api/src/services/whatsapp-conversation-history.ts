import { ChannelType, Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import type { WhatsAppInstance } from "@prisma/client";
import { normalizeWhatsAppInstanceName } from "./whatsapp-instances.js";

export interface ClearWhatsAppConversationHistoryInput {
  tenantId: string;
  instance?: Pick<WhatsAppInstance, "id" | "instanceName"> | null;
}

export interface ClearWhatsAppConversationHistoryResult {
  tenantId: string;
  scope: "tenant" | "instance";
  instanceId: string | null;
  instanceName: string | null;
  deletedAuditEvents: number;
  deletedMessages: number;
  deletedConversations: number;
}

function buildConversationWhere(
  input: ClearWhatsAppConversationHistoryInput
): Prisma.ConversationWhereInput {
  const baseWhere: Prisma.ConversationWhereInput = {
    tenantId: input.tenantId,
    channel: ChannelType.WHATSAPP
  };

  if (!input.instance) {
    return baseWhere;
  }

  const instanceScopeKey = normalizeWhatsAppInstanceName(input.instance.instanceName);
  if (!instanceScopeKey) {
    return {
      ...baseWhere,
      instanceId: input.instance.id
    };
  }

  return {
    ...baseWhere,
    OR: [
      {
        instanceId: input.instance.id
      },
      {
        instanceScopeKey
      }
    ]
  };
}

function buildMessageWhere(
  input: ClearWhatsAppConversationHistoryInput
): Prisma.MessageWhereInput {
  return {
    tenantId: input.tenantId,
    conversation: {
      is: buildConversationWhere(input)
    }
  };
}

function buildAuditEventWhere(
  input: ClearWhatsAppConversationHistoryInput
): Prisma.AuditEventWhereInput {
  const conversationWhere = buildConversationWhere(input);
  const messageWhere = buildMessageWhere(input);

  return {
    tenantId: input.tenantId,
    OR: [
      {
        conversation: {
          is: conversationWhere
        }
      },
      {
        message: {
          is: messageWhere
        }
      }
    ]
  };
}

export async function clearWhatsAppConversationHistory(
  input: ClearWhatsAppConversationHistoryInput
): Promise<ClearWhatsAppConversationHistoryResult> {
  const auditEventWhere = buildAuditEventWhere(input);
  const messageWhere = buildMessageWhere(input);
  const conversationWhere = buildConversationWhere(input);

  const [deletedAuditEvents, deletedMessages, deletedConversations] = await prisma.$transaction([
    prisma.auditEvent.deleteMany({
      where: auditEventWhere
    }),
    prisma.message.deleteMany({
      where: messageWhere
    }),
    prisma.conversation.deleteMany({
      where: conversationWhere
    })
  ]);

  return {
    tenantId: input.tenantId,
    scope: input.instance ? "instance" : "tenant",
    instanceId: input.instance?.id ?? null,
    instanceName: input.instance?.instanceName ?? null,
    deletedAuditEvents: deletedAuditEvents.count,
    deletedMessages: deletedMessages.count,
    deletedConversations: deletedConversations.count
  };
}