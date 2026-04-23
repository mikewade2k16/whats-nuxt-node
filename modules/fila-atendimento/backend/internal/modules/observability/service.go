package observability

import (
	"context"
	"sort"
	"strings"
	"time"
)

const (
	defaultLimit = 100
	maxLimit     = 200
	slowEventMs  = 1000
)

type Service struct {
	repository Repository
}

func NewService(repository Repository) *Service {
	return &Service{repository: repository}
}

func (service *Service) Record(ctx context.Context, access AccessContext, input MetricEventInput) (MetricEvent, error) {
	if service == nil || service.repository == nil {
		return MetricEvent{}, ErrValidation
	}

	if !canWriteMetrics(access.Role) {
		return MetricEvent{}, ErrForbidden
	}

	event, err := normalizeInput(access, input)
	if err != nil {
		return MetricEvent{}, err
	}

	return service.repository.Insert(ctx, event)
}

func (service *Service) List(ctx context.Context, access AccessContext, filters ListFilters) (ListResponse, error) {
	if service == nil || service.repository == nil {
		return ListResponse{}, ErrValidation
	}

	if !canReadMetrics(access.Role) {
		return ListResponse{}, ErrForbidden
	}

	filters = normalizeFilters(filters)
	events, err := service.repository.List(ctx, access, filters)
	if err != nil {
		return ListResponse{}, err
	}

	return ListResponse{
		Items:   events,
		Summary: buildSummary(events),
	}, nil
}

func normalizeInput(access AccessContext, input MetricEventInput) (MetricEvent, error) {
	pageKey := limitText(input.PageKey, 120)
	eventType := limitText(input.EventType, 60)
	eventKey := limitText(input.EventKey, 160)

	if pageKey == "" || eventType == "" || eventKey == "" {
		return MetricEvent{}, ErrValidation
	}

	status := strings.ToLower(limitText(input.Status, 24))
	if status == "" {
		status = "ok"
	}
	if status != "ok" && status != "error" && status != "warning" {
		status = "ok"
	}

	severity := strings.ToLower(limitText(input.Severity, 24))
	if severity == "" {
		severity = "info"
	}
	if severity != "info" && severity != "warning" && severity != "critical" {
		severity = "info"
	}

	return MetricEvent{
		PageKey:     pageKey,
		PagePath:    limitText(input.PagePath, 240),
		EventType:   eventType,
		EventKey:    eventKey,
		TenantID:    limitText(access.TenantID, 80),
		StoreID:     limitText(input.StoreID, 80),
		ActorUserID: limitText(access.UserID, 80),
		ActorRole:   limitText(access.Role, 60),
		Status:      status,
		Severity:    severity,
		DurationMs:  clampDuration(input.DurationMs),
		Summary:     limitText(input.Summary, 320),
		Metrics:     sanitizeMap(input.Metrics),
		Metadata:    sanitizeMap(input.Metadata),
	}, nil
}

func normalizeFilters(filters ListFilters) ListFilters {
	limit := filters.Limit
	if limit < 1 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}

	return ListFilters{
		PageKey:   limitText(filters.PageKey, 120),
		PagePath:  limitText(filters.PagePath, 240),
		EventType: limitText(filters.EventType, 60),
		EventKey:  limitText(filters.EventKey, 160),
		Status:    limitText(filters.Status, 24),
		StoreID:   limitText(filters.StoreID, 80),
		Limit:     limit,
	}
}

func buildSummary(events []MetricEvent) MetricsSummary {
	summary := MetricsSummary{
		Aggregates:         []EventAggregate{},
		ActionCoverage:     buildActionCoverage(events),
		SecurityChecklist:  buildSecurityChecklist(),
		DevelopmentSignals: buildDevelopmentSignals(),
	}

	if len(events) == 0 {
		return summary
	}

	type aggregateState struct {
		aggregate EventAggregate
		sum       int
		lastSeen  time.Time
	}

	aggregates := map[string]*aggregateState{}

	totalDuration := 0
	for _, event := range events {
		summary.TotalEvents++
		totalDuration += event.DurationMs

		if event.Status == "error" {
			summary.ErrorEvents++
		} else {
			summary.OkEvents++
		}

		if event.DurationMs > summary.MaxDurationMs {
			summary.MaxDurationMs = event.DurationMs
		}

		if event.DurationMs >= slowEventMs {
			summary.SlowEvents++
		}

		if summary.LastEventAt == "" || event.CreatedAt.After(parseTime(summary.LastEventAt)) {
			summary.LastEventAt = event.CreatedAt.Format(time.RFC3339)
		}

		key := event.EventKey
		state := aggregates[key]
		if state == nil {
			state = &aggregateState{
				aggregate: EventAggregate{
					EventKey:  event.EventKey,
					EventType: event.EventType,
				},
			}
			aggregates[key] = state
		}

		state.aggregate.Total++
		state.sum += event.DurationMs
		if event.Status == "error" {
			state.aggregate.Error++
		} else {
			state.aggregate.Ok++
		}
		if event.DurationMs > state.aggregate.MaxDurationMs {
			state.aggregate.MaxDurationMs = event.DurationMs
		}
		if event.CreatedAt.After(state.lastSeen) {
			state.lastSeen = event.CreatedAt
			state.aggregate.LastStatus = event.Status
			state.aggregate.LastSeenAt = event.CreatedAt.Format(time.RFC3339)
		}
	}

	summary.AvgDurationMs = float64(totalDuration) / float64(len(events))

	for _, state := range aggregates {
		if state.aggregate.Total > 0 {
			state.aggregate.AvgDurationMs = float64(state.sum) / float64(state.aggregate.Total)
		}
		summary.Aggregates = append(summary.Aggregates, state.aggregate)
	}

	sort.Slice(summary.Aggregates, func(left, right int) bool {
		return summary.Aggregates[left].EventKey < summary.Aggregates[right].EventKey
	})

	return summary
}

func buildActionCoverage(events []MetricEvent) []ActionCoverage {
	lastByKey := map[string]MetricEvent{}
	for _, event := range events {
		if event.EventType != "action" && event.EventType != "api" && event.EventType != "page_load" && event.EventType != "realtime" {
			continue
		}

		current, exists := lastByKey[event.EventKey]
		if !exists || event.CreatedAt.After(current.CreatedAt) {
			lastByKey[event.EventKey] = event
		}
	}

	catalog := []ActionCoverage{
		{Key: "fila.operacao.page_load", Label: "Carregar página de fila", Kind: "page_load", Risk: "baixo", TargetMs: 1500},
		{Key: "fila.operacao.api.context", Label: "Resolver sessão/contexto", Kind: "api", Endpoint: "GET /v1/me/context", Risk: "baixo", TargetMs: 600},
		{Key: "fila.operacao.api.snapshot", Label: "Carregar snapshot operacional", Kind: "api", Endpoint: "GET /v1/operations/snapshot", Risk: "baixo", TargetMs: 700},
		{Key: "fila.operacao.api.consultants", Label: "Carregar consultores", Kind: "api", Endpoint: "GET /v1/consultants", Risk: "baixo", TargetMs: 700},
		{Key: "fila.operacao.api.settings", Label: "Carregar configurações", Kind: "api", Endpoint: "GET /v1/settings", Risk: "baixo", TargetMs: 700},
		{Key: "fila.operacao.api.overview", Label: "Carregar visão integrada", Kind: "api", Endpoint: "GET /v1/operations/overview", Risk: "baixo", TargetMs: 800},
		{Key: "fila.operacao.action.queue", Label: "Entrar na fila", Kind: "action", Endpoint: "POST /v1/operations/queue", Risk: "medio", TargetMs: 800},
		{Key: "fila.operacao.action.pause", Label: "Pausar consultor", Kind: "action", Endpoint: "POST /v1/operations/pause", Risk: "medio", TargetMs: 800},
		{Key: "fila.operacao.action.assign_task", Label: "Direcionar para tarefa", Kind: "action", Endpoint: "POST /v1/operations/assign-task", Risk: "medio", TargetMs: 800},
		{Key: "fila.operacao.action.resume", Label: "Retomar consultor", Kind: "action", Endpoint: "POST /v1/operations/resume", Risk: "medio", TargetMs: 800},
		{Key: "fila.operacao.action.start", Label: "Iniciar atendimento", Kind: "action", Endpoint: "POST /v1/operations/start", Risk: "alto", TargetMs: 900},
		{Key: "fila.operacao.action.finish", Label: "Salvar e encerrar atendimento", Kind: "action", Endpoint: "POST /v1/operations/finish", Risk: "alto", TargetMs: 1000},
		{Key: "fila.operacao.action.open_finish_modal", Label: "Abrir modal de fechamento", Kind: "action", Risk: "baixo", TargetMs: 300},
		{Key: "fila.operacao.realtime.ticket", Label: "Emitir ticket realtime", Kind: "realtime", Endpoint: "POST /realtime-ticket", Risk: "baixo", TargetMs: 500},
	}

	for index := range catalog {
		event, ok := lastByKey[catalog[index].Key]
		if !ok {
			continue
		}

		catalog[index].Measured = true
		catalog[index].LastStatus = event.Status
		catalog[index].LastSeenAt = event.CreatedAt.Format(time.RFC3339)
	}

	return catalog
}

func buildSecurityChecklist() []ChecklistItem {
	return []ChecklistItem{
		{
			Key:      "auth-server-side",
			Label:    "BFF exige acesso ao módulo antes de proxyar a fila",
			Status:   "ok",
			Severity: "info",
			Evidence: "Rotas do BFF chamam requireResolvedFeatureAccess antes do proxy para /core/modules/fila-atendimento.",
		},
		{
			Key:      "session-cookie",
			Label:    "Sessão do módulo em cookie HttpOnly",
			Status:   "ok",
			Severity: "info",
			Evidence: "omni_fila_atendimento_token é definido no servidor com HttpOnly e SameSite=Lax.",
		},
		{
			Key:      "dom-xss",
			Label:    "Página de fila sem v-html/innerHTML no caminho principal",
			Status:   "ok",
			Severity: "info",
			Evidence: "Componentes da operação usam interpolação Vue e bindings controlados.",
		},
		{
			Key:      "security-headers",
			Label:    "Headers de segurança no Caddy, CSP ainda não visível",
			Status:   "warning",
			Severity: "warning",
			Evidence: "Caddyfile define nosniff, SAMEORIGIN, Referrer-Policy e Permissions-Policy; Content-Security-Policy não está visível no repo.",
		},
	}
}

func buildDevelopmentSignals() []ChecklistItem {
	return []ChecklistItem{
		{
			Key:      "thin-bff",
			Label:    "BFF fino sem recompor payload gigante",
			Status:   "ok",
			Severity: "info",
			Evidence: "Rotas do painel repassam filtros e usam endpoints especificos de snapshot, consultants, settings e overview.",
		},
		{
			Key:      "loading-feedback",
			Label:    "Feedback imediato de carregamento e ações",
			Status:   "ok",
			Severity: "info",
			Evidence: "Carga inicial usa loading-state; ações passam a expor commandPending na UI.",
		},
		{
			Key:      "payload-shape",
			Label:    "Snapshot operacional permite histórico opcional",
			Status:   "ok",
			Severity: "info",
			Evidence: "includeHistory=false evita carregar histórico pesado na fila principal.",
		},
	}
}

func canReadMetrics(role string) bool {
	normalized := strings.TrimSpace(role)
	return normalized == RolePlatformAdmin ||
		normalized == RoleOwner ||
		normalized == RoleManager ||
		normalized == RoleAdmin
}

func canWriteMetrics(role string) bool {
	normalized := strings.TrimSpace(role)
	return normalized == RolePlatformAdmin ||
		normalized == RoleOwner ||
		normalized == RoleManager ||
		normalized == RoleAdmin ||
		normalized == RoleConsultant ||
		normalized == RoleStoreTerminal
}

func sanitizeMap(input map[string]any) map[string]any {
	if len(input) == 0 {
		return map[string]any{}
	}

	output := make(map[string]any, len(input))
	for key, value := range input {
		normalizedKey := limitText(key, 80)
		if normalizedKey == "" || looksSensitive(normalizedKey) {
			continue
		}
		output[normalizedKey] = sanitizeValue(value, 0)
	}
	return output
}

func sanitizeValue(value any, depth int) any {
	if depth > 3 {
		return nil
	}

	switch current := value.(type) {
	case string:
		return limitText(current, 300)
	case map[string]any:
		return sanitizeMap(current)
	case []any:
		limit := len(current)
		if limit > 20 {
			limit = 20
		}
		values := make([]any, 0, limit)
		for index := 0; index < limit; index++ {
			values = append(values, sanitizeValue(current[index], depth+1))
		}
		return values
	default:
		return current
	}
}

func looksSensitive(key string) bool {
	normalized := strings.ToLower(strings.TrimSpace(key))
	return strings.Contains(normalized, "token") ||
		strings.Contains(normalized, "secret") ||
		strings.Contains(normalized, "password") ||
		strings.Contains(normalized, "authorization") ||
		strings.Contains(normalized, "cookie")
}

func limitText(value string, limit int) string {
	normalized := strings.TrimSpace(value)
	if limit <= 0 || len(normalized) <= limit {
		return normalized
	}
	return normalized[:limit]
}

func clampDuration(value int) int {
	if value < 0 {
		return 0
	}
	if value > 600000 {
		return 600000
	}
	return value
}

func parseTime(value string) time.Time {
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return time.Time{}
	}
	return parsed
}
