import type { FastifyReply, FastifyRequest } from "fastify";
import type { JwtUser } from "../plugins/auth.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser: JwtUser;
    correlationId: string;
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
