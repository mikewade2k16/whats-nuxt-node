# Changelog - 2026-03-16

## Correcoes e Melhorias no Modulo Omnichannel

### 1. Bug Critico: instanceId faltando no evento conversation.updated (Realtime)

**Arquivo:** `apps/atendimento-online-api/src/routes/webhooks/handlers/message-upsert/events.ts`

**Problema:** O evento `conversation.updated` emitido pelo webhook do WhatsApp (via Evolution API)
nao incluia `instanceId` nem `instanceScopeKey` no payload. Quando o usuario tinha uma instancia
WhatsApp especifica selecionada no filtro do inbox (nao "all"), o frontend comparava
`payload.instanceId` (undefined) com o filtro selecionado e **removia a conversa da lista**.

**Causa raiz:** O payload era construido manualmente listando campos, mas `instanceId` e
`instanceScopeKey` foram esquecidos. Todos os outros emissores de `conversation.updated`
(routes-core-create, routes-operational-status, routes-operational-assign, contacts)
ja usavam `mapConversation()` que inclui esses campos.

**Fix:** Adicionei `instanceId` e `instanceScopeKey` ao payload do evento:
```typescript
payload: {
  id: conversationForEvent.id,
  channel: conversationForEvent.channel,
  status: conversationForEvent.status,
  externalId: conversationForEvent.externalId,
  instanceId: conversationForEvent.instanceId,        // ADICIONADO
  instanceScopeKey: conversationForEvent.instanceScopeKey, // ADICIONADO
  contactId: conversationForEvent.contactId,
  // ...
}
```

---

### 2. Socket.IO ModuleAccessDenied - tratamento visivel

**Arquivos:**
- `apps/painel-web/app/composables/omnichannel/useOmnichannelInboxRealtime.ts`
- `apps/painel-web/app/composables/omnichannel/useOmnichannelInbox.ts`
- `apps/painel-web/app/components/omnichannel/OmnichannelInboxModule.vue`

**Problema:** O middleware do Socket.IO em `main.ts` verifica se o usuario tem
`atendimentoAccess` via plataforma-api. Se nao tem, rejeita com "ModuleAccessDenied".
Mas o frontend tratava isso como erro generico e caia silenciosamente para polling
a cada 20 segundos - sem nenhum aviso visual.

**Fix:**
- Adicionei `realtimeConnectionState` ref com estados: `disconnected | connecting | connected | module_denied | auth_error`
- O handler `connect_error` agora detecta especificamente "ModuleAccessDenied" e "Unauthorized"
- O `OmnichannelInboxModule` exibe um UAlert quando `realtimeConnectionState === 'module_denied'`
- Tipo exportado: `RealtimeConnectionState`

---

### 3. Multi-Tenant Switch para o modulo Omnichannel

**Arquivos:**
- `apps/atendimento-online-api/src/routes/auth.ts` - Novo endpoint `POST /auth/switch-tenant`
- `apps/painel-web/app/composables/omnichannel/useOmnichannelInbox.ts` - Funcao `switchTenant()`
- `apps/painel-web/app/components/omnichannel/OmnichannelInboxModule.vue` - UI do seletor

#### Backend: POST /auth/switch-tenant

Aceita `{ clientId: number }` ou `{ coreTenantId: string }`.
Apenas platform admins (isPlatformAdmin + userType=admin + level=admin) podem usar.

Fluxo:
1. Verifica JWT do usuario atual
2. Verifica que e platform admin via `resolveCoreAtendimentoAccessByEmail`
3. Se `clientId` fornecido: busca nos admin clients do plataforma-api para encontrar `coreTenantId`
4. Se `coreTenantId` fornecido: resolve diretamente
5. Resolve/cria tenant local via `ensureLocalTenant`
6. Resolve/cria usuario local via `ensureLocalUser`
7. Gera novo JWT com o tenantId do novo tenant
8. Retorna `{ token, user }`

#### Frontend: switchTenant()

No `useOmnichannelInbox`:
1. Desconecta Socket.IO
2. Para polling de status WhatsApp
3. Chama `POST /auth/switch-tenant` via BFF
4. Atualiza sessao com novo token/user
5. Limpa estado (conversas, mensagens, contatos, etc)
6. Recarrega tudo (instancias, status, conversas, etc)
7. Reconecta Socket.IO com novo token
8. Tratamento de erro com `switchTenantError` ref

#### UI: Dropdown de tenant

No `OmnichannelInboxModule.vue`:
- Visivel apenas para platform admins com mais de 1 cliente (`canSwitchTenant`)
- Dropdown "Atendimento: [Nome do Cliente]" com lista de clientes do sessionSimulation
- Ao selecionar, chama `handleSwitchTenant(clientId)` que atualiza a session simulation e faz switch

---

### Regras de Acesso (referencia)

| Contexto | Verificacao | Descricao |
|----------|-------------|-----------|
| Socket.IO | `resolveCoreAtendimentoAccessByEmail` | Verifica isPlatformAdmin + atendimentoAccess |
| BFF Admin Routes | `x-core-token` header | Token do plataforma-api via `coreAdminFetch` |
| API Routes | JWT `Authorization` header | Token local gerado no login |
| Session Simulation | `canSimulate` | Requer isPlatformAdmin + userType=admin + level=admin |
| Switch Tenant | `resolveCoreAtendimentoAccessByEmail` | Mesmo check do Socket.IO |

---

### 4. Correcao de dados: Webhook URL do Evolution API

**Problema:** O webhook URL do Evolution API estava configurado para
`http://atendimento-online-api:4000/webhooks/evolution/demo` (tenant slug `demo`),
mas o root user logava no tenant `demo-core` (slug diferente, ID diferente).

**Resultado:** Eventos eram publicados na room `tenant:cmmp2peeq...` (demo),
mas o Socket.IO do root user estava na room `tenant:cmmqtp5jq...` (demo-core).
**Mensagens em tempo real nunca chegavam.**

**Dados no banco:**
| Tenant | Slug | ID |
|--------|------|----|
| Empresa Demo | demo | cmmp2peeq0000o7ggit2y037j |
| Root | demo-core | cmmqtp5jq0000qo4pie2mofge |

O root user (`root@core.local`) esta no tenant `demo-core`.

**Fix:** Atualizei o webhook URL no Evolution API:
```
ANTES: http://atendimento-online-api:4000/webhooks/evolution/demo
DEPOIS: http://atendimento-online-api:4000/webhooks/evolution/demo-core
```

Comando usado:
```bash
curl -X POST "http://localhost:8080/webhook/set/demo-instance" \
  -H "apikey: <KEY>" \
  -H "Content-Type: application/json" \
  -d '{"webhook":{"url":"http://atendimento-online-api:4000/webhooks/evolution/demo-core",...}}'
```

---

### 5. Melhorias de UX no estado de conexao WhatsApp

**Arquivo:** `apps/painel-web/app/components/omnichannel/OmnichannelInboxModule.vue`

- Mensagens mais claras no alerta de WhatsApp desconectado
- Botao muda de "Abrir Admin" para "Reconectar WhatsApp" ou "Configurar WhatsApp"
- Descricao contextual: explica o que fazer dependendo se WhatsApp esta configurado ou nao
- Alerta de `module_denied` explica que o modulo atendimento nao esta vinculado
- Alerta de `switchTenantError` exibe erro quando a troca de tenant falha

---

### Erros pre-existentes (nao corrigidos)

- **401 em `/api/admin/profile`**: Token core expirado ou plataforma-api inacessivel
- **403 em `/api/admin/clients`**: Consequencia do 401 acima (sessao invalida)
- Esses erros sao capturados pelo session simulation e nao impedem o funcionamento basico
- Para resolver: fazer logout e login novamente para renovar o core token

---

---

### 6. Isolamento de modulo: clientes sem atendimento nao podem ver inbox

**Arquivos:**
- `apps/painel-web/app/components/omnichannel/OmnichannelInboxModule.vue`
- `apps/atendimento-online-api/src/routes/auth.ts`

**Problema:** Quando um platform admin fazia switch para um cliente SEM o modulo atendimento
(ex: "PÃ©rola" que so tem "Core Panel"), o inbox ainda era exibido com as conversas daquele tenant.
Isso violava a regra: "Module must be active on client AND user must be allocated to module."

O bypass acontecia porque:
- Backend: `requireAtendimentoModuleAccess` verificava se o USUARIO era super root, mas nao
  se o CLIENTE tinha o modulo ativo
- Frontend: `hasModule()` no session simulation retornava `true` para super root sem verificar
  os modulos do cliente

**Fix Frontend:**
- Novo computed `activeClientHasAtendimento` que verifica `moduleCodes` do cliente ativo
  (nao do usuario) para a presenca do modulo "atendimento"
- Se o cliente nao tem o modulo, mostra tela de bloqueio com alerta e botoes para trocar
  cliente ou ir para gestao de clientes
- Dropdown de switch marca clientes sem atendimento como "(sem atendimento)" e desabilita
- `handleSwitchTenant` recusa switch para clientes sem modulo

**Fix Backend:**
- `POST /auth/switch-tenant` agora verifica `clientModuleCodes` do cliente alvo
- Se o cliente nao tem o modulo atendimento, retorna 403 com mensagem clara

---

### Arquivos modificados (resumo)

| Arquivo | Mudanca |
|---------|---------|
| `apps/atendimento-online-api/src/routes/webhooks/handlers/message-upsert/events.ts` | Adicionado `instanceId` e `instanceScopeKey` no evento |
| `apps/atendimento-online-api/src/routes/auth.ts` | Novo endpoint `POST /auth/switch-tenant` |
| `apps/painel-web/app/composables/omnichannel/useOmnichannelInboxRealtime.ts` | `realtimeConnectionState`, deteccao de `ModuleAccessDenied` |
| `apps/painel-web/app/composables/omnichannel/useOmnichannelInbox.ts` | `switchTenant()`, `switchTenantError`, propagacao de `realtimeConnectionState` |
| `apps/painel-web/app/components/omnichannel/OmnichannelInboxModule.vue` | Dropdown de tenant, alertas de estado, melhor UX WhatsApp, bloqueio sem modulo |
