package handlers

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"platform-core/internal/domain/core"
	authmw "platform-core/internal/httpapi/middleware"
)

func (h *CoreHandler) ListPermissions(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	if !claims.IsPlatformAdmin {
		tenantID := strings.TrimSpace(r.URL.Query().Get("tenantId"))
		if tenantID == "" {
			tenantID = claims.TenantID
		}
		if tenantID == "" {
			writeError(w, http.StatusForbidden, "forbidden", "tenant context is required")
			return
		}

		allowed, err := h.service.HasTenantPermission(r.Context(), tenantID, claims.Subject, "roles.read", claims.IsPlatformAdmin)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to validate permission")
			return
		}
		if !allowed {
			writeError(w, http.StatusForbidden, "forbidden", "permission denied")
			return
		}
	}

	items, err := h.service.ListPermissions(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to list permissions")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *CoreHandler) ListTenantRoles(w http.ResponseWriter, r *http.Request) {
	tenantID := strings.TrimSpace(chi.URLParam(r, "tenantId"))
	if _, ok := h.authorizeTenantPermission(w, r, tenantID, "roles.read"); !ok {
		return
	}

	items, err := h.service.ListRoles(r.Context(), tenantID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to list tenant roles")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

type createTenantRoleRequest struct {
	ModuleCode      *string  `json:"moduleCode,omitempty"`
	Code            string   `json:"code"`
	Name            string   `json:"name"`
	Description     *string  `json:"description,omitempty"`
	PermissionCodes []string `json:"permissionCodes,omitempty"`
}

func (h *CoreHandler) CreateTenantRole(w http.ResponseWriter, r *http.Request) {
	tenantID := strings.TrimSpace(chi.URLParam(r, "tenantId"))
	claims, ok := h.authorizeTenantPermission(w, r, tenantID, "roles.update")
	if !ok {
		return
	}

	var request createTenantRoleRequest
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if !required(request.Code) || !required(request.Name) {
		writeError(w, http.StatusBadRequest, "bad_request", "code and name are required")
		return
	}

	role, err := h.service.CreateRole(r.Context(), core.CreateRoleInput{
		TenantID:        tenantID,
		ModuleCode:      trimLowerStringPtr(request.ModuleCode),
		Code:            strings.TrimSpace(request.Code),
		Name:            strings.TrimSpace(request.Name),
		Description:     trimStringPtr(request.Description),
		PermissionCodes: request.PermissionCodes,
		ActorUserID:     claims.Subject,
	})
	if err != nil {
		h.writeCoreError(w, err, "failed to create role")
		return
	}

	if h.hub != nil {
		h.hub.BroadcastTenant(tenantID, map[string]any{
			"type":     "tenant.role.created",
			"tenantId": tenantID,
			"role":     role,
			"byUserId": claims.Subject,
		})
	}

	writeJSON(w, http.StatusCreated, role)
}

type updateTenantRoleRequest struct {
	Name            *string   `json:"name,omitempty"`
	Description     *string   `json:"description,omitempty"`
	IsActive        *bool     `json:"isActive,omitempty"`
	PermissionCodes *[]string `json:"permissionCodes,omitempty"`
}

func (h *CoreHandler) UpdateTenantRole(w http.ResponseWriter, r *http.Request) {
	tenantID := strings.TrimSpace(chi.URLParam(r, "tenantId"))
	roleID := strings.TrimSpace(chi.URLParam(r, "roleId"))
	claims, ok := h.authorizeTenantPermission(w, r, tenantID, "roles.update")
	if !ok {
		return
	}
	if roleID == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "roleId is required")
		return
	}

	var request updateTenantRoleRequest
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	role, err := h.service.UpdateRole(r.Context(), core.UpdateRoleInput{
		TenantID:        tenantID,
		RoleID:          roleID,
		Name:            trimStringPtr(request.Name),
		Description:     trimStringPtr(request.Description),
		IsActive:        request.IsActive,
		PermissionCodes: request.PermissionCodes,
		ActorUserID:     claims.Subject,
	})
	if err != nil {
		h.writeCoreError(w, err, "failed to update role")
		return
	}

	if h.hub != nil {
		h.hub.BroadcastTenant(tenantID, map[string]any{
			"type":     "tenant.role.updated",
			"tenantId": tenantID,
			"role":     role,
			"byUserId": claims.Subject,
		})
	}

	writeJSON(w, http.StatusOK, role)
}

func (h *CoreHandler) ListTenantUserRoles(w http.ResponseWriter, r *http.Request) {
	tenantID := strings.TrimSpace(chi.URLParam(r, "tenantId"))
	tenantUserID := strings.TrimSpace(chi.URLParam(r, "tenantUserId"))
	if _, ok := h.authorizeTenantPermission(w, r, tenantID, "roles.read"); !ok {
		return
	}
	if tenantUserID == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "tenantUserId is required")
		return
	}

	items, err := h.service.ListTenantUserRoles(r.Context(), tenantID, tenantUserID)
	if err != nil {
		h.writeCoreError(w, err, "failed to list tenant user roles")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *CoreHandler) AssignRoleToTenantUser(w http.ResponseWriter, r *http.Request) {
	tenantID := strings.TrimSpace(chi.URLParam(r, "tenantId"))
	tenantUserID := strings.TrimSpace(chi.URLParam(r, "tenantUserId"))
	roleID := strings.TrimSpace(chi.URLParam(r, "roleId"))
	claims, ok := h.authorizeTenantPermission(w, r, tenantID, "roles.update")
	if !ok {
		return
	}
	if tenantUserID == "" || roleID == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "tenantUserId and roleId are required")
		return
	}

	output, err := h.service.AssignRoleToTenantUser(r.Context(), core.AssignTenantUserRoleInput{
		TenantID:     tenantID,
		TenantUserID: tenantUserID,
		RoleID:       roleID,
		ActorUserID:  claims.Subject,
	})
	if err != nil {
		h.writeCoreError(w, err, "failed to assign role to tenant user")
		return
	}

	if h.hub != nil {
		h.hub.BroadcastTenant(tenantID, map[string]any{
			"type":         "tenant.user.role.assigned",
			"tenantId":     tenantID,
			"tenantUserId": tenantUserID,
			"roleId":       roleID,
			"byUserId":     claims.Subject,
		})
	}

	writeJSON(w, http.StatusOK, output)
}

func (h *CoreHandler) RevokeRoleFromTenantUser(w http.ResponseWriter, r *http.Request) {
	tenantID := strings.TrimSpace(chi.URLParam(r, "tenantId"))
	tenantUserID := strings.TrimSpace(chi.URLParam(r, "tenantUserId"))
	roleID := strings.TrimSpace(chi.URLParam(r, "roleId"))
	claims, ok := h.authorizeTenantPermission(w, r, tenantID, "roles.update")
	if !ok {
		return
	}
	if tenantUserID == "" || roleID == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "tenantUserId and roleId are required")
		return
	}

	output, err := h.service.RevokeRoleFromTenantUser(r.Context(), core.RevokeTenantUserRoleInput{
		TenantID:     tenantID,
		TenantUserID: tenantUserID,
		RoleID:       roleID,
		ActorUserID:  claims.Subject,
	})
	if err != nil {
		h.writeCoreError(w, err, "failed to revoke role from tenant user")
		return
	}

	if h.hub != nil && output.Revoked {
		h.hub.BroadcastTenant(tenantID, map[string]any{
			"type":         "tenant.user.role.revoked",
			"tenantId":     tenantID,
			"tenantUserId": tenantUserID,
			"roleId":       roleID,
			"byUserId":     claims.Subject,
		})
	}

	writeJSON(w, http.StatusOK, output)
}
