const DEFAULT_ADMIN_PASSWORD_RESET_ERROR_MESSAGE = "Nao foi possivel concluir a recuperacao de senha. Tente novamente.";

const ADMIN_PASSWORD_RESET_ERROR_MESSAGES: Record<string, string> = {
  password_reset_unavailable: "A recuperacao de senha nao esta disponivel agora. Tente novamente em instantes.",
  password_reset_code_invalid: "Codigo invalido. Confira o email recebido e tente novamente.",
  password_reset_code_expired: "O codigo expirou. Solicite um novo codigo e tente novamente."
};

const GENERIC_CORE_PASSWORD_RESET_FAILURES = new Set([
  "falha no backend core",
  "falha no backend core.",
  "falha ao conectar no backend core",
  "falha ao conectar no backend core."
]);

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeMessageKey(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function extractErrorData(error: unknown) {
  if (!error || typeof error !== "object" || !("data" in error)) {
    return null;
  }

  const data = (error as { data?: unknown }).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  return data as Record<string, unknown>;
}

function extractStatusCode(error: unknown) {
  if (!error || typeof error !== "object" || !("statusCode" in error)) {
    return 0;
  }

  const value = Number((error as { statusCode?: unknown }).statusCode ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function isGenericCorePasswordResetFailureMessage(value: unknown) {
  return GENERIC_CORE_PASSWORD_RESET_FAILURES.has(normalizeMessageKey(value));
}

export function resolveAdminPasswordResetErrorMessage(error: unknown) {
  const data = extractErrorData(error);
  const code = normalizeMessageKey(data?.error);
  if (code && ADMIN_PASSWORD_RESET_ERROR_MESSAGES[code]) {
    return ADMIN_PASSWORD_RESET_ERROR_MESSAGES[code];
  }

  const dataMessage = normalizeText(data?.message);
  if (dataMessage && !isGenericCorePasswordResetFailureMessage(dataMessage)) {
    return dataMessage;
  }

  const statusCode = extractStatusCode(error);
  if (statusCode === 503 || isGenericCorePasswordResetFailureMessage(dataMessage)) {
    return ADMIN_PASSWORD_RESET_ERROR_MESSAGES.password_reset_unavailable;
  }

  if (error instanceof Error) {
    const rawMessage = normalizeText(error.message);
    if (isGenericCorePasswordResetFailureMessage(rawMessage)) {
      return ADMIN_PASSWORD_RESET_ERROR_MESSAGES.password_reset_unavailable;
    }

    if (rawMessage) {
      return rawMessage;
    }
  }

  return DEFAULT_ADMIN_PASSWORD_RESET_ERROR_MESSAGE;
}