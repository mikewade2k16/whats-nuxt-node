import { coreAdminFetch } from "~~/server/utils/core-admin-fetch";
import { clearCoreSessionToken, getCoreSessionToken } from "~~/server/utils/core-session-cookie";

interface CoreMeResponse {
  user: Record<string, unknown>;
}

export default defineEventHandler(async (event) => {
  const accessToken = getCoreSessionToken(event);
  if (!accessToken) {
    return {
      ok: false,
      reason: "remembered-session-missing"
    };
  }

  try {
    const response = await coreAdminFetch<CoreMeResponse>(event, "/core/auth/me");

    return {
      ok: true,
      session: {
        accessToken,
        user: response.user
      }
    };
  } catch (error: unknown) {
    const statusCode = error && typeof error === "object" && "statusCode" in error
      ? Number((error as { statusCode?: unknown }).statusCode ?? 500)
      : 500;

    if (statusCode === 401 || statusCode === 403) {
      clearCoreSessionToken(event);
      return {
        ok: false,
        reason: "remembered-session-invalid"
      };
    }

    throw error;
  }
});