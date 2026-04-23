import type { UserRole } from "../../domain/access.js";

export function resolveConfiguredChannelCount(whatsappInstance: string | null | undefined) {
  return whatsappInstance?.trim() ? 1 : 0;
}

export function canReadSensitiveConfig(role: UserRole) {
  return role === "ADMIN";
}
