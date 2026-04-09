interface HttpMetricSample {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  observedAt: Date;
}

interface HttpMetricBucket {
  key: string;
  method: string;
  route: string;
  totalRequests: number;
  clientErrors: number;
  serverErrors: number;
  sumMs: number;
  minMs: number;
  maxMs: number;
  samples: number[];
  lastStatusCode: number;
  lastSeenAt: Date;
}

const MAX_SAMPLES_PER_ENDPOINT = 240;
const metricsStartedAt = new Date();
const buckets = new Map<string, HttpMetricBucket>();

function round(value: number, digits = 2) {
  const base = 10 ** digits;
  return Math.round(value * base) / base;
}

function percentile(values: number[], p: number) {
  if (values.length < 1) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))] ?? 0;
}

function normalizeRoute(rawRoute: string | null | undefined) {
  const trimmed = rawRoute?.trim();
  if (!trimmed) {
    return "unknown";
  }

  const [withoutQuery] = trimmed.split("?");
  if (!withoutQuery) {
    return "unknown";
  }

  return withoutQuery;
}

export function recordHttpMetric(sample: HttpMetricSample) {
  if (!Number.isFinite(sample.durationMs) || sample.durationMs < 0) {
    return;
  }

  const route = normalizeRoute(sample.route);
  const method = sample.method.toUpperCase();
  const key = `${method} ${route}`;

  const bucket =
    buckets.get(key) ??
    {
      key,
      method,
      route,
      totalRequests: 0,
      clientErrors: 0,
      serverErrors: 0,
      sumMs: 0,
      minMs: Number.POSITIVE_INFINITY,
      maxMs: 0,
      samples: [],
      lastStatusCode: 0,
      lastSeenAt: sample.observedAt
    };

  bucket.totalRequests += 1;
  bucket.sumMs += sample.durationMs;
  bucket.minMs = Math.min(bucket.minMs, sample.durationMs);
  bucket.maxMs = Math.max(bucket.maxMs, sample.durationMs);
  bucket.lastStatusCode = sample.statusCode;
  bucket.lastSeenAt = sample.observedAt;

  if (sample.statusCode >= 400 && sample.statusCode < 500) {
    bucket.clientErrors += 1;
  } else if (sample.statusCode >= 500) {
    bucket.serverErrors += 1;
  }

  bucket.samples.push(sample.durationMs);
  if (bucket.samples.length > MAX_SAMPLES_PER_ENDPOINT) {
    bucket.samples.shift();
  }

  buckets.set(key, bucket);
}

export interface HttpEndpointMetricEntry {
  key: string;
  method: string;
  route: string;
  totalRequests: number;
  errors: number;
  clientErrors: number;
  serverErrors: number;
  errorRatePercent: number;
  avgMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  lastStatusCode: number;
  lastSeenAt: string;
}

export type HttpMetricsSortBy = "p95" | "avg" | "errors" | "requests";
export type HttpMetricsSortOrder = "asc" | "desc";

export function getHttpEndpointMetricsSnapshot(options?: {
  limit?: number;
  sortBy?: HttpMetricsSortBy;
  order?: HttpMetricsSortOrder;
  routeContains?: string;
}) {
  const sortBy = options?.sortBy ?? "p95";
  const order = options?.order ?? "desc";
  const routeContains = options?.routeContains?.trim().toLowerCase() ?? "";

  const endpoints: HttpEndpointMetricEntry[] = [...buckets.values()]
    .map((bucket) => {
      const errors = bucket.clientErrors + bucket.serverErrors;
      const avgMs = bucket.totalRequests > 0 ? bucket.sumMs / bucket.totalRequests : 0;

      return {
        key: bucket.key,
        method: bucket.method,
        route: bucket.route,
        totalRequests: bucket.totalRequests,
        errors,
        clientErrors: bucket.clientErrors,
        serverErrors: bucket.serverErrors,
        errorRatePercent: bucket.totalRequests > 0 ? round((errors / bucket.totalRequests) * 100, 2) : 0,
        avgMs: round(avgMs, 2),
        p95Ms: round(percentile(bucket.samples, 95), 2),
        minMs: round(Number.isFinite(bucket.minMs) ? bucket.minMs : 0, 2),
        maxMs: round(bucket.maxMs, 2),
        lastStatusCode: bucket.lastStatusCode,
        lastSeenAt: bucket.lastSeenAt.toISOString()
      };
    })
    .filter((entry) => {
      if (!routeContains) {
        return true;
      }

      return entry.route.toLowerCase().includes(routeContains);
    });

  endpoints.sort((left, right) => {
    const leftValue =
      sortBy === "avg"
        ? left.avgMs
        : sortBy === "errors"
          ? left.errors
          : sortBy === "requests"
            ? left.totalRequests
            : left.p95Ms;

    const rightValue =
      sortBy === "avg"
        ? right.avgMs
        : sortBy === "errors"
          ? right.errors
          : sortBy === "requests"
            ? right.totalRequests
            : right.p95Ms;

    return order === "asc" ? leftValue - rightValue : rightValue - leftValue;
  });

  const summary = endpoints.reduce(
    (acc, entry) => {
      acc.totalRequests += entry.totalRequests;
      acc.clientErrors += entry.clientErrors;
      acc.serverErrors += entry.serverErrors;
      acc.totalErrors += entry.errors;
      return acc;
    },
    {
      totalRequests: 0,
      totalErrors: 0,
      clientErrors: 0,
      serverErrors: 0
    }
  );

  const result = endpoints.slice(0, Math.max(1, options?.limit ?? 20));
  const uptimeSeconds = Math.max(0, Math.floor((Date.now() - metricsStartedAt.getTime()) / 1000));

  return {
    generatedAt: new Date().toISOString(),
    startedAt: metricsStartedAt.toISOString(),
    uptimeSeconds,
    summary: {
      ...summary,
      errorRatePercent:
        summary.totalRequests > 0 ? round((summary.totalErrors / summary.totalRequests) * 100, 2) : 0
    },
    endpoints: result
  };
}
