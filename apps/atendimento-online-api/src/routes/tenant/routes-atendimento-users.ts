import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../db.js";
import { requireAdmin } from "../../lib/guards.js";
import { platformCoreClient } from "../../services/core-client.js";
import {
  resolveCoreAtendimentoAccessByEmail,
  invalidateCoreAtendimentoAccessCacheByEmail
} from "../../services/core-atendimento-access.js";
import {
  resolveAdminClientByCoreTenantId,
  resolveAtendimentoSnapshot,
  resolveCurrentCoreTenant
} from "./atendimento-snapshot.js";

const toggleAtendimentoAccessParams = z.object({
  userId: z.string().min(1)
});

const toggleAtendimentoAccessBody = z.object({
  grant: z.boolean()
});

async function loadTenantUsersWithAccess(
  tenantId: string,
  options: { accessToken?: string | null; clientId?: number | null } = {}
) {
  const users = await prisma.user.findMany({
    where: { tenantId },
    select: { id: true, email: true, name: true, role: true },
    orderBy: [{ role: "asc" }, { name: "asc" }]
  });

  return Promise.all(
    users.map(async (user) => {
      const coreAccess = await resolveCoreAtendimentoAccessByEmail(user.email, options);
      return { ...user, atendimentoAccess: coreAccess.atendimentoAccess };
    })
  );
}

export function registerAtendimentoUsersRoutes(protectedApp: FastifyInstance) {
  protectedApp.put("/tenant/users/:userId/atendimento-access", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const params = toggleAtendimentoAccessParams.safeParse(request.params);
    const body = toggleAtendimentoAccessBody.safeParse(request.body ?? {});

    if (!params.success || !body.success) {
      return reply.code(400).send({ message: "Payload invalido" });
    }

    const localUser = await prisma.user.findFirst({
      where: { id: params.data.userId, tenantId: request.authUser.tenantId },
      select: { id: true, email: true, name: true, role: true }
    });

    if (!localUser) {
      return reply.code(404).send({ message: "Usuario nao encontrado" });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: request.authUser.tenantId },
      select: { id: true, coreTenantId: true, slug: true, name: true, maxChannels: true, maxUsers: true }
    });

    if (!tenant) {
      return reply.code(404).send({ message: "Tenant nao encontrado" });
    }

    const coreTenant = await resolveCurrentCoreTenant({
      coreTenantId: tenant.coreTenantId,
      slug: tenant.slug,
      name: tenant.name
    }, {
      accessToken: request.coreAccessToken
    });
    if (!coreTenant) {
      return reply.code(404).send({
        message: "Tenant nao encontrado no plataforma-api. Verifique o slug do cliente."
      });
    }

    const adminClient = await resolveAdminClientByCoreTenantId(coreTenant.id, {
      accessToken: request.coreAccessToken
    });
    const localUsersCount = await prisma.user.count({ where: { tenantId: tenant.id } });
    const atendimentoSnapshot = await resolveAtendimentoSnapshot({
      coreTenantId: coreTenant.id,
      adminClient,
      fallbackMaxUsers: tenant.maxUsers,
      fallbackMaxChannels: tenant.maxChannels,
      fallbackCurrentUsers: localUsersCount,
      accessToken: request.coreAccessToken
    });

    if (body.data.grant && atendimentoSnapshot.currentUsers >= atendimentoSnapshot.maxUsers) {
      return reply.code(409).send({
        message: `Limite de usuarios com acesso ao atendimento atingido (${atendimentoSnapshot.currentUsers}/${atendimentoSnapshot.maxUsers}).`,
        details: {
          currentUsers: atendimentoSnapshot.currentUsers,
          maxUsers: atendimentoSnapshot.maxUsers
        }
      });
    }

    const coreTenantUsers = await platformCoreClient.listTenantUsers(coreTenant.id, {
      accessToken: request.coreAccessToken
    });
    const normalizedEmail = localUser.email.trim().toLowerCase();
    const coreTenantUser = coreTenantUsers.find(
      (u) => u.email.trim().toLowerCase() === normalizedEmail
    );

    if (!coreTenantUser) {
      return reply.code(404).send({
        message: `Usuario ${localUser.email} nao encontrado no plataforma-api para este tenant. O usuario precisa ser convidado pelo painel central primeiro.`
      });
    }

    try {
      if (body.data.grant) {
        await platformCoreClient.assignTenantUserToModule(
          coreTenant.id,
          "atendimento",
          coreTenantUser.tenantUserId,
          { accessToken: request.coreAccessToken }
        );
      } else {
        await platformCoreClient.unassignTenantUserFromModule(
          coreTenant.id,
          "atendimento",
          coreTenantUser.tenantUserId,
          { accessToken: request.coreAccessToken }
        );
      }
    } catch (error) {
      request.log.error(
        { error, userId: localUser.id, email: localUser.email, grant: body.data.grant },
        "Falha ao atualizar acesso ao modulo atendimento"
      );
      return reply.code(502).send({
        message: "Falha ao atualizar acesso ao modulo atendimento no plataforma-api"
      });
    }

    await invalidateCoreAtendimentoAccessCacheByEmail(localUser.email);

    const updatedUsers = await loadTenantUsersWithAccess(tenant.id, {
      accessToken: request.coreAccessToken,
      clientId: adminClient?.id ?? null
    });
    return { users: updatedUsers };
  });
}
