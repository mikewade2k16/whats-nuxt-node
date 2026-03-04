import type { FastifyInstance } from "fastify";
import { registerConversationReactionRoute } from "./routes-operational-reaction.js";
import { registerConversationReprocessRoute } from "./routes-operational-reprocess.js";
import { registerConversationReprocessFailedRoute } from "./routes-operational-reprocess-failed.js";
import { registerConversationAssignRoute } from "./routes-operational-assign.js";
import { registerConversationStatusRoute } from "./routes-operational-status.js";

export function registerConversationOperationalRoutes(protectedApp: FastifyInstance) {
  registerConversationReactionRoute(protectedApp);
  registerConversationReprocessRoute(protectedApp);
  registerConversationReprocessFailedRoute(protectedApp);
  registerConversationAssignRoute(protectedApp);
  registerConversationStatusRoute(protectedApp);
}
