import type { IncomingWebhookPayload } from "./webhook-contracts.js";
import { resolveIncomingMessageStructure } from "./message-parser-context.js";
import { resolveIncomingMessageState } from "./message-parser-state.js";

export * from "./message-parser-text.js";
export * from "./message-parser-media.js";
export * from "./message-parser-contact.js";
export * from "./message-parser-reply.js";
export * from "./message-parser-context.js";
export * from "./message-parser-state.js";

export function parseIncomingMessage(raw: IncomingWebhookPayload) {
  const structure = resolveIncomingMessageStructure(raw);
  return resolveIncomingMessageState(structure);
}
