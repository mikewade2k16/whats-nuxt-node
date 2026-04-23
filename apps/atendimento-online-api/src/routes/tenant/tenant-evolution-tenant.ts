import { getTenantRuntimeOrFail } from "../../services/tenant-runtime.js";
import type { EvolutionApiError } from "../../services/evolution-client.js";

export async function getTenantOrFail(tenantId: string) {
  return getTenantRuntimeOrFail(tenantId);
}

export function resolveInstanceName(
  explicit: string | undefined,
  fallback: string | null,
  tenantSlug: string
) {
  if (explicit?.trim()) {
    return explicit.trim();
  }

  if (fallback?.trim()) {
    return fallback.trim();
  }

  return `${tenantSlug}-wa`;
}

export function isInstanceAlreadyInUseError(error: EvolutionApiError) {
  if (![400, 403, 409].includes(error.statusCode)) {
    return false;
  }

  const normalizedMessage = error.message.toLowerCase();
  const normalizedDetails = JSON.stringify(error.details ?? "").toLowerCase();
  const combined = `${normalizedMessage} ${normalizedDetails}`;

  return /already|exist|in use|ja existe|em uso/.test(combined);
}
