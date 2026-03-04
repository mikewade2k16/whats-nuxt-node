export type UserRole = "ADMIN" | "SUPERVISOR" | "AGENT" | "VIEWER";

export interface AuthUser {
  id: string;
  tenantId: string;
  tenantSlug: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface TenantSettings {
  id: string;
  slug: string;
  name: string;
  whatsappInstance: string | null;
  maxChannels: number;
  maxUsers: number;
  retentionDays: number;
  maxUploadMb: number;
  currentChannels: number;
  currentUsers: number;
  hasEvolutionApiKey: boolean;
  webhookUrl: string;
  createdAt: string;
  updatedAt: string;
  canViewSensitive: boolean;
  evolutionApiKey: string | null;
}

export interface ClientRecord extends TenantSettings {}

export interface TenantUser {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export type MessageDirection = "INBOUND" | "OUTBOUND";
export type MessageStatus = "PENDING" | "SENT" | "FAILED";
export type MessageType = "TEXT" | "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT";
export type ConversationStatus = "OPEN" | "PENDING" | "CLOSED";

export interface Message {
  id: string;
  tenantId: string;
  conversationId: string;
  senderUserId?: string | null;
  direction: MessageDirection;
  messageType?: MessageType;
  senderName: string | null;
  senderAvatarUrl: string | null;
  content: string;
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  mediaFileName?: string | null;
  mediaFileSizeBytes?: number | null;
  mediaCaption?: string | null;
  mediaDurationSeconds?: number | null;
  metadataJson?: Record<string, unknown> | null;
  status: MessageStatus;
  externalMessageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroupParticipant {
  jid: string;
  name: string;
  phone: string;
  avatarUrl: string | null;
}

export interface SavedSticker {
  id: string;
  name: string;
  dataUrl: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  createdByUserId?: string | null;
}

export interface Contact {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  avatarUrl: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
  lastConversationId: string | null;
  lastConversationAt: string | null;
  lastConversationChannel: "WHATSAPP" | "INSTAGRAM" | null;
  lastConversationStatus: ConversationStatus | null;
}

export interface Conversation {
  id: string;
  channel: "WHATSAPP" | "INSTAGRAM";
  status: ConversationStatus;
  externalId: string;
  contactId?: string | null;
  contactName: string | null;
  contactAvatarUrl: string | null;
  contactPhone: string | null;
  assignedToId: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  lastMessage: {
    id: string;
    content: string;
    messageType?: MessageType;
    mediaUrl?: string | null;
    direction: MessageDirection;
    status: MessageStatus;
    createdAt: string;
  } | null;
}

export interface WhatsAppStatusResponse {
  configured: boolean;
  message?: string;
  instanceName?: string;
  webhookUrl?: string;
  connectionState?: Record<string, unknown>;
  webhook?: Record<string, unknown>;
}

export interface WhatsAppBootstrapResponse {
  success: boolean;
  instanceName: string;
  webhookUrl?: string;
  created?: boolean;
  createResult?: Record<string, unknown> | null;
  webhookResult?: Record<string, unknown>;
  connectResult?: Record<string, unknown>;
  mode?: "QRCODE" | "PAIRING_CODE";
  connectionState?: Record<string, unknown>;
}

export interface WhatsAppQrCodeResponse {
  configured: boolean;
  message?: string;
  instanceName?: string;
  qrCode?: string | null;
  pairingCode?: string | null;
  source?: string;
  connectionState?: Record<string, unknown>;
}

export type WhatsAppEndpointValidationStatus =
  | "ok"
  | "validation_error"
  | "missing_route"
  | "auth_error"
  | "provider_error"
  | "network_error"
  | "unexpected_error";

export interface WhatsAppEndpointValidationEntry {
  key: "text" | "media" | "audio" | "contact" | "sticker" | "reaction";
  label: string;
  pathTemplate: string;
  resolvedPath: string | null;
  status: WhatsAppEndpointValidationStatus;
  available: boolean;
  httpStatus: number | null;
  message: string;
}

export interface WhatsAppEndpointValidationSummary {
  total: number;
  available: number;
  missingRoute: number;
  authError: number;
  providerError: number;
  networkError: number;
}

export interface WhatsAppEndpointValidationResponse {
  instanceName: string;
  generatedAt: string;
  baseUrl: string;
  timeoutMs: number;
  endpoints: WhatsAppEndpointValidationEntry[];
  summary: WhatsAppEndpointValidationSummary;
}

export interface FailureByTypeEntry {
  messageType: MessageType;
  total: number;
}

export interface FailureDailySeriesEntry {
  day: string;
  total: number;
  byType: Record<string, number>;
}

export interface RecentFailureEntry {
  id: string;
  conversationId: string;
  messageType: MessageType;
  status: MessageStatus;
  createdAt: string;
  content: string;
  contactName: string | null;
  externalId: string;
}

export interface TenantFailuresDashboardResponse {
  generatedAt: string;
  windowDays: number;
  since: string;
  failedTotal: number;
  failedByType: FailureByTypeEntry[];
  dailySeries: FailureDailySeriesEntry[];
  recentFailures: RecentFailureEntry[];
}
