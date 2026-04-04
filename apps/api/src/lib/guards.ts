import type { FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "@prisma/client";
import { resolveCoreAtendimentoAccessByEmail, resolveTenantHasAtendimentoModule } from "../services/core-atendimento-access.js";

export async function requirePlatformAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (!requireAdmin(request, reply)) {
    return false;
  }

  const access = await resolveCoreAtendimentoAccessByEmail(
    String(request.authUser?.email ?? "").trim().toLowerCase()
  );

  if (!access.isPlatformAdmin) {
    reply.code(403).send({ message: "Acesso exclusivo para administradores da plataforma" });
    return false;
  }

  return true;
}

function requireRoles(
  request: FastifyRequest,
  reply: FastifyReply,
  roles: UserRole[],
  message: string
) {
  if (!roles.includes(request.authUser.role)) {
    reply.code(403).send({ message });
    return false;
  }

  return true;
}

export function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  return requireRoles(
    request,
    reply,
    ["ADMIN"],
    "Permissao de administrador obrigatoria"
  );
}

export function requireAdminOrSupervisor(request: FastifyRequest, reply: FastifyReply) {
  return requireRoles(
    request,
    reply,
    ["ADMIN", "SUPERVISOR"],
    "Permissao de admin ou supervisor obrigatoria"
  );
}

export function requireConversationWrite(request: FastifyRequest, reply: FastifyReply) {
  return requireRoles(
    request,
    reply,
    ["ADMIN", "SUPERVISOR", "AGENT"],
    "Perfil sem permissao de escrita na inbox"
  );
}

export async function requireAtendimentoModuleAccess(request: FastifyRequest, reply: FastifyReply) {
  const email = String(request.authUser?.email ?? "").trim().toLowerCase();
  if (!email) {
    reply.code(401).send({ message: "Sessao invalida para acessar atendimento" });
    return false;
  }

  try {
    const tenantSlug = String(request.authUser?.tenantSlug ?? "").trim();
    if (tenantSlug) {
      const tenantHasModule = await resolveTenantHasAtendimentoModule(tenantSlug);
      if (!tenantHasModule) {
        reply.code(403).send({ message: "Cliente nao possui o modulo de atendimento ativo" });
        return false;
      }
    }

    const access = await resolveCoreAtendimentoAccessByEmail(email);
    const isSuperRoot = access.isPlatformAdmin
      && access.userType === "admin"
      && access.level === "admin";

    if (isSuperRoot || access.atendimentoAccess) {
      return true;
    }

    reply.code(403).send({ message: "Usuario sem acesso ao modulo atendimento" });
    return false;
  } catch (error) {
    request.log.error({ error, email }, "Falha ao validar acesso ao modulo atendimento");
    reply.code(502).send({ message: "Falha ao validar acesso ao modulo atendimento" });
    return false;
  }
}
