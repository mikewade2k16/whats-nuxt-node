import type { FastifyRequest } from "fastify";
import type { Prisma } from "@prisma/client";
import {
  buildConversationInstanceScopeWhere,
  buildMessageInstanceScopeWhere,
  resolveAccessibleWhatsAppInstances
} from "../../services/whatsapp-instances.js";

export async function resolveConversationAccessScope(request: FastifyRequest) {
  const access = await resolveAccessibleWhatsAppInstances({
    tenantId: request.authUser.tenantId,
    userId: request.authUser.sub,
    role: request.authUser.role
  });

  return {
    ...access,
    conversationWhere: buildConversationInstanceScopeWhere({
      tenantId: request.authUser.tenantId,
      accessibleScopeKeys: access.accessibleScopeKeys
    }),
    messageWhere: buildMessageInstanceScopeWhere({
      tenantId: request.authUser.tenantId,
      accessibleScopeKeys: access.accessibleScopeKeys
    })
  };
}

export function mergeConversationScopeWhere(
  scopeWhere: Prisma.ConversationWhereInput,
  extraWhere: Prisma.ConversationWhereInput
): Prisma.ConversationWhereInput {
  return {
    AND: [scopeWhere, extraWhere]
  };
}

export function mergeMessageScopeWhere(
  scopeWhere: Prisma.MessageWhereInput,
  extraWhere: Prisma.MessageWhereInput
): Prisma.MessageWhereInput {
  return {
    AND: [scopeWhere, extraWhere]
  };
}
