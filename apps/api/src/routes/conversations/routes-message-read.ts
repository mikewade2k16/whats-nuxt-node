import type { FastifyInstance } from "fastify";
import { registerConversationMessagesListRoute } from "./routes-message-read-list.js";
import { registerConversationMessageDetailRoute } from "./routes-message-read-single.js";
import { registerConversationMessageMediaRoute } from "./routes-message-read-media.js";

export function registerConversationMessageReadRoutes(protectedApp: FastifyInstance) {
  registerConversationMessagesListRoute(protectedApp);
  registerConversationMessageDetailRoute(protectedApp);
  registerConversationMessageMediaRoute(protectedApp);
}
