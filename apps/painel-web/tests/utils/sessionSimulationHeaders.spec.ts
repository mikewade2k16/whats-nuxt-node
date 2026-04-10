import { describe, expect, it } from "vitest";
import { buildSessionRequestHeaders, resolveSessionSimulationFallbackClientId } from "~/stores/session-simulation";

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

  it("prefere o clientId do perfil quando o fallback do root admin nao existe na lista", () => {
    expect(resolveSessionSimulationFallbackClientId({
      canSimulate: true,
      currentClientId: 1,
      profileClientId: 2,
      availableOptions: [
        { value: 4, label: "ACME" },
        { value: 3, label: "Pérola" },
        { value: 2, label: "Root" }
      ]
    })).toBe(2);
  });

  it("mantem o client atual quando ele ja existe na lista", () => {
    expect(resolveSessionSimulationFallbackClientId({
      canSimulate: true,
      currentClientId: 4,
      profileClientId: 2,
      availableOptions: [
        { value: 4, label: "ACME" },
        { value: 3, label: "Pérola" },
        { value: 2, label: "Root" }
      ]
    })).toBe(4);
  });
});
