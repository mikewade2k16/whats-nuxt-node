# Documentacao do Projeto

Este diretorio centraliza a documentacao tecnica e operacional do MVP omnichannel.

## Objetivo do MVP

Entregar uma plataforma multi-tenant de atendimento para:

1. Receber mensagens de WhatsApp (via Evolution + Baileys, nao oficial).
2. Responder mensagens pelo painel web.
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
9. Se precisa rodar testes de composable/front: use scripts em `apps/web/package.json` e veja a secao de testes em `docs/frontend-ui.md`.

## Mapa rapido de codigo

- API Node: `apps/api/src`
- Front Nuxt 4: `apps/web`
- CSS global do front: `apps/web/assets/css/main.css`
- Tokens visuais: `apps/web/assets/css/tokens.css`
- Modelo Prisma: `apps/api/prisma/schema.prisma`
- Orquestracao local: `docker-compose.yml`
- Variaveis: `.env` e `.env.example`
