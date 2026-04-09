import { describe, expect, it } from "vitest";

import { CoreApiClientError } from "~/composables/useCoreApi";
import { resolveAdminLoginErrorMessage } from "~/utils/admin-auth-feedback";

describe("resolveAdminLoginErrorMessage", () => {
  it("prioriza o codigo user_inactive quando o backend envia erro tipado", () => {
    const error = new CoreApiClientError("invalid credentials", {
      statusCode: 401,
      data: { error: "user_inactive" }
    });

    expect(resolveAdminLoginErrorMessage(error)).toBe(
      "Seu usuario esta inativo. Entre em contato com um administrador para liberar o acesso."
    );
  });

  it("traduz a mensagem generica legada de credenciais invalidas", () => {
    expect(resolveAdminLoginErrorMessage(new Error("invalid credentials"))).toBe(
      "Email ou senha invalidos."
    );
  });

  it("mantem a mensagem descritiva do backend quando ela ja chega pronta", () => {
    const error = new CoreApiClientError("backend message", {
      statusCode: 401,
      data: {
        error: "user_blocked",
        message: "Seu acesso esta bloqueado. Entre em contato com um administrador."
      }
    });

    expect(resolveAdminLoginErrorMessage(error)).toBe(
      "Seu acesso esta bloqueado. Entre em contato com um administrador."
    );
  });

  it("usa fallback amigavel quando o erro nao traz detalhes", () => {
    expect(resolveAdminLoginErrorMessage(null)).toBe(
      "Nao foi possivel entrar. Verifique seus dados e tente novamente."
    );
  });
});