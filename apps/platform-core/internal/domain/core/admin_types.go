package core

import "time"

type Tenant struct {
	ID           string     `json:"id"`
	Slug         string     `json:"slug"`
	Name         string     `json:"name"`
	Status       string     `json:"status"`
	ContactEmail *string    `json:"contactEmail,omitempty"`
	Timezone     string     `json:"timezone"`
	Locale       string     `json:"locale"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
	DeletedAt    *time.Time `json:"deletedAt,omitempty"`
}

type CreateTenantInput struct {
	Slug         string
	Name         string
	ContactEmail string
	Timezone     string
	Locale       string
	Status       string
	ActorUserID  string
}

type UpdateTenantInput struct {
	TenantID     string
	Name         *string
	Status       *string
	ContactEmail *string
	Timezone     *string
	Locale       *string
	ActorUserID  string
}

type TenantUser struct {
	TenantUserID string     `json:"tenantUserId"`
	UserID       string     `json:"userId"`
	Name         string     `json:"name"`
	Email        string     `json:"email"`
	Status       string     `json:"status"`
	IsOwner      bool       `json:"isOwner"`
	JoinedAt     *time.Time `json:"joinedAt,omitempty"`
	LastSeenAt   *time.Time `json:"lastSeenAt,omitempty"`
}

type InviteTenantUserInput struct {
	TenantID    string
	Email       string
	Name        string
	Password    string
	IsOwner     bool
	RoleCodes   []string
	ActorUserID string
}

type InviteTenantUserOutput struct {
	TenantUserID string `json:"tenantUserId"`
	UserID       string `json:"userId"`
	CreatedUser  bool   `json:"createdUser"`
}

type TenantModule struct {
	ModuleID      string     `json:"moduleId"`
	Code          string     `json:"code"`
	Name          string     `json:"name"`
	IsCore        bool       `json:"isCore"`
	Status        string     `json:"status"`
	Source        *string    `json:"source,omitempty"`
	ActivatedAt   *time.Time `json:"activatedAt,omitempty"`
	DeactivatedAt *time.Time `json:"deactivatedAt,omitempty"`
}

type SetTenantModuleStatusInput struct {
	TenantID    string
	ModuleCode  string
	Status      string
	ActorUserID string
}

type UpsertTenantModuleLimitInput struct {
	TenantID    string
	ModuleCode  string
	LimitKey    string
	ValueInt    *int
	IsUnlimited bool
	Source      string
	Notes       *string
	ActorUserID string
}

type UpsertTenantModuleLimitOutput struct {
	LimitID  string        `json:"limitId"`
	Resolved ResolvedLimit `json:"resolved"`
}
