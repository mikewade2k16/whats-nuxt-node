package contracts

import (
	"context"
	"strings"
	"time"
)

type ActorContext struct {
	UserID      string   `json:"userId"`
	DisplayName string   `json:"displayName,omitempty"`
	Email       string   `json:"email,omitempty"`
	Role        string   `json:"role"`
	StoreIDs    []string `json:"storeIds,omitempty"`
}

type TenantContext struct {
	TenantID   string `json:"tenantId"`
	TenantSlug string `json:"tenantSlug,omitempty"`
}

type AccessPolicy struct {
	Capabilities  []string `json:"capabilities,omitempty"`
	ActiveModules []string `json:"activeModules,omitempty"`
}

type AccessContext struct {
	UserID        string   `json:"userId"`
	DisplayName   string   `json:"displayName,omitempty"`
	Email         string   `json:"email,omitempty"`
	TenantID      string   `json:"tenantId"`
	TenantSlug    string   `json:"tenantSlug,omitempty"`
	Role          string   `json:"role"`
	StoreIDs      []string `json:"storeIds,omitempty"`
	Capabilities  []string `json:"capabilities,omitempty"`
	ActiveModules []string `json:"activeModules,omitempty"`
}

func NewAccessContext(actor ActorContext, tenant TenantContext, policy AccessPolicy) AccessContext {
	return AccessContext{
		UserID:        strings.TrimSpace(actor.UserID),
		DisplayName:   strings.TrimSpace(actor.DisplayName),
		Email:         strings.TrimSpace(actor.Email),
		TenantID:      strings.TrimSpace(tenant.TenantID),
		TenantSlug:    strings.TrimSpace(tenant.TenantSlug),
		Role:          strings.TrimSpace(actor.Role),
		StoreIDs:      compactStrings(actor.StoreIDs),
		Capabilities:  compactStrings(policy.Capabilities),
		ActiveModules: compactStrings(policy.ActiveModules),
	}
}

type AccessContextResolver interface {
	ResolveAccessContext(ctx context.Context) (AccessContext, error)
}

func (access AccessContext) ActorContext() ActorContext {
	return ActorContext{
		UserID:      strings.TrimSpace(access.UserID),
		DisplayName: strings.TrimSpace(access.DisplayName),
		Email:       strings.TrimSpace(access.Email),
		Role:        strings.TrimSpace(access.Role),
		StoreIDs:    compactStrings(access.StoreIDs),
	}
}

func (access AccessContext) TenantContext() TenantContext {
	return TenantContext{
		TenantID:   strings.TrimSpace(access.TenantID),
		TenantSlug: strings.TrimSpace(access.TenantSlug),
	}
}

func (access AccessContext) AccessPolicy() AccessPolicy {
	return AccessPolicy{
		Capabilities:  compactStrings(access.Capabilities),
		ActiveModules: compactStrings(access.ActiveModules),
	}
}

type StoreScopeFilter struct {
	TenantID string `json:"tenantId,omitempty"`
}

type StoreScopeView struct {
	ID       string `json:"id"`
	TenantID string `json:"tenantId"`
	Code     string `json:"code"`
	Name     string `json:"name"`
	City     string `json:"city,omitempty"`
}

type StoreScopeProvider interface {
	ListAccessible(ctx context.Context, access AccessContext, filter StoreScopeFilter) ([]StoreScopeView, error)
}

type StoreCatalogFilter struct {
	TenantID        string `json:"tenantId,omitempty"`
	IncludeInactive bool   `json:"includeInactive,omitempty"`
}

type StoreCatalogView struct {
	ID                string  `json:"id"`
	TenantID          string  `json:"tenantId"`
	Code              string  `json:"code"`
	Name              string  `json:"name"`
	City              string  `json:"city,omitempty"`
	Active            bool    `json:"isActive"`
	DefaultTemplateID string  `json:"defaultTemplateId,omitempty"`
	MonthlyGoal       float64 `json:"monthlyGoal,omitempty"`
	WeeklyGoal        float64 `json:"weeklyGoal,omitempty"`
	AvgTicketGoal     float64 `json:"avgTicketGoal,omitempty"`
	ConversionGoal    float64 `json:"conversionGoal,omitempty"`
	PAGoal            float64 `json:"paGoal,omitempty"`
}

type StoreCatalogProvider interface {
	ListAccessibleStores(ctx context.Context, access AccessContext, filter StoreCatalogFilter) ([]StoreCatalogView, error)
	FindAccessibleStore(ctx context.Context, access AccessContext, storeID string) (StoreCatalogView, error)
}

type ConsultantIdentityInput struct {
	ConsultantID       string   `json:"consultantId"`
	TenantID           string   `json:"tenantId"`
	DisplayName        string   `json:"displayName"`
	Email              string   `json:"email"`
	Role               string   `json:"role"`
	StoreIDs           []string `json:"storeIds,omitempty"`
	MustChangePassword bool     `json:"mustChangePassword"`
}

type ProvisionedIdentity struct {
	UserID             string `json:"userId"`
	ExternalSubject    string `json:"externalSubject,omitempty"`
	MustChangePassword bool   `json:"mustChangePassword"`
}

type IdentityProvisioner interface {
	EnsureConsultantIdentity(ctx context.Context, access AccessContext, input ConsultantIdentityInput) (ProvisionedIdentity, error)
	DeactivateConsultantIdentity(ctx context.Context, access AccessContext, consultantID string) error
}

type RealtimeSubscriptionScope struct {
	Channel  string `json:"channel,omitempty"`
	TenantID string `json:"tenantId,omitempty"`
	StoreID  string `json:"storeId,omitempty"`
}

type RealtimeContext struct {
	Access AccessContext               `json:"access"`
	Scopes []RealtimeSubscriptionScope `json:"scopes,omitempty"`
}

type RealtimeContextResolver interface {
	ResolveRealtimeContext(ctx context.Context, token string) (RealtimeContext, error)
	CanSubscribe(ctx context.Context, access AccessContext, scope RealtimeSubscriptionScope) (bool, error)
}

type Clock interface {
	Now() time.Time
}

func compactStrings(values []string) []string {
	if len(values) == 0 {
		return nil
	}

	compacted := make([]string, 0, len(values))
	for _, value := range values {
		normalized := strings.TrimSpace(value)
		if normalized == "" {
			continue
		}
		compacted = append(compacted, normalized)
	}

	if len(compacted) == 0 {
		return nil
	}

	return compacted
}
