# Fluxos de Negócio Derivados do Banco Atual

## Objetivo

Este documento descreve os fluxos de negócio que realmente emergem do banco atual. A ideia aqui não é propor o desenho ideal, e sim mostrar o desenho que o banco hoje obriga a aplicação a seguir.

## Visão macro

Hoje a plataforma opera em cinco trilhas principais:

1. shell de identidade, tenant, loja global e autorização em `platform_core`;
2. módulo financeiro em schema próprio `finance`;
3. operação omnichannel no schema `atendimento_online`, hoje atuando como runtime operacional do atendimento-online;
4. indicadores em `indicators`;
5. operação física de fila e loja em `fila_atendimento`.

Essas trilhas não formam um modelo físico único, mas já não estão no mesmo estágio de maturidade:

1. `platform_core` é o centro canônico;
2. `finance` já saiu do shell físico e ficou dono da operação financeira do tenant;
3. `fila_atendimento` já convergiu identidade, tenant e loja para o core;
4. `atendimento_online` já convergiu tenant, usuário, grants autoritativos, elegibilidade de acesso e limites, mantendo apenas operação local;
5. `indicators` segue integrado por referências lógicas e camada de serviço.

## Fluxo 1. Provisionamento de tenant, loja e usuário no shell

### Objetivo

Criar ou ativar um cliente, suas lojas globais, seus usuários e os módulos habilitados.

### Tabelas envolvidas

1. `platform_core.tenants`
2. `platform_core.tenant_stores`
3. `platform_core.users`
4. `platform_core.tenant_users`
5. `platform_core.tenant_subscriptions`
6. `platform_core.tenant_modules`
7. `platform_core.tenant_module_limits`
8. `platform_core.tenant_user_modules`
9. `platform_core.roles`
10. `platform_core.tenant_user_roles`

### Sequência prática

1. o tenant nasce ou é reativado em `tenants`;
2. as lojas globais do cliente nascem em `tenant_stores`;
3. a identidade global nasce em `users`;
4. o vínculo usuário-cliente nasce em `tenant_users`, com papel de negócio, nível de acesso, matrícula e vínculo opcional ou obrigatório com loja;
5. a assinatura ativa é registrada em `tenant_subscriptions`;
6. os módulos do cliente são ativados em `tenant_modules`;
7. limites específicos são resolvidos em `tenant_module_limits`;
8. o acesso do usuário a cada módulo nasce em `tenant_user_modules`;
9. papéis RBAC são aplicados em `tenant_user_roles`.

### O que esse fluxo revela

1. o shell já é o verdadeiro dono de autorização por tenant e por módulo;
2. `tenant_stores` passou a ser a loja global da plataforma;
3. qualquer módulo que ainda tente conceder acesso, manter usuário ou inventar loja própria como fonte de verdade vai divergir do shell.

## Fluxo 2. Login, sessão e recuperação de senha do painel

### Objetivo

Autenticar o usuário no shell e manter trilha de sessão.

### Tabelas envolvidas

1. `platform_core.users`
2. `platform_core.user_sessions`
3. `platform_core.auth_session_settings`
4. `platform_core.auth_password_resets`

### Sequência prática

1. o usuário autentica contra `users`;
2. a sessão nasce em `user_sessions` com hash do token;
3. o TTL vem de `auth_session_settings` por escopo;
4. se houver reset, a trilha nasce em `auth_password_resets`;
5. revogação, expiração e auditoria giram em torno de `user_sessions`.

### O que esse fluxo revela

1. o auth real da plataforma já está centralizado no shell;
2. qualquer login local em módulo hospedado é ruído legado;
3. o core já tem dados suficientes para ser a única fonte de sessão da plataforma inteira.

## Fluxo 3. Ativação comercial de módulos

### Objetivo

Ligar ou desligar funcionalidades por plano, tenant e usuário.

### Tabelas envolvidas

1. `platform_core.modules`
2. `platform_core.plans`
3. `platform_core.plan_modules`
4. `platform_core.plan_module_limits`
5. `platform_core.tenant_modules`
6. `platform_core.tenant_module_limits`
7. `platform_core.tenant_module_pricing`
8. `platform_core.tenant_user_modules`

### Sequência prática

1. o catálogo mestre fica em `modules`;
2. o pacote comercial base fica em `plans`, `plan_modules` e `plan_module_limits`;
3. a ativação real do cliente fica em `tenant_modules`;
4. exceções de limite ficam em `tenant_module_limits`;
5. exceções de preço ficam em `tenant_module_pricing`;
6. acesso efetivo do usuário fica em `tenant_user_modules`.

### O que esse fluxo revela

1. a plataforma já tem estrutura para operar módulos de forma centralizada;
2. módulos que ainda mantêm regra própria de concessão são candidatos naturais a convergir para esse eixo;
3. o acesso ao banco operacional deveria sempre respeitar os grants do shell.

## Fluxo 4. Operação omnichannel do atendimento-online

### Objetivo

Manter configuração local, instâncias, conversas, mensagens e trilha operacional do atendimento digital usando tenant, usuário, grants autoritativos e limites resolvidos no `platform_core`.

### Tabelas envolvidas

1. `atendimento_online."AtendimentoTenantConfig"`
2. `atendimento_online."WhatsAppInstance"`
3. `atendimento_online."Contact"`
4. `atendimento_online."Conversation"`
5. `atendimento_online."Message"`
6. `atendimento_online."AuditEvent"`
7. `atendimento_online."SavedSticker"`
8. `atendimento_online."HiddenMessageForUser"`

### Sequência prática

1. o shell resolve tenant ativo, usuário autenticado, grants de módulo e limites contratados;
2. o runtime carrega `AtendimentoTenantConfig` pelo `tenantId` canônico;
3. a instância operacional do canal vive em `WhatsAppInstance`;
4. `Contact` e `Conversation` consolidam o relacionamento operacional;
5. `Message` guarda inbound e outbound com autoria humana usando `senderUserId` do core;
6. `AuditEvent`, `SavedSticker` e `HiddenMessageForUser` completam a trilha operacional e as preferências locais.

### O que esse fluxo revela

1. a operação digital continua boa como domínio operacional;
2. `atendimento_online` deixou de manter shadow local de `Tenant` e `User`;
3. o que existe localmente é configuração operacional de runtime e domínio de canal, conversa e mensagem;
4. a convergência estrutural aqui foi fechada no próprio módulo.

## Fluxo 5. Gestão financeira por tenant

### Objetivo

Controlar configuração financeira, planilhas mensais, linhas e ajustes.

### Tabelas envolvidas

1. `finance.finance_configs`
2. `finance.finance_categories`
3. `finance.finance_fixed_accounts`
4. `finance.finance_fixed_account_members`
5. `finance.finance_recurring_entries`
6. `finance.finance_sheets`
7. `finance.finance_lines`
8. `finance.finance_line_adjustments`

### O que esse fluxo revela

1. o módulo financeiro saiu do shell físico e agora está bem isolado em schema próprio;
2. o principal ponto frágil continua sendo a soft reference de `fixed_account_id`;
3. `tenant_store_charges` ainda existe no `platform_core` como overlay financeiro por loja, mas já não pode divergir do diretório canônico em `tenant_stores`.

## Fluxo 6. Gestão de indicadores

### Objetivo

Definir templates, perfis, metas, avaliações e evidências do módulo de indicadores.

### Tabelas envolvidas

1. `indicators.indicator_templates`
2. `indicators.indicator_template_versions`
3. `indicators.indicator_template_categories`
4. `indicators.indicator_template_indicators`
5. `indicators.indicator_template_indicator_items`
6. `indicators.indicator_profiles`
7. `indicators.indicator_profile_indicator_overrides`
8. `indicators.indicator_profile_indicator_items`
9. `indicators.indicator_profile_store_overrides`
10. `indicators.indicator_provider_bindings`
11. `indicators.indicator_target_sets`
12. `indicators.indicator_target_items`
13. `indicators.indicator_evaluations`
14. `indicators.indicator_evaluation_categories`
15. `indicators.indicator_evaluation_indicators`
16. `indicators.indicator_evaluation_items`
17. `indicators.indicator_metric_snapshots`
18. `indicators.indicator_assets`
19. `indicators.indicator_governance_policies`
20. `indicators.indicator_governance_roadmap_items`

### O que esse fluxo revela

1. o schema já está maduro para operação analítica;
2. a integração com o shell é lógica, não relacional;
3. isso reduz acoplamento físico, mas exige disciplina forte na camada de serviço e na resolução de tenant e loja.

## Fluxo 7. Operação física de fila por loja

### Objetivo

Operar o atendimento presencial por loja usando identidade e escopo do core.

### Tabelas envolvidas

1. `platform_core.tenant_stores`
2. `platform_core.users`
3. `platform_core.tenant_users`
4. `fila_atendimento.consultants`
5. `fila_atendimento.store_profiles`
6. `fila_atendimento.store_operation_settings`
7. `fila_atendimento.store_setting_options`
8. `fila_atendimento.store_catalog_products`
9. `fila_atendimento.store_campaigns`
10. `fila_atendimento.operation_queue_entries`
11. `fila_atendimento.operation_active_services`
12. `fila_atendimento.operation_paused_consultants`
13. `fila_atendimento.operation_current_status`
14. `fila_atendimento.operation_status_sessions`
15. `fila_atendimento.operation_service_history`

### Sequência prática

1. o shell resolve quem é o usuário, a qual tenant ele pertence, qual papel ele tem e quais lojas pode acessar;
2. a loja canônica vem de `platform_core.tenant_stores`;
3. o módulo carrega o roster operacional da loja em `consultants`;
4. o perfil comercial complementar da loja fica em `store_profiles`;
5. cada loja possui configuração operacional, catálogos e campanhas;
6. a fila corrente vive em `operation_queue_entries`;
7. o atendimento em andamento vive em `operation_active_services`;
8. o estado atual vive em `operation_current_status`;
9. pausas e exceções vivem em `operation_paused_consultants`;
10. o histórico imutável vive em `operation_status_sessions` e `operation_service_history`.

### O que esse fluxo revela

1. `fila_atendimento` já não mantém tenant, loja, usuário ou papel local como fonte de verdade;
2. a convergência com o shell já saiu da fase de bridge estrutural e entrou em operação hospedada real;
3. o que continua local ao módulo é o domínio operacional da fila, não a identidade.

## Fluxo 8. Integração entre shell e módulos

### Conectores existentes

1. grants por módulo no `platform_core`;
2. contexto de sessão do shell entregue ao módulo hospedado;
3. `atendimento_online."AtendimentoTenantConfig".tenantId` como âncora do tenant canônico;
4. `atendimento_online."WhatsAppInstance".tenantId`, `assignedToId`, `createdByUserId` e `responsibleUserId` usando ids do core;
5. `atendimento_online."Message".senderUserId`, `atendimento_online."AuditEvent".actorUserId` e `atendimento_online."HiddenMessageForUser".userId` usando ids do core;
6. `platform_core.tenant_stores` como diretório global de loja para módulos convergidos.

### Limitações atuais

1. o schema `indicators` depende de IDs lógicos e não de FKs cruzadas;
2. `tenant_store_charges` ainda existe no core como camada financeira de compatibilidade, o que mantém uma limpeza final pendente no backend.

## Diagnóstico de banco a partir dos fluxos

### O que está bom

1. identidade, sessão, tenant, loja global e RBAC já têm eixo central claro no shell;
2. atendimento-online já não replica `Tenant` nem `User`;
3. o schema `finance` já está relativamente isolado e coerente;
4. indicators já nasce como módulo com schema próprio e contrato mais limpo;
5. fila-atendimento já deixou de ser shadow estrutural do shell.

### O que ainda está ruim

1. integração por referência lógica em parte de `indicators`;
2. vocabulário de acesso ainda não está 100% unificado entre shell e alguns módulos legados;
3. algumas referências importantes ainda são lógicas, não relacionais;

### O que precisa melhorar primeiro

1. parar de tratar `tenant_store_charges` como entrada operacional quando `tenant_stores` já resolve o diretório canônico;
2. seguir alinhando vocabulário de papéis e níveis de acesso;
3. revisar referências fracas e soft refs críticas.
