# Roadmap de Paridade WhatsApp (Web/Desktop/Mobile)

Objetivo: mapear todas as funcionalidades relevantes do WhatsApp para guiar a evolucao do painel omnichannel, com visao de paridade funcional e prioridade de implementacao.

Backlog executavel associado: `docs/backlog-execucao.md`.

## Como ler este documento

Status:
1. `Implementado`: funcional no MVP atual.
2. `Parcial`: existe, mas com lacunas de UX, regra ou estabilidade.
3. `Faltando`: ainda nao implementado.

Plataformas:
1. `M`: WhatsApp Mobile.
2. `D`: WhatsApp Desktop (app).
3. `W`: WhatsApp Web.

## Inventario oficial de funcionalidades WhatsApp

Baseado em paginas oficiais de features e Help Center (links no fim).

### 1) Conversa e mensagens

1. Texto (M/D/W)
2. Emojis (M/D/W)
3. Reacoes em mensagens (M/D/W)
4. Responder mensagem especifica (quote/reply) (M/D/W)
5. Encaminhar mensagem (M/D/W)
6. Apagar mensagem (para mim / para todos quando permitido) (M/D/W)
7. Editar mensagem (quando suportado pela plataforma oficial) (M/D/W)
8. Marcacao com `@` em grupos (M/D/W)
9. Buscar mensagens por conversa e termo (M/D/W)
10. Fixar conversa e arquivar conversa (M/D/W)
11. Mensagens temporarias (disappearing messages) (M/D/W)
12. Mensagens "visualizacao unica" para midia (M/D/W)
13. Indicadores de envio/entrega/leitura (M/D/W)
14. Mensagens favoritas/stars (M/D/W)
15. Enquetes (M/D/W)
16. Eventos em conversa/grupo (M/D/W)
17. Compartilhar contato (M/D/W)
18. Compartilhar localizacao (principalmente Mobile; suporte pode variar em D/W)
19. GIFs e figurinhas (stickers) (M/D/W)
20. Figurinhas animadas e packs (M/D/W)

### 2) Midia e anexos

1. Foto (M/D/W)
2. Video (M/D/W)
3. Documento (M/D/W)
4. Audio/voz (arquivo) (M/D/W)
5. Mensagem de voz gravada no composer (M/D/W, com UX nativa variando)
6. Video note (mensagem curta de video, disponibilidade pode variar por cliente) (M/D/W)
7. Abrir, baixar e encaminhar midia/documento (M/D/W)
8. Preview de midia no chat (M/D/W)

### 3) Chamadas

1. Chamada de voz 1:1 (M/D/W conforme suporte oficial atual)
2. Chamada de video 1:1 (M/D/W conforme suporte oficial atual)
3. Chamadas em grupo (M/D/W com limites por cliente)
4. Gerar link de chamada (M/D/W)
5. Compartilhar tela em chamada (quando suportado) (M/D)

### 4) Grupos, comunidades e broadcast

1. Grupos com admins e permissoes (M/D/W)
2. Mencoes de participantes em grupos (M/D/W)
3. Comunidades (M/D/W)
4. Canais (M/D/W)
5. Listas de transmissao (broadcast) (principalmente Mobile)

### 5) Status e descoberta

1. Status (M/D/W em graus diferentes de suporte)
2. Visualizar canais e seguir canais (M/D/W)

### 6) Conta, sessao e seguranca

1. Vinculo por QR code (Linked Devices) (M/D/W)
2. Multi-dispositivo (M/D/W)
3. Criptografia ponta a ponta (mensagens e chamadas) (M/D/W)
4. Verificacao em duas etapas e controles de privacidade (M, com reflexos em D/W)
5. Bloqueio de chat e controles de visibilidade (M/D/W conforme disponibilidade)

### 7) WhatsApp Business (referencia para roadmap do painel)

1. Perfil comercial (M/D/W em contextos de conta Business)
2. Catalogo de produtos (forte em Mobile)
3. Respostas rapidas (forte em Business App)
4. Etiquetas de conversa/cliente

## Matriz de paridade do nosso MVP (estado atual)

### 1) Nucleo de atendimento

1. Conectar conta via QR code -> `Implementado`
2. Receber mensagens de texto -> `Implementado`
3. Enviar mensagens de texto -> `Implementado`
4. Indicador de status de envio (`PENDING`, `SENT`, `FAILED`) -> `Parcial` (ha casos com `PENDING` prolongado)
5. Filtro por canal/status e busca basica -> `Implementado`
6. Separador de data e marcador de nao lidas -> `Parcial`

### 2) Grupos e autoria

1. Exibir nome correto do grupo no card de conversa -> `Implementado` (com fallback seguro para grupos sem `subject` no payload)
2. Exibir autor por mensagem em grupo -> `Parcial`
3. Exibir avatar de grupo e contato -> `Parcial` (melhorado; exige reteste regressivo)
4. Dedupe de eco (nao duplicar propria mensagem quando webhook retorna) -> `Parcial`
5. Mencoes `@` recebidas com nome resolvido -> `Parcial` (incompleto; postergado)
6. Enviar mencoes `@` a partir do composer -> `Parcial` (incompleto; postergado)

### 3) Midia e anexos

1. Enviar imagem/video/documento/audio -> `Parcial` (instabilidade e lentidao em alguns cenarios)
2. Receber imagem/video/documento/audio -> `Parcial` (fallback/preview ainda incompleto em casos criptografados/expirados)
3. Preview de imagem/video/audio no chat -> `Parcial`
4. Abrir/Baixar anexos -> `Parcial`
5. Envio "como documento" (sem compressao) -> `Implementado` (validado com arquivo de imagem/webp como documento)
6. Gravar audio no composer -> `Parcial`
7. Upload sem bloquear digitacao do agente -> `Parcial`

### 4) Recursos tipo WhatsApp Web ainda faltantes

1. Picker completo de emojis (padrao WhatsApp) -> `Parcial`
2. Suporte completo a figurinhas (send/receive/render) -> `Parcial`
3. Reacoes em mensagens -> `Implementado`
4. Encaminhar mensagem -> `Faltando`
5. Apagar para todos (quando API suportar) -> `Faltando`
6. Editar mensagem -> `Faltando`
7. Enquetes e eventos -> `Faltando`
8. Calls/links de chamada dentro do painel -> `Faltando`
9. Status e canais no painel -> `Faltando`

## Checklist de paridade rastreavel

### Nucleo de atendimento

- [x] [P0] Conectar conta via QR code.
- [x] [P0] Receber mensagens de texto.
- [x] [P0] Enviar mensagens de texto.
- [-] [P0] Status de envio consistente (`PENDING`, `SENT`, `FAILED`).
- [x] [P0] Filtro por canal/status e busca basica.
- [-] [P0] Marcador de nao lidas e separador de data estaveis.

### Grupos e autoria

- [x] [P0] Nome correto do grupo no card.
- [-] [P0] Autor por mensagem em grupo.
- [-] [P0] Avatar de grupo/contato em todos os cenarios.
- [-] [P0] Avatar de participante em grupo para todos os tipos (texto, audio, midia) - reteste pendente.
- [-] [P0] Dedupe de eco para mensagens outbound.
- [ ] [P1] Resolucao de mencoes recebidas com nome humano (postergado).
- [ ] [P1] Envio de mencao `@` no composer (postergado).

### Midia e anexos

- [-] [P0] Envio de imagem/video/documento/audio confiavel.
- [-] [P0] Recebimento de imagem/video/documento/audio confiavel.
- [-] [P0] Preview de imagem/video/audio/documento no chat.
- [x] [P0] Atualizacao de midia inbound em tempo real sem reload da pagina.
- [-] [P0] Abrir e baixar anexos sem erro.
- [x] [P0] Envio "como documento" sem compressao.
- [-] [P0] Gravacao e envio de audio no composer.
- [-] [P0] Upload sem bloquear digitacao do agente.
- [x] [P0] Placeholder para conteudo nao suportado no chat.
- [-] [P0] Corrigir caso de arquivo inbound em grupo chegando como `file (x).enc`.
  - andamento: abrir/baixar agora usa proxy autenticado com `Content-Disposition` normalizado para corrigir legado de `.enc`.

### Recursos avancados (deixar para depois do P0)

- [-] [P1] Picker de emojis completo no padrao WhatsApp.
- [-] [P1] Suporte completo a figurinhas (send/receive/render).
- [x] [P1] Reacoes em mensagens.
- [ ] [P1] Encaminhar mensagem.
- [ ] [P2] Apagar para todos (quando API suportar).
- [ ] [P2] Editar mensagem (quando API suportar).
- [ ] [P2] Enquetes e eventos.
- [ ] [P2] Calls/links de chamada no painel.
- [ ] [P2] Status e canais no painel.

## Backlog funcional solicitado para a plataforma (produto)

Itens solicitados e consolidados para execucao:

### A) Paridade de conteudo da conversa

1. Emojis completos (envio e renderizacao de recebidos).
2. Figurinhas completas (envio, recebimento, preview e download).
3. Helper de conteudo nao suportado:
   - se chegar algo sem suporte, criar mensagem placeholder visivel no chat
   - exibir tipo detectado e acao sugerida (ex: "abrir no WhatsApp")
4. Melhorar reply para ficar fiel ao WhatsApp Web (bloco citado + UX).
5. Mencoes em grupo:
   - resolver nome humano no recebimento
   - enviar mencao com `mentions[]` no payload outbound.

### B) Operacao segura de testes

1. Modo sandbox de testes:
   - lista de contatos/grupos permitidos
   - bloqueio de envio para destinos fora da allowlist em ambiente de teste.
2. Conversa de teste dedicada para homologacao.

### C) Multi-tenant e usuarios

1. Tenant com multiplos atendentes.
2. [Implementado] Diferenciar operador no envio:
   - registrar `senderUserId`
   - exibir "quem enviou" no historico interno.
3. Chat interno entre equipe (sem cliente final).
4. Chat cliente -> admin da plataforma (suporte operacional).
5. Perfis e permissoes por papel (admin, supervisor, atendente, viewer).

### F) CRM de contatos (base inicial; postergado para pos-MVP)

1. Quando numero nao salvo iniciar conversa, permitir "Salvar contato" direto do painel.
2. Persistir contato por tenant e vincular conversa a esse contato.
3. Permitir evoluir o contato para lead/cliente em etapas futuras de CRM.

### D) Governanca comercial (planos e limites)

1. Limite por tenant de:
   - quantidade de numeros/instancias WhatsApp
   - quantidade de usuarios/assentos
2. Planos configuraveis (ex: Basico 1 numero + 1 usuario, etc).
3. Regras de bloqueio e alerta por excedente de plano.

### E) Dados e retencao

1. Retencao configuravel de historico (ex: 15 dias por tenant/plano).
2. Job de expurgo por politica de retencao.
3. [Implementado] Auditoria de alteracoes criticas (status, responsavel, envio, falha).

## Ordem sugerida de execucao (proxima iteracao)

1. `P0` Estabilidade de envio/recebimento:
   - remover duplicidade de midia outbound
   - corrigir `PENDING` infinito
   - garantir fallback de midia e placeholder de nao suportado
2. `P0` Paridade minima de UX do chat:
   - composer com anexos robusto sem travar input
   - reply estilo WhatsApp Web
3. `P1` Emoji + sticker:
   - picker de emoji
   - receive/render sticker
   - send sticker
4. `P1` Modo sandbox de teste.
5. `P1` Multi-tenant de planos (limites de numeros e usuarios).
6. `P1` Mencoes em grupo (receber/enviar) - etapa final da paridade.
7. `P2` CRM minimo operacional:
   - salvar contato nao salvo a partir da conversa
   - vincular conversa a contato e manter historico
8. `P2` Chat interno + suporte cliente/admin.
9. `P2` Recursos avancados (reacoes, encaminhar, editar, enquetes, eventos).

## Fontes oficiais consultadas (base de pesquisa)

1. https://www.whatsapp.com/features
2. https://www.whatsapp.com/features/messaging
3. https://www.whatsapp.com/features/groups
4. https://www.whatsapp.com/features/status
5. https://www.whatsapp.com/features/channels
6. https://www.whatsapp.com/features/security
7. https://www.whatsapp.com/web
8. https://www.whatsapp.com/download
9. https://faq.whatsapp.com/1324084875126592/
10. https://faq.whatsapp.com/1053543185312573/
11. https://faq.whatsapp.com/417024237251050/
12. https://faq.whatsapp.com/5913398998672934/
