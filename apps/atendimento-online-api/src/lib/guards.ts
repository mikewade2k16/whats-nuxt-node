import type { FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "../domain/access.js";
import {
  canAccessAtendimentoModule,
  isPlatformSuperRoot
} from "../services/auth-context.js";
import { env } from "../config.js";

export async function requirePlatformAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (!requireAdmin(request, reply)) {
    return false;
  }

  if (!isPlatformSuperRoot(request.coreAccess)) {
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

  const tenantModuleCodes = Array.isArray(request.coreTenantModuleCodes)
    ? request.coreTenantModuleCodes
    : [];
  if (
    tenantModuleCodes.length > 0 &&
    !tenantModuleCodes.includes(env.CORE_ATENDIMENTO_MODULE_CODE.trim().toLowerCase())
  ) {
    reply.code(403).send({ message: "Cliente nao possui o modulo de atendimento ativo" });
    return false;
  }

  if (canAccessAtendimentoModule(request.coreAccess)) {
    return true;
  }

  reply.code(403).send({ message: "Usuario sem acesso ao modulo atendimento" });
  return false;
}
