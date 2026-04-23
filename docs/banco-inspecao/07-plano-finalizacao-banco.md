# Plano de Finalização do Banco

Data de referência: 2026-04-15

## Objetivo

Registrar o estado final auditável do banco depois da passada de fechamento no runtime, separando com clareza:

1. o que já foi consolidado como contrato canônico;
2. o que permanece apenas como compatibilidade de borda;
3. o que ainda pode virar limpeza física futura.

## Estado medido no banco real

Inventário confirmado no runtime local:

1. `platform_core`: 24 tabelas.
2. `finance`: 8 tabelas.
3. `atendimento_online`: 8 tabelas.
4. `indicators`: 20 tabelas.
5. `fila_atendimento`: 13 tabelas.

Total: 73 tabelas de negócio.

Contagem consolidada de FKs físicas:

1. `platform_core`: 43.
2. `finance`: 10.
3. `atendimento_online`: 7.
4. `indicators`: 31.
5. `fila_atendimento`: 20.

Total: 111 FKs físicas.

## Fechamento executivo

O banco local está íntegro e o runtime principal deixou de depender de resolução por inteiro legado.

O que ficou validado nesta passada:

1. não há órfãos medidos em `finance.finance_lines.fixed_account_id`;
2. não há órfãos medidos nas referências lógicas críticas já usadas por `indicators`;
3. `tenant_store_charges` segue preso ao papel de overlay financeiro:
   - `store_id` obrigatório em 100% dos registros locais;
   - FK composta `(tenant_id, store_id)` protegendo aderência ao diretório canônico;
   - `store_name` e `sort_order` mantidos apenas como espelho sincronizado por trigger;
   - cobertura local de `tenant_store_charges -> tenant_stores` em 4 de 4 linhas, sem divergência;
4. `indicators` opera sobre `store_id` UUID nas tabelas críticas e não mantém contrato vivo por `unit_external_id`;
5. `auth`, `finance` e o fluxo canônico de `core/admin/users` passaram a resolver identidade por `coreTenantId` e `coreUserId`, sem lookup ativo por `legacy_id`;
6. `legacy_id` continua preenchido fisicamente em `platform_core.tenants` e `platform_core.users`, mas saiu do caminho ativo do runtime principal;
7. a compatibilidade inteira restante ficou concentrada na borda do shell, especialmente no catálogo root de clientes usado pela simulação de sessão do painel.

Leitura prática:

1. o problema principal deixou de ser runtime legado e passou a ser cleanup residual de borda;
2. o desenho canônico do banco está fechado para lojas, usuários canônicos e escopo financeiro;
3. o restante da trilha é depreciação controlada, não reabertura arquitetural.

## O que já foi fechado

### 1. Diretório canônico de lojas

Estado consolidado:

1. `platform_core.tenant_stores` ficou como único diretório canônico de loja;
2. `tenant_store_charges` não pode mais divergir de tenant, nome ou ordenação da loja canônica;
3. o uso operacional dessa tabela ficou restrito a billing por loja.

Conclusão:

1. a ambiguidade estrutural entre diretório e cobrança foi encerrada no banco local;
2. o que sobra é eventual simplificação futura do shape residual de `tenant_store_charges`.

### 2. Identidade de loja em `indicators`

Estado consolidado:

1. `indicator_profile_store_overrides`, `indicator_target_items`, `indicator_evaluations` e `indicator_metric_snapshots` usam `store_id` UUID;
2. as FKs para `platform_core.tenant_stores(id)` já estão aplicadas;
3. backend, handlers HTTP e BFF do painel usam `storeId` como contrato único.

Conclusão:

1. `unit_external_id` deixou de ser identidade viva do módulo;
2. qualquer regressão para contrato paralelo de loja deve ser tratada como desvio arquitetural.

### 3. Retirada operacional de `legacy_id`

Estado consolidado:

1. o runtime principal não faz mais lookup ativo por `legacy_id`;
2. `auth/me` saiu do acoplamento com o inteiro legado;
3. `finance` passou a responder por `coreTenantId` e recorrências por `sourceCoreTenantId`;
4. `core/admin/users` passou a responder por `coreUserId` e `coreTenantId`, sem `clientId` no DTO canônico;
5. o painel e o BFF já conseguem recompor a compatibilidade que ainda sobrou somente na borda em que ela é necessária.

Conclusão:

1. `legacy_id` virou dado físico transitório, não mais chave viva de resolução do domínio;
2. a remoção física da coluna passou a depender apenas da retirada das últimas bordas compatíveis do shell.

### 4. Exceções conscientes

Pontos que continuam deliberadamente fora da frente principal de remodelagem:

1. `finance.finance_lines.fixed_account_id` como soft reference monitorada;
2. `platform_core.audit_logs.entity_id` como referência polimórfica;
3. ids externos de billing, conexões realtime e identificadores append-only operacionais.

Conclusão:

1. nem todo `*_id` sem FK representa erro de modelagem;
2. o banco final deve manter exceções pequenas, explícitas e auditáveis.

## Compatibilidades que ainda restam

Hoje sobraram apenas compatibilidades de borda, não dependências do runtime principal:

1. `legacy_id` ainda está preenchido fisicamente em `tenants` e `users`;
2. o catálogo root de clientes do shell ainda preserva um inteiro compatível para simulação de sessão, seleção root e filtros antigos do painel;
3. `tenant_store_charges` continua existindo como overlay financeiro enquanto o cleanup final de nomenclatura e shape não é concluído;
4. `finance.finance_lines.fixed_account_id` continua como soft ref intencional.

Regra operacional daqui para frente:

1. nenhuma feature nova pode reintroduzir lookup de domínio por `legacy_id`;
2. nenhuma feature nova pode usar `unit_external_id` como identidade de loja;
3. qualquer compatibilidade inteira remanescente deve ficar restrita ao shell/BFF e nunca voltar para DTO canônico de domínio.

## Ordem recomendada para a última limpeza

1. retirar o inteiro compatível do catálogo root de clientes e da simulação de sessão do shell;
2. remover o resíduo físico de `legacy_id` quando não existir mais consumidor de borda;
3. manter auditoria periódica das soft refs documentadas;
4. avaliar simplificação final de `tenant_store_charges` depois que a borda de billing estiver estabilizada.

## Critério de pronto para considerar o banco finalizado

O banco pode ser considerado estruturalmente fechado quando:

1. `tenant_stores` continuar como único diretório canônico de loja;
2. `tenant_store_charges` permanecer restrito a overlay financeiro, sem semântica de diretório operacional;
3. `indicators` continuar operando apenas por `storeId`;
4. nenhuma API de domínio depender de `legacy_id` ou `clientId` inteiro como chave de resolução;
5. as compatibilidades restantes estiverem confinadas ao shell ou tiverem sido removidas fisicamente;
6. as exceções remanescentes estiverem pequenas, explícitas, auditadas e documentadas.

## Síntese final

O fechamento estrutural do banco ficou concluído no que importa para runtime.

O que resta agora não é mais redesenho de schema nem migração de identidade central. O restante da trilha é:

1. cleanup da borda do shell que ainda preserva inteiro compatível para alguns fluxos administrativos;
2. eventual remoção física de `legacy_id`;
3. manutenção disciplinada das exceções conscientes.

Na prática, o banco deixou de ter dívida operacional por identidade legada. O que sobra é somente depreciação controlada.