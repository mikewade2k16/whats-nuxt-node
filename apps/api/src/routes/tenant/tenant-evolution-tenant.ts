import { prisma } from "../../db.js";
import type { EvolutionApiError } from "../../services/evolution-client.js";

export async function getTenantOrFail(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId }
  });

  if (!tenant) {
    throw new Error("Tenant nao encontrado");
  }

  return tenant;
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
