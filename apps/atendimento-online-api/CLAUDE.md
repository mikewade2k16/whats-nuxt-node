# apps/atendimento-online-api

Referência legada do módulo de atendimento online.

A fonte de verdade atual para arquitetura e regras de mudança é [AGENTS.md](./AGENTS.md).

## Resumo

- Serviço Node.js/Fastify do atendimento omnichannel.
- Porta padrão: `4000`.
- Schema PostgreSQL: `atendimento_online`.
- Tenant, usuário, grants, limites e elegibilidade de acesso vêm do `platform_core`.
- O módulo mantém apenas runtime operacional, webhooks, conversas, mensagens, contatos, instâncias e trilha local.

## Banco do módulo

Tabelas operacionais atuais:

1. `AtendimentoTenantConfig`
2. `WhatsAppInstance`
3. `SavedSticker`
4. `Contact`
5. `Conversation`
6. `Message`
7. `AuditEvent`
8. `HiddenMessageForUser`

O módulo não mantém mais:

- `Tenant` local
- `User` local
- `WhatsAppInstanceUserAccess`
- `evolutionApiKey` persistido no banco
- enums locais de acesso persistidos no schema

## Integração com o core

- autenticação principal via `plataforma-api`
- diretório de usuários consumido do core
- tenant efetivo resolvido por token do core, `x-selected-tenant-slug` e `x-client-id` quando aplicável
- grants e acesso ao módulo resolvidos no shell

## Fluxos principais

- `GET /health`
- rotas de tenant runtime em `src/routes/tenant/`
- rotas de conversas em `src/routes/conversations/`
- webhooks em `src/routes/webhooks/`
- workers em `src/workers/`

## Comandos úteis

```bash
npm run prisma:generate
npm run prisma:converge
npm run prisma:push
npm run prisma:seed
npm run build
```

## Observação

Se houver divergência entre este arquivo e `AGENTS.md`, prevalece `AGENTS.md`.
