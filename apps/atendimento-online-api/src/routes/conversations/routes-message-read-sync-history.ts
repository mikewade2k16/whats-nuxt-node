import { ChannelType } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../config.js";
import { prisma } from "../../db.js";
import { requireConversationWrite } from "../../lib/guards.js";
import { EvolutionApiError, type EvolutionClient } from "../../services/evolution-client.js";
import { handleMessageUpsertWebhook } from "../webhooks/handlers/message-upsert.js";
import type { IncomingWebhookPayload } from "../webhooks/shared.js";
import { asRecord } from "./object-utils.js";
import { createEvolutionClientForTenant } from "./participants.js";
import { mergeConversationScopeWhere, resolveConversationAccessScope } from "./access.js";
import { resolveConversationInstanceRouting } from "../../services/whatsapp-instances.js";

function toRecordArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Record<string, unknown>[];
  }

  return value.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"));
}

function extractEvolutionMessageRecords(payload: unknown) {
  const root = asRecord(payload);
  const rootData = asRecord(root?.data);
  const rootMessages = asRecord(root?.messages);
  const rootDataMessages = asRecord(rootData?.messages);

  const candidates: unknown[] = [
    payload,
    root?.records,
    root?.messages,
    rootMessages?.records,
    rootData?.records,
    rootData?.messages,
    rootDataMessages?.records
  ];

  for (const candidate of candidates) {
    const records = toRecordArray(candidate);
    if (records.length > 0) {
      return records;
    }
  }

  return [] as Record<string, unknown>[];
}

function parseNumericTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const low = typeof record.low === "number" && Number.isFinite(record.low) ? record.low : null;
  const high = typeof record.high === "number" && Number.isFinite(record.high) ? record.high : 0;
  if (low === null) {
    return null;
  }

  return (high * 4_294_967_296) + (low >>> 0);
}

function extractRecordTimestamp(record: Record<string, unknown>) {
  const data = asRecord(record.data);
  const key = asRecord(record.key);
  const dataKey = asRecord(data?.key);

  const candidateValues = [
    record.messageTimestamp,
    data?.messageTimestamp,
    record.messageTimestampMs,
    data?.messageTimestampMs,
    key?.messageTimestamp,
    dataKey?.messageTimestamp,
    key?.messageTimestampMs,
    dataKey?.messageTimestampMs
  ];

  for (const candidate of candidateValues) {
    const numeric = parseNumericTimestamp(candidate);
    if (numeric === null) {
      continue;
    }

    if (numeric > 1_000_000_000_000) {
      return numeric;
    }

    if (numeric > 1_000_000_000) {
      return numeric * 1_000;
    }
  }

  return 0;
}

function resolveRecordExternalId(record: Record<string, unknown>) {
  const key = asRecord(record.key);
  const data = asRecord(record.data);
  const dataKey = asRecord(data?.key);

  const candidates = [
    key?.id,
    dataKey?.id,
    record.id,
    data?.id
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

function dedupeHistoryRecords(records: Record<string, unknown>[]) {
  const deduped: Record<string, unknown>[] = [];
  const seenByExternalId = new Set<string>();

  for (const record of records) {
    const externalId = resolveRecordExternalId(record);
    if (externalId) {
      if (seenByExternalId.has(externalId)) {
        continue;
      }
      seenByExternalId.add(externalId);
    }

    deduped.push(record);
  }

  return deduped;
}

function selectRecordsForSync(records: Record<string, unknown>[], maxMessages: number) {
  if (records.length <= maxMessages) {
    return records;
  }

  const withTimestamp = records.map((record, index) => ({
    record,
    index,
    timestamp: extractRecordTimestamp(record)
  }));

  const hasAnyTimestamp = withTimestamp.some((entry) => entry.timestamp > 0);

  if (!hasAnyTimestamp) {
    // Fallback: providers frequently return newest-first when timestamp is unavailable.
    return records.slice(0, maxMessages);
  }

  const sorted = [...withTimestamp].sort((left, right) => {
    if (left.timestamp !== right.timestamp) {
      return left.timestamp - right.timestamp;
    }

    return left.index - right.index;
  });

  return sorted.slice(-maxMessages).map((entry) => entry.record);
}

function normalizeRemoteJidForComparison(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  if (!trimmed.includes("@")) {
    return trimmed;
  }

  return trimmed
    .replace(/:\d+(?=@)/, "")
    .replace(/@c\.us$/, "@s.whatsapp.net");
}

function extractRecordRemoteJid(record: Record<string, unknown>) {
  const key = asRecord(record.key);
  const data = asRecord(record.data);
  const dataKey = asRecord(data?.key);

  const candidates = [
    key?.remoteJid,
    dataKey?.remoteJid,
    record.remoteJid,
    data?.remoteJid,
    data?.chatId,
    data?.chatJid
  ];

  for (const candidate of candidates) {
    const normalized = normalizeRemoteJidForComparison(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function recordMatchesConversation(record: Record<string, unknown>, conversationExternalId: string) {
  const normalizedConversationJid = normalizeRemoteJidForComparison(conversationExternalId);
  if (!normalizedConversationJid) {
    return true;
  }

  const recordRemoteJid = extractRecordRemoteJid(record);
  if (!recordRemoteJid) {
    // Keep records without explicit JID to avoid dropping valid provider variants.
    return true;
  }

  return recordRemoteJid === normalizedConversationJid;
}

function filterHistoryRecordsByConversation(records: Record<string, unknown>[], conversationExternalId: string) {
  return records.filter((record) => recordMatchesConversation(record, conversationExternalId));
}

interface HistoryQueryVariant {
  label: string;
  query: Record<string, unknown>;
}

interface HistoryQueryCandidate {
  variant: HistoryQueryVariant;
  records: Record<string, unknown>[];
  latestTimestampMs: number;
}

interface ResolvedHistoryRecords {
  records: Record<string, unknown>[];
  variantLabel: string;
  attemptedVariants: number;
  candidateCount: number;
}

function buildHistoryQueryVariants(payload: {
  remoteJid: string;
  page: number;
  maxMessages: number;
}) {
  const { remoteJid, page, maxMessages } = payload;

  return [
    {
      label: "where.key+offset",
      query: {
        where: {
          key: {
            remoteJid
          }
        },
        page,
        offset: maxMessages
      }
    },
    {
      label: "where.key+limit",
      query: {
        where: {
          key: {
            remoteJid
          }
        },
        page,
        limit: maxMessages
      }
    }
  ] satisfies HistoryQueryVariant[];
}

async function resolveBestHistoryRecords(payload: {
  client: EvolutionClient;
  instanceName: string;
  remoteJid: string;
  page: number;
  maxMessages: number;
  timeoutMs: number;
}) {
  const variants = buildHistoryQueryVariants({
    remoteJid: payload.remoteJid,
    page: payload.page,
    maxMessages: payload.maxMessages
  });

  const candidates: HistoryQueryCandidate[] = [];
  let firstSuccessfulVariant: HistoryQueryVariant | null = null;
  let attemptedVariants = 0;
  let lastError: EvolutionApiError | null = null;

  for (const variant of variants) {
    attemptedVariants += 1;

    try {
      const evolutionPayload = await payload.client.findMessages(
        payload.instanceName,
        variant.query,
        payload.timeoutMs
      );

      if (!firstSuccessfulVariant) {
        firstSuccessfulVariant = variant;
      }

      const rawRecords = extractEvolutionMessageRecords(evolutionPayload);
      const dedupedRecords = dedupeHistoryRecords(rawRecords);
      const scopedRecords = filterHistoryRecordsByConversation(dedupedRecords, payload.remoteJid);
      if (scopedRecords.length < 1) {
        continue;
      }

      const latestTimestampMs = scopedRecords.reduce((latest, record) => {
        const timestamp = extractRecordTimestamp(record);
        return timestamp > latest ? timestamp : latest;
      }, 0);

      candidates.push({
        variant,
        records: scopedRecords,
        latestTimestampMs
      });
    } catch (error) {
      if (!(error instanceof EvolutionApiError)) {
        throw error;
      }

      if (error.statusCode === 401 || error.statusCode === 403) {
        throw error;
      }

      lastError = error;
    }
  }

  if (candidates.length > 0) {
    const bestCandidate = [...candidates].sort((left, right) => {
      if (left.latestTimestampMs !== right.latestTimestampMs) {
        return right.latestTimestampMs - left.latestTimestampMs;
      }

      return right.records.length - left.records.length;
    })[0];

    return {
      records: bestCandidate.records,
      variantLabel: bestCandidate.variant.label,
      attemptedVariants,
      candidateCount: candidates.length
    } satisfies ResolvedHistoryRecords;
  }

  if (firstSuccessfulVariant) {
    return {
      records: [],
      variantLabel: firstSuccessfulVariant.label,
      attemptedVariants,
      candidateCount: 0
    } satisfies ResolvedHistoryRecords;
  }

  if (lastError) {
    throw lastError;
  }

  return {
    records: [],
    variantLabel: "none",
    attemptedVariants,
    candidateCount: 0
  } satisfies ResolvedHistoryRecords;
}

function toIncomingMessagePayload(record: Record<string, unknown>): IncomingWebhookPayload {
  const nestedData = asRecord(record.data);
  if (nestedData && (asRecord(nestedData.key) || asRecord(nestedData.message))) {
    return {
      event: "MESSAGES_UPSERT",
      data: nestedData
    };
  }

  return {
    event: "MESSAGES_UPSERT",
    data: record
  };
}

export function registerConversationMessageHistorySyncRoute(protectedApp: FastifyInstance) {
  protectedApp.post("/conversations/:conversationId/messages/sync-history", async (request, reply) => {
    if (!requireConversationWrite(request, reply)) {
      return;
    }
    const accessScope = await resolveConversationAccessScope(request);

    const params = z
      .object({
        conversationId: z.string().min(1)
      })
      .safeParse(request.params);

    if (!params.success) {
      return reply.code(400).send({ message: "Parametros invalidos" });
    }

    const body = z
      .object({
        maxMessages: z.coerce.number().int().min(1).max(1_000).default(300),
        page: z.coerce.number().int().min(1).max(1_000).default(1)
      })
      .safeParse(request.body ?? {});

    if (!body.success) {
      return reply.code(400).send({
        message: "Payload invalido",
        errors: body.error.flatten()
      });
    }

    const conversation = await prisma.conversation.findFirst({
      where: mergeConversationScopeWhere(accessScope.conversationWhere, {
        id: params.data.conversationId,
      }),
      select: {
        id: true,
        instanceId: true,
        instanceScopeKey: true,
        externalId: true,
        channel: true,
        lastMessageAt: true
      }
    });

    if (!conversation) {
      return reply.code(404).send({ message: "Conversa nao encontrada" });
    }

    if (conversation.channel !== ChannelType.WHATSAPP) {
      return reply.code(409).send({ message: "Sincronizacao disponivel apenas para conversas WhatsApp" });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: request.authUser.tenantId },
      select: {
        id: true,
        whatsappInstance: true,
        evolutionApiKey: true
      }
    });

    if (!tenant) {
      return reply.code(400).send({
        message: "Tenant sem instancia WhatsApp configurada"
      });
    }

    const routedInstance = await resolveConversationInstanceRouting({
      tenantId: tenant.id,
      conversation
    });
    const instanceName =
      routedInstance?.instanceName ||
      tenant.whatsappInstance ||
      env.EVOLUTION_DEFAULT_INSTANCE ||
      "";

    if (!instanceName) {
      return reply.code(400).send({
        message: "Tenant sem instancia WhatsApp configurada"
      });
    }

    const client = createEvolutionClientForTenant(tenant.evolutionApiKey);
    if (!client) {
      return reply.code(503).send({
        message: "Evolution API nao configurada para este tenant"
      });
    }

    try {
      const historyResult = await resolveBestHistoryRecords(
        {
          client,
          instanceName,
          remoteJid: conversation.externalId,
          page: body.data.page,
          maxMessages: body.data.maxMessages,
          timeoutMs: env.EVOLUTION_REQUEST_TIMEOUT_MS
        }
      );

      const allRecords = historyResult.records;
      const selectedRecords = selectRecordsForSync(allRecords, body.data.maxMessages);

      let processedCount = 0;
      let createdCount = 0;
      let deduplicatedCount = 0;
      let ignoredCount = 0;
      let failedCount = 0;
      let firstFailureMessage: string | null = null;

      for (const [index, record] of selectedRecords.entries()) {
        if (!recordMatchesConversation(record, conversation.externalId)) {
          ignoredCount += 1;
          continue;
        }

        try {
          const upsertResponse = await handleMessageUpsertWebhook({
            tenant: {
              id: tenant.id,
              evolutionApiKey: tenant.evolutionApiKey
            },
            instanceId: routedInstance?.id ?? null,
            instanceName,
            payload: toIncomingMessagePayload(record),
            webhookCorrelationId: `sync-history:${request.id}:${index}`
          });

          if (upsertResponse.statusCode !== 200) {
            ignoredCount += 1;
            continue;
          }

          processedCount += 1;
          const responseBody = asRecord(upsertResponse.body);
          if (responseBody?.created === true) {
            createdCount += 1;
          } else {
            deduplicatedCount += 1;
          }
        } catch (error) {
          failedCount += 1;
          if (!firstFailureMessage && error instanceof Error && error.message.trim().length > 0) {
            firstFailureMessage = error.message;
          }
        }
      }

      const latestMessage = await prisma.message.findFirst({
        where: {
          tenantId: tenant.id,
          conversationId: conversation.id
        },
        orderBy: {
          createdAt: "desc"
        },
        select: {
          createdAt: true
        }
      });
      let resolvedConversationLastMessageAt = conversation.lastMessageAt;

      if (
        latestMessage &&
        latestMessage.createdAt > resolvedConversationLastMessageAt
      ) {
        await prisma.conversation.update({
          where: {
            id: conversation.id
          },
          data: {
            lastMessageAt: latestMessage.createdAt
          }
        });

        resolvedConversationLastMessageAt = latestMessage.createdAt;
      }

      return {
        conversationId: conversation.id,
        externalId: conversation.externalId,
        conversationLastMessageAt: resolvedConversationLastMessageAt,
        fetchedCount: allRecords.length,
        selectedCount: selectedRecords.length,
        queryVariant: historyResult.variantLabel,
        queryAttempts: historyResult.attemptedVariants,
        queryCandidates: historyResult.candidateCount,
        processedCount,
        createdCount,
        deduplicatedCount,
        ignoredCount,
        failedCount,
        firstFailureMessage
      };
    } catch (error) {
      if (error instanceof EvolutionApiError) {
        return reply.code(error.statusCode).send({
          message: error.message,
          details: error.details
        });
      }
      throw error;
    }
  });
}
