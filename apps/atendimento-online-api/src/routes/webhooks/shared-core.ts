export {
  MEDIA_MESSAGE_TYPES,
  normalizeAvatarUrl,
  normalizeMediaUrl,
  type MediaSourceKind,
  type ExtractMediaSourceResult,
  isLikelyEncryptedMediaUrl,
  sanitizeMediaUrlForRealtime,
  normalizeMediaBase64,
  extractMediaSourceFromPayload,
  parseOptionalInt,
  normalizePositiveInt,
  normalizeNonNegativeInt,
  mediaTypeLabel,
  resolveMediaExtensionByMime,
  sanitizeInboundMediaFileName,
  pickFirstAvatar,
  extractAvatarFromPayload,
  normalizeLinkPreviewUrl,
  extractFirstUrlFromText,
  normalizeLinkPreviewThumbnail,
  extractLinkPreviewMetadata
} from "./media.js";
export {
  toPrismaJsonValue,
  mergeMetadataJson
} from "./message-json.js";
export {
  parseIncomingMessage,
  unwrapMessagePayload,
  detectUnsupportedMessageType,
  extractStickerMetadata,
  extractQuotedReplyMetadata
} from "./message-parser.js";
export {
  hasMentionTargets,
  normalizeReactionEmoji,
  extractReactionEntries,
  summarizeReactionEntries,
  withMessageReactionMetadata,
  parseIncomingReaction,
  normalizeMentionJid,
  extractMentionedJids,
  enrichMentionMetadata
} from "./mentions.js";
export type {
  MessageReactionEntry,
  ParsedIncomingReaction
} from "./mentions.js";
export {
  parseFindContactsResponse,
  selectBestContactMatch,
  findContactByRemoteJid,
  extractPhone,
  extractProfilePictureFromApiResponse,
  sanitizeDirectConversationName,
  createEvolutionClient,
  type TenantUserNameCacheEntry,
  TENANT_USER_NAME_CACHE_TTL_MS,
  tenantUserNameCache,
  normalizeNameForComparison,
  isTenantUserDisplayName,
  resolveDirectConversationName,
  parsePhoneFromVcard,
  normalizeContactPhone,
  extractInboundContactMetadata
} from "./contacts.js";
export {
  buildFallbackGroupName,
  sanitizeGroupName,
  extractGroupNameFromPayload,
  extractGroupAvatarFromPayload,
  normalizeJidForCompare,
  isSameParticipant,
  collectRelatedParticipantRemoteJids,
  isWeakDisplayName,
  extractParticipantAvatarFromGroupInfo,
  extractParticipantNameFromGroupInfo,
  resolveGroupConversationName
} from "./groups.js";
export type {
  IncomingWebhookPayload,
  EvolutionContactMatch
} from "./webhook-contracts.js";
export {
  MESSAGE_CREATE_EVENTS,
  MESSAGE_UPDATE_EVENTS,
  normalizeEventName,
  parseEventName,
  extractInstanceName,
  normalizeQrDataUrl,
  extractQrCode,
  shouldValidateWebhookToken
} from "./webhook-metadata.js";
export { asRecord } from "./object-utils.js";
