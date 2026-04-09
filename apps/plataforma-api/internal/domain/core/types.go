package core

type ResolvedLimit struct {
	IsUnlimited bool   `json:"isUnlimited"`
	Value       *int   `json:"value,omitempty"`
	Source      string `json:"source"`
}

type AssignTenantUserInput struct {
	TenantID     string
	ModuleCode   string
	TenantUserID string
	ActorUserID  string
	LimitKey     string
}

type AssignTenantUserOutput struct {
	AssignmentID    string        `json:"assignmentId"`
	AlreadyAssigned bool          `json:"alreadyAssigned"`
	ResolvedLimit   ResolvedLimit `json:"resolvedLimit"`
	ActiveUsers     int           `json:"activeUsersInModule"`
}

type UnassignTenantUserInput struct {
	TenantID     string
	ModuleCode   string
	TenantUserID string
	ActorUserID  string
}

type UnassignTenantUserOutput struct {
	AssignmentID      string `json:"assignmentId,omitempty"`
	AlreadyUnassigned bool   `json:"alreadyUnassigned"`
	ActiveUsers       int    `json:"activeUsersInModule"`
}
