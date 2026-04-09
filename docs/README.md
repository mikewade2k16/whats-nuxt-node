# Documentacao do Projeto

Este diretorio centraliza a documentacao tecnica e operacional do MVP omnichannel.

## Objetivo do MVP

Entregar uma plataforma multi-tenant de atendimento para:

1. Receber mensagens de WhatsApp (via Evolution + Baileys, nao oficial).
2. Responder mensagens pelo painel web (texto e midia).
3. Garantir base pronta para evoluir para Instagram oficial da Meta.
4. Comecar simples, mas com arquitetura que suporte escala horizontal.

## Como usar esta documentacao

1. Se precisa entender a arquitetura geral: leia `docs/architecture.md`.
2. Se precisa alterar ou debugar endpoint: leia `docs/api-reference.md`.
3. Se precisa configurar WhatsApp Evolution: leia `docs/evolution-setup.md`.
4. Se precisa diagnosticar erros: leia `docs/troubleshooting.md`.
5. Se precisa entender banco atual: leia `docs/data-model-current.md`.
6. Se precisa planejar evolucao de banco/escala: leia `docs/data-model-target.md`.
7. Se precisa ajustar UI/front: leia `docs/frontend-ui.md`.
8. Se precisa acompanhar evolucao para paridade WhatsApp Web: leia `docs/roadmap-whatsapp-parity.md`.
9. Se precisa acompanhar backlog executavel por tarefa: leia `docs/backlog-execucao.md`.
10. Se precisa acompanhar nota de arquitetura: leia `docs/scorecard-arquitetura.md`.
11. Se precisa acompanhar metas por sprint: leia `docs/sprints-execucao.md`.
12. Se precisa acompanhar docs pela interface web do modulo omnichannel: acesse `/admin/omnichannel/docs`.
13. Se precisa rodar testes de composable/front: use scripts em `apps/painel-web/package.json` e veja a secao de testes em `docs/frontend-ui.md`.
14. Se precisa configurar pipeline CI no GitHub Actions: leia `docs/ci-github-actions.md`.
15. Se precisa rodar bateria automatica de midia (pipeline/fila/worker): use `npm run test:media:battery` em `apps/atendimento-online-api` e veja `docs/ci-github-actions.md`.
16. Se precisa auditar isolamento entre tenants (seguranca): use `npm run test:tenant:isolation` em `apps/atendimento-online-api` e veja `docs/ci-github-actions.md`.
17. Se precisa consultar trilha de auditoria de eventos criticos: use `GET /tenant/audit-events` (`ADMIN`/`SUPERVISOR`) e veja `docs/api-reference.md`.
18. Se precisa validar integracao de midia ponta a ponta: use `npm run test:media:integration` em `apps/atendimento-online-api` e veja `docs/ci-github-actions.md`.
19. Se precisa revisar planejamento do chat interno e suporte tenant->admin: leia `docs/planejamento-chat-interno-suporte.md`.
20. Se precisa validar gate de release do MVP (texto + midia + dedupe): use `npm run test:gate:mvp` em `apps/atendimento-online-api` e veja `docs/ci-github-actions.md`.
21. Se precisa validar a jornada principal (login -> inbox -> envio -> recebimento): use `npm run test:journey:e2e` em `apps/atendimento-online-api`.
22. Se precisa ajustar limite de upload por cliente: use `PATCH /tenant` com `maxUploadMb` ou o campo `Limite upload por arquivo (MB)` em `/admin`.
23. Se precisa entender a fusao do front legado com o novo painel: leia `docs/painel-web-merge.md`.
24. Se precisa acompanhar o plano de performance/infra desta fase: leia `docs/sprint-otimizacao-geral.md`.
25. Se precisa planejar ownership de funcionalidades por modulo (omnichannel/core/crm/automation/IA): leia `docs/modular-feature-matrix.md`.

## Regra obrigatoria de contexto

Antes de iniciar qualquer implementacao ou refatoracao:

1. Ler este `docs/README.md` e pelo menos os `.md` diretamente ligados ao modulo que sera alterado.
2. Confirmar no `.md` do modulo as regras de nao regressao e os contratos ativos.
3. Atualizar a documentacao impactada no mesmo ciclo da entrega (codigo + doc juntos).

## Mapa rapido de codigo

- API Node: `apps/atendimento-online-api/src`
- Front Nuxt 4 principal: `apps/painel-web`
- Modulo omnichannel no front principal: `apps/painel-web/app/components/omnichannel`
- CSS global do front principal: `apps/painel-web/app/assets/css/main.css`
- Tokens visuais: `apps/painel-web/app/assets/css/tokens.css`
- Modelo Prisma: `apps/atendimento-online-api/prisma/schema.prisma`
- Orquestracao local: `docker-compose.yml`
- Variaveis: `.env` e `.env.example`

## Portal de documentacao no front

1. Rota: `/admin/omnichannel/docs`.
2. Funcao: listar todos os `.md` e abrir leitura com status de checklist.
3. Status de checklist:
- `Concluido`: itens `[x]`.
- `Em andamento`: itens `[-]` ou `[~]`.
- `Pendente`: itens `[ ]`.
4. Em Docker, o `painel-web` precisa montar a pasta `./docs` para leitura dinamica.
