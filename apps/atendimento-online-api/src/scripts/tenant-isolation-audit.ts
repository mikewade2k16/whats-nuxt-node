type JsonRecord = Record<string, unknown>;
type HttpMethod = "GET" | "POST" | "PATCH";

import type { ScriptAuthSession } from "./core-session.js";
import { loginWithCoreSession } from "./core-session.js";

type LoginPayload = {
  tenantSlug: string;
  email: string;
  password: string;
};

type LoginCandidateOptions = {
  envSlug?: string;
  envEmail?: string;
  envPassword?: string;
  fallbackSlugs: string[];
  fallbackEmail: string;
  fallbackPassword: string;
};

type UserResponse = {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: "ADMIN" | "SUPERVISOR" | "AGENT" | "VIEWER";
};

type MessageResponse = {
  id: string;
  conversationId: string;
};

type ConversationResponse = {
  id: string;
  externalId: string;
  messages?: MessageResponse[];
};

type CheckResult = {
  id: string;
  ok: boolean;
  expected: string;
  actual: string;
  details?: string;
};

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:4000";

function buildLoginCandidates(options: LoginCandidateOptions) {
  const candidates: LoginPayload[] = [];
  const seen = new Set<string>();
  const email = String(options.envEmail ?? options.fallbackEmail).trim().toLowerCase();
  const password = String(options.envPassword ?? options.fallbackPassword).trim();

  function addCandidate(tenantSlug: string | undefined) {
    const normalizedSlug = String(tenantSlug ?? "").trim().toLowerCase();
    if (!normalizedSlug || !email || !password) {
      return;
    }

    const key = `${normalizedSlug}|${email}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    candidates.push({
      tenantSlug: normalizedSlug,
      email,
      password
    });
  }

  addCandidate(options.envSlug);
  options.fallbackSlugs.forEach(addCandidate);

  return candidates;
}

const DEMO_LOGIN_CANDIDATES = buildLoginCandidates({
  envSlug: process.env.AUDIT_DEMO_TENANT_SLUG,
  envEmail: process.env.AUDIT_DEMO_EMAIL,
  envPassword: process.env.AUDIT_DEMO_PASSWORD,
  fallbackSlugs: ["demo", "demo-core"],
  fallbackEmail: "admin@demo-core.local",
  fallbackPassword: "123456"
});

const ACME_LOGIN_CANDIDATES = buildLoginCandidates({
  envSlug: process.env.AUDIT_ACME_TENANT_SLUG,
  envEmail: process.env.AUDIT_ACME_EMAIL,
  envPassword: process.env.AUDIT_ACME_PASSWORD,
  fallbackSlugs: ["acme", "acme-core"],
  fallbackEmail: "admin@acme.local",
  fallbackPassword: "123456"
});

async function callApi(
  path: string,
  method: HttpMethod,
  options: {
    token?: string;
    body?: unknown;
    selectedTenantSlug?: string;
  } = {}
) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.selectedTenantSlug ? { "x-selected-tenant-slug": options.selectedTenantSlug } : {}),
      "Content-Type": "application/json"
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  const raw = await response.text();
  let parsed: unknown = null;
  if (raw.length > 0) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
  }

  return {
    status: response.status,
    body: parsed
  };
}

async function login(payload: LoginPayload) {
  try {
    return await loginWithCoreSession(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Falha no login ${payload.tenantSlug}: ${message}`);
  }
}

async function loginWithFallback(label: string, candidates: LoginPayload[]) {
  const attempts: string[] = [];

  for (const candidate of candidates) {
    try {
      return await login(candidate);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      attempts.push(`${candidate.tenantSlug}: ${message}`);
    }
  }

  throw new Error(`Falha no login ${label}: ${attempts.join(" | ")}`);
}

function formatActual(status: number, body: unknown) {
  if (body && typeof body === "object" && "message" in (body as JsonRecord)) {
    return `status=${status}; message=${String((body as JsonRecord).message ?? "")}`;
  }
  return `status=${status}`;
}

function check(condition: boolean, id: string, expected: string, actual: string, details?: string): CheckResult {
  return {
    id,
    ok: condition,
    expected,
    actual,
    details
  };
}

function requireFirst<T>(entries: T[], label: string) {
  const first = entries[0];
  if (!first) {
    throw new Error(`Nenhum registro encontrado para ${label}. Rode seed e tente novamente.`);
  }
  return first;
}

async function main() {
  const startedAt = new Date();
  const checks: CheckResult[] = [];

  const [demoAuth, acmeAuth] = await Promise.all([
    loginWithFallback("tenant primario", DEMO_LOGIN_CANDIDATES),
    loginWithFallback("tenant secundario", ACME_LOGIN_CANDIDATES)
  ]);

  const [demoUsersResp, acmeUsersResp] = await Promise.all([
    callApi("/users", "GET", {
      token: demoAuth.token,
      selectedTenantSlug: demoAuth.tenantSlug
    }),
    callApi("/users", "GET", {
      token: acmeAuth.token,
      selectedTenantSlug: acmeAuth.tenantSlug
    })
  ]);

  if (demoUsersResp.status !== 200 || acmeUsersResp.status !== 200) {
    throw new Error("Falha ao listar usuarios nos tenants.");
  }

  const demoUsers = demoUsersResp.body as UserResponse[];
  const acmeUsers = acmeUsersResp.body as UserResponse[];
  const demoTenantIds = [...new Set(demoUsers.map((entry) => entry.tenantId).filter(Boolean))];
  const acmeTenantIds = [...new Set(acmeUsers.map((entry) => entry.tenantId).filter(Boolean))];
  const acmeAdmin = requireFirst(
    acmeUsers.filter((entry) => entry.role === "ADMIN"),
    "admin do tenant ACME"
  );

  checks.push(
    check(
      demoTenantIds.length === 1,
      "users-demo-scope",
      "todos usuarios do demo com tenantId unico do modulo",
      `tenantIds=${demoTenantIds.join(",") || "none"}`
    )
  );
  checks.push(
    check(
      acmeTenantIds.length === 1 && acmeTenantIds[0] !== demoTenantIds[0],
      "users-acme-scope",
      "usuarios do acme isolados com tenantId unico e diferente do demo",
      `tenantIds=${acmeTenantIds.join(",") || "none"}; demoTenantIds=${demoTenantIds.join(",") || "none"}`
    )
  );

  const [demoConversationsResp, acmeConversationsResp] = await Promise.all([
    callApi("/conversations", "GET", {
      token: demoAuth.token,
      selectedTenantSlug: demoAuth.tenantSlug
    }),
    callApi("/conversations", "GET", {
      token: acmeAuth.token,
      selectedTenantSlug: acmeAuth.tenantSlug
    })
  ]);

  if (demoConversationsResp.status !== 200 || acmeConversationsResp.status !== 200) {
    throw new Error("Falha ao listar conversas nos tenants.");
  }

  const demoConversations = demoConversationsResp.body as ConversationResponse[];
  const acmeConversations = acmeConversationsResp.body as ConversationResponse[];
  const acmeConversation = requireFirst(acmeConversations, "conversa do tenant ACME");
  const demoConversation = requireFirst(demoConversations, "conversa do tenant DEMO");

  checks.push(
    check(
      !demoConversations.some((entry) => entry.id === acmeConversation.id),
      "conversation-list-hidden-cross-tenant",
      "demo nao enxerga conversa do acme na listagem",
      `demoHasAcmeConversation=${String(demoConversations.some((entry) => entry.id === acmeConversation.id))}`
    )
  );

  const acmeMessagesResp = await callApi(
    `/conversations/${acmeConversation.id}/messages?limit=5`,
    "GET",
    {
      token: acmeAuth.token,
      selectedTenantSlug: acmeAuth.tenantSlug
    }
  );
  if (acmeMessagesResp.status !== 200) {
    throw new Error("Falha ao carregar mensagens da conversa ACME.");
  }
  const acmeMessagesPayload = acmeMessagesResp.body as { messages: MessageResponse[] };
  const acmeMessage = requireFirst(acmeMessagesPayload.messages, "mensagem do tenant ACME");

  const crossReadConversationResp = await callApi(
    `/conversations/${acmeConversation.id}/messages?limit=5`,
    "GET",
    {
      token: demoAuth.token,
      selectedTenantSlug: demoAuth.tenantSlug
    }
  );
  checks.push(
    check(
      crossReadConversationResp.status === 404,
      "cross-read-conversation-messages",
      "status=404",
      formatActual(crossReadConversationResp.status, crossReadConversationResp.body)
    )
  );

  const crossReadMessageResp = await callApi(
    `/conversations/${acmeConversation.id}/messages/${acmeMessage.id}`,
    "GET",
    {
      token: demoAuth.token,
      selectedTenantSlug: demoAuth.tenantSlug
    }
  );
  checks.push(
    check(
      crossReadMessageResp.status === 404,
      "cross-read-single-message",
      "status=404",
      formatActual(crossReadMessageResp.status, crossReadMessageResp.body)
    )
  );

  const crossPostMessageResp = await callApi(
    `/conversations/${acmeConversation.id}/messages`,
    "POST",
    {
      token: demoAuth.token,
      selectedTenantSlug: demoAuth.tenantSlug,
      body: {
        type: "TEXT",
        content: "teste isolacao tenant"
      }
    }
  );
  checks.push(
    check(
      crossPostMessageResp.status === 404,
      "cross-send-message",
      "status=404",
      formatActual(crossPostMessageResp.status, crossPostMessageResp.body)
    )
  );

  const crossPatchStatusResp = await callApi(
    `/conversations/${acmeConversation.id}/status`,
    "PATCH",
    {
      token: demoAuth.token,
      selectedTenantSlug: demoAuth.tenantSlug,
      body: {
        status: "CLOSED"
      }
    }
  );
  checks.push(
    check(
      crossPatchStatusResp.status === 404,
      "cross-update-conversation-status",
      "status=404",
      formatActual(crossPatchStatusResp.status, crossPatchStatusResp.body)
    )
  );

  const crossPatchAssignResp = await callApi(
    `/conversations/${acmeConversation.id}/assign`,
    "PATCH",
    {
      token: demoAuth.token,
      selectedTenantSlug: demoAuth.tenantSlug,
      body: {
        assignedToId: demoUsers[0]?.id ?? "missing-demo-user"
      }
    }
  );
  checks.push(
    check(
      crossPatchAssignResp.status === 404,
      "cross-assign-conversation",
      "status=404",
      formatActual(crossPatchAssignResp.status, crossPatchAssignResp.body)
    )
  );

  const crossPatchUserResp = await callApi(
    `/users/${acmeAdmin.id}`,
    "PATCH",
    {
      token: demoAuth.token,
      selectedTenantSlug: demoAuth.tenantSlug,
      body: {
        name: "Admin ACME Alterado indevidamente"
      }
    }
  );
  checks.push(
    check(
      crossPatchUserResp.status === 404 || crossPatchUserResp.status === 501,
      "cross-update-user",
      "status=404 ou status=501",
      formatActual(crossPatchUserResp.status, crossPatchUserResp.body)
    )
  );

  const unauthorizedConversationsResp = await callApi(
    `/conversations/${demoConversation.id}/messages?limit=5`,
    "GET"
  );
  checks.push(
    check(
      unauthorizedConversationsResp.status === 401,
      "unauthorized-protected-route",
      "status=401",
      formatActual(unauthorizedConversationsResp.status, unauthorizedConversationsResp.body)
    )
  );

  const finishedAt = new Date();
  const passed = checks.filter((entry) => entry.ok).length;
  const failed = checks.filter((entry) => !entry.ok);

  const report = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    apiBase: API_BASE,
    scope: {
      demoTenantSlug: demoAuth.tenantSlug,
      acmeTenantSlug: acmeAuth.tenantSlug
    },
    summary: {
      total: checks.length,
      passed,
      failed: failed.length
    },
    checks
  };

  console.log(JSON.stringify(report, null, 2));

  if (failed.length > 0) {
    process.exitCode = 2;
  }
}

void main();
