package indicators

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

func (s *Service) ListEvaluations(ctx context.Context, input ListEvaluationsInput) ([]EvaluationListItem, int, error) {
	tenantUUID, _, _, err := s.resolveTenant(ctx, input.TenantID, input.IsPlatformAdmin, input.ClientID)
	if err != nil {
		return nil, 0, err
	}

	input.Page, input.Limit = normalizePageAndLimit(input.Page, input.Limit)
	startDate, err := parseDate(input.StartDate)
	if err != nil {
		return nil, 0, err
	}
	endDate, err := parseDate(input.EndDate)
	if err != nil {
		return nil, 0, err
	}

	args := make([]any, 0, 10)
	arg := func(value any) string {
		args = append(args, value)
		return fmt.Sprintf("$%d", len(args))
	}

	conditions := []string{fmt.Sprintf("tenant_id = %s::uuid", arg(tenantUUID))}
	if unitExternalID := strings.TrimSpace(input.UnitExternalID); unitExternalID != "" {
		conditions = append(conditions, fmt.Sprintf("unit_external_id = %s", arg(unitExternalID)))
	}
	if status := strings.TrimSpace(input.Status); status != "" {
		conditions = append(conditions, fmt.Sprintf("status = %s", arg(normalizeEvaluationStatus(status))))
	}
	if startDate != "" {
		conditions = append(conditions, fmt.Sprintf("period_end >= %s::date", arg(startDate)))
	}
	if endDate != "" {
		conditions = append(conditions, fmt.Sprintf("period_start <= %s::date", arg(endDate)))
	}
	whereClause := strings.Join(conditions, " AND ")

	var total int
	countSQL := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM indicators.indicator_evaluations
		WHERE %s
	`, whereClause)
	if err := s.pool.QueryRow(ctx, countSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	offset := (input.Page - 1) * input.Limit
	listSQL := fmt.Sprintf(`
		SELECT
			e.id::text,
			e.evaluator_name,
			COALESCE(e.unit_external_id, ''),
			COALESCE(e.unit_code, ''),
			COALESCE(e.unit_name, ''),
			e.scope_mode,
			to_char(e.period_start, 'YYYY-MM-DD'),
			to_char(e.period_end, 'YYYY-MM-DD'),
			e.status,
			COALESCE(e.overall_score::float8, 0),
			COALESCE(e.total_weight::float8, 0),
			COALESCE(array_agg(DISTINCT ei.code) FILTER (WHERE ei.code IS NOT NULL), ARRAY[]::text[]),
			COALESCE(array_agg(DISTINCT ei.name) FILTER (WHERE ei.name IS NOT NULL), ARRAY[]::text[]),
			e.created_at
		FROM indicators.indicator_evaluations e
		LEFT JOIN indicators.indicator_evaluation_indicators ei ON ei.evaluation_id = e.id
		WHERE %s
		GROUP BY e.id
		ORDER BY e.period_start DESC, e.created_at DESC
		LIMIT %s OFFSET %s
	`, whereClause, arg(input.Limit), arg(offset))

	rows, err := s.pool.Query(ctx, listSQL, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	items := []EvaluationListItem{}
	for rows.Next() {
		var item EvaluationListItem
		if err := rows.Scan(
			&item.ID,
			&item.EvaluatorName,
			&item.UnitExternalID,
			&item.UnitCode,
			&item.UnitName,
			&item.ScopeMode,
			&item.PeriodStart,
			&item.PeriodEnd,
			&item.Status,
			&item.OverallScore,
			&item.TotalWeight,
			&item.IndicatorCodes,
			&item.IndicatorLabels,
			&item.CreatedAt,
		); err != nil {
			return nil, 0, err
		}
		items = append(items, item)
	}
	if rows.Err() != nil {
		return nil, 0, rows.Err()
	}

	return items, total, nil
}

func (s *Service) GetEvaluation(ctx context.Context, input GetEvaluationInput) (*EvaluationDetail, error) {
	tenantUUID, _, _, err := s.resolveTenant(ctx, input.TenantID, input.IsPlatformAdmin, input.ClientID)
	if err != nil {
		return nil, err
	}
	evaluationID := normalizeUUID(input.EvaluationID)
	if evaluationID == "" {
		return nil, ErrInvalidInput
	}

	var detail EvaluationDetail
	var targetSetID *string
	var configSnapshotRaw []byte
	var metadataRaw []byte
	err = s.pool.QueryRow(ctx, `
		SELECT
			id::text,
			profile_id::text,
			target_set_id::text,
			evaluator_name,
			COALESCE(unit_external_id, ''),
			COALESCE(unit_code, ''),
			COALESCE(unit_name, ''),
			scope_mode,
			to_char(period_start, 'YYYY-MM-DD'),
			to_char(period_end, 'YYYY-MM-DD'),
			status,
			COALESCE(overall_score::float8, 0),
			COALESCE(total_weight::float8, 0),
			COALESCE(notes, ''),
			config_snapshot,
			metadata,
			created_at,
			updated_at
		FROM indicators.indicator_evaluations
		WHERE id = $1::uuid AND tenant_id = $2::uuid
	`, evaluationID, tenantUUID).Scan(
		&detail.ID,
		&detail.ProfileID,
		&targetSetID,
		&detail.EvaluatorName,
		&detail.UnitExternalID,
		&detail.UnitCode,
		&detail.UnitName,
		&detail.ScopeMode,
		&detail.PeriodStart,
		&detail.PeriodEnd,
		&detail.Status,
		&detail.OverallScore,
		&detail.TotalWeight,
		&detail.Notes,
		&configSnapshotRaw,
		&metadataRaw,
		&detail.CreatedAt,
		&detail.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if targetSetID != nil {
		detail.TargetSetID = *targetSetID
	}
	detail.ConfigSnapshot = decodeJSONMap(configSnapshotRaw)
	detail.Metadata = decodeJSONMap(metadataRaw)

	categoryRows, err := s.pool.Query(ctx, `
		SELECT id::text, category_code, category_name, COALESCE(score::float8, 0), COALESCE(weight::float8, 0), summary_json, metadata
		FROM indicators.indicator_evaluation_categories
		WHERE evaluation_id = $1::uuid
		ORDER BY category_code
	`, evaluationID)
	if err != nil {
		return nil, err
	}
	defer categoryRows.Close()

	categoryCodeToID := map[string]string{}
	for categoryRows.Next() {
		var item EvaluationCategoryView
		var summaryRaw []byte
		var itemMetadataRaw []byte
		if err := categoryRows.Scan(&item.RecordID, &item.Code, &item.Name, &item.Score, &item.Weight, &summaryRaw, &itemMetadataRaw); err != nil {
			return nil, err
		}
		item.Summary = decodeJSONMap(summaryRaw)
		item.Metadata = decodeJSONMap(itemMetadataRaw)
		detail.Categories = append(detail.Categories, item)
		categoryCodeToID[item.Code] = item.RecordID
	}
	if categoryRows.Err() != nil {
		return nil, categoryRows.Err()
	}

	indicatorRows, err := s.pool.Query(ctx, `
		SELECT id::text, profile_indicator_id::text, code, name, source_kind, COALESCE(source_module, ''), scope_mode, aggregation_mode, value_type, evidence_policy, COALESCE(score::float8, 0), raw_value_numeric::float8, COALESCE(weight::float8, 0), config_snapshot, metadata
		FROM indicators.indicator_evaluation_indicators
		WHERE evaluation_id = $1::uuid
		ORDER BY code
	`, evaluationID)
	if err != nil {
		return nil, err
	}
	defer indicatorRows.Close()

	indicatorByID := map[string]*EvaluationIndicatorView{}
	for indicatorRows.Next() {
		var item EvaluationIndicatorView
		var profileIndicatorID *string
		var configRaw []byte
		var itemMetadataRaw []byte
		if err := indicatorRows.Scan(&item.RecordID, &profileIndicatorID, &item.Code, &item.Name, &item.SourceKind, &item.SourceModule, &item.ScopeMode, &item.AggregationMode, &item.ValueType, &item.EvidencePolicy, &item.Score, &item.RawValueNumeric, &item.Weight, &configRaw, &itemMetadataRaw); err != nil {
			return nil, err
		}
		item.ConfigSnapshot = decodeJSONMap(configRaw)
		item.Metadata = decodeJSONMap(itemMetadataRaw)
		if profileIndicatorID != nil {
			item.ProfileIndicatorID = *profileIndicatorID
		}
		if categoryCode := metadataString(item.Metadata, "categoryCode"); categoryCode != "" {
			item.CategoryRecordID = categoryCodeToID[categoryCode]
		}
		item.Items = []EvaluationItemView{}
		detail.Indicators = append(detail.Indicators, item)
		indicatorByID[item.RecordID] = &detail.Indicators[len(detail.Indicators)-1]
	}
	if indicatorRows.Err() != nil {
		return nil, indicatorRows.Err()
	}

	itemRows, err := s.pool.Query(ctx, `
		SELECT evaluation_indicator_id::text, id::text, profile_item_id::text, code, label, input_type, evidence_policy, COALESCE(value_text, ''), value_numeric::float8, value_boolean, value_json, COALESCE(weight::float8, 0), COALESCE(score::float8, 0), COALESCE(notes, ''), config_snapshot, metadata
		FROM indicators.indicator_evaluation_items
		WHERE evaluation_indicator_id IN (
			SELECT id FROM indicators.indicator_evaluation_indicators WHERE evaluation_id = $1::uuid
		)
		ORDER BY code
	`, evaluationID)
	if err != nil {
		return nil, err
	}
	defer itemRows.Close()

	for itemRows.Next() {
		var evaluationIndicatorID string
		var item EvaluationItemView
		var profileItemID *string
		var valueJSONRaw []byte
		var configRaw []byte
		var itemMetadataRaw []byte
		if err := itemRows.Scan(&evaluationIndicatorID, &item.RecordID, &profileItemID, &item.Code, &item.Label, &item.InputType, &item.EvidencePolicy, &item.ValueText, &item.ValueNumeric, &item.ValueBoolean, &valueJSONRaw, &item.Weight, &item.Score, &item.Notes, &configRaw, &itemMetadataRaw); err != nil {
			return nil, err
		}
		if profileItemID != nil {
			item.ProfileItemID = *profileItemID
		}
		item.ValueJSON = decodeJSONMap(valueJSONRaw)
		item.ConfigSnapshot = decodeJSONMap(configRaw)
		item.Metadata = decodeJSONMap(itemMetadataRaw)
		if indicator := indicatorByID[evaluationIndicatorID]; indicator != nil {
			indicator.Items = append(indicator.Items, item)
		}
	}
	if itemRows.Err() != nil {
		return nil, itemRows.Err()
	}

	snapshotRows, err := s.pool.Query(ctx, `
		SELECT id::text, provider_name, COALESCE(source_module, ''), metric_key, scope_mode, COALESCE(unit_external_id, ''), snapshot_at, value_numeric::float8, COALESCE(value_text, ''), value_json, metadata
		FROM indicators.indicator_metric_snapshots
		WHERE evaluation_id = $1::uuid
		ORDER BY snapshot_at DESC
	`, evaluationID)
	if err != nil {
		return nil, err
	}
	defer snapshotRows.Close()

	for snapshotRows.Next() {
		var item MetricSnapshotView
		var valueJSONRaw []byte
		var itemMetadataRaw []byte
		if err := snapshotRows.Scan(&item.RecordID, &item.ProviderName, &item.SourceModule, &item.MetricKey, &item.ScopeMode, &item.UnitExternalID, &item.SnapshotAt, &item.ValueNumeric, &item.ValueText, &valueJSONRaw, &itemMetadataRaw); err != nil {
			return nil, err
		}
		item.ValueJSON = decodeJSONMap(valueJSONRaw)
		item.Metadata = decodeJSONMap(itemMetadataRaw)
		detail.Snapshots = append(detail.Snapshots, item)
	}
	if snapshotRows.Err() != nil {
		return nil, snapshotRows.Err()
	}

	assetRows, err := s.pool.Query(ctx, `
		SELECT id::text, asset_kind, COALESCE(storage_provider, ''), COALESCE(storage_bucket, ''), storage_key, COALESCE(file_name, ''), COALESCE(content_type, ''), COALESCE(file_size_bytes, 0), uploaded_at, metadata
		FROM indicators.indicator_assets
		WHERE evaluation_id = $1::uuid
		ORDER BY uploaded_at DESC
	`, evaluationID)
	if err != nil {
		return nil, err
	}
	defer assetRows.Close()

	for assetRows.Next() {
		var item AssetView
		var itemMetadataRaw []byte
		if err := assetRows.Scan(&item.RecordID, &item.AssetKind, &item.StorageProvider, &item.StorageBucket, &item.StorageKey, &item.FileName, &item.ContentType, &item.FileSizeBytes, &item.UploadedAt, &itemMetadataRaw); err != nil {
			return nil, err
		}
		item.Metadata = decodeJSONMap(itemMetadataRaw)
		detail.Assets = append(detail.Assets, item)
	}
	if assetRows.Err() != nil {
		return nil, assetRows.Err()
	}

	return &detail, nil
}

func (s *Service) CreateEvaluation(ctx context.Context, input CreateEvaluationInput) (*EvaluationDetail, error) {
	tenantUUID, _, _, err := s.resolveTenant(ctx, input.TenantID, input.IsPlatformAdmin, input.ClientID)
	if err != nil {
		return nil, err
	}

	profileID := normalizeUUID(input.ProfileID)
	if profileID == "" {
		profile, err := s.ensureActiveProfile(ctx, tenantUUID)
		if err != nil {
			return nil, err
		}
		profileID = profile.RecordID
	}
	if err := s.assertProfileBelongsToTenant(ctx, tenantUUID, profileID); err != nil {
		return nil, err
	}

	periodStart, err := parseDate(input.PeriodStart)
	if err != nil || periodStart == "" {
		return nil, ErrInvalidInput
	}
	periodEnd, err := parseDate(input.PeriodEnd)
	if err != nil || periodEnd == "" {
		return nil, ErrInvalidInput
	}
	if periodEnd < periodStart {
		return nil, ErrInvalidInput
	}

	targetSetID := normalizeUUID(input.TargetSetID)
	if targetSetID != "" {
		if err := s.assertTargetSetBelongsToTenant(ctx, tenantUUID, targetSetID); err != nil {
			return nil, err
		}
	}

	overallScore, totalWeight := evaluationScoreFromIndicators(input.Indicators)
	configSnapshot := input.ConfigSnapshot
	if configSnapshot == nil {
		configSnapshot = map[string]any{"profileId": profileID}
	}
	categories := input.Categories
	if len(categories) == 0 {
		categories = deriveEvaluationCategories(input.Indicators)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var evaluationID string
	err = tx.QueryRow(ctx, `
		INSERT INTO indicators.indicator_evaluations (
			tenant_id,
			profile_id,
			target_set_id,
			evaluator_user_id,
			evaluator_name,
			unit_external_id,
			unit_code,
			unit_name,
			scope_mode,
			period_start,
			period_end,
			status,
			overall_score,
			total_weight,
			notes,
			config_snapshot,
			metadata
		)
		VALUES (
			$1::uuid,
			$2::uuid,
			$3::uuid,
			$4::uuid,
			$5,
			NULLIF($6, ''),
			NULLIF($7, ''),
			NULLIF($8, ''),
			$9,
			$10::date,
			$11::date,
			$12,
			$13,
			$14,
			$15,
			$16::jsonb,
			$17::jsonb
		)
		RETURNING id::text
	`,
		tenantUUID,
		profileID,
		nullableUUIDArg(targetSetID),
		nullableUUIDArg(input.UserID),
		normalizeText(stringOrFallback(input.EvaluatorName, "Sistema"), 160),
		strings.TrimSpace(input.UnitExternalID),
		normalizeText(input.UnitCode, 80),
		normalizeText(input.UnitName, 160),
		normalizeScopeMode(input.ScopeMode),
		periodStart,
		periodEnd,
		normalizeEvaluationStatus(input.Status),
		overallScore,
		totalWeight,
		normalizeText(input.Notes, 4000),
		mustJSONMap(configSnapshot),
		mustJSONMap(input.Metadata),
	).Scan(&evaluationID)
	if err != nil {
		return nil, err
	}

	categoryRecordIDs := map[string]string{}
	for _, category := range categories {
		categoryCode := normalizeText(category.Code, 80)
		if categoryCode == "" {
			continue
		}
		var categoryID string
		if err := tx.QueryRow(ctx, `
			INSERT INTO indicators.indicator_evaluation_categories (
				evaluation_id,
				category_code,
				category_name,
				score,
				weight,
				summary_json,
				metadata
			)
			VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
			RETURNING id::text
		`, evaluationID, categoryCode, normalizeText(stringOrFallback(category.Name, categoryCode), 160), category.Score, category.Weight, mustJSONMap(category.Summary), mustJSONMap(category.Metadata)).Scan(&categoryID); err != nil {
			return nil, err
		}
		categoryRecordIDs[categoryCode] = categoryID
	}

	for _, indicator := range input.Indicators {
		var evaluationIndicatorID string
		indicatorMetadata := indicator.Metadata
		if indicatorMetadata == nil {
			indicatorMetadata = map[string]any{}
		}
		if categoryCode := normalizeText(indicator.CategoryCode, 80); categoryCode != "" {
			indicatorMetadata["categoryCode"] = categoryCode
			if indicator.CategoryName != "" {
				indicatorMetadata["categoryName"] = indicator.CategoryName
			}
		}
		if err := tx.QueryRow(ctx, `
			INSERT INTO indicators.indicator_evaluation_indicators (
				evaluation_id,
				evaluation_category_id,
				profile_indicator_id,
				code,
				name,
				source_kind,
				source_module,
				scope_mode,
				aggregation_mode,
				value_type,
				evidence_policy,
				score,
				raw_value_numeric,
				weight,
				config_snapshot,
				metadata
			)
			VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, NULLIF($7, ''), $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb)
			RETURNING id::text
		`,
			evaluationID,
			nullableUUIDArg(categoryRecordIDs[normalizeText(indicator.CategoryCode, 80)]),
			nullableUUIDArg(indicator.ProfileIndicatorID),
			normalizeText(indicator.Code, 80),
			normalizeText(indicator.Name, 160),
			normalizeSourceKind(indicator.SourceKind),
			normalizeText(indicator.SourceModule, 80),
			normalizeScopeMode(indicator.ScopeMode),
			normalizeAggregationMode(indicator.AggregationMode),
			normalizeValueType(indicator.ValueType),
			normalizeEvaluationIndicatorEvidencePolicy(indicator.EvidencePolicy),
			indicator.Score,
			indicator.RawValueNumeric,
			indicator.Weight,
			mustJSONMap(indicator.ConfigSnapshot),
			mustJSONMap(indicatorMetadata),
		).Scan(&evaluationIndicatorID); err != nil {
			return nil, err
		}

		for _, item := range indicator.Items {
			if _, err := tx.Exec(ctx, `
				INSERT INTO indicators.indicator_evaluation_items (
					evaluation_indicator_id,
					profile_item_id,
					code,
					label,
					input_type,
					evidence_policy,
					value_text,
					value_numeric,
					value_boolean,
					value_json,
					weight,
					score,
					notes,
					config_snapshot,
					metadata
				)
				VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, NULLIF($7, ''), $8, $9, $10::jsonb, $11, $12, NULLIF($13, ''), $14::jsonb, $15::jsonb)
			`, evaluationIndicatorID, nullableUUIDArg(item.ProfileItemID), normalizeText(item.Code, 80), normalizeText(item.Label, 160), normalizeInputType(item.InputType), normalizeEvidencePolicy(item.EvidencePolicy), item.ValueText, item.ValueNumeric, item.ValueBoolean, mustJSONMap(item.ValueJSON), item.Weight, item.Score, normalizeText(item.Notes, 4000), mustJSONMap(item.ConfigSnapshot), mustJSONMap(item.Metadata)); err != nil {
				return nil, err
			}
		}
	}

	for _, snapshot := range input.Snapshots {
		snapshotAt, err := parseOptionalTimestamp(snapshot.SnapshotAt)
		if err != nil {
			return nil, err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO indicators.indicator_metric_snapshots (
				evaluation_id,
				profile_indicator_id,
				provider_name,
				source_module,
				metric_key,
				scope_mode,
				unit_external_id,
				snapshot_at,
				value_numeric,
				value_text,
				value_json,
				metadata
			)
			VALUES ($1::uuid, $2::uuid, $3, NULLIF($4, ''), $5, $6, NULLIF($7, ''), COALESCE($8::timestamptz, now()), $9, NULLIF($10, ''), $11::jsonb, $12::jsonb)
		`, evaluationID, nullableUUIDArg(snapshot.ProfileIndicatorID), normalizeText(stringOrFallback(metadataString(snapshot.Metadata, "providerName"), "manual"), 80), normalizeText(metadataString(snapshot.Metadata, "sourceModule"), 80), normalizeText(snapshot.MetricKey, 120), normalizeScopeMode(snapshot.ScopeMode), strings.TrimSpace(snapshot.UnitExternalID), snapshotAt, snapshot.ValueNumeric, snapshot.ValueText, mustJSONMap(snapshot.ValueJSON), mustJSONMap(snapshot.Metadata)); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return s.GetEvaluation(ctx, GetEvaluationInput{
		UserID:          input.UserID,
		TenantID:        tenantUUID,
		IsPlatformAdmin: false,
		EvaluationID:    evaluationID,
	})
}

func (s *Service) DeleteEvaluation(ctx context.Context, input DeleteEvaluationInput) error {
	tenantUUID, _, _, err := s.resolveTenant(ctx, input.TenantID, input.IsPlatformAdmin, input.ClientID)
	if err != nil {
		return err
	}
	evaluationID := normalizeUUID(input.EvaluationID)
	if evaluationID == "" {
		return ErrInvalidInput
	}

	commandTag, err := s.pool.Exec(ctx, `
		DELETE FROM indicators.indicator_evaluations
		WHERE id = $1::uuid AND tenant_id = $2::uuid
	`, evaluationID, tenantUUID)
	if err != nil {
		return err
	}
	if commandTag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Service) GetDashboard(ctx context.Context, input GetDashboardInput) (*DashboardResponse, error) {
	tenantUUID, _, clientName, err := s.resolveTenant(ctx, input.TenantID, input.IsPlatformAdmin, input.ClientID)
	if err != nil {
		return nil, err
	}

	profile, err := s.ensureActiveProfile(ctx, tenantUUID)
	if err != nil {
		return nil, err
	}
	profileSnapshot, err := s.loadActiveProfileResponse(ctx, tenantUUID, clientName, profile)
	if err != nil {
		return nil, err
	}

	startDate, err := parseDate(input.StartDate)
	if err != nil {
		return nil, err
	}
	endDate, err := parseDate(input.EndDate)
	if err != nil {
		return nil, err
	}

	args := make([]any, 0, 8)
	arg := func(value any) string {
		args = append(args, value)
		return fmt.Sprintf("$%d", len(args))
	}
	conditions := []string{fmt.Sprintf("e.tenant_id = %s::uuid", arg(tenantUUID)), "e.status = 'completed'"}
	if startDate != "" {
		conditions = append(conditions, fmt.Sprintf("e.period_end >= %s::date", arg(startDate)))
	}
	if endDate != "" {
		conditions = append(conditions, fmt.Sprintf("e.period_start <= %s::date", arg(endDate)))
	}
	if unitExternalID := strings.TrimSpace(input.UnitExternalID); unitExternalID != "" {
		conditions = append(conditions, fmt.Sprintf("e.unit_external_id = %s", arg(unitExternalID)))
	}
	whereClause := strings.Join(conditions, " AND ")

	response := &DashboardResponse{
		Summary:    profileSnapshot.Summary,
		RangeStart: startDate,
		RangeEnd:   endDate,
		Stores:     []DashboardStore{},
		Ranking:    []DashboardStore{},
		Indicators: []DashboardIndicatorAggregate{},
	}

	if err := s.pool.QueryRow(ctx, fmt.Sprintf(`
		SELECT COUNT(*)
		FROM indicators.indicator_evaluations e
		WHERE %s
	`, whereClause), args...).Scan(&response.EvaluationCount); err != nil {
		return nil, err
	}

	indicatorRows, err := s.pool.Query(ctx, fmt.Sprintf(`
		SELECT ei.code, ei.name, COALESCE(AVG(COALESCE(ei.score, 0))::float8, 0), COUNT(DISTINCT e.id), COALESCE(AVG(COALESCE(ei.weight, 0))::float8, 0)
		FROM indicators.indicator_evaluations e
		JOIN indicators.indicator_evaluation_indicators ei ON ei.evaluation_id = e.id
		WHERE %s
		GROUP BY ei.code, ei.name
		ORDER BY ei.code
	`, whereClause), args...)
	if err != nil {
		return nil, err
	}
	defer indicatorRows.Close()

	for indicatorRows.Next() {
		var item DashboardIndicatorAggregate
		if err := indicatorRows.Scan(&item.Code, &item.Name, &item.Score, &item.EvaluationsCount, &item.Weight); err != nil {
			return nil, err
		}
		item.Score = roundFloat(item.Score, 2)
		item.Weight = roundFloat(item.Weight, 2)
		item.Tone = scoreTone(item.Score)
		response.Indicators = append(response.Indicators, item)
	}
	if indicatorRows.Err() != nil {
		return nil, indicatorRows.Err()
	}

	storeRows, err := s.pool.Query(ctx, fmt.Sprintf(`
		SELECT COALESCE(e.unit_external_id, ''), COALESCE(e.unit_code, ''), COALESCE(e.unit_name, ''), COALESCE(AVG(COALESCE(e.overall_score, 0))::float8, 0), COALESCE(AVG(COALESCE(e.total_weight, 0))::float8, 0), COUNT(*)
		FROM indicators.indicator_evaluations e
		WHERE %s AND COALESCE(e.unit_external_id, '') <> ''
		GROUP BY COALESCE(e.unit_external_id, ''), COALESCE(e.unit_code, ''), COALESCE(e.unit_name, '')
		ORDER BY COALESCE(AVG(COALESCE(e.overall_score, 0))::float8, 0) DESC, COALESCE(e.unit_name, '')
	`, whereClause), args...)
	if err != nil {
		return nil, err
	}
	defer storeRows.Close()

	storeByID := map[string]*DashboardStore{}
	storeOrder := []string{}
	for storeRows.Next() {
		var item DashboardStore
		if err := storeRows.Scan(&item.UnitExternalID, &item.UnitCode, &item.UnitName, &item.Score, &item.UsedWeight, &item.EvaluationsCount); err != nil {
			return nil, err
		}
		item.Score = roundFloat(item.Score, 2)
		item.UsedWeight = roundFloat(item.UsedWeight, 2)
		item.ScopeMode = "per_store"
		item.Tone = scoreTone(item.Score)
		item.Indicators = []DashboardIndicatorScore{}
		response.Stores = append(response.Stores, item)
		storeByID[item.UnitExternalID] = &response.Stores[len(response.Stores)-1]
		storeOrder = append(storeOrder, item.UnitExternalID)
	}
	if storeRows.Err() != nil {
		return nil, storeRows.Err()
	}

	storeIndicatorRows, err := s.pool.Query(ctx, fmt.Sprintf(`
		SELECT COALESCE(e.unit_external_id, ''), ei.code, ei.name, COALESCE(AVG(COALESCE(ei.score, 0))::float8, 0), COUNT(*), COALESCE(AVG(COALESCE(ei.weight, 0))::float8, 0)
		FROM indicators.indicator_evaluations e
		JOIN indicators.indicator_evaluation_indicators ei ON ei.evaluation_id = e.id
		WHERE %s AND COALESCE(e.unit_external_id, '') <> ''
		GROUP BY COALESCE(e.unit_external_id, ''), ei.code, ei.name
		ORDER BY COALESCE(e.unit_external_id, ''), ei.code
	`, whereClause), args...)
	if err != nil {
		return nil, err
	}
	defer storeIndicatorRows.Close()

	for storeIndicatorRows.Next() {
		var storeID string
		var indicator DashboardIndicatorScore
		if err := storeIndicatorRows.Scan(&storeID, &indicator.Code, &indicator.Name, &indicator.Score, &indicator.EvaluationsCount, &indicator.Weight); err != nil {
			return nil, err
		}
		indicator.Score = roundFloat(indicator.Score, 2)
		indicator.Weight = roundFloat(indicator.Weight, 2)
		indicator.Tone = scoreTone(indicator.Score)
		if store := storeByID[storeID]; store != nil {
			store.Indicators = append(store.Indicators, indicator)
		}
	}
	if storeIndicatorRows.Err() != nil {
		return nil, storeIndicatorRows.Err()
	}

	for index := range response.Stores {
		response.Stores[index].AccentColor = accentColorForIndex(index)
	}

	response.Ranking = append(response.Ranking, response.Stores...)
	sort.Slice(response.Ranking, func(i, j int) bool {
		if response.Ranking[i].Score == response.Ranking[j].Score {
			return response.Ranking[i].UnitName < response.Ranking[j].UnitName
		}
		return response.Ranking[i].Score > response.Ranking[j].Score
	})
	for index := range response.Ranking {
		response.Ranking[index].AccentColor = accentColorForIndex(index)
	}

	return response, nil
}

func (s *Service) ReplaceTargets(ctx context.Context, input ReplaceTargetsInput) ([]TargetSetView, error) {
	tenantUUID, _, _, err := s.resolveTenant(ctx, input.TenantID, input.IsPlatformAdmin, input.ClientID)
	if err != nil {
		return nil, err
	}
	profile, err := s.ensureActiveProfile(ctx, tenantUUID)
	if err != nil {
		return nil, err
	}
	_, businessIDs, _, err := s.loadProfileIndicators(ctx, profile.RecordID)
	if err != nil {
		return nil, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `DELETE FROM indicators.indicator_target_sets WHERE profile_id = $1::uuid`, profile.RecordID); err != nil {
		return nil, err
	}

	for _, targetSet := range input.TargetSets {
		var targetSetID string
		if err := tx.QueryRow(ctx, `
			INSERT INTO indicators.indicator_target_sets (
				tenant_id,
				profile_id,
				name,
				period_kind,
				starts_at,
				ends_at,
				scope_mode,
				status,
				metadata
			)
			VALUES ($1::uuid, $2::uuid, $3, $4, NULLIF($5, '')::date, NULLIF($6, '')::date, $7, $8, $9::jsonb)
			RETURNING id::text
		`, tenantUUID, profile.RecordID, normalizeText(targetSet.Name, 160), normalizePeriodKind(targetSet.PeriodKind), targetSet.StartsAt, targetSet.EndsAt, normalizeScopeMode(targetSet.ScopeMode), normalizeTargetStatus(targetSet.Status), mustJSONMap(targetSet.Metadata)).Scan(&targetSetID); err != nil {
			return nil, err
		}

		for _, item := range targetSet.Items {
			profileIndicatorID := strings.TrimSpace(item.IndicatorID)
			if resolved := businessIDs[profileIndicatorID]; resolved != "" {
				profileIndicatorID = resolved
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO indicators.indicator_target_items (
					target_set_id,
					profile_indicator_id,
					category_code,
					unit_external_id,
					target_value_numeric,
					target_value_text,
					target_value_json,
					comparator,
					weight,
					metadata
				)
				VALUES ($1::uuid, $2::uuid, NULLIF($3, ''), NULLIF($4, ''), $5, NULLIF($6, ''), $7::jsonb, $8, $9, $10::jsonb)
			`, targetSetID, nullableUUIDArg(profileIndicatorID), normalizeText(item.CategoryCode, 80), strings.TrimSpace(item.UnitExternalID), item.TargetValueNumeric, item.TargetValueText, mustJSONMap(item.TargetValueJSON), normalizeComparator(item.Comparator), item.Weight, mustJSONMap(item.Metadata)); err != nil {
				return nil, err
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return s.loadTargetSets(ctx, profile.RecordID, businessIDs)
}

func (s *Service) GetTargets(ctx context.Context, input GetActiveProfileInput) ([]TargetSetView, error) {
	tenantUUID, _, _, err := s.resolveTenant(ctx, input.TenantID, input.IsPlatformAdmin, input.ClientID)
	if err != nil {
		return nil, err
	}
	profile, err := s.ensureActiveProfile(ctx, tenantUUID)
	if err != nil {
		return nil, err
	}
	_, businessIDs, _, err := s.loadProfileIndicators(ctx, profile.RecordID)
	if err != nil {
		return nil, err
	}
	return s.loadTargetSets(ctx, profile.RecordID, businessIDs)
}

func (s *Service) IngestProviderSnapshots(ctx context.Context, input IngestProviderSnapshotsInput) ([]ProviderHealth, error) {
	tenantUUID, _, _, err := s.resolveTenant(ctx, input.TenantID, input.IsPlatformAdmin, input.ClientID)
	if err != nil {
		return nil, err
	}
	profile, err := s.ensureActiveProfile(ctx, tenantUUID)
	if err != nil {
		return nil, err
	}
	indicators, businessIDs, _, err := s.loadProfileIndicators(ctx, profile.RecordID)
	if err != nil {
		return nil, err
	}

	indicatorByRecordID := map[string]ProfileIndicatorConfig{}
	for _, indicator := range indicators {
		indicatorByRecordID[indicator.RecordID] = indicator
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	for _, snapshot := range input.Snapshots {
		evaluationID := normalizeUUID(snapshot.EvaluationID)
		if evaluationID != "" {
			if err := assertEvaluationBelongsToTenantTx(ctx, tx, tenantUUID, evaluationID); err != nil {
				return nil, err
			}
		}

		profileIndicatorID := strings.TrimSpace(snapshot.ProfileIndicatorID)
		if resolved := businessIDs[profileIndicatorID]; resolved != "" {
			profileIndicatorID = resolved
		}
		indicator := indicatorByRecordID[profileIndicatorID]

		snapshotAt, err := parseOptionalTimestamp(snapshot.SnapshotAt)
		if err != nil {
			return nil, err
		}

		if _, err := tx.Exec(ctx, `
			INSERT INTO indicators.indicator_metric_snapshots (
				evaluation_id,
				profile_indicator_id,
				provider_name,
				source_module,
				metric_key,
				scope_mode,
				unit_external_id,
				snapshot_at,
				value_numeric,
				value_text,
				value_json,
				metadata
			)
			VALUES ($1::uuid, $2::uuid, $3, NULLIF($4, ''), $5, $6, NULLIF($7, ''), COALESCE($8::timestamptz, now()), $9, NULLIF($10, ''), $11::jsonb, $12::jsonb)
		`, nullableUUIDArg(evaluationID), nullableUUIDArg(profileIndicatorID), normalizeText(input.ProviderName, 80), normalizeText(stringOrFallback(input.SourceModule, indicator.SourceModule), 80), normalizeText(snapshot.MetricKey, 120), normalizeScopeMode(stringOrFallback(snapshot.ScopeMode, indicator.ScopeMode)), strings.TrimSpace(snapshot.UnitExternalID), snapshotAt, snapshot.ValueNumeric, snapshot.ValueText, mustJSONMap(snapshot.ValueJSON), mustJSONMap(snapshot.Metadata)); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return s.loadProviderHealth(ctx, profile.RecordID, indicators)
}

func (s *Service) CreateAssetUploadIntent(ctx context.Context, input CreateAssetUploadIntentInput) (*AssetUploadIntent, error) {
	tenantUUID, _, _, err := s.resolveTenant(ctx, input.TenantID, input.IsPlatformAdmin, input.ClientID)
	if err != nil {
		return nil, err
	}
	evaluationID := normalizeUUID(input.EvaluationID)
	if evaluationID != "" {
		if err := s.assertEvaluationBelongsToTenant(ctx, tenantUUID, evaluationID); err != nil {
			return nil, err
		}
	}

	fileName := sanitizeFileName(input.FileName)
	storageKey := fmt.Sprintf("%s/%s/%d-%s", time.Now().UTC().Format("2006/01/02"), normalizeText(stringOrFallback(input.AssetKind, "image"), 30), time.Now().UTC().UnixNano(), fileName)

	var assetID string
	err = s.pool.QueryRow(ctx, `
		INSERT INTO indicators.indicator_assets (
			tenant_id,
			evaluation_id,
			evaluation_indicator_id,
			evaluation_item_id,
			asset_kind,
			storage_provider,
			storage_bucket,
			storage_key,
			file_name,
			content_type,
			file_size_bytes,
			uploaded_by_user_id,
			metadata
		)
		VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, 'pending', '', $6, $7, NULLIF($8, ''), $9, $10::uuid, $11::jsonb)
		RETURNING id::text
	`, tenantUUID, nullableUUIDArg(evaluationID), nullableUUIDArg(input.EvaluationIndicatorID), nullableUUIDArg(input.EvaluationItemID), normalizeAssetKind(input.AssetKind), storageKey, fileName, normalizeText(input.ContentType, 120), nullableInt64Arg(input.FileSizeBytes), nullableUUIDArg(input.UserID), mustJSONMap(input.Metadata)).Scan(&assetID)
	if err != nil {
		return nil, err
	}

	return &AssetUploadIntent{
		AssetID:             assetID,
		StorageProvider:     "pending",
		StorageBucket:       "",
		StorageKey:          storageKey,
		UploadURL:           "",
		UploadMethod:        "PUT",
		Headers:             map[string]string{},
		DirectUploadEnabled: false,
	}, nil
}

func (s *Service) assertProfileBelongsToTenant(ctx context.Context, tenantUUID, profileID string) error {
	var found string
	if err := s.pool.QueryRow(ctx, `
		SELECT id::text
		FROM indicators.indicator_profiles
		WHERE id = $1::uuid AND tenant_id = $2::uuid
	`, profileID, tenantUUID).Scan(&found); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	return nil
}

func (s *Service) assertTargetSetBelongsToTenant(ctx context.Context, tenantUUID, targetSetID string) error {
	var found string
	if err := s.pool.QueryRow(ctx, `
		SELECT id::text
		FROM indicators.indicator_target_sets
		WHERE id = $1::uuid AND tenant_id = $2::uuid
	`, targetSetID, tenantUUID).Scan(&found); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	return nil
}

func (s *Service) assertEvaluationBelongsToTenant(ctx context.Context, tenantUUID, evaluationID string) error {
	return assertEvaluationBelongsToTenantTx(ctx, s.pool, tenantUUID, evaluationID)
}

func assertEvaluationBelongsToTenantTx(ctx context.Context, query interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, tenantUUID, evaluationID string) error {
	var found string
	if err := query.QueryRow(ctx, `
		SELECT id::text
		FROM indicators.indicator_evaluations
		WHERE id = $1::uuid AND tenant_id = $2::uuid
	`, evaluationID, tenantUUID).Scan(&found); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	return nil
}

func deriveEvaluationCategories(indicators []EvaluationIndicatorInput) []EvaluationCategoryInput {
	type aggregate struct {
		name         string
		weighted     float64
		totalWeight  float64
		summaryCount int
	}
	categoryMap := map[string]*aggregate{}
	for _, indicator := range indicators {
		code := normalizeText(indicator.CategoryCode, 80)
		if code == "" {
			code = "geral"
		}
		agg := categoryMap[code]
		if agg == nil {
			agg = &aggregate{name: stringOrFallback(indicator.CategoryName, code)}
			categoryMap[code] = agg
		}
		agg.weighted += indicator.Score * indicator.Weight
		agg.totalWeight += indicator.Weight
		agg.summaryCount++
	}
	keys := make([]string, 0, len(categoryMap))
	for key := range categoryMap {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	output := make([]EvaluationCategoryInput, 0, len(keys))
	for _, key := range keys {
		agg := categoryMap[key]
		score := 0.0
		if agg.totalWeight > 0 {
			score = roundFloat(agg.weighted/agg.totalWeight, 4)
		}
		output = append(output, EvaluationCategoryInput{
			Code:   key,
			Name:   agg.name,
			Score:  score,
			Weight: roundFloat(agg.totalWeight, 4),
			Summary: map[string]any{
				"indicatorCount": agg.summaryCount,
			},
		})
	}
	return output
}

func nullableUUIDArg(value string) any {
	value = normalizeUUID(value)
	if value == "" {
		return nil
	}
	return value
}

func nullableInt64Arg(value int64) any {
	if value <= 0 {
		return nil
	}
	return value
}

func parseOptionalTimestamp(value string) (*time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}
	layouts := []string{time.RFC3339Nano, time.RFC3339, "2006-01-02 15:04:05", "2006-01-02"}
	for _, layout := range layouts {
		if parsed, err := time.Parse(layout, value); err == nil {
			return &parsed, nil
		}
	}
	return nil, ErrInvalidInput
}

func normalizeAssetKind(value string) string {
	value = normalizeLower(value, 30)
	switch value {
	case "video", "document", "link", "provider_export":
		return value
	default:
		return "image"
	}
}

func normalizeEvaluationIndicatorEvidencePolicy(value string) string {
	value = normalizeEvidencePolicy(value)
	if value == "inherit" {
		return "optional"
	}
	return value
}
