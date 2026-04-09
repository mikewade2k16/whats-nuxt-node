import type { Redis } from "ioredis";
import { createRedisConnection } from "../redis.js";
import { platformCoreClient } from "./core-client.js";
import { findBestCoreTenantMatch } from "./core-tenant-mapping.js";

type CachedAccessPayload = {
  email: string;
  isPlatformAdmin: boolean;
  level: string;
  userType: string;
  atendimentoAccess: boolean;
  moduleCodes: string[];
};

const redisClientKey = "__omni_atendimento_access_redis__";
const memoryStoreKey = "__omni_atendimento_access_memory__";
const ACCESS_CACHE_TTL_SECONDS = 5;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeModuleCodes(value: unknown) {
  const source = Array.isArray(value) ? value : [];
  const output: string[] = [];
  const seen = new Set<string>();

  for (const entry of source) {
    const code = String(entry ?? "").trim().toLowerCase();
    if (!code || seen.has(code)) {
      continue;
    }
    seen.add(code);
    output.push(code);
  }

  return output;
}

function normalizePositiveInteger(value: unknown) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return parsed;
}

function getRedisClient() {
  const globalRef = globalThis as typeof globalThis & {
    [redisClientKey]?: Redis;
  };

  if (!globalRef[redisClientKey]) {
    const client = createRedisConnection();
    client.on("error", (error) => {
      console.error("[core-atendimento-access] redis connection error", error);
    });
    globalRef[redisClientKey] = client;
  }

  return globalRef[redisClientKey] as Redis;
}

function getMemoryStore() {
  const globalRef = globalThis as typeof globalThis & {
    [memoryStoreKey]?: Map<string, { value: CachedAccessPayload; expiresAt: number }>;
  };

  if (!globalRef[memoryStoreKey]) {
    globalRef[memoryStoreKey] = new Map();
  }

  return globalRef[memoryStoreKey] as Map<string, { value: CachedAccessPayload; expiresAt: number }>;
}

function cacheKeyForEmail(email: string, clientId?: number | null) {
  const normalizedClientId = normalizePositiveInteger(clientId);
  const scope = normalizedClientId > 0 ? `client:${normalizedClientId}` : "global";
  return `core:atendimento-access:${scope}:${normalizeEmail(email)}`;
}

function normalizeSlugCandidate(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeAccessPayload(email: string, payload?: Partial<CachedAccessPayload> | null): CachedAccessPayload {
  const moduleCodes = normalizeModuleCodes(payload?.moduleCodes);
  const atendimentoAccess = Boolean(payload?.atendimentoAccess) || moduleCodes.includes("atendimento");

  return {
    email: normalizeEmail(email),
    isPlatformAdmin: Boolean(payload?.isPlatformAdmin),
    level: String(payload?.level ?? "").trim().toLowerCase() || "marketing",
    userType: String(payload?.userType ?? "").trim().toLowerCase() || "client",
    atendimentoAccess,
    moduleCodes
  };
}

async function loadFromRedis(key: string) {
  try {
    const raw = await getRedisClient().get(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CachedAccessPayload;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    console.error("[core-atendimento-access] redis read fallback to memory", error);
    return null;
  }
}

async function saveToRedis(key: string, payload: CachedAccessPayload) {
  try {
    await getRedisClient().set(key, JSON.stringify(payload), "EX", ACCESS_CACHE_TTL_SECONDS);
    return true;
  } catch (error) {
    console.error("[core-atendimento-access] redis write fallback to memory", error);
    return false;
  }
}

function loadFromMemory(key: string) {
  const entry = getMemoryStore().get(key);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    getMemoryStore().delete(key);
    return null;
  }
  return entry.value;
}

function saveToMemory(key: string, payload: CachedAccessPayload) {
  getMemoryStore().set(key, {
    value: payload,
    expiresAt: Date.now() + (ACCESS_CACHE_TTL_SECONDS * 1_000)
  });
}

export async function resolveCoreAtendimentoAccessByEmail(
  email: string,
  options: { accessToken?: string | null; clientId?: number | null } = {}
) {
  const normalizedEmail = normalizeEmail(email);
  const key = cacheKeyForEmail(normalizedEmail, options.clientId);

  const cached = await loadFromRedis(key) ?? loadFromMemory(key);
  if (cached) {
    return normalizeAccessPayload(normalizedEmail, cached);
  }

  const users = await platformCoreClient.listAdminUsers({
    page: 1,
    limit: options.clientId ? 200 : 50,
    q: normalizedEmail,
    clientId: options.clientId ?? undefined,
    accessToken: options.accessToken
  });

  const matched = users.find((entry) => normalizeEmail(entry.email) === normalizedEmail) ?? null;
  const payload = normalizeAccessPayload(normalizedEmail, matched ?? undefined);
  const writtenToRedis = await saveToRedis(key, payload);
  if (!writtenToRedis) {
    saveToMemory(key, payload);
  }

  return payload;
}

export async function resolveTenantHasAtendimentoModule(tenantSlug: string): Promise<boolean> {
  const normalizedSlug = tenantSlug.trim().toLowerCase();
  if (!normalizedSlug) {
    return false;
  }

  const tenantModuleKey = `core:tenant-module:${normalizedSlug}`;
  const cachedValue = loadFromMemory(tenantModuleKey);
  if (cachedValue) {
    return cachedValue.atendimentoAccess;
  }

  try {
    const [coreTenants, clients] = await Promise.all([
      platformCoreClient.listTenants(),
      platformCoreClient.listAdminClients({ limit: 500 })
    ]);
    const matchedCoreTenant = findBestCoreTenantMatch({
      localSlug: normalizedSlug,
      coreTenants
    });

    for (const client of clients) {
      const moduleCodes = (client.modules ?? [])
        .map((m) => String(m.code ?? "").trim().toLowerCase())
        .filter(Boolean);
      const clientSlug = normalizeSlugCandidate(String(client.name ?? ""));
      const hasAtendimento = moduleCodes.includes("atendimento");
      const matchesCoreTenant = Boolean(
        matchedCoreTenant?.id
        && String(client.coreTenantId ?? "").trim() === matchedCoreTenant.id
      );
      const matchesLegacySlug =
        clientSlug === normalizedSlug ||
        String(client.coreTenantId ?? "").trim().toLowerCase() === normalizedSlug;

      if (matchesCoreTenant || matchesLegacySlug) {
        const payload = normalizeAccessPayload(normalizedSlug, { atendimentoAccess: hasAtendimento, moduleCodes });
        saveToMemory(tenantModuleKey, payload);
        return hasAtendimento;
      }
    }
  } catch (error) {
    console.error("[core-atendimento-access] failed to check tenant module", error);
  }

  return false;
}

export async function invalidateCoreAtendimentoAccessCacheByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const globalKey = cacheKeyForEmail(normalizedEmail);
  getMemoryStore().delete(globalKey);

  const scopedKeys = Array.from(getMemoryStore().keys()).filter((entry) => entry.endsWith(`:${normalizedEmail}`));
  for (const scopedKey of scopedKeys) {
    getMemoryStore().delete(scopedKey);
  }

  try {
    if (scopedKeys.length > 0) {
      await getRedisClient().del(globalKey, ...scopedKeys);
    } else {
      await getRedisClient().del(globalKey);
    }
  } catch (error) {
    console.error("[core-atendimento-access] redis invalidate fallback to memory", error);
  }
}
