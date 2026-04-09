import type { FastifyReply, FastifyRequest } from "fastify";
import type { JwtUser } from "../plugins/auth.js";
import type { AuthTokenSource, CoreAuthAccessSnapshot } from "../services/auth-context.js";
import type { CoreAuthUser } from "../services/core-client.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser: JwtUser;
    authSource?: AuthTokenSource;
    coreAccessToken?: string | null;
    coreUser?: CoreAuthUser | null;
    coreAccess?: CoreAuthAccessSnapshot;
    coreTenantModuleCodes?: string[];
    correlationId: string;
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
