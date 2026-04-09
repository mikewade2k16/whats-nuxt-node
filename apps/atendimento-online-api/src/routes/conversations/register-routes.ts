import type { FastifyInstance } from "fastify";
import { requireAtendimentoModuleAccess } from "../../lib/guards.js";
import { registerConversationCoreRoutes } from "./routes-core.js";
import { registerConversationMessageReadRoutes } from "./routes-message-read.js";
import { registerConversationGroupRoutes } from "./routes-group.js";
import { registerConversationMessageWriteRoutes } from "./routes-message-write.js";
import { registerConversationOperationalRoutes } from "./routes-operational.js";

export { mapConversation } from "./realtime.js";

export async function conversationRoutes(app: FastifyInstance) {
  app.register(async (protectedApp) => {
    protectedApp.addHook("preHandler", protectedApp.authenticate);
    protectedApp.addHook("preHandler", async (request, reply) => {
      const allowed = await requireAtendimentoModuleAccess(request, reply);
      if (!allowed) {
        return reply;
      }
    });

    registerConversationCoreRoutes(protectedApp);
    registerConversationMessageReadRoutes(protectedApp);
    registerConversationGroupRoutes(protectedApp);
    registerConversationMessageWriteRoutes(protectedApp);
    registerConversationOperationalRoutes(protectedApp);
  });
}
