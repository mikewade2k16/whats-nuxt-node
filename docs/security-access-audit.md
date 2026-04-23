# Security Access Audit (Sprint Atual)

Data de referencia: 2026-03-15

## Objetivo

Validar e endurecer o controle de acesso do painel admin para evitar bypass por manipulacao de frontend/headers.

Foco deste ciclo:

1. Sincronizacao imediata de dados do usuario no header.
2. Bloqueio server-side de rotas root-only.
3. Validacao automatizada de tentativas de bypass com script reproduzivel.
4. Harden de proxy/IP real e gate por modulo no server.
5. Auditoria estruturada de negacao (`403`) e allowlist configuravel de proxy confiavel.
6. Rate limit distribuido em Redis, audit de escrita (`POST/PATCH/DELETE`) e hardening de upload/webhook.

## O que foi corrigido

## 1) Sincronizacao em tempo real do header

Problema:
- alteracao de `nick`/avatar em tela de perfil ou manage/users nem sempre refletia imediatamente no header.

Correcao:
- header passou a priorizar dados vivos de `useAuth`/`useCoreAuth` e observar mudancas.
- update inline do usuario logado agora atualiza e persiste a sessao no ato.

Arquivos:
- `apps/painel-web/app/layouts/admin.vue`
- `apps/painel-web/app/composables/useUsersManager.ts`
- `apps/painel-web/app/pages/admin/profile.vue`

## 2) Anti-bypass por header spoof no BFF

Problema:
- contexto anterior dependia fortemente de headers (`x-user-type`, `x-user-level`, `x-client-id`), abrindo espaco para spoof.

Correcao:
- `resolveAccessContext` agora resolve ator por token valido no core:
  - `GET /core/auth/me`
  - `GET /core/admin/users` (match por `coreUserId`/email)
- headers de simulacao sao aceitos apenas se `isPlatformAdmin=true`.
- para usuario nao-root, headers de simulacao sao ignorados (fail-closed).

Arquivo:
- `apps/painel-web/server/utils/access-context.ts`

## 3) Gates server-side root-only

Problema:
- risco de depender so de gate no frontend para paginas root-only.

Correcao:
- endpoints BFF de `clientes` e `qa` passaram a exigir root em modo admin no backend.

Arquivos:
- `apps/painel-web/server/api/admin/clients/*`
- `apps/painel-web/server/api/admin/qa/*`

## 4) Remocao de forcamento de admin no frontend

Problema:
- `useBffFetch` forcava `x-user-type: admin` em chamadas `/api/admin/*`.

Correcao:
- forcamento removido; contexto passa a ser validado no backend.

Arquivo:
- `apps/painel-web/app/composables/useBffFetch.ts`

## 5) Helpers unificados de autorizacao por rota

Problema:
- parte das rotas admin ainda fazia combinacao manual de `resolveAccessContext` + checks ad hoc, o que aumenta risco de divergencia.

Correcao:
- criados helpers centralizados:
  - `requireFeatureAccess`
  - `requireRootAdmin`
  - `requireTenantAdmin`
- rotas criticas de `clients`, `users` e `qa` passaram a usar esses helpers como fonte unica.

Arquivos:
- `apps/painel-web/server/utils/admin-route-auth.ts`
- `apps/painel-web/server/api/admin/clients/*`
- `apps/painel-web/server/api/admin/users/*`
- `apps/painel-web/server/api/admin/qa/*`

## 6) Rate limit em login e endpoints sensiveis

Problema:
- login do BFF, login do API Node e login do core ainda podiam sofrer brute force sem backoff central.
- limite anterior era em memoria do processo, o que se perde em restart e nao funciona bem em multi-instancia.

Correcao:
- Nuxt server:
  - rate limit no `/api/bff/auth/login`
  - rate limit no `/api/core-bff/core/auth/login`
  - rate limit no patch de perfil
  - storage migrado para Redis com fallback em memoria se Redis falhar
- API Node:
  - rate limit por IP
  - rate limit adicional por `tenant+email+ip`
  - storage migrado para Redis com fallback em memoria se Redis falhar
- Core Go:
  - rate limit em `POST /core/auth/login`
  - storage migrado para Redis com fallback em memoria se Redis falhar

Arquivos:
- `apps/painel-web/server/utils/rate-limit.ts`
- `apps/painel-web/server/utils/redis.ts`
- `apps/painel-web/server/api/bff/[...path].ts`
- `apps/painel-web/server/api/core-bff/[...path].ts`
- `apps/painel-web/server/api/admin/profile/index.patch.ts`
- `apps/atendimento-online-api/src/lib/rate-limit.ts`
- `apps/atendimento-online-api/src/routes/auth.ts`
- `apps/plataforma-api/internal/httpapi/middleware/ratelimit.go`
- `apps/plataforma-api/internal/httpapi/router.go`
- `apps/plataforma-api/internal/config/config.go`
- `apps/plataforma-api/cmd/server/main.go`

## 7) Sanitizacao de erro em producao

Problema:
- respostas upstream e excecoes internas ainda podiam expor detalhes demais em producao.

Correcao:
- proxies do Nuxt passaram a sanitizar payload/transport errors em runtime de producao.
- `coreAdminFetch` agora reduz detalhe exposto quando a falha e upstream/network.
- API Node ganhou `setErrorHandler` para responder 5xx genericamente em producao.
- login unificado do Node nao devolve mais `details` sensiveis em producao.

Arquivos:
- `apps/painel-web/server/utils/safe-error.ts`
- `apps/painel-web/server/api/bff/[...path].ts`
- `apps/painel-web/server/api/core-bff/[...path].ts`
- `apps/painel-web/server/utils/core-admin-fetch.ts`
- `apps/atendimento-online-api/src/main.ts`
- `apps/atendimento-online-api/src/routes/auth.ts`

## 8) Gate de seguranca no CI

Problema:
- auditoria de acesso existia localmente, mas nao bloqueava merge.

Correcao:
- workflow do GitHub Actions agora:
  - corrige job de build do Nuxt para o path real
  - sobe stack dev com `docker compose`
  - executa `node scripts/security-access-audit.mjs`
  - falha o pipeline quando houver regressao de permissao

Arquivo:
- `.github/workflows/ci.yml`

## 9) Trusted proxy e sanitizacao de `X-Forwarded-For`

Problema:
- o BFF ainda encaminhava cabecalhos de proxy sem normalizacao consistente.
- API Node e core Go precisavam confiar em `X-Forwarded-For` apenas quando o peer imediato fosse um proxy privado/loopback conhecido.

Correcao:
- BFF do Nuxt agora reescreve:
  - `x-forwarded-for`
  - `x-forwarded-proto`
  - `x-forwarded-host`
- o IP usado no downstream passa a ser derivado do peer real da requisicao, sem confiar cegamente no header recebido do browser.
- API Node agora resolve IP confiavel apenas quando o peer remoto estiver em faixa privada/loopback.
- core Go substituiu o `RealIP` generico por middleware proprio com a mesma regra de confianca.

Arquivos:
- `apps/painel-web/server/api/bff/[...path].ts`
- `apps/painel-web/server/api/core-bff/[...path].ts`
- `apps/atendimento-online-api/src/lib/trusted-proxy.ts`
- `apps/atendimento-online-api/src/routes/auth.ts`
- `apps/plataforma-api/internal/httpapi/middleware/proxy.go`
- `apps/plataforma-api/internal/httpapi/router.go`

## 10) Gate server-side alinhado com modulos/feature matrix

Problema:
- parte das rotas admin ainda fazia validacao manual de cliente e nao consumia a mesma matriz usada pelo frontend.
- rotas de `site`, `team`, `tools` e `finance` podiam divergir de permissao, especialmente em cenarios de modulo desabilitado.

Correcao:
- `requireFeatureAccess` passou a resolver modulos ativos do cliente no core antes de autorizar features dependentes de modulo.
- `requireScopedFeatureAccess` passou a ser adotado nas rotas de:
  - `finance`
  - `site` (`produtos`, `leads`)
  - `team` (`candidatos`, `treinamento`)
  - `tools` (`qr-code`, `encurtador-link`, `scripts`)
- isso fecha o bypass server-side por acesso direto a endpoint sem depender do menu/rota no frontend.

Arquivos:
- `apps/painel-web/server/utils/admin-route-auth.ts`
- `apps/painel-web/app/utils/admin-access.ts`
- `apps/painel-web/server/api/admin/finances/*`
- `apps/painel-web/server/api/admin/products/*`
- `apps/painel-web/server/api/admin/leads/*`
- `apps/painel-web/server/api/admin/candidates/*`
- `apps/painel-web/server/api/admin/training/*`
- `apps/painel-web/server/api/admin/qrcodes/*`
- `apps/painel-web/server/api/admin/short-links/*`
- `apps/painel-web/server/api/admin/scripts/*`

## 11) Auditoria estruturada de acesso negado (`403`)

Problema:
- negacoes de acesso nao deixavam trilha padronizada com ator, rota e motivo.

Correcao:
- `requireFeatureAccess`, `requireTenantAdmin`, `requireRootAdmin` e `requireScopedFeatureAccess` agora registram evento estruturado quando negam acesso.
- o log inclui:
  - rota alvo
  - rota HTTP recebida
  - motivo normalizado
  - feature negada
  - ator da sessao
  - tenant/client ativo

Arquivos:
- `apps/painel-web/server/utils/access-context.ts`
- `apps/painel-web/server/utils/admin-route-auth.ts`
- `apps/painel-web/server/utils/admin-feature-guard.ts`

Exemplo de evento:

```text
[admin-access-denied] {"reason":"module-finance","path":"/admin/finance","actor":{"email":"root@core.local","clientId":4}}
```

## 12) Allowlist configuravel de proxy confiavel

Problema:
- a confianca em proxy estava hardcoded para cenarios locais, sem allowlist controlavel por ambiente.

Correcao:
- adicionadas variaveis de ambiente:
  - `TRUSTED_PROXY_RANGES`
  - `CORE_TRUSTED_PROXY_RANGES`
  - `NUXT_TRUSTED_PROXY_RANGES`
- formato aceito:
  - `loopback`
  - `private`
  - IP exato
  - CIDR
- exemplo:
  - `loopback,private,172.21.0.0/16,10.10.0.0/16`

Arquivos:
- `.env.example`
- `docker-compose.dev.yml`
- `docker-compose.prod.yml`
- `apps/painel-web/nuxt.config.ts`
- `apps/painel-web/server/utils/trusted-proxy.ts`
- `apps/atendimento-online-api/src/config.ts`
- `apps/atendimento-online-api/src/lib/trusted-proxy.ts`
- `apps/plataforma-api/internal/config/config.go`
- `apps/plataforma-api/internal/httpapi/middleware/proxy.go`

## 13) Login central sem tenant na UI

Problema:
- a tela de login ainda exigia `tenant/client`, mesmo com o core ja suportando autenticacao por `email + senha`.

Correcao:
- a pagina `/admin/login` passou a enviar apenas `email` e `senha`.
- o backend Node agora:
  - aceita `tenantSlug` opcional por compatibilidade
  - tenta autenticar no core sem tenant explicito
  - resolve o tenant efetivo pelo retorno do core
  - faz bootstrap legado apenas quando encontra um tenant local unico para aquele email

Arquivos:
- `apps/painel-web/app/pages/admin/login.vue`
- `apps/atendimento-online-api/src/routes/auth.ts`

## 14) Hardening de upload e webhook

Problema:
- upload admin de imagem aceitava SVG, nao limitava `content-type` antes do parse do multipart e nao tinha rate limit proprio.
- webhook da Evolution validava token por comparacao simples e aceitava payload/content-type sem restricao adicional.

Correcao:
- upload admin de produto:
  - removeu `image/svg+xml` da allowlist
  - exige `multipart/form-data`
  - rejeita `content-length` acima do limite antes de carregar o body
  - ganhou rate limit proprio
- webhook Evolution:
  - comparacao de token com `timingSafeEqual`
  - allowlist de `content-type`
  - limite de tamanho por `content-length`
  - rate limit por `tenantSlug + IP`
  - replay protection/idempotency com Redis e fallback em memoria
  - duplicate replay responde `202 ignored` sem reprocessar side effects
- Redis operacional:
  - compose dev/prod padronizado com `maxmemory-policy noeviction`
  - evita descarte silencioso de jobs/eventos/locks de seguranca

Arquivos:
- `apps/painel-web/server/api/admin/products/[id]/image.post.ts`
- `apps/atendimento-online-api/src/routes/webhooks/register-routes.ts`
- `apps/atendimento-online-api/src/routes/webhooks/idempotency.ts`
- `apps/atendimento-online-api/src/config.ts`
- `docker-compose.dev.yml`
- `docker-compose.prod.yml`

## Como validamos (automacao)

Script criado:
- `scripts/security-access-audit.mjs`

Comando:

```bash
node scripts/security-access-audit.mjs
```

Variaveis opcionais:

- `SECURITY_AUDIT_UI_BASE_URL` (default `http://127.0.0.1:3000`)
- `SECURITY_AUDIT_API_BASE_URL` (default `http://127.0.0.1:4000`)
- `SECURITY_AUDIT_CORE_BASE_URL` (default `http://127.0.0.1:4100`)
- `SECURITY_AUDIT_ROOT_EMAIL` (default `root@core.local`)
- `SECURITY_AUDIT_ROOT_PASSWORD` (default `123456`)
- `SECURITY_AUDIT_ROOT_TOKEN` (opcional; reutiliza token ja emitido e pula o login root no shell)
- `SECURITY_AUDIT_ADMIN_EMAIL` (default `admin@demo-core.local`)
- `SECURITY_AUDIT_ADMIN_PASSWORD` (default `123456`)
- `SECURITY_AUDIT_ADMIN_TOKEN` (opcional; reutiliza token ja emitido e pula o login tenant admin no shell)
- `SECURITY_AUDIT_TIMEOUT_MS` (default `8000`; timeout por request do audit)
- `SECURITY_AUDIT_WEBHOOK_TENANT` (default `demo`)
- `SECURITY_AUDIT_OUTPUT_FILE` (default `docs/metrics/security-access-audit-latest.json`)

Comportamento de auth:

- o script tenta primeiro o login via shell (`/api/core-bff/core/auth/login`)
- quando o proxy do shell nao estiver disponivel, faz fallback para `POST /core/auth/login` no `plataforma-api`
- quando `SECURITY_AUDIT_ROOT_TOKEN` ou `SECURITY_AUDIT_ADMIN_TOKEN` forem informados, o script reutiliza esses tokens e nao depende do fluxo de login para iniciar a auditoria

Saida gerada:
- `docs/metrics/security-access-audit-latest.json`

## Casos validados no ultimo rerun confirmado

1. Root em modo admin acessa `GET /api/admin/clients` -> `200`
2. Root em simulacao client bloqueado em `GET /api/admin/clients` -> `403`
3. Root em modo admin acessa `GET /api/admin/qa` -> `200`
4. Root em simulacao client bloqueado em `GET /api/admin/qa` -> `403`
5. Requisicao anonima bloqueada em `GET /api/admin/clients` -> `403`
6. Tenant admin bloqueado em `GET /api/admin/clients` -> `403`
7. Tenant admin com spoof de headers bloqueado em `GET /api/admin/clients` -> `403`
8. Tenant admin com escopo permitido acessa `GET /api/admin/users` -> `200`
9. Tenant admin bloqueado em `GET /api/admin/qa` -> `403`
10. Root em modo admin acessa `GET /api/admin/products` -> `200`
11. Root em modo admin acessa `GET /api/admin/candidates` -> `200`
12. Root em modo admin acessa `GET /api/admin/qrcodes` -> `200`
13. Root em modo admin acessa `GET /api/admin/scripts` -> `200`
14. Root em modo admin acessa `GET /api/admin/finances` -> `200`
15. Root em sessao simulada de cliente sem `finance` e bloqueado em `GET /api/admin/finances` -> `403`
16. Tenant admin acessa `GET /api/admin/products` no proprio escopo -> `200`
17. Tenant admin acessa `GET /api/admin/candidates` no proprio escopo -> `200`
18. Tenant admin acessa `GET /api/admin/qrcodes` no proprio escopo -> `200`
19. Tenant admin acessa `GET /api/admin/scripts` no proprio escopo -> `200`
20. Tenant admin recebe resposta coerente com modulo ativo em `GET /api/admin/finances` -> `200/403`

Blocos cobertos no rerun atual:
- `GET` de acesso root-only, tenant-scoped e modulo-scoped
- `POST/PATCH/DELETE` de `clients`, `products`, `qrcodes`, `scripts` e `finances`
- webhook sem token
- webhook com `content-type` invalido
- webhook valido com token correto
- webhook repetido bloqueado por idempotency/replay guard

Resultado atual:
- 40/40 casos passaram.

Execucao mais recente:
- data/hora: `2026-03-15T15:22:17.430Z` -> `2026-03-15T15:22:25.864Z`
- comando: `node scripts/security-access-audit.mjs`
- saida: `docs/metrics/security-access-audit-latest.json`

## Limites do teste atual

O ultimo rerun confirmado cobre controle de acesso HTTP no BFF e os writes principais dos modulos admin mockados.

Nao cobre ainda:
- SQL injection (rotas e consultas diversas).
- XSS/DOM injection no frontend.
- CSRF para fluxos cookie-based.
- abuse/performance (DoS) e timeouts.

Observacao operacional em dev:
- os rate limits e locks de idempotencia usam Redis como storage principal.
- fallback in-memory permanece apenas para degradacao controlada quando Redis falha.

## Melhorias recomendadas (proximos passos)

Prioridade alta:

1. Confirmar a lista oficial de proxies confiaveis para producao e ajustar a allowlist por ambiente real.
2. Revisar logs de negacao para enviar tambem a um sink centralizado quando entrarmos em producao.
3. Evoluir webhook para assinatura/versionamento caso o provider permita um esquema mais forte que token compartilhado.

Prioridade media:

1. Revisar armazenamento de token no frontend (avaliar migracao para estrategia mais resiliente contra XSS).
2. Adicionar CAPTCHA/MFA opcional em clientes que exigirem nivel maior de protecao.
3. Auditar uploads/media do omnichannel com o mesmo nivel de hardening.

Prioridade continua:

1. Rodar o audit de acesso a cada alteracao de auth/ACL.
2. Atualizar `docs/access-control-matrix.md` antes de liberar novas paginas/modulos.
