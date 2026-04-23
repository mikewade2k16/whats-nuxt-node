# AGENTS.md - observability

## Identidade do módulo

- papel: métricas técnicas de página, chamadas HTTP e ações do módulo `fila-atendimento`
- status: piloto para medir a página `/admin/fila-atendimento`

## Responsabilidades

- persistir eventos técnicos leves em `page_metric_events`
- expor listagem resumida para diagnóstico de performance e UX
- manter payload flexível em `jsonb` sem armazenar segredos, tokens ou PII sensível

## Contratos

- entrada HTTP:
  - `GET /v1/observability/page-metrics`
  - `POST /v1/observability/page-metrics`
- contexto:
  - `AccessContext` vindo do módulo de auth

## Limites

- este módulo não executa ações operacionais da fila
- este módulo não substitui logging de infraestrutura, APM ou auditoria de negócio
- eventos devem ser amostras enxutas; não salvar request/response completos

## Persistência

- schema alvo: `fila_atendimento`
- tabela: `page_metric_events`

## Checks mínimos

- `go test ./...` em `modules/fila-atendimento/backend`
