import { getQuery } from "h3";

type TenorMediaFormat = {
  url?: string;
  dims?: number[];
};

type TenorResult = {
  id?: string;
  content_description?: string;
  itemurl?: string;
  media_formats?: Record<string, TenorMediaFormat>;
};

type GifSearchItem = {
  id: string;
  title: string;
  previewUrl: string | null;
  mediaUrl: string | null;
  mimeType: string | null;
  sourcePageUrl: string | null;
};

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toPositiveInt(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.floor(numeric);
    }
  }

  return fallback;
}

function pickFirstUrl(...values: Array<string | undefined | null>) {
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
  }

  return null;
}

function mapTenorResult(entry: TenorResult): GifSearchItem | null {
  const mediaFormats = entry.media_formats ?? {};

  const mp4Url = pickFirstUrl(
    mediaFormats.mp4?.url,
    mediaFormats.tinymp4?.url,
    mediaFormats.nanomp4?.url,
    mediaFormats.loopedmp4?.url
  );

  const gifUrl = pickFirstUrl(
    mediaFormats.gif?.url,
    mediaFormats.tinygif?.url,
    mediaFormats.nanogif?.url,
    mediaFormats.mediumgif?.url
  );

  const previewUrl = pickFirstUrl(
    mediaFormats.tinygif?.url,
    mediaFormats.nanogif?.url,
    mediaFormats.gifpreview?.url,
    mediaFormats.gif?.url,
    mp4Url
  );

  const mediaUrl = mp4Url ?? gifUrl;
  if (!mediaUrl) {
    return null;
  }

  return {
    id: entry.id || `tenor-${Math.random().toString(36).slice(2, 9)}`,
    title: entry.content_description?.trim() || "GIF",
    previewUrl,
    mediaUrl,
    mimeType: mp4Url ? "video/mp4" : "image/gif",
    sourcePageUrl: pickFirstUrl(entry.itemurl)
  };
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const provider = String(config.gifProvider || "tenor").trim().toLowerCase();
  const query = getQuery(event);
  const q = typeof query.q === "string" ? query.q.trim() : "";
  const limit = Math.min(40, Math.max(1, toPositiveInt(query.limit, 24)));

  if (provider !== "tenor") {
    return {
      provider,
      query: q,
      items: [],
      error: `Provider configurado (${provider}) nao e suportado.`
    };
  }

  const tenorApiKey = String(config.tenorApiKey || "").trim();
  if (!tenorApiKey) {
    return {
      provider,
      query: q,
      items: [],
      error: "Provider de GIF nao configurado. Defina NUXT_TENOR_API_KEY."
    };
  }

  if (!q) {
    return {
      provider,
      query: "",
      items: []
    };
  }

  const tenorBase = String(config.tenorBaseUrl || "https://tenor.googleapis.com/v2").replace(/\/+$/, "");
  const searchUrl = new URL(`${tenorBase}/search`);
  searchUrl.searchParams.set("q", q);
  searchUrl.searchParams.set("key", tenorApiKey);
  searchUrl.searchParams.set("limit", String(limit));
  searchUrl.searchParams.set("media_filter", "gif,tinygif,mp4,tinymp4,nanomp4,nanogif");
  searchUrl.searchParams.set("locale", "pt_BR");

  let items: GifSearchItem[] = [];
  let error: string | null = null;

  try {
    const response = await fetch(searchUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      error = `Falha na consulta de GIF (status ${response.status}).`;
    } else {
      const payload = await response.json();
      const payloadRecord = asRecord(payload);
      const results = Array.isArray(payloadRecord?.results) ? payloadRecord.results : [];
      items = results
        .map((entry) => mapTenorResult(entry as TenorResult))
        .filter((entry): entry is GifSearchItem => Boolean(entry));
    }
  } catch {
    error = "Falha ao consultar provider de GIF.";
  }

  const payload = {
    provider,
    query: q,
    items
  };

  if (error) {
    return {
      ...payload,
      error
    };
  }

  return payload;
});
