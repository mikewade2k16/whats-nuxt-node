const DEFAULT_ADMIN_LOGIN_ERROR_MESSAGE = "Nao foi possivel entrar. Verifique seus dados e tente novamente.";

const ADMIN_LOGIN_ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "Email ou senha invalidos.",
  user_inactive: "Seu usuario esta inativo. Entre em contato com um administrador para liberar o acesso.",
  user_blocked: "Seu acesso esta bloqueado. Entre em contato com um administrador.",
  user_pending_invite: "Seu cadastro ainda esta pendente de ativacao. Entre em contato com um administrador.",
  tenant_membership_required: "Seu usuario ainda nao esta vinculado a um cliente ativo. Entre em contato com um administrador."
};

const LEGACY_LOGIN_MESSAGE_MAP: Record<string, string> = {
  "invalid credentials": ADMIN_LOGIN_ERROR_MESSAGES.unauthorized,
  "credenciais invalidas": ADMIN_LOGIN_ERROR_MESSAGES.unauthorized,
  "email ou senha invalidos": ADMIN_LOGIN_ERROR_MESSAGES.unauthorized,
  "email ou senha invalidos.": ADMIN_LOGIN_ERROR_MESSAGES.unauthorized,
  "user account is inactive": ADMIN_LOGIN_ERROR_MESSAGES.user_inactive,
  "user is inactive": ADMIN_LOGIN_ERROR_MESSAGES.user_inactive
};

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

function resolveLoginMessageByCode(code: unknown) {
  const normalizedCode = normalizeMessageKey(code);
  return normalizedCode ? (ADMIN_LOGIN_ERROR_MESSAGES[normalizedCode] || "") : "";
}

function resolveLegacyLoginMessage(message: unknown) {
  const normalizedMessage = normalizeMessageKey(message);
  return normalizedMessage ? (LEGACY_LOGIN_MESSAGE_MAP[normalizedMessage] || "") : "";
}

export function resolveAdminLoginErrorMessage(error: unknown) {
  const data = extractErrorData(error);
  const codeMessage = resolveLoginMessageByCode(data?.error);
  if (codeMessage) {
    return codeMessage;
  }

  const dataMessage = normalizeText(data?.message);
  const mappedDataMessage = resolveLegacyLoginMessage(dataMessage);
  if (mappedDataMessage) {
    return mappedDataMessage;
  }
  if (dataMessage) {
    return dataMessage;
  }

  if (error instanceof Error) {
    const mappedMessage = resolveLegacyLoginMessage(error.message);
    if (mappedMessage) {
      return mappedMessage;
    }

    const rawMessage = normalizeText(error.message);
    if (rawMessage) {
      return rawMessage;
    }
  }

  return DEFAULT_ADMIN_LOGIN_ERROR_MESSAGE;
}