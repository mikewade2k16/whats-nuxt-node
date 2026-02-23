# Roadmap de Paridade WhatsApp Web

Objetivo: evoluir o painel para cobrir operacao equivalente ao WhatsApp Web dentro do contexto multi-tenant.

## Fase 1 (em andamento) - Base de conversa e grupo

1. Receber e enviar texto.
2. Deduplicar eco de mensagem enviada.
3. Suportar conversa de grupo com:
   - nome do grupo no card/conversa
   - autor por mensagem no chat de grupo
4. Persistir avatar de conversa e avatar de autor quando disponivel.
5. Destacar menções (`@usuario`/`@numero`) no corpo das mensagens.

## Fase 2 - Midia e anexos

1. Receber imagem, video, audio, documento.
2. Enviar imagem, video, audio, documento.
3. Salvar metadados de midia (mime, nome, tamanho, url, checksum).
4. Exibir preview por tipo:
   - imagem: thumbnail
   - video: player
   - audio: player com timeline
   - documento: nome, tipo, download
5. Tratar fallback quando midia expirar no provedor.

## Fase 3 - Recursos de atendimento (semelhante ao WhatsApp Web)

1. Responder mensagem especifica (quote/reply).
2. Encaminhar.
3. Apagar para todos / apagar local (quando suportado pelo conector).
4. Reacoes em mensagem.
5. Marcadores de leitura/entrega/erro mais detalhados.
6. Busca interna por conteudo/midia/contato.

## Fase 4 - Operacao de equipe (omnicanal)

1. Atribuicao, transferencia e filas.
2. SLA (primeira resposta e tempo medio).
3. Etiquetas, notas internas e historico de atribuicao.
4. Auditoria de acoes e trilha de eventos.
5. Suporte multi-canal adicional (Instagram oficial).

## Estrutura de dados alvo para as fases

1. `message_type` em mensagem (`TEXT`, `IMAGE`, `AUDIO`, `VIDEO`, `DOCUMENT`, `SYSTEM`).
2. `metadata_json` em mensagem para payload do provedor.
3. `message_attachment` para anexos.
4. `webhook_event_raw` para reprocessamento.
5. `channel_account` para multiplas contas por tenant.

## Regra de implementacao

1. Entregar por incrementos pequenos e validaveis.
2. Cada incremento precisa incluir:
   - ajuste de dados
   - ajuste de API
   - ajuste de UI
   - documentacao
3. Antes de debugar runtime, validar compatibilidade de versoes de dependencias.
