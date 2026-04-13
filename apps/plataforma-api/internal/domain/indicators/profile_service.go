package indicators

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
)

func (s *Service) GetActiveProfile(ctx context.Context, input GetActiveProfileInput) (*ActiveProfileResponse, error) {
	tenantUUID, _, clientName, err := s.resolveTenant(ctx, input.TenantID, input.IsPlatformAdmin, input.ClientID)
	if err != nil {
		return nil, err
	}

	profile, err := s.ensureActiveProfile(ctx, tenantUUID)
	if err != nil {
		return nil, err
	}

	return s.loadActiveProfileResponse(ctx, tenantUUID, clientName, profile)
}

func (s *Service) ReplaceActiveProfile(ctx context.Context, input ReplaceActiveProfileInput) (*ActiveProfileResponse, error) {
	tenantUUID, _, clientName, err := s.resolveTenant(ctx, input.TenantID, input.IsPlatformAdmin, input.ClientID)
	if err != nil {
		return nil, err
	}

	profile, err := s.ensureActiveProfile(ctx, tenantUUID)
	if err != nil {
		return nil, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	profileMetadata := profile.Metadata
	for key, value := range input.Metadata {
		profileMetadata[key] = value
	}

	if _, err := tx.Exec(ctx, `
		UPDATE indicators.indicator_profiles
		SET
			name = $2,
			description = $3,
			status = $4,
			scope_mode = $5,
			store_breakdown_enabled = $6,
			provider_sync_enabled = $7,
			metadata = $8::jsonb,
			updated_at = now()
		WHERE id = $1::uuid
	`, profile.RecordID,
		normalizeText(stringOrFallback(input.Name, profile.Name), 160),
		normalizeText(input.Description, 4000),
		normalizeProfileStatus(stringOrFallback(input.Status, profile.Status)),
		normalizeScopeMode(stringOrFallback(input.ScopeMode, profile.ScopeMode)),
		input.StoreBreakdownEnabled,
		input.ProviderSyncEnabled,
		mustJSONMap(profileMetadata),
	); err != nil {
		return nil, err
	}

	keptIndicatorCodes := make([]string, 0, len(input.Indicators))
	for _, indicator := range input.Indicators {
		code := normalizeText(indicator.Code, 80)
		if code == "" {
			return nil, ErrInvalidInput
		}
		keptIndicatorCodes = append(keptIndicatorCodes, code)

		metadata := indicator.Metadata
		if metadata == nil {
			metadata = map[string]any{}
		}
		if indicator.ID != "" {
			metadata["legacyId"] = indicator.ID
		}
		if len(indicator.Tags) > 0 {
			metadata["tags"] = indicator.Tags
		}

		var profileIndicatorID string
		err := tx.QueryRow(ctx, `
			INSERT INTO indicators.indicator_profile_indicator_overrides (
				profile_id,
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
				metadata,
				updated_at
			)
			VALUES (
				$1::uuid,
				$2,
				$3,
				$4,
				$5,
				$6,
				$7,
				$8,
				NULLIF($9, ''),
				NULLIF($10, ''),
				$11,
				$12,
				$13,
				$14,
				$15,
				$16,
				$17,
				true,
				$18,
				$19::jsonb,
				$20::jsonb,
				now()
			)
			ON CONFLICT (profile_id, code) DO UPDATE SET
				category_code = EXCLUDED.category_code,
				category_name = EXCLUDED.category_name,
				name = EXCLUDED.name,
				description = EXCLUDED.description,
				indicator_kind = EXCLUDED.indicator_kind,
				source_kind = EXCLUDED.source_kind,
				source_module = EXCLUDED.source_module,
				source_metric_key = EXCLUDED.source_metric_key,
				scope_mode = EXCLUDED.scope_mode,
				aggregation_mode = EXCLUDED.aggregation_mode,
				value_type = EXCLUDED.value_type,
				evidence_policy = EXCLUDED.evidence_policy,
				weight = EXCLUDED.weight,
				is_enabled = EXCLUDED.is_enabled,
				is_required = EXCLUDED.is_required,
				supports_store_breakdown = EXCLUDED.supports_store_breakdown,
				settings_json = EXCLUDED.settings_json,
				metadata = EXCLUDED.metadata,
				updated_at = now()
			RETURNING id::text
		`,
			profile.RecordID,
			normalizeText(indicator.CategoryCode, 80),
			normalizeText(indicator.CategoryLabel, 160),
			code,
			normalizeText(indicator.Name, 160),
			normalizeText(indicator.Description, 4000),
			normalizeIndicatorKind(indicator.IndicatorKind),
			normalizeSourceKind(indicator.SourceKind),
			normalizeText(indicator.SourceModule, 80),
			normalizeText(indicator.SourceMetricKey, 120),
			normalizeScopeMode(indicator.ScopeMode),
			normalizeAggregationMode(indicator.AggregationMode),
			normalizeValueType(indicator.ValueType),
			normalizeEvidencePolicy(indicator.EvidencePolicy),
			indicator.Weight,
			indicator.Enabled,
			indicator.Required,
			indicator.SupportsStoreBreakdown,
			mustJSONMap(indicator.Settings),
			mustJSONMap(metadata),
		).Scan(&profileIndicatorID)
		if err != nil {
			return nil, err
		}

		keptItemCodes := make([]string, 0, len(indicator.Items))
		for _, item := range indicator.Items {
			itemCode := normalizeText(item.ID, 80)
			if itemCode == "" {
				return nil, ErrInvalidInput
			}
			keptItemCodes = append(keptItemCodes, itemCode)

			itemMetadata := item.Metadata
			if itemMetadata == nil {
				itemMetadata = map[string]any{}
			}
			if item.Helper != "" {
				itemMetadata["helper"] = item.Helper
			}

			if _, err := tx.Exec(ctx, `
				INSERT INTO indicators.indicator_profile_indicator_items (
					profile_indicator_id,
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
					metadata,
					updated_at
				)
				VALUES (
					$1::uuid,
					$2,
					$3,
					'',
					$4,
					$5,
					NULLIF($6, ''),
					$7::jsonb,
					$8,
					true,
					$9,
					$10::jsonb,
					$11::jsonb,
					now()
				)
				ON CONFLICT (profile_indicator_id, code) DO UPDATE SET
					label = EXCLUDED.label,
					input_type = EXCLUDED.input_type,
					evidence_policy = EXCLUDED.evidence_policy,
					source_metric_key = EXCLUDED.source_metric_key,
					select_options_json = EXCLUDED.select_options_json,
					weight = EXCLUDED.weight,
					is_required = EXCLUDED.is_required,
					config_json = EXCLUDED.config_json,
					metadata = EXCLUDED.metadata,
					updated_at = now()
			`,
				profileIndicatorID,
				itemCode,
				normalizeText(item.Label, 160),
				normalizeInputType(item.InputType),
				normalizeEvidencePolicy(item.EvidencePolicy),
				normalizeText(item.SourceMetricKey, 120),
				mustJSONArray(item.SelectOptions),
				item.Weight,
				item.Required,
				mustJSONMap(item.Config),
				mustJSONMap(itemMetadata),
			); err != nil {
				return nil, err
			}
		}

		if len(keptItemCodes) == 0 {
			if _, err := tx.Exec(ctx, `DELETE FROM indicators.indicator_profile_indicator_items WHERE profile_indicator_id = $1::uuid`, profileIndicatorID); err != nil {
				return nil, err
			}
		} else {
			if _, err := tx.Exec(ctx, `
				DELETE FROM indicators.indicator_profile_indicator_items
				WHERE profile_indicator_id = $1::uuid AND NOT (code = ANY($2::text[]))
			`, profileIndicatorID, keptItemCodes); err != nil {
				return nil, err
			}
		}
	}

	if len(keptIndicatorCodes) == 0 {
		if _, err := tx.Exec(ctx, `DELETE FROM indicators.indicator_profile_indicator_overrides WHERE profile_id = $1::uuid`, profile.RecordID); err != nil {
			return nil, err
		}
	} else {
		if _, err := tx.Exec(ctx, `
			DELETE FROM indicators.indicator_profile_indicator_overrides
			WHERE profile_id = $1::uuid AND NOT (code = ANY($2::text[]))
		`, profile.RecordID, keptIndicatorCodes); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	updatedProfile, err := s.getActiveProfileRow(ctx, tenantUUID)
	if err != nil {
		return nil, err
	}

	return s.loadActiveProfileResponse(ctx, tenantUUID, clientName, updatedProfile)
}

func (s *Service) GetStoreOverride(ctx context.Context, input GetStoreOverrideInput) (*StoreOverrideView, error) {
	tenantUUID, _, _, err := s.resolveTenant(ctx, input.TenantID, input.IsPlatformAdmin, input.ClientID)
	if err != nil {
		return nil, err
	}

	profile, err := s.ensureActiveProfile(ctx, tenantUUID)
	if err != nil {
		return nil, err
	}

	indicators, _, _, err := s.loadProfileIndicators(ctx, profile.RecordID)
	if err != nil {
		return nil, err
	}
	stores, err := s.loadTenantStores(ctx, tenantUUID, profile.RecordID, indicators)
	if err != nil {
		return nil, err
	}

	storeID := normalizeUUID(input.StoreID)
	if storeID == "" {
		storeID = strings.TrimSpace(input.StoreID)
	}
	for _, store := range stores {
		if store.ID == storeID {
			copy := store
			return &copy, nil
		}
	}

	return nil, ErrNotFound
}

func (s *Service) ReplaceStoreOverride(ctx context.Context, input ReplaceStoreOverrideInput) (*StoreOverrideView, error) {
	tenantUUID, _, _, err := s.resolveTenant(ctx, input.TenantID, input.IsPlatformAdmin, input.ClientID)
	if err != nil {
		return nil, err
	}

	profile, err := s.ensureActiveProfile(ctx, tenantUUID)
	if err != nil {
		return nil, err
	}

	indicators, recordIDsByKey, _, err := s.loadProfileIndicators(ctx, profile.RecordID)
	if err != nil {
		return nil, err
	}

	stores, err := s.loadTenantStores(ctx, tenantUUID, profile.RecordID, indicators)
	if err != nil {
		return nil, err
	}

	storeID := normalizeUUID(input.StoreID)
	if storeID == "" {
		storeID = strings.TrimSpace(input.StoreID)
	}

	storeExists := false
	for _, store := range stores {
		if store.ID == storeID {
			storeExists = true
			break
		}
	}
	if !storeExists {
		return nil, ErrNotFound
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `
		DELETE FROM indicators.indicator_profile_store_overrides
		WHERE profile_id = $1::uuid AND unit_external_id = $2
	`, profile.RecordID, storeID); err != nil {
		return nil, err
	}

	for _, rule := range input.Rules {
		profileIndicatorID := recordIDsByKey[strings.TrimSpace(rule.IndicatorID)]
		if profileIndicatorID == "" {
			continue
		}
		if rule.Enabled == nil && rule.Weight == nil && strings.TrimSpace(rule.Note) == "" && len(rule.Metadata) == 0 {
			continue
		}

		metadata := rule.Metadata
		if metadata == nil {
			metadata = map[string]any{}
		}
		if input.Note != "" {
			metadata["storeNote"] = input.Note
		}
		if input.Status != "" {
			metadata["storeStatus"] = input.Status
		}
		if input.Score != nil {
			metadata["storeScore"] = *input.Score
		}
		if rule.Note != "" {
			metadata["note"] = rule.Note
		}

		if _, err := tx.Exec(ctx, `
			INSERT INTO indicators.indicator_profile_store_overrides (
				profile_id,
				profile_indicator_id,
				unit_external_id,
				unit_code,
				unit_name,
				scope_mode,
				weight,
				is_enabled,
				settings_json,
				metadata
			)
			VALUES ($1::uuid, $2::uuid, $3, '', '', $4, $5, $6, '{}'::jsonb, $7::jsonb)
		`,
			profile.RecordID,
			profileIndicatorID,
			storeID,
			normalizeScopeMode(input.ScopeMode),
			rule.Weight,
			rule.Enabled,
			mustJSONMap(metadata),
		); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return s.GetStoreOverride(ctx, GetStoreOverrideInput{
		UserID:          input.UserID,
		TenantID:        tenantUUID,
		IsPlatformAdmin: false,
		StoreID:         storeID,
	})
}

func (s *Service) loadActiveProfileResponse(ctx context.Context, tenantUUID, clientName string, profile activeProfileRow) (*ActiveProfileResponse, error) {
	indicators, businessIDs, categories, err := s.loadProfileIndicators(ctx, profile.RecordID)
	if err != nil {
		return nil, err
	}
	targetSets, err := s.loadTargetSets(ctx, profile.RecordID, businessIDs)
	if err != nil {
		return nil, err
	}
	providers, err := s.loadProviderHealth(ctx, profile.RecordID, indicators)
	if err != nil {
		return nil, err
	}
	stores, err := s.loadTenantStores(ctx, tenantUUID, profile.RecordID, indicators)
	if err != nil {
		return nil, err
	}

	configSnapshot := ConfigSnapshot{}
	for _, indicator := range indicators {
		if indicator.Enabled {
			configSnapshot.EnabledIndicators++
			configSnapshot.EnabledWeight += indicator.Weight
		}
		if indicator.SourceKind != "manual" || indicator.SourceModule != "" {
			configSnapshot.ProviderBindings++
		}
		if indicator.EvidencePolicy == "required" {
			configSnapshot.RequiredEvidence++
		}
		for _, item := range indicator.Items {
			if item.EvidencePolicy == "required" {
				configSnapshot.RequiredEvidence++
			}
		}
	}
	configSnapshot.EnabledWeight = roundFloat(configSnapshot.EnabledWeight, 2)

	weightStatus := computeWeightStatus(indicators)
	for _, store := range stores {
		if store.Status == "custom" {
			configSnapshot.CustomStores++
		}
	}

	providerOnlineCount := 0
	var lastSnapshot *time.Time
	for index := range providers {
		if providers[index].Status == "online" {
			providerOnlineCount++
		}
		if providers[index].LastSnapshotAt != nil && (lastSnapshot == nil || providers[index].LastSnapshotAt.After(*lastSnapshot)) {
			lastSnapshot = providers[index].LastSnapshotAt
		}
	}
	lastSyncLabel := formatFreshnessLabel(lastSnapshot)
	if lastSyncLabel == "Sem snapshot recente" {
		lastSyncLabel = formatFreshnessLabel(&profile.UpdatedAt)
	}

	response := &ActiveProfileResponse{
		Summary: ModuleSummary{
			ClientLabel:         clientName,
			ActiveProfileName:   profile.Name,
			TemplateLabel:       stringOrFallback(profile.TemplateLabel, "Template ativo"),
			StoresConfigured:    len(stores),
			ProviderOnlineCount: providerOnlineCount,
			ProviderTotal:       len(providers),
			PendingChanges:      len(weightStatus.BlockingItemTotals),
			LastSyncLabel:       lastSyncLabel,
		},
		ClientLabel: clientName,
		Profile: ActiveProfileInfo{
			RecordID:              profile.RecordID,
			Name:                  profile.Name,
			Description:           profile.Description,
			Status:                profile.Status,
			ScopeMode:             profile.ScopeMode,
			StoreBreakdownEnabled: profile.StoreBreakdownEnabled,
			ProviderSyncEnabled:   profile.ProviderSyncEnabled,
			TemplateID:            profile.TemplateID,
			TemplateVersionID:     profile.TemplateVersionID,
			TemplateCode:          profile.TemplateCode,
			TemplateLabel:         profile.TemplateLabel,
			Metadata:              profile.Metadata,
			UpdatedAt:             profile.UpdatedAt,
		},
		Categories:     categories,
		ConfigSnapshot: configSnapshot,
		WeightStatus:   weightStatus,
		Indicators:     indicators,
		Stores:         stores,
		TargetSets:     targetSets,
		Providers:      providers,
	}

	return response, nil
}

func (s *Service) loadProfileIndicators(ctx context.Context, profileID string) ([]ProfileIndicatorConfig, map[string]string, []CategoryOption, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT
			id::text,
			category_code,
			category_name,
			code,
			name,
			COALESCE(description, ''),
			indicator_kind,
			source_kind,
			COALESCE(source_module, ''),
			COALESCE(source_metric_key, ''),
			scope_mode,
			aggregation_mode,
			value_type,
			evidence_policy,
			COALESCE(weight::float8, 0),
			is_enabled,
			is_required,
			supports_store_breakdown,
			settings_json,
			metadata
		FROM indicators.indicator_profile_indicator_overrides
		WHERE profile_id = $1::uuid
		ORDER BY category_code, code
	`, profileID)
	if err != nil {
		return nil, nil, nil, err
	}
	defer rows.Close()

	indicators := []ProfileIndicatorConfig{}
	businessIDs := map[string]string{}
	categorySeen := map[string]bool{}
	categories := []CategoryOption{}
	recordByCode := map[string]*ProfileIndicatorConfig{}

	for rows.Next() {
		var item ProfileIndicatorConfig
		var settingsRaw []byte
		var metadataRaw []byte
		if err := rows.Scan(
			&item.RecordID,
			&item.CategoryCode,
			&item.CategoryLabel,
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
			&item.Enabled,
			&item.Required,
			&item.SupportsStoreBreakdown,
			&settingsRaw,
			&metadataRaw,
		); err != nil {
			return nil, nil, nil, err
		}
		item.Settings = decodeJSONMap(settingsRaw)
		item.Metadata = decodeJSONMap(metadataRaw)
		item.Tags = metadataStringSlice(item.Metadata, "tags")
		item.ID = indicatorBusinessID(item.Code, item.Metadata)
		item.Items = []ProfileItemConfig{}
		indicators = append(indicators, item)
		recordByCode[item.RecordID] = &indicators[len(indicators)-1]
		businessIDs[item.ID] = item.RecordID
		businessIDs[item.Code] = item.RecordID
		if !categorySeen[item.CategoryCode] {
			categorySeen[item.CategoryCode] = true
			categories = append(categories, CategoryOption{Label: item.CategoryLabel, Value: item.CategoryCode})
		}
	}
	if rows.Err() != nil {
		return nil, nil, nil, rows.Err()
	}

	itemRows, err := s.pool.Query(ctx, `
		SELECT
			profile_indicator_id::text,
			id::text,
			code,
			label,
			input_type,
			evidence_policy,
			is_required,
			COALESCE(weight::float8, 0),
			COALESCE(source_metric_key, ''),
			select_options_json,
			config_json,
			metadata
		FROM indicators.indicator_profile_indicator_items
		WHERE profile_indicator_id IN (
			SELECT id FROM indicators.indicator_profile_indicator_overrides WHERE profile_id = $1::uuid
		)
		ORDER BY code
	`, profileID)
	if err != nil {
		return nil, nil, nil, err
	}
	defer itemRows.Close()

	for itemRows.Next() {
		var profileIndicatorID string
		var item ProfileItemConfig
		var selectRaw []byte
		var configRaw []byte
		var metadataRaw []byte
		if err := itemRows.Scan(
			&profileIndicatorID,
			&item.RecordID,
			&item.ID,
			&item.Label,
			&item.InputType,
			&item.EvidencePolicy,
			&item.Required,
			&item.Weight,
			&item.SourceMetricKey,
			&selectRaw,
			&configRaw,
			&metadataRaw,
		); err != nil {
			return nil, nil, nil, err
		}
		var selectOptions []map[string]any
		if err := json.Unmarshal(selectRaw, &selectOptions); err != nil {
			selectOptions = []map[string]any{}
		}
		item.SelectOptions = selectOptions
		item.Config = decodeJSONMap(configRaw)
		item.Metadata = decodeJSONMap(metadataRaw)
		item.Helper = metadataString(item.Metadata, "helper")
		if indicator := recordByCode[profileIndicatorID]; indicator != nil {
			indicator.Items = append(indicator.Items, item)
		}
	}
	if itemRows.Err() != nil {
		return nil, nil, nil, itemRows.Err()
	}

	return indicators, businessIDs, categories, nil
}

func (s *Service) loadTargetSets(ctx context.Context, profileID string, businessIDs map[string]string) ([]TargetSetView, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, name, period_kind, starts_at, ends_at, scope_mode, status, metadata
		FROM indicators.indicator_target_sets
		WHERE profile_id = $1::uuid
		ORDER BY starts_at NULLS LAST, name
	`, profileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sets := []TargetSetView{}
	byID := map[string]*TargetSetView{}
	for rows.Next() {
		var item TargetSetView
		var startsAt *time.Time
		var endsAt *time.Time
		var metadataRaw []byte
		if err := rows.Scan(&item.RecordID, &item.Name, &item.PeriodKind, &startsAt, &endsAt, &item.ScopeMode, &item.Status, &metadataRaw); err != nil {
			return nil, err
		}
		if startsAt != nil {
			item.StartsAt = startsAt.Format("2006-01-02")
		}
		if endsAt != nil {
			item.EndsAt = endsAt.Format("2006-01-02")
		}
		item.Metadata = decodeJSONMap(metadataRaw)
		item.Items = []TargetItemView{}
		sets = append(sets, item)
		byID[item.RecordID] = &sets[len(sets)-1]
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}

	itemRows, err := s.pool.Query(ctx, `
		SELECT id::text, target_set_id::text, profile_indicator_id::text, COALESCE(category_code, ''), COALESCE(unit_external_id, ''), target_value_numeric::float8, COALESCE(target_value_text, ''), target_value_json, comparator, COALESCE(weight::float8, 0), metadata
		FROM indicators.indicator_target_items
		WHERE target_set_id IN (
			SELECT id FROM indicators.indicator_target_sets WHERE profile_id = $1::uuid
		)
		ORDER BY created_at
	`, profileID)
	if err != nil {
		return nil, err
	}
	defer itemRows.Close()

	reverseIndicators := map[string]string{}
	for key, value := range businessIDs {
		if len(value) > 0 {
			reverseIndicators[value] = key
		}
	}

	for itemRows.Next() {
		var targetSetID string
		var profileIndicatorID *string
		var item TargetItemView
		var valueJSONRaw []byte
		var metadataRaw []byte
		if err := itemRows.Scan(
			&item.RecordID,
			&targetSetID,
			&profileIndicatorID,
			&item.CategoryCode,
			&item.UnitExternalID,
			&item.TargetValueNumeric,
			&item.TargetValueText,
			&valueJSONRaw,
			&item.Comparator,
			&item.Weight,
			&metadataRaw,
		); err != nil {
			return nil, err
		}
		item.TargetValueJSON = decodeJSONMap(valueJSONRaw)
		item.Metadata = decodeJSONMap(metadataRaw)
		if profileIndicatorID != nil {
			item.IndicatorID = reverseIndicators[*profileIndicatorID]
		}
		if targetSet := byID[targetSetID]; targetSet != nil {
			targetSet.Items = append(targetSet.Items, item)
		}
	}
	if itemRows.Err() != nil {
		return nil, itemRows.Err()
	}

	return sets, nil
}

func (s *Service) loadProviderHealth(ctx context.Context, profileID string, indicators []ProfileIndicatorConfig) ([]ProviderHealth, error) {
	type providerAggregate struct {
		Name             string
		SourceModule     string
		MappedIndicators []string
		LastSnapshotAt   *time.Time
		UnitsCount       int
	}

	providersMap := map[string]*providerAggregate{}
	for _, indicator := range indicators {
		if indicator.SourceKind == "manual" && strings.TrimSpace(indicator.SourceModule) == "" {
			continue
		}
		providerKey := stringOrFallback(indicator.SourceModule, indicator.Code)
		aggregate := providersMap[providerKey]
		if aggregate == nil {
			aggregate = &providerAggregate{
				Name:             stringOrFallback(indicator.SourceModule, indicator.Name),
				SourceModule:     stringOrFallback(indicator.SourceModule, indicator.Code),
				MappedIndicators: []string{},
			}
			providersMap[providerKey] = aggregate
		}
		aggregate.MappedIndicators = append(aggregate.MappedIndicators, indicator.Code)
	}

	if len(providersMap) == 0 {
		return []ProviderHealth{}, nil
	}

	rows, err := s.pool.Query(ctx, `
		SELECT
			COALESCE(source_module, ''),
			MAX(snapshot_at),
			COUNT(DISTINCT COALESCE(unit_external_id, 'global'))
		FROM indicators.indicator_metric_snapshots
		WHERE profile_indicator_id IN (
			SELECT id FROM indicators.indicator_profile_indicator_overrides WHERE profile_id = $1::uuid
		)
		GROUP BY COALESCE(source_module, '')
	`, profileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var sourceModule string
		var lastSnapshotAt *time.Time
		var unitsCount int
		if err := rows.Scan(&sourceModule, &lastSnapshotAt, &unitsCount); err != nil {
			return nil, err
		}
		if aggregate := providersMap[sourceModule]; aggregate != nil {
			aggregate.LastSnapshotAt = lastSnapshotAt
			aggregate.UnitsCount = unitsCount
		}
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}

	keys := make([]string, 0, len(providersMap))
	for key := range providersMap {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	providers := make([]ProviderHealth, 0, len(keys))
	for index, key := range keys {
		aggregate := providersMap[key]
		providers = append(providers, ProviderHealth{
			ID:               fmt.Sprintf("provider-%d", index+1),
			Name:             aggregate.Name,
			SourceModule:     aggregate.SourceModule,
			Status:           providerStatusFromFreshness(aggregate.LastSnapshotAt),
			FreshnessLabel:   formatFreshnessLabel(aggregate.LastSnapshotAt),
			CoverageLabel:    fmt.Sprintf("%d indicador(es), %d unidade(s) com snapshot", len(aggregate.MappedIndicators), aggregate.UnitsCount),
			MappedIndicators: aggregate.MappedIndicators,
			Note:             fmt.Sprintf("Fonte %s mapeada no perfil ativo.", aggregate.SourceModule),
			LastSnapshotAt:   aggregate.LastSnapshotAt,
		})
	}

	return providers, nil
}

func (s *Service) loadTenantStores(ctx context.Context, tenantUUID, profileID string, indicators []ProfileIndicatorConfig) ([]StoreOverrideView, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, store_name, sort_order
		FROM platform_core.tenant_store_charges
		WHERE tenant_id = $1::uuid
		ORDER BY sort_order, store_name
	`, tenantUUID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	scoreMap := map[string]float64{}
	scoreRows, err := s.pool.Query(ctx, `
		SELECT COALESCE(unit_external_id, ''), COALESCE(AVG(COALESCE(overall_score, 0))::float8, 0)
		FROM indicators.indicator_evaluations
		WHERE tenant_id = $1::uuid AND status = 'completed'
		GROUP BY COALESCE(unit_external_id, '')
	`, tenantUUID)
	if err != nil {
		return nil, err
	}
	defer scoreRows.Close()
	for scoreRows.Next() {
		var unitExternalID string
		var score float64
		if err := scoreRows.Scan(&unitExternalID, &score); err != nil {
			return nil, err
		}
		scoreMap[unitExternalID] = roundFloat(score, 2)
	}
	if scoreRows.Err() != nil {
		return nil, scoreRows.Err()
	}

	type storeRuleRow struct {
		UnitExternalID string
		IndicatorCode  string
		IndicatorName  string
		IndicatorID    string
		Enabled        *bool
		Weight         *float64
		Metadata       map[string]any
	}

	ruleRows, err := s.pool.Query(ctx, `
		SELECT
			pso.unit_external_id,
			pio.code,
			pio.name,
			pio.metadata,
			pso.is_enabled,
			pso.weight::float8,
			pso.metadata
		FROM indicators.indicator_profile_store_overrides pso
		JOIN indicators.indicator_profile_indicator_overrides pio ON pio.id = pso.profile_indicator_id
		WHERE pso.profile_id = $1::uuid
	`, profileID)
	if err != nil {
		return nil, err
	}
	defer ruleRows.Close()

	rulesByStore := map[string][]storeRuleRow{}
	for ruleRows.Next() {
		var unitExternalID string
		var indicatorCode string
		var indicatorName string
		var indicatorMetadataRaw []byte
		var enabled *bool
		var weight *float64
		var overrideMetadataRaw []byte
		if err := ruleRows.Scan(&unitExternalID, &indicatorCode, &indicatorName, &indicatorMetadataRaw, &enabled, &weight, &overrideMetadataRaw); err != nil {
			return nil, err
		}
		indicatorMetadata := decodeJSONMap(indicatorMetadataRaw)
		rulesByStore[unitExternalID] = append(rulesByStore[unitExternalID], storeRuleRow{
			UnitExternalID: unitExternalID,
			IndicatorCode:  indicatorCode,
			IndicatorName:  indicatorName,
			IndicatorID:    indicatorBusinessID(indicatorCode, indicatorMetadata),
			Enabled:        enabled,
			Weight:         weight,
			Metadata:       decodeJSONMap(overrideMetadataRaw),
		})
	}
	if ruleRows.Err() != nil {
		return nil, ruleRows.Err()
	}

	stores := []StoreOverrideView{}
	index := 0
	for rows.Next() {
		var storeID string
		var storeName string
		var sortOrder int
		if err := rows.Scan(&storeID, &storeName, &sortOrder); err != nil {
			return nil, err
		}
		index++
		store := StoreOverrideView{
			ID:          storeID,
			UnitName:    storeName,
			AccentColor: accentColorForIndex(index - 1),
			ManagerName: "Operacao",
			Ranking:     index,
			Score:       scoreMap[storeID],
			ScopeMode:   "per_store",
			Status:      "inherit",
			Note:        "",
			Overrides:   []StoreOverrideRule{},
		}

		customRules := rulesByStore[storeID]
		customRuleByIndicator := map[string]storeRuleRow{}
		for _, rule := range customRules {
			customRuleByIndicator[rule.IndicatorCode] = rule
		}

		for _, indicator := range indicators {
			ruleView := StoreOverrideRule{ID: indicator.ID, Label: indicator.Name, Changed: false}
			if custom, ok := customRuleByIndicator[indicator.Code]; ok {
				ruleView.Enabled = custom.Enabled
				ruleView.Weight = custom.Weight
				ruleView.Note = metadataString(custom.Metadata, "note")
				ruleView.Changed = true
				store.Status = "custom"
				if store.Note == "" {
					store.Note = metadataString(custom.Metadata, "storeNote")
				}
			}
			store.Overrides = append(store.Overrides, ruleView)
		}

		stores = append(stores, store)
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}

	return stores, nil
}
