package indicators

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	pool *pgxpool.Pool
}

type tenantStoreSnapshot struct {
	ID   string
	Code string
	Name string
}

type activeProfileRow struct {
	RecordID              string
	Name                  string
	Description           string
	Status                string
	ScopeMode             string
	StoreBreakdownEnabled bool
	ProviderSyncEnabled   bool
	TemplateID            string
	TemplateVersionID     string
	TemplateCode          string
	TemplateLabel         string
	Metadata              map[string]any
	UpdatedAt             time.Time
}

type templateSeedIndicator struct {
	TemplateIndicatorID    string
	CategoryCode           string
	CategoryName           string
	Code                   string
	Name                   string
	Description            string
	IndicatorKind          string
	SourceKind             string
	SourceModule           string
	SourceMetricKey        string
	ScopeMode              string
	AggregationMode        string
	ValueType              string
	EvidencePolicy         string
	Weight                 float64
	IsRequired             bool
	SupportsStoreBreakdown bool
	Settings               map[string]any
	Metadata               map[string]any
}

type templateSeedItem struct {
	TemplateIndicatorID string
	Code                string
	Label               string
	Description         string
	InputType           string
	EvidencePolicy      string
	SourceMetricKey     string
	Weight              float64
	IsRequired          bool
	SelectOptions       []map[string]any
	Config              map[string]any
	Metadata            map[string]any
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

func (s *Service) ResolveRealtimeTenant(ctx context.Context, jwtTenantID string, isPlatformAdmin bool, coreTenantID string, clientLegacyID int) (string, error) {
	tenantUUID, _, _, err := s.resolveTenant(ctx, jwtTenantID, isPlatformAdmin, coreTenantID, clientLegacyID)
	if err != nil {
		return "", err
	}
	return tenantUUID, nil
}

func (s *Service) ResolveEvaluationRealtimeTenant(ctx context.Context, evaluationID string) (string, error) {
	evaluationID = normalizeUUID(evaluationID)
	if evaluationID == "" {
		return "", ErrInvalidInput
	}

	var tenantUUID string
	if err := s.pool.QueryRow(ctx, `
		SELECT tenant_id::text
		FROM indicators.indicator_evaluations
		WHERE id = $1::uuid
	`, evaluationID).Scan(&tenantUUID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrNotFound
		}
		return "", err
	}

	return tenantUUID, nil
}

func (s *Service) resolveTenant(ctx context.Context, jwtTenantID string, isPlatformAdmin bool, coreTenantID string, clientLegacyID int) (string, int, string, error) {
	_ = clientLegacyID

	if isPlatformAdmin {
		normalizedCoreTenantID := normalizeUUID(coreTenantID)
		if normalizedCoreTenantID != "" {
			var tenantUUID string
			var legacyID int
			var name string
			err := s.pool.QueryRow(ctx, `
				SELECT id::text, legacy_id, name
				FROM platform_core.tenants
				WHERE id = $1::uuid AND deleted_at IS NULL
				LIMIT 1
			`, normalizedCoreTenantID).Scan(&tenantUUID, &legacyID, &name)
			if err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					return "", 0, "", ErrNotFound
				}
				return "", 0, "", err
			}
			return tenantUUID, legacyID, name, nil
		}
	}

	tenantUUID := normalizeUUID(jwtTenantID)
	if tenantUUID == "" {
		return "", 0, "", ErrInvalidInput
	}

	var legacyID int
	var name string
	err := s.pool.QueryRow(ctx, `
		SELECT legacy_id, name
		FROM platform_core.tenants
		WHERE id = $1::uuid AND deleted_at IS NULL
		LIMIT 1
	`, tenantUUID).Scan(&legacyID, &name)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", 0, "", ErrNotFound
		}
		return "", 0, "", err
	}

	return tenantUUID, legacyID, name, nil
}

func (s *Service) loadTenantStoreSnapshots(ctx context.Context, tenantUUID string) (map[string]tenantStoreSnapshot, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, COALESCE(code, ''), name
		FROM platform_core.tenant_stores
		WHERE tenant_id = $1::uuid
		  AND is_active = true
	`, tenantUUID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	stores := map[string]tenantStoreSnapshot{}
	for rows.Next() {
		var item tenantStoreSnapshot
		if err := rows.Scan(&item.ID, &item.Code, &item.Name); err != nil {
			return nil, err
		}
		stores[item.ID] = item
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}

	return stores, nil
}

func (s *Service) getActiveProfileRow(ctx context.Context, tenantUUID string) (activeProfileRow, error) {
	var row activeProfileRow
	var metadataRaw []byte
	var templateID *string
	var templateVersionID *string
	var templateCode *string
	var templateName *string

	err := s.pool.QueryRow(ctx, `
		SELECT
			p.id::text,
			p.name,
			COALESCE(p.description, ''),
			p.status,
			p.scope_mode,
			p.store_breakdown_enabled,
			p.provider_sync_enabled,
			p.template_id::text,
			p.template_version_id::text,
			t.code,
			t.name,
			p.metadata,
			p.updated_at
		FROM indicators.indicator_profiles p
		LEFT JOIN indicators.indicator_templates t ON t.id = p.template_id
		WHERE p.tenant_id = $1::uuid AND p.status = 'active'
		ORDER BY p.updated_at DESC
		LIMIT 1
	`, tenantUUID).Scan(
		&row.RecordID,
		&row.Name,
		&row.Description,
		&row.Status,
		&row.ScopeMode,
		&row.StoreBreakdownEnabled,
		&row.ProviderSyncEnabled,
		&templateID,
		&templateVersionID,
		&templateCode,
		&templateName,
		&metadataRaw,
		&row.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return activeProfileRow{}, ErrNotFound
		}
		return activeProfileRow{}, err
	}

	row.Metadata = decodeJSONMap(metadataRaw)
	if templateID != nil {
		row.TemplateID = *templateID
	}
	if templateVersionID != nil {
		row.TemplateVersionID = *templateVersionID
	}
	if templateCode != nil {
		row.TemplateCode = *templateCode
	}
	if templateName != nil {
		row.TemplateLabel = *templateName
	}

	return row, nil
}

func (s *Service) ensureActiveProfile(ctx context.Context, tenantUUID string) (activeProfileRow, error) {
	profile, err := s.getActiveProfileRow(ctx, tenantUUID)
	if err == nil {
		return profile, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return activeProfileRow{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return activeProfileRow{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var existingID string
	err = tx.QueryRow(ctx, `
		SELECT id::text
		FROM indicators.indicator_profiles
		WHERE tenant_id = $1::uuid AND status = 'active'
		LIMIT 1
	`, tenantUUID).Scan(&existingID)
	if err == nil {
		if commitErr := tx.Commit(ctx); commitErr != nil {
			return activeProfileRow{}, commitErr
		}
		return s.getActiveProfileRow(ctx, tenantUUID)
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return activeProfileRow{}, err
	}

	var templateID string
	var templateVersionID string
	var templateCode string
	var templateName string
	var defaultScopeMode string
	err = tx.QueryRow(ctx, `
		SELECT
			t.id::text,
			tv.id::text,
			t.code,
			t.name,
			t.default_scope_mode
		FROM indicators.indicator_templates t
		JOIN indicators.indicator_template_versions tv
		  ON tv.template_id = t.id
		WHERE t.code = 'indicators_default'
		  AND tv.status = 'published'
		ORDER BY tv.version_number DESC
		LIMIT 1
	`).Scan(&templateID, &templateVersionID, &templateCode, &templateName, &defaultScopeMode)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return activeProfileRow{}, ErrBootstrapUnavailable
		}
		return activeProfileRow{}, err
	}

	var profileID string
	var updatedAt time.Time
	err = tx.QueryRow(ctx, `
		INSERT INTO indicators.indicator_profiles (
			tenant_id,
			template_id,
			template_version_id,
			code,
			name,
			description,
			status,
			scope_mode,
			store_breakdown_enabled,
			provider_sync_enabled,
			metadata
		)
		VALUES (
			$1::uuid,
			$2::uuid,
			$3::uuid,
			'active-default',
			'Perfil ativo de indicadores',
			'Perfil bootstrapado a partir do template padrao do modulo.',
			'active',
			$4,
			true,
			true,
			$5::jsonb
		)
		RETURNING id::text, updated_at
	`, tenantUUID, templateID, templateVersionID, normalizeScopeMode(defaultScopeMode), mustJSONMap(map[string]any{
		"bootstrap":    "indicators_default",
		"templateCode": templateCode,
	})).Scan(&profileID, &updatedAt)
	if err != nil {
		return activeProfileRow{}, err
	}

	indicatorSeeds, err := loadTemplateSeedIndicators(ctx, tx, templateVersionID)
	if err != nil {
		return activeProfileRow{}, err
	}
	itemSeeds, err := loadTemplateSeedItems(ctx, tx, templateVersionID)
	if err != nil {
		return activeProfileRow{}, err
	}

	profileIndicatorIDs := make(map[string]string, len(indicatorSeeds))
	for _, seed := range indicatorSeeds {
		var profileIndicatorID string
		err := tx.QueryRow(ctx, `
			INSERT INTO indicators.indicator_profile_indicator_overrides (
				profile_id,
				template_indicator_id,
				category_code,
				category_name,
				code,
				name,
				description,
				indicator_kind,
				source_kind,
				source_module,
				source_metric_key,
				scope_mode,
				aggregation_mode,
				value_type,
				evidence_policy,
				weight,
				is_enabled,
				is_required,
				is_custom,
				supports_store_breakdown,
				settings_json,
				metadata
			)
			VALUES (
				$1::uuid,
				$2::uuid,
				$3,
				$4,
				$5,
				$6,
				$7,
				$8,
				$9,
				NULLIF($10, ''),
				NULLIF($11, ''),
				$12,
				$13,
				$14,
				$15,
				$16,
				true,
				$17,
				false,
				$18,
				$19::jsonb,
				$20::jsonb
			)
			RETURNING id::text
		`, profileID, seed.TemplateIndicatorID, seed.CategoryCode, seed.CategoryName, seed.Code, seed.Name,
			seed.Description, seed.IndicatorKind, seed.SourceKind, seed.SourceModule, seed.SourceMetricKey,
			normalizeScopeMode(seed.ScopeMode), normalizeAggregationMode(seed.AggregationMode), normalizeValueType(seed.ValueType),
			normalizeEvidencePolicy(seed.EvidencePolicy), seed.Weight, seed.IsRequired, seed.SupportsStoreBreakdown,
			mustJSONMap(seed.Settings), mustJSONMap(seed.Metadata),
		).Scan(&profileIndicatorID)
		if err != nil {
			return activeProfileRow{}, err
		}
		profileIndicatorIDs[seed.TemplateIndicatorID] = profileIndicatorID
	}

	for _, seed := range itemSeeds {
		profileIndicatorID, ok := profileIndicatorIDs[seed.TemplateIndicatorID]
		if !ok {
			continue
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO indicators.indicator_profile_indicator_items (
				profile_indicator_id,
				template_item_id,
				code,
				label,
				description,
				input_type,
				evidence_policy,
				source_metric_key,
				select_options_json,
				weight,
				is_enabled,
				is_required,
				config_json,
				metadata
			)
			SELECT
				$1::uuid,
				tii.id,
				$2::text,
				$3::text,
				$4::text,
				$5::text,
				$6::text,
				NULLIF($7::text, ''),
				$8::jsonb,
				$9::float8,
				true,
				$10::boolean,
				$11::jsonb,
				$12::jsonb
			FROM indicators.indicator_template_indicator_items tii
			WHERE tii.code = $2::text AND tii.template_indicator_id = $13::uuid
			LIMIT 1
		`, profileIndicatorID, seed.Code, seed.Label, seed.Description,
			normalizeInputType(seed.InputType), normalizeEvidencePolicy(seed.EvidencePolicy), seed.SourceMetricKey,
			mustJSONArray(seed.SelectOptions), seed.Weight, seed.IsRequired,
			mustJSONMap(seed.Config), mustJSONMap(seed.Metadata), seed.TemplateIndicatorID,
		); err != nil {
			return activeProfileRow{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return activeProfileRow{}, err
	}

	return activeProfileRow{
		RecordID:              profileID,
		Name:                  "Perfil ativo de indicadores",
		Description:           "Perfil bootstrapado a partir do template padrao do modulo.",
		Status:                "active",
		ScopeMode:             normalizeScopeMode(defaultScopeMode),
		StoreBreakdownEnabled: true,
		ProviderSyncEnabled:   true,
		TemplateID:            templateID,
		TemplateVersionID:     templateVersionID,
		TemplateCode:          templateCode,
		TemplateLabel:         templateName,
		Metadata: map[string]any{
			"bootstrap":    "indicators_default",
			"templateCode": templateCode,
		},
		UpdatedAt: updatedAt,
	}, nil
}

func loadTemplateSeedIndicators(ctx context.Context, tx pgx.Tx, templateVersionID string) ([]templateSeedIndicator, error) {
	rows, err := tx.Query(ctx, `
		SELECT
			ti.id::text,
			c.code,
			c.name,
			ti.code,
			ti.name,
			COALESCE(ti.description, ''),
			ti.indicator_kind,
			ti.source_kind,
			COALESCE(ti.source_module, ''),
			COALESCE(ti.source_metric_key, ''),
			ti.scope_mode,
			ti.aggregation_mode,
			ti.value_type,
			ti.evidence_policy,
			COALESCE(ti.weight::float8, 0),
			ti.is_required,
			ti.supports_store_breakdown,
			ti.settings_json,
			ti.metadata
		FROM indicators.indicator_template_indicators ti
		JOIN indicators.indicator_template_categories c ON c.id = ti.category_id
		WHERE ti.template_version_id = $1::uuid
		ORDER BY c.sort_order, ti.code
	`, templateVersionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []templateSeedIndicator{}
	for rows.Next() {
		var item templateSeedIndicator
		var settingsRaw []byte
		var metadataRaw []byte
		if err := rows.Scan(
			&item.TemplateIndicatorID,
			&item.CategoryCode,
			&item.CategoryName,
			&item.Code,
			&item.Name,
			&item.Description,
			&item.IndicatorKind,
			&item.SourceKind,
			&item.SourceModule,
			&item.SourceMetricKey,
			&item.ScopeMode,
			&item.AggregationMode,
			&item.ValueType,
			&item.EvidencePolicy,
			&item.Weight,
			&item.IsRequired,
			&item.SupportsStoreBreakdown,
			&settingsRaw,
			&metadataRaw,
		); err != nil {
			return nil, err
		}
		item.Settings = decodeJSONMap(settingsRaw)
		item.Metadata = decodeJSONMap(metadataRaw)
		items = append(items, item)
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}
	return items, nil
}

func loadTemplateSeedItems(ctx context.Context, tx pgx.Tx, templateVersionID string) ([]templateSeedItem, error) {
	rows, err := tx.Query(ctx, `
		SELECT
			tii.template_indicator_id::text,
			tii.code,
			tii.label,
			COALESCE(tii.description, ''),
			tii.input_type,
			tii.evidence_policy,
			COALESCE(tii.source_metric_key, ''),
			COALESCE(tii.weight::float8, 0),
			tii.is_required,
			tii.select_options_json,
			tii.config_json,
			tii.metadata
		FROM indicators.indicator_template_indicator_items tii
		JOIN indicators.indicator_template_indicators ti
		  ON ti.id = tii.template_indicator_id
		WHERE ti.template_version_id = $1::uuid
		ORDER BY ti.code, tii.code
	`, templateVersionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []templateSeedItem{}
	for rows.Next() {
		var item templateSeedItem
		var selectRaw []byte
		var configRaw []byte
		var metadataRaw []byte
		if err := rows.Scan(
			&item.TemplateIndicatorID,
			&item.Code,
			&item.Label,
			&item.Description,
			&item.InputType,
			&item.EvidencePolicy,
			&item.SourceMetricKey,
			&item.Weight,
			&item.IsRequired,
			&selectRaw,
			&configRaw,
			&metadataRaw,
		); err != nil {
			return nil, err
		}
		var selectOptions []map[string]any
		if err := json.Unmarshal(selectRaw, &selectOptions); err != nil {
			selectOptions = []map[string]any{}
		}
		item.SelectOptions = selectOptions
		item.Config = decodeJSONMap(configRaw)
		item.Metadata = decodeJSONMap(metadataRaw)
		items = append(items, item)
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}
	return items, nil
}
