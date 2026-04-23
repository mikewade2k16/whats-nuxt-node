import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { UserRole } from "../domain/access.js";
import { requireAdmin, requireAtendimentoModuleAccess } from "../lib/guards.js";
import { CoreApiError, platformCoreClient } from "../services/core-client.js";
import { listTenantDirectoryUsers } from "../services/core-tenant-directory.js";
import { mapLegacyRoleToCoreRoleCodes } from "../services/core-identity.js";

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
        const users = await listTenantDirectoryUsers(request.authUser.tenantId, {
          accessToken: request.coreAccessToken
        });
        return users.map(({ coreTenantUserId: _coreTenantUserId, atendimentoAccess: _atendimentoAccess, ...entry }) => entry);
      } catch (error) {
        if (error instanceof CoreApiError) {
          return reply.code(error.statusCode).send(toCoreErrorPayload(error, "Falha ao listar usuarios no plataforma-api"));
        }

        request.log.error({ error }, "Falha ao listar usuarios do tenant via plataforma-api");
        return reply.code(500).send({
          message: "Falha ao listar usuarios no plataforma-api"
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
        const roleCodes = mapLegacyRoleToCoreRoleCodes(parsed.data.role);
        await platformCoreClient.inviteTenantUser(request.authUser.tenantId, {
          email: parsed.data.email.trim().toLowerCase(),
          name: parsed.data.name.trim(),
          password: parsed.data.password,
          isOwner: parsed.data.role === UserRole.ADMIN,
          roleCodes
        }, {
          accessToken: request.coreAccessToken
        });

        const users = await listTenantDirectoryUsers(request.authUser.tenantId, {
          accessToken: request.coreAccessToken
        });
        const created = users.find(
          (entry) => entry.email.trim().toLowerCase() === parsed.data.email.trim().toLowerCase()
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

        request.log.error({ error }, "Falha ao criar usuario via plataforma-api");
        return reply.code(500).send({
          message: "Falha ao criar usuario no plataforma-api"
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
