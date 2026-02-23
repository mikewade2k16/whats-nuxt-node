import type { FastifyReply, FastifyRequest } from "fastify";
import type { JwtUser } from "../plugins/auth.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser: JwtUser;
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

