import { ChannelType, ConversationStatus } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import { prisma } from "../db.js";
import { publishEvent } from "../event-bus.js";
import { requireAtendimentoModuleAccess, requireConversationWrite } from "../lib/guards.js";
import { EvolutionApiError } from "../services/evolution-client.js";
import { getTenantRuntimeOrFail } from "../services/tenant-runtime.js";
import {
  createEvolutionClientForTenant,
  parseFindContactsResponse as parseEvolutionFindContactsResponse
} from "./conversations/participants.js";
import { mapConversation } from "./conversations.js";

const createContactSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().min(3).max(40).optional(),
  avatarUrl: z.string().trim().url().optional(),
  source: z.string().trim().min(1).max(64).default("MANUAL"),
  conversationId: z.string().trim().min(1).optional()
});

const updateContactSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().min(3).max(40).optional(),
  avatarUrl: z.string().trim().url().nullable().optional()
});

const contactIdParamSchema = z.object({
  contactId: z.string().trim().min(1)
});

const openConversationSchema = z.object({
  channel: z.nativeEnum(ChannelType).default(ChannelType.WHATSAPP)
});

const importWhatsAppContactsSchema = z.object({
  dryRun: z.boolean().default(true),
  updateExisting: z.boolean().default(true),
  overwriteNames: z.boolean().default(false),
  overwriteAvatars: z.boolean().default(false),
  includeGroups: z.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(5_000).default(500),
  selectedPhones: z.array(z.string().trim().min(3).max(40)).max(5_000).optional()
});

function normalizePhoneDigits(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value.replace(/\D/g, "");
}

function normalizeAvatarUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed;
}

function normalizeContactName(value: string | null | undefined, fallbackPhone: string) {
  const trimmed = value?.trim();
  if (trimmed) {
    return trimmed;
  }

  return fallbackPhone;
}

function buildWhatsAppDirectExternalId(phone: string) {
  return `${phone}@s.whatsapp.net`;
}

type ExistingContactLookup = {
  id: string;
  name: string;
  phone: string;
  avatarUrl: string | null;
};

type ProviderContactCandidate = {
  phone: string;
  remoteJid: string | null;
  name: string;
  avatarUrl: string | null;
  isGroup: boolean;
};

type PreparedImportEntry = {
  phone: string;
  remoteJid: string | null;
  name: string;
  avatarUrl: string | null;
  existingContactId: string | null;
  existingName: string | null;
  existingAvatarUrl: string | null;
  action: "create" | "update" | "skip";
  reason: string;
  shouldUpdateName: boolean;
  shouldUpdateAvatar: boolean;
};

function normalizeRemoteJid(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  if (trimmed.includes("@")) {
    return trimmed
      .replace(/:\d+(?=@)/, "")
      .replace(/@c\.us$/, "@s.whatsapp.net");
  }

  const digits = normalizePhoneDigits(trimmed);
  if (!digits) {
    return null;
  }

  return `${digits}@s.whatsapp.net`;
}

function pickFirstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function isTechnicalName(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return true;
  }

  if (
    trimmed.endsWith("@s.whatsapp.net") ||
    trimmed.endsWith("@g.us") ||
    trimmed.endsWith("@lid")
  ) {
    return true;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 7 && !/[a-zA-Z\u00C0-\u024F]/.test(trimmed)) {
    return true;
  }

  return false;
}

function resolveImportName(value: string | null | undefined, fallbackPhone: string) {
  const trimmed = value?.trim() ?? "";
  if (trimmed && !isTechnicalName(trimmed)) {
    return trimmed;
  }

  return fallbackPhone;
}

function mapProviderContactCandidate(entry: Record<string, unknown>) {
  const remoteJid = normalizeRemoteJid(
    pickFirstString(entry, ["remoteJid", "jid", "id", "user", "contactJid", "chatId", "wid"])
  );
  const phone = normalizePhoneDigits(
    pickFirstString(entry, ["phone", "phoneNumber", "number", "mobile", "waNumber", "wid"]) ??
      remoteJid
  );

  if (!phone) {
    return null;
  }

  const isGroup = Boolean(remoteJid && remoteJid.endsWith("@g.us"));
  const rawName = pickFirstString(entry, [
    "pushName",
    "name",
    "fullName",
    "shortName",
    "verifiedName",
    "notify",
    "subject",
    "profileName"
  ]);
  const avatarUrl = normalizeAvatarUrl(
    pickFirstString(entry, [
      "profilePicUrl",
      "profilePictureUrl",
      "pictureUrl",
      "avatarUrl",
      "imageUrl",
      "imgUrl"
    ])
  );

  return {
    phone,
    remoteJid,
    name: resolveImportName(rawName, phone),
    avatarUrl,
    isGroup
  } satisfies ProviderContactCandidate;
}

function scoreProviderCandidate(value: ProviderContactCandidate) {
  let score = 0;
  if (!isTechnicalName(value.name)) {
    score += 3;
  }

  if (value.avatarUrl) {
    score += 2;
  }

  if (value.remoteJid?.endsWith("@s.whatsapp.net")) {
    score += 1;
  }

  if (!value.isGroup) {
    score += 1;
  }

  return score;
}

function pickBestProviderCandidate(
  current: ProviderContactCandidate | undefined,
  incoming: ProviderContactCandidate
) {
  if (!current) {
    return incoming;
  }

  const currentScore = scoreProviderCandidate(current);
  const incomingScore = scoreProviderCandidate(incoming);
  if (incomingScore > currentScore) {
    return incoming;
  }

  if (incomingScore < currentScore) {
    return current;
  }

  return {
    phone: current.phone,
    remoteJid: current.remoteJid ?? incoming.remoteJid,
    name: current.name !== current.phone ? current.name : incoming.name,
    avatarUrl: current.avatarUrl ?? incoming.avatarUrl,
    isGroup: current.isGroup && incoming.isGroup
  };
}

function shouldUpdateContactName(
  currentName: string,
  incomingName: string,
  overwriteNames: boolean
) {
  const normalizedCurrent = currentName.trim();
  const normalizedIncoming = incomingName.trim();
  if (!normalizedIncoming) {
    return false;
  }

  if (overwriteNames) {
    return normalizedIncoming !== normalizedCurrent;
  }

  return isTechnicalName(normalizedCurrent) && !isTechnicalName(normalizedIncoming);
}

function shouldUpdateContactAvatar(
  currentAvatar: string | null,
  incomingAvatar: string | null,
  overwriteAvatars: boolean
) {
  if (!incomingAvatar) {
    return false;
  }

  if (overwriteAvatars) {
    return incomingAvatar !== currentAvatar;
  }

  return !currentAvatar;
}

function buildImportReason(params: {
  existing: ExistingContactLookup | null;
  shouldUpdateName: boolean;
  shouldUpdateAvatar: boolean;
  updateExisting: boolean;
}) {
  if (!params.existing) {
    return "Novo contato identificado no WhatsApp.";
  }

  if (!params.updateExisting) {
    return "Contato ja existe e atualizacao foi desativada.";
  }

  if (params.shouldUpdateName && params.shouldUpdateAvatar) {
    return "Atualizar nome e avatar do contato existente.";
  }

  if (params.shouldUpdateName) {
    return "Atualizar nome do contato existente.";
  }

  if (params.shouldUpdateAvatar) {
    return "Atualizar avatar do contato existente.";
  }

  return "Contato ja existe e nao requer alteracoes.";
}

function sortPreparedImportEntries(entries: PreparedImportEntry[]) {
  const order: Record<PreparedImportEntry["action"], number> = {
    create: 0,
    update: 1,
    skip: 2
  };

  return [...entries].sort((left, right) => {
    const actionOrder = order[left.action] - order[right.action];
    if (actionOrder !== 0) {
      return actionOrder;
    }

    const nameOrder = left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" });
    if (nameOrder !== 0) {
      return nameOrder;
    }

    return left.phone.localeCompare(right.phone);
  });
}

function mapPreparedImportEntry(entry: PreparedImportEntry) {
  return {
    phone: entry.phone,
    remoteJid: entry.remoteJid,
    name: entry.name,
    avatarUrl: entry.avatarUrl,
    existingContactId: entry.existingContactId,
    existingName: entry.existingName,
    existingAvatarUrl: entry.existingAvatarUrl,
    action: entry.action,
    reason: entry.reason
  };
}

function normalizeSelectedPhones(value: string[] | undefined) {
  if (!value || value.length === 0) {
    return null;
  }

  const normalized = new Set<string>();
  for (const entry of value) {
    const phone = normalizePhoneDigits(entry);
    if (!phone) {
      continue;
    }
    normalized.add(phone);
  }

  if (normalized.size === 0) {
    return null;
  }

  return normalized;
}

async function fetchWhatsAppContactsForImport(params: {
  tenantApiKey: string | null;
  instanceName: string;
  limit: number;
}) {
  const client = createEvolutionClientForTenant(params.tenantApiKey);
  if (!client) {
    throw new EvolutionApiError("Evolution API nao configurada para este tenant", 503);
  }

  const queryCandidates: Record<string, unknown>[] = [
    {},
    { where: {} },
    { page: 1, limit: params.limit },
    { where: {}, page: 1, limit: params.limit },
    { offset: params.limit, page: 1 }
  ];

  let lastError: EvolutionApiError | null = null;

  for (const query of queryCandidates) {
    try {
      const payload = await client.findContacts(params.instanceName, query);
      const records = parseEvolutionFindContactsResponse(payload);
      if (records.length > 0) {
        return records;
      }
    } catch (error) {
      if (!(error instanceof EvolutionApiError)) {
        throw error;
      }

      lastError = error;
      if (![400, 404, 405, 422].includes(error.statusCode)) {
        throw error;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  return [] as Record<string, unknown>[];
}

function prepareWhatsAppImportEntries(params: {
  providerRecords: Record<string, unknown>[];
  existingByPhone: Map<string, ExistingContactLookup>;
  includeGroups: boolean;
  updateExisting: boolean;
  overwriteNames: boolean;
  overwriteAvatars: boolean;
  limit: number;
  selectedPhoneSet: Set<string> | null;
}) {
  const providerByPhone = new Map<string, ProviderContactCandidate>();
  let invalidCount = 0;

  for (const providerRecord of params.providerRecords) {
    const candidate = mapProviderContactCandidate(providerRecord);
    if (!candidate) {
      invalidCount += 1;
      continue;
    }

    if (!params.includeGroups && candidate.isGroup) {
      continue;
    }

    const current = providerByPhone.get(candidate.phone);
    providerByPhone.set(candidate.phone, pickBestProviderCandidate(current, candidate));
  }

  const allCandidates = [...providerByPhone.values()];
  const limitedCandidates = allCandidates
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" }))
    .slice(0, params.limit);

  const preparedEntries = limitedCandidates.map((candidate) => {
    const existing = params.existingByPhone.get(candidate.phone) ?? null;
    const shouldUpdateName = existing
      ? shouldUpdateContactName(existing.name, candidate.name, params.overwriteNames)
      : false;
    const shouldUpdateAvatar = existing
      ? shouldUpdateContactAvatar(existing.avatarUrl, candidate.avatarUrl, params.overwriteAvatars)
      : false;

    let action: PreparedImportEntry["action"] = "skip";
    if (!existing) {
      action = "create";
    } else if (params.updateExisting && (shouldUpdateName || shouldUpdateAvatar)) {
      action = "update";
    }

    return {
      phone: candidate.phone,
      remoteJid: candidate.remoteJid,
      name: candidate.name,
      avatarUrl: candidate.avatarUrl,
      existingContactId: existing?.id ?? null,
      existingName: existing?.name ?? null,
      existingAvatarUrl: existing?.avatarUrl ?? null,
      action,
      reason: buildImportReason({
        existing,
        shouldUpdateName,
        shouldUpdateAvatar,
        updateExisting: params.updateExisting
      }),
      shouldUpdateName,
      shouldUpdateAvatar
    } satisfies PreparedImportEntry;
  });

  const selectedEntries = params.selectedPhoneSet
    ? preparedEntries.filter((entry) => params.selectedPhoneSet?.has(entry.phone))
    : preparedEntries;
  const sortedEntries = sortPreparedImportEntries(selectedEntries);

  return {
    entries: sortedEntries,
    invalidCount,
    totalCandidates: allCandidates.length,
    wasLimited: allCandidates.length > limitedCandidates.length
  };
}

function mapContact(contact: {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  avatarUrl: string | null;
  source: string;
  createdAt: Date;
  updatedAt: Date;
  conversations?: Array<{
    id: string;
    channel: ChannelType;
    status: ConversationStatus;
    lastMessageAt: Date;
  }>;
}) {
  const lastConversation = contact.conversations?.[0] ?? null;

  return {
    id: contact.id,
    tenantId: contact.tenantId,
    name: contact.name,
    phone: contact.phone,
    avatarUrl: contact.avatarUrl,
    source: contact.source,
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
    lastConversationId: lastConversation?.id ?? null,
    lastConversationAt: lastConversation?.lastMessageAt ?? null,
    lastConversationChannel: lastConversation?.channel ?? null,
    lastConversationStatus: lastConversation?.status ?? null
  };
}

async function findContactWithSummary(contactId: string, tenantId: string) {
  const contact = await prisma.contact.findFirst({
    where: {
      id: contactId,
      tenantId
    },
    include: {
      conversations: {
        take: 1,
        orderBy: { lastMessageAt: "desc" },
        select: {
          id: true,
          channel: true,
          status: true,
          lastMessageAt: true
        }
      }
    }
  });

  if (!contact) {
    return null;
  }

  return mapContact(contact);
}

export async function contactsRoutes(app: FastifyInstance) {
  app.register(async (protectedApp) => {
    protectedApp.addHook("preHandler", protectedApp.authenticate);
    protectedApp.addHook("preHandler", async (request, reply) => {
      const allowed = await requireAtendimentoModuleAccess(request, reply);
      if (!allowed) {
        return reply;
      }
    });

    protectedApp.get("/contacts", async (request) => {
      const contacts = await prisma.contact.findMany({
        where: {
          tenantId: request.authUser.tenantId
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        include: {
          conversations: {
            take: 1,
            orderBy: { lastMessageAt: "desc" },
            select: {
              id: true,
              channel: true,
              status: true,
              lastMessageAt: true
            }
          }
        }
      });

      return contacts.map(mapContact);
    });

    protectedApp.post("/contacts/import-whatsapp", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const parsed = importWhatsAppContactsSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Payload invalido",
          errors: parsed.error.flatten()
        });
      }

      const tenant = await getTenantRuntimeOrFail(request.authUser.tenantId, {
        accessToken: request.coreAccessToken
      });

      const instanceName =
        tenant.whatsappInstance?.trim() || env.EVOLUTION_DEFAULT_INSTANCE?.trim() || "";
      if (!instanceName) {
        return reply.code(400).send({
          message: "Tenant sem instancia WhatsApp configurada"
        });
      }

      try {
        const providerRecords = await fetchWhatsAppContactsForImport({
          tenantApiKey: tenant.evolutionApiKey,
          instanceName,
          limit: parsed.data.limit
        });

        const selectedPhoneSet = normalizeSelectedPhones(parsed.data.selectedPhones);
        const preflightPrepared = prepareWhatsAppImportEntries({
          providerRecords,
          existingByPhone: new Map<string, ExistingContactLookup>(),
          includeGroups: parsed.data.includeGroups,
          updateExisting: false,
          overwriteNames: false,
          overwriteAvatars: false,
          limit: parsed.data.limit,
          selectedPhoneSet: null
        });
        const candidatePhones = preflightPrepared.entries.map((entry) => entry.phone);
        const existingContacts = await prisma.contact.findMany({
          where: {
            tenantId: tenant.id,
            phone: {
              in: candidatePhones
            }
          },
          select: {
            id: true,
            name: true,
            phone: true,
            avatarUrl: true
          }
        });
        const existingByPhone = new Map<string, ExistingContactLookup>(
          existingContacts.map((entry) => [
            entry.phone,
            {
              id: entry.id,
              name: entry.name,
              phone: entry.phone,
              avatarUrl: entry.avatarUrl
            }
          ])
        );

        const prepared = prepareWhatsAppImportEntries({
          providerRecords,
          existingByPhone,
          includeGroups: parsed.data.includeGroups,
          updateExisting: parsed.data.updateExisting,
          overwriteNames: parsed.data.overwriteNames,
          overwriteAvatars: parsed.data.overwriteAvatars,
          limit: parsed.data.limit,
          selectedPhoneSet
        });

        const warnings: string[] = [];
        if (prepared.wasLimited) {
          warnings.push(
            `Preview limitado aos primeiros ${parsed.data.limit} contatos unicos. Ajuste o campo limit para revisar mais.`
          );
        }

        const summary = {
          totalProviderRecords: providerRecords.length,
          candidates: prepared.totalCandidates,
          create: prepared.entries.filter((entry) => entry.action === "create").length,
          update: prepared.entries.filter((entry) => entry.action === "update").length,
          skip: prepared.entries.filter((entry) => entry.action === "skip").length,
          invalid: prepared.invalidCount,
          selected: prepared.entries.length
        };

        if (parsed.data.dryRun) {
          return {
            dryRun: true,
            generatedAt: new Date().toISOString(),
            summary,
            items: prepared.entries.map(mapPreparedImportEntry),
            applied: null,
            warnings
          };
        }

        let created = 0;
        let updated = 0;
        let skipped = 0;
        let failed = 0;
        let linkedConversations = 0;
        const failures: Array<{ phone: string; reason: string }> = [];

        for (const entry of prepared.entries) {
          if (entry.action === "skip") {
            skipped += 1;
            continue;
          }

          try {
            let persistedContact: ExistingContactLookup;

            if (!entry.existingContactId) {
              const createdContact = await prisma.contact.create({
                data: {
                  tenantId: tenant.id,
                  name: entry.name,
                  phone: entry.phone,
                  avatarUrl: entry.avatarUrl,
                  source: "WHATSAPP_IMPORT"
                },
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  avatarUrl: true
                }
              });
              persistedContact = createdContact;
              created += 1;
            } else {
              const updatePayload: Record<string, unknown> = {};
              if (entry.shouldUpdateName) {
                updatePayload.name = entry.name;
              }
              if (entry.shouldUpdateAvatar) {
                updatePayload.avatarUrl = entry.avatarUrl;
              }

              if (Object.keys(updatePayload).length === 0) {
                skipped += 1;
                continue;
              }

              const updatedContact = await prisma.contact.update({
                where: { id: entry.existingContactId },
                data: updatePayload,
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  avatarUrl: true
                }
              });
              persistedContact = updatedContact;
              updated += 1;
            }

            const syncConversationsResult = await prisma.conversation.updateMany({
              where: {
                tenantId: tenant.id,
                channel: ChannelType.WHATSAPP,
                NOT: {
                  externalId: {
                    endsWith: "@g.us"
                  }
                },
                OR: [
                  {
                    contactPhone: entry.phone
                  },
                  {
                    externalId: {
                      in: [buildWhatsAppDirectExternalId(entry.phone), `${entry.phone}@lid`]
                    }
                  },
                  {
                    contactId: persistedContact.id
                  }
                ]
              },
              data: {
                contactId: persistedContact.id,
                contactName: persistedContact.name,
                contactPhone: persistedContact.phone,
                contactAvatarUrl: persistedContact.avatarUrl
              }
            });

            linkedConversations += syncConversationsResult.count;
          } catch (error) {
            failed += 1;
            failures.push({
              phone: entry.phone,
              reason:
                error instanceof Error && error.message.trim().length > 0
                  ? error.message
                  : "Falha ao persistir contato"
            });
          }
        }

        return {
          dryRun: false,
          generatedAt: new Date().toISOString(),
          summary,
          items: prepared.entries.map(mapPreparedImportEntry),
          applied: {
            created,
            updated,
            skipped,
            failed,
            linkedConversations,
            failures
          },
          warnings
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

    protectedApp.post("/contacts", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const parsed = createContactSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Payload invalido",
          errors: parsed.error.flatten()
        });
      }

      const tenantId = request.authUser.tenantId;
      let conversation = null;

      if (parsed.data.conversationId) {
        conversation = await prisma.conversation.findFirst({
          where: {
            id: parsed.data.conversationId,
            tenantId
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
      }

      const resolvedPhone = normalizePhoneDigits(parsed.data.phone ?? conversation?.contactPhone ?? conversation?.externalId);
      if (!resolvedPhone) {
        return reply.code(400).send({ message: "Telefone invalido para salvar contato" });
      }

      const resolvedName = normalizeContactName(
        parsed.data.name ?? conversation?.contactName,
        resolvedPhone
      );
      const resolvedAvatarUrl = normalizeAvatarUrl(parsed.data.avatarUrl ?? conversation?.contactAvatarUrl);

      const persistedContact = await prisma.contact.upsert({
        where: {
          tenantId_phone: {
            tenantId,
            phone: resolvedPhone
          }
        },
        update: {
          name: resolvedName,
          avatarUrl: resolvedAvatarUrl,
          source: parsed.data.source
        },
        create: {
          tenantId,
          name: resolvedName,
          phone: resolvedPhone,
          avatarUrl: resolvedAvatarUrl,
          source: parsed.data.source
        }
      });

      await prisma.conversation.updateMany({
        where: {
          tenantId,
          contactPhone: resolvedPhone
        },
        data: {
          contactId: persistedContact.id
        }
      });

      let updatedConversationPayload = null;

      if (conversation) {
        const updatedConversation = await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            contactId: persistedContact.id,
            contactName: resolvedName,
            contactPhone: resolvedPhone,
            contactAvatarUrl: resolvedAvatarUrl
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

        updatedConversationPayload = mapConversation(updatedConversation);
        await publishEvent({
          type: "conversation.updated",
          tenantId,
          payload: updatedConversationPayload
        });
      }

      const contactPayload = await findContactWithSummary(persistedContact.id, tenantId);
      return reply.code(201).send({
        contact: contactPayload,
        conversation: updatedConversationPayload
      });
    });

    protectedApp.patch("/contacts/:contactId", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const params = contactIdParamSchema.safeParse(request.params);
      const body = updateContactSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({ message: "Payload invalido" });
      }

      const existing = await prisma.contact.findFirst({
        where: {
          id: params.data.contactId,
          tenantId: request.authUser.tenantId
        }
      });

      if (!existing) {
        return reply.code(404).send({ message: "Contato nao encontrado" });
      }

      const nextPhone = body.data.phone ? normalizePhoneDigits(body.data.phone) : existing.phone;
      if (!nextPhone) {
        return reply.code(400).send({ message: "Telefone invalido para contato" });
      }

      const updated = await prisma.contact.update({
        where: { id: existing.id },
        data: {
          name: normalizeContactName(body.data.name ?? existing.name, nextPhone),
          phone: nextPhone,
          avatarUrl:
            body.data.avatarUrl === undefined ? existing.avatarUrl : normalizeAvatarUrl(body.data.avatarUrl)
        }
      });

      if (nextPhone !== existing.phone) {
        await prisma.conversation.updateMany({
          where: {
            tenantId: request.authUser.tenantId,
            contactId: updated.id
          },
          data: {
            contactPhone: nextPhone
          }
        });
      }

      const payload = await findContactWithSummary(updated.id, request.authUser.tenantId);
      return payload;
    });

    protectedApp.post("/contacts/:contactId/open-conversation", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const params = contactIdParamSchema.safeParse(request.params);
      const body = openConversationSchema.safeParse(request.body ?? {});

      if (!params.success || !body.success) {
        return reply.code(400).send({ message: "Payload invalido" });
      }

      const tenantId = request.authUser.tenantId;
      const contact = await prisma.contact.findFirst({
        where: {
          id: params.data.contactId,
          tenantId
        }
      });

      if (!contact) {
        return reply.code(404).send({ message: "Contato nao encontrado" });
      }

      const channel = body.data.channel;
      const directExternalId =
        channel === ChannelType.WHATSAPP ? buildWhatsAppDirectExternalId(contact.phone) : `contact:${contact.phone}`;

      let conversation = await prisma.conversation.findFirst({
        where: {
          tenantId,
          channel,
          OR: [{ contactId: contact.id }, { externalId: directExternalId }]
        },
        orderBy: { lastMessageAt: "desc" },
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

      if (conversation) {
        if (
          conversation.contactId !== contact.id ||
          conversation.contactName !== contact.name ||
          conversation.contactPhone !== contact.phone ||
          conversation.contactAvatarUrl !== contact.avatarUrl
        ) {
          conversation = await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              contactId: contact.id,
              contactName: contact.name,
              contactPhone: contact.phone,
              contactAvatarUrl: contact.avatarUrl
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
        }
      } else {
        conversation = await prisma.conversation.create({
          data: {
            tenantId,
            channel,
            status: ConversationStatus.OPEN,
            externalId: directExternalId,
            contactId: contact.id,
            contactName: contact.name,
            contactPhone: contact.phone,
            contactAvatarUrl: contact.avatarUrl
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
      }

      const payload = mapConversation(conversation);
      await publishEvent({
        type: "conversation.updated",
        tenantId,
        payload
      });

      return payload;
    });
  });
}
