package observability

import (
	"context"
	"time"
)

type MetricEventInput struct {
	PageKey    string         `json:"pageKey"`
	PagePath   string         `json:"pagePath"`
	EventType  string         `json:"eventType"`
	EventKey   string         `json:"eventKey"`
	StoreID    string         `json:"storeId,omitempty"`
	Status     string         `json:"status"`
	Severity   string         `json:"severity,omitempty"`
	DurationMs int            `json:"durationMs,omitempty"`
	Summary    string         `json:"summary,omitempty"`
	Metrics    map[string]any `json:"metrics,omitempty"`
	Metadata   map[string]any `json:"metadata,omitempty"`
}

type MetricEvent struct {
	ID          string         `json:"id"`
	PageKey     string         `json:"pageKey"`
	PagePath    string         `json:"pagePath"`
	EventType   string         `json:"eventType"`
	EventKey    string         `json:"eventKey"`
	TenantID    string         `json:"tenantId,omitempty"`
	StoreID     string         `json:"storeId,omitempty"`
	ActorUserID string         `json:"actorUserId,omitempty"`
	ActorRole   string         `json:"actorRole,omitempty"`
	Status      string         `json:"status"`
	Severity    string         `json:"severity"`
	DurationMs  int            `json:"durationMs"`
	Summary     string         `json:"summary"`
	Metrics     map[string]any `json:"metrics"`
	Metadata    map[string]any `json:"metadata"`
	CreatedAt   time.Time      `json:"createdAt"`
}

type ListFilters struct {
	PageKey   string
	PagePath  string
	EventType string
	EventKey  string
	Status    string
	StoreID   string
	Limit     int
}

type EventAggregate struct {
	EventKey      string  `json:"eventKey"`
	EventType     string  `json:"eventType"`
	Total         int     `json:"total"`
	Ok            int     `json:"ok"`
	Error         int     `json:"error"`
	AvgDurationMs float64 `json:"avgDurationMs"`
	MaxDurationMs int     `json:"maxDurationMs"`
	LastStatus    string  `json:"lastStatus"`
	LastSeenAt    string  `json:"lastSeenAt"`
}

type MetricsSummary struct {
	TotalEvents        int              `json:"totalEvents"`
	OkEvents           int              `json:"okEvents"`
	ErrorEvents        int              `json:"errorEvents"`
	AvgDurationMs      float64          `json:"avgDurationMs"`
	MaxDurationMs      int              `json:"maxDurationMs"`
	SlowEvents         int              `json:"slowEvents"`
	LastEventAt        string           `json:"lastEventAt,omitempty"`
	Aggregates         []EventAggregate `json:"aggregates"`
	ActionCoverage     []ActionCoverage `json:"actionCoverage"`
	SecurityChecklist  []ChecklistItem  `json:"securityChecklist"`
	DevelopmentSignals []ChecklistItem  `json:"developmentSignals"`
}

type ActionCoverage struct {
	Key        string `json:"key"`
	Label      string `json:"label"`
	Kind       string `json:"kind"`
	Endpoint   string `json:"endpoint,omitempty"`
	Risk       string `json:"risk"`
	Measured   bool   `json:"measured"`
	LastStatus string `json:"lastStatus,omitempty"`
	LastSeenAt string `json:"lastSeenAt,omitempty"`
	TargetMs   int    `json:"targetMs"`
}

type ChecklistItem struct {
	Key      string `json:"key"`
	Label    string `json:"label"`
	Status   string `json:"status"`
	Severity string `json:"severity"`
	Evidence string `json:"evidence"`
}

type ListResponse struct {
	Items   []MetricEvent  `json:"items"`
	Summary MetricsSummary `json:"summary"`
}

type CreateResponse struct {
	OK      bool        `json:"ok"`
	EventID string      `json:"eventId"`
	Event   MetricEvent `json:"event"`
}

type Repository interface {
	Insert(ctx context.Context, event MetricEvent) (MetricEvent, error)
	List(ctx context.Context, access AccessContext, filters ListFilters) ([]MetricEvent, error)
}
