# Módulo Finance — platform-core

Módulo financeiro: **planilhas mensais, linhas de entrada/saída, ajustes, configuração financeira por tenant**.

---

## Arquivos Esperados

| Arquivo | Responsabilidade |
|---------|-----------------|
| `service.go` | Service struct + métodos públicos |
| `helpers.go` | Normalização de UUID e datas (helpers internos) |
| `types.go` | Tipos separados: list vs detalhe vs input de mutação |
| `errors.go` | Erros tipados do módulo |

**Handler HTTP:** `../../httpapi/handlers/finance.go`
**Migration:** `../../../migrations/0012_finance.sql`

---

## Endpoints

| Método | Path | Descrição |
|--------|------|-----------|
| `GET` | `/core/admin/finance-sheets` | Lista planilhas (metadata + summary, sem linhas) |
| `GET` | `/core/admin/finance-sheets/{sheetId}` | Detalhe completo (planilha + linhas + ajustes) |
| `POST` | `/core/admin/finance-sheets` | Cria nova planilha |
| `PUT` | `/core/admin/finance-sheets/{sheetId}` | Substitui planilha completa (save do editor) |
| `PATCH` | `/core/admin/finance-sheets/{sheetId}/lines/{lineId}` | Mutação leve de uma linha |
| `GET` | `/core/admin/finance-config` | Configuração financeira do tenant |
| `PUT` | `/core/admin/finance-config` | Atualiza configuração |

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

### Mutação leve de linha (`PATCH .../lines/{lineId}`)

Aceita apenas o necessário (ex: `effective`, `effectiveDate`). Retorna `line + summary + preview + updatedAt`.

### Save completo (`PUT /finance-sheets/{id}`)

Aceita o recurso completo. **Não usar para toggles simples de linha.**

---

## Tipos Go

```go
// Lista — campos mínimos
type SheetListItem struct {
    ID, Title, Period, Status, ClientName string
    Summary SheetSummary
    Preview string
}

// Detalhe — inclui linhas
type SheetDetail struct {
    SheetListItem
    Entradas  []Line
    Saidas    []Line
    Adjustments []Adjustment
}
```

---

## Regras Obrigatórias

- Lista e detalhe usam **tipos diferentes** — nunca o mesmo struct para os dois
- Summaries calculados em SQL (não carregar listas para somar em memória)
- IDs públicos de planilha usam UUID; `legacy_id` é apenas legado interno
- IDs de linhas e ajustes preservados quando válidos a cada save
- `effectiveDate` automático usa timezone `America/Sao_Paulo`
- `fixedAccountId` de linha deve referenciar conta fixa do **mesmo tenant**
- `categoryId` de conta fixa deve referenciar categoria da **mesma config**
- Referências inválidas são descartadas no backend (não propagam erro silencioso)

---

## Helpers Centrais (helpers.go)

- Normalização de UUID — validar e padronizar antes de qualquer query
- Normalização de datas — converter timezone e tratar valores nulos

---

## Schema PostgreSQL (`platform_core`)

| Tabela | Uso |
|--------|-----|
| `finance_sheets` | Planilhas mensais |
| `finance_lines` | Linhas de entrada/saída (kind: entrada/saida) |
| `finance_line_adjustments` | Ajustes por linha |
| `finance_configs` | Configuração por tenant |
| `finance_fixed_accounts` | Contas fixas recorrentes |
| `finance_categories` | Categorias de conta fixa |

**Índices críticos:**
- `config_id + position` em fixed_accounts
- `sheet_id + kind + position` em lines

---

## Sinais de Regressão

Se aparecer qualquer um desses, há bug:
- Listagem retornando arrays de linhas
- Editor precisando carregar todas as planilhas para abrir uma
- `effective=true` com `effectiveDate` vazio
- IDs de linha trocados a cada save completo
