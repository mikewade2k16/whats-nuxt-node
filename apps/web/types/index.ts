export interface AuthUser {
  id: string;
  tenantId: string;
  tenantSlug: string;
  email: string;
  name: string;
  role: "ADMIN" | "AGENT";
}

export interface TenantSettings {
  id: string;
  slug: string;
  name: string;
  whatsappInstance: string | null;
  hasEvolutionApiKey: boolean;
  webhookUrl: string;
  createdAt: string;
  updatedAt: string;
  canViewSensitive: boolean;
  evolutionApiKey: string | null;
}

export interface TenantUser {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: "ADMIN" | "AGENT";
  createdAt: string;
  updatedAt: string;
}

export type MessageDirection = "INBOUND" | "OUTBOUND";
export type MessageStatus = "PENDING" | "SENT" | "FAILED";
export type ConversationStatus = "OPEN" | "PENDING" | "CLOSED";

export interface Message {
  id: string;
  tenantId: string;
  conversationId: string;
  direction: MessageDirection;
  senderName: string | null;
  senderAvatarUrl: string | null;
  content: string;
  status: MessageStatus;
  externalMessageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  channel: "WHATSAPP" | "INSTAGRAM";
  status: ConversationStatus;
  externalId: string;
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
