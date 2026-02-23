import type { AuthUser } from "~/types";

const TOKEN_KEY = "omni:token";
const USER_KEY = "omni:user";

export function useAuth() {
  const token = useState<string | null>("auth:token", () => null);
  const user = useState<AuthUser | null>("auth:user", () => null);
  const hydrated = useState<boolean>("auth:hydrated", () => false);

  if (import.meta.client && !hydrated.value) {
    token.value = localStorage.getItem(TOKEN_KEY);
    const rawUser = localStorage.getItem(USER_KEY);
    user.value = rawUser ? (JSON.parse(rawUser) as AuthUser) : null;
    hydrated.value = true;
  }

  const isAuthenticated = computed(() => Boolean(token.value && user.value));

  function setSession(nextToken: string, nextUser: AuthUser) {
    token.value = nextToken;
    user.value = nextUser;
    if (import.meta.client) {
      localStorage.setItem(TOKEN_KEY, nextToken);
      localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    }
  }

  function clearSession() {
    token.value = null;
    user.value = null;
    if (import.meta.client) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  }

  return {
    token,
    user,
    isAuthenticated,
    setSession,
    clearSession
  };
}

