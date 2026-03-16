import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const baseUrl = (process.env.METRICS_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const tenantSlug = process.env.METRICS_TENANT_SLUG ?? "demo";
const email = process.env.METRICS_EMAIL ?? "admin@demo.local";
const password = process.env.METRICS_PASSWORD ?? "123456";
const runs = Number.parseInt(process.env.METRICS_RUNS ?? "7", 10);
const timeoutMs = Number.parseInt(process.env.METRICS_TIMEOUT_MS ?? "30000", 10);
const metricsLabel = (process.env.METRICS_LABEL ?? "baseline").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-") || "baseline";

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function summarize(samples) {
  const ms = samples.map((item) => item.durationMs);
  const statusCodes = samples.reduce((acc, item) => {
    const key = String(item.status);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return {
    count: samples.length,
    okRatePercent: Math.round((samples.filter((s) => s.ok).length / samples.length) * 100),
    minMs: Number(Math.min(...ms).toFixed(2)),
    maxMs: Number(Math.max(...ms).toFixed(2)),
    avgMs: Number((ms.reduce((acc, value) => acc + value, 0) / ms.length).toFixed(2)),
    p95Ms: Number((percentile(ms, 95) ?? 0).toFixed(2)),
    statusCodes
  };
}

async function timedFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "cache-control": "no-cache",
        ...(options.headers ?? {})
      }
    });

    await response.arrayBuffer();
    const durationMs = performance.now() - startedAt;
    return {
      ok: response.ok,
      status: response.status,
      durationMs: Number(durationMs.toFixed(2))
    };
  } catch (error) {
    const durationMs = performance.now() - startedAt;
    return {
      ok: false,
      status: 0,
      durationMs: Number(durationMs.toFixed(2)),
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runSeries(name, url, options = {}) {
  const samples = [];
  for (let idx = 0; idx < runs; idx += 1) {
    samples.push(await timedFetch(url, options));
  }

  return {
    name,
    url,
    ...summarize(samples),
    samples
  };
}

function toMarkdown(report) {
  const rows = report.metrics.map((metric) => {
    return `| ${metric.name} | ${metric.avgMs} | ${metric.p95Ms} | ${metric.minMs} | ${metric.maxMs} | ${metric.okRatePercent}% | ${JSON.stringify(metric.statusCodes)} |`;
  });

  return [
    `# Sprint 6 Metrics (${metricsLabel})`,
    "",
    `- Gerado em: ${report.generatedAt}`,
    `- Base URL: ${report.baseUrl}`,
    `- Runs por endpoint: ${report.runs}`,
    `- Timeout por request: ${report.timeoutMs}ms`,
    "",
    "## Resultados",
    "",
    "| Endpoint | AVG (ms) | P95 (ms) | MIN (ms) | MAX (ms) | OK rate | Status codes |",
    "|---|---:|---:|---:|---:|---:|---|",
    ...rows,
    "",
    "## Notas",
    "",
    "- Este arquivo foi gerado com o mesmo roteiro de medicao para comparacao entre rodadas.",
    "- Gere outro relatorio mudando `METRICS_LABEL` para comparar antes/depois."
  ].join("\n");
}

async function main() {
  const loginUrl = `${baseUrl}/api/bff/auth/login`;
  const loginResult = await timedFetch(loginUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      tenantSlug,
      email,
      password
    })
  });

  if (!loginResult.ok) {
    throw new Error(`Falha no login para medir baseline (${loginResult.status}).`);
  }

  const loginResponse = await fetch(loginUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      tenantSlug,
      email,
      password
    })
  });
  const loginData = await loginResponse.json();
  const token = typeof loginData?.token === "string" ? loginData.token : "";
  if (!token) {
    throw new Error("Login sem token de acesso.");
  }

  const authHeaders = {
    authorization: `Bearer ${token}`
  };

  const conversationsProbe = await fetch(`${baseUrl}/api/bff/conversations`, {
    headers: authHeaders
  });
  const conversationsData = await conversationsProbe.json();
  const firstConversationId = Array.isArray(conversationsData) && conversationsData[0]?.id
    ? String(conversationsData[0].id)
    : null;

  const targets = [
    {
      name: "PAGE /admin/omnichannel/docs",
      url: `${baseUrl}/admin/omnichannel/docs`,
      options: {}
    },
    {
      name: "PAGE /admin/omnichannel/inbox",
      url: `${baseUrl}/admin/omnichannel/inbox`,
      options: {}
    },
    {
      name: "PAGE /admin/omnichannel/operacao",
      url: `${baseUrl}/admin/omnichannel/operacao`,
      options: {}
    },
    {
      name: "API /api/docs",
      url: `${baseUrl}/api/docs`,
      options: {}
    },
    {
      name: "API /api/bff/conversations",
      url: `${baseUrl}/api/bff/conversations`,
      options: {
        headers: authHeaders
      }
    },
    {
      name: "API /api/bff/tenant/whatsapp/status",
      url: `${baseUrl}/api/bff/tenant/whatsapp/status`,
      options: {
        headers: authHeaders
      }
    },
    {
      name: "API /api/bff/users",
      url: `${baseUrl}/api/bff/users`,
      options: {
        headers: authHeaders
      }
    },
    {
      name: "API /api/bff/contacts",
      url: `${baseUrl}/api/bff/contacts`,
      options: {
        headers: authHeaders
      }
    },
    {
      name: "API /api/bff/tenant/metrics/failures?days=7",
      url: `${baseUrl}/api/bff/tenant/metrics/failures?days=7`,
      options: {
        headers: authHeaders
      }
    }
  ];

  if (firstConversationId) {
    targets.push({
      name: "API /api/bff/conversations/:id/messages?limit=50",
      url: `${baseUrl}/api/bff/conversations/${firstConversationId}/messages?limit=50`,
      options: {
        headers: authHeaders
      }
    });
  }

  const metrics = [];
  for (const target of targets) {
    metrics.push(await runSeries(target.name, target.url, target.options));
  }

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const jsonPath = resolve(`docs/metrics/sprint6-${metricsLabel}-${stamp}.json`);
  const mdPath = resolve(`docs/metrics/sprint6-${metricsLabel}-${stamp}.md`);
  mkdirSync(dirname(jsonPath), { recursive: true });

  const report = {
    generatedAt: now.toISOString(),
    baseUrl,
    metricsLabel,
    runs,
    timeoutMs,
    login: {
      tenantSlug,
      email
    },
    firstConversationId,
    metrics
  };

  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(mdPath, `${toMarkdown(report)}\n`, "utf8");

  console.log(`Report JSON: ${jsonPath}`);
  console.log(`Report MD: ${mdPath}`);
  for (const metric of metrics) {
    console.log(`${metric.name} => avg=${metric.avgMs}ms p95=${metric.p95Ms}ms ok=${metric.okRatePercent}%`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
