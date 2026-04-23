# Diagramas ER Simplificados do Banco Atual

## 1. Visão geral dos schemas ativos

```mermaid
flowchart LR
    CORE[platform_core\nShell canônico]
    FIN[finance\nMódulo financeiro]
    OMNI[atendimento_online\nRuntime operacional do atendimento-online]
    IND[indicators\nIndicadores]
    FILA[fila_atendimento\nFila física de loja]

    CORE -->|tenants, users, tenant_users, tenant_stores, RBAC, módulos| CORE
    CORE -->|tenant canônico e contexto financeiro| FIN
    CORE -->|grants de módulo e contexto| OMNI
    CORE -->|grants de módulo e contexto| IND
    CORE -->|sessão hospedada, grants e lojas globais| FILA
    FIN -->|config, planilhas, linhas e ajustes| FIN
    OMNI -->|config local, instâncias, conversas e mensagens| OMNI
    IND -->|templates, metas, avaliações| IND
    FILA -->|roster, operação, histórico e perfil da loja| FILA
```

## 2. ER simplificado do `platform_core`

```mermaid
erDiagram
    TENANTS ||--o{ TENANT_STORES : organiza
    TENANTS ||--o{ TENANT_USERS : vincula
    USERS ||--o{ TENANT_USERS : participa
    TENANT_STORES ||--o{ TENANT_USERS : lota
    TENANTS ||--o{ TENANT_SUBSCRIPTIONS : assina
    PLANS ||--o{ TENANT_SUBSCRIPTIONS : rege
    PLANS ||--o{ PLAN_MODULES : inclui
    MODULES ||--o{ PLAN_MODULES : compoe
    TENANTS ||--o{ TENANT_MODULES : ativa
    MODULES ||--o{ TENANT_MODULES : habilita
    TENANTS ||--o{ TENANT_MODULE_LIMITS : sobrescreve
    MODULES ||--o{ TENANT_MODULE_LIMITS : limita
    TENANT_USERS ||--o{ TENANT_USER_MODULES : libera
    MODULES ||--o{ TENANT_USER_MODULES : segmenta
    TENANT_USERS ||--o{ TENANT_USER_ROLES : recebe
    ROLES ||--o{ TENANT_USER_ROLES : atribui
    ROLES ||--o{ ROLE_PERMISSIONS : agrupa
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : compoe
    USERS ||--o{ USER_SESSIONS : autentica
    USERS ||--o{ AUTH_PASSWORD_RESETS : reseta
    TENANTS ||--o{ TENANT_STORE_CHARGES : cobra
```

## 3. ER simplificado do `finance`

```mermaid
erDiagram
    CORE_TENANTS ||--o{ FINANCE_CONFIGS : ancora
    FINANCE_CONFIGS ||--o{ FINANCE_CATEGORIES : classifica
    FINANCE_CONFIGS ||--o{ FINANCE_FIXED_ACCOUNTS : estrutura
    FINANCE_FIXED_ACCOUNTS ||--o{ FINANCE_FIXED_ACCOUNT_MEMBERS : detalha
    FINANCE_CONFIGS ||--o{ FINANCE_RECURRING_ENTRIES : agenda
    CORE_TENANTS ||--o{ FINANCE_RECURRING_ENTRIES : origina
    CORE_TENANTS ||--o{ FINANCE_SHEETS : fecha
    FINANCE_SHEETS ||--o{ FINANCE_LINES : lanca
    FINANCE_LINES ||--o{ FINANCE_LINE_ADJUSTMENTS : ajusta
```

Leitura: o módulo financeiro saiu do `platform_core`, mas continua usando `platform_core.tenants` como âncora compartilhada. O ownership dos dados financeiros agora é do schema `finance`.

## 4. ER simplificado do runtime operacional hoje hospedado em `atendimento_online`

```mermaid
erDiagram
    CORE_TENANTS ||--o{ ATENDIMENTOTENANTCONFIG : ancora
    CORE_TENANTS ||--o{ WHATSAPPINSTANCE : escopa
    CORE_USERS ||--o{ WHATSAPPINSTANCE : cria_ou_responde
    CORE_TENANTS ||--o{ CONTACT : contextualiza
    CORE_TENANTS ||--o{ CONVERSATION : contextualiza
    WHATSAPPINSTANCE ||--o{ CONVERSATION : canaliza
    CONTACT ||--o{ CONVERSATION : origina
    CORE_USERS ||--o{ CONVERSATION : assume
    CONVERSATION ||--o{ MESSAGE : acumula
    CORE_USERS ||--o{ MESSAGE : envia
    CONVERSATION ||--o{ AUDITEVENT : historiza
    MESSAGE ||--o{ AUDITEVENT : dispara
    CORE_USERS ||--o{ AUDITEVENT : atua
    CORE_USERS ||--o{ SAVEDSTICKER : cria
    CORE_USERS ||--o{ HIDDENMESSAGEFORUSER : oculta
    MESSAGE ||--o{ HIDDENMESSAGEFORUSER : alvo
```

Leitura: `atendimento_online` já não possui `Tenant` nem `User` físicos. As colunas de tenant e usuário armazenam ids canônicos do core, e as FKs locais restantes conectam apenas o domínio operacional interno.

## 5. ER simplificado do `indicators`

```mermaid
erDiagram
    INDICATOR_TEMPLATES ||--o{ INDICATOR_TEMPLATE_VERSIONS : versiona
    INDICATOR_TEMPLATE_VERSIONS ||--o{ INDICATOR_TEMPLATE_CATEGORIES : organiza
    INDICATOR_TEMPLATE_CATEGORIES ||--o{ INDICATOR_TEMPLATE_INDICATORS : agrupa
    INDICATOR_TEMPLATE_INDICATORS ||--o{ INDICATOR_TEMPLATE_INDICATOR_ITEMS : detalha
    INDICATOR_PROFILES ||--o{ INDICATOR_PROFILE_INDICATOR_OVERRIDES : customiza
    INDICATOR_PROFILE_INDICATOR_OVERRIDES ||--o{ INDICATOR_PROFILE_INDICATOR_ITEMS : desdobra
    INDICATOR_PROFILES ||--o{ INDICATOR_PROFILE_STORE_OVERRIDES : particulariza
    INDICATOR_PROFILES ||--o{ INDICATOR_TARGET_SETS : define
    INDICATOR_TARGET_SETS ||--o{ INDICATOR_TARGET_ITEMS : mede
    INDICATOR_PROFILES ||--o{ INDICATOR_EVALUATIONS : avalia
    INDICATOR_EVALUATIONS ||--o{ INDICATOR_EVALUATION_CATEGORIES : subtotaliza
    INDICATOR_EVALUATION_CATEGORIES ||--o{ INDICATOR_EVALUATION_INDICATORS : apura
    INDICATOR_EVALUATION_INDICATORS ||--o{ INDICATOR_EVALUATION_ITEMS : pontua
    INDICATOR_EVALUATIONS ||--o{ INDICATOR_METRIC_SNAPSHOTS : captura
    INDICATOR_EVALUATIONS ||--o{ INDICATOR_ASSETS : evidencia
```

## 6. ER simplificado do `fila_atendimento`

```mermaid
erDiagram
    CORE_TENANTS ||--o{ CONSULTANTS : escopa
    CORE_USERS ||--o| CONSULTANTS : vincula
    CORE_TENANT_STORES ||--|| STORE_PROFILES : complementa
    CORE_TENANT_STORES ||--|| STORE_OPERATION_SETTINGS : configura
    CORE_TENANT_STORES ||--o{ STORE_SETTING_OPTIONS : parametriza
    CORE_TENANT_STORES ||--o{ STORE_CATALOG_PRODUCTS : cataloga
    CORE_TENANT_STORES ||--o{ STORE_CAMPAIGNS : incentiva
    CORE_TENANT_STORES ||--o{ CONSULTANTS : aloja
    CORE_TENANT_STORES ||--o{ OPERATION_QUEUE_ENTRIES : fila
    CONSULTANTS ||--o{ OPERATION_QUEUE_ENTRIES : entra
    CORE_TENANT_STORES ||--o{ OPERATION_ACTIVE_SERVICES : atende
    CONSULTANTS ||--o{ OPERATION_ACTIVE_SERVICES : atende
    CORE_TENANT_STORES ||--o{ OPERATION_PAUSED_CONSULTANTS : pausa
    CONSULTANTS ||--o{ OPERATION_PAUSED_CONSULTANTS : pausa
    CORE_TENANT_STORES ||--o{ OPERATION_CURRENT_STATUS : resume
    CONSULTANTS ||--o{ OPERATION_CURRENT_STATUS : resume
    CORE_TENANT_STORES ||--o{ OPERATION_STATUS_SESSIONS : historiza
    CONSULTANTS ||--o{ OPERATION_STATUS_SESSIONS : historiza
    CORE_TENANT_STORES ||--o{ OPERATION_SERVICE_HISTORY : fecha
    CONSULTANTS ||--o{ OPERATION_SERVICE_HISTORY : fecha
```

## 7. Diagrama dos principais pontos de integração

```mermaid
flowchart TD
    A[platform_core.users\nIdentidade canônica]
    B[platform_core.tenant_users\nVínculo de acesso]
    C[platform_core.tenants\nTenant canônico]
    D[platform_core.tenant_stores\nLoja global]
    E[finance.finance_configs\nConfig do financeiro]
    F[finance.finance_sheets\nFechamento por período]
    G[finance.finance_lines\nLançamentos e soft refs]
    H[atendimento_online.AtendimentoTenantConfig\nConfig operacional do atendimento]
    I[atendimento_online.WhatsAppInstance\nCanal operacional]
    J[atendimento_online.Message/Audit/Prefs\nDomínio operacional puro]
    K[fila_atendimento.consultants\nRoster operacional]
    L[fila_atendimento.store_profiles\nPerfil local da loja]
    M[operation_* \nEstado e histórico da fila]
    N[tenant_store_charges\nOverlay financeiro por loja]

    C --> E
    C --> F
    F --> G
    A --> B
    B --> H
    B --> I
    A --> I
    A --> J
    D --> L
    D --> K
    K --> M
    D --> M
    N -. legado paralelo .-> D

    X[Ponto atual do financeiro\nschema próprio + tenant compartilhado + soft ref em linhas]
    Y[Ponto atual do atendimento-online\nschema convergido + acesso vindo do core + segredo fora do banco]
    Z[Ponto de atenção\ncleanup operacional pendente em tenant_store_charges]
    W[Estado convergido\nfila-atendimento usando shell + tenant_stores]

    E --> X
    F --> X
    G --> X
    H --> Y
    I --> Y
    J --> Y
    N --> Z
    L --> W
    M --> W
```

## 8. Como usar estes diagramas

1. use o diagrama geral para explicar a arquitetura atual do banco em reunião;
2. use o ER do schema específico para revisar ownership de dados e fronteiras do módulo;
3. use o diagrama de integração para discutir o que já convergiu e onde ainda há soft refs ou contratos lógicos entre módulos.
