import { describe, expect, it } from "vitest";

import { CoreApiClientError } from "~/composables/useCoreApi";
import { resolveAdminPasswordResetErrorMessage } from "~/utils/admin-password-reset-feedback";

describe("resolveAdminPasswordResetErrorMessage", () => {
  it("prioriza o codigo tipado quando o backend informa erro conhecido", () => {
    const error = new CoreApiClientError("invalid code", {
      statusCode: 401,
      data: { error: "password_reset_code_invalid" }
    });

    expect(resolveAdminPasswordResetErrorMessage(error)).toBe(
      "Codigo invalido. Confira o email recebido e tente novamente."
    );
  });

  it("mantem a mensagem vinda do backend quando ela ja e descritiva", () => {
    const error = new CoreApiClientError("expired", {
      statusCode: 410,
      data: {
        error: "password_reset_code_expired",
        message: "O codigo expirou. Solicite um novo codigo e tente novamente."
      }
    });

    expect(resolveAdminPasswordResetErrorMessage(error)).toBe(
      "O codigo expirou. Solicite um novo codigo e tente novamente."
    );
  });

  it("traduz a falha generica do proxy core para indisponibilidade amigavel", () => {
    const error = new CoreApiClientError("Falha no backend core", {
      statusCode: 503,
      data: {
        message: "Falha no backend core"
      }
    });

    expect(resolveAdminPasswordResetErrorMessage(error)).toBe(
      "A recuperacao de senha nao esta disponivel agora. Tente novamente em instantes."
    );
  });

  it("usa fallback amigavel quando o erro nao traz detalhes", () => {
    expect(resolveAdminPasswordResetErrorMessage(null)).toBe(
      "Nao foi possivel concluir a recuperacao de senha. Tente novamente."
    );
  });
});