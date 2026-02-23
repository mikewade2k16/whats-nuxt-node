import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAdmin } from "../lib/guards.js";

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(120),
  password: z.string().min(6).max(128),
  role: z.nativeEnum(UserRole).default(UserRole.AGENT)
});

const updateUserSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  role: z.nativeEnum(UserRole).optional(),
  password: z.string().min(6).max(128).optional()
});

export async function userRoutes(app: FastifyInstance) {
  app.register(async (protectedApp) => {
    protectedApp.addHook("preHandler", protectedApp.authenticate);

    protectedApp.get("/users", async (request) => {
      const users = await prisma.user.findMany({
        where: {
          tenantId: request.authUser.tenantId
        },
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

      return users;
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

      const { email, name, password, role } = parsed.data;
      const existing = await prisma.user.findUnique({
        where: {
          tenantId_email: {
            tenantId: request.authUser.tenantId,
            email
          }
        }
      });

      if (existing) {
        return reply.code(409).send({ message: "Email ja cadastrado neste tenant" });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: {
          tenantId: request.authUser.tenantId,
          email,
          name,
          role,
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

      return reply.code(201).send(user);
    });

    protectedApp.patch("/users/:userId", async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }

      const params = z.object({ userId: z.string().min(1) }).safeParse(request.params);
      const body = updateUserSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({ message: "Payload invalido" });
      }

      const targetUser = await prisma.user.findFirst({
        where: {
          id: params.data.userId,
          tenantId: request.authUser.tenantId
        }
      });

      if (!targetUser) {
        return reply.code(404).send({ message: "Usuario nao encontrado" });
      }

      if (body.data.role === UserRole.AGENT && targetUser.role === UserRole.ADMIN) {
        const adminCount = await prisma.user.count({
          where: {
            tenantId: request.authUser.tenantId,
            role: UserRole.ADMIN
          }
        });

        if (adminCount <= 1) {
          return reply.code(400).send({ message: "Nao e permitido remover o ultimo admin do tenant" });
        }
      }

      const data: Record<string, unknown> = {};
      if (body.data.name !== undefined) {
        data.name = body.data.name;
      }
      if (body.data.role !== undefined) {
        data.role = body.data.role;
      }
      if (body.data.password !== undefined) {
        data.passwordHash = await bcrypt.hash(body.data.password, 10);
      }

      const updated = await prisma.user.update({
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

      return updated;
    });
  });
}

