import axios from "axios";
import { env } from "../../config.js";

type SendTextMessageParams = {
  textUrl: string;
  contactUrl?: string | null;
  recipient: string;
  content: string;
  apiKey: string | null | undefined;
  metadataJson?: unknown;
  conversationExternalId?: string | null;
};

interface OutboundContactCard {
  name: string;
  phone: string | null;
  vcard: string | null;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function normalizeComparableText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeJid(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.includes("@")) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) {
    return null;
  }

  return `${digits}@s.whatsapp.net`;
}

function normalizeLinkUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const candidate = trimmed.startsWith("www.") ? `https://${trimmed}` : trimmed;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function hasUrlInText(value: string) {
  const match = value.match(/(?:https?:\/\/|www\.)[^\s<>"']+/i);
  if (!match) {
    return false;
  }

  const candidate = match[0].replace(/[),.!?;:]+$/g, "");
  return Boolean(normalizeLinkUrl(candidate));
}

function extractMentions(metadataJson: unknown) {
  const metadata = asRecord(metadataJson);
  const mentions = metadata ? asRecord(metadata.mentions) : null;
  if (!mentions) {
    return null;
  }

  const everyOne = Boolean(mentions.everyOne);

  const values = Array.isArray(mentions.mentioned) ? mentions.mentioned : [];
  const normalized = [
    ...new Set(
      values
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => normalizeJid(entry))
        .filter((entry): entry is string => Boolean(entry))
    )
  ];

  if (!everyOne && normalized.length === 0) {
    return null;
  }

  return {
    everyOne,
    mentioned: normalized
  };
}

function extractQuoted(metadataJson: unknown, remoteJid: string | null) {
  const metadata = asRecord(metadataJson);
  const reply = metadata ? asRecord(metadata.reply) : null;
  if (!reply) {
    return null;
  }

  const stanzaId = typeof reply.messageId === "string" ? reply.messageId.trim() : "";
  if (!stanzaId) {
    return null;
  }

  const replyContent = typeof reply.content === "string" ? reply.content.trim() : "";
  const authorJidRaw = typeof reply.authorJid === "string" ? reply.authorJid : "";
  const participant = normalizeJid(authorJidRaw) ?? undefined;
  const author = typeof reply.author === "string" ? normalizeComparableText(reply.author) : "";
  const fromMe = author === "voce" || author === "you";

  if (!remoteJid) {
    return null;
  }

  return {
    key: {
      remoteJid,
      fromMe,
      id: stanzaId,
      participant
    },
    message: {
      conversation: replyContent || "Mensagem anterior"
    }
  };
}

function resolveLinkPreviewEnabled(metadataJson: unknown, content: string) {
  const metadata = asRecord(metadataJson);
  const linkPreview = metadata ? asRecord(metadata.linkPreview) : null;
  const explicitValue = linkPreview?.enabled;

  if (typeof explicitValue === "boolean") {
    return explicitValue;
  }

  return hasUrlInText(content);
}

function extractOutboundContactCard(metadataJson: unknown): OutboundContactCard | null {
  const metadata = asRecord(metadataJson);
  const contact = metadata ? asRecord(metadata.contact) : null;
  if (!contact) {
    return null;
  }

  const name = typeof contact.name === "string" ? contact.name.trim() : "";
  const phone =
    typeof contact.phone === "string" ? contact.phone.trim().replace(/[^\d+]/g, "") : "";
  const vcard = typeof contact.vcard === "string" ? contact.vcard.trim() : "";

  if (!name && !phone && !vcard) {
    return null;
  }

  return {
    name: name || phone || "Contato",
    phone: phone || null,
    vcard: vcard || null
  };
}

function buildContactPayload(contact: OutboundContactCard, recipient: string) {
  const phoneNumber = contact.phone ?? "";
  const fullName = contact.name || phoneNumber || "Contato";

  const contactEntry: Record<string, unknown> = {
    fullName,
    phoneNumber,
    number: phoneNumber,
    displayName: fullName
  };

  if (contact.vcard) {
    contactEntry.vcard = contact.vcard;
  }

  return {
    number: recipient,
    phone: phoneNumber,
    fullName,
    contact: contactEntry,
    contacts: [contactEntry]
  };
}

export async function sendTextMessage(params: SendTextMessageParams) {
  const requestConfig = {
    headers: params.apiKey
      ? {
          apikey: params.apiKey
        }
      : undefined,
    timeout: env.EVOLUTION_REQUEST_TIMEOUT_MS
  };

  const remoteJid = params.conversationExternalId?.trim() || null;
  const mentions = extractMentions(params.metadataJson);
  const quoted = extractQuoted(params.metadataJson, remoteJid);
  const linkPreviewEnabled = resolveLinkPreviewEnabled(params.metadataJson, params.content);
  const contactCard = extractOutboundContactCard(params.metadataJson);

  if (contactCard) {
    if (!params.contactUrl) {
      throw new Error("EVOLUTION_SEND_CONTACT_PATH nao configurado para envio nativo de contato");
    }

    const contactResponse = await axios.post(
      params.contactUrl,
      buildContactPayload(contactCard, params.recipient),
      requestConfig
    );
    return contactResponse.data;
  }

  const payload: Record<string, unknown> = {
    number: params.recipient,
    text: params.content,
    textMessage: {
      text: params.content
    }
  };

  if (mentions) {
    payload.mentionsEveryOne = mentions.everyOne;
    payload.mentioned = mentions.mentioned;
  }

  if (quoted) {
    payload.quoted = quoted;
  }

  if (linkPreviewEnabled) {
    payload.linkPreview = true;
  }

  const response = await axios.post(params.textUrl, payload, requestConfig);

  return response.data;
}
