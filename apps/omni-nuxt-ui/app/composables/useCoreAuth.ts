import { storeToRefs } from "pinia";
import { useCoreAuthStore } from "~/stores/core-auth";

export function useCoreAuth() {
  const store = useCoreAuthStore();
  store.hydrate();

  const { token, user, hydrated, isAuthenticated } = storeToRefs(store);

  return {
    token,
    user,
    hydrated,
    isAuthenticated,
    hydrate: store.hydrate,
    setSession: store.setSession,
    clearSession: store.clearSession
  };
}
