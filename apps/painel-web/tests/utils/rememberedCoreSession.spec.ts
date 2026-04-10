import { describe, expect, it } from "vitest";

import { hasRememberedSessionTenantMismatch } from "../../server/utils/remembered-core-session";

function buildToken(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");

  return `${header}.${body}.signature`;
}

describe("remembered core session", () => {
  it("detecta mismatch entre tenant do token e tenant atual do perfil", () => {
    const accessToken = buildToken({ tenant_id: "tenant-acme" });

    expect(hasRememberedSessionTenantMismatch(accessToken, {
      tenantId: "tenant-root"
    })).toBe(true);
  });

  it("aceita token quando tenant do token e do perfil estao alinhados", () => {
    const accessToken = buildToken({ tenant_id: "tenant-root" });

    expect(hasRememberedSessionTenantMismatch(accessToken, {
      tenantId: "tenant-root"
    })).toBe(false);
  });

  it("ignora token invalido sem forcar limpeza da sessao", () => {
    expect(hasRememberedSessionTenantMismatch("not-a-jwt", {
      tenantId: "tenant-root"
    })).toBe(false);
  });
});