import { UserRole } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../db.js";
import { requireAdmin, requirePlatformAdmin } from "../../lib/guards.js";
import { CoreApiError, type CoreTenant, platformCoreClient } from "../../services/core-client.js";
import {
  listCoreTenantUsersWithLegacyRoles,
  mapCoreUsersToLegacyFallback,
  mapLegacyRoleToCoreRoleCodes,
  syncLocalUsersFromCoreTenant,
  type LegacyTenantUser
} from "../../services/core-identity.js";
import { findBestCoreTenantMatch } from "../../services/core-tenant-mapping.js";
import { mapTenantResponse } from "./tenant-response.js";

const clientParamsSchema = z.object({
  clientId: z.string().min(1)
});

const createClientUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(120),
  password: z.string().min(6).max(128),
  role: z.nativeEnum(UserRole).default(UserRole.AGENT)
});

type LocalTenantSummary = {
  id: string;
  coreTenantId: string | null;
  slug: string;
  name: string;
  whatsappInstance: string | null;
  whatsappInstances: Array<{
    id: string;
    instanceName: string;
    displayName: string | null;
    phoneNumber: string | null;
    isDefault: boolean;
    isActive: boolean;
    userAccesses: Array<{
      userId: string;
    }>;
  }>;
  evolutionApiKey: string | null;
  maxChannels: number;
  maxUsers: number;
  retentionDays: number;
  maxUploadMb: number;
  createdAt: Date;
  updatedAt: Date;
};

type TenantContext = {
  coreTenant: CoreTenant;
  localTenant: LocalTenantSummary | null;
};

function toCoreErrorPayload(error: CoreApiError, fallbackMessage: string) {
  return {
    message: error.message?.trim() || fallbackMessage,
    details: error.details ?? null
  };
}

function isCoreApiError(error: unknown): error is CoreApiError {
  return error instanceof CoreApiError;
}

function disabledMutationMessage(resourceLabel: string) {
  return `${resourceLabel} no modulo de atendimento foi desativado para evitar duplicidade. Use /admin/core.`;
}

async function listLocalTenantSummaries() {
  return prisma.tenant.findMany({
    select: {
      id: true,
      coreTenantId: true,
      slug: true,
      name: true,
      whatsappInstance: true,
      whatsappInstances: {
        select: {
          id: true,
          instanceName: true,
          displayName: true,
          phoneNumber: true,
          isDefault: true,
          isActive: true,
          userAccesses: {
            select: {
              userId: true
            }
          }
        }
      },
      evolutionApiKey: true,
      maxChannels: true,
      maxUsers: true,
      retentionDays: true,
      maxUploadMb: true,
      createdAt: true,
      updatedAt: true
    }
  });
}

async function resolveTenantContext(
  clientId: string,
  options: { accessToken?: string | null } = {}
): Promise<TenantContext | null> {
  const [coreTenants, localById] = await Promise.all([
    platformCoreClient.listTenants({
      accessToken: options.accessToken
    }),
    prisma.tenant.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        coreTenantId: true,
        slug: true,
        name: true,
        whatsappInstance: true,
        whatsappInstances: {
          select: {
            id: true,
            instanceName: true,
            displayName: true,
            phoneNumber: true,
            isDefault: true,
            isActive: true,
            userAccesses: {
              select: {
                userId: true
              }
            }
          }
        },
        evolutionApiKey: true,
        maxChannels: true,
        maxUsers: true,
        retentionDays: true,
        maxUploadMb: true,
        createdAt: true,
        updatedAt: true
      }
    })
  ]);

  if (localById) {
    const normalizedCoreTenantId = String(localById.coreTenantId ?? "").trim();
    const coreBySlug = normalizedCoreTenantId
      ? (coreTenants.find((entry) => entry.id === normalizedCoreTenantId) ?? null)
      : findBestCoreTenantMatch({
          localSlug: localById.slug,
          localName: localById.name,
          coreTenants
        });

    if (!coreBySlug) {
      return null;
    }

    return {
      coreTenant: coreBySlug,
      localTenant: localById
    };
  }

  const coreById = coreTenants.find((entry) => entry.id === clientId) ?? null;
  if (!coreById) {
    return null;
  }

  const localBySlug =
    await prisma.tenant.findUnique({
      where: { coreTenantId: coreById.id },
      select: {
        id: true,
        coreTenantId: true,
        slug: true,
        name: true,
        whatsappInstance: true,
        whatsappInstances: {
          select: {
            id: true,
            instanceName: true,
            displayName: true,
            phoneNumber: true,
            isDefault: true,
            isActive: true,
            userAccesses: {
              select: {
                userId: true
              }
            }
          }
        },
        evolutionApiKey: true,
        maxChannels: true,
        maxUsers: true,
        retentionDays: true,
        maxUploadMb: true,
        createdAt: true,
        updatedAt: true
      }
    })
    ?? await prisma.tenant.findUnique({
      where: { slug: coreById.slug },
      select: {
        id: true,
        coreTenantId: true,
        slug: true,
        name: true,
        whatsappInstance: true,
        whatsappInstances: {
          select: {
            id: true,
            instanceName: true,
            displayName: true,
            phoneNumber: true,
            isDefault: true,
            isActive: true,
            userAccesses: {
              select: {
                userId: true
              }
            }
          }
        },
        evolutionApiKey: true,
        maxChannels: true,
        maxUsers: true,
        retentionDays: true,
        maxUploadMb: true,
        createdAt: true,
        updatedAt: true
      }
    });

  return {
    coreTenant: coreById,
    localTenant: localBySlug
  };
}

async function listUsersForContext(
  context: TenantContext,
  options: { accessToken?: string | null } = {}
): Promise<LegacyTenantUser[]> {
  const coreUsers = await listCoreTenantUsersWithLegacyRoles(context.coreTenant.id, {
    accessToken: options.accessToken
  });
  if (!context.localTenant) {
    return mapCoreUsersToLegacyFallback(context.coreTenant.id, coreUsers);
  }

  return syncLocalUsersFromCoreTenant(context.localTenant.id, coreUsers);
}

async function createCoreUserForContext(
  context: TenantContext,
  input: z.infer<typeof createClientUserSchema>,
  options: { accessToken?: string | null } = {}
): Promise<LegacyTenantUser | null> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedName = input.name.trim();
  const roleCodes = mapLegacyRoleToCoreRoleCodes(input.role);

  const invited = await platformCoreClient.inviteTenantUser(context.coreTenant.id, {
    email: normalizedEmail,
    name: normalizedName,
    password: input.password,
    isOwner: input.role === UserRole.ADMIN,
    roleCodes
  }, {
    accessToken: options.accessToken
  });

  const coreUsers = await listCoreTenantUsersWithLegacyRoles(context.coreTenant.id, {
    accessToken: options.accessToken
  });
  const createdCoreEntry =
    coreUsers.find((entry) => entry.tenantUserId === invited.tenantUserId) ??
    coreUsers.find((entry) => entry.email.trim().toLowerCase() === normalizedEmail) ??
    null;

  if (!createdCoreEntry) {
    return null;
  }

  if (!context.localTenant) {
    return mapCoreUsersToLegacyFallback(context.coreTenant.id, [createdCoreEntry])[0] ?? null;
  }

  const synced = await syncLocalUsersFromCoreTenant(context.localTenant.id, coreUsers);
  return synced.find((entry) => entry.email.trim().toLowerCase() === normalizedEmail) ?? null;
}

function mapTenantSummaryFromCore(
  coreTenant: CoreTenant,
  localTenant: LocalTenantSummary | undefined,
  currentUsers: number,
  role: UserRole
) {
  const fallbackCreatedAt = new Date(coreTenant.createdAt);
  const fallbackUpdatedAt = new Date(coreTenant.updatedAt);

  return mapTenantResponse(
    {
      id: localTenant?.id ?? coreTenant.id,
      slug: coreTenant.slug,
      name: coreTenant.name,
      whatsappInstance: localTenant?.whatsappInstance ?? null,
      whatsappInstances: localTenant?.whatsappInstances?.map((entry) => ({
        id: entry.id,
        instanceName: entry.instanceName,
        displayName: entry.displayName,
        phoneNumber: entry.phoneNumber,
        isDefault: entry.isDefault,
        isActive: entry.isActive,
        userIds: entry.userAccesses.map((access) => access.userId)
      })) ?? [],
      evolutionApiKey: localTenant?.evolutionApiKey ?? null,
      maxChannels: localTenant?.maxChannels ?? 1,
      maxUsers: localTenant?.maxUsers ?? Math.max(currentUsers, 1),
      retentionDays: localTenant?.retentionDays ?? 15,
      maxUploadMb: localTenant?.maxUploadMb ?? 500,
      createdAt: localTenant?.createdAt ?? fallbackCreatedAt,
      updatedAt: localTenant?.updatedAt ?? fallbackUpdatedAt
    },
    currentUsers,
    role
  );
}

export function registerClientRoutes(protectedApp: FastifyInstance) {
  protectedApp.get("/clients", async (request, reply) => {
    if (!await requirePlatformAdmin(request, reply)) {
      return;
    }

    try {
      const [coreTenants, localTenants] = await Promise.all([
        platformCoreClient.listTenants({
          accessToken: request.coreAccessToken
        }),
        listLocalTenantSummaries()
      ]);

      const localByCoreTenantId = new Map(
        localTenants
          .map((entry) => [String(entry.coreTenantId ?? "").trim(), entry] as const)
          .filter((entry): entry is readonly [string, LocalTenantSummary] => entry[0].length > 0)
      );
      const localBySlug = new Map(localTenants.map((entry) => [entry.slug.trim().toLowerCase(), entry]));

      const usersByTenantIdEntries = await Promise.all(
        coreTenants.map(async (tenant) => {
          try {
            const users = await platformCoreClient.listTenantUsers(tenant.id, {
              accessToken: request.coreAccessToken
            });
            return [tenant.id, users.length] as const;
          } catch {
            return [tenant.id, 0] as const;
          }
        })
      );

      const usersByTenantId = new Map(usersByTenantIdEntries);

      return coreTenants.map((coreTenant) => {
        const localTenant =
          localByCoreTenantId.get(coreTenant.id)
          ?? localBySlug.get(coreTenant.slug.trim().toLowerCase());
        const currentUsers = usersByTenantId.get(coreTenant.id) ?? 0;
        return mapTenantSummaryFromCore(coreTenant, localTenant, currentUsers, request.authUser.role);
      });
    } catch (error) {
      if (isCoreApiError(error)) {
        return reply.code(error.statusCode).send(toCoreErrorPayload(error, "Falha ao listar clientes no plataforma-api"));
      }

      request.log.error({ error }, "Falha ao listar clientes via plataforma-api");
      return reply.code(500).send({ message: "Falha ao listar clientes no plataforma-api" });
    }
  });

  protectedApp.post("/clients", async (_request, reply) => {
    return reply.code(501).send({
      message: disabledMutationMessage("Criacao de clientes")
    });
  });

  protectedApp.patch("/clients/:clientId", async (_request, reply) => {
    return reply.code(501).send({
      message: disabledMutationMessage("Edicao de clientes")
    });
  });

  protectedApp.delete("/clients/:clientId", async (_request, reply) => {
    return reply.code(501).send({
      message: disabledMutationMessage("Remocao de clientes")
    });
  });

  protectedApp.get("/clients/:clientId/users", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const params = clientParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Payload invalido" });
    }

    const isOwnTenant = params.data.clientId === request.authUser.tenantId;
    if (!isOwnTenant) {
      if (!await requirePlatformAdmin(request, reply)) {
        return;
      }
    }

    try {
      const context = await resolveTenantContext(params.data.clientId, {
        accessToken: request.coreAccessToken
      });
      if (!context) {
        return reply.code(404).send({ message: "Cliente nao encontrado no plataforma-api" });
      }

      return listUsersForContext(context, {
        accessToken: request.coreAccessToken
      });
    } catch (error) {
      if (isCoreApiError(error)) {
        return reply.code(error.statusCode).send(toCoreErrorPayload(error, "Falha ao listar usuarios do cliente no plataforma-api"));
      }

      request.log.error({ error }, "Falha ao listar usuarios do cliente via plataforma-api");
      return reply.code(500).send({ message: "Falha ao listar usuarios do cliente no plataforma-api" });
    }
  });

  protectedApp.post("/clients/:clientId/users", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const params = clientParamsSchema.safeParse(request.params);
    const body = createClientUserSchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return reply.code(400).send({
        message: "Payload invalido",
        errors: body.success ? undefined : body.error.flatten()
      });
    }

    const isOwnTenant = params.data.clientId === request.authUser.tenantId;
    if (!isOwnTenant) {
      if (!await requirePlatformAdmin(request, reply)) {
        return;
      }
    }

    try {
      const context = await resolveTenantContext(params.data.clientId, {
        accessToken: request.coreAccessToken
      });
      if (!context) {
        return reply.code(404).send({ message: "Cliente nao encontrado no plataforma-api" });
      }

      const created = await createCoreUserForContext(context, body.data, {
        accessToken: request.coreAccessToken
      });
      if (!created) {
        return reply.code(500).send({
          message: "Usuario criado no plataforma-api, mas nao foi possivel montar resposta local."
        });
      }

      return reply.code(201).send(created);
    } catch (error) {
      if (isCoreApiError(error)) {
        return reply.code(error.statusCode).send(toCoreErrorPayload(error, "Falha ao criar usuario no plataforma-api"));
      }

      request.log.error({ error }, "Falha ao criar usuario do cliente via plataforma-api");
      return reply.code(500).send({ message: "Falha ao criar usuario no plataforma-api" });
    }
  });

  protectedApp.patch("/clients/:clientId/users/:userId", async (_request, reply) => {
    return reply.code(501).send({
      message: disabledMutationMessage("Edicao de usuarios de cliente")
    });
  });

  protectedApp.delete("/clients/:clientId/users/:userId", async (_request, reply) => {
    return reply.code(501).send({
      message: disabledMutationMessage("Remocao de usuarios de cliente")
    });
  });
}
