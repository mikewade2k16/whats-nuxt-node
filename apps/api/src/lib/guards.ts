import type { FastifyReply, FastifyRequest } from "fastify";

export function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (request.authUser.role !== "ADMIN") {
    reply.code(403).send({ message: "Permissao de administrador obrigatoria" });
    return false;
  }
  return true;
}

