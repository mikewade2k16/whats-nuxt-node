# Inspeção do Banco de Dados

Data de referência: 2026-04-14

## O que existe aqui

Este pacote organiza a análise do banco em quatro frentes:

1. catálogo completo das tabelas por schema, com campos, status de integração e exemplos de dados;
2. fluxos de negócio derivados da estrutura real do banco;
3. diagramas ER simples para leitura executiva e técnica;
4. uma página HTML para navegação rápida entre schemas, tabelas e entregáveis.

## Entregáveis principais

1. Tabelas, campos e exemplos
   - [01-platform-core.md](01-platform-core.md)
   - [02-public-atendimento-online.md](02-public-atendimento-online.md)
   - [03-indicators.md](03-indicators.md)
   - [04-fila-atendimento.md](04-fila-atendimento.md)
   - [finance.html](finance.html)
2. Fluxo de negócio
   - [05-fluxos-de-negocio.md](05-fluxos-de-negocio.md)
3. Diagramas
   - [06-diagramas-er.md](06-diagramas-er.md)
4. Plano de fechamento
   - [07-plano-finalizacao-banco.md](07-plano-finalizacao-banco.md)
5. Navegação visual
   - [index.html](index.html)
   - [plano-finalizacao-banco.html](plano-finalizacao-banco.html)

## Cobertura

Schemas mapeados:

1. `platform_core`
2. `finance`
3. `atendimento_online` da `atendimento-online-api`, hoje atuando como runtime operacional do atendimento-online
4. `indicators`
5. `fila_atendimento` do módulo hospedado

Contagem consolidada de tabelas de negócio atualmente mapeadas:

1. `platform_core`: 24
2. `finance`: 8
3. `atendimento_online`: 8
4. `indicators`: 20
5. `fila_atendimento`: 13

Total: 73 tabelas de negócio.

## Legenda de classificação

1. `Atual`: tabela viva e parte da modelagem principal do domínio.
2. `Integração`: tabela local que ancora contexto vindo do shell, sem replicar fonte de verdade.
3. `Overlay operacional`: estrutura local válida para regra operacional do runtime, mas não autoritativa fora dele.
4. `Técnico-operacional`: tabela de suporte a sessão, trilha, presença ou processamento.
5. `Legado em transição`: estrutura que ainda existe, mas evidencia desenho anterior ou acoplamento que merece revisão.
6. `Removido`: objeto que existiu em migration, mas foi substituído e removido do estado final.

## Leitura rápida do cenário

1. `platform_core` é a fonte canônica de identidade, tenants, lojas globais, RBAC, módulos, planos, cobrança-base e auth.
2. `finance` agora concentra configuração financeira, contas fixas, recorrências, planilhas e ajustes sem morar dentro do shell canônico.
3. `atendimento_online` concentra a operação omnichannel do atendimento e já deixou de ser dono de tenant, usuário, grants autoritativos, elegibilidade de acesso, vocabulário local de acesso persistido e segredo operacional persistido.
4. `indicators` já está organizado como schema próprio, mas depende de referências lógicas a `tenant_id` e `user_id`, sem FKs cruzadas para o shell.
5. `fila_atendimento` já convergiu identidade, tenant e loja para o core; no schema local ficaram roster operacional, configuração da unidade, estado corrente e histórico.
6. o runtime principal já saiu do lookup por `legacy_id`; a compatibilidade inteira remanescente ficou concentrada na borda do shell e não no contrato canônico de domínio.

## Principais pontos ruins ou mal integrados

1. `finance.finance_lines.fixed_account_id` continua como soft reference sem FK, o que reduz proteção de integridade;
2. `indicators` depende de referências lógicas, não de integridade relacional cruzada;
3. o catálogo root de clientes do shell ainda preserva um inteiro compatível para simulação de sessão e alguns filtros administrativos do painel;
4. `legacy_id` continua preenchido fisicamente no banco, mas deixou de ser dependência viva do runtime principal.

## Leitura do banco real em 2026-04-14

Validação executada no runtime local:

1. não há órfãos medidos em `finance.finance_lines.fixed_account_id`;
2. não há órfãos medidos nas referências críticas de `tenant_id` e `user_id` em `indicators`;
3. `tenant_store_charges` está integralmente espelhado em `tenant_stores` na base local atual, segue travado por `store_id` obrigatório e o fluxo central do core deixou de alimentar campos operacionais fora do billing por loja;
4. a migration `0033_indicators_store_id.sql` foi aplicada no local, substituiu `unit_external_id` por `store_id` UUID nas tabelas críticas de `indicators` e o runtime do módulo foi ajustado para esse contrato;
5. `legacy_id` continua preenchido em `tenants` e `users`, mas saiu do caminho ativo do runtime principal; o resíduo compatível ficou concentrado na borda do shell.

Leitura executiva:

1. o banco está íntegro no recorte auditado;
2. o desenho canônico já está fechado para lojas, indicadores e identidade principal;
3. o que falta agora é limpeza controlada de compatibilidade de borda, não correção de corrupção evidente.

## Ordem recomendada de leitura

1. Abrir [index.html](index.html) para visão geral navegável.
2. Ler os catálogos por schema para entender tabelas, campos e exemplos.
3. Ler [05-fluxos-de-negocio.md](05-fluxos-de-negocio.md) para entender o banco como processo.
4. Ler [06-diagramas-er.md](06-diagramas-er.md) para leitura relacional executiva.

## Observação metodológica

Esta análise foi produzida a partir das migrations, do `schema.prisma`, dos seeds e da documentação canônica versionada no repositório. Ela é suficiente para mapeamento estrutural e revisão de integração, mas não substitui uma inspeção de dados reais em ambiente quando o objetivo for auditoria de conteúdo produtivo.
