# Modelo de Dados Alvo (Escala)

Este documento descreve como o banco deve evoluir apos o MVP para suportar:

1. Mais tenants e agentes simultaneos.
2. Mais canais (Instagram oficial, futuros canais).
3. Melhor observabilidade e auditoria.
4. Mais seguranca e governanca.

## Principios de evolucao

1. Manter isolamento por tenant em todas as tabelas de dominio.
2. Evitar campo "generico demais" sem semantica.
3. Rastrear eventos criticos (auditoria e idempotencia).
4. Separar dados de configuracao de canal por conta/canal.

## Proposta de entidades novas

## 1) `channel_account`

Objetivo:

Representar cada conta/canal conectada por tenant.

Campos sugeridos:

1. `id`
2. `tenant_id`
3. `channel_type` (`WHATSAPP`, `INSTAGRAM`)
4. `display_name`
5. `external_account_id`
6. `status` (`CONNECTED`, `DISCONNECTED`, `PENDING`)
7. `settings_json` (encriptado ou minimizado)
8. `created_at`
9. `updated_at`

## 2) `conversation` (evoluida)

Evoluir tabela atual para incluir:

1. `channel_account_id` (FK)
2. `priority` (`LOW`, `NORMAL`, `HIGH`, `URGENT`)
3. `first_response_at`
4. `closed_at`
5. `sla_due_at`

## 3) `conversation_assignment_history`

Objetivo:

Rastrear quem assumiu/transferiu a conversa e quando.

Campos:

1. `id`
2. `tenant_id`
3. `conversation_id`
4. `from_user_id` (opcional)
5. `to_user_id` (opcional)
6. `reason`
7. `created_at`

## 4) `message` (evoluida)

Adicionar:

1. `message_type` (`TEXT`, `IMAGE`, `AUDIO`, `DOCUMENT`, `TEMPLATE`, `SYSTEM`)
2. `metadata_json` (ids externos, ack, erro do provedor)
3. `reply_to_message_id` (self FK opcional)

## 5) `message_attachment`

Objetivo:

Separar anexos da mensagem textual.

Campos:

1. `id`
2. `tenant_id`
3. `message_id`
4. `mime_type`
5. `filename`
6. `storage_url`
7. `size_bytes`
8. `checksum`
9. `created_at`

## 6) `queue` e `queue_membership`

Objetivo:

Roteamento por fila/equipe.

`queue`:

1. `id`
2. `tenant_id`
3. `name`
4. `channel_type` (opcional)
5. `active`

`queue_membership`:

1. `id`
2. `tenant_id`
3. `queue_id`
4. `user_id`
5. `weight` (estrategia de balanceamento)

## 7) `conversation_tag` e `tag`

Objetivo:

Classificacao e filtros operacionais.

## 8) `audit_log`

Objetivo:

Registrar alteracoes administrativas e operacionais.

Campos:

1. `id`
2. `tenant_id`
3. `actor_user_id`
4. `action`
5. `entity_type`
6. `entity_id`
7. `before_json`
8. `after_json`
9. `created_at`

## 9) `webhook_event_raw`

Objetivo:

Guardar payload bruto de webhook para reprocessamento e analise.

Campos:

1. `id`
2. `tenant_id`
3. `provider`
4. `event_type`
5. `external_event_id`
6. `payload_json`
7. `processed`
8. `created_at`
9. `processed_at`

## 10) `outbox_event`

Objetivo:

Padrao outbox para consistencia entre transacao de banco e envio de evento.

## Ajustes de seguranca recomendados

1. Remover `evolutionApiKey` em texto puro de `Tenant`.
2. Guardar segredo em vault/KMS ou tabela criptografada.
3. Guardar apenas referencia (`secret_ref`) no banco principal.

## Roadmap de migracao (pratico)

1. Fase 1:
   - criar `channel_account`
   - migrar `whatsappInstance` para essa tabela
2. Fase 2:
   - criar `conversation_assignment_history`
   - criar `tag` e `conversation_tag`
3. Fase 3:
   - criar `message_attachment` e `webhook_event_raw`
4. Fase 4:
   - criar `audit_log` e `outbox_event`
   - revisar indices por volume real

## Indicadores para decidir quando migrar

1. Mais de 3 canais por tenant.
2. Mais de 50 agentes por tenant.
3. Necessidade de auditoria formal.
4. Necessidade de reprocessar webhooks.
5. Volume alto de anexos/midias.

