import { describe, expect, it } from "vitest";

import { financeRecurringRowId, financeRecurringStoreRowId, isFinanceRecurringStoreRowId, parseFinanceRecurringClientId } from "~/utils/finance-ids";

describe("finance recurring ids", () => {
  it("mantem id estavel para a mesma loja do mesmo cliente", () => {
    expect(financeRecurringStoreRowId(9, "Loja Centro")).toBe(
      financeRecurringStoreRowId(9, "  loja   centro ")
    );
  });

  it("gera ids diferentes para lojas diferentes do mesmo cliente", () => {
    expect(financeRecurringStoreRowId(9, "Loja Centro")).not.toBe(
      financeRecurringStoreRowId(9, "Loja Norte")
    );
  });

  it("marca corretamente ids de recorrencia por loja", () => {
    expect(isFinanceRecurringStoreRowId(financeRecurringStoreRowId(12, "Loja Sul"))).toBe(true);
    expect(isFinanceRecurringStoreRowId(financeRecurringRowId(12))).toBe(false);
  });

  it("continua parseando ids de recorrencia por cliente para o caso agregado", () => {
    expect(parseFinanceRecurringClientId(financeRecurringRowId(42))).toBe(42);
  });
});