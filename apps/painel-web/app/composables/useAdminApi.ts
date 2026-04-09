import { ref } from "vue";

export interface ContainerStats {
  name: string;
  status: string;
  cpuPercent: string;
  memoryUsage: string;
  healthStatus?: string;
}

export interface SystemStats {
  totalMemory: number;
  availableMemory: number;
  memoryPercent: number;
  cpuCount: number;
  platform: string;
  uptime: number;
}

export interface ContainerLogsResponse {
  logs: string[];
  containerName: string;
  timestamp: string;
}

const ADMIN_API_PREFIX = "/api/bff/api/admin";
const REQUEST_TIMEOUT_MS = 10000;

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Erro HTTP ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export const useAdminApi = () => {
  const loading = ref(false);
  const error = ref<string | null>(null);

  const getContainers = async (): Promise<{ containers: ContainerStats[]; system: SystemStats }> => {
    loading.value = true;
    error.value = null;

    try {
      return await requestJson<{ containers: ContainerStats[]; system: SystemStats }>(
        `${ADMIN_API_PREFIX}/containers`
      );
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Erro desconhecido";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const getContainerStats = async (containerName: string): Promise<ContainerStats> => {
    loading.value = true;
    error.value = null;

    try {
      return await requestJson<ContainerStats>(`${ADMIN_API_PREFIX}/container/${containerName}/stats`);
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Erro desconhecido";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const getContainerLogs = async (containerName: string, tail: number = 50): Promise<ContainerLogsResponse> => {
    loading.value = true;
    error.value = null;

    try {
      return await requestJson<ContainerLogsResponse>(
        `${ADMIN_API_PREFIX}/container/${containerName}/logs?tail=${tail}`
      );
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Erro desconhecido";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const restartContainer = async (containerName: string): Promise<{ success: boolean; message: string }> => {
    loading.value = true;
    error.value = null;

    try {
      return await requestJson<{ success: boolean; message: string }>(
        `${ADMIN_API_PREFIX}/container/${containerName}/restart`,
        { method: "POST" }
      );
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Erro desconhecido";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const stopContainer = async (containerName: string): Promise<{ success: boolean; message: string }> => {
    loading.value = true;
    error.value = null;

    try {
      return await requestJson<{ success: boolean; message: string }>(
        `${ADMIN_API_PREFIX}/container/${containerName}/stop`,
        { method: "POST" }
      );
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Erro desconhecido";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const startContainer = async (containerName: string): Promise<{ success: boolean; message: string }> => {
    loading.value = true;
    error.value = null;

    try {
      return await requestJson<{ success: boolean; message: string }>(
        `${ADMIN_API_PREFIX}/container/${containerName}/start`,
        { method: "POST" }
      );
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Erro desconhecido";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const getSystemStats = async (): Promise<SystemStats> => {
    loading.value = true;
    error.value = null;

    try {
      return await requestJson<SystemStats>(`${ADMIN_API_PREFIX}/system`);
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Erro desconhecido";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const getHealth = async (): Promise<Response> => {
    loading.value = true;
    error.value = null;

    try {
      const response = await fetch("/api/bff/health");
      if (!response.ok) {
        throw new Error("Servico indisponivel");
      }
      return response;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Erro desconhecido";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  return {
    loading,
    error,
    getContainers,
    getContainerStats,
    getContainerLogs,
    restartContainer,
    stopContainer,
    startContainer,
    getSystemStats,
    getHealth
  };
};
