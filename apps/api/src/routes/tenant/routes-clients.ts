import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../db.js";
import { requireAdmin } from "../../lib/guards.js";
import { mapTenantResponse } from "./tenant-response.js";
import { normalizeEvolutionApiKey } from "./tenant-evolution.js";

const createClientSchema = z.object({
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/).optional(),
  name: z.string().min(2).max(120),
  evolutionApiKey: z.string().max(255).optional(),
  maxChannels: z.coerce.number().int().min(1).max(50).default(1),
  maxUsers: z.coerce.number().int().min(1).max(500).default(2),
  retentionDays: z.coerce.number().int().min(1).max(3650).default(15),
  maxUploadMb: z.coerce.number().int().min(1).max(2048).default(500),
  adminName: z.string().min(2).max(120),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(6).max(128)
});

const updateClientSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  evolutionApiKey: z.string().max(255).optional(),
  maxChannels: z.coerce.number().int().min(1).max(50).optional(),
  maxUsers: z.coerce.number().int().min(1).max(500).optional(),
  retentionDays: z.coerce.number().int().min(1).max(3650).optional(),
  maxUploadMb: z.coerce.number().int().min(1).max(2048).optional()
});

const clientParamsSchema = z.object({
  clientId: z.string().min(1)
});

const clientUserParamsSchema = z.object({
  clientId: z.string().min(1),
  userId: z.string().min(1)
});

const createClientUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(120),
  password: z.string().min(6).max(128),
  role: z.nativeEnum(UserRole).default(UserRole.AGENT)
});

const updateClientUserSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  email: z.string().email().optional(),
  role: z.nativeEnum(UserRole).optional(),
  password: z.string().min(6).max(128).optional()
});

function slugifyClientName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function listTenantUserCounts() {
  const grouped = await prisma.user.groupBy({
    by: ["tenantId"],
    _count: {
      _all: true
    }
  });

  return new Map(grouped.map((entry) => [entry.tenantId, entry._count._all]));
}

export function registerClientRoutes(protectedApp: FastifyInstance) {
  protectedApp.get("/clients", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const [tenants, userCounts] = await Promise.all([
      prisma.tenant.findMany({
        orderBy: { createdAt: "asc" },
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
      listTenantUserCounts()
    ]);

    return tenants.map((tenant) =>
      mapTenantResponse(tenant, userCounts.get(tenant.id) ?? 0, request.authUser.role)
    );
  });

  protectedApp.post("/clients", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const parsed = createClientSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Payload invalido",
        errors: parsed.error.flatten()
      });
    }

    const nextSlug = (parsed.data.slug?.trim() || slugifyClientName(parsed.data.name)).slice(0, 80);
    if (!nextSlug) {
      return reply.code(400).send({ message: "Slug do cliente invalido" });
    }

    const [existingTenant, existingAdminEmail] = await Promise.all([
      prisma.tenant.findUnique({
        where: { slug: nextSlug },
        select: { id: true }
      }),
      prisma.user.findFirst({
        where: { email: parsed.data.adminEmail },
        select: { id: true, tenantId: true }
      })
    ]);

    if (existingTenant) {
      return reply.code(409).send({ message: "Slug de cliente ja cadastrado" });
    }

    if (existingAdminEmail) {
      return reply.code(409).send({ message: "Email do admin inicial ja esta em uso" });
    }

    const passwordHash = await bcrypt.hash(parsed.data.adminPassword, 10);
    const evolutionApiKey = normalizeEvolutionApiKey(parsed.data.evolutionApiKey);

    const created = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          slug: nextSlug,
          name: parsed.data.name,
          evolutionApiKey,
          maxChannels: parsed.data.maxChannels,
          maxUsers: parsed.data.maxUsers,
          retentionDays: parsed.data.retentionDays,
          maxUploadMb: parsed.data.maxUploadMb
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

      await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: parsed.data.adminEmail,
          name: parsed.data.adminName,
          role: UserRole.ADMIN,
          passwordHash
        }
      });

      return tenant;
    });

    return reply.code(201).send(mapTenantResponse(created, 1, request.authUser.role));
  });

  protectedApp.patch("/clients/:clientId", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const params = clientParamsSchema.safeParse(request.params);
    const body = updateClientSchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return reply.code(400).send({ message: "Payload invalido" });
    }

    const client = await prisma.tenant.findUnique({
      where: { id: params.data.clientId },
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

    if (!client) {
      return reply.code(404).send({ message: "Cliente nao encontrado" });
    }

    const currentUsers = await prisma.user.count({
      where: { tenantId: client.id }
    });

    const nextMaxUsers = body.data.maxUsers ?? client.maxUsers;
    if (nextMaxUsers < currentUsers) {
      return reply.code(409).send({
        message: "Limite de usuarios nao pode ficar abaixo do total atual do cliente.",
        details: {
          currentUsers,
          nextMaxUsers
        }
      });
    }

    const updated = await prisma.tenant.update({
      where: { id: client.id },
      data: {
        name: body.data.name,
        evolutionApiKey: normalizeEvolutionApiKey(body.data.evolutionApiKey),
        maxChannels: body.data.maxChannels,
        maxUsers: body.data.maxUsers,
        retentionDays: body.data.retentionDays,
        maxUploadMb: body.data.maxUploadMb
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

  protectedApp.delete("/clients/:clientId", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const params = clientParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Payload invalido" });
    }

    if (params.data.clientId === request.authUser.tenantId) {
      return reply.code(400).send({
        message: "Nao e permitido excluir o cliente atualmente autenticado."
      });
    }

    const client = await prisma.tenant.findUnique({
      where: { id: params.data.clientId },
      select: { id: true }
    });

    if (!client) {
      return reply.code(404).send({ message: "Cliente nao encontrado" });
    }

    await prisma.tenant.delete({
      where: { id: client.id }
    });

    return reply.code(204).send();
  });

  protectedApp.get("/clients/:clientId/users", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const params = clientParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Payload invalido" });
    }

    const client = await prisma.tenant.findUnique({
      where: { id: params.data.clientId },
      select: { id: true }
    });

    if (!client) {
      return reply.code(404).send({ message: "Cliente nao encontrado" });
    }

    return prisma.user.findMany({
      where: { tenantId: client.id },
      orderBy: { createdAt: "asc" },
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

    const client = await prisma.tenant.findUnique({
      where: { id: params.data.clientId },
      select: {
        id: true,
        maxUsers: true
      }
    });

    if (!client) {
      return reply.code(404).send({ message: "Cliente nao encontrado" });
    }

    const [existing, currentUsers] = await prisma.$transaction([
      prisma.user.findUnique({
        where: {
          tenantId_email: {
            tenantId: client.id,
            email: body.data.email
          }
        },
        select: { id: true }
      }),
      prisma.user.count({
        where: {
          tenantId: client.id
        }
      })
    ]);

    if (existing) {
      return reply.code(409).send({ message: "Email ja cadastrado neste cliente" });
    }

    if (currentUsers >= client.maxUsers) {
      return reply.code(409).send({
        message: "Limite de usuarios do plano atingido para este cliente.",
        details: {
          maxUsers: client.maxUsers,
          currentUsers
        }
      });
    }

    const passwordHash = await bcrypt.hash(body.data.password, 10);
    const createdUser = await prisma.user.create({
      data: {
        tenantId: client.id,
        email: body.data.email,
        name: body.data.name,
        role: body.data.role,
        passwordHash
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

    return reply.code(201).send(createdUser);
  });

  protectedApp.patch("/clients/:clientId/users/:userId", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const params = clientUserParamsSchema.safeParse(request.params);
    const body = updateClientUserSchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return reply.code(400).send({ message: "Payload invalido" });
    }

    const targetUser = await prisma.user.findFirst({
      where: {
        id: params.data.userId,
        tenantId: params.data.clientId
      },
      select: {
        id: true,
        tenantId: true,
        email: true,
        role: true
      }
    });

    if (!targetUser) {
      return reply.code(404).send({ message: "Usuario nao encontrado" });
    }

    if (body.data.role !== undefined && body.data.role !== UserRole.ADMIN && targetUser.role === UserRole.ADMIN) {
      const adminCount = await prisma.user.count({
        where: {
          tenantId: targetUser.tenantId,
          role: UserRole.ADMIN
        }
      });

      if (adminCount <= 1) {
        return reply.code(400).send({ message: "Nao e permitido remover o ultimo admin do cliente" });
      }
    }

    if (body.data.email !== undefined && body.data.email !== targetUser.email) {
      const existing = await prisma.user.findUnique({
        where: {
          tenantId_email: {
            tenantId: targetUser.tenantId,
            email: body.data.email
          }
        },
        select: { id: true }
      });

      if (existing && existing.id !== targetUser.id) {
        return reply.code(409).send({ message: "Email ja cadastrado neste cliente" });
      }
    }

    const data: Record<string, unknown> = {};
    if (body.data.name !== undefined) {
      data.name = body.data.name;
    }
    if (body.data.email !== undefined) {
      data.email = body.data.email;
    }
    if (body.data.role !== undefined) {
      data.role = body.data.role;
    }
    if (body.data.password !== undefined) {
      data.passwordHash = await bcrypt.hash(body.data.password, 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id: targetUser.id },
      data,
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

    return updatedUser;
  });

  protectedApp.delete("/clients/:clientId/users/:userId", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const params = clientUserParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Payload invalido" });
    }

    const targetUser = await prisma.user.findFirst({
      where: {
        id: params.data.userId,
        tenantId: params.data.clientId
      },
      select: {
        id: true,
        role: true
      }
    });

    if (!targetUser) {
      return reply.code(404).send({ message: "Usuario nao encontrado" });
    }

    if (targetUser.id === request.authUser.sub) {
      return reply.code(400).send({ message: "Nao e permitido excluir o usuario autenticado." });
    }

    if (targetUser.role === UserRole.ADMIN) {
      const adminCount = await prisma.user.count({
        where: {
          tenantId: params.data.clientId,
          role: UserRole.ADMIN
        }
      });

      if (adminCount <= 1) {
        return reply.code(400).send({ message: "Nao e permitido remover o ultimo admin do cliente" });
      }
    }

    await prisma.user.delete({
      where: { id: targetUser.id }
    });

    return reply.code(204).send();
  });
}
