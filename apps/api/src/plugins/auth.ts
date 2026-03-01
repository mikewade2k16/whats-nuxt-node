import fastifyJwt from "@fastify/jwt";
import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "@prisma/client";
import { env } from "../config.js";

export interface JwtUser {
  sub: string;
  tenantId: string;
  tenantSlug: string;
  email: string;
  name: string;
  role: UserRole;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtUser;
    user: JwtUser;
  }
}

async function verifyAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await request.jwtVerify<JwtUser>();
    request.authUser = user;
  } catch (error) {
    request.log.warn({ error }, "JWT invalido");
    return reply.code(401).send({ message: "Nao autorizado" });
  }
}

export default fp(async (app) => {
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET
  });

  app.decorate("authenticate", verifyAuth);
});
