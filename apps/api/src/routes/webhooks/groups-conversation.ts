import { extractPhone } from "./participant-identity.js";
import {
  buildFallbackGroupName,
  extractGroupNameFromPayload,
  sanitizeGroupName
} from "./groups-payload.js";

export async function resolveGroupConversationName(params: {
  incomingGroupName: string | null;
  existingConversationName: string | null;
  remoteJid: string;
  groupInfo: Record<string, unknown> | null;
  senderName: string | null;
  participantJid: string | null;
}) {
  const fromIncoming = sanitizeGroupName(params.incomingGroupName);
  if (fromIncoming) {
    return fromIncoming;
  }

  const fromApi = params.groupInfo ? extractGroupNameFromPayload(params.groupInfo) : null;
  if (fromApi) {
    return fromApi;
  }

  const fromExisting = sanitizeGroupName(params.existingConversationName);
  if (fromExisting) {
    const sender = params.senderName?.trim().toLowerCase() ?? null;
    const existing = fromExisting.trim().toLowerCase();
    const participantPhone = params.participantJid ? extractPhone(params.participantJid) : null;
    const existingPhone = extractPhone(fromExisting);

    const looksLikeParticipantName = Boolean(sender && existing === sender);
    const looksLikeParticipantPhone = Boolean(
      participantPhone &&
      existingPhone &&
      participantPhone.length >= 7 &&
      existingPhone === participantPhone
    );

    if (!looksLikeParticipantName && !looksLikeParticipantPhone) {
      return fromExisting;
    }
  }

  return buildFallbackGroupName(params.remoteJid);
}
