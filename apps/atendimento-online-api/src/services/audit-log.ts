import { AuditEventType, type Prisma } from "@prisma/client";
import { prisma } from "../db.js";

export interface RecordAuditEventInput {
  tenantId: string;
  eventType: AuditEventType;
  actorUserId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  payloadJson?: Prisma.InputJsonValue;
}

function normalizeOptionalId(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function recordAuditEvent(input: RecordAuditEventInput) {
  try {
    await prisma.auditEvent.create({
      data: {
        tenantId: input.tenantId,
        eventType: input.eventType,
        actorUserId: normalizeOptionalId(input.actorUserId) ?? undefined,
        conversationId: normalizeOptionalId(input.conversationId) ?? undefined,
        messageId: normalizeOptionalId(input.messageId) ?? undefined,
        payloadJson: input.payloadJson
      }
    });
  } catch (error) {
    console.warn("Falha ao registrar evento de auditoria", {
      tenantId: input.tenantId,
      eventType: input.eventType,
      conversationId: input.conversationId,
      messageId: input.messageId,
      actorUserId: input.actorUserId,
      error
    });
  }
}
