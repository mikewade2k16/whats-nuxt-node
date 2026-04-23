import {
  ChannelType,
  ConversationStatus,
  Prisma
} from "@prisma/client";
import { randomInt } from "node:crypto";
import { env } from "../config.js";
import { prisma } from "../db.js";
import { UserRole } from "../domain/access.js";
import { mapTenantDirectoryUsersById } from "./core-tenant-directory.js";
import { resolveTenantRuntimeContextById, type TenantRuntimeContext } from "./tenant-runtime.js";

type TenantInstanceSource = Pick<
  TenantRuntimeContext,
  "id" | "slug" | "name" | "whatsappInstance"
>;

type RegistryInstanceRow = Awaited<ReturnType<typeof prisma.whatsAppInstance.findMany>>[number];

export type RegistryInstance = RegistryInstanceRow & {
  responsibleUser: {
    id: string;
    name: string;
    email: string;
  } | null;
};

type RegistryConversationCandidate = {
  id: string;
  tenantId: string;
  channel: ChannelType;
  externalId: string;
  instanceId: string | null;
  instanceScopeKey: string;
  assignedToId: string | null;
  contactId: string | null;
  contactName: string | null;
  contactAvatarUrl: string | null;
  contactPhone: string | null;
  status: ConversationStatus;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    messages: number;
    auditEvents: number;
  };
};

export function normalizeWhatsAppInstanceName(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function slugifyInstanceSegment(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function resolveSaoPauloDateStamp(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date).replace(/-/g, "");
}

export function buildAutomaticWhatsAppInstanceName(params: {
  tenantName?: string | null;
  tenantSlug?: string | null;
  uniqueSuffix?: string | number | null;
}) {
  const baseName =
    slugifyInstanceSegment(params.tenantName)
    || slugifyInstanceSegment(params.tenantSlug)
    || "cliente";
  const dateStamp = resolveSaoPauloDateStamp();
  const uniqueSuffix = String(params.uniqueSuffix ?? randomInt(1000, 9999)).trim() || String(randomInt(1000, 9999));

  return `${baseName}-${dateStamp}-${uniqueSuffix}`.slice(0, 80);
}

export function buildFallbackInstanceScopeKey(tenant?: {
  slug?: string | null;
  whatsappInstance?: string | null;
}) {
  const explicit = normalizeWhatsAppInstanceName(tenant?.whatsappInstance);
  if (explicit) {
    return explicit;
  }

  const tenantSlug = String(tenant?.slug ?? "").trim();
  if (tenantSlug) {
    return `${tenantSlug}-wa`;
  }

  const envDefault = normalizeWhatsAppInstanceName(env.EVOLUTION_DEFAULT_INSTANCE);
  if (envDefault) {
    return envDefault;
  }

  return "default";
}

function trimOptionalText(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function buildConversationScopeIdentity(params: {
  externalId: string;
  channel: ChannelType;
  scopeKey: string;
}) {
  return `${params.channel}::${params.externalId}::${params.scopeKey}`;
}

function resolveConversationTargetScopeKey(params: {
  conversation: Pick<RegistryConversationCandidate, "instanceScopeKey">;
  primaryInstance: Pick<RegistryInstance, "instanceName">;
  knownInstancesByScopeKey: Map<string, Pick<RegistryInstance, "id" | "instanceName">>;
}) {
  const explicitScopeKey = normalizeWhatsAppInstanceName(params.conversation.instanceScopeKey);
  if (explicitScopeKey && explicitScopeKey !== "default") {
    return params.knownInstancesByScopeKey.has(explicitScopeKey)
      ? explicitScopeKey
      : params.primaryInstance.instanceName;
  }

  return params.primaryInstance.instanceName;
}

function compareConversationCanonical(
  left: RegistryConversationCandidate,
  right: RegistryConversationCandidate,
  targetScopeKey: string
) {
  if (left._count.messages !== right._count.messages) {
    return right._count.messages - left._count.messages;
  }

  const leftLastMessage = left.lastMessageAt.getTime();
  const rightLastMessage = right.lastMessageAt.getTime();
  if (leftLastMessage !== rightLastMessage) {
    return rightLastMessage - leftLastMessage;
  }

  const leftOnTargetScope = left.instanceScopeKey === targetScopeKey ? 1 : 0;
  const rightOnTargetScope = right.instanceScopeKey === targetScopeKey ? 1 : 0;
  if (leftOnTargetScope !== rightOnTargetScope) {
    return rightOnTargetScope - leftOnTargetScope;
  }

  const leftCreatedAt = left.createdAt.getTime();
  const rightCreatedAt = right.createdAt.getTime();
  if (leftCreatedAt !== rightCreatedAt) {
    return leftCreatedAt - rightCreatedAt;
  }

  return left.id.localeCompare(right.id);
}

function mergeConversationShape(
  canonical: RegistryConversationCandidate,
  duplicates: RegistryConversationCandidate[],
  targetScopeKey: string,
  targetInstanceId: string
) {
  const allCandidates = [canonical, ...duplicates];
  const sortedByFreshness = [...allCandidates].sort((left, right) =>
    compareConversationCanonical(left, right, targetScopeKey)
  );

  return {
    assignedToId: canonical.assignedToId ?? sortedByFreshness.find((entry) => entry.assignedToId)?.assignedToId ?? null,
    contactId: canonical.contactId ?? sortedByFreshness.find((entry) => entry.contactId)?.contactId ?? null,
    contactName: trimOptionalText(canonical.contactName)
      ?? sortedByFreshness.map((entry) => trimOptionalText(entry.contactName)).find(Boolean)
      ?? null,
    contactAvatarUrl: trimOptionalText(canonical.contactAvatarUrl)
      ?? sortedByFreshness.map((entry) => trimOptionalText(entry.contactAvatarUrl)).find(Boolean)
      ?? null,
    contactPhone: trimOptionalText(canonical.contactPhone)
      ?? sortedByFreshness.map((entry) => trimOptionalText(entry.contactPhone)).find(Boolean)
      ?? null,
    status: sortedByFreshness[0]?.status ?? canonical.status,
    lastMessageAt: new Date(
      Math.max(...allCandidates.map((entry) => entry.lastMessageAt.getTime()))
    ),
    instanceId: targetInstanceId,
    instanceScopeKey: targetScopeKey
  };
}

async function attachResponsibleUserProfiles(
  tenantId: string,
  instances: RegistryInstanceRow[]
) {
  const directory = await mapTenantDirectoryUsersById(tenantId);

  return instances.map((instance) => ({
    ...instance,
    responsibleUser: instance.responsibleUserId
      ? (() => {
          const matched = directory.get(instance.responsibleUserId);
          return matched
            ? {
                id: matched.id,
                name: matched.name,
                email: matched.email
              }
            : null;
        })()
      : null
  })) satisfies RegistryInstance[];
}

async function loadRegistryInstances(tenantId: string) {
  const instances = await prisma.whatsAppInstance.findMany({
    where: {
      tenantId
    },
    orderBy: [
      { isDefault: "desc" },
      { createdAt: "asc" }
    ]
  });

  return attachResponsibleUserProfiles(tenantId, instances);
}

async function ensureFallbackRegistryInstance(
  tenant: TenantInstanceSource,
  instances: RegistryInstance[]
) {
  if (instances.length > 0) {
    return instances;
  }

  const fallbackInstanceName = buildFallbackInstanceScopeKey(tenant);
  await prisma.whatsAppInstance.create({
    data: {
      tenantId: tenant.id,
      instanceName: fallbackInstanceName,
      displayName: tenant.name,
      isDefault: true,
      isActive: true
    }
  });

  return loadRegistryInstances(tenant.id);
}

async function ensureRegistryInstancesFromObservedScopes(
  tenant: TenantInstanceSource,
  instances: RegistryInstance[]
) {
  const knownScopeKeys = new Set(
    instances
      .map((entry) => normalizeWhatsAppInstanceName(entry.instanceName))
      .filter((entry) => entry.length > 0)
  );

  const [conversationScopes, messageScopes] = await Promise.all([
    prisma.conversation.findMany({
      where: {
        tenantId: tenant.id,
        instanceScopeKey: {
          notIn: ["", "default"]
        }
      },
      select: {
        instanceScopeKey: true
      },
      distinct: ["instanceScopeKey"]
    }),
    prisma.message.findMany({
      where: {
        tenantId: tenant.id,
        instanceScopeKey: {
          notIn: ["", "default"]
        }
      },
      select: {
        instanceScopeKey: true
      },
      distinct: ["instanceScopeKey"]
    })
  ]);

  const missingScopeKeys = [...new Set(
    [...conversationScopes, ...messageScopes]
      .map((entry) => normalizeWhatsAppInstanceName(entry.instanceScopeKey))
      .filter((entry) => entry.length > 0 && !knownScopeKeys.has(entry))
  )];

  if (missingScopeKeys.length < 1) {
    return instances;
  }

  await prisma.whatsAppInstance.createMany({
    data: missingScopeKeys.map((instanceName) => ({
      tenantId: tenant.id,
      instanceName,
      displayName: instanceName === normalizeWhatsAppInstanceName(tenant.whatsappInstance)
        ? tenant.name
        : instanceName,
      isDefault: false,
      isActive: true
    })),
    skipDuplicates: true
  });

  return loadRegistryInstances(tenant.id);
}

async function reconcileTenantLegacyConversationScopes(params: {
  tenantId: string;
  primaryInstance: RegistryInstance;
  instances: RegistryInstance[];
}) {
  const knownInstancesByScopeKey = new Map(
    params.instances.map((entry) => [entry.instanceName, { id: entry.id, instanceName: entry.instanceName }])
  );

  const legacyConversations = await prisma.conversation.findMany({
    where: {
      tenantId: params.tenantId,
      OR: [
        { instanceId: null },
        { instanceScopeKey: "default" }
      ]
    },
    select: {
      id: true,
      tenantId: true,
      channel: true,
      externalId: true,
      instanceId: true,
      instanceScopeKey: true,
      assignedToId: true,
      contactId: true,
      contactName: true,
      contactAvatarUrl: true,
      contactPhone: true,
      status: true,
      lastMessageAt: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          messages: true,
          auditEvents: true
        }
      }
    }
  });

  if (legacyConversations.length < 1) {
    return;
  }

  const identities = new Map<string, {
    externalId: string;
    channel: ChannelType;
    targetScopeKey: string;
    targetInstanceId: string;
    rows: RegistryConversationCandidate[];
  }>();

  for (const conversation of legacyConversations) {
    const targetScopeKey = resolveConversationTargetScopeKey({
      conversation,
      primaryInstance: params.primaryInstance,
      knownInstancesByScopeKey
    });
    const targetInstanceId = knownInstancesByScopeKey.get(targetScopeKey)?.id ?? params.primaryInstance.id;
    const identity = buildConversationScopeIdentity({
      externalId: conversation.externalId,
      channel: conversation.channel,
      scopeKey: targetScopeKey
    });

    const entry = identities.get(identity);
    if (entry) {
      entry.rows.push(conversation);
      continue;
    }

    identities.set(identity, {
      externalId: conversation.externalId,
      channel: conversation.channel,
      targetScopeKey,
      targetInstanceId,
      rows: [conversation]
    });
  }

  const scopedCandidates = await prisma.conversation.findMany({
    where: {
      tenantId: params.tenantId,
      OR: [...identities.values()].map((entry) => ({
        externalId: entry.externalId,
        channel: entry.channel,
        instanceScopeKey: entry.targetScopeKey
      }))
    },
    select: {
      id: true,
      tenantId: true,
      channel: true,
      externalId: true,
      instanceId: true,
      instanceScopeKey: true,
      assignedToId: true,
      contactId: true,
      contactName: true,
      contactAvatarUrl: true,
      contactPhone: true,
      status: true,
      lastMessageAt: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          messages: true,
          auditEvents: true
        }
      }
    }
  });

  const touchedConversationIds = new Set<string>();

  for (const entry of identities.values()) {
    const scopedMatches = scopedCandidates.filter((candidate) =>
      candidate.externalId === entry.externalId
      && candidate.channel === entry.channel
      && candidate.instanceScopeKey === entry.targetScopeKey
    );

    const mergedCandidates = [...new Map(
      [...entry.rows, ...scopedMatches].map((candidate) => [candidate.id, candidate])
    ).values()];

    const canonical = [...mergedCandidates].sort((left, right) =>
      compareConversationCanonical(left, right, entry.targetScopeKey)
    )[0];

    if (!canonical) {
      continue;
    }

    const duplicates = mergedCandidates.filter((candidate) => candidate.id !== canonical.id);
    const canonicalShape = mergeConversationShape(
      canonical,
      duplicates,
      entry.targetScopeKey,
      entry.targetInstanceId
    );

    await prisma.$transaction(async (tx) => {
      for (const duplicate of duplicates) {
        await tx.message.updateMany({
          where: {
            conversationId: duplicate.id
          },
          data: {
            conversationId: canonical.id
          }
        });

        await tx.auditEvent.updateMany({
          where: {
            conversationId: duplicate.id
          },
          data: {
            conversationId: canonical.id
          }
        });
      }

      await tx.conversation.update({
        where: {
          id: canonical.id
        },
        data: canonicalShape
      });

      if (duplicates.length > 0) {
        await tx.conversation.deleteMany({
          where: {
            id: {
              in: duplicates.map((duplicate) => duplicate.id)
            }
          }
        });
      }
    });

    touchedConversationIds.add(canonical.id);
  }

  if (touchedConversationIds.size < 1) {
    return;
  }

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "Message" AS m
    SET
      "instanceId" = c."instanceId",
      "instanceScopeKey" = c."instanceScopeKey"
    FROM "Conversation" AS c
    WHERE c.id = m."conversationId"
      AND c."tenantId" = ${params.tenantId}
      AND c.id IN (${Prisma.join([...touchedConversationIds])})
      AND (m."instanceId" IS NULL OR m."instanceScopeKey" = 'default')
  `);
}

export async function ensureTenantWhatsAppRegistry(
  tenantInput: string | TenantInstanceSource
) {
  const tenant = typeof tenantInput === "string"
    ? await resolveTenantRuntimeContextById(tenantInput)
    : tenantInput;

  if (!tenant) {
    throw new Error("Tenant nao encontrado para sincronizar instancias WhatsApp");
  }

  const legacyInstanceName = normalizeWhatsAppInstanceName(tenant.whatsappInstance);
  let instances = await loadRegistryInstances(tenant.id);

  if (legacyInstanceName) {
    const matchingLegacy = instances.find((entry) => entry.instanceName === legacyInstanceName);
    if (!matchingLegacy) {
      await prisma.whatsAppInstance.create({
        data: {
          tenantId: tenant.id,
          instanceName: legacyInstanceName,
          displayName: tenant.name,
          isDefault: true,
          isActive: true
        }
      });
      await prisma.whatsAppInstance.updateMany({
        where: {
          tenantId: tenant.id,
          instanceName: {
            not: legacyInstanceName
          },
          isDefault: true
        },
        data: {
          isDefault: false
        }
      });
      instances = await loadRegistryInstances(tenant.id);
    } else if (!matchingLegacy.isDefault) {
      await prisma.$transaction([
        prisma.whatsAppInstance.updateMany({
          where: {
            tenantId: tenant.id,
            id: {
              not: matchingLegacy.id
            },
            isDefault: true
          },
          data: {
            isDefault: false
          }
        }),
        prisma.whatsAppInstance.update({
          where: {
            id: matchingLegacy.id
          },
          data: {
            isDefault: true,
            isActive: true
          }
        })
      ]);
      instances = await loadRegistryInstances(tenant.id);
    }
  }

  instances = await ensureFallbackRegistryInstance(tenant, instances);
  instances = await ensureRegistryInstancesFromObservedScopes(tenant, instances);

  const primaryInstance = instances.find((entry) => entry.isDefault) ?? instances[0] ?? null;
  if (primaryInstance) {
    await reconcileTenantLegacyConversationScopes({
      tenantId: tenant.id,
      primaryInstance,
      instances
    });

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Message" AS m
      SET
        "instanceId" = c."instanceId",
        "instanceScopeKey" = c."instanceScopeKey"
      FROM "Conversation" AS c
      WHERE c.id = m."conversationId"
        AND c."tenantId" = ${tenant.id}
        AND (m."instanceId" IS NULL OR m."instanceScopeKey" = 'default')
    `);
  }

  return loadRegistryInstances(tenant.id);
}

export async function resolveTenantInstanceById(params: {
  tenantId: string;
  instanceId?: string | null;
  instanceName?: string | null;
  includeInactive?: boolean;
}) {
  const instances = await ensureTenantWhatsAppRegistry(params.tenantId);
  const includeInactive = params.includeInactive === true;

  const filtered = includeInactive
    ? instances
    : instances.filter((entry) => entry.isActive);

  const normalizedInstanceId = String(params.instanceId ?? "").trim();
  if (normalizedInstanceId) {
    return filtered.find((entry) => entry.id === normalizedInstanceId) ?? null;
  }

  const normalizedInstanceName = normalizeWhatsAppInstanceName(params.instanceName);
  if (normalizedInstanceName) {
    return filtered.find((entry) => entry.instanceName === normalizedInstanceName) ?? null;
  }

  return filtered.find((entry) => entry.isDefault) ?? filtered[0] ?? null;
}

export async function resolveConversationInstanceRouting(params: {
  tenantId: string;
  conversation?: {
    instanceId?: string | null;
    instanceScopeKey?: string | null;
  } | null;
}) {
  const instances = await ensureTenantWhatsAppRegistry(params.tenantId);
  const activeInstances = instances.filter((entry) => entry.isActive);
  const byId = new Map(instances.map((entry) => [entry.id, entry]));
  const byScopeKey = new Map(instances.map((entry) => [entry.instanceName, entry]));

  const instanceById = params.conversation?.instanceId
    ? byId.get(params.conversation.instanceId) ?? null
    : null;
  if (instanceById) {
    return instanceById;
  }

  const scopeKey = normalizeWhatsAppInstanceName(params.conversation?.instanceScopeKey);
  if (scopeKey) {
    return byScopeKey.get(scopeKey) ?? null;
  }

  return activeInstances.find((entry) => entry.isDefault) ?? activeInstances[0] ?? null;
}

export async function resolveAccessibleWhatsAppInstances(params: {
  tenantId: string;
  userId: string;
  role: UserRole;
}) {
  const instances = await ensureTenantWhatsAppRegistry(params.tenantId);
  const activeInstances = instances.filter((entry) => entry.isActive);
  const isTenantAdmin = params.role === UserRole.ADMIN;

  const accessibleInstances = isTenantAdmin || activeInstances.length <= 1
    ? activeInstances
    : activeInstances;

  const scopeKeys = accessibleInstances.map((entry) => entry.instanceName);
  const fallbackScope = activeInstances.length < 1 ? ["default"] : [];

  return {
    isTenantAdmin,
    allInstances: instances,
    activeInstances,
    accessibleInstances,
    accessibleScopeKeys: scopeKeys.length > 0 ? scopeKeys : fallbackScope,
    hasMultipleActiveInstances: activeInstances.length > 1
  };
}

export function buildConversationInstanceScopeWhere(params: {
  tenantId: string;
  accessibleScopeKeys: string[];
}): Prisma.ConversationWhereInput {
  const uniqueScopeKeys = [...new Set(
    params.accessibleScopeKeys
      .map((entry) => normalizeWhatsAppInstanceName(entry))
      .filter((entry) => entry.length > 0)
  )];

  if (uniqueScopeKeys.length < 1) {
    return {
      tenantId: params.tenantId,
      id: "__no_access__"
    };
  }

  return {
    tenantId: params.tenantId,
    instanceScopeKey: {
      in: uniqueScopeKeys
    }
  };
}

export function buildMessageInstanceScopeWhere(params: {
  tenantId: string;
  accessibleScopeKeys: string[];
}): Prisma.MessageWhereInput {
  const uniqueScopeKeys = [...new Set(
    params.accessibleScopeKeys
      .map((entry) => normalizeWhatsAppInstanceName(entry))
      .filter((entry) => entry.length > 0)
  )];

  if (uniqueScopeKeys.length < 1) {
    return {
      tenantId: params.tenantId,
      id: "__no_access__"
    };
  }

  return {
    tenantId: params.tenantId,
    instanceScopeKey: {
      in: uniqueScopeKeys
    }
  };
}
