package core

import "time"

type Permission struct {
	ID          string  `json:"id"`
	Code        string  `json:"code"`
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	ModuleCode  *string `json:"moduleCode,omitempty"`
	IsActive    bool    `json:"isActive"`
}

type Role struct {
	ID              string    `json:"id"`
	TenantID        *string   `json:"tenantId,omitempty"`
	ModuleCode      *string   `json:"moduleCode,omitempty"`
	Code            string    `json:"code"`
	Name            string    `json:"name"`
	Description     *string   `json:"description,omitempty"`
	IsSystem        bool      `json:"isSystem"`
	IsActive        bool      `json:"isActive"`
	PermissionCodes []string  `json:"permissionCodes"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

type CreateRoleInput struct {
	TenantID        string
	ModuleCode      *string
	Code            string
	Name            string
	Description     *string
	PermissionCodes []string
	ActorUserID     string
}

type UpdateRoleInput struct {
	TenantID        string
	RoleID          string
	Name            *string
	Description     *string
	IsActive        *bool
	PermissionCodes *[]string
	ActorUserID     string
}

type TenantUserRole struct {
	TenantUserRoleID string    `json:"tenantUserRoleId"`
	RoleID           string    `json:"roleId"`
	RoleCode         string    `json:"roleCode"`
	RoleName         string    `json:"roleName"`
	IsSystem         bool      `json:"isSystem"`
	AssignedAt       time.Time `json:"assignedAt"`
}

type AssignTenantUserRoleInput struct {
	TenantID     string
	TenantUserID string
	RoleID       string
	ActorUserID  string
}

type AssignTenantUserRoleOutput struct {
	TenantUserRoleID string `json:"tenantUserRoleId"`
	AlreadyAssigned  bool   `json:"alreadyAssigned"`
}

type RevokeTenantUserRoleInput struct {
	TenantID     string
	TenantUserID string
	RoleID       string
	ActorUserID  string
}

type RevokeTenantUserRoleOutput struct {
	Revoked bool `json:"revoked"`
}
