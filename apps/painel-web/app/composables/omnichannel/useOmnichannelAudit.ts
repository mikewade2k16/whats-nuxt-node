import { computed, ref } from "vue";
import type {
  TenantFailuresDashboardResponse,
  TenantHttpEndpointMetricsResponse
} from "~/types";
import { extractAdminError } from "~/composables/omnichannel/useOmnichannelAdminShared";

export function useOmnichannelAudit() {
  const { legacyRole } = useAdminSession();
  const { apiFetch } = useApi();

  const loadingFailures = ref(false);
  const loadingHttpMetrics = ref(false);
  const failuresDashboard = ref<TenantFailuresDashboardResponse | null>(null);
  const httpEndpointMetrics = ref<TenantHttpEndpointMetricsResponse | null>(null);
  const failureWindowDays = ref(7);
  const errorMessage = ref("");

  const canViewAudit = computed(() =>
    legacyRole.value === "ADMIN" || legacyRole.value === "SUPERVISOR"
  );

  function clearError() {
    errorMessage.value = "";
  }

  async function loadFailuresDashboard(options: { days?: number; silent?: boolean } = {}) {
    if (!canViewAudit.value) {
      failuresDashboard.value = null;
      return;
    }

    loadingFailures.value = true;
    if (!options.silent) {
      clearError();
    }

    try {
      const days = options.days ?? failureWindowDays.value;
      failuresDashboard.value = await apiFetch<TenantFailuresDashboardResponse>(`/tenant/metrics/failures?days=${days}`);
      failureWindowDays.value = days;
    } catch (error) {
      if (!options.silent) {
        errorMessage.value = extractAdminError(error);
      }
    } finally {
      loadingFailures.value = false;
    }
  }

  async function loadHttpMetrics(options: { silent?: boolean } = {}) {
    if (!canViewAudit.value) {
      httpEndpointMetrics.value = null;
      return;
    }

    loadingHttpMetrics.value = true;
    if (!options.silent) {
      clearError();
    }

    try {
      httpEndpointMetrics.value = await apiFetch<TenantHttpEndpointMetricsResponse>(
        "/tenant/metrics/http-endpoints?limit=20&sortBy=p95&order=desc"
      );
    } catch (error) {
      if (!options.silent) {
        errorMessage.value = extractAdminError(error);
      }
    } finally {
      loadingHttpMetrics.value = false;
    }
  }

  async function activate() {
    if (!canViewAudit.value) {
      return;
    }

    await Promise.all([
      loadFailuresDashboard({ silent: true }),
      loadHttpMetrics({ silent: true })
    ]);
  }

  return {
    canViewAudit,
    loadingFailures,
    loadingHttpMetrics,
    failuresDashboard,
    httpEndpointMetrics,
    failureWindowDays,
    errorMessage,
    activate,
    loadFailuresDashboard,
    loadHttpMetrics
  };
}
