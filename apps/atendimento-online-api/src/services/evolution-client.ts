import axios, { AxiosError, type Method } from "axios";

export const defaultWebhookEvents = [
  "APPLICATION_STARTUP",
  "QRCODE_UPDATED",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "SEND_MESSAGE",
  "CONNECTION_UPDATE"
] as const;

interface EvolutionClientConfig {
  baseUrl: string;
  apiKey: string;
}

type EvolutionRequestOptions = {
  params?: Record<string, unknown>;
  data?: Record<string, unknown>;
  timeoutMs?: number;
};

export class EvolutionApiError extends Error {
  statusCode: number;
  details: unknown;

  constructor(message: string, statusCode = 500, details: unknown = null) {
    super(message);
    this.name = "EvolutionApiError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

function removeTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function resolvePathTemplate(template: string, instanceName: string) {
  const normalizedTemplate = template.trim();
  if (!normalizedTemplate) {
    throw new EvolutionApiError("Path da Evolution API nao configurado", 500, {
      template
    });
  }

  const encodedInstance = encodeURIComponent(instanceName);
  const resolved = normalizedTemplate.includes(":instance")
    ? normalizedTemplate.replace(":instance", encodedInstance)
    : normalizedTemplate;

  return resolved.startsWith("/") ? resolved : `/${resolved}`;
}

export class EvolutionClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: EvolutionClientConfig) {
    this.baseUrl = removeTrailingSlash(config.baseUrl);
    this.apiKey = config.apiKey;
  }

  private async request<T>(
    method: Method,
    path: string,
    options: EvolutionRequestOptions = {}
  ): Promise<T> {
    try {
      const response = await axios.request<T>({
        method,
        url: `${this.baseUrl}${path}`,
        params: options.params,
        data: options.data,
        headers: {
          apikey: this.apiKey
        },
        timeout: options.timeoutMs ?? 30_000
      });
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        const hasHttpResponse = Boolean(error.response);
        const statusCode = error.response?.status ?? 503;
        const responseData = error.response?.data ?? null;
        const networkCode = String(error.code ?? "").trim().toUpperCase();
        const networkMessage = !hasHttpResponse
          ? networkCode === "ENOTFOUND"
            ? "Falha ao localizar o host da Evolution API. Verifique a URL ou o DNS configurado no ambiente."
            : networkCode === "ECONNREFUSED"
              ? "A Evolution API recusou a conexao. Verifique se o servico esta online e acessivel."
              : networkCode === "ETIMEDOUT"
                ? "A Evolution API demorou demais para responder. Verifique a conectividade entre os servicos."
                : networkCode
                  ? `Falha de conexao com Evolution API (${networkCode})`
                  : "Falha de conexao com Evolution API"
          : "";
        const message =
          (typeof responseData === "object" &&
            responseData !== null &&
            "message" in responseData &&
            typeof (responseData as Record<string, unknown>).message === "string" &&
            (responseData as Record<string, string>).message) ||
          networkMessage ||
          error.message ||
          "Erro na Evolution API";

        throw new EvolutionApiError(message, statusCode, responseData ?? {
          code: error.code ?? null
        });
      }

      throw new EvolutionApiError("Erro inesperado na Evolution API", 500, null);
    }
  }

  createInstance(params: {
    instanceName: string;
    webhookUrl: string;
    number?: string;
    qrcode?: boolean;
    webhookEvents?: readonly string[];
    webhookHeaders?: Record<string, string>;
  }) {
    return this.request<Record<string, unknown>>("POST", "/instance/create", {
      data: {
        instanceName: params.instanceName,
        integration: "WHATSAPP-BAILEYS",
        qrcode: params.qrcode ?? true,
        number: params.number,
        webhook: {
          url: params.webhookUrl,
          byEvents: true,
          base64: false,
          headers: params.webhookHeaders,
          events: params.webhookEvents ?? defaultWebhookEvents
        }
      }
    });
  }

  connectInstance(params: { instanceName: string; number?: string }) {
    return this.request<Record<string, unknown>>(
      "GET",
      `/instance/connect/${encodeURIComponent(params.instanceName)}`,
      {
        params: params.number ? { number: params.number } : undefined
      }
    );
  }

  logoutInstance(instanceName: string) {
    return this.request<Record<string, unknown>>(
      "DELETE",
      `/instance/logout/${encodeURIComponent(instanceName)}`
    );
  }

  deleteInstance(instanceName: string) {
    return this.request<Record<string, unknown>>(
      "DELETE",
      `/instance/delete/${encodeURIComponent(instanceName)}`
    );
  }

  setWebhook(params: {
    instanceName: string;
    webhookUrl: string;
    webhookEvents?: readonly string[];
    webhookHeaders?: Record<string, string>;
  }) {
    return this.request<Record<string, unknown>>(
      "POST",
      `/webhook/set/${encodeURIComponent(params.instanceName)}`,
      {
        data: {
          webhook: {
            enabled: true,
            url: params.webhookUrl,
            byEvents: true,
            base64: false,
            headers: params.webhookHeaders,
            events: params.webhookEvents ?? defaultWebhookEvents
          }
        }
      }
    );
  }

  findWebhook(instanceName: string) {
    return this.request<Record<string, unknown>>(
      "GET",
      `/webhook/find/${encodeURIComponent(instanceName)}`
    );
  }

  getConnectionState(instanceName: string) {
    return this.request<Record<string, unknown>>(
      "GET",
      `/instance/connectionState/${encodeURIComponent(instanceName)}`
    );
  }

  fetchInstances() {
    return this.request<Record<string, unknown>>("GET", "/instance/fetchInstances");
  }

  findGroupInfo(instanceName: string, groupJid: string) {
    return this.request<Record<string, unknown>>(
      "GET",
      `/group/findGroupInfos/${encodeURIComponent(instanceName)}`,
      {
        params: {
          groupJid
        }
      }
    );
  }

  findContacts(instanceName: string, query: Record<string, unknown> = {}) {
    return this.request<Record<string, unknown> | Array<Record<string, unknown>>>(
      "POST",
      `/chat/findContacts/${encodeURIComponent(instanceName)}`,
      {
        data: query
      }
    );
  }

  fetchProfilePictureUrl(instanceName: string, number: string) {
    return this.request<Record<string, unknown>>(
      "POST",
      `/chat/fetchProfilePictureUrl/${encodeURIComponent(instanceName)}`,
      {
        data: {
          number
        }
      }
    );
  }

  async findChats(instanceName: string, query: Record<string, unknown> = {}, timeoutMs?: number) {
    const encodedInstance = encodeURIComponent(instanceName);
    const candidateRequests: Array<{
      method: Method;
      path: string;
      data?: Record<string, unknown>;
    }> = [
      {
        method: "POST",
        path: `/chat/findChats/${encodedInstance}`,
        data: query
      },
      {
        method: "POST",
        path: `/chats/findChats/${encodedInstance}`,
        data: query
      },
      {
        method: "POST",
        path: "/chat/findChats",
        data: {
          instanceName,
          ...query
        }
      },
      {
        method: "GET",
        path: `/chat/findChats/${encodedInstance}`
      }
    ];

    let lastError: EvolutionApiError | null = null;

    for (const candidate of candidateRequests) {
      try {
        return await this.request<Record<string, unknown> | Array<Record<string, unknown>>>(
          candidate.method,
          candidate.path,
          {
            data: candidate.data,
            timeoutMs
          }
        );
      } catch (error) {
        if (!(error instanceof EvolutionApiError)) {
          throw error;
        }

        lastError = error;
        if (![400, 404, 405, 422].includes(error.statusCode)) {
          throw error;
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new EvolutionApiError("Nao foi possivel consultar conversas na Evolution API", 500, null);
  }

  getBase64FromMediaMessage(instanceName: string, payload: Record<string, unknown>, timeoutMs?: number) {
    return this.request<Record<string, unknown>>(
      "POST",
      `/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`,
      {
        data: payload,
        timeoutMs
      }
    );
  }

  async findMessages(instanceName: string, query: Record<string, unknown>, timeoutMs?: number) {
    const encodedInstance = encodeURIComponent(instanceName);
    const candidatePaths = [
      `/chat/findMessages/${encodedInstance}`,
      `/messages/findMessages/${encodedInstance}`,
      `/messages/fetch/${encodedInstance}`
    ];

    let lastError: EvolutionApiError | null = null;

    for (const path of candidatePaths) {
      try {
        return await this.request<Record<string, unknown> | Array<Record<string, unknown>>>(
          "POST",
          path,
          {
            data: query,
            timeoutMs
          }
        );
      } catch (error) {
        if (!(error instanceof EvolutionApiError)) {
          throw error;
        }

        lastError = error;
        if (error.statusCode !== 404 && error.statusCode !== 405) {
          throw error;
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new EvolutionApiError("Nao foi possivel consultar historico de mensagens na Evolution API", 500, null);
  }

  sendReaction(params: {
    instanceName: string;
    pathTemplate: string;
    payload: Record<string, unknown>;
    timeoutMs?: number;
  }) {
    const path = resolvePathTemplate(params.pathTemplate, params.instanceName);
    return this.request<Record<string, unknown>>("POST", path, {
      data: params.payload,
      timeoutMs: params.timeoutMs
    });
  }

  deleteMessageForEveryone(params: {
    instanceName: string;
    pathTemplate: string;
    payload: Record<string, unknown>;
    timeoutMs?: number;
  }) {
    const path = resolvePathTemplate(params.pathTemplate, params.instanceName);
    return this.request<Record<string, unknown>>("DELETE", path, {
      data: params.payload,
      timeoutMs: params.timeoutMs
    });
  }
}
