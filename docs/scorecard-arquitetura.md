# Scorecard de Arquitetura

Objetivo: medir a maturidade tecnica da plataforma com uma nota simples (`0` a `10`) para acompanhar evolucao.

Como a nota e calculada no portal `/docs`:

1. Cada item de checklist conta para o percentual.
2. `[x]` = concluido.
3. `[-]` = em andamento.
4. `[ ]` = pendente.
5. Nota final = `% de conclusao / 10` (arredondado para 1 casa).

## Arquitetura base

- [x] API e worker stateless.
- [x] Separacao de responsabilidades (`painel-web`, `atendimento-online-api`, `atendimento-online-worker`, `db`, `queue`).
- [x] Isolamento multi-tenant no backend.
- [-] Padrao de modulo plugavel fechado em todos os dominios.
- [ ] Contratos de integracao 100% versionados.

## Dados e persistencia

- [x] Modelo de mensagem com tipos (`TEXT`, `IMAGE`, `AUDIO`, `VIDEO`, `DOCUMENT`).
- [x] Estrategia de retencao configuravel por tenant.
- [ ] Estrategia de migracao/rollback formalizada.
- [ ] Particionamento/estrategia de crescimento para alto volume.
- [x] Auditoria completa de eventos criticos.

## Integracao WhatsApp

- [x] Fluxo de conexao por QR operacional.
- [-] Robustez de midia inbound/outbound em todos os cenarios.
- [-] Dedupe de eco em todos os tipos de mensagem.
- [ ] Fallback completo para conteudo nao suportado.
- [-] Observabilidade de falha por tipo de payload.

## Frontend e UX operacional

- [x] Inbox modular com composables de dominio.
- [x] Layout com paineis redimensionaveis e scroll controlado.
- [-] BI de progresso do projeto integrado aos docs.
- [ ] Paridade de UX com WhatsApp para emojis/stickers/mencoes.
- [ ] Acessibilidade completa e testes de UX.

## Qualidade e operacao

- [-] Testes automatizados de composables.
- [x] Testes de integracao API para midia.
- [ ] Testes E2E de fluxo principal.
- [x] Pipeline CI com gates de build/test/lint.
- [ ] Alertas operacionais e SLO definidos.
