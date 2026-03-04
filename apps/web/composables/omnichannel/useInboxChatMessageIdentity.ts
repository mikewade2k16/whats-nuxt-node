import { computed } from "vue";
import type { Conversation, GroupParticipant, Message } from "~/types";

type GroupAvatarLookup = {
  byJid: Map<string, string>;
  byDigits: Map<string, string>;
  byName: Map<string, string>;
};

export function useInboxChatMessageIdentity(options: {
  getActiveConversation: () => Conversation | null;
  getCurrentUserId: () => string | null;
  getIsGroupConversation: () => boolean;
  getGroupParticipants: () => GroupParticipant[];
  getMessageRenderItems: () => Array<{ kind: string; message?: Message }>;
  asRecord: (value: unknown) => Record<string, unknown> | null;
  normalizeDigits: (value: string) => string;
  normalizeJidForComparison: (value: string) => string;
  normalizeNameForComparison: (value: string) => string;
}) {
  function resolveMessageParticipantJid(messageEntry: Message) {
    const metadata = options.asRecord(messageEntry.metadataJson);
    if (!metadata) {
      return null;
    }

    const participantJid = metadata.participantJid;
    if (typeof participantJid === "string" && participantJid.trim().length > 0) {
      return participantJid.trim();
    }

    return null;
  }

  const groupAvatarLookup = computed<GroupAvatarLookup>(() => {
    const byJid = new Map<string, string>();
    const byDigits = new Map<string, string>();
    const byName = new Map<string, string>();

    const registerAvatar = (params: { jid?: string | null; phone?: string | null; name?: string | null; avatarUrl?: string | null }) => {
      const avatarUrl = params.avatarUrl?.trim();
      if (!avatarUrl) {
        return;
      }

      const normalizedJid = options.normalizeJidForComparison(params.jid || "");
      if (normalizedJid) {
        byJid.set(normalizedJid, avatarUrl);
        const jidDigits = options.normalizeDigits(normalizedJid);
        if (jidDigits) {
          byDigits.set(jidDigits, avatarUrl);
        }
      }

      const phoneDigits = options.normalizeDigits(params.phone || "");
      if (phoneDigits) {
        byDigits.set(phoneDigits, avatarUrl);
      }

      const normalizedName = options.normalizeNameForComparison(params.name || "");
      if (normalizedName) {
        byName.set(normalizedName, avatarUrl);
      }
    };

    for (const participant of options.getGroupParticipants()) {
      registerAvatar({
        jid: participant.jid,
        phone: participant.phone,
        name: participant.name,
        avatarUrl: participant.avatarUrl
      });
    }

    for (const item of options.getMessageRenderItems()) {
      if (item.kind !== "message" || !item.message) {
        continue;
      }

      registerAvatar({
        jid: resolveMessageParticipantJid(item.message),
        name: item.message.senderName,
        avatarUrl: item.message.senderAvatarUrl
      });
    }

    return { byJid, byDigits, byName };
  });

  function findAvatarByDigits(digits: string) {
    if (!digits) {
      return null;
    }

    const direct = groupAvatarLookup.value.byDigits.get(digits);
    if (direct) {
      return direct;
    }

    for (const [candidateDigits, avatarUrl] of groupAvatarLookup.value.byDigits.entries()) {
      if (candidateDigits.endsWith(digits) || digits.endsWith(candidateDigits)) {
        return avatarUrl;
      }
    }

    return null;
  }

  function resolveMatchedGroupParticipant(messageEntry: Message) {
    if (!options.getIsGroupConversation()) {
      return null;
    }

    const participantJid = resolveMessageParticipantJid(messageEntry);
    const normalizedParticipantJid = options.normalizeJidForComparison(participantJid || "");
    if (normalizedParticipantJid) {
      for (const participant of options.getGroupParticipants()) {
        const candidateJid = options.normalizeJidForComparison(participant.jid || "");
        if (!candidateJid) {
          continue;
        }

        if (
          candidateJid === normalizedParticipantJid ||
          candidateJid.endsWith(normalizedParticipantJid) ||
          normalizedParticipantJid.endsWith(candidateJid)
        ) {
          return participant;
        }
      }
    }

    const participantDigits = options.normalizeDigits(participantJid || "");
    if (participantDigits) {
      for (const participant of options.getGroupParticipants()) {
        const candidateDigits = [
          options.normalizeDigits(participant.phone || ""),
          options.normalizeDigits(participant.jid || "")
        ].filter((entry) => entry.length > 0);

        if (
          candidateDigits.some((candidate) =>
            candidate === participantDigits ||
            candidate.endsWith(participantDigits) ||
            participantDigits.endsWith(candidate)
          )
        ) {
          return participant;
        }
      }
    }

    const normalizedSenderName = options.normalizeNameForComparison(messageEntry.senderName || "");
    if (!normalizedSenderName) {
      return null;
    }

    for (const participant of options.getGroupParticipants()) {
      const candidateName = options.normalizeNameForComparison(participant.name || "");
      if (!candidateName) {
        continue;
      }

      if (
        candidateName === normalizedSenderName ||
        candidateName.includes(normalizedSenderName) ||
        normalizedSenderName.includes(candidateName)
      ) {
        return participant;
      }
    }

    return null;
  }

  function resolveMessageAuthor(messageEntry: Message) {
    if (messageEntry.direction === "OUTBOUND") {
      return messageEntry.senderName?.trim() || "Voce";
    }

    if (options.getIsGroupConversation()) {
      const matchedParticipant = resolveMatchedGroupParticipant(messageEntry);
      const matchedParticipantName = matchedParticipant?.name?.trim();
      if (matchedParticipantName) {
        return matchedParticipantName;
      }

      const matchedParticipantPhone = options.normalizeDigits(matchedParticipant?.phone || matchedParticipant?.jid || "");
      if (matchedParticipantPhone) {
        return matchedParticipantPhone;
      }

      const senderName = messageEntry.senderName?.trim();
      if (senderName) {
        return senderName;
      }

      const participantDigits = options.normalizeDigits(resolveMessageParticipantJid(messageEntry) || "");
      if (participantDigits) {
        return participantDigits;
      }
    }

    return messageEntry.senderName?.trim() || "Participante";
  }

  function resolveOutboundOperatorLabel(messageEntry: Message) {
    if (messageEntry.direction !== "OUTBOUND") {
      return "";
    }

    if (!messageEntry.senderUserId) {
      return "";
    }

    const senderName = messageEntry.senderName?.trim();
    if (!senderName) {
      return "Atendente";
    }

    if (options.getCurrentUserId() && messageEntry.senderUserId === options.getCurrentUserId()) {
      return "Voce";
    }

    return senderName;
  }

  function resolveGroupParticipantAvatar(messageEntry: Message) {
    if (!options.getIsGroupConversation()) {
      return undefined;
    }

    const participantJid = resolveMessageParticipantJid(messageEntry);
    const normalizedParticipantJid = options.normalizeJidForComparison(participantJid || "");
    if (normalizedParticipantJid) {
      const byJid = groupAvatarLookup.value.byJid.get(normalizedParticipantJid);
      if (byJid) {
        return byJid;
      }
    }

    const participantDigitsCandidates = [
      options.normalizeDigits(participantJid || ""),
      options.normalizeDigits(messageEntry.senderName || "")
    ].filter((entry) => entry.length > 0);

    for (const digits of participantDigitsCandidates) {
      const byDigits = findAvatarByDigits(digits);
      if (byDigits) {
        return byDigits;
      }
    }

    const normalizedSenderName = options.normalizeNameForComparison(messageEntry.senderName || "");
    if (normalizedSenderName) {
      const directByName = groupAvatarLookup.value.byName.get(normalizedSenderName);
      if (directByName) {
        return directByName;
      }

      for (const [candidateName, avatarUrl] of groupAvatarLookup.value.byName.entries()) {
        if (!candidateName) {
          continue;
        }

        if (
          candidateName === normalizedSenderName ||
          candidateName.includes(normalizedSenderName) ||
          normalizedSenderName.includes(candidateName)
        ) {
          return avatarUrl;
        }
      }
    }

    return undefined;
  }

  function resolveMessageAvatarUrl(messageEntry: Message) {
    const fromMessage = messageEntry.senderAvatarUrl?.trim();
    if (fromMessage) {
      return fromMessage;
    }

    const fromGroupParticipants = resolveGroupParticipantAvatar(messageEntry);
    if (fromGroupParticipants) {
      return fromGroupParticipants;
    }

    const activeConversation = options.getActiveConversation();
    if (!activeConversation || options.getIsGroupConversation()) {
      return undefined;
    }

    if (messageEntry.direction === "INBOUND") {
      return activeConversation.contactAvatarUrl || undefined;
    }

    return undefined;
  }

  function resolveAudioAvatarUrl(messageEntry: Message) {
    return resolveMessageAvatarUrl(messageEntry);
  }

  function messageRowId(messageId: string) {
    return `chat-message-${messageId}`;
  }

  return {
    resolveMessageParticipantJid,
    resolveMatchedGroupParticipant,
    resolveMessageAuthor,
    resolveOutboundOperatorLabel,
    resolveMessageAvatarUrl,
    resolveAudioAvatarUrl,
    messageRowId
  };
}
