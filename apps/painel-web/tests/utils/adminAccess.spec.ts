import { describe, expect, it } from "vitest";

import { evaluateAdminRouteAccess, resolveAccessibleAdminRedirect } from "~/utils/admin-access";

function buildAccessContext(options: {
  isRootUser?: boolean;
  sessionUserLevel?: "admin" | "consultant" | "manager" | "marketing" | "finance" | "viewer";
  enabledModules?: string[];
}) {
  const enabledModules = new Set((options.enabledModules ?? []).map((item) => String(item).trim().toLowerCase()));

  return {
    isAuthenticated: true,
    isRootUser: options.isRootUser ?? false,
    profileUserType: "admin",
    profileUserLevel: "admin",
    sessionUserType: "admin",
    sessionUserLevel: options.sessionUserLevel ?? "admin",
    preferences: "{}",
    hasModule: (moduleCode: string) => enabledModules.has(String(moduleCode).trim().toLowerCase())
  };
}

describe("admin module access", () => {
  it("nega financeiro para root quando o cliente selecionado nao possui o modulo", () => {
    const result = evaluateAdminRouteAccess("/admin/finance", buildAccessContext({
      isRootUser: true,
      enabledModules: ["atendimento"]
    }));

    expect(result).toMatchObject({
      allowed: false,
      reason: "module-finance"
    });
  });

  it("permite fila de atendimento quando o cliente selecionado possui o modulo", () => {
    const result = evaluateAdminRouteAccess("/admin/fila-atendimento", buildAccessContext({
      isRootUser: true,
      enabledModules: ["fila-atendimento"]
    }));

    expect(result).toMatchObject({
      allowed: true,
      featureCode: "fila-atendimento"
    });
  });

  it("permite fila de atendimento para consultor quando o modulo esta ativo", () => {
    const result = evaluateAdminRouteAccess("/admin/fila-atendimento", buildAccessContext({
      sessionUserLevel: "consultant",
      enabledModules: ["fila-atendimento"]
    }));

    expect(result).toMatchObject({
      allowed: true,
      featureCode: "fila-atendimento"
    });
  });

  it("nega indicadores quando o cliente selecionado nao possui o modulo", () => {
    const result = evaluateAdminRouteAccess("/admin/indicadores", buildAccessContext({
      isRootUser: true,
      enabledModules: ["fila-atendimento"]
    }));

    expect(result).toMatchObject({
      allowed: false,
      reason: "module-indicators"
    });
  });

  it("permite governanca global de indicadores para root mesmo sem o modulo no cliente", () => {
    const result = evaluateAdminRouteAccess("/admin/manage/indicadores", buildAccessContext({
      isRootUser: true,
      enabledModules: ["fila-atendimento"]
    }));

    expect(result).toMatchObject({
      allowed: true,
      featureCode: "manage.indicators"
    });
  });

  it("permite a pagina de modulos para admin sem depender de modulo ativo no cliente", () => {
    const result = evaluateAdminRouteAccess("/admin/manage/modulos", buildAccessContext({
      enabledModules: []
    }));

    expect(result).toMatchObject({
      allowed: true,
      featureCode: "manage.modules"
    });
  });

  it("permite indicadores quando o cliente selecionado possui o modulo", () => {
    const result = evaluateAdminRouteAccess("/admin/indicadores", buildAccessContext({
      isRootUser: true,
      enabledModules: ["indicators"]
    }));

    expect(result).toMatchObject({
      allowed: true,
      featureCode: "indicators"
    });
  });

  it("resolve redirect acessivel quando a rota pedida perdeu acesso por modulo", () => {
    const redirect = resolveAccessibleAdminRedirect("/admin/finance", buildAccessContext({
      isRootUser: true,
      enabledModules: ["fila-atendimento"]
    }));

    expect(redirect).toBe("/admin/fila-atendimento");
  });

  it("mantem acesso do financeiro para perfil finance quando o modulo esta ativo", () => {
    const result = evaluateAdminRouteAccess("/admin/finance", buildAccessContext({
      sessionUserLevel: "finance",
      enabledModules: ["finance"]
    }));

    expect(result).toMatchObject({
      allowed: true,
      featureCode: "finance"
    });
  });
});
