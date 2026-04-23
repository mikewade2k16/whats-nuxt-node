package indicators

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

func (s *Service) GetGovernanceOverview(ctx context.Context, input GetGovernanceInput) (*GovernanceOverview, error) {
	if !input.IsPlatformAdmin {
		return nil, ErrForbidden
	}

	activeTemplates, draftTemplates, err := s.loadGovernanceTemplateCounts(ctx)
	if err != nil {
		return nil, err
	}

	policies, err := s.loadGovernancePolicies(ctx)
	if err != nil {
		return nil, err
	}

	providers, err := s.loadGovernanceProviders(ctx)
	if err != nil {
		return nil, err
	}

	tenantAdoption, err := s.loadGovernanceTenantAdoption(ctx)
	if err != nil {
		return nil, err
	}

	roadmap, err := s.loadGovernanceRoadmap(ctx)
	if err != nil {
		return nil, err
	}

	driftCount, err := s.loadGovernancePolicyDriftCount(ctx, policies)
	if err != nil {
		return nil, err
	}

	stableCount := 0
	rollingCount := 0
	pilotCount := 0
	for _, tenant := range tenantAdoption {
		switch tenant.RolloutStatus {
		case "stable":
			stableCount++
		case "rolling":
			rollingCount++
		default:
			pilotCount++
		}
	}

	providerOnlineCount := 0
	for _, provider := range providers {
		if provider.Status == "online" {
			providerOnlineCount++
		}
	}

	providerTone := "neutral"
	providerHelper := "Sem provider derivado configurado"
	if len(providers) > 0 {
		if providerOnlineCount == len(providers) {
			providerTone = "success"
			providerHelper = "Todos os providers com snapshot recente"
		} else {
			providerTone = "warning"
			providerHelper = fmt.Sprintf("%d provider(es) com atraso ou sem snapshot recente", len(providers)-providerOnlineCount)
		}
	}

	driftTone := "success"
	if driftCount > 0 {
		driftTone = "warning"
	}

	stats := []GovernanceStat{
		{
			ID:     "templates",
			Label:  "Templates ativos",
			Value:  fmt.Sprintf("%d", activeTemplates),
			Helper: fmt.Sprintf("%d ativo(s) • %d em draft", activeTemplates, draftTemplates),
			Tone:   ternaryTone(activeTemplates > 0, "success", "warning"),
		},
		{
			ID:     "clients",
			Label:  "Clientes em rollout",
			Value:  fmt.Sprintf("%d", len(tenantAdoption)),
			Helper: fmt.Sprintf("%d estavel(is) • %d rolling • %d piloto(s)", stableCount, rollingCount, pilotCount),
			Tone:   ternaryTone(len(tenantAdoption) > 0, "neutral", "warning"),
		},
		{
			ID:     "providers",
			Label:  "Providers homologados",
			Value:  fmt.Sprintf("%d/%d", providerOnlineCount, len(providers)),
			Helper: providerHelper,
			Tone:   providerTone,
		},
		{
			ID:     "policy-drift",
			Label:  "Drift de politicas",
			Value:  fmt.Sprintf("%d", driftCount),
			Helper: "Desvios reais frente ao escopo default e ao limite de override por loja",
			Tone:   driftTone,
		},
	}

	return &GovernanceOverview{
		Stats:          stats,
		Policies:       policies,
		Providers:      providers,
		TenantAdoption: tenantAdoption,
		Roadmap:        roadmap,
	}, nil
}

func (s *Service) UpdateGovernancePolicy(ctx context.Context, input UpdateGovernancePolicyInput) (*GovernancePolicy, error) {
	if !input.IsPlatformAdmin {
		return nil, ErrForbidden
	}

	policyID := normalizeText(input.PolicyID, 80)
	if policyID == "" {
		return nil, ErrInvalidInput
	}

	var item GovernancePolicy
	err := s.pool.QueryRow(ctx, `
		UPDATE indicators.indicator_governance_policies
		SET state = $2, updated_at = now()
		WHERE code = $1
		RETURNING code, title, description, state, value, affected_area
	`, policyID, normalizeGovernancePolicyState(input.State)).Scan(
		&item.ID,
		&item.Title,
		&item.Description,
		&item.State,
		&item.Value,
		&item.AffectedArea,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}

	return &item, nil
}

func (s *Service) loadGovernanceTemplateCounts(ctx context.Context) (int, int, error) {
	var activeCount int
	var draftCount int
	err := s.pool.QueryRow(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE status = 'active')::int,
			COUNT(*) FILTER (WHERE status = 'draft')::int
		FROM indicators.indicator_templates
	`).Scan(&activeCount, &draftCount)
	if err != nil {
		return 0, 0, err
	}

	return activeCount, draftCount, nil
}

func (s *Service) loadGovernancePolicies(ctx context.Context) ([]GovernancePolicy, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT code, title, description, state, value, affected_area
		FROM indicators.indicator_governance_policies
		ORDER BY code
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []GovernancePolicy{}
	for rows.Next() {
		var item GovernancePolicy
		if err := rows.Scan(&item.ID, &item.Title, &item.Description, &item.State, &item.Value, &item.AffectedArea); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}

	return items, nil
}

func (s *Service) loadGovernanceProviders(ctx context.Context) ([]ProviderHealth, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT
			COALESCE(pio.source_module, ''),
			MAX(ims.snapshot_at),
			COUNT(DISTINCT pio.code)::int,
			COUNT(DISTINCT COALESCE(ims.store_id::text, 'global')) FILTER (WHERE ims.id IS NOT NULL)::int,
			ARRAY_REMOVE(ARRAY_AGG(DISTINCT pio.code), NULL)
		FROM indicators.indicator_profiles p
		JOIN indicators.indicator_profile_indicator_overrides pio ON pio.profile_id = p.id
		LEFT JOIN indicators.indicator_metric_snapshots ims ON ims.profile_indicator_id = pio.id
		WHERE p.status = 'active'
		  AND pio.is_enabled = true
		  AND COALESCE(pio.source_module, '') <> ''
		GROUP BY COALESCE(pio.source_module, '')
		ORDER BY COALESCE(pio.source_module, '')
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	providers := []ProviderHealth{}
	index := 0
	for rows.Next() {
		index++
		var sourceModule string
		var lastSnapshotAt *time.Time
		var indicatorCount int
		var unitsCount int
		var mappedIndicators []string
		if err := rows.Scan(&sourceModule, &lastSnapshotAt, &indicatorCount, &unitsCount, &mappedIndicators); err != nil {
			return nil, err
		}

		providers = append(providers, ProviderHealth{
			ID:               fmt.Sprintf("provider-%d", index),
			Name:             providerDisplayName(sourceModule),
			SourceModule:     sourceModule,
			Status:           providerStatusFromFreshness(lastSnapshotAt),
			FreshnessLabel:   formatFreshnessLabel(lastSnapshotAt),
			CoverageLabel:    fmt.Sprintf("%d indicador(es), %d unidade(s) com snapshot", indicatorCount, unitsCount),
			MappedIndicators: mappedIndicators,
			Note:             fmt.Sprintf("Fonte %s mapeada na governanca global.", sourceModule),
			LastSnapshotAt:   lastSnapshotAt,
		})
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}

	return providers, nil
}

func (s *Service) loadGovernanceTenantAdoption(ctx context.Context) ([]GovernanceTenantAdoption, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT
			t.id::text,
			t.name,
			t.timezone,
			p.scope_mode,
			COALESCE(template.name, ''),
			COALESCE(version.version_number, 0),
			p.updated_at,
			COALESCE(evaluations.completed_count, 0),
			COALESCE(providers.total_providers, 0),
			COALESCE(providers.online_providers, 0)
		FROM platform_core.tenants t
		JOIN platform_core.modules m ON m.code = 'indicators' AND m.is_active = true
		JOIN platform_core.tenant_modules tm ON tm.tenant_id = t.id AND tm.module_id = m.id AND tm.status = 'active'
		JOIN LATERAL (
			SELECT id, scope_mode, template_id, template_version_id, updated_at
			FROM indicators.indicator_profiles
			WHERE tenant_id = t.id AND status = 'active'
			ORDER BY updated_at DESC
			LIMIT 1
		) p ON true
		LEFT JOIN indicators.indicator_templates template ON template.id = p.template_id
		LEFT JOIN indicators.indicator_template_versions version ON version.id = p.template_version_id
		LEFT JOIN LATERAL (
			SELECT COUNT(*)::int AS completed_count
			FROM indicators.indicator_evaluations e
			WHERE e.tenant_id = t.id AND e.status = 'completed'
		) evaluations ON true
		LEFT JOIN LATERAL (
			SELECT
				COUNT(*)::int AS total_providers,
				COUNT(*) FILTER (WHERE last_snapshot_at IS NOT NULL AND last_snapshot_at >= now() - interval '24 hours')::int AS online_providers
			FROM (
				SELECT pio.source_module, MAX(ims.snapshot_at) AS last_snapshot_at
				FROM indicators.indicator_profile_indicator_overrides pio
				LEFT JOIN indicators.indicator_metric_snapshots ims ON ims.profile_indicator_id = pio.id
				WHERE pio.profile_id = p.id
				  AND pio.is_enabled = true
				  AND COALESCE(pio.source_module, '') <> ''
				GROUP BY pio.source_module
			) provider_status
		) providers ON true
		WHERE t.deleted_at IS NULL
		ORDER BY t.name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []GovernanceTenantAdoption{}
	for rows.Next() {
		var tenantID string
		var tenantName string
		var timezone string
		var scopeMode string
		var templateName string
		var versionNumber int
		var updatedAt time.Time
		var completedCount int
		var totalProviders int
		var onlineProviders int
		if err := rows.Scan(
			&tenantID,
			&tenantName,
			&timezone,
			&scopeMode,
			&templateName,
			&versionNumber,
			&updatedAt,
			&completedCount,
			&totalProviders,
			&onlineProviders,
		); err != nil {
			return nil, err
		}

		activeTemplate := stringOrFallback(templateName, "Sem template publicado")
		if versionNumber > 0 && templateName != "" {
			activeTemplate = fmt.Sprintf("%s v%d", templateName, versionNumber)
		}

		providerCoverage := "Sem provider configurado"
		if totalProviders > 0 {
			providerCoverage = fmt.Sprintf("%d/%d providers online", onlineProviders, totalProviders)
		}

		items = append(items, GovernanceTenantAdoption{
			ID:               tenantID,
			ClientLabel:      tenantName,
			ActiveTemplate:   activeTemplate,
			ScopeMode:        normalizeScopeMode(scopeMode),
			RolloutStatus:    governanceRolloutStatus(completedCount, totalProviders, onlineProviders),
			ProviderCoverage: providerCoverage,
			LastChangeLabel:  formatGovernanceChangeLabel(updatedAt, timezone),
		})
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}

	return items, nil
}

func (s *Service) loadGovernanceRoadmap(ctx context.Context) ([]GovernanceRoadmapItem, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT code, title, description, stage, owner_name, dependencies
		FROM indicators.indicator_governance_roadmap_items
		WHERE is_active = true
		ORDER BY sort_order, code
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []GovernanceRoadmapItem{}
	for rows.Next() {
		var item GovernanceRoadmapItem
		var dependenciesRaw []byte
		if err := rows.Scan(&item.ID, &item.Title, &item.Description, &item.Stage, &item.Owner, &dependenciesRaw); err != nil {
			return nil, err
		}
		item.Stage = normalizeRoadmapStage(item.Stage)
		item.Dependencies = decodeStringSlice(dependenciesRaw)
		items = append(items, item)
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}

	return items, nil
}

func (s *Service) loadGovernancePolicyDriftCount(ctx context.Context, policies []GovernancePolicy) (int, error) {
	scopeDefault := ""
	storeOverrideLimit := 0
	for _, policy := range policies {
		switch policy.ID {
		case "scope-default":
			scopeDefault = normalizeScopeMode(policy.Value)
		case "store-override-limit":
			storeOverrideLimit = parseFirstInt(policy.Value, 0)
		}
	}

	driftCount := 0
	if scopeDefault != "" {
		var scopeDrift int
		if err := s.pool.QueryRow(ctx, `
			SELECT COUNT(*)::int
			FROM indicators.indicator_profiles
			WHERE status = 'active' AND scope_mode <> $1
		`, scopeDefault).Scan(&scopeDrift); err != nil {
			return 0, err
		}
		driftCount += scopeDrift
	}

	if storeOverrideLimit > 0 {
		var overrideDrift int
		if err := s.pool.QueryRow(ctx, `
			SELECT COUNT(*)::int
			FROM (
				SELECT profile_id, store_id
				FROM indicators.indicator_profile_store_overrides
				GROUP BY profile_id, store_id
				HAVING COUNT(*) > $1
			) drift
		`, storeOverrideLimit).Scan(&overrideDrift); err != nil {
			return 0, err
		}
		driftCount += overrideDrift
	}

	return driftCount, nil
}

func governanceRolloutStatus(completedCount, totalProviders, onlineProviders int) string {
	if completedCount >= 10 && totalProviders > 0 && onlineProviders == totalProviders {
		return "stable"
	}
	if completedCount > 0 || onlineProviders > 0 {
		return "rolling"
	}
	return "pilot"
}

func ternaryTone(condition bool, whenTrue, whenFalse string) string {
	if condition {
		return whenTrue
	}
	return whenFalse
}
