# AGENTS.md - domain/finance

## Identidade do módulo

- papel: domínio financeiro administrativo do `plataforma-api`
- status: ativo

## Responsabilidades

- planilhas financeiras mensais
- linhas de entrada e saída
- ajustes por linha
- configuração financeira por tenant
- categorias, contas fixas e recorrências

## Contratos que consome

- `ActorContext`: usuário autenticado que opera a planilha
- `TenantContext`: tenant ativo e isolamento de dados
- `AccessPolicy`: validação de acesso ao módulo `finance`
- `PersistenceProvider`: acesso ao schema `platform_core`
- `Clock`: datas automáticas e normalização de `effectiveDate` em `America/Sao_Paulo`

## Contratos que exporta

- `ListSheetsInput` e `SheetListItem`
- `GetSheetInput` e `SheetDetail`
- `CreateSheetInput`
- `ReplaceSheetInput`
- `PatchLineInput` e `LineMutationResult`
- `GetConfigInput` e `Config`
- `ReplaceConfigInput`
- endpoints administrativos `finance-sheets` e `finance-config`

## Persistência sob responsabilidade do módulo

- schema: `platform_core`
- tabelas principais: `finance_configs`, `finance_categories`, `finance_fixed_accounts`, `finance_fixed_account_members`, `finance_recurring_entries`, `finance_sheets`, `finance_lines`, `finance_line_adjustments`
- migrations-base: `0012_finance_module.sql`, `0013_backfill_finance_effective_dates.sql`, `0014_fix_finance_effective_dates_timezone.sql`, `0015_finance_scalability_indexes.sql`
- índices esperados: `config_id + position`, `fixed_account_id + position`, `sheet_id + kind + position`

## Endpoints, filas e interfaces expostas

- `GET /core/admin/finance-sheets`
- `POST /core/admin/finance-sheets`
- `GET /core/admin/finance-sheets/{sheetId}`
- `PUT /core/admin/finance-sheets/{sheetId}`
- `PATCH /core/admin/finance-sheets/{sheetId}/lines/{lineId}`
- `DELETE /core/admin/finance-sheets/{sheetId}`
- `GET /core/admin/finance-config`
- `PUT /core/admin/finance-config`

## Eventos e sinais de integração

- publicados: nenhum evento de domínio formal no momento
- consumidos: nenhum evento de domínio formal no momento

## O que o módulo não pode conhecer

- tela concreta do painel
- store ou composable do frontend
- tabelas internas do módulo `atendimento`
- usuário, cliente ou tenant como implementação concreta externa ao seu contexto
- payload gigante de detalhe em endpoint de lista

## Checks mínimos de mudança

- `go test ./...`
- validar lista leve versus detalhe completo
- validar `effectiveDate` com timezone `America/Sao_Paulo`
- revisar se IDs públicos, linhas e ajustes permanecem estáveis

## Regras obrigatórias do módulo

### Lista

`ListSheets` retorna somente:

- metadados da planilha
- `summary`
- `preview`

Não retorna `entradas`, `saidas` ou `adjustments`.

### Detalhe

`GetSheet`, `CreateSheet` e `ReplaceSheet` retornam:

- planilha completa
- linhas
- ajustes
- summary recalculado

### Mutação leve de linha

Para alterações pequenas de uma linha individual, preferir endpoint dedicado:

- `PATCH /core/admin/finance-sheets/{sheetId}/lines/{lineId}`

Esse fluxo deve carregar e enviar apenas o necessário para a linha alterada, por exemplo:

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

Esse endpoint aceita o recurso completo e não deve ser usado para toggles simples de linha.

## Sinais de regressão

- listagem trazendo arrays de linhas
- editor precisando carregar todas as planilhas completas para abrir uma
- `effective=true` com data vazia
- troca de IDs de linha a cada save
