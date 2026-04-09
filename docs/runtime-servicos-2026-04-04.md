# Runtime de Serviços - 2026-04-04

Snapshot da topologia de runtime atual do projeto e da decisão operacional consolidada após a absorção inicial do `fila-atendimento` na stack principal.

## Resumo executivo

- manter `atendimento-online-worker` como serviço separado no runtime atual
- manter `atendimento-online-retencao-worker` separado por enquanto, mas classificá-lo como candidato real à fusão futura
- hospedar `fila-atendimento` dentro dos serviços existentes do shell, sem `web/api/postgres` próprios no deploy principal
- manter `whatsapp-evolution-gateway` opcional via profile `channels`
- manter `adminer` e `redis-commander` fora do boot padrão via profile `ops`

## Matriz de decisão

| Serviço | Status atual recomendado | Motivo principal | Próximo passo |
|---|---|---|---|
| `postgres` | manter separado | persistência transacional central | sem mudança |
| `redis` | manter separado | fila BullMQ, cache e pub/sub | sem mudança |
| `plataforma-api` | manter separado | auth, tenants, módulos e contexto do shell; hospeda o backend do `fila-atendimento` | endurecer smoke de container |
| `atendimento-online-api` | manter separado | API operacional, realtime e webhooks | sem mudança |
| `painel-web` | manter separado | frontend/BFF principal; hospeda a entrada do `fila-atendimento` | ampliar host interno do módulo |
| `atendimento-online-worker` | manter separado | processamento outbound assíncrono, retries e integração externa | sem mudança |
| `atendimento-online-retencao-worker` | manter por enquanto, planejar fusão | hoje é apenas scheduler leve com `setInterval` + Prisma | fundir depois da estabilização |
| `fila-atendimento` | hospedado na stack principal | módulo plugável com fronteira por contrato, usando schema próprio no mesmo Postgres | continuar absorção progressiva |
| `whatsapp-evolution-gateway` | opcional | conector de canal real; não é necessário para todo ambiente | manter em `profile: channels` |
| `adminer` | opcional | ferramenta operacional | manter em `profile: ops` |
| `redis-commander` | opcional | ferramenta operacional | manter em `profile: ops` |
| `caddy` | separado só em VPS/prod | reverse proxy/SSL de produção | manter no override de produção |

## Como o `fila-atendimento` roda agora

### Backend

- sobe dentro do `plataforma-api`
- exposto no prefixo `/core/modules/fila-atendimento`
- reutiliza o mesmo container Go já existente

### Frontend

- entra pelo `painel-web`
- exposto em `/admin/fila-atendimento`
- usa BFF próprio do painel para bootstrap, sessão e leituras iniciais

### Banco

- usa o mesmo `postgres`
- mantém isolamento em schema próprio `fila_atendimento`
- migrations do módulo rodam durante o bootstrap do `plataforma-api`

## Conclusões por serviço

### `atendimento-online-worker`

Deve continuar separado agora.

Motivos:

- consome BullMQ continuamente
- fala com provider externo e sofre impacto de retry, latência e backpressure
- precisa poder escalar independentemente da API HTTP
- falha operacional do outbound não deve derrubar o processo da API

### `atendimento-online-retencao-worker`

Não justifica ser um serviço dedicado no desenho-alvo de longo prazo, mas ainda não vale fundir agora.

Motivos:

- hoje ele só executa `runRetentionSweep()` em intervalo configurável
- não consome fila
- não depende de HTTP
- não precisa de throughput separado como o outbound

### `whatsapp-evolution-gateway`

Deve continuar opcional.

Motivos:

- nem todo ambiente precisa de canal real ativo
- desenvolvimento de painel, core, auth, tenants e docs não depende dele
- o profile `channels` já comunica corretamente esse papel

## Topologia recomendada por ambiente

### Local padrão

- `postgres`
- `redis`
- `plataforma-api`
- `atendimento-online-api`
- `atendimento-online-worker`
- `atendimento-online-retencao-worker`
- `painel-web`

### Local com canal real

- base local padrão
- `whatsapp-evolution-gateway` via `--profile channels`

### Local/VPS para operação

- ambiente já ativo
- `adminer` e `redis-commander` via `--profile ops`

### Alvo futuro

- `postgres`
- `redis`
- `plataforma-api`
- `atendimento-online-api`
- `atendimento-online-worker` com scheduler de retenção embutido
- `painel-web`
- `whatsapp-evolution-gateway` opcional

## Critério para revisitar esta decisão

Revisitar quando estes blocos estiverem fechados:

1. incorporação funcional do `fila-atendimento` dentro do host principal
2. smoke completo em container e na VPS
3. remoção do que ainda restar de bootstrap paralelo de contingência
4. avaliação do `item 16`, bem mais à frente, para convergência tecnológica adicional
