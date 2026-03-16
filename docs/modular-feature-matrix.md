# Matriz de Funcionalidades por Modulo

Objetivo: definir ownership por modulo para evitar acoplamento e permitir evolucao gradual de infra, mantendo o codigo separado por dominio.

## Regra de ownership

1. `platform-core`: auth, RBAC, tenants, usuarios, planos, limites e auditoria global.
2. `omnichannel`: inbox, conversas, mensagens, roteamento operacional e conectores de canais.
3. `crm`: entidades de lead/cliente, funil e vinculacao comercial.
4. `automation`: bots, fluxos, campanhas, templates e handoff.
5. `analytics`: dashboards gerenciais, SLA, produtividade e CSAT.
6. `ai-assistant`: copiloto, classificacao inteligente, resumo e sugestoes.

## Nivel essencial (nao ficar para tras)

- [x] Inbox compartilhada por equipe -> `omnichannel`.
- [x] Multiatendente no mesmo numero -> `omnichannel`.
- [ ] WhatsApp API oficial -> `omnichannel` (conector oficial separado do conector Evolution).
- [ ] Instagram DM integrado -> `omnichannel` (modulo de canal).
- [x] Historico unificado do cliente (WhatsApp) -> `omnichannel` + `crm` (fase 2 para unificar multi-canal real).
- [-] Atribuicao manual e automatica -> manual em `omnichannel`; auto-atribuicao em `automation`.
- [-] Tags, status e prioridade -> status pronto em `omnichannel`; tags/prioridade entram em `crm` + `omnichannel`.
- [x] Notas internas -> `omnichannel`.
- [-] Relatorios basicos de volume e tempo de resposta -> base tecnica em `analytics`; falta consolidar SLA/tempo medio operacional.
- [ ] Chatbot/menu inicial -> `automation`.
- [ ] Handoff bot -> humano -> `automation` + `omnichannel`.
- [-] Integracoes basicas com CRM/webhook/API -> webhook/API base em `platform-core` + `omnichannel`; conectores CRM dedicados em `crm`.

## Nivel mercado maduro

- [ ] SLA e gestao de tickets -> `analytics` + `omnichannel`.
- [ ] Filas/equipes/departamentos -> `omnichannel` + `platform-core`.
- [ ] Roteamento por assunto/canal/horario/competencia -> `automation`.
- [ ] Base de conhecimento -> `automation` + `ai-assistant`.
- [ ] Campanhas ativas/templates -> `automation`.
- [ ] Qualificacao de leads -> `crm` + `automation`.
- [ ] Painel de produtividade por atendente -> `analytics`.
- [ ] Pesquisa de satisfacao -> `analytics` + `automation`.
- [ ] Dashboard gerencial -> `analytics`.
- [ ] Auditoria/governanca avancada -> `platform-core`.

## Nivel top players 2026

- [ ] Agente de IA treinado na base -> `ai-assistant`.
- [ ] Sugestao de resposta e resumo automatico -> `ai-assistant`.
- [ ] Transcricao de audio -> `ai-assistant` + `omnichannel`.
- [ ] Classificacao de intencao/sentimento -> `ai-assistant`.
- [ ] WhatsApp Flows -> `omnichannel` + `automation`.
- [ ] Catalogo/carrossel interativo -> `omnichannel`.
- [ ] Voz/chamada integrada -> `omnichannel`.
- [ ] Copilot para atendente -> `ai-assistant`.
- [ ] Automacao ponta a ponta suporte + vendas + pos-venda -> `automation` + `crm` + `omnichannel`.

## Estado atual do Sprint 6 (contatos)

- [x] `C3-006` entregue: importacao de contatos do WhatsApp para `Contact` com preview (`dryRun`) e merge por lote.
- [ ] `C3-005` pendente: conversao de contato para lead/cliente no modulo `crm`.

## Regra operacional de implementacao

Antes de codar qualquer item:

1. Ler `docs/README.md` e os `.md` do modulo alvo.
2. Confirmar contratos atuais (`docs/api-reference.md`, `docs/inbox.md`, `docs/architecture.md`).
3. Entregar codigo + atualizacao da documentacao no mesmo ciclo.
