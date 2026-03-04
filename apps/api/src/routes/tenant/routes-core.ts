import type { FastifyInstance } from "fastify";
import { prisma } from "../../db.js";
import { requireAdmin } from "../../lib/guards.js";
import {
  mapTenantResponse,
  normalizeEvolutionApiKey,
  resolveConfiguredChannelCount
} from "./helpers.js";
import { updateTenantSchema } from "./schemas.js";

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
    const [tenant, currentUsers] = await prisma.$transaction([
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

    return mapTenantResponse(tenant, currentUsers, request.authUser.role);
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
    const [currentTenant, currentUsers] = await prisma.$transaction([
      prisma.tenant.findUnique({
        where: { id: request.authUser.tenantId },
        select: {
          id: true,
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

    const currentChannels = resolveConfiguredChannelCount(currentTenant.whatsappInstance);
    const nextMaxUsers = parsed.data.maxUsers ?? currentTenant.maxUsers;
    const nextMaxChannels = parsed.data.maxChannels ?? currentTenant.maxChannels;
    const nextRetentionDays = parsed.data.retentionDays ?? currentTenant.retentionDays;
    const nextMaxUploadMb = parsed.data.maxUploadMb ?? currentTenant.maxUploadMb;

    if (nextMaxUsers < currentUsers) {
      return reply.code(409).send({
        message: "Limite de usuarios nao pode ficar abaixo do total atual do tenant.",
        details: {
          currentUsers,
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

    return mapTenantResponse(updated, currentUsers, request.authUser.role);
  });
}
