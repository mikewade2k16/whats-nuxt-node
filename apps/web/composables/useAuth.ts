import { storeToRefs } from "pinia";
import { useAuthStore } from "~/stores/auth";

export function useAuth() {
  const store = useAuthStore();
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
