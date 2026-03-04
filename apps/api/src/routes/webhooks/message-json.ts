import { Prisma } from "@prisma/client";

export function toPrismaJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return value as Prisma.InputJsonValue;
}

function isRecord(value: unknown) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function mergeMetadataJson(existingValue: unknown, incomingValue: unknown) {
  if (!existingValue) {
    return toPrismaJsonValue(incomingValue);
  }

  if (!incomingValue) {
    return toPrismaJsonValue(existingValue);
  }

  if (isRecord(existingValue) && isRecord(incomingValue)) {
    const existingRecord = existingValue as Record<string, unknown>;
    const incomingRecord = incomingValue as Record<string, unknown>;

    const merged = {
      ...existingRecord,
      ...incomingRecord,
      mentions: incomingRecord.mentions ?? existingRecord.mentions,
      linkPreview: incomingRecord.linkPreview ?? existingRecord.linkPreview,
      unsupported: incomingRecord.unsupported ?? existingRecord.unsupported,
      contact: incomingRecord.contact ?? existingRecord.contact,
      contacts: incomingRecord.contacts ?? existingRecord.contacts,
      sticker: incomingRecord.sticker ?? existingRecord.sticker,
      media: incomingRecord.media ?? existingRecord.media,
      reply: incomingRecord.reply ?? existingRecord.reply
    };

    return toPrismaJsonValue(merged);
  }

  return toPrismaJsonValue(incomingValue) ?? toPrismaJsonValue(existingValue);
}
