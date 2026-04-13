package indicators

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

func (s *Service) ListTemplates(ctx context.Context, input ListTemplatesInput) ([]TemplateListItem, int, error) {
	input.Page, input.Limit = normalizePageAndLimit(input.Page, input.Limit)

	args := make([]any, 0, 8)
	arg := func(value any) string {
		args = append(args, value)
		return fmt.Sprintf("$%d", len(args))
	}

	conditions := []string{"1=1"}
	if !input.IsPlatformAdmin {
		conditions = append(conditions, "t.status = 'active'")
	}
	if query := strings.TrimSpace(input.Query); query != "" {
		like := "%" + query + "%"
		conditions = append(conditions, fmt.Sprintf("(t.code ILIKE %s OR t.name ILIKE %s)", arg(like), arg(like)))
	}
	if status := strings.TrimSpace(input.Status); status != "" {
		conditions = append(conditions, fmt.Sprintf("t.status = %s", arg(normalizeTemplateStatus(status))))
	}

	whereClause := strings.Join(conditions, " AND ")

	var total int
	countSQL := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM indicators.indicator_templates t
		WHERE %s
	`, whereClause)
	if err := s.pool.QueryRow(ctx, countSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	offset := (input.Page - 1) * input.Limit
	listSQL := fmt.Sprintf(`
		SELECT
			t.id::text,
			t.code,
			t.name,
			COALESCE(t.description, ''),
			t.status,
			t.taxonomy_version,
			t.is_system,
			t.default_scope_mode,
			t.metadata,
			t.updated_at,
			COALESCE(v.category_count, 0),
			COALESCE(v.indicator_count, 0),
			COALESCE(p.client_count, 0)
		FROM indicators.indicator_templates t
		LEFT JOIN LATERAL (
			SELECT
				COUNT(DISTINCT c.id) AS category_count,
				COUNT(DISTINCT i.id) AS indicator_count
			FROM indicators.indicator_template_versions tv
			LEFT JOIN indicators.indicator_template_categories c ON c.template_version_id = tv.id
			LEFT JOIN indicators.indicator_template_indicators i ON i.template_version_id = tv.id
			WHERE tv.id = (
				SELECT id
				FROM indicators.indicator_template_versions latest
				WHERE latest.template_id = t.id
				ORDER BY latest.version_number DESC
				LIMIT 1
			)
		) v ON true
		LEFT JOIN LATERAL (
			SELECT COUNT(*) AS client_count
			FROM indicators.indicator_profiles p
			WHERE p.template_id = t.id
		) p ON true
		WHERE %s
		ORDER BY t.updated_at DESC, t.name
		LIMIT %s OFFSET %s
	`, whereClause, arg(input.Limit), arg(offset))

	rows, err := s.pool.Query(ctx, listSQL, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	items := []TemplateListItem{}
	for rows.Next() {
		var item TemplateListItem
		var metadataRaw []byte
		if err := rows.Scan(
			&item.RecordID,
			&item.Code,
			&item.Name,
			&item.Description,
			&item.Status,
			&item.TaxonomyVersion,
			&item.IsSystem,
			&item.DefaultScopeMode,
			&metadataRaw,
			&item.UpdatedAt,
			&item.CategoryCount,
			&item.IndicatorCount,
			&item.ClientCount,
		); err != nil {
			return nil, 0, err
		}
		item.Metadata = decodeJSONMap(metadataRaw)
		versions, err := s.loadTemplateVersions(ctx, item.RecordID)
		if err != nil {
			return nil, 0, err
		}
		item.Versions = versions
		items = append(items, item)
	}
	if rows.Err() != nil {
		return nil, 0, rows.Err()
	}

	return items, total, nil
}

func (s *Service) GetTemplate(ctx context.Context, input GetTemplateInput) (*TemplateDetail, error) {
	templateID := normalizeUUID(input.TemplateID)
	if templateID == "" {
		return nil, ErrInvalidInput
	}

	var item TemplateListItem
	var metadataRaw []byte
	err := s.pool.QueryRow(ctx, `
		SELECT id::text, code, name, COALESCE(description, ''), status, taxonomy_version, is_system, default_scope_mode, metadata, updated_at
		FROM indicators.indicator_templates
		WHERE id = $1::uuid
	`, templateID).Scan(
		&item.RecordID,
		&item.Code,
		&item.Name,
		&item.Description,
		&item.Status,
		&item.TaxonomyVersion,
		&item.IsSystem,
		&item.DefaultScopeMode,
		&metadataRaw,
		&item.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if !input.IsPlatformAdmin && item.Status != "active" {
		return nil, ErrForbidden
	}
	item.Metadata = decodeJSONMap(metadataRaw)

	versions, err := s.loadTemplateVersions(ctx, templateID)
	if err != nil {
		return nil, err
	}
	item.Versions = versions

	workingVersion, err := s.resolveTemplateWorkingVersion(ctx, templateID, input.IsPlatformAdmin)
	if err != nil {
		return nil, err
	}
	categories, err := s.loadTemplateCategories(ctx, workingVersion.RecordID)
	if err != nil {
		return nil, err
	}

	return &TemplateDetail{
		TemplateListItem: item,
		WorkingVersion:   workingVersion,
		Categories:       categories,
	}, nil
}

func (s *Service) CreateTemplate(ctx context.Context, input TemplateMutationInput) (*TemplateDetail, error) {
	if !input.IsPlatformAdmin {
		return nil, ErrForbidden
	}
	if normalizeText(input.Code, 80) == "" || normalizeText(input.Name, 160) == "" {
		return nil, ErrInvalidInput
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var templateID string
	err = tx.QueryRow(ctx, `
		INSERT INTO indicators.indicator_templates (
			code,
			name,
			description,
			status,
			taxonomy_version,
			is_system,
			default_scope_mode,
			metadata
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
		RETURNING id::text
	`,
		normalizeText(input.Code, 80),
		normalizeText(input.Name, 160),
		normalizeText(input.Description, 4000),
		normalizeTemplateStatus(input.Status),
		maxInt(input.TaxonomyVersion, 1),
		input.IsSystem,
		normalizeScopeMode(input.DefaultScopeMode),
		mustJSONMap(input.Metadata),
	).Scan(&templateID)
	if err != nil {
		return nil, err
	}

	versionID, err := s.createTemplateDraftVersion(ctx, tx, templateID, 1, normalizeText(input.Notes, 2000))
	if err != nil {
		return nil, err
	}
	if err := replaceTemplateVersionContent(ctx, tx, versionID, input.Categories); err != nil {
		return nil, err
	}
	if input.Publish {
		if err := publishTemplateVersion(ctx, tx, templateID, versionID); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return s.GetTemplate(ctx, GetTemplateInput{TemplateID: templateID, IsPlatformAdmin: true})
}

func (s *Service) UpdateTemplate(ctx context.Context, input TemplateMutationInput) (*TemplateDetail, error) {
	if !input.IsPlatformAdmin {
		return nil, ErrForbidden
	}
	templateID := normalizeUUID(input.TemplateID)
	if templateID == "" {
		return nil, ErrInvalidInput
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	commandTag, err := tx.Exec(ctx, `
		UPDATE indicators.indicator_templates
		SET
			code = COALESCE(NULLIF($2, ''), code),
			name = COALESCE(NULLIF($3, ''), name),
			description = $4,
			status = $5,
			taxonomy_version = $6,
			is_system = $7,
			default_scope_mode = $8,
			metadata = $9::jsonb,
			updated_at = now()
		WHERE id = $1::uuid
	`,
		templateID,
		normalizeText(input.Code, 80),
		normalizeText(input.Name, 160),
		normalizeText(input.Description, 4000),
		normalizeTemplateStatus(input.Status),
		maxInt(input.TaxonomyVersion, 1),
		input.IsSystem,
		normalizeScopeMode(input.DefaultScopeMode),
		mustJSONMap(input.Metadata),
	)
	if err != nil {
		return nil, err
	}
	if commandTag.RowsAffected() == 0 {
		return nil, ErrNotFound
	}

	versionID, err := s.ensureDraftTemplateVersion(ctx, tx, templateID, normalizeText(input.Notes, 2000))
	if err != nil {
		return nil, err
	}
	if err := replaceTemplateVersionContent(ctx, tx, versionID, input.Categories); err != nil {
		return nil, err
	}
	if input.Publish {
		if err := publishTemplateVersion(ctx, tx, templateID, versionID); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return s.GetTemplate(ctx, GetTemplateInput{TemplateID: templateID, IsPlatformAdmin: true})
}

func (s *Service) loadTemplateVersions(ctx context.Context, templateID string) ([]TemplateVersionSummary, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, version_number, status, published_at, COALESCE(notes, ''), updated_at
		FROM indicators.indicator_template_versions
		WHERE template_id = $1::uuid
		ORDER BY version_number DESC
	`, templateID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	versions := []TemplateVersionSummary{}
	for rows.Next() {
		var item TemplateVersionSummary
		if err := rows.Scan(&item.RecordID, &item.VersionNumber, &item.Status, &item.PublishedAt, &item.Notes, &item.UpdatedAt); err != nil {
			return nil, err
		}
		versions = append(versions, item)
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}
	return versions, nil
}

func (s *Service) resolveTemplateWorkingVersion(ctx context.Context, templateID string, allowDraft bool) (TemplateVersionSummary, error) {
	query := `
		SELECT id::text, version_number, status, published_at, COALESCE(notes, ''), updated_at
		FROM indicators.indicator_template_versions
		WHERE template_id = $1::uuid
	`
	if !allowDraft {
		query += ` AND status = 'published' `
	}
	query += `
		ORDER BY
			CASE WHEN status = 'draft' THEN 0 WHEN status = 'published' THEN 1 ELSE 2 END,
			version_number DESC
		LIMIT 1
	`

	var version TemplateVersionSummary
	if err := s.pool.QueryRow(ctx, query, templateID).Scan(
		&version.RecordID,
		&version.VersionNumber,
		&version.Status,
		&version.PublishedAt,
		&version.Notes,
		&version.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return TemplateVersionSummary{}, ErrNotFound
		}
		return TemplateVersionSummary{}, err
	}
	return version, nil
}

func (s *Service) loadTemplateCategories(ctx context.Context, versionID string) ([]TemplateCategoryConfig, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, code, name, COALESCE(description, ''), sort_order, COALESCE(weight::float8, 0), scope_mode, metadata
		FROM indicators.indicator_template_categories
		WHERE template_version_id = $1::uuid
		ORDER BY sort_order, code
	`, versionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	categories := []TemplateCategoryConfig{}
	byID := map[string]*TemplateCategoryConfig{}
	for rows.Next() {
		var item TemplateCategoryConfig
		var metadataRaw []byte
		if err := rows.Scan(&item.RecordID, &item.Code, &item.Name, &item.Description, &item.SortOrder, &item.Weight, &item.ScopeMode, &metadataRaw); err != nil {
			return nil, err
		}
		item.Metadata = decodeJSONMap(metadataRaw)
		item.Indicators = []TemplateIndicatorConfig{}
		categories = append(categories, item)
		byID[item.RecordID] = &categories[len(categories)-1]
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}

	indicatorRows, err := s.pool.Query(ctx, `
		SELECT id::text, category_id::text, code, name, COALESCE(description, ''), indicator_kind, source_kind, COALESCE(source_module, ''), COALESCE(source_metric_key, ''), scope_mode, aggregation_mode, value_type, evidence_policy, COALESCE(weight::float8, 0), is_required, supports_store_breakdown, settings_json, metadata
		FROM indicators.indicator_template_indicators
		WHERE template_version_id = $1::uuid
		ORDER BY code
	`, versionID)
	if err != nil {
		return nil, err
	}
	defer indicatorRows.Close()

	indicatorByID := map[string]*TemplateIndicatorConfig{}
	for indicatorRows.Next() {
		var categoryID string
		var item TemplateIndicatorConfig
		var settingsRaw []byte
		var metadataRaw []byte
		if err := indicatorRows.Scan(&item.RecordID, &categoryID, &item.Code, &item.Name, &item.Description, &item.IndicatorKind, &item.SourceKind, &item.SourceModule, &item.SourceMetricKey, &item.ScopeMode, &item.AggregationMode, &item.ValueType, &item.EvidencePolicy, &item.Weight, &item.Required, &item.SupportsStoreBreakdown, &settingsRaw, &metadataRaw); err != nil {
			return nil, err
		}
		item.Settings = decodeJSONMap(settingsRaw)
		item.Metadata = decodeJSONMap(metadataRaw)
		item.ID = indicatorBusinessID(item.Code, item.Metadata)
		item.Items = []TemplateItemConfig{}
		category := byID[categoryID]
		if category == nil {
			continue
		}
		category.Indicators = append(category.Indicators, item)
		indicatorByID[item.RecordID] = &category.Indicators[len(category.Indicators)-1]
	}
	if indicatorRows.Err() != nil {
		return nil, indicatorRows.Err()
	}

	itemRows, err := s.pool.Query(ctx, `
		SELECT template_indicator_id::text, id::text, code, label, COALESCE(description, ''), input_type, evidence_policy, COALESCE(source_metric_key, ''), COALESCE(weight::float8, 0), is_required, select_options_json, config_json, metadata
		FROM indicators.indicator_template_indicator_items
		WHERE template_indicator_id IN (
			SELECT id FROM indicators.indicator_template_indicators WHERE template_version_id = $1::uuid
		)
		ORDER BY code
	`, versionID)
	if err != nil {
		return nil, err
	}
	defer itemRows.Close()

	for itemRows.Next() {
		var indicatorID string
		var item TemplateItemConfig
		var selectRaw []byte
		var configRaw []byte
		var metadataRaw []byte
		if err := itemRows.Scan(&indicatorID, &item.RecordID, &item.ID, &item.Label, &item.Description, &item.InputType, &item.EvidencePolicy, &item.SourceMetricKey, &item.Weight, &item.Required, &selectRaw, &configRaw, &metadataRaw); err != nil {
			return nil, err
		}
		var selectOptions []map[string]any
		if err := json.Unmarshal(selectRaw, &selectOptions); err != nil {
			selectOptions = []map[string]any{}
		}
		item.SelectOptions = selectOptions
		item.Config = decodeJSONMap(configRaw)
		item.Metadata = decodeJSONMap(metadataRaw)
		if indicator := indicatorByID[indicatorID]; indicator != nil {
			indicator.Items = append(indicator.Items, item)
		}
	}
	if itemRows.Err() != nil {
		return nil, itemRows.Err()
	}

	return categories, nil
}

func (s *Service) createTemplateDraftVersion(ctx context.Context, tx pgx.Tx, templateID string, versionNumber int, notes string) (string, error) {
	var versionID string
	err := tx.QueryRow(ctx, `
		INSERT INTO indicators.indicator_template_versions (template_id, version_number, status, notes)
		VALUES ($1::uuid, $2, 'draft', $3)
		RETURNING id::text
	`, templateID, versionNumber, notes).Scan(&versionID)
	return versionID, err
}

func (s *Service) ensureDraftTemplateVersion(ctx context.Context, tx pgx.Tx, templateID, notes string) (string, error) {
	var versionID string
	err := tx.QueryRow(ctx, `
		SELECT id::text
		FROM indicators.indicator_template_versions
		WHERE template_id = $1::uuid AND status = 'draft'
		ORDER BY version_number DESC
		LIMIT 1
	`, templateID).Scan(&versionID)
	if err == nil {
		return versionID, nil
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}

	var nextVersion int
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(MAX(version_number), 0) + 1
		FROM indicators.indicator_template_versions
		WHERE template_id = $1::uuid
	`, templateID).Scan(&nextVersion); err != nil {
		return "", err
	}

	return s.createTemplateDraftVersion(ctx, tx, templateID, nextVersion, notes)
}

func replaceTemplateVersionContent(ctx context.Context, tx pgx.Tx, versionID string, categories []TemplateCategoryInput) error {
	if _, err := tx.Exec(ctx, `DELETE FROM indicators.indicator_template_categories WHERE template_version_id = $1::uuid`, versionID); err != nil {
		return err
	}

	for _, category := range categories {
		var categoryID string
		if err := tx.QueryRow(ctx, `
			INSERT INTO indicators.indicator_template_categories (
				template_version_id,
				code,
				name,
				description,
				sort_order,
				weight,
				scope_mode,
				metadata
			)
			VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb)
			RETURNING id::text
		`, versionID, normalizeText(category.Code, 80), normalizeText(category.Name, 160), normalizeText(category.Description, 4000), category.SortOrder, category.Weight, normalizeScopeMode(category.ScopeMode), mustJSONMap(category.Metadata)).Scan(&categoryID); err != nil {
			return err
		}

		for _, indicator := range category.Indicators {
			var indicatorID string
			metadata := indicator.Metadata
			if metadata == nil {
				metadata = map[string]any{}
			}
			if indicator.ID != "" {
				metadata["legacyId"] = indicator.ID
			}
			if err := tx.QueryRow(ctx, `
				INSERT INTO indicators.indicator_template_indicators (
					template_version_id,
					category_id,
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
					is_required,
					supports_store_breakdown,
					settings_json,
					metadata
				)
				VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, NULLIF($8, ''), NULLIF($9, ''), $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18::jsonb)
				RETURNING id::text
			`, versionID, categoryID, normalizeText(indicator.Code, 80), normalizeText(indicator.Name, 160), normalizeText(indicator.Description, 4000), normalizeIndicatorKind(indicator.IndicatorKind), normalizeSourceKind(indicator.SourceKind), normalizeText(indicator.SourceModule, 80), normalizeText(indicator.SourceMetricKey, 120), normalizeScopeMode(indicator.ScopeMode), normalizeAggregationMode(indicator.AggregationMode), normalizeValueType(indicator.ValueType), normalizeEvidencePolicy(indicator.EvidencePolicy), indicator.Weight, indicator.Required, indicator.SupportsStoreBreakdown, mustJSONMap(indicator.Settings), mustJSONMap(metadata)).Scan(&indicatorID); err != nil {
				return err
			}

			for _, item := range indicator.Items {
				itemCode := normalizeText(stringOrFallback(item.Code, item.ID), 80)
				if itemCode == "" {
					return ErrInvalidInput
				}
				if _, err := tx.Exec(ctx, `
					INSERT INTO indicators.indicator_template_indicator_items (
						template_indicator_id,
						code,
						label,
						description,
						input_type,
						evidence_policy,
						source_metric_key,
						select_options_json,
						weight,
						is_required,
						config_json,
						metadata
					)
					VALUES ($1::uuid, $2, $3, $4, $5, $6, NULLIF($7, ''), $8::jsonb, $9, $10, $11::jsonb, $12::jsonb)
				`, indicatorID, itemCode, normalizeText(item.Label, 160), normalizeText(item.Description, 4000), normalizeInputType(item.InputType), normalizeEvidencePolicy(item.EvidencePolicy), normalizeText(item.SourceMetricKey, 120), mustJSONArray(item.SelectOptions), item.Weight, item.Required, mustJSONMap(item.Config), mustJSONMap(item.Metadata)); err != nil {
					return err
				}
			}
		}
	}

	return nil
}

func publishTemplateVersion(ctx context.Context, tx pgx.Tx, templateID, versionID string) error {
	if _, err := tx.Exec(ctx, `
		UPDATE indicators.indicator_template_versions
		SET status = 'archived', updated_at = now()
		WHERE template_id = $1::uuid AND status = 'published' AND id <> $2::uuid
	`, templateID, versionID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE indicators.indicator_template_versions
		SET status = 'published', published_at = now(), updated_at = now()
		WHERE id = $1::uuid
	`, versionID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE indicators.indicator_templates
		SET status = 'active', updated_at = now()
		WHERE id = $1::uuid
	`, templateID); err != nil {
		return err
	}
	return nil
}

func maxInt(value, fallback int) int {
	if value <= 0 {
		return fallback
	}
	return value
}
