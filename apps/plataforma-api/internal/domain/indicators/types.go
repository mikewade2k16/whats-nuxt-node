package indicators

import "time"

type ModuleSummary struct {
	ClientLabel         string `json:"clientLabel"`
	ActiveProfileName   string `json:"activeProfileName"`
	TemplateLabel       string `json:"templateLabel"`
	StoresConfigured    int    `json:"storesConfigured"`
	ProviderOnlineCount int    `json:"providerOnlineCount"`
	ProviderTotal       int    `json:"providerTotal"`
	PendingChanges      int    `json:"pendingChanges"`
	LastSyncLabel       string `json:"lastSyncLabel"`
}

type CategoryOption struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

type ConfigSnapshot struct {
	EnabledIndicators int     `json:"enabledIndicators"`
	EnabledWeight     float64 `json:"enabledWeight"`
	CustomStores      int     `json:"customStores"`
	ProviderBindings  int     `json:"providerBindings"`
	RequiredEvidence  int     `json:"requiredEvidence"`
}

type BlockingIndicatorTotal struct {
	IndicatorID   string  `json:"indicatorId"`
	IndicatorCode string  `json:"indicatorCode"`
	IndicatorName string  `json:"indicatorName"`
	Total         float64 `json:"total"`
}

type WeightStatus struct {
	HasBlockingIssues  bool                     `json:"hasBlockingIssues"`
	BlockingItemTotals []BlockingIndicatorTotal `json:"blockingItemTotals"`
}

type ActiveProfileInfo struct {
	RecordID              string         `json:"recordId"`
	Name                  string         `json:"name"`
	Description           string         `json:"description"`
	Status                string         `json:"status"`
	ScopeMode             string         `json:"scopeMode"`
	StoreBreakdownEnabled bool           `json:"storeBreakdownEnabled"`
	ProviderSyncEnabled   bool           `json:"providerSyncEnabled"`
	TemplateID            string         `json:"templateId,omitempty"`
	TemplateVersionID     string         `json:"templateVersionId,omitempty"`
	TemplateCode          string         `json:"templateCode,omitempty"`
	TemplateLabel         string         `json:"templateLabel,omitempty"`
	Metadata              map[string]any `json:"metadata,omitempty"`
	UpdatedAt             time.Time      `json:"updatedAt"`
}

type ProfileItemConfig struct {
	RecordID        string           `json:"recordId,omitempty"`
	ID              string           `json:"id"`
	Label           string           `json:"label"`
	InputType       string           `json:"inputType"`
	EvidencePolicy  string           `json:"evidencePolicy"`
	Required        bool             `json:"required"`
	Weight          float64          `json:"weight"`
	Helper          string           `json:"helper,omitempty"`
	SourceMetricKey string           `json:"sourceMetricKey,omitempty"`
	SelectOptions   []map[string]any `json:"selectOptions,omitempty"`
	Config          map[string]any   `json:"config,omitempty"`
	Metadata        map[string]any   `json:"metadata,omitempty"`
}

type ProfileIndicatorConfig struct {
	RecordID               string              `json:"recordId,omitempty"`
	ID                     string              `json:"id"`
	Code                   string              `json:"code"`
	CategoryCode           string              `json:"categoryCode"`
	CategoryLabel          string              `json:"categoryLabel"`
	Name                   string              `json:"name"`
	Description            string              `json:"description"`
	Enabled                bool                `json:"enabled"`
	Weight                 float64             `json:"weight"`
	ScopeMode              string              `json:"scopeMode"`
	SourceKind             string              `json:"sourceKind"`
	SourceModule           string              `json:"sourceModule,omitempty"`
	SourceMetricKey        string              `json:"sourceMetricKey,omitempty"`
	IndicatorKind          string              `json:"indicatorKind,omitempty"`
	AggregationMode        string              `json:"aggregationMode,omitempty"`
	ValueType              string              `json:"valueType"`
	EvidencePolicy         string              `json:"evidencePolicy"`
	SupportsStoreBreakdown bool                `json:"supportsStoreBreakdown"`
	Required               bool                `json:"required"`
	Tags                   []string            `json:"tags"`
	Settings               map[string]any      `json:"settings,omitempty"`
	Metadata               map[string]any      `json:"metadata,omitempty"`
	Items                  []ProfileItemConfig `json:"items"`
}

type StoreOverrideRule struct {
	ID      string   `json:"id"`
	Label   string   `json:"label"`
	Enabled *bool    `json:"enabled,omitempty"`
	Weight  *float64 `json:"weight,omitempty"`
	Note    string   `json:"note"`
	Changed bool     `json:"changed"`
}

type StoreOverrideView struct {
	ID          string              `json:"id"`
	UnitName    string              `json:"unitName"`
	AccentColor string              `json:"accentColor"`
	ManagerName string              `json:"managerName"`
	Ranking     int                 `json:"ranking"`
	Score       float64             `json:"score"`
	ScopeMode   string              `json:"scopeMode"`
	Status      string              `json:"status"`
	Note        string              `json:"note"`
	Overrides   []StoreOverrideRule `json:"overrides"`
}

type TargetItemView struct {
	RecordID           string         `json:"recordId,omitempty"`
	IndicatorID        string         `json:"indicatorId,omitempty"`
	CategoryCode       string         `json:"categoryCode,omitempty"`
	UnitExternalID     string         `json:"unitExternalId,omitempty"`
	TargetValueNumeric *float64       `json:"targetValueNumeric,omitempty"`
	TargetValueText    string         `json:"targetValueText,omitempty"`
	TargetValueJSON    map[string]any `json:"targetValueJson,omitempty"`
	Comparator         string         `json:"comparator"`
	Weight             float64        `json:"weight"`
	Metadata           map[string]any `json:"metadata,omitempty"`
}

type TargetSetView struct {
	RecordID   string           `json:"recordId,omitempty"`
	Name       string           `json:"name"`
	PeriodKind string           `json:"periodKind"`
	StartsAt   string           `json:"startsAt,omitempty"`
	EndsAt     string           `json:"endsAt,omitempty"`
	ScopeMode  string           `json:"scopeMode"`
	Status     string           `json:"status"`
	Metadata   map[string]any   `json:"metadata,omitempty"`
	Items      []TargetItemView `json:"items"`
}

type ProviderHealth struct {
	ID               string     `json:"id"`
	Name             string     `json:"name"`
	SourceModule     string     `json:"sourceModule"`
	Status           string     `json:"status"`
	FreshnessLabel   string     `json:"freshnessLabel"`
	CoverageLabel    string     `json:"coverageLabel"`
	MappedIndicators []string   `json:"mappedIndicators"`
	Note             string     `json:"note"`
	LastSnapshotAt   *time.Time `json:"lastSnapshotAt,omitempty"`
}

type ActiveProfileResponse struct {
	Summary        ModuleSummary            `json:"summary"`
	ClientLabel    string                   `json:"clientLabel"`
	Profile        ActiveProfileInfo        `json:"profile"`
	Categories     []CategoryOption         `json:"categories"`
	ConfigSnapshot ConfigSnapshot           `json:"configSnapshot"`
	WeightStatus   WeightStatus             `json:"weightStatus"`
	Indicators     []ProfileIndicatorConfig `json:"indicators"`
	Stores         []StoreOverrideView      `json:"stores"`
	TargetSets     []TargetSetView          `json:"targetSets"`
	Providers      []ProviderHealth         `json:"providers"`
}

type TemplateVersionSummary struct {
	RecordID      string     `json:"recordId"`
	VersionNumber int        `json:"versionNumber"`
	Status        string     `json:"status"`
	PublishedAt   *time.Time `json:"publishedAt,omitempty"`
	Notes         string     `json:"notes,omitempty"`
	UpdatedAt     time.Time  `json:"updatedAt"`
}

type TemplateItemConfig struct {
	RecordID        string           `json:"recordId,omitempty"`
	ID              string           `json:"id"`
	Label           string           `json:"label"`
	Description     string           `json:"description,omitempty"`
	InputType       string           `json:"inputType"`
	EvidencePolicy  string           `json:"evidencePolicy"`
	SourceMetricKey string           `json:"sourceMetricKey,omitempty"`
	Weight          float64          `json:"weight"`
	Required        bool             `json:"required"`
	SelectOptions   []map[string]any `json:"selectOptions,omitempty"`
	Config          map[string]any   `json:"config,omitempty"`
	Metadata        map[string]any   `json:"metadata,omitempty"`
}

type TemplateIndicatorConfig struct {
	RecordID               string               `json:"recordId,omitempty"`
	ID                     string               `json:"id"`
	Code                   string               `json:"code"`
	Name                   string               `json:"name"`
	Description            string               `json:"description,omitempty"`
	IndicatorKind          string               `json:"indicatorKind"`
	SourceKind             string               `json:"sourceKind"`
	SourceModule           string               `json:"sourceModule,omitempty"`
	SourceMetricKey        string               `json:"sourceMetricKey,omitempty"`
	ScopeMode              string               `json:"scopeMode"`
	AggregationMode        string               `json:"aggregationMode"`
	ValueType              string               `json:"valueType"`
	EvidencePolicy         string               `json:"evidencePolicy"`
	Weight                 float64              `json:"weight"`
	Required               bool                 `json:"required"`
	SupportsStoreBreakdown bool                 `json:"supportsStoreBreakdown"`
	Settings               map[string]any       `json:"settings,omitempty"`
	Metadata               map[string]any       `json:"metadata,omitempty"`
	Items                  []TemplateItemConfig `json:"items"`
}

type TemplateCategoryConfig struct {
	RecordID    string                    `json:"recordId,omitempty"`
	Code        string                    `json:"code"`
	Name        string                    `json:"name"`
	Description string                    `json:"description,omitempty"`
	SortOrder   int                       `json:"sortOrder"`
	Weight      float64                   `json:"weight"`
	ScopeMode   string                    `json:"scopeMode"`
	Metadata    map[string]any            `json:"metadata,omitempty"`
	Indicators  []TemplateIndicatorConfig `json:"indicators"`
}

type TemplateListItem struct {
	RecordID         string                   `json:"recordId"`
	Code             string                   `json:"code"`
	Name             string                   `json:"name"`
	Description      string                   `json:"description,omitempty"`
	Status           string                   `json:"status"`
	TaxonomyVersion  int                      `json:"taxonomyVersion"`
	IsSystem         bool                     `json:"isSystem"`
	DefaultScopeMode string                   `json:"defaultScopeMode"`
	Metadata         map[string]any           `json:"metadata,omitempty"`
	CategoryCount    int                      `json:"categoryCount"`
	IndicatorCount   int                      `json:"indicatorCount"`
	ClientCount      int                      `json:"clientCount"`
	Versions         []TemplateVersionSummary `json:"versions"`
	UpdatedAt        time.Time                `json:"updatedAt"`
}

type TemplateDetail struct {
	TemplateListItem
	WorkingVersion TemplateVersionSummary   `json:"workingVersion"`
	Categories     []TemplateCategoryConfig `json:"categories"`
}

type EvaluationListItem struct {
	ID              string    `json:"id"`
	EvaluatorName   string    `json:"evaluatorName"`
	UnitExternalID  string    `json:"unitExternalId,omitempty"`
	UnitCode        string    `json:"unitCode,omitempty"`
	UnitName        string    `json:"unitName,omitempty"`
	ScopeMode       string    `json:"scopeMode"`
	PeriodStart     string    `json:"periodStart"`
	PeriodEnd       string    `json:"periodEnd"`
	Status          string    `json:"status"`
	OverallScore    float64   `json:"overallScore"`
	TotalWeight     float64   `json:"totalWeight"`
	IndicatorCodes  []string  `json:"indicatorCodes"`
	IndicatorLabels []string  `json:"indicatorLabels"`
	CreatedAt       time.Time `json:"createdAt"`
}

type EvaluationCategoryView struct {
	RecordID string         `json:"recordId"`
	Code     string         `json:"code"`
	Name     string         `json:"name"`
	Score    float64        `json:"score"`
	Weight   float64        `json:"weight"`
	Summary  map[string]any `json:"summary,omitempty"`
	Metadata map[string]any `json:"metadata,omitempty"`
}

type EvaluationItemView struct {
	RecordID       string         `json:"recordId"`
	ProfileItemID  string         `json:"profileItemId,omitempty"`
	Code           string         `json:"code"`
	Label          string         `json:"label"`
	InputType      string         `json:"inputType"`
	EvidencePolicy string         `json:"evidencePolicy"`
	ValueText      string         `json:"valueText,omitempty"`
	ValueNumeric   *float64       `json:"valueNumeric,omitempty"`
	ValueBoolean   *bool          `json:"valueBoolean,omitempty"`
	ValueJSON      map[string]any `json:"valueJson,omitempty"`
	Weight         float64        `json:"weight"`
	Score          float64        `json:"score"`
	Notes          string         `json:"notes,omitempty"`
	ConfigSnapshot map[string]any `json:"configSnapshot,omitempty"`
	Metadata       map[string]any `json:"metadata,omitempty"`
}

type EvaluationIndicatorView struct {
	RecordID           string               `json:"recordId"`
	CategoryRecordID   string               `json:"categoryRecordId,omitempty"`
	ProfileIndicatorID string               `json:"profileIndicatorId,omitempty"`
	Code               string               `json:"code"`
	Name               string               `json:"name"`
	SourceKind         string               `json:"sourceKind"`
	SourceModule       string               `json:"sourceModule,omitempty"`
	ScopeMode          string               `json:"scopeMode"`
	AggregationMode    string               `json:"aggregationMode"`
	ValueType          string               `json:"valueType"`
	EvidencePolicy     string               `json:"evidencePolicy"`
	Score              float64              `json:"score"`
	RawValueNumeric    *float64             `json:"rawValueNumeric,omitempty"`
	Weight             float64              `json:"weight"`
	ConfigSnapshot     map[string]any       `json:"configSnapshot,omitempty"`
	Metadata           map[string]any       `json:"metadata,omitempty"`
	Items              []EvaluationItemView `json:"items"`
}

type MetricSnapshotView struct {
	RecordID       string         `json:"recordId"`
	ProviderName   string         `json:"providerName"`
	SourceModule   string         `json:"sourceModule,omitempty"`
	MetricKey      string         `json:"metricKey"`
	ScopeMode      string         `json:"scopeMode"`
	UnitExternalID string         `json:"unitExternalId,omitempty"`
	SnapshotAt     time.Time      `json:"snapshotAt"`
	ValueNumeric   *float64       `json:"valueNumeric,omitempty"`
	ValueText      string         `json:"valueText,omitempty"`
	ValueJSON      map[string]any `json:"valueJson,omitempty"`
	Metadata       map[string]any `json:"metadata,omitempty"`
}

type AssetView struct {
	RecordID        string         `json:"recordId"`
	AssetKind       string         `json:"assetKind"`
	StorageProvider string         `json:"storageProvider,omitempty"`
	StorageBucket   string         `json:"storageBucket,omitempty"`
	StorageKey      string         `json:"storageKey"`
	FileName        string         `json:"fileName,omitempty"`
	ContentType     string         `json:"contentType,omitempty"`
	FileSizeBytes   int64          `json:"fileSizeBytes,omitempty"`
	UploadedAt      time.Time      `json:"uploadedAt"`
	Metadata        map[string]any `json:"metadata,omitempty"`
}

type EvaluationDetail struct {
	ID             string                    `json:"id"`
	ProfileID      string                    `json:"profileId"`
	TargetSetID    string                    `json:"targetSetId,omitempty"`
	EvaluatorName  string                    `json:"evaluatorName"`
	UnitExternalID string                    `json:"unitExternalId,omitempty"`
	UnitCode       string                    `json:"unitCode,omitempty"`
	UnitName       string                    `json:"unitName,omitempty"`
	ScopeMode      string                    `json:"scopeMode"`
	PeriodStart    string                    `json:"periodStart"`
	PeriodEnd      string                    `json:"periodEnd"`
	Status         string                    `json:"status"`
	OverallScore   float64                   `json:"overallScore"`
	TotalWeight    float64                   `json:"totalWeight"`
	Notes          string                    `json:"notes,omitempty"`
	ConfigSnapshot map[string]any            `json:"configSnapshot,omitempty"`
	Metadata       map[string]any            `json:"metadata,omitempty"`
	CreatedAt      time.Time                 `json:"createdAt"`
	UpdatedAt      time.Time                 `json:"updatedAt"`
	Categories     []EvaluationCategoryView  `json:"categories"`
	Indicators     []EvaluationIndicatorView `json:"indicators"`
	Snapshots      []MetricSnapshotView      `json:"snapshots"`
	Assets         []AssetView               `json:"assets"`
}

type DashboardIndicatorScore struct {
	Code             string  `json:"code"`
	Name             string  `json:"name"`
	Score            float64 `json:"score"`
	EvaluationsCount int     `json:"evaluationsCount"`
	Weight           float64 `json:"weight"`
	Tone             string  `json:"tone"`
}

type DashboardStore struct {
	UnitExternalID   string                    `json:"unitExternalId"`
	UnitCode         string                    `json:"unitCode,omitempty"`
	UnitName         string                    `json:"unitName"`
	AccentColor      string                    `json:"accentColor"`
	EvaluationsCount int                       `json:"evaluationsCount"`
	Score            float64                   `json:"score"`
	UsedWeight       float64                   `json:"usedWeight"`
	ScopeMode        string                    `json:"scopeMode"`
	Tone             string                    `json:"tone"`
	Indicators       []DashboardIndicatorScore `json:"indicators"`
}

type DashboardIndicatorAggregate struct {
	Code             string  `json:"code"`
	Name             string  `json:"name"`
	Score            float64 `json:"score"`
	EvaluationsCount int     `json:"evaluationsCount"`
	Weight           float64 `json:"weight"`
	Tone             string  `json:"tone"`
}

type DashboardResponse struct {
	Summary         ModuleSummary                 `json:"summary"`
	RangeStart      string                        `json:"rangeStart,omitempty"`
	RangeEnd        string                        `json:"rangeEnd,omitempty"`
	EvaluationCount int                           `json:"evaluationCount"`
	Stores          []DashboardStore              `json:"stores"`
	Ranking         []DashboardStore              `json:"ranking"`
	Indicators      []DashboardIndicatorAggregate `json:"indicators"`
}

type AssetUploadIntent struct {
	AssetID             string            `json:"assetId"`
	StorageProvider     string            `json:"storageProvider"`
	StorageBucket       string            `json:"storageBucket,omitempty"`
	StorageKey          string            `json:"storageKey"`
	UploadURL           string            `json:"uploadUrl,omitempty"`
	UploadMethod        string            `json:"uploadMethod"`
	Headers             map[string]string `json:"headers"`
	DirectUploadEnabled bool              `json:"directUploadEnabled"`
}

type GovernanceStat struct {
	ID     string `json:"id"`
	Label  string `json:"label"`
	Value  string `json:"value"`
	Helper string `json:"helper,omitempty"`
	Tone   string `json:"tone,omitempty"`
}

type GovernancePolicy struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Description  string `json:"description"`
	State        string `json:"state"`
	Value        string `json:"value"`
	AffectedArea string `json:"affectedArea"`
}

type GovernanceTenantAdoption struct {
	ID               string `json:"id"`
	ClientLabel      string `json:"clientLabel"`
	ActiveTemplate   string `json:"activeTemplate"`
	ScopeMode        string `json:"scopeMode"`
	RolloutStatus    string `json:"rolloutStatus"`
	ProviderCoverage string `json:"providerCoverage"`
	LastChangeLabel  string `json:"lastChangeLabel"`
}

type GovernanceRoadmapItem struct {
	ID           string   `json:"id"`
	Title        string   `json:"title"`
	Description  string   `json:"description"`
	Stage        string   `json:"stage"`
	Owner        string   `json:"owner"`
	Dependencies []string `json:"dependencies"`
}

type GovernanceOverview struct {
	Stats          []GovernanceStat           `json:"stats"`
	Policies       []GovernancePolicy         `json:"policies"`
	Providers      []ProviderHealth           `json:"providers"`
	TenantAdoption []GovernanceTenantAdoption `json:"tenantAdoption"`
	Roadmap        []GovernanceRoadmapItem    `json:"roadmap"`
}

type TemplateItemInput struct {
	ID              string           `json:"id,omitempty"`
	Code            string           `json:"code,omitempty"`
	Label           string           `json:"label"`
	Description     string           `json:"description,omitempty"`
	InputType       string           `json:"inputType"`
	EvidencePolicy  string           `json:"evidencePolicy"`
	SourceMetricKey string           `json:"sourceMetricKey,omitempty"`
	Weight          float64          `json:"weight"`
	Required        bool             `json:"required"`
	SelectOptions   []map[string]any `json:"selectOptions,omitempty"`
	Config          map[string]any   `json:"config,omitempty"`
	Metadata        map[string]any   `json:"metadata,omitempty"`
}

type GetGovernanceInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
}

type UpdateGovernancePolicyInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	PolicyID        string
	State           string `json:"state"`
}

type TemplateIndicatorInput struct {
	ID                     string              `json:"id,omitempty"`
	Code                   string              `json:"code"`
	Name                   string              `json:"name"`
	Description            string              `json:"description,omitempty"`
	IndicatorKind          string              `json:"indicatorKind,omitempty"`
	SourceKind             string              `json:"sourceKind,omitempty"`
	SourceModule           string              `json:"sourceModule,omitempty"`
	SourceMetricKey        string              `json:"sourceMetricKey,omitempty"`
	ScopeMode              string              `json:"scopeMode,omitempty"`
	AggregationMode        string              `json:"aggregationMode,omitempty"`
	ValueType              string              `json:"valueType,omitempty"`
	EvidencePolicy         string              `json:"evidencePolicy,omitempty"`
	Weight                 float64             `json:"weight"`
	Required               bool                `json:"required"`
	SupportsStoreBreakdown bool                `json:"supportsStoreBreakdown"`
	Settings               map[string]any      `json:"settings,omitempty"`
	Metadata               map[string]any      `json:"metadata,omitempty"`
	Items                  []TemplateItemInput `json:"items"`
}

type TemplateCategoryInput struct {
	Code        string                   `json:"code"`
	Name        string                   `json:"name"`
	Description string                   `json:"description,omitempty"`
	SortOrder   int                      `json:"sortOrder"`
	Weight      float64                  `json:"weight"`
	ScopeMode   string                   `json:"scopeMode,omitempty"`
	Metadata    map[string]any           `json:"metadata,omitempty"`
	Indicators  []TemplateIndicatorInput `json:"indicators"`
}

type TemplateMutationInput struct {
	UserID           string
	IsPlatformAdmin  bool
	TemplateID       string
	Code             string
	Name             string
	Description      string
	Status           string
	TaxonomyVersion  int
	IsSystem         bool
	DefaultScopeMode string
	Metadata         map[string]any
	Notes            string
	Publish          bool
	Categories       []TemplateCategoryInput
}

type ListTemplatesInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	Query           string
	Status          string
	Page            int
	Limit           int
}

type GetTemplateInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	TemplateID      string
}

type GetActiveProfileInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	ClientID        int
}

type ProfileItemInput struct {
	ID              string           `json:"id,omitempty"`
	Label           string           `json:"label"`
	InputType       string           `json:"inputType"`
	EvidencePolicy  string           `json:"evidencePolicy"`
	Required        bool             `json:"required"`
	Weight          float64          `json:"weight"`
	Helper          string           `json:"helper,omitempty"`
	SourceMetricKey string           `json:"sourceMetricKey,omitempty"`
	SelectOptions   []map[string]any `json:"selectOptions,omitempty"`
	Config          map[string]any   `json:"config,omitempty"`
	Metadata        map[string]any   `json:"metadata,omitempty"`
}

type ProfileIndicatorInput struct {
	ID                     string             `json:"id,omitempty"`
	Code                   string             `json:"code"`
	CategoryCode           string             `json:"categoryCode"`
	CategoryLabel          string             `json:"categoryLabel"`
	Name                   string             `json:"name"`
	Description            string             `json:"description,omitempty"`
	Enabled                bool               `json:"enabled"`
	Weight                 float64            `json:"weight"`
	ScopeMode              string             `json:"scopeMode,omitempty"`
	SourceKind             string             `json:"sourceKind,omitempty"`
	SourceModule           string             `json:"sourceModule,omitempty"`
	SourceMetricKey        string             `json:"sourceMetricKey,omitempty"`
	IndicatorKind          string             `json:"indicatorKind,omitempty"`
	AggregationMode        string             `json:"aggregationMode,omitempty"`
	ValueType              string             `json:"valueType,omitempty"`
	EvidencePolicy         string             `json:"evidencePolicy,omitempty"`
	SupportsStoreBreakdown bool               `json:"supportsStoreBreakdown"`
	Required               bool               `json:"required"`
	Tags                   []string           `json:"tags,omitempty"`
	Settings               map[string]any     `json:"settings,omitempty"`
	Metadata               map[string]any     `json:"metadata,omitempty"`
	Items                  []ProfileItemInput `json:"items"`
}

type ReplaceActiveProfileInput struct {
	UserID                string
	TenantID              string
	IsPlatformAdmin       bool
	ClientID              int
	Name                  string                  `json:"name"`
	Description           string                  `json:"description,omitempty"`
	Status                string                  `json:"status,omitempty"`
	ScopeMode             string                  `json:"scopeMode,omitempty"`
	StoreBreakdownEnabled bool                    `json:"storeBreakdownEnabled"`
	ProviderSyncEnabled   bool                    `json:"providerSyncEnabled"`
	Metadata              map[string]any          `json:"metadata,omitempty"`
	Indicators            []ProfileIndicatorInput `json:"indicators"`
}

type GetStoreOverrideInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	ClientID        int
	StoreID         string
}

type StoreRuleInput struct {
	IndicatorID string         `json:"indicatorId"`
	Enabled     *bool          `json:"enabled,omitempty"`
	Weight      *float64       `json:"weight,omitempty"`
	Note        string         `json:"note,omitempty"`
	Metadata    map[string]any `json:"metadata,omitempty"`
}

type ReplaceStoreOverrideInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	ClientID        int
	StoreID         string
	ScopeMode       string           `json:"scopeMode,omitempty"`
	Status          string           `json:"status,omitempty"`
	Note            string           `json:"note,omitempty"`
	Score           *float64         `json:"score,omitempty"`
	Rules           []StoreRuleInput `json:"rules"`
}

type ListEvaluationsInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	ClientID        int
	UnitExternalID  string
	Status          string
	StartDate       string
	EndDate         string
	Page            int
	Limit           int
}

type GetEvaluationInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	ClientID        int
	EvaluationID    string
}

type EvaluationItemInput struct {
	ProfileItemID  string         `json:"profileItemId,omitempty"`
	Code           string         `json:"code"`
	Label          string         `json:"label"`
	InputType      string         `json:"inputType"`
	EvidencePolicy string         `json:"evidencePolicy"`
	ValueText      string         `json:"valueText,omitempty"`
	ValueNumeric   *float64       `json:"valueNumeric,omitempty"`
	ValueBoolean   *bool          `json:"valueBoolean,omitempty"`
	ValueJSON      map[string]any `json:"valueJson,omitempty"`
	Weight         float64        `json:"weight"`
	Score          float64        `json:"score"`
	Notes          string         `json:"notes,omitempty"`
	ConfigSnapshot map[string]any `json:"configSnapshot,omitempty"`
	Metadata       map[string]any `json:"metadata,omitempty"`
}

type EvaluationIndicatorInput struct {
	ProfileIndicatorID string                `json:"profileIndicatorId,omitempty"`
	CategoryCode       string                `json:"categoryCode,omitempty"`
	CategoryName       string                `json:"categoryName,omitempty"`
	Code               string                `json:"code"`
	Name               string                `json:"name"`
	SourceKind         string                `json:"sourceKind,omitempty"`
	SourceModule       string                `json:"sourceModule,omitempty"`
	ScopeMode          string                `json:"scopeMode,omitempty"`
	AggregationMode    string                `json:"aggregationMode,omitempty"`
	ValueType          string                `json:"valueType,omitempty"`
	EvidencePolicy     string                `json:"evidencePolicy,omitempty"`
	Score              float64               `json:"score"`
	RawValueNumeric    *float64              `json:"rawValueNumeric,omitempty"`
	Weight             float64               `json:"weight"`
	ConfigSnapshot     map[string]any        `json:"configSnapshot,omitempty"`
	Metadata           map[string]any        `json:"metadata,omitempty"`
	Items              []EvaluationItemInput `json:"items,omitempty"`
}

type EvaluationCategoryInput struct {
	Code     string         `json:"code"`
	Name     string         `json:"name"`
	Score    float64        `json:"score"`
	Weight   float64        `json:"weight"`
	Summary  map[string]any `json:"summary,omitempty"`
	Metadata map[string]any `json:"metadata,omitempty"`
}

type MetricSnapshotInput struct {
	EvaluationID       string         `json:"evaluationId,omitempty"`
	ProfileIndicatorID string         `json:"profileIndicatorId,omitempty"`
	MetricKey          string         `json:"metricKey"`
	ScopeMode          string         `json:"scopeMode,omitempty"`
	UnitExternalID     string         `json:"unitExternalId,omitempty"`
	SnapshotAt         string         `json:"snapshotAt,omitempty"`
	ValueNumeric       *float64       `json:"valueNumeric,omitempty"`
	ValueText          string         `json:"valueText,omitempty"`
	ValueJSON          map[string]any `json:"valueJson,omitempty"`
	Metadata           map[string]any `json:"metadata,omitempty"`
}

type CreateEvaluationInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	ClientID        int
	ProfileID       string                     `json:"profileId,omitempty"`
	TargetSetID     string                     `json:"targetSetId,omitempty"`
	EvaluatorName   string                     `json:"evaluatorName,omitempty"`
	UnitExternalID  string                     `json:"unitExternalId,omitempty"`
	UnitCode        string                     `json:"unitCode,omitempty"`
	UnitName        string                     `json:"unitName,omitempty"`
	ScopeMode       string                     `json:"scopeMode,omitempty"`
	PeriodStart     string                     `json:"periodStart"`
	PeriodEnd       string                     `json:"periodEnd"`
	Status          string                     `json:"status,omitempty"`
	Notes           string                     `json:"notes,omitempty"`
	ConfigSnapshot  map[string]any             `json:"configSnapshot,omitempty"`
	Metadata        map[string]any             `json:"metadata,omitempty"`
	IndicatorCodes  []string                   `json:"indicatorCodes,omitempty"`
	Categories      []EvaluationCategoryInput  `json:"categories,omitempty"`
	Indicators      []EvaluationIndicatorInput `json:"indicators,omitempty"`
	Snapshots       []MetricSnapshotInput      `json:"snapshots,omitempty"`
}

type DeleteEvaluationInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	ClientID        int
	EvaluationID    string
}

type GetDashboardInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	ClientID        int
	StartDate       string
	EndDate         string
	UnitExternalID  string
}

type ReplaceTargetsInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	ClientID        int
	TargetSets      []TargetSetView `json:"targetSets"`
}

type IngestProviderSnapshotsInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	ClientID        int
	ProviderName    string                `json:"providerName"`
	SourceModule    string                `json:"sourceModule,omitempty"`
	Snapshots       []MetricSnapshotInput `json:"snapshots"`
}

type CreateAssetUploadIntentInput struct {
	UserID                string
	TenantID              string
	IsPlatformAdmin       bool
	ClientID              int
	EvaluationID          string         `json:"evaluationId,omitempty"`
	EvaluationIndicatorID string         `json:"evaluationIndicatorId,omitempty"`
	EvaluationItemID      string         `json:"evaluationItemId,omitempty"`
	AssetKind             string         `json:"assetKind,omitempty"`
	FileName              string         `json:"fileName"`
	ContentType           string         `json:"contentType,omitempty"`
	FileSizeBytes         int64          `json:"fileSizeBytes,omitempty"`
	Metadata              map[string]any `json:"metadata,omitempty"`
}
