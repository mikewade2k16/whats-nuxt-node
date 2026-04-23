\set ON_ERROR_STOP on

BEGIN;

SET client_encoding TO 'UTF8';
SET search_path TO platform_core, public;

CREATE TEMP TABLE tmp_perola_store_seed (
  store_id uuid PRIMARY KEY,
  store_name varchar(120) NOT NULL,
  amount numeric(12,2) NOT NULL,
  sort_order integer NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_perola_store_seed (store_id, store_name, amount, sort_order)
VALUES
  ('33000000-0000-4000-8000-000000000011', 'Garcia', 1200.00, 1),
  ('33000000-0000-4000-8000-000000000012', 'Riomar', 1200.00, 2),
  ('33000000-0000-4000-8000-000000000013', 'Treze', 1200.00, 3),
  ('33000000-0000-4000-8000-000000000014', 'Jardins', 1100.00, 4);

CREATE TEMP TABLE tmp_perola_user_seed (
  user_id uuid PRIMARY KEY,
  full_name varchar(180) NOT NULL,
  email varchar(180) NOT NULL,
  business_role varchar(30) NOT NULL,
  access_level varchar(30) NOT NULL,
  store_name varchar(120),
  registration_number varchar(60),
  job_title varchar(120) NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_perola_user_seed (
  user_id,
  full_name,
  email,
  business_role,
  access_level,
  store_name,
  registration_number,
  job_title
)
VALUES
  ('33000000-0000-4000-8000-000000000101', 'Roseli de Andrade Paixão', 'roseli.a.paixao@gmail.com', 'consultant', 'consultant', 'Garcia', '259', 'Consultora'),
  ('33000000-0000-4000-8000-000000000102', 'Diana Nicory Gomes', 'dianacampos638@gmail.com', 'consultant', 'consultant', 'Garcia', '321', 'Consultora'),
  ('33000000-0000-4000-8000-000000000103', 'Caroline Aragão Silva', 'carolline17silva@gmail.com', 'consultant', 'consultant', 'Garcia', '329', 'Consultora'),
  ('33000000-0000-4000-8000-000000000104', 'Daniella de Morais Oliveira', 'niellaoliveira@hotmail.com', 'consultant', 'consultant', 'Riomar', '183', 'Consultora'),
  ('33000000-0000-4000-8000-000000000105', 'Dayse Paiva', 'daysepaiva.sp@hotmail.com', 'consultant', 'consultant', 'Riomar', '317', 'Consultora'),
  ('33000000-0000-4000-8000-000000000106', 'Iris Rafaela da Silva', 'raffaflamengo01@gmail.com', 'consultant', 'consultant', 'Riomar', '333', 'Consultora'),
  ('33000000-0000-4000-8000-000000000107', 'Rayane Tavares Santos Araujo', 'ray.tsaraujo@gmail.com', 'consultant', 'consultant', 'Riomar', '251', 'Consultora'),
  ('33000000-0000-4000-8000-000000000108', 'Hitana Batista dos Santos', 'hitanabatista1@gmail.com', 'consultant', 'consultant', 'Riomar', '215', 'Consultora'),
  ('33000000-0000-4000-8000-000000000109', 'Lara Dantas Souza', 'nutrilarad@gmail.com', 'consultant', 'consultant', 'Riomar', '289', 'Consultora'),
  ('33000000-0000-4000-8000-000000000110', 'Fábio dos Santos Menezes', 'fabiomenezes80@hotmail.com', 'consultant', 'consultant', 'Treze', '56', 'Consultor'),
  ('33000000-0000-4000-8000-000000000111', 'Daiane Caroline dos Santos', 'daianecaroline340@gmail.com', 'consultant', 'consultant', 'Treze', '281', 'Consultora'),
  ('33000000-0000-4000-8000-000000000112', 'Rita Damaris Melo da Silva', 'ritadamaris1@gmail.com', 'consultant', 'consultant', 'Treze', '312', 'Consultora'),
  ('33000000-0000-4000-8000-000000000113', 'Tauvani Missielly Oliveira', 'tauvaniyassemin@gmail.com', 'consultant', 'consultant', 'Jardins', '268', 'Consultora'),
  ('33000000-0000-4000-8000-000000000114', 'Everland Alves dos Santos', 'everlandalves38@gmail.com', 'consultant', 'consultant', 'Jardins', '36', 'Consultor'),
  ('33000000-0000-4000-8000-000000000115', 'Fabiana Rafaella Viana Santos', 'fabianarafaellaviana2@gmail.com', 'consultant', 'consultant', 'Jardins', '330', 'Consultora'),
  ('33000000-0000-4000-8000-000000000116', 'Aicilene dos Santos', 'alcilenejeronimo1@hotmail.com', 'consultant', 'consultant', 'Jardins', '334', 'Consultora'),
  ('33000000-0000-4000-8000-000000000117', 'Gardenia Lobo do Nascimento', 'gardenia.lobo@hotmail.com', 'consultant', 'consultant', 'Jardins', '318', 'Consultora'),
  ('33000000-0000-4000-8000-000000000118', 'Mirela da Silva Rodrigues', 'mirelamirelasilvarodrigues@gmail.com', 'consultant', 'consultant', 'Jardins', '315', 'Consultora'),
  ('33000000-0000-4000-8000-000000000119', 'Dayanne Barbosa de Souza Matos', 'days.matos@gmail.com', 'general_manager', 'manager', NULL, '301', 'Gerente Geral'),
  ('33000000-0000-4000-8000-000000000120', 'Tony Prado', 'tony.wright@outlook.com', 'marketing', 'marketing', NULL, NULL, 'Gerente de Marketing'),
  ('33000000-0000-4000-8000-000000000121', 'Bárbara Talia dos Santos Morais', 'talia.st10@hotmail.com', 'store_manager', 'manager', 'Treze', '155', 'Gerente de Loja'),
  ('33000000-0000-4000-8000-000000000122', 'Adelane Sousa Oliveira', 'lane.oliveiravcxz@gmail.com', 'store_manager', 'manager', 'Riomar', '206', 'Gerente de Loja'),
  ('33000000-0000-4000-8000-000000000123', 'Maria Betania da Conceição', 'betaniaconceicao681@gmail.com', 'store_manager', 'manager', 'Garcia', '204', 'Gerente de Loja'),
  ('33000000-0000-4000-8000-000000000124', 'Alexsandra Paz Ferreira', 'alexsandrapaz@gmail.com.br', 'store_manager', 'manager', 'Jardins', '227', 'Gerente de Loja');

CREATE TEMP TABLE tmp_perola_tenant (
  tenant_id uuid PRIMARY KEY
) ON COMMIT DROP;

WITH updated AS (
  UPDATE tenants
     SET slug = 'perola-core',
         name = 'Pérola',
         status = 'active',
         timezone = 'America/Maceio',
         locale = 'pt-BR',
         contact_email = 'tony.wright@outlook.com',
         billing_mode = 'per_store',
         billing_day = 5,
         monthly_payment_amount = 4700.00,
         user_count = 24,
         project_count = 4,
         user_nicks = ARRAY['Cliente Pérola'],
         project_segments = ARRAY['varejo', 'fila-atendimento'],
         webhook_enabled = false,
         webhook_key = '',
         require_user_store_link = true,
         require_user_registration = true,
         metadata = COALESCE(tenants.metadata, '{}'::jsonb) || jsonb_build_object(
           'bootstrap', 'scripts_sql_seed_perola_core',
           'seededAt', now(),
           'stores', 4,
           'users', 24
         ),
         deleted_at = NULL,
         updated_at = now()
   WHERE legacy_id = 3
   RETURNING id
), inserted AS (
  INSERT INTO tenants (
    id,
    legacy_id,
    slug,
    name,
    status,
    timezone,
    locale,
    contact_email,
    billing_mode,
    billing_day,
    monthly_payment_amount,
    user_count,
    project_count,
    user_nicks,
    project_segments,
    webhook_enabled,
    webhook_key,
    require_user_store_link,
    require_user_registration,
    metadata
  )
  SELECT
    '0d519ae3-c440-4237-bc46-625285c41d65'::uuid,
    3,
    'perola-core',
    'Pérola',
    'active',
    'America/Maceio',
    'pt-BR',
    'tony.wright@outlook.com',
    'per_store',
    5,
    4700.00,
    24,
    4,
    ARRAY['Cliente Pérola'],
    ARRAY['varejo', 'fila-atendimento'],
    false,
    '',
    true,
    true,
    jsonb_build_object(
      'bootstrap', 'scripts_sql_seed_perola_core',
      'seededAt', now(),
      'stores', 4,
      'users', 24
    )
  WHERE NOT EXISTS (
    SELECT 1
    FROM tenants
    WHERE legacy_id = 3
  )
  RETURNING id
)
INSERT INTO tmp_perola_tenant (tenant_id)
SELECT id
FROM (
  SELECT id FROM updated
  UNION ALL
  SELECT id FROM inserted
  UNION ALL
  SELECT id FROM tenants WHERE legacy_id = 3
) resolved
LIMIT 1;

CREATE TEMP TABLE tmp_perola_orphan_users (
  user_id uuid PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO tmp_perola_orphan_users (user_id)
SELECT DISTINCT tu.user_id
FROM tenant_users tu
JOIN tmp_perola_tenant tenant_ref
  ON tenant_ref.tenant_id = tu.tenant_id
WHERE NOT EXISTS (
  SELECT 1
  FROM tenant_users other
  WHERE other.user_id = tu.user_id
    AND other.tenant_id <> tu.tenant_id
);

DELETE FROM tenant_user_roles tur
USING tenant_users tu, tmp_perola_tenant tenant_ref
WHERE tur.tenant_user_id = tu.id
  AND tu.tenant_id = tenant_ref.tenant_id;

DELETE FROM tenant_user_modules tum
USING tmp_perola_tenant tenant_ref
WHERE tum.tenant_id = tenant_ref.tenant_id;

DELETE FROM tenant_users tu
USING tmp_perola_tenant tenant_ref
WHERE tu.tenant_id = tenant_ref.tenant_id;

DELETE FROM tenant_module_limits tml
USING tmp_perola_tenant tenant_ref
WHERE tml.tenant_id = tenant_ref.tenant_id;

DELETE FROM tenant_modules tm
USING tmp_perola_tenant tenant_ref
WHERE tm.tenant_id = tenant_ref.tenant_id;

DELETE FROM tenant_subscriptions ts
USING tmp_perola_tenant tenant_ref
WHERE ts.tenant_id = tenant_ref.tenant_id;

DELETE FROM tenant_store_charges sc
USING tmp_perola_tenant tenant_ref
WHERE sc.tenant_id = tenant_ref.tenant_id;

DELETE FROM tenant_stores ts
USING tmp_perola_tenant tenant_ref
WHERE ts.tenant_id = tenant_ref.tenant_id;

DELETE FROM users
WHERE id IN (SELECT user_id FROM tmp_perola_orphan_users)
   OR id IN (SELECT user_id FROM tmp_perola_user_seed)
   OR lower(email::text) IN (
     'admin@acme.local',
     'supervisor@acme.local',
     'agente@acme.local',
     'viewer@acme.local'
   );

INSERT INTO tenant_stores (
  id,
  tenant_id,
  code,
  name,
  city,
  is_active,
  sort_order,
  metadata
)
SELECT
  seed.store_id,
  tenant_ref.tenant_id,
  upper(regexp_replace(seed.store_name, '[^[:alnum:]]+', '-', 'g')),
  seed.store_name,
  '',
  true,
  seed.sort_order,
  jsonb_build_object(
    'source', 'scripts_sql_seed_perola_core',
    'clientLegacyId', 3
  )
FROM tmp_perola_store_seed seed
CROSS JOIN tmp_perola_tenant tenant_ref;

INSERT INTO tenant_store_charges (
  tenant_id,
  store_id,
  store_name,
  amount,
  sort_order,
  metadata
)
SELECT
  tenant_ref.tenant_id,
  seed.store_id,
  seed.store_name,
  seed.amount,
  seed.sort_order,
  jsonb_build_object(
    'source', 'scripts_sql_seed_perola_core',
    'clientLegacyId', 3
  )
FROM tmp_perola_store_seed seed
CROSS JOIN tmp_perola_tenant tenant_ref;

INSERT INTO users (
  id,
  name,
  display_name,
  email,
  password_hash,
  status,
  is_platform_admin,
  email_verified_at,
  metadata
)
SELECT
  seed.user_id,
  seed.full_name,
  seed.full_name,
  seed.email,
  crypt('Perola@2026!', gen_salt('bf')),
  'active',
  false,
  now(),
  jsonb_build_object(
    'source', 'scripts_sql_seed_perola_core',
    'clientLegacyId', 3,
    'businessRole', seed.business_role
  )
FROM tmp_perola_user_seed seed;

INSERT INTO tenant_users (
  tenant_id,
  user_id,
  status,
  is_owner,
  job_title,
  joined_at,
  access_level,
  user_type,
  business_role,
  store_id,
  registration_number,
  metadata
)
SELECT
  tenant_ref.tenant_id,
  seed.user_id,
  'active',
  false,
  seed.job_title,
  now(),
  seed.access_level,
  'client',
  seed.business_role,
  store_ref.store_id,
  NULLIF(seed.registration_number, ''),
  jsonb_build_object(
    'source', 'scripts_sql_seed_perola_core',
    'clientLegacyId', 3
  )
FROM tmp_perola_user_seed seed
CROSS JOIN tmp_perola_tenant tenant_ref
LEFT JOIN tmp_perola_store_seed store_ref
  ON store_ref.store_name = seed.store_name;

INSERT INTO tenant_modules (
  tenant_id,
  module_id,
  status,
  source,
  activated_at,
  deactivated_at,
  metadata
)
SELECT
  tenant_ref.tenant_id,
  module_ref.id,
  'active',
  'custom',
  now(),
  NULL,
  jsonb_build_object(
    'source', 'scripts_sql_seed_perola_core',
    'clientLegacyId', 3
  )
FROM tmp_perola_tenant tenant_ref
JOIN modules module_ref
  ON module_ref.code IN ('core_panel', 'fila-atendimento')
ON CONFLICT (tenant_id, module_id) DO UPDATE
SET status = 'active',
    source = 'custom',
    activated_at = now(),
    deactivated_at = NULL,
    metadata = COALESCE(tenant_modules.metadata, '{}'::jsonb) || jsonb_build_object(
      'source', 'scripts_sql_seed_perola_core',
      'clientLegacyId', 3
    ),
    updated_at = now();

INSERT INTO tenant_module_limits (
  tenant_id,
  module_id,
  limit_key,
  limit_value_int,
  is_unlimited,
  source,
  notes,
  created_by_user_id,
  metadata
)
SELECT
  tenant_ref.tenant_id,
  module_ref.id,
  limit_ref.limit_key,
  limit_ref.limit_value_int,
  false,
  'scripts_sql_seed_perola_core',
  limit_ref.notes,
  NULL,
  jsonb_build_object(
    'clientLegacyId', 3
  )
FROM tmp_perola_tenant tenant_ref
JOIN (
  VALUES
    ('core_panel', 'users', 30, 'Limite local de usuarios para homologacao da Pérola'),
    ('fila-atendimento', 'users', 24, 'Limite local de usuarios para a fila da Pérola')
) AS limit_ref(module_code, limit_key, limit_value_int, notes)
  ON true
JOIN modules module_ref
  ON module_ref.code = limit_ref.module_code
ON CONFLICT (tenant_id, module_id, limit_key) DO UPDATE
SET limit_value_int = EXCLUDED.limit_value_int,
    is_unlimited = EXCLUDED.is_unlimited,
    source = EXCLUDED.source,
    notes = EXCLUDED.notes,
    metadata = COALESCE(tenant_module_limits.metadata, '{}'::jsonb) || EXCLUDED.metadata,
    updated_at = now();

INSERT INTO tenant_user_modules (
  tenant_id,
  tenant_user_id,
  module_id,
  status,
  granted_by_user_id,
  granted_at,
  metadata
)
SELECT
  tenant_ref.tenant_id,
  tenant_user_ref.id,
  module_ref.id,
  'active',
  NULL,
  now(),
  jsonb_build_object(
    'source', 'scripts_sql_seed_perola_core',
    'clientLegacyId', 3
  )
FROM tmp_perola_tenant tenant_ref
JOIN tenant_users tenant_user_ref
  ON tenant_user_ref.tenant_id = tenant_ref.tenant_id
JOIN modules module_ref
  ON module_ref.code = 'fila-atendimento'
ON CONFLICT (tenant_user_id, module_id) DO UPDATE
SET status = 'active',
    revoked_at = NULL,
    granted_at = now(),
    metadata = COALESCE(tenant_user_modules.metadata, '{}'::jsonb) || jsonb_build_object(
      'source', 'scripts_sql_seed_perola_core',
      'clientLegacyId', 3
    ),
    updated_at = now();

UPDATE tenants
SET monthly_payment_amount = (
      SELECT COALESCE(SUM(amount), 0)
      FROM tenant_store_charges
      WHERE tenant_id = tenants.id
    ),
    user_count = (
      SELECT COUNT(*)
      FROM tenant_users
      WHERE tenant_id = tenants.id
        AND status IN ('active', 'invited', 'suspended')
    ),
    project_count = (
      SELECT COUNT(*)
      FROM tenant_stores
      WHERE tenant_id = tenants.id
        AND is_active = true
    ),
    updated_at = now()
WHERE id = (SELECT tenant_id FROM tmp_perola_tenant);

COMMIT;
