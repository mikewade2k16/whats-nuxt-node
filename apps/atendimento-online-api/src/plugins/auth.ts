import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "../domain/access.js";
import {
  AuthContextError,
  extractRequestedClientId,
  extractRequestedTenantSlug,
  extractRequestAccessToken,
  resolveAuthContextFromAccessToken
} from "../services/auth-context.js";

export interface JwtUser {
  sub: string;
  tenantId: string;
  coreUserId: string;
  coreTenantId: string;
  coreTenantUserId: string | null;
  tenantSlug: string;
  email: string;
  name: string;
  role: UserRole;
}

async function verifyAuth(request: FastifyRequest, reply: FastifyReply) {
  const accessToken = extractRequestAccessToken(request);
  if (!accessToken) {
    return reply.code(401).send({ message: "Nao autorizado" });
  }

  try {
    const requestedTenantSlug = extractRequestedTenantSlug(request);
    const requestedClientId = extractRequestedClientId(request);
    const resolved = await resolveAuthContextFromAccessToken(accessToken, {
      requestedTenantSlug: requestedTenantSlug || undefined,
      requestedClientId: requestedClientId || undefined
    });
    request.authUser = resolved.authUser;
    request.authSource = resolved.source;
    request.coreAccessToken = resolved.coreAccessToken;
    request.coreUser = resolved.coreUser;
    request.coreAccess = resolved.coreAccess;
    request.coreTenantModuleCodes = resolved.tenantModuleCodes;
  } catch (error) {
    const authError = error instanceof AuthContextError
      ? error
      : new AuthContextError("Nao autorizado", 401, null);
    const logPayload = {
      error,
      statusCode: authError.statusCode
    };

    if (authError.statusCode >= 500) {
      request.log.error(logPayload, "Falha ao validar sessao");
    } else {
      request.log.warn(logPayload, "Falha ao validar sessao");
    }

    return reply.code(authError.statusCode).send({
      message: authError.message
    });
  }
}

export default fp(async (app) => {
  app.decorate("authenticate", verifyAuth);
});
