import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../db.js";
import { UserRole } from "../../domain/access.js";
import { requireAdmin, requirePlatformAdmin } from "../../lib/guards.js";
import { CoreApiError, type CoreAdminClient, type CoreTenant, platformCoreClient } from "../../services/core-client.js";
import { listTenantDirectoryUsers } from "../../services/core-tenant-directory.js";
import { mapLegacyRoleToCoreRoleCodes } from "../../services/core-identity.js";
import { resolveTenantRuntimeContextById } from "../../services/tenant-runtime.js";
import { mapTenantResponse } from "./tenant-response.js";
import { resolveAtendimentoSnapshot } from "./atendimento-snapshot.js";

const clientParamsSchema = z.object({
  clientId: z.string().min(1)
});

const createClientUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(120),
  password: z.string().min(6).max(128),
  role: z.nativeEnum(UserRole).default(UserRole.AGENT)
});

function toCoreErrorPayload(error: CoreApiError, fallbackMessage: string) {
  return {
    message: error.message?.trim() || fallbackMessage,
    details: error.details ?? null
  };
}

function disabledMutationMessage(resourceLabel: string) {
  return `${resourceLabel} no modulo de atendimento foi desativado para evitar duplicidade. Use /admin/core.`;
}

async function listWhatsAppInstancesByTenant() {
  const instances = await prisma.whatsAppInstance.findMany({
    orderBy: [
      { tenantId: "asc" },
      { isDefault: "desc" },
      { createdAt: "asc" }
    ]
  });

  const grouped = new Map<string, typeof instances>();
  for (const instance of instances) {
    const current = grouped.get(instance.tenantId) ?? [];
    current.push(instance);
    grouped.set(instance.tenantId, current);
  }

  return grouped;
}

function mapClientSummary(params: {
  coreTenant: CoreTenant;
  config: Awaited<ReturnType<typeof resolveTenantRuntimeContextById>>;
  currentUsers: number;
  snapshot: {
    maxUsers: number;
    maxChannels: number;
  };
  role: UserRole;
  instances: Array<{
    id: string;
    instanceName: string;
    displayName: string | null;
    phoneNumber: string | null;
    isDefault: boolean;
    isActive: boolean;
  }>;
}) {
  const createdAt = params.config?.createdAt ?? new Date(params.coreTenant.createdAt);
  const updatedAt = params.config?.updatedAt ?? new Date(params.coreTenant.updatedAt);
  const whatsappInstance =
    params.instances.find((entry) => entry.isDefault)?.instanceName
    ?? params.instances[0]?.instanceName
    ?? null;

  return mapTenantResponse(
    {
      id: params.coreTenant.id,
      slug: params.coreTenant.slug,
      name: params.coreTenant.name,
      whatsappInstance,
      whatsappInstances: params.instances.map((entry) => ({
        id: entry.id,
        instanceName: entry.instanceName,
        displayName: entry.displayName,
        phoneNumber: entry.phoneNumber,
        isDefault: entry.isDefault,
        isActive: entry.isActive,
        userIds: []
      })),
      maxChannels: params.snapshot.maxChannels,
      maxUsers: params.snapshot.maxUsers,
      retentionDays: params.config?.retentionDays ?? 15,
      maxUploadMb: params.config?.maxUploadMb ?? 500,
      createdAt,
      updatedAt
    },
    params.currentUsers,
    params.role
  );
}

export function registerClientRoutes(protectedApp: FastifyInstance) {
  protectedApp.get("/clients", async (request, reply) => {
    if (!await requirePlatformAdmin(request, reply)) {
      return;
    }

    try {
      const [coreTenants, adminClients, instancesByTenant] = await Promise.all([
        platformCoreClient.listTenants({
          accessToken: request.coreAccessToken
        }),
        platformCoreClient.listAdminClients({
          page: 1,
          limit: 300,
          accessToken: request.coreAccessToken
        }),
        listWhatsAppInstancesByTenant()
      ]);

      const adminClientByTenantId = new Map<string, CoreAdminClient>(
        adminClients
          .filter((entry) => entry.coreTenantId?.trim())
          .map((entry) => [entry.coreTenantId, entry] as const)
      );

      const clientSummaries = await Promise.all(
        coreTenants.map(async (coreTenant) => {
          const [config, coreUsers, snapshot] = await Promise.all([
            resolveTenantRuntimeContextById(coreTenant.id, {
              accessToken: request.coreAccessToken,
              ensureConfig: false
            }),
            platformCoreClient.listTenantUsers(coreTenant.id, {
              accessToken: request.coreAccessToken
            }).catch(() => []),
            resolveAtendimentoSnapshot({
              coreTenantId: coreTenant.id,
              adminClient: adminClientByTenantId.get(coreTenant.id) ?? null,
              fallbackMaxUsers: 3,
              fallbackMaxChannels: 1,
              fallbackCurrentUsers: 0,
              accessToken: request.coreAccessToken
            })
          ]);

          return mapClientSummary({
            coreTenant,
            config,
            currentUsers: coreUsers.length,
            snapshot,
            role: request.authUser.role,
            instances: instancesByTenant.get(coreTenant.id) ?? []
          });
        })
      );

      return clientSummaries;
    } catch (error) {
      if (error instanceof CoreApiError) {
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
      const adminClient = await platformCoreClient.listAdminClients({
        page: 1,
        limit: 300,
        accessToken: request.coreAccessToken
      }).then((items) => items.find((entry) => entry.coreTenantId === params.data.clientId) ?? null);

      const users = await listTenantDirectoryUsers(params.data.clientId, {
        accessToken: request.coreAccessToken,
        clientId: adminClient?.id ?? null
      });

      return users.map(({ coreTenantUserId: _coreTenantUserId, atendimentoAccess: _atendimentoAccess, ...entry }) => entry);
    } catch (error) {
      if (error instanceof CoreApiError) {
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
      const roleCodes = mapLegacyRoleToCoreRoleCodes(body.data.role);
      await platformCoreClient.inviteTenantUser(params.data.clientId, {
        email: body.data.email.trim().toLowerCase(),
        name: body.data.name.trim(),
        password: body.data.password,
        isOwner: body.data.role === UserRole.ADMIN,
        roleCodes
      }, {
        accessToken: request.coreAccessToken
      });

      const adminClient = await platformCoreClient.listAdminClients({
        page: 1,
        limit: 300,
        accessToken: request.coreAccessToken
      }).then((items) => items.find((entry) => entry.coreTenantId === params.data.clientId) ?? null);

      const users = await listTenantDirectoryUsers(params.data.clientId, {
        accessToken: request.coreAccessToken,
        clientId: adminClient?.id ?? null
      });
      const created = users.find(
        (entry) => entry.email.trim().toLowerCase() === body.data.email.trim().toLowerCase()
      );

      if (!created) {
        return reply.code(500).send({
          message: "Usuario criado no plataforma-api, mas nao foi possivel montar a resposta do modulo."
        });
      }

      const { coreTenantUserId: _coreTenantUserId, atendimentoAccess: _atendimentoAccess, ...payload } = created;
      return reply.code(201).send(payload);
    } catch (error) {
      if (error instanceof CoreApiError) {
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
