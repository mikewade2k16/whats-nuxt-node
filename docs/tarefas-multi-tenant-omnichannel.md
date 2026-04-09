# Tarefas: Multi-Tenant Omnichannel - Finalizacao

> Gerado em 2026-03-16 com base na auditoria completa do banco, API e frontend.
> Este documento serve como guia para qualquer agente/IA continuar o trabalho.

---

## Contexto do Projeto

### Arquitetura
- **Frontend:** Nuxt 4 + Vue 3 + Pinia (`apps/painel-web/`)
- **Backend API:** Fastify + Prisma + Socket.IO (`apps/atendimento-online-api/`)
- **Platform Core:** Go (autenticacao centralizada, multi-tenant, modulos) (`apps/plataforma-api/`)
- **WhatsApp:** Evolution API (instancia externa) conectada via webhooks
- **Infra:** Docker Compose com volumes (hot reload), Redis, PostgreSQL

### Como funciona o multi-tenant
1. O **plataforma-api** (Go) gerencia tenants, usuarios, modulos e limites
2. O **API** (Node) armazena dados operacionais (conversas, mensagens) isolados por `tenantId`
3. O login gera um JWT com `tenantId` fixo - todas as queries usam esse ID
4. Um **platform admin** (super root) pode atualizar o contexto operacional via `POST /session/context`
5. Cada tenant pode ter 1+ instancias WhatsApp, cada uma com sua conexao no Evolution API

### Modulos por cliente (plataforma-api)
Os clientes tem modulos atribuidos. Exemplo atual:
- **Duby:** Core Panel + Atendimento
- **Perola:** Core Panel (SEM atendimento)
- **Root:** Core Panel + Atendimento + Finance + Kanban

Regra: "Module must be active on CLIENT AND user must be allocated to module"

### Banco de dados relevante (schema Prisma)
- `Tenant` ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ id (cuid), slug, name, whatsappInstance, maxChannels, maxUsers
- `User` ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ tenantId (FK), email, role (ADMIN/SUPERVISOR/AGENT/VIEWER)
- `WhatsAppInstance` ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ tenantId (FK), instanceName, isActive, userScopePolicy
- `WhatsAppInstanceUserAccess` ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ tenantId, instanceId, userId
- `Conversation` ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ tenantId (FK), instanceId (FK), externalId, contactName
- `Message` ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ tenantId (FK), conversationId (FK), content, direction

---

## Regras de visibilidade por perfil de usuario (operacao page)

> **Atualizado 2026-03-16** apos reestruturacao UX da pagina de operacao.

| Card / Funcao | Platform Admin (`canSimulate=true`) | Client Admin (role=ADMIN) | Supervisor/Agent/Viewer |
|--------------|--------------------------------------|---------------------------|-------------------------|
| Dropdown troca de tenant | Sim | Nao | Nao |
| **Card "Conexao WhatsApp"** (PRIMEIRO) | Sim (campo instanceName visivel) | Sim (campo instanceName oculto, auto-gerado) | Nao (so le) |
| Card "Cliente atual" | Todos os campos editaveis | Nome/retencao/upload editaveis; maxChannels/maxUsers so leitura; sem webhookUrl/evolutionApiKey | Nao |
| Card "Instancias WhatsApp do cliente" | Todos os campos (incluindo instanceName, apiKey) | Campos tecnicos ocultos (instanceName auto-gerado, sem apiKey) | Nao |
| Card "Acesso ao Modulo Atendimento" | Sim (filtra role=ADMIN ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â acesso permanente) | Sim (proprios usuarios, filtra role=ADMIN) | Nao |
| Card "Clientes" (gerenciar todos os tenants) | Sim | **NAO** | Nao |
| Dashboard de falhas outbound | Sim | **NAO** | Nao |
| Latencia e erros por endpoint | Sim | **NAO** | Nao |
| Debug tecnico (bootstrap/status/qr) | Sim | **NAO** | Nao |
| ~~"Validacao de endpoints"~~ | REMOVIDO para todos | REMOVIDO | REMOVIDO |
| ~~"Usuarios do cliente"~~ | REMOVIDO para todos | REMOVIDO | REMOVIDO |

**Regras de campos dentro dos cards:**
- `instanceName`: auto-gerado como `{clientSlug}-instancia-00{n}` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â cliente nao ve nem edita
- `evolutionApiKey` (tenant e instancia): visivel so para platform admin
- `webhookUrl`: visivel so para platform admin
- `maxChannels` / `maxUsers`: client admin ve (read-only), so platform admin edita
- Usuarios `role=ADMIN` nao aparecem na lista de toggle do modulo atendimento (acesso automatico)

**Regra critica:** Um admin de cliente NUNCA pode ver dados de outro cliente. Ele SEM acesso ao `/clients` (403).
**Regra critica:** A pagina de operacao redireciona automaticamente para inbox se o perfil for AGENT ou VIEWER (`watchEffect` no composable).

---

## Status atual (2026-03-16)

### Problemas criticos encontrados na auditoria

| # | Problema | Impacto |
|---|----------|---------|
| 1 | **4 tenants compartilham 1 WhatsApp** (`demo-instance`) | Dados duplicados, so 1 recebe realtime |
| 2 | **Duby e Perola tem 200 conversas lixo** | Copias da instancia compartilhada |
| 3 | **Webhook aponta para 1 tenant so** (demo-core) | Outros nao recebem msgs |
| 4 | **Guard nao verifica modulo do CLIENTE** | Super root bypassa, cliente sem modulo ve inbox |
| 5 | **Pagina operacao nao reage ao switch** | Mostra config do tenant errado |
| 6 | **Sem UI para gerenciar acesso ao modulo** | Admin do cliente nao controla quem acessa |
| 7 | **`/clients` expoe todos tenants** | Qualquer admin de tenant ve todos |

### Dados do banco (auditoria SQL)
```
-- WhatsApp instances com mesmo nome em tenants diferentes:
demo-instance ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 4 tenants (demo, demo-core, Duby, Perola)

-- Conversas por tenant:
demo-core (Root):  200 conversas
novo-cliente (Perola): 200 conversas (LIXO - copias)
novo-cliente-2 (Duby): 200 conversas (LIXO - copias)
demo (Empresa Demo): 46 conversas
acme (Empresa ACME): 2 conversas

-- Cross-tenant contamination: 0 (tenantId das conversas bate com tenantId da instancia)
-- WhatsAppInstanceUserAccess: apenas 2 registros (acesso majoritariamente implicito)

-- Evolution API: 1 instancia real (demo-instance), connectionStatus: "open"
-- Webhook URL: http://atendimento-online-api:4000/webhooks/evolution/demo-core
```

### Arquivos-chave para as correcoes

| Arquivo | Responsabilidade |
|---------|-----------------|
| `apps/atendimento-online-api/src/routes/tenant/routes-whatsapp-session.ts` | Bootstrap, connect, logout de WhatsApp |
| `apps/atendimento-online-api/src/routes/tenant/routes-whatsapp-instances.ts` | CRUD de instancias, atribuicao de usuarios |
| `apps/atendimento-online-api/src/routes/tenant/tenant-webhook-config.ts` | Construcao de webhook URL |
| `apps/atendimento-online-api/src/services/whatsapp-instances.ts` | Service layer de instancias |
| `apps/atendimento-online-api/src/services/evolution-client.ts` | Cliente HTTP para Evolution API |
| `apps/atendimento-online-api/src/lib/guards.ts` | Guards de acesso (requireAtendimentoModuleAccess) |
| `apps/atendimento-online-api/src/services/core-atendimento-access.ts` | Resolucao de acesso via plataforma-api |
| `apps/atendimento-online-api/src/routes/tenant/routes-clients.ts` | Listagem de clientes (PROBLEMA: expoe todos) |
| `apps/atendimento-online-api/src/routes/tenant/routes-core.ts` | Config do tenant (PROBLEMA: expoe API key) |
| `apps/atendimento-online-api/src/routes/session-context.ts` | Atualizacao de contexto operacional |
| `apps/atendimento-online-api/src/routes/webhooks/register-routes.ts` | Recebimento de webhooks |
| `apps/atendimento-online-api/src/routes/webhooks/handlers/message-upsert/events.ts` | Publicacao de eventos realtime |
| `apps/atendimento-online-api/src/main.ts` | Socket.IO setup, Redis pub/sub |
| `apps/painel-web/app/composables/omnichannel/useOmnichannelAdmin.ts` | Composable da pagina operacao |
| `apps/painel-web/app/composables/omnichannel/useOmnichannelInbox.ts` | Composable do inbox |
| `apps/painel-web/app/composables/omnichannel/useOmnichannelInboxRealtime.ts` | Socket.IO client |
| `apps/painel-web/app/components/omnichannel/OmnichannelInboxModule.vue` | UI do inbox |
| `apps/painel-web/app/components/omnichannel/OmnichannelAdminModule.vue` | UI da operacao |
| `apps/painel-web/app/stores/session-simulation.ts` | Switch de tenant (frontend) |

---

## FASE 1 - ISOLAMENTO CRITICO (Seguranca)
> **Status:** CONCLUIDA (2026-03-16)
> **Objetivo:** Garantir que cada cliente tenha seu proprio WhatsApp, dados limpos, e acesso correto.

### 1.1 Instancias WhatsApp com nomes unicos por tenant
**Status:** FEITO (2026-03-16)
**Prioridade:** CRITICA
**Problema:** 4 tenants compartilham `demo-instance` no Evolution API. So pode haver 1 instancia real com esse nome no Evolution.
**Solucao:**
- No bootstrap de WhatsApp (`routes-whatsapp-session.ts` POST `/tenant/whatsapp/bootstrap`):
  - Forcar nome unico: `{tenantSlug}-{instanceLabel}` (ex: `duby-whatsapp-01`)
  - Se o instanceName ja existe em OUTRO tenant local, rejeitar com erro claro
  - Se o instanceName ja existe no Evolution API vinculado a outro tenant, rejeitar
- No service layer (`whatsapp-instances.ts` `ensureTenantWhatsAppRegistry`):
  - Adicionar validacao: instanceName deve ser unico globalmente (nao so por tenant)
- **Teste:** Criar instancia para Duby com nome `duby-whatsapp` ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ deve criar no Evolution API separadamente
- **Teste:** Tentar criar instancia com nome `demo-instance` em novo tenant ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ deve recusar

### 1.2 Webhook URL unico por instancia/tenant
**Status:** FEITO (2026-03-16) - ja funcionava corretamente com buildWebhookUrl(tenantSlug)
**Prioridade:** CRITICA
**Problema:** Webhook URL usa `{tenantSlug}` do tenant dono. Se 2 tenants compartilham instanceName, o webhook vai para o primeiro que registrou.
**Solucao:**
- `tenant-webhook-config.ts` `buildWebhookUrl(tenantSlug)` ja esta correto - gera URL unico por slug
- O problema e que o bootstrap precisa SEMPRE chamar `client.setWebhook()` com o slug do tenant correto
- Verificar em `routes-whatsapp-session.ts` que o webhook e registrado no bootstrap
- **Teste:** Apos bootstrap do Duby, verificar no Evolution: `GET /webhook/find/{instanceName}` ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ URL deve conter `duby` ou `novo-cliente-2`

### 1.3 Limpar dados duplicados
**Status:** FEITO (2026-03-16) - 890 msgs + 400 convs removidas, instancias desativadas
**Prioridade:** ALTA
**Problema:** Duby (novo-cliente-2) e Perola (novo-cliente) tem 200 conversas cada que sao copias/lixo de dados gerados quando compartilhavam a instancia `demo-instance`.
**Solucao:**
- Script SQL para limpar:
  ```sql
  -- 1. Desativar instancias demo-instance nos tenants errados
  UPDATE "WhatsAppInstance"
  SET "isActive" = false
  WHERE "instanceName" = 'demo-instance'
  AND "tenantId" NOT IN ('cmmqtp5jq0000qo4pie2mofge'); -- manter so no demo-core (Root)

  -- 2. Deletar mensagens das conversas lixo
  DELETE FROM "Message"
  WHERE "tenantId" IN ('cmmtq0zu3000aqs4p594e787t', 'cmmtq18k1000lqs4puksq7ieo');

  -- 3. Deletar conversas lixo
  DELETE FROM "Conversation"
  WHERE "tenantId" IN ('cmmtq0zu3000aqs4p594e787t', 'cmmtq18k1000lqs4puksq7ieo');

  -- 4. Deletar hidden messages e audit events
  DELETE FROM "HiddenMessageForUser"
  WHERE "tenantId" IN ('cmmtq0zu3000aqs4p594e787t', 'cmmtq18k1000lqs4puksq7ieo');

  DELETE FROM "AuditEvent"
  WHERE "tenantId" IN ('cmmtq0zu3000aqs4p594e787t', 'cmmtq18k1000lqs4puksq7ieo');
  ```
- Alternativa: criar script em `apps/atendimento-online-api/src/scripts/cleanup-shared-instances.ts`
- **Teste:** Apos limpeza, Duby e Perola devem ter 0 conversas. Devem comecar do zero quando conectarem seu proprio WhatsApp.

### 1.4 Guard de modulo no nivel do CLIENTE (nao so usuario)
**Status:** FEITO (2026-03-16) - backend + frontend verificam modulo do cliente
**Prioridade:** ALTA
**Problema:** `requireAtendimentoModuleAccess` em `guards.ts` verifica se o USUARIO e super root, mas nao se o CLIENTE/TENANT tem o modulo atendimento ativo.
**O que ja foi feito:**
- Frontend: `OmnichannelInboxModule.vue` verifica `activeClientHasAtendimento` e bloqueia inbox se false
- Frontend: Dropdown de switch marca clientes sem atendimento como desabilitados
- Backend: `POST /session/context` verifica moduleCodes do cliente alvo
**O que falta:**
- Backend: `requireAtendimentoModuleAccess` em `guards.ts` deve tambem verificar se o TENANT do JWT tem o modulo ativo
- Isso requer consultar o plataforma-api ou cache local com os modulos do tenant
- **Solucao proposta:**
  - Em `resolveCoreAtendimentoAccessByEmail`, alem de verificar acesso do usuario, tambem verificar se o tenant (extraido do JWT) tem o modulo
  - Ou: adicionar um campo `moduleCodes` no JWT e verificar no guard
- **Teste:** Super root logado em tenant sem atendimento ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ API retorna 403 nas rotas `/tenant/*`

---

## FASE 2 - OPERACAO POR CLIENTE
> **Status:** CONCLUIDA (2026-03-16)
> **Objetivo:** Cada cliente poder gerenciar seu proprio WhatsApp pela pagina de operacao.

### 2.1 Pagina operacao responde ao switch de tenant
**Status:** FEITO (2026-03-16)
**Prioridade:** ALTA
**Problema:** A pagina `/admin/omnichannel/operacao` usa `useOmnichannelAdmin()` que le `user.tenantId` do auth store. Quando o admin atualiza o contexto operacional, o composable nao recarrega.
**Solucao:**
- `useOmnichannelAdmin.ts`: adicionar watch no `user.value?.tenantId` para recarregar tudo
- Ou: adicionar funcao `reloadForTenant()` similar ao que `switchTenant` faz no inbox
- `operacao.vue` ou `OmnichannelAdminModule.vue`: adicionar o mesmo dropdown "Atendimento:" do inbox
- **Teste:** Switch de Root para Duby na operacao ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ deve mostrar instancias e config do Duby

### 2.2 Bootstrap de WhatsApp por cliente
**Status:** FEITO (2026-03-16)
**Prioridade:** ALTA
**Problema:** Bootstrap usa instanceName generico que pode colidir.
**Solucao:**
- No POST `/tenant/whatsapp/bootstrap`, gerar nome sugerido: `{tenantSlug}-whatsapp`
- UI na operacao deve pre-preencher com o nome sugerido
- Validar unicidade global do instanceName antes de criar
- **Teste:** Admin do Duby faz bootstrap ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ cria `duby-whatsapp` no Evolution com webhook `http://atendimento-online-api:4000/webhooks/evolution/novo-cliente-2`

### 2.3 QR Code e conexao por cliente
**Status:** FEITO (2026-03-16) - QR ja funciona por instancia, nome unico garante isolamento
**Prioridade:** ALTA
**Problema:** Com nomes unicos (1.1), cada tenant gera QR para sua propria instancia.
**Solucao:**
- UI deve mostrar claramente: "Conectando WhatsApp para [Nome do Cliente]"
- Cada instancia tem seu proprio QR code independente
- **Teste:** Duby gera QR ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ escaneia com celular ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Duby recebe msgs em tempo real sem afetar Root

---

## FASE 3 - GERENCIAMENTO DE ACESSO POR CLIENTE
> **Status:** CONCLUIDA (2026-03-16)
> **Objetivo:** Admin do cliente controla quais usuarios acessam o modulo de atendimento.

### 3.1 Cliente admin gerencia acesso ao modulo
**Status:** FEITO (2026-03-16)
**Prioridade:** MEDIA-ALTA
**O que foi feito:**
- Novo endpoint `PUT /tenant/users/:userId/atendimento-access` com body `{ grant: boolean }`
  - Arquivo: `apps/atendimento-online-api/src/routes/tenant/routes-atendimento-users.ts`
  - Verifica limite `maxUsers` do plano antes de conceder acesso
  - Chama `platformCoreClient.assignTenantUserToModule` ou `unassignTenantUserFromModule`
  - Invalida o cache Redis/memory do usuario apos a mudanca
  - Retorna lista atualizada de usuarios com status `atendimentoAccess`
- Registrado em `routes-whatsapp.ts` via `registerAtendimentoUsersRoutes`
- Nova card "Acesso ao Modulo Atendimento" na pagina operacao (`OmnichannelAdminModule.vue`)
  - Exibe todos os usuarios do tenant com badge de status
  - Botao "Conceder acesso" / "Revogar" por usuario
  - Contador `X/Y com acesso` no header da card
  - Texto informativo com limite do plano
- Nova funcao `toggleAtendimentoAccess(userId, grant)` em `useOmnichannelAdmin.ts`
- Novo state `togglingAtendimentoAccessUserId` para loading por usuario
- **Teste:** Admin do Duby abre operacao ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ vÃƒÆ’Ã‚Âª lista de usuarios ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ clica "Conceder acesso" ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ usuario aparece em verde

### 3.2 Atribuicao de usuarios a instancias WhatsApp
**Status:** FEITO (2026-03-16) - ja estava implementado
**Prioridade:** MEDIA
**O que ja existia:**
- Card "Usuarios com acesso a esta instancia" na pagina operacao mostra checkboxes por usuario
- `saveWhatsAppInstanceUsers(instanceId)` chama `PUT /tenant/whatsapp/instances/:instanceId/users`
- Backend valida que os usuarios tem `atendimentoAccess = true` antes de vincular
- Respeita policy SINGLE_INSTANCE (usuario nao pode ser vinculado a 2 instancias exclusivas)
- **Dependencia:** Funciona melhor apos 3.1 (usuarios precisam ter acesso ao modulo antes de ser atribuidos a instancias)

### 3.3 Limites de plano visivel na UI
**Status:** FEITO (2026-03-16) - limites ja estavam visiveis, complementados em 3.1
**O que ja existia:**
- Badge "X/Y ativas" no header da card de instancias WhatsApp
- Texto "Uso atual: X/Y canais, X/Y usuarios" no formulario do tenant
- Backend ja impede criacao de instancia alem do `maxChannels` (409 com detalhes)
**O que foi adicionado em 3.1:**
- Badge "X/Y com acesso" no header da card de acesso ao modulo
- Texto "Limite do plano: X/Y usuarios alocados" na card de acesso
- Backend impede concessao de acesso quando `currentUsers >= maxUsers` (409 com detalhes)

---

## FASE 4 - ROBUSTEZ E SEGURANCA
> **Status:** NAO INICIADA
> **Objetivo:** Fechar brechas de seguranca e adicionar rastreabilidade.

### 4.1 Endpoint /clients so para platform admin
**Status:** FEITO (2026-03-16)
**Prioridade:** ALTA
**O que foi feito:**
- Novo guard `requirePlatformAdmin` em `apps/atendimento-online-api/src/lib/guards.ts`
  - Chama `requireAdmin` (verifica role JWT) + `resolveCoreAtendimentoAccessByEmail` (verifica isPlatformAdmin)
- `GET /clients` agora usa `requirePlatformAdmin` ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 403 para client admins
- `GET /clients/:clientId/users` e `POST /clients/:clientId/users` agora verificam: se `clientId !== tenantId do JWT` ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ requer `requirePlatformAdmin`
  - Client admin pode gerenciar usuarios do PROPRIO tenant; nao pode acessar dados de outros tenants
- Frontend `useOmnichannelAdminClientOps.loadClients()` agora ignora silenciosamente o 403 (clientes vazios para client admin)
- Frontend `OmnichannelAdminModule.vue`:
  - Card "Clientes" oculto para client admins (`v-if="canManageTenant && canSwitchTenant"`)
  - Seletor de cliente em "Usuarios do cliente" oculto para client admins (`v-if="canSwitchTenant"`)
- **Teste:** Admin do Duby chama GET `/clients` ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 403; nao ve card "Clientes" na operacao

### 4.2 Nao expor Evolution API key para tenant admins
**Status:** PARCIALMENTE FEITO (2026-03-16) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â frontend oculta, backend ainda retorna
**Prioridade:** MEDIA
**Problema:** `routes-core.ts` GET `/tenant` retorna `evolutionApiKey` para admins e supervisors.
**O que foi feito (frontend):**
- `OmnichannelAdminModule.vue`: campo "Evolution API Key" no card "Cliente atual" oculto com `v-if="canSwitchTenant"` (so platform admin ve)
- Campo "API Key dedicada" no form de instancias tambem oculto com `v-if="canSwitchTenant"`
**O que falta (backend):**
- `routes-core.ts` GET `/tenant` nao deve retornar `evolutionApiKey` para client admins
- Mascarar para platform admin (ex: `***...xxx`)
- **Teste:** Admin do Duby chama GET `/tenant` ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ evolutionApiKey = null ou mascarado no JSON

### 4.3 Audit logging para operacoes de conexao
**Status:** A FAZER
**Prioridade:** MEDIA
**Problema:** Nao ha audit trail para quem conectou/desconectou WhatsApp.
**Solucao:**
- Registrar `AuditEvent` em: bootstrap, connect, disconnect, assign users
- **Teste:** Apos bootstrap, verificar AuditEvent no banco

### 4.4 Rate limit na atualizacao de contexto operacional
**Status:** A FAZER
**Prioridade:** BAIXA
**Solucao:**
- Adicionar rate limit de 10 switches por minuto usando `rateLimitRequest`

---

## FASE 5.6 - INBOX SYNC / ANTI-STALENESS
> **Status:** CONCLUIDA (2026-03-30)
> **Objetivo:** A inbox nunca ficar desatualizada ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â mesmo quando o socket esta "connected" mas silencioso.

### Diagnostico do problema (2026-03-18)

**Cenario:** Usuario abre o painel apos ausencia (ex: overnight). O socket conecta com sucesso (estado "connected"), mas:
1. Conversas mostram mensagens de ontem ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â nao chegam novas
2. Mensagem enviada aparece como "sent" na UI mas NAO foi entregue via WhatsApp
3. A inbox parece saudavel mas esta completamente parada

**Por que acontece:**
- No evento `connect` do socket, `refreshConversationsFromRealtime({ force: true, reloadActive: true })` e chamado ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â CORRETO
- Porem o `staleFallbackPolling` (refresh a cada 20s) e **parado** no momento em que o socket conecta via `stopStaleFallbackPolling()`
- Se a Evolution API estiver down/silenciosa (sem novos webhooks), o socket fica "connected" mas sem receber NENHUM evento
- Resultado: inbox congela silenciosamente ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â nenhum refresh automatico ocorre enquanto o socket permanece conectado

**O "sent" falso:**
- O pipeline outbound cria uma mensagem otimista ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ chama a API ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ API aceita e retorna PENDING/SENT
- Se a Evolution API falhar internamente (depois de aceitar a requisicao), o status fica PENDING para sempre
- `reconcilePendingMessageStatus` existe e e chamado apenas quando `created.status === "PENDING"` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â MAS se a API retorna SENT diretamente, nunca e chamado

### 5.6.1 Heartbeat de conversas com socket conectado
**Status:** FEITO (2026-03-30)
**Arquivo:** `apps/painel-web/app/composables/omnichannel/useOmnichannelInboxRealtime.ts`
**O que foi feito:**
- `CONNECTED_HEARTBEAT_INTERVAL_MS = 5 * 60_000` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â heartbeat a cada 5 minutos
- Iniciado no evento `connect`, parado no `disconnect` e no `disconnectSocket()`
- Respeita `document.visibilityState === "hidden"` (adia se aba em background)
- Passa `reloadActive: true` se ha uma conversa ativa

### 5.6.2 Refresh por visibilidade de aba (Page Visibility API)
**Status:** FEITO (2026-03-30)
**Arquivo:** `apps/painel-web/app/composables/omnichannel/useOmnichannelInboxRealtime.ts`
**O que foi feito:**
- `handleVisibilityChange` ouve `visibilitychange` do documento
- Verifica `Date.now() - lastConversationsRefreshAt > PAGE_VISIBILITY_STALE_THRESHOLD_MS (5min)`
- Se stale, chama `refreshConversationsFromRealtime({ force: true, reloadActive })`
- Listener adicionado no `connect`, removido no `disconnect`/`disconnectSocket()`

### 5.6.3 Sincronizar mensagens da conversa ativa ao abrir
**Status:** FEITO (2026-03-30) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â coberto pelo heartbeat (5.6.1) que usa `reloadActive: true` + pela sync guard (5.6.5)

### 5.6.4 Indicador visual de "inbox desatualizada"
**Status:** NAO IMPLEMENTADO (baixa prioridade ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â sync guard cobre o problema sem UI extra)

### 5.6.5 Sync Guard ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â verificacao de frescor a cada 20s + verificacao de envio
**Status:** FEITO (2026-03-30)
**Arquivos novos:**
- `apps/painel-web/app/composables/omnichannel/useInboxSyncGuard.ts` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â freshness check + send verification
- `apps/painel-web/app/composables/omnichannel/useInboxMessageWindow.ts` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â cap de 50 mensagens na janela
**O que foi feito:**
- `useInboxSyncGuard`: a cada 20s, chama `syncConversationHistory` + busca ultima msg do servidor ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â se nao esta local, recarrega; marca mensagens PENDING como FAILED apos 60s
- `useInboxMessageWindow`: limita o array de mensagens a 50 (trim para as mais recentes quando usuario esta no fundo)
- Integrados em `useOmnichannelInbox.ts` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â `syncGuard.startSync()` em `onMounted` e `switchTenant`, `stopSync()` em `onBeforeUnmount`

---

## FASE 5.7 - CONFIABILIDADE DE ENVIO / WORKER HEALTH
> **Status:** PARCIAL (2026-03-18)

### 5.7.4 Fix Prisma Client stale no worker (causa raiz do PENDING infinito em 2026-03-18)
**Status:** FEITO
**Causa identificada:** O volume `worker_node_modules` guardava o Prisma Client gerado na primeira vez que o container subiu. Quando o schema foi alterado (novo enum `WhatsAppInstanceUserScopePolicy`), o worker crashava em loop silencioso com `SyntaxError` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â **sem processar nenhuma mensagem da fila**. O sistema exibia "conectado" mas nada era enviado ou recebido.
**Fix aplicado (docker-compose.yml):**
```yaml
rm -rf node_modules/.prisma/client && npm run prisma:generate && npm run worker:dev
```
**Regra para producao:** Sempre que alterar o schema Prisma, rodar:
```bash
docker compose exec atendimento-online-worker npm run prisma:generate
docker compose restart atendimento-online-worker
```

### 5.7.5 Monitor automatico de PENDING presos (auto-requeue)
**Status:** FEITO
**Arquivo:** `apps/atendimento-online-api/src/workers/outbound-worker.ts`
**Logica:**
- A cada 5 minutos, o worker escaneia mensagens OUTBOUND com `status=PENDING` ha mais de 10 minutos
- Se encontrar: loga `STALE_PENDING_DETECTED` com IDs + re-enfileira automaticamente (ate 20 por ciclo)
- Tolerante a falhas: erro no check nunca derruba o worker

### 5.7.6 Alerta de producao para STALE_PENDING (A FAZER)
**Status:** A FAZER
**Prioridade:** ALTA para producao
**Objetivo:** Notificar a equipe quando mensagens ficarem presas, ANTES do cliente perceber.
**Opcoes de implementacao (da mais simples para mais robusta):**

1. **Uptime Kuma** (recomendado para inicio rapido):
   - Criar monitor tipo "Docker Container Logs" ou "Keyword"
   - Alertar quando `STALE_PENDING_DETECTED` aparecer nos logs do container `atendimento-online-worker`
   - Notificacao: Telegram, Slack, email, WhatsApp

2. **Grafana Loki + Alertmanager**:
   - Coletar logs do Docker com o driver Loki
   - Criar alerta: `{container="worker"} |= "STALE_PENDING_DETECTED"`
   - Integrar com Slack/PagerDuty

3. **Script simples de monitoramento** (fallback rapido em producao):
   ```bash
   # Rodar em cron a cada 5 minutos no servidor
   docker compose logs atendimento-online-worker --since=5m | grep STALE_PENDING_DETECTED && \
     curl -X POST "https://hooks.slack.com/..." -d '{"text":"ALERTA: Mensagens PENDING presas no worker!"}'
   ```

4. **Endpoint de health do worker** (futuro):
   - Adicionar rota interna `/worker/health` que retorna contagem de PENDING > 10min
   - Uptime Kuma ou qualquer health checker pode monitorar esse endpoint

**Comando de monitoramento manual (desenvolvimento):**
```bash
docker compose logs -f atendimento-online-worker | grep STALE_PENDING
```

### 5.7.7 Status DELIVERED e READ para mensagens outbound (A FAZER)
**Status:** A FAZER
**Prioridade:** MEDIA
**Contexto:** O schema Prisma atual tem apenas `PENDING | SENT | FAILED`. O WhatsApp (Evolution API) envia webhooks de confirmacao de entrega (`message.update` com `status: DELIVERY_ACK`) e leitura (`status: READ`). Esses eventos existem mas o backend ainda nao atualiza o status da mensagem.
**O que fazer:**
1. No schema Prisma, adicionar `DELIVERED` e `READ` ao enum `MessageStatus`
2. No webhook handler (`routes-webhooks/...`), capturar eventos `messages.update` e atualizar `message.status` para `DELIVERED` ou `READ`
3. Emitir evento Socket.IO para o frontend atualizar o icone de check em tempo real
4. No frontend (`InboxChatMessageRow.vue`), os icones ja estao preparados: `i-lucide-check-check` com classe `msg-status-icon--read` (azul)

### 5.7.8 Indicador de "digitando..." (typing indicator) (A FAZER)
**Status:** A FAZER
**Prioridade:** MEDIA
**Contexto:** A Evolution API emite evento `presence.update` com `presence: "composing"` quando o contato esta digitando.
**O que fazer:**
1. No webhook handler, capturar `presence.update` e emitir via Socket.IO para o frontend
2. No frontend, mostrar indicador de "digitando..." no rodape do chat (abaixo das mensagens)
3. Exibir com timeout de ~5s (se nao vier novo evento, ocultar)

### 5.7.9 Indicador de "gravando audio" (A FAZER)
**Status:** A FAZER
**Prioridade:** BAIXA
**Contexto:** A Evolution API emite evento `presence.update` com `presence: "recording"` quando o contato esta gravando um audio.
**O que fazer:** Igual ao 5.7.8 mas com texto "Gravando audio..." e icone de microfone.

---

## FASE 5 - UX E POLISH
> **Status:** EM ANDAMENTO (2026-03-16)
> **Objetivo:** Experiencia do usuario consistente e intuitiva.

### 5.1 Indicador visual de tenant ativo em todas as paginas omnichannel
**Status:** PARCIALMENTE FEITO
**O que ja tem:** Dropdown "Atendimento: [Cliente]" no inbox
**O que falta:** Mesmo dropdown na pagina operacao e docs

### 5.0 Bug: "WhatsApp conectado" falso positivo
**Status:** FEITO (2026-03-16)
**Problema:** Tenants com instancia `demo-instance` INATIVA no banco (Duby, Perola) viam "WhatsApp conectado" na pagina de operacao. O motivo era que `routes-whatsapp-status.ts` usava `includeInactive: true` ao buscar a instancia. Mesmo inativa, a instancia era encontrada e a Evolution API retornava `state: "open"` (pois a instancia real esta conectada ao tenant Root).
**Fix:** Mudado para `includeInactive: false` em `routes-whatsapp-status.ts`. Se nao ha instancia ATIVA no tenant, a rota retorna `{ configured: false }` ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ UI mostra "Nenhuma sessao ativa".

### 5.2 Estado vazio inteligente
**Status:** PARCIALMENTE FEITO
**Bug reportado:** Ao trocar para Duby/Perola (sem WhatsApp), inbox fica vazio sem nenhuma mensagem explicativa. Usuario nao sabe o que fazer.
**O que ja tem:** Alerta de WhatsApp desconectado com botao "Reconectar" (so aparece se WhatsApp esta configurado mas desconectado)
**O que falta:**
- Se nao tem NENHUMA instancia ativa: "Nenhum WhatsApp configurado para [Cliente]. [Configurar agora]" com link para `/admin/omnichannel/operacao`
- Se tem instancia mas desconectada: "WhatsApp desconectado. [Reconectar]"
- Se tem instancia conectada mas sem conversas: "Aguardando primeiras mensagens..."
- Se cliente nao tem modulo atendimento: Tela de bloqueio (JA FEITO no frontend)

### 5.3 Confirmacao antes de switch de tenant
**Status:** A FAZER
**Prioridade:** BAIXA
**Solucao:** Dialog de confirmacao antes de trocar

### 5.4 Reestruturacao UX da pagina de operacao (por nivel de usuario)
**Status:** FEITO (2026-03-16) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â backend auto-gerar instanceName pendente (5.5)
**Prioridade:** ALTA
**Baseado em:** Feedback visual (screenshots) da pagina de operacao como client admin e platform admin

#### Regras definitivas por card/campo (referencia para nao regressar):

**Card "Conexao WhatsApp" (PRIMEIRO da lista):**
- Client admin VE e opera (QR, bootstrap, conectar/desconectar)
- Client admin NAO ve: campo "Instance name" (oculto ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â nome e gerado automaticamente pelo sistema)
- Platform admin ve todos os campos incluindo instance name
- Bug a corrigir: nao duplicar o alerta de status (aparece no topo da pagina E dentro do card ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â remover o do topo)

**Card "Cliente atual":**
- Client admin VE: Nome da empresa, Uso atual (texto "0/1 canais, 0/3 usuarios"), Retencao (dias), Limite upload
- Client admin NAO ve nem edita: Max canais, Max usuarios (sao limites do plano, definidos pelo contrato ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â NAO pelo cliente)
- Client admin NAO ve: campo "Instancia default (compatibilidade legado)" (campo legado/interno)
- Client admin NAO ve: campo "Evolution API Key" (informacao interna/tecnica)
- Client admin NAO ve: texto de Webhook (ex: `Webhook: http://atendimento-online-api:4000/webhooks/evolution/novo-cliente-2`) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â e informacao de debug interno

**Card "Instancias WhatsApp do cliente":**
- Client admin VE e edita: Nome de exibicao, Numero (opcional), Fila/setor, Responsavel da instancia
- Client admin NAO ve nem edita: Nome tecnico da instancia (instanceName ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â gerado pelo sistema: `{slug}-instancia-001`)
- Client admin NAO ve nem edita: API Key dedicada (tecnico/interno)
- Client admin NAO ve nem edita: Politica de acesso dos usuarios (tecnico demais para client)
- Client admin NAO ve nem edita: Flags (Instancia default, Instancia ativa) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â controle de infraestrutura, nao do cliente
- Platform admin ve e edita TUDO

**Card "Acesso ao Modulo Atendimento":**
- Usuarios com role=ADMIN filtrados da lista (tem acesso automatico ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â nao faz sentido toggle para eles)
- Texto informativo: "Usuarios com perfil Admin tem acesso automatico ao modulo de atendimento"
- Apenas SUPERVISOR/AGENT/VIEWER aparecem com toggle

**Cards ocultos para client admin (so platform admin ve):**
- Card "Clientes" (gerenciamento de todos os tenants)
- Dashboard de falhas outbound
- Latencia e erros por endpoint
- Debug tecnico (bootstrap/status/qr)

**Removidos para TODOS os usuarios:**
- Secao "Validacao de endpoints Evolution" (era debug interno)
- Secao "Usuarios do cliente" (redundante)

#### O que foi feito:
- Reordenamento (Conexao WhatsApp primeiro)
- Remocao de "Validacao de endpoints" e "Usuarios do cliente"
- Ocultacao dos cards de monitoramento/debug para clients
- Campo instanceName oculto para clients em ambos os cards
- API Key oculta para clients em ambos os cards
- Webhook URL oculto para clients
- Campo legado "Instancia default" oculto para clients
- Filtro de ADMIN na lista de acesso ao modulo

#### O que AINDA falta:
- Backend: auto-gerar instanceName quando nao fornecido (ver 5.5)

### 5.5 Auto-geracao de nome de instancia WhatsApp para clientes
**Status:** A FAZER
**Prioridade:** MEDIA
**Contexto:** Frontend ja oculta o campo `instanceName` para client admins. O backend precisa aceitar requisicao sem instanceName e gerar automaticamente.
**Padrao:** `{tenantSlug}-instancia-001`, `{tenantSlug}-instancia-002`, etc.
**Arquivos a alterar:**
- `apps/atendimento-online-api/src/routes/tenant/routes-whatsapp-instances.ts`: tornar `instanceName` opcional no schema de criacao; gerar quando ausente
- `apps/atendimento-online-api/src/routes/tenant/routes-whatsapp-session.ts`: mesmo para bootstrap (campo ja oculto no frontend para client admins)
- **Teste:** Client admin abre operacao ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ clica "Criar instancia" sem informar nome ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ instancia criada com nome `{slug}-instancia-001`

---

## Ordem de execucao

```
FASE 1 (CRITICO - sem isso nada funciona):
  1.1 Nomes unicos de instancia ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 1.2 Webhook unico ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 1.3 Limpeza de dados ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 1.4 Guard de modulo

FASE 2 (ALTO - cada cliente gerencia seu WhatsApp):
  2.1 Operacao reage ao switch ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 2.2 Bootstrap por cliente ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 2.3 QR por cliente

FASE 4.1 (SEGURANCA - correcao rapida):
  4.1 /clients so platform admin

FASE 3 (MEDIO - gerenciamento de acesso):
  3.1 Admin gerencia acesso ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 3.2 Atribuicao de usuarios ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 3.3 Limites visiveis

FASE 4 restante (MEDIO - robustez):
  4.2 Mascarar API key ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 4.3 Audit logging ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 4.4 Rate limit

FASE 5 (BAIXO - polish):
  5.1 Indicador global ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 5.2 Estados vazios ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 5.3 Confirmacao
```

## Progresso

| Tarefa | Status |
|--------|--------|
| 1.1 Nomes unicos | FEITO - validacao de unicidade global no bootstrap |
| 1.2 Webhook unico | FEITO - ja funcionava, validado |
| 1.3 Limpeza dados | FEITO - 890 msgs + 400 convs removidas de Duby/Perola |
| 1.4 Guard modulo cliente | FEITO - backend verifica tenant + frontend verifica client |
| 2.1 Operacao switch | FEITO - dropdown + reload + bloqueio sem modulo |
| 2.2 Bootstrap cliente | FEITO - nome sugerido {tenantSlug}-whatsapp |
| 2.3 QR cliente | FEITO - QR por instancia, nome unico |
| 3.1 Acesso modulo | FEITO - card + endpoint + composable |
| 3.2 Usuarios instancia | FEITO - ja existia, dependia de 3.1 |
| 3.3 Limites UI | FEITO - badges + validacoes backend |
| 4.1 /clients seguro | FEITO - requirePlatformAdmin guard + frontend visibility rules |
| 4.2 API key oculta | PARCIAL - frontend oculta, backend ainda retorna |
| 4.3 Audit logging | A FAZER |
| 4.4 Rate limit switch | A FAZER |
| 5.1 Indicador global | PARCIAL |
| 5.2 Estados vazios | PARCIAL |
| 5.3 Confirmacao switch | A FAZER |
| 5.4 UX operacao por nivel de usuario | FEITO - reordenamento, remocao, visibilidade por perfil, alerta duplicado removido |
| 5.5 Auto-gerar instanceName para clientes | A FAZER - frontend oculta campo, backend precisa gerar |
| 5.6.1 Heartbeat de conversas (socket connected) | FEITO - refresh a cada 5min mesmo com socket ativo |
| 5.6.2 Refresh por Page Visibility API | FEITO - refresh ao voltar para a aba apos 5+ min |
| 5.6.3 Reload mensagens ativas no heartbeat | FEITO - junto com 5.6.1/5.6.2 |
| 5.6.4 Indicador visual de inbox desatualizada | A FAZER (baixa prioridade) |
| 5.7.1 SyncGuard - freshness check a cada 20s | FEITO - useInboxSyncGuard.ts (agora chama syncConversationHistory antes de checar DB) |
| 5.7.2 SyncGuard - verificacao de envio com FAILED | FEITO - verifySend marca FAILED apos 60s |
| 5.7.3 MessageWindow - cap de 50 msgs | FEITO - useInboxMessageWindow.ts |
| 5.7.4 Worker - fix Prisma client stale no restart | FEITO - docker-compose limpa .prisma/client antes de regenerar |
| 5.7.5 Worker - monitor PENDING presos (auto-requeue) | FEITO - outbound-worker verifica a cada 5min e re-enfileira |
| 5.7.6 Producao - alerta STALE_PENDING via log externo | A FAZER - integrar com Slack/email/Uptime Kuma |
| 5.7.7 Status DELIVERED e READ no schema + webhook handler | A FAZER - enum + webhook messages.update |
| 5.7.8 Typing indicator ("digitando...") | A FAZER - presence.update composing |
| 5.7.9 Audio recording indicator ("gravando audio...") | A FAZER - presence.update recording |
