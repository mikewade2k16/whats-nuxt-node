import { describe, expect, it } from "vitest";

import { mapCoreUserToSessionRole } from "~/utils/admin-session";
import type { CoreAuthUser } from "~/types/core";

function buildCoreUser(overrides: Partial<CoreAuthUser> = {}): CoreAuthUser {
  return {
    id: "user-1",
    name: "Usuario Demo",
    email: "usuario@demo.local",
    tenantId: "tenant-demo",
    level: "viewer",
    userType: "client",
    moduleCodes: [],
    atendimentoAccess: false,
    isPlatformAdmin: false,
    ...overrides
  };
}

describe("mapCoreUserToSessionRole", () => {
  it("retorna AGENT apenas quando o usuario tem atendimentoAccess e o cliente possui o modulo", () => {
    const role = mapCoreUserToSessionRole(buildCoreUser({
      atendimentoAccess: true,
      moduleCodes: ["atendimento", "core_panel"]
    }));

    expect(role).toBe("AGENT");
  });

  it("nao promove para AGENT quando o modulo atendimento nao esta ativo no cliente", () => {
    const role = mapCoreUserToSessionRole(buildCoreUser({
      atendimentoAccess: true,
      moduleCodes: ["core_panel"]
    }));

    expect(role).toBe("VIEWER");
  });

  it("nao promove para AGENT apenas pela presenca do modulo atendimento", () => {
    const role = mapCoreUserToSessionRole(buildCoreUser({
      atendimentoAccess: false,
      moduleCodes: ["atendimento", "core_panel"]
    }));

    expect(role).toBe("VIEWER");
  });
});