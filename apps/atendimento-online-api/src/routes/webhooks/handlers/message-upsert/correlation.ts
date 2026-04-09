import { Prisma } from "@prisma/client";
import { prisma } from "../../../../db.js";
import {
  deriveMessageCorrelationId,
  getCorrelationIdFromMetadata,
  withCorrelationIdMetadata
} from "../../../../lib/correlation.js";

export async function ensureWebhookMessageCorrelation(params: {
  message: {
    id: string;
    metadataJson: unknown;
  };
  externalMessageId: string | null;
  webhookCorrelationId: string;
}) {
  let messageCorrelationId = getCorrelationIdFromMetadata(params.message.metadataJson);
  let updatedMessage = null;

  if (!messageCorrelationId) {
    messageCorrelationId = deriveMessageCorrelationId(
      params.externalMessageId ?? params.webhookCorrelationId,
      params.message.id
    );
    updatedMessage = await prisma.message.update({
      where: { id: params.message.id },
      data: {
        metadataJson: withCorrelationIdMetadata(
          params.message.metadataJson,
          messageCorrelationId
        ) as Prisma.InputJsonValue
      }
    });
  }

  return {
    message: updatedMessage,
    messageCorrelationId
  };
}
