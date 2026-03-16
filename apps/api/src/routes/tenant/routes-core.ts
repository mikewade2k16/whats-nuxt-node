import type { FastifyInstance } from "fastify";
import { prisma } from "../../db.js";
import { requireAdmin } from "../../lib/guards.js";
import { CoreApiError, platformCoreClient } from "../../services/core-client.js";
import {
  mapTenantResponse,
  normalizeEvolutionApiKey,
  resolveConfiguredChannelCount
} from "./helpers.js";
import { updateTenantSchema } from "./schemas.js";
import { ensureTenantWhatsAppRegistry } from "../../services/whatsapp-instances.js";
import { resolveCoreAtendimentoAccessByEmail } from "../../services/core-atendimento-access.js";
import {
  resolveAdminClientByCoreTenantId,
  resolveAtendimentoSnapshot,
  resolveCurrentCoreTenant
} from "./atendimento-snapshot.js";

function sendCoreError(reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } }, error: CoreApiError, fallbackMessage: string) {
  return reply.code(error.statusCode >= 500 ? 502 : error.statusCode).send({
    message: error.message?.trim() || fallbackMessage,
    details: error.details ?? null
  });
}

export function registerTenantCoreRoutes(protectedApp: FastifyInstance) {
  protectedApp.get("/me", async (request, reply) => {
    const user = await prisma.user.findFirst({
      where: {
        id: request.authUser.sub,
        tenantId: request.authUser.tenantId
      },
      select: {
        id: true,
        tenantId: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      return reply.code(404).send({ message: "Usuario nao encontrado" });
    }

    return user;
  });

  protectedApp.get("/tenant", async (request, reply) => {
    try {
      const [tenant, localUsersCount] = await prisma.$transaction([
        prisma.tenant.findUnique({
          where: {
            id: request.authUser.tenantId
          },
          select: {
            id: true,
            slug: true,
            name: true,
            whatsappInstance: true,
            evolutionApiKey: true,
            maxChannels: true,
            maxUsers: true,
            retentionDays: true,
            maxUploadMb: true,
            createdAt: true,
            updatedAt: true
          }
        }),
        prisma.user.count({
          where: {
            tenantId: request.authUser.tenantId
          }
        })
      ]);

      if (!tenant) {
        return reply.code(404).send({ message: "Tenant nao encontrado" });
      }

      const coreTenant = await resolveCurrentCoreTenant({ slug: tenant.slug, name: tenant.name });
      if (!coreTenant) {
        return mapTenantResponse(tenant, localUsersCount, request.authUser.role);
      }

      const whatsappInstances = await ensureTenantWhatsAppRegistry({
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        whatsappInstance: tenant.whatsappInstance,
        evolutionApiKey: tenant.evolutionApiKey
      });

      const adminClient = await resolveAdminClientByCoreTenantId(coreTenant.id);
      const atendimentoSnapshot = await resolveAtendimentoSnapshot({
        coreTenantId: coreTenant.id,
        adminClient,
        fallbackMaxUsers: tenant.maxUsers,
        fallbackMaxChannels: tenant.maxChannels,
        fallbackCurrentUsers: localUsersCount
      });
      const access = await resolveCoreAtendimentoAccessByEmail(request.authUser.email);
      const canManageAtendimentoLimits = access.isPlatformAdmin
        && access.userType === "admin"
        && access.level === "admin";

      return mapTenantResponse(
        {
          ...tenant,
          whatsappInstances: whatsappInstances.map((entry) => ({
            id: entry.id,
            instanceName: entry.instanceName,
            displayName: entry.displayName,
            phoneNumber: entry.phoneNumber,
            queueLabel: entry.queueLabel ?? null,
            userScopePolicy: entry.userScopePolicy,
            responsibleUserId: entry.responsibleUserId ?? null,
            responsibleUserName: entry.responsibleUser?.name ?? null,
            responsibleUserEmail: entry.responsibleUser?.email ?? null,
            isDefault: entry.isDefault,
            isActive: entry.isActive,
            userIds: entry.userAccesses.map((access) => access.userId)
          })),
          maxChannels: atendimentoSnapshot.maxChannels,
          maxUsers: atendimentoSnapshot.maxUsers,
          canManageAtendimentoLimits
        },
        atendimentoSnapshot.currentUsers,
        request.authUser.role
      );
    } catch (error) {
      if (error instanceof CoreApiError) {
        return sendCoreError(reply, error, "Falha ao carregar tenant no platform-core");
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

    const evolutionApiKey = normalizeEvolutionApiKey(parsed.data.evolutionApiKey);

    try {
      const [currentTenant, localUsersCount] = await prisma.$transaction([
        prisma.tenant.findUnique({
          where: { id: request.authUser.tenantId },
          select: {
            id: true,
            slug: true,
            name: true,
            whatsappInstance: true,
            maxChannels: true,
            maxUsers: true,
            retentionDays: true,
            maxUploadMb: true
          }
        }),
        prisma.user.count({
          where: {
            tenantId: request.authUser.tenantId
          }
        })
      ]);

      if (!currentTenant) {
        return reply.code(404).send({ message: "Tenant nao encontrado" });
      }

      const coreTenant = await resolveCurrentCoreTenant({ slug: currentTenant.slug, name: currentTenant.name });
      if (!coreTenant) {
        return reply.code(404).send({ message: "Tenant nao encontrado no platform-core" });
      }

      const adminClient = await resolveAdminClientByCoreTenantId(coreTenant.id);
      const atendimentoSnapshot = await resolveAtendimentoSnapshot({
        coreTenantId: coreTenant.id,
        adminClient,
        fallbackMaxUsers: currentTenant.maxUsers,
        fallbackMaxChannels: currentTenant.maxChannels,
        fallbackCurrentUsers: localUsersCount
      });
      const access = await resolveCoreAtendimentoAccessByEmail(request.authUser.email);
      const canManageAtendimentoLimits = access.isPlatformAdmin
        && access.userType === "admin"
        && access.level === "admin";

      const whatsappInstances = await ensureTenantWhatsAppRegistry({
        id: currentTenant.id,
        slug: currentTenant.slug,
        name: currentTenant.name,
        whatsappInstance: currentTenant.whatsappInstance,
        evolutionApiKey: evolutionApiKey ?? null
      });
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
        await platformCoreClient.upsertModuleLimit(coreTenant.id, "atendimento", "users", {
          valueInt: nextMaxUsers,
          isUnlimited: false,
          source: "admin_panel",
          notes: "Atualizado pelo painel do modulo atendimento"
        });
      }

      if (canManageAtendimentoLimits && typeof parsed.data.maxChannels === "number") {
        await platformCoreClient.upsertModuleLimit(coreTenant.id, "atendimento", "instances", {
          valueInt: nextMaxChannels,
          isUnlimited: false,
          source: "admin_panel",
          notes: "Atualizado pelo painel do modulo atendimento"
        });
      }

      const updated = await prisma.tenant.update({
        where: { id: request.authUser.tenantId },
        data: {
          name: parsed.data.name,
          whatsappInstance: parsed.data.whatsappInstance,
          evolutionApiKey,
          maxChannels: nextMaxChannels,
          maxUsers: nextMaxUsers,
          retentionDays: nextRetentionDays,
          maxUploadMb: nextMaxUploadMb
        },
        select: {
          id: true,
          slug: true,
          name: true,
          whatsappInstance: true,
          evolutionApiKey: true,
          maxChannels: true,
          maxUsers: true,
          retentionDays: true,
          maxUploadMb: true,
          createdAt: true,
          updatedAt: true
        }
      });

      const updatedInstances = await ensureTenantWhatsAppRegistry({
        id: updated.id,
        slug: updated.slug,
        name: updated.name,
        whatsappInstance: updated.whatsappInstance,
        evolutionApiKey: updated.evolutionApiKey
      });

      return mapTenantResponse(
        {
          ...updated,
          whatsappInstances: updatedInstances.map((entry) => ({
            id: entry.id,
            instanceName: entry.instanceName,
            displayName: entry.displayName,
            phoneNumber: entry.phoneNumber,
            queueLabel: entry.queueLabel ?? null,
            userScopePolicy: entry.userScopePolicy,
            responsibleUserId: entry.responsibleUserId ?? null,
            responsibleUserName: entry.responsibleUser?.name ?? null,
            responsibleUserEmail: entry.responsibleUser?.email ?? null,
            isDefault: entry.isDefault,
            isActive: entry.isActive,
            userIds: entry.userAccesses.map((access) => access.userId)
          })),
          canManageAtendimentoLimits
        },
        atendimentoSnapshot.currentUsers,
        request.authUser.role
      );
    } catch (error) {
      if (error instanceof CoreApiError) {
        return sendCoreError(reply, error, "Falha ao atualizar tenant no platform-core");
      }

      request.log.error({ error }, "Falha ao atualizar configuracao do tenant");
      return reply.code(500).send({ message: "Falha ao atualizar configuracao do tenant" });
    }
  });
}
