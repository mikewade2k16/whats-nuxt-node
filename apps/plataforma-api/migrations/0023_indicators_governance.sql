CREATE SCHEMA IF NOT EXISTS indicators;
SET search_path TO indicators, platform_core, public;

CREATE TABLE IF NOT EXISTS indicator_governance_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(80) NOT NULL UNIQUE,
  title varchar(160) NOT NULL,
  description text NOT NULL DEFAULT '',
  state varchar(20) NOT NULL DEFAULT 'recommended',
  value varchar(160) NOT NULL DEFAULT '',
  affected_area varchar(160) NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (state IN ('system', 'recommended', 'custom'))
);

CREATE INDEX IF NOT EXISTS idx_indicator_governance_policies_state
  ON indicator_governance_policies(state, updated_at DESC);

CREATE TABLE IF NOT EXISTS indicator_governance_roadmap_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(80) NOT NULL UNIQUE,
  title varchar(160) NOT NULL,
  description text NOT NULL DEFAULT '',
  stage varchar(20) NOT NULL DEFAULT 'later',
  owner_name varchar(120) NOT NULL DEFAULT '',
  dependencies jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (stage IN ('now', 'next', 'later')),
  CHECK (jsonb_typeof(dependencies) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_indicator_governance_roadmap_stage
  ON indicator_governance_roadmap_items(is_active, sort_order, stage);

INSERT INTO indicator_governance_policies (code, title, description, state, value, affected_area, metadata)
VALUES
  (
    'scope-default',
    'Escopo default do onboarding',
    'Comeca client_global e abre por loja so quando o cliente pede ranking ou alvo local.',
    'recommended',
    'client_global',
    'Perfil base',
    '{}'::jsonb
  ),
  (
    'evidence-branding',
    'Evidencia visual em branding',
    'Todo item visual de branding nasce como foto obrigatoria para reduzir ambiguidade.',
    'system',
    'required',
    'Template / itens',
    '{}'::jsonb
  ),
  (
    'provider-fallback',
    'Fallback de provider em atraso',
    'Provider com atraso acima de 45 minutos volta para snapshot anterior e marca badge de atencao.',
    'recommended',
    'snapshot-previous',
    'Runtime / dashboard',
    '{}'::jsonb
  ),
  (
    'store-override-limit',
    'Limite de overrides por loja',
    'Evita divergencia excessiva entre cliente e lojas durante o rollout do modulo.',
    'custom',
    'max-3-overrides',
    'Governanca / rollout',
    '{}'::jsonb
  )
ON CONFLICT (code) DO NOTHING;

INSERT INTO indicator_governance_roadmap_items (code, title, description, stage, owner_name, dependencies, sort_order, is_active, metadata)
VALUES
  (
    'roadmap-config-ui',
    'Fechar UX de configuracao',
    'Travar o fluxo de editar peso, campo e evidencia antes de subir DTOs no Go.',
    'now',
    'Front / produto',
    '["Mock navegavel", "Validacao com cliente atual"]'::jsonb,
    10,
    true,
    '{}'::jsonb
  ),
  (
    'roadmap-provider-contracts',
    'Assinar contratos de provider',
    'Congelar shape de snapshots para fila, atendimento-online e sales.',
    'next',
    'Core / modulos',
    '["AGENTS do modulo", "DTO de score unificado"]'::jsonb,
    20,
    true,
    '{}'::jsonb
  ),
  (
    'roadmap-history',
    'Historico e auditoria final',
    'Persistir snapshots imutaveis e trilha de alteracoes de template, perfil e override.',
    'later',
    'Backend / auditoria',
    '["Schema foundation", "Handlers do Go"]'::jsonb,
    30,
    true,
    '{}'::jsonb
  )
ON CONFLICT (code) DO NOTHING;