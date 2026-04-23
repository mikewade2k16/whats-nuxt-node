import { env } from "../../config.js";
import { EvolutionApiError, EvolutionClient } from "../../services/evolution-client.js";

export function normalizeEvolutionApiKey(value: string | null | undefined) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function createEvolutionClientOrThrow(_tenantApiKey?: string | null) {
  if (!env.EVOLUTION_BASE_URL) {
    throw new EvolutionApiError("EVOLUTION_BASE_URL nao configurada no ambiente", 400);
  }

  const apiKey = env.EVOLUTION_API_KEY;
  if (!apiKey) {
    throw new EvolutionApiError(
      "Nenhuma API key global da Evolution configurada no ambiente",
      400
    );
  }

  return new EvolutionClient({
    baseUrl: env.EVOLUTION_BASE_URL,
    apiKey
  });
}
