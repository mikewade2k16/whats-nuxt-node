import { describe, expect, it } from "vitest";
import { buildSessionRequestHeaders } from "~/stores/session-simulation";

describe("buildSessionRequestHeaders", () => {
  it("mantem x-client-id efetivo mesmo fora do modo de simulacao", () => {
    expect(buildSessionRequestHeaders({
      canSimulate: false,
      userType: "admin",
      userLevel: "admin",
      clientId: 1,
      effectiveClientId: 7
    })).toEqual({
      "x-client-id": "7"
    });
  });

  it("envia overrides completos quando a simulacao esta ativa", () => {
    expect(buildSessionRequestHeaders({
      canSimulate: true,
      userType: "admin",
      userLevel: "manager",
      clientId: 12,
      effectiveClientId: 12
    })).toEqual({
      "x-user-type": "admin",
      "x-user-level": "manager",
      "x-client-id": "12"
    });
  });
});
