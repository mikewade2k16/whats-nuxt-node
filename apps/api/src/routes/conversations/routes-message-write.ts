import type { FastifyInstance } from "fastify";
import { registerConversationSendMessageRoute } from "./routes-message-write-send.js";
import { registerConversationDeleteForMeRoute } from "./routes-message-write-delete-for-me.js";
import { registerConversationDeleteForAllRoute } from "./routes-message-write-delete-for-all.js";
import { registerConversationForwardMessagesRoute } from "./routes-message-write-forward.js";

export function registerConversationMessageWriteRoutes(protectedApp: FastifyInstance) {
  registerConversationSendMessageRoute(protectedApp);
  registerConversationDeleteForMeRoute(protectedApp);
  registerConversationDeleteForAllRoute(protectedApp);
  registerConversationForwardMessagesRoute(protectedApp);
}
