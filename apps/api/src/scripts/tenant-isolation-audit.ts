type JsonRecord = Record<string, unknown>;
type HttpMethod = "GET" | "POST" | "PATCH";

type LoginPayload = {
  tenantSlug: string;
  email: string;
  password: string;
};

type LoginResponse = {
  token: string;
  user: {
    id: string;
    tenantId: string;
    tenantSlug: string;
    role: "ADMIN" | "SUPERVISOR" | "AGENT" | "VIEWER";
    email: string;
    name: string;
  };
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
const DEMO_LOGIN: LoginPayload = {
  tenantSlug: process.env.AUDIT_DEMO_TENANT_SLUG ?? "demo",
  email: process.env.AUDIT_DEMO_EMAIL ?? "admin@demo.local",
  password: process.env.AUDIT_DEMO_PASSWORD ?? "123456"
};
const ACME_LOGIN: LoginPayload = {
  tenantSlug: process.env.AUDIT_ACME_TENANT_SLUG ?? "acme",
  email: process.env.AUDIT_ACME_EMAIL ?? "admin@acme.local",
  password: process.env.AUDIT_ACME_PASSWORD ?? "123456"
};

async function callApi(path: string, method: HttpMethod, token?: string, body?: unknown) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
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
  const response = await callApi("/auth/login", "POST", undefined, payload);
  if (response.status !== 200) {
    throw new Error(`Falha no login ${payload.tenantSlug}: status=${response.status}`);
  }
  return response.body as LoginResponse;
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

  const [demoAuth, acmeAuth] = await Promise.all([login(DEMO_LOGIN), login(ACME_LOGIN)]);

  const [demoUsersResp, acmeUsersResp] = await Promise.all([
    callApi("/users", "GET", demoAuth.token),
    callApi("/users", "GET", acmeAuth.token)
  ]);

  if (demoUsersResp.status !== 200 || acmeUsersResp.status !== 200) {
    throw new Error("Falha ao listar usuarios nos tenants.");
  }

  const demoUsers = demoUsersResp.body as UserResponse[];
  const acmeUsers = acmeUsersResp.body as UserResponse[];
  const acmeAdmin = requireFirst(
    acmeUsers.filter((entry) => entry.role === "ADMIN"),
    "admin do tenant ACME"
  );

  checks.push(
    check(
      demoUsers.every((entry) => entry.tenantId === demoAuth.user.tenantId),
      "users-demo-scope",
      "todos usuarios do demo com tenantId=demo",
      `tenantIds=${[...new Set(demoUsers.map((entry) => entry.tenantId))].join(",") || "none"}`
    )
  );
  checks.push(
    check(
      acmeUsers.every((entry) => entry.tenantId === acmeAuth.user.tenantId),
      "users-acme-scope",
      "todos usuarios do acme com tenantId=acme",
      `tenantIds=${[...new Set(acmeUsers.map((entry) => entry.tenantId))].join(",") || "none"}`
    )
  );

  const [demoConversationsResp, acmeConversationsResp] = await Promise.all([
    callApi("/conversations", "GET", demoAuth.token),
    callApi("/conversations", "GET", acmeAuth.token)
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
    acmeAuth.token
  );
  if (acmeMessagesResp.status !== 200) {
    throw new Error("Falha ao carregar mensagens da conversa ACME.");
  }
  const acmeMessagesPayload = acmeMessagesResp.body as { messages: MessageResponse[] };
  const acmeMessage = requireFirst(acmeMessagesPayload.messages, "mensagem do tenant ACME");

  const crossReadConversationResp = await callApi(
    `/conversations/${acmeConversation.id}/messages?limit=5`,
    "GET",
    demoAuth.token
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
    demoAuth.token
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
    demoAuth.token,
    {
      type: "TEXT",
      content: "teste isolacao tenant"
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
    demoAuth.token,
    {
      status: "CLOSED"
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
    demoAuth.token,
    {
      assignedToId: demoAuth.user.id
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
    demoAuth.token,
    {
      name: "Admin ACME Alterado indevidamente"
    }
  );
  checks.push(
    check(
      crossPatchUserResp.status === 404,
      "cross-update-user",
      "status=404",
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
      demoTenantSlug: demoAuth.user.tenantSlug,
      acmeTenantSlug: acmeAuth.user.tenantSlug
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
