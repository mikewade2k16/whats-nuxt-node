import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import type { JwtUser } from "../plugins/auth.js";

const loginSchema = z.object({
  tenantSlug: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6)
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Payload invalido",
        errors: parsed.error.flatten()
      });
    }

    const { tenantSlug, email, password } = parsed.data;

    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug }
    });

    if (!tenant) {
      return reply.code(401).send({ message: "Credenciais invalidas" });
    }

    const user = await prisma.user.findUnique({
      where: {
        tenantId_email: {
          tenantId: tenant.id,
          email
        }
      }
    });

    if (!user) {
      return reply.code(401).send({ message: "Credenciais invalidas" });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return reply.code(401).send({ message: "Credenciais invalidas" });
    }

    const payload: JwtUser = {
      sub: user.id,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      email: user.email,
      name: user.name,
      role: user.role
    };

    const token = app.jwt.sign(payload, {
      expiresIn: "12h"
    });

    return {
      token,
      user: {
        id: user.id,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        email: user.email,
        name: user.name,
        role: user.role
      }
    };
  });
}

