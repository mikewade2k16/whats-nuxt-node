import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../lib/guards.js";
import { CoreApiError, platformCoreClient } from "../../services/core-client.js";
import { listTenantDirectoryUsers } from "../../services/core-tenant-directory.js";
import { isPlatformSuperRoot, normalizeOptionalIdentity } from "../../services/auth-context.js";
import {
  resolveTenantRuntimeContextForAuth,
  resolveTenantRuntimeContextById,
  updateTenantRuntimeConfig
} from "../../services/tenant-runtime.js";
import { mapTenantResponse } from "./helpers.js";
import { updateTenantSchema } from "./schemas.js";
import { ensureTenantWhatsAppRegistry } from "../../services/whatsapp-instances.js";
import {
  resolveAdminClientByCoreTenantId,
  resolveAtendimentoSnapshot
} from "./atendimento-snapshot.js";

function sendCoreError(reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } }, error: CoreApiError, fallbackMessage: string) {
  return reply.code(error.statusCode >= 500 ? 502 : error.statusCode).send({
    message: error.message?.trim() || fallbackMessage,
    details: error.details ?? null
  });
}

function mapInstancePayload(entry: Awaited<ReturnType<typeof ensureTenantWhatsAppRegistry>>[number]) {
  return {
    id: entry.id,
    instanceName: entry.instanceName,
    displayName: entry.displayName,
    phoneNumber: entry.phoneNumber,
    queueLabel: entry.queueLabel ?? null,
    userScopePolicy: "MULTI_INSTANCE" as const,
    responsibleUserId: entry.responsibleUserId ?? null,
    responsibleUserName: entry.responsibleUser?.name ?? null,
    responsibleUserEmail: entry.responsibleUser?.email ?? null,
    isDefault: entry.isDefault,
    isActive: entry.isActive,
    userIds: [] as string[]
  };
}

export function registerTenantCoreRoutes(protectedApp: FastifyInstance) {
  protectedApp.get("/me", async (request, reply) => {
    const users = await listTenantDirectoryUsers(request.authUser.tenantId, {
      accessToken: request.coreAccessToken
    });
    const currentUser = users.find((entry) => entry.id === request.authUser.sub);

    if (!currentUser) {
      return reply.send({
        id: request.authUser.sub,
        tenantId: request.authUser.tenantId,
        email: request.authUser.email,
        name: request.authUser.name,
        role: request.authUser.role,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    return reply.send({
      id: currentUser.id,
      tenantId: currentUser.tenantId,
      email: currentUser.email,
      name: currentUser.name,
      role: currentUser.role,
      createdAt: currentUser.createdAt,
      updatedAt: currentUser.updatedAt
    });
  });

  protectedApp.get("/tenant", async (request, reply) => {
    try {
      const tenant = await resolveTenantRuntimeContextForAuth(request.authUser, {
        accessToken: request.coreAccessToken
      });

      if (!tenant) {
        return reply.code(404).send({ message: "Tenant nao encontrado" });
      }

      const adminClient = await resolveAdminClientByCoreTenantId(tenant.coreTenantId, {
        accessToken: request.coreAccessToken
      });
      const atendimentoSnapshot = await resolveAtendimentoSnapshot({
        coreTenantId: tenant.coreTenantId,
        adminClient,
        fallbackMaxUsers: 3,
        fallbackMaxChannels: 1,
        fallbackCurrentUsers: 0,
        accessToken: request.coreAccessToken
      });
      const canManageAtendimentoLimits = isPlatformSuperRoot(request.coreAccess);
      const whatsappInstances = await ensureTenantWhatsAppRegistry(tenant);

      return mapTenantResponse(
        {
          ...tenant,
          whatsappInstances: whatsappInstances.map(mapInstancePayload),
          maxChannels: atendimentoSnapshot.maxChannels,
          maxUsers: atendimentoSnapshot.maxUsers,
          canManageAtendimentoLimits
        },
        atendimentoSnapshot.currentUsers,
        request.authUser.role
      );
    } catch (error) {
      if (error instanceof CoreApiError) {
        return sendCoreError(reply, error, "Falha ao carregar tenant no plataforma-api");
      }

      request.log.error({ error }, "Falha ao carregar configuracao do tenant");
      return reply.code(500).send({ message: "Falha ao carregar configuracao do tenant" });
    }
  });

  protectedApp.patch("/tenant", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const parsed = updateTenantSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Payload invalido",
        errors: parsed.error.flatten()
      });
    }

    try {
      const currentTenant = await resolveTenantRuntimeContextForAuth(request.authUser, {
        accessToken: request.coreAccessToken
      });

      if (!currentTenant) {
        return reply.code(404).send({ message: "Tenant nao encontrado" });
      }

      const adminClient = await resolveAdminClientByCoreTenantId(currentTenant.coreTenantId, {
        accessToken: request.coreAccessToken
      });
      const atendimentoSnapshot = await resolveAtendimentoSnapshot({
        coreTenantId: currentTenant.coreTenantId,
        adminClient,
        fallbackMaxUsers: 3,
        fallbackMaxChannels: 1,
        fallbackCurrentUsers: 0,
        accessToken: request.coreAccessToken
      });
      const canManageAtendimentoLimits = isPlatformSuperRoot(request.coreAccess);
      const whatsappInstances = await ensureTenantWhatsAppRegistry(currentTenant);
      const currentChannels = whatsappInstances.filter((entry) => entry.isActive).length;
      const nextMaxUsers = canManageAtendimentoLimits
        ? (parsed.data.maxUsers ?? atendimentoSnapshot.maxUsers)
        : atendimentoSnapshot.maxUsers;
      const nextMaxChannels = canManageAtendimentoLimits
        ? (parsed.data.maxChannels ?? atendimentoSnapshot.maxChannels)
        : atendimentoSnapshot.maxChannels;
      const nextRetentionDays = parsed.data.retentionDays ?? currentTenant.retentionDays;
      const nextMaxUploadMb = parsed.data.maxUploadMb ?? currentTenant.maxUploadMb;

      if (nextMaxUsers < atendimentoSnapshot.currentUsers) {
        return reply.code(409).send({
          message: "Limite de usuarios do atendimento nao pode ficar abaixo do total atual alocado.",
          details: {
            currentUsers: atendimentoSnapshot.currentUsers,
            nextMaxUsers
          }
        });
      }

      if (nextMaxChannels < currentChannels) {
        return reply.code(409).send({
          message: "Limite de canais nao pode ficar abaixo dos canais configurados no tenant.",
          details: {
            currentChannels,
            nextMaxChannels
          }
        });
      }

      if (canManageAtendimentoLimits && typeof parsed.data.maxUsers === "number") {
        await platformCoreClient.upsertModuleLimit(currentTenant.coreTenantId, "atendimento", "users", {
          valueInt: nextMaxUsers,
          isUnlimited: false,
          source: "admin_panel",
          notes: "Atualizado pelo painel do modulo atendimento"
        }, {
          accessToken: request.coreAccessToken
        });
      }

      if (canManageAtendimentoLimits && typeof parsed.data.maxChannels === "number") {
        await platformCoreClient.upsertModuleLimit(currentTenant.coreTenantId, "atendimento", "instances", {
          valueInt: nextMaxChannels,
          isUnlimited: false,
          source: "admin_panel",
          notes: "Atualizado pelo painel do modulo atendimento"
        }, {
          accessToken: request.coreAccessToken
        });
      }

      await updateTenantRuntimeConfig(currentTenant.coreTenantId, {
        retentionDays: nextRetentionDays,
        maxUploadMb: nextMaxUploadMb
      });

      const updated = await resolveTenantRuntimeContextById(currentTenant.coreTenantId, {
        accessToken: request.coreAccessToken
      });
      if (!updated) {
        return reply.code(404).send({ message: "Tenant nao encontrado apos atualizar configuracao" });
      }

      const updatedInstances = await ensureTenantWhatsAppRegistry(updated);

      return mapTenantResponse(
        {
          ...updated,
          maxChannels: nextMaxChannels,
          maxUsers: nextMaxUsers,
          canManageAtendimentoLimits,
          whatsappInstances: updatedInstances.map(mapInstancePayload)
        },
        atendimentoSnapshot.currentUsers,
        request.authUser.role
      );
    } catch (error) {
      if (error instanceof CoreApiError) {
        return sendCoreError(reply, error, "Falha ao atualizar tenant no plataforma-api");
      }

      request.log.error({ error }, "Falha ao atualizar configuracao do tenant");
      return reply.code(500).send({ message: "Falha ao atualizar configuracao do tenant" });
    }
  });
}
