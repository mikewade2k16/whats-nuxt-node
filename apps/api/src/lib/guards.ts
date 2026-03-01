import type { FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "@prisma/client";

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
