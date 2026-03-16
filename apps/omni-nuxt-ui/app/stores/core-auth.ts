import { defineStore } from "pinia";
import type { CoreAuthUser } from "~/types/core";

const TOKEN_KEY = "core:token";
const USER_KEY = "core:user";

function loadUserFromStorage() {
  const rawUser = localStorage.getItem(USER_KEY);
  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser) as CoreAuthUser;
  } catch {
    return null;
  }
}

export const useCoreAuthStore = defineStore("core-auth", () => {
  const token = ref<string | null>(null);
  const user = ref<CoreAuthUser | null>(null);
  const hydrated = ref(false);

  const isAuthenticated = computed(() => Boolean(token.value && user.value));

  function hydrate() {
    if (!import.meta.client || hydrated.value) {
      return;
    }

    token.value = localStorage.getItem(TOKEN_KEY);
    user.value = loadUserFromStorage();
    hydrated.value = true;
  }

  function persist() {
    if (!import.meta.client) {
      return;
    }

    if (token.value) {
      localStorage.setItem(TOKEN_KEY, token.value);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }

    if (user.value) {
      localStorage.setItem(USER_KEY, JSON.stringify(user.value));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  }

  function setSession(nextToken: string, nextUser: CoreAuthUser) {
    token.value = nextToken;
    user.value = nextUser;
    hydrated.value = true;
    persist();
  }

  function clearSession() {
    token.value = null;
    user.value = null;
    hydrated.value = true;
    persist();
  }

  return {
    token,
    user,
    hydrated,
    isAuthenticated,
    hydrate,
    setSession,
    clearSession
  };
});
