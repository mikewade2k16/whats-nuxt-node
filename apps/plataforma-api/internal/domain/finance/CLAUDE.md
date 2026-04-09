# MÃ³dulo Finance â€” plataforma-api

MÃ³dulo financeiro: **planilhas mensais, linhas de entrada/saÃ­da, ajustes, configuraÃ§Ã£o financeira por tenant**.

---

## Arquivos Esperados

| Arquivo | Responsabilidade |
|---------|-----------------|
| `service.go` | Service struct + mÃ©todos pÃºblicos |
| `helpers.go` | NormalizaÃ§Ã£o de UUID e datas (helpers internos) |
| `types.go` | Tipos separados: list vs detalhe vs input de mutaÃ§Ã£o |
| `errors.go` | Erros tipados do mÃ³dulo |

**Handler HTTP:** `../../httpapi/handlers/finance.go`
**Migration:** `../../../migrations/0012_finance.sql`

---

## Endpoints

| MÃ©todo | Path | DescriÃ§Ã£o |
|--------|------|-----------|
| `GET` | `/core/admin/finance-sheets` | Lista planilhas (metadata + summary, sem linhas) |
| `GET` | `/core/admin/finance-sheets/{sheetId}` | Detalhe completo (planilha + linhas + ajustes) |
| `POST` | `/core/admin/finance-sheets` | Cria nova planilha |
| `PUT` | `/core/admin/finance-sheets/{sheetId}` | Substitui planilha completa (save do editor) |
| `PATCH` | `/core/admin/finance-sheets/{sheetId}/lines/{lineId}` | MutaÃ§Ã£o leve de uma linha |
| `GET` | `/core/admin/finance-config` | ConfiguraÃ§Ã£o financeira do tenant |
| `PUT` | `/core/admin/finance-config` | Atualiza configuraÃ§Ã£o |

---

## Contratos de Payload

### Lista (`GET /finance-sheets`)

Retorna **somente**:
- Metadados da planilha (id, title, period, status, clientName)
- `summary` (totais calculados)
- `preview`

**Nunca** retorna `entradas`, `saidas` ou `adjustments` na lista.

### Detalhe (`GET /finance-sheets/{id}`)

Retorna planilha completa com linhas e ajustes.

### MutaÃ§Ã£o leve de linha (`PATCH .../lines/{lineId}`)

Aceita apenas o necessÃ¡rio (ex: `effective`, `effectiveDate`). Retorna `line + summary + preview + updatedAt`.

### Save completo (`PUT /finance-sheets/{id}`)

Aceita o recurso completo. **NÃ£o usar para toggles simples de linha.**

---

## Tipos Go

```go
// Lista â€” campos mÃ­nimos
type SheetListItem struct {
    ID, Title, Period, Status, ClientName string
    Summary SheetSummary
    Preview string
}

// Detalhe â€” inclui linhas
type SheetDetail struct {
    SheetListItem
    Entradas  []Line
    Saidas    []Line
    Adjustments []Adjustment
}
```

---

## Regras ObrigatÃ³rias

- Lista e detalhe usam **tipos diferentes** â€” nunca o mesmo struct para os dois
- Summaries calculados em SQL (nÃ£o carregar listas para somar em memÃ³ria)
- IDs pÃºblicos de planilha usam UUID; `legacy_id` Ã© apenas legado interno
- IDs de linhas e ajustes preservados quando vÃ¡lidos a cada save
- `effectiveDate` automÃ¡tico usa timezone `America/Sao_Paulo`
- `fixedAccountId` de linha deve referenciar conta fixa do **mesmo tenant**
- `categoryId` de conta fixa deve referenciar categoria da **mesma config**
- ReferÃªncias invÃ¡lidas sÃ£o descartadas no backend (nÃ£o propagam erro silencioso)

---

## Helpers Centrais (helpers.go)

- NormalizaÃ§Ã£o de UUID â€” validar e padronizar antes de qualquer query
- NormalizaÃ§Ã£o de datas â€” converter timezone e tratar valores nulos

---

## Schema PostgreSQL (`platform_core`)

| Tabela | Uso |
|--------|-----|
| `finance_sheets` | Planilhas mensais |
| `finance_lines` | Linhas de entrada/saÃ­da (kind: entrada/saida) |
| `finance_line_adjustments` | Ajustes por linha |
| `finance_configs` | ConfiguraÃ§Ã£o por tenant |
| `finance_fixed_accounts` | Contas fixas recorrentes |
| `finance_categories` | Categorias de conta fixa |

**Ãndices crÃ­ticos:**
- `config_id + position` em fixed_accounts
- `sheet_id + kind + position` em lines

---

## Sinais de RegressÃ£o

Se aparecer qualquer um desses, hÃ¡ bug:
- Listagem retornando arrays de linhas
- Editor precisando carregar todas as planilhas para abrir uma
- `effective=true` com `effectiveDate` vazio
- IDs de linha trocados a cada save completo
