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
        timeout: 30_000
      });
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        const statusCode = error.response?.status ?? 500;
        const responseData = error.response?.data ?? null;
        const message =
          (typeof responseData === "object" &&
            responseData !== null &&
            "message" in responseData &&
            typeof (responseData as Record<string, unknown>).message === "string" &&
            (responseData as Record<string, string>).message) ||
          error.message ||
          "Erro na Evolution API";

        throw new EvolutionApiError(message, statusCode, responseData);
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
          base64: true,
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
            base64: true,
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
}
