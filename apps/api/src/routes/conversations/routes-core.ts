import type { FastifyInstance } from "fastify";
import { registerConversationListRoute } from "./routes-core-list.js";
import { registerConversationSandboxRoute } from "./routes-core-sandbox.js";
import { registerConversationCreateRoute } from "./routes-core-create.js";
import { registerConversationSyncOpenWhatsAppRoute } from "./routes-core-sync-open.js";

export function registerConversationCoreRoutes(protectedApp: FastifyInstance) {
  registerConversationListRoute(protectedApp);
  registerConversationSandboxRoute(protectedApp);
  registerConversationCreateRoute(protectedApp);
  registerConversationSyncOpenWhatsAppRoute(protectedApp);
}
