import { MessageType } from "@prisma/client";
import type { IncomingWebhookPayload } from "../../shared.js";
import { parseIncomingMessage } from "../../message-parser.js";
import { mediaTypeLabel } from "../../media.js";

type ParsedIncomingMessageWithRemoteJid = ReturnType<typeof parseIncomingMessage> & {
  remoteJid: string;
};

interface MessageUpsertPreflightSuccess {
  ok: true;
  parsed: ParsedIncomingMessageWithRemoteJid;
  content: string;
}

interface MessageUpsertPreflightFailure {
  ok: false;
  response: {
    statusCode: 202;
    body: {
      message: string;
    };
  };
}

export type MessageUpsertPreflightResult =
  | MessageUpsertPreflightSuccess
  | MessageUpsertPreflightFailure;

export function runMessageUpsertPreflight(
  payload: IncomingWebhookPayload
): MessageUpsertPreflightResult {
  const parsed = parseIncomingMessage(payload);

  if (!parsed.remoteJid) {
    return {
      ok: false,
      response: {
        statusCode: 202,
        body: { message: "Webhook recebido sem identificador de contato" }
      }
    };
  }

  const normalizedText = parsed.text?.trim() ?? "";
  const content =
    normalizedText ||
    parsed.mediaCaption?.trim() ||
    mediaTypeLabel(parsed.messageType) ||
    parsed.unsupportedPlaceholder ||
    "";

  if (!content && parsed.messageType === MessageType.TEXT && !parsed.unsupportedType) {
    return {
      ok: false,
      response: {
        statusCode: 202,
        body: { message: "Webhook recebido sem conteudo suportado" }
      }
    };
  }

  return {
    ok: true,
    parsed: parsed as ParsedIncomingMessageWithRemoteJid,
    content
  };
}
