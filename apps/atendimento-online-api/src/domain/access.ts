export const UserRole = {
  ADMIN: "ADMIN",
  SUPERVISOR: "SUPERVISOR",
  AGENT: "AGENT",
  VIEWER: "VIEWER"
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const userRoleValues = [
  UserRole.ADMIN,
  UserRole.SUPERVISOR,
  UserRole.AGENT,
  UserRole.VIEWER
] as const;

export const WhatsAppInstanceUserScopePolicy = {
  MULTI_INSTANCE: "MULTI_INSTANCE",
  SINGLE_INSTANCE: "SINGLE_INSTANCE"
} as const;

export type WhatsAppInstanceUserScopePolicy =
  (typeof WhatsAppInstanceUserScopePolicy)[keyof typeof WhatsAppInstanceUserScopePolicy];

export const whatsappInstanceUserScopePolicyValues = [
  WhatsAppInstanceUserScopePolicy.MULTI_INSTANCE,
  WhatsAppInstanceUserScopePolicy.SINGLE_INSTANCE
] as const;
