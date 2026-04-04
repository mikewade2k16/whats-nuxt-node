# AGENTS.md - domain/finance

Modulo financeiro do `platform-core`.

## Responsabilidades

- planilhas financeiras mensais
- linhas de entrada e saida
- ajustes por linha
- configuracao financeira por tenant
- contas fixas, categorias e recorrencias

## Contrato de payload

### Lista

`ListSheets` retorna somente:

- metadados da planilha
- `summary`
- `preview`

Nao retorna `entradas`, `saidas` ou `adjustments`.

### Detalhe

`GetSheet`, `CreateSheet` e `ReplaceSheet` retornam:

- planilha completa
- linhas
- ajustes
- summary recalculado

### Mutacao leve de linha

Para alteracoes pequenas de uma linha individual, preferir endpoint dedicado:

- `PATCH /core/admin/finance-sheets/{sheetId}/lines/{lineId}`

Esse fluxo deve carregar/enviar apenas o necessario para a linha alterada, por exemplo:

- `effective`
- `effectiveDate`

E retornar somente:

- `line`
- `summary`
- `preview`
- `updatedAt`

### Save completo do editor

Quando o editor precisar substituir a planilha inteira, usar:

- `PUT /core/admin/finance-sheets/{sheetId}`

Esse endpoint aceita o recurso completo e nao deve ser usado para toggles simples de linha.

## Regras obrigatorias

- lista e detalhe usam tipos diferentes
- summaries sao calculados em SQL ou no backend sem carregar listas desnecessarias na listagem
- IDs publicos de planilha usam UUID; `legacy_id` fica apenas como legado interno de banco
- IDs de linhas e ajustes devem ser preservados quando validos
- `effectiveDate` automatico usa `America/Sao_Paulo`
- config e planilhas sao responsabilidades do mesmo modulo, mas com endpoints separados
- rotas publicas devem ser descritivas; usar `finance-sheets` para planilhas e `finance-config` para configuracao do modulo
- `fixedAccountId` em linhas deve apontar apenas para contas fixas do mesmo tenant; referencias invalidas devem ser descartadas no backend
- `categoryId` em contas fixas deve apontar apenas para categorias da mesma config; referencia cruzada deve falhar como `invalid input`

## Boas praticas do modulo

- normalizacao de UUID em helper central
- normalizacao de datas em helper central
- payload de update explicito, sem aceitar campos desconhecidos
- correcoes de dado legado via migration propria
- indices devem refletir os filtros e a ordenacao usados pelo modulo (`config_id + position`, `sheet_id + kind + position`)

## Sinais de regressao

- listagem trazendo arrays de linhas
- editor precisando carregar todas as planilhas completas para abrir uma
- `effective=true` com data vazia
- troca de IDs de linha a cada save
