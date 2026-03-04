import { ref, type ComputedRef } from "vue";

export function useOmnichannelAdminQrPolling(options: {
  isConnected: ComputedRef<boolean>;
  refreshWhatsAppStatus: (options?: { silent?: boolean }) => Promise<void>;
  fetchQrCode: (options?: { force?: boolean; silent?: boolean }) => Promise<void>;
}) {
  const qrPollingTimer = ref<ReturnType<typeof setInterval> | null>(null);

  function stopQrPolling() {
    if (qrPollingTimer.value) {
      clearInterval(qrPollingTimer.value);
      qrPollingTimer.value = null;
    }
  }

  function startQrPolling() {
    stopQrPolling();
    qrPollingTimer.value = setInterval(async () => {
      if (options.isConnected.value) {
        stopQrPolling();
        return;
      }

      await Promise.all([
        options.refreshWhatsAppStatus({ silent: true }),
        options.fetchQrCode({ force: true, silent: true })
      ]);
    }, 8_000);
  }

  return {
    qrPollingTimer,
    stopQrPolling,
    startQrPolling
  };
}
