import { UserRole } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import { prisma } from "../db.js";
import { requireAdmin, requireAtendimentoModuleAccess } from "../lib/guards.js";
import { invalidateCoreAtendimentoAccessCacheByEmail } from "../services/core-atendimento-access.js";
import { CoreApiError, type CoreTenant, platformCoreClient } from "../services/core-client.js";
import {
  listCoreTenantUsersWithLegacyRoles,
  mapLegacyRoleToCoreRoleCodes,
  syncLocalUsersFromCoreTenant
} from "../services/core-identity.js";
import { findBestCoreTenantMatch } from "../services/core-tenant-mapping.js";

const createUserSchema = z.object({
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

async function resolveCurrentCoreTenant(tenantSlug: string, localTenantId: string) {
  const coreBySlug = await platformCoreClient.findTenantBySlug(tenantSlug);
  if (coreBySlug) {
    return coreBySlug;
  }

  const [localTenant, coreTenants] = await Promise.all([
    prisma.tenant.findUnique({
      where: {
        id: localTenantId
      },
      select: {
        slug: true,
        name: true
      }
    }),
    platformCoreClient.listTenants()
  ]);

  return findBestCoreTenantMatch({
    localSlug: localTenant?.slug ?? tenantSlug,
    localName: localTenant?.name,
    coreTenants
  }) as CoreTenant | null;
}

export async function userRoutes(app: FastifyInstance) {
  app.register(async (protectedApp) => {
    protectedApp.addHook("preHandler", protectedApp.authenticate);
    protectedApp.addHook("preHandler", async (request, reply) => {
      const allowed = await requireAtendimentoModuleAccess(request, reply);
      if (!allowed) {
        return reply;
      }
    });

    protectedApp.get("/users", async (request, reply) => {
      try {
        const tenantSlug = request.authUser.tenantSlug.trim().toLowerCase();
        const coreTenant = await resolveCurrentCoreTenant(tenantSlug, request.authUser.tenantId);

        if (!coreTenant) {
          return reply.code(404).send({
            message: `Tenant ${tenantSlug} nao encontrado no platform-core`
          });
        }

        const coreUsers = await listCoreTenantUsersWithLegacyRoles(coreTenant.id);
        const syncedUsers = await syncLocalUsersFromCoreTenant(request.authUser.tenantId, coreUsers);
        return syncedUsers;
      } catch (error) {
        if (error instanceof CoreApiError) {
          return reply.code(error.statusCode).send(toCoreErrorPayload(error, "Falha ao listar usuarios no platform-core"));
        }

        request.log.error({ error }, "Falha ao sincronizar usuarios do platform-core");
        return reply.code(500).send({
          message: "Falha ao listar usuarios no platform-core"
        });
      }
    });

    protectedApp.post("/users", async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }

      const parsed = createUserSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Payload invalido",
          errors: parsed.error.flatten()
        });
      }

      try {
        const tenantSlug = request.authUser.tenantSlug.trim().toLowerCase();
        const coreTenant = await resolveCurrentCoreTenant(tenantSlug, request.authUser.tenantId);

        if (!coreTenant) {
          return reply.code(404).send({
            message: `Tenant ${tenantSlug} nao encontrado no platform-core`
          });
        }

        const roleCodes = mapLegacyRoleToCoreRoleCodes(parsed.data.role);
        const invited = await platformCoreClient.inviteTenantUser(coreTenant.id, {
          email: parsed.data.email.trim().toLowerCase(),
          name: parsed.data.name.trim(),
          password: parsed.data.password,
          isOwner: parsed.data.role === UserRole.ADMIN,
          roleCodes
        });

        if (parsed.data.role === UserRole.ADMIN) {
          try {
            await platformCoreClient.assignTenantUserToModule(
              coreTenant.id,
              env.CORE_ATENDIMENTO_MODULE_CODE,
              invited.tenantUserId
            );
            await invalidateCoreAtendimentoAccessCacheByEmail(parsed.data.email);
          } catch (assignmentError) {
            request.log.warn(
              { error: assignmentError, tenantId: coreTenant.id, tenantUserId: invited.tenantUserId },
              "Falha ao vincular usuario admin ao modulo atendimento no platform-core"
            );
          }
        }

        const coreUsers = await listCoreTenantUsersWithLegacyRoles(coreTenant.id);
        const syncedUsers = await syncLocalUsersFromCoreTenant(request.authUser.tenantId, coreUsers);

        const created = syncedUsers.find(
          (entry) => entry.email.trim().toLowerCase() === parsed.data.email.trim().toLowerCase()
        );

        if (!created) {
          return reply.code(500).send({
            message: "Usuario criado no platform-core, mas nao foi possivel sincronizar no modulo."
          });
        }

        return reply.code(201).send(created);
      } catch (error) {
        if (error instanceof CoreApiError) {
          return reply.code(error.statusCode).send(toCoreErrorPayload(error, "Falha ao criar usuario no platform-core"));
        }

        request.log.error({ error }, "Falha ao criar usuario via platform-core");
        return reply.code(500).send({
          message: "Falha ao criar usuario no platform-core"
        });
      }
    });

    protectedApp.patch("/users/:userId", async (_request, reply) => {
      return reply.code(501).send({
        message: "Edicao de usuarios no modulo foi desativada. Use /admin/core para gerenciar usuarios."
      });
    });

    protectedApp.delete("/users/:userId", async (_request, reply) => {
      return reply.code(501).send({
        message: "Remocao de usuarios no modulo foi desativada. Use /admin/core para gerenciar usuarios."
      });
    });
  });
}
