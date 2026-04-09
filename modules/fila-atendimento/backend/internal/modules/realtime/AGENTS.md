# AGENTS.md - realtime

## Identidade do módulo

- papel: transporte websocket do módulo `fila-atendimento`
- status: alinhado à fronteira exportada de realtime no runtime hospedado atual

## Responsabilidades

- autenticar a conexão realtime por token de acesso
- validar assinatura por loja para eventos operacionais
- validar assinatura administrativa por tenant para invalidação de contexto
- publicar apenas sinais leves de invalidação para a UI revalidar dados HTTP

## Contratos consumidos

- `RealtimeContextResolver`
- `AccessContext`

Compatibilidade atual do runtime hospedado:

- `AuthRealtimeContextResolver` converte `auth.Service + stores.Service + tenants.Service` para a fronteira exportada

## Interfaces expostas

- `GET /v1/realtime/operations?storeId=...&access_token=...`
- `GET /v1/realtime/context?tenantId=...&access_token=...`
- `PublishOperationEvent(...)`
- `PublishContextEvent(...)`

## Regras de arquitetura

- o payload do evento deve continuar leve e orientado a invalidação
- o slice não deve depender estruturalmente de `auth.Principal` nem de services concretos do host na borda principal
- a compatibilidade com o runtime atual fica restrita ao adapter `AuthRealtimeContextResolver`
- o hub em memória segue aceitável enquanto a hospedagem continuar em processo único

## Estado atual da fase

- feito em `2026-04-06`:
  - o handshake do realtime passou a consumir `RealtimeContextResolver`
  - a resolução de tenant para `/v1/realtime/context` agora usa `AccessContext` e escopos retornados pelo resolver
  - o runtime hospedado atual preserva compatibilidade via `AuthRealtimeContextResolver`
  - testes de websocket cobrem autenticação obrigatória, assinatura operacional e fallback de tenant único no contexto

## Checks mínimos de mudança

- `go test ./internal/modules/realtime`
- validar upgrade websocket no runtime hospedado quando houver mudança de handshake