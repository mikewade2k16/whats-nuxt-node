package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	domainauth "platform-core/internal/domain/auth"
	"platform-core/internal/domain/core"
	authmw "platform-core/internal/httpapi/middleware"
	"platform-core/internal/realtime"
)

type CoreHandler struct {
	service *core.Service
	hub     *realtime.Hub
}

func NewCoreHandler(service *core.Service, hub *realtime.Hub) *CoreHandler {
	return &CoreHandler{service: service, hub: hub}
}

func (h *CoreHandler) ListTenants(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	tenants, err := h.service.ListTenants(r.Context(), claims.Subject, claims.IsPlatformAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to list tenants")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": tenants})
}

type createTenantRequest struct {
	Slug         string `json:"slug"`
	Name         string `json:"name"`
	ContactEmail string `json:"contactEmail,omitempty"`
	Timezone     string `json:"timezone,omitempty"`
	Locale       string `json:"locale,omitempty"`
	Status       string `json:"status,omitempty"`
}

func (h *CoreHandler) CreateTenant(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}
	if !claims.IsPlatformAdmin {
		writeError(w, http.StatusForbidden, "forbidden", "only platform admin can create tenants")
		return
	}

	var request createTenantRequest
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if !required(request.Slug) || !required(request.Name) {
		writeError(w, http.StatusBadRequest, "bad_request", "slug and name are required")
		return
	}

	tenant, err := h.service.CreateTenant(r.Context(), core.CreateTenantInput{
		Slug:         strings.TrimSpace(strings.ToLower(request.Slug)),
		Name:         strings.TrimSpace(request.Name),
		ContactEmail: strings.TrimSpace(strings.ToLower(request.ContactEmail)),
		Timezone:     strings.TrimSpace(request.Timezone),
		Locale:       strings.TrimSpace(request.Locale),
		Status:       strings.TrimSpace(request.Status),
		ActorUserID:  claims.Subject,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to create tenant")
		return
	}

	writeJSON(w, http.StatusCreated, tenant)
}

func (h *CoreHandler) GetTenant(w http.ResponseWriter, r *http.Request) {
	tenantID := strings.TrimSpace(chi.URLParam(r, "tenantId"))
	claims, ok := h.authorizeTenantPermission(w, r, tenantID, "tenants.read")
	if !ok {
		_ = claims
		return
	}

	tenant, err := h.service.GetTenantByID(r.Context(), tenantID)
	if err != nil {
		h.writeCoreError(w, err, "failed to load tenant")
		return
	}

	writeJSON(w, http.StatusOK, tenant)
}

type updateTenantRequest struct {
	Name         *string `json:"name,omitempty"`
	Status       *string `json:"status,omitempty"`
	ContactEmail *string `json:"contactEmail,omitempty"`
	Timezone     *string `json:"timezone,omitempty"`
	Locale       *string `json:"locale,omitempty"`
}

func (h *CoreHandler) UpdateTenant(w http.ResponseWriter, r *http.Request) {
	tenantID := strings.TrimSpace(chi.URLParam(r, "tenantId"))
	claims, ok := h.authorizeTenantPermission(w, r, tenantID, "tenants.update")
	if !ok {
		return
	}

	var request updateTenantRequest
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	tenant, err := h.service.UpdateTenant(r.Context(), core.UpdateTenantInput{
		TenantID:     tenantID,
		Name:         trimStringPtr(request.Name),
		Status:       trimStringPtr(request.Status),
		ContactEmail: trimLowerStringPtr(request.ContactEmail),
		Timezone:     trimStringPtr(request.Timezone),
		Locale:       trimStringPtr(request.Locale),
		ActorUserID:  claims.Subject,
	})
	if err != nil {
		h.writeCoreError(w, err, "failed to update tenant")
		return
	}

	writeJSON(w, http.StatusOK, tenant)
}

func (h *CoreHandler) ListTenantUsers(w http.ResponseWriter, r *http.Request) {
	tenantID := strings.TrimSpace(chi.URLParam(r, "tenantId"))
	if _, ok := h.authorizeTenantPermission(w, r, tenantID, "tenant.users.read"); !ok {
		return
	}

	items, err := h.service.ListTenantUsers(r.Context(), tenantID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to list tenant users")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

type inviteTenantUserRequest struct {
	Email     string   `json:"email"`
	Name      string   `json:"name"`
	Password  string   `json:"password,omitempty"`
	IsOwner   bool     `json:"isOwner,omitempty"`
	RoleCodes []string `json:"roleCodes,omitempty"`
}

func (h *CoreHandler) InviteTenantUser(w http.ResponseWriter, r *http.Request) {
	tenantID := strings.TrimSpace(chi.URLParam(r, "tenantId"))
	claims, ok := h.authorizeTenantPermission(w, r, tenantID, "tenant.users.invite")
	if !ok {
		return
	}

	var request inviteTenantUserRequest
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if !required(request.Email) || !required(request.Name) {
		writeError(w, http.StatusBadRequest, "bad_request", "email and name are required")
		return
	}

	output, err := h.service.InviteTenantUser(r.Context(), core.InviteTenantUserInput{
		TenantID:    tenantID,
		Email:       strings.TrimSpace(strings.ToLower(request.Email)),
		Name:        strings.TrimSpace(request.Name),
		Password:    strings.TrimSpace(request.Password),
		IsOwner:     request.IsOwner,
		RoleCodes:   request.RoleCodes,
		ActorUserID: claims.Subject,
	})
	if err != nil {
		h.writeCoreError(w, err, "failed to invite tenant user")
		return
	}

	writeJSON(w, http.StatusCreated, output)
}

func (h *CoreHandler) ListTenantModules(w http.ResponseWriter, r *http.Request) {
	tenantID := strings.TrimSpace(chi.URLParam(r, "tenantId"))
	if _, ok := h.authorizeTenantPermission(w, r, tenantID, "tenant.modules.read"); !ok {
		return
	}

	items, err := h.service.ListTenantModules(r.Context(), tenantID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to list tenant modules")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *CoreHandler) ActivateTenantModule(w http.ResponseWriter, r *http.Request) {
	h.setTenantModuleStatus(w, r, "active")
}

func (h *CoreHandler) DeactivateTenantModule(w http.ResponseWriter, r *http.Request) {
	h.setTenantModuleStatus(w, r, "inactive")
}

func (h *CoreHandler) setTenantModuleStatus(w http.ResponseWriter, r *http.Request, status string) {
	tenantID := strings.TrimSpace(chi.URLParam(r, "tenantId"))
	moduleCode := strings.TrimSpace(chi.URLParam(r, "moduleCode"))
	claims, ok := h.authorizeTenantPermission(w, r, tenantID, "tenant.modules.update")
	if !ok {
		return
	}
	if tenantID == "" || moduleCode == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "tenantId and moduleCode are required")
		return
	}

	module, err := h.service.SetTenantModuleStatus(r.Context(), core.SetTenantModuleStatusInput{
		TenantID:    tenantID,
		ModuleCode:  moduleCode,
		Status:      status,
		ActorUserID: claims.Subject,
	})
	if err != nil {
		h.writeCoreError(w, err, "failed to update module status")
		return
	}

	if h.hub != nil {
		h.hub.BroadcastTenant(tenantID, map[string]any{
			"type":       "tenant.module.updated",
			"tenantId":   tenantID,
			"moduleCode": moduleCode,
			"status":     module.Status,
			"byUserId":   claims.Subject,
		})
	}

	writeJSON(w, http.StatusOK, module)
}

type upsertLimitRequest struct {
	ValueInt    *int    `json:"valueInt,omitempty"`
	IsUnlimited bool    `json:"isUnlimited,omitempty"`
	Source      string  `json:"source,omitempty"`
	Notes       *string `json:"notes,omitempty"`
}

func (h *CoreHandler) UpsertTenantModuleLimit(w http.ResponseWriter, r *http.Request) {
	tenantID := strings.TrimSpace(chi.URLParam(r, "tenantId"))
	moduleCode := strings.TrimSpace(chi.URLParam(r, "moduleCode"))
	limitKey := strings.TrimSpace(chi.URLParam(r, "limitKey"))
	claims, ok := h.authorizeTenantPermission(w, r, tenantID, "tenant.limits.update")
	if !ok {
		return
	}
	if tenantID == "" || moduleCode == "" || limitKey == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "tenantId, moduleCode and limitKey are required")
		return
	}

	var request upsertLimitRequest
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if !request.IsUnlimited && request.ValueInt == nil {
		writeError(w, http.StatusBadRequest, "bad_request", "valueInt is required when isUnlimited is false")
		return
	}

	output, err := h.service.UpsertTenantModuleLimit(r.Context(), core.UpsertTenantModuleLimitInput{
		TenantID:    tenantID,
		ModuleCode:  moduleCode,
		LimitKey:    limitKey,
		ValueInt:    request.ValueInt,
		IsUnlimited: request.IsUnlimited,
		Source:      strings.TrimSpace(request.Source),
		Notes:       trimStringPtr(request.Notes),
		ActorUserID: claims.Subject,
	})
	if err != nil {
		h.writeCoreError(w, err, "failed to update tenant module limit")
		return
	}

	if h.hub != nil {
		h.hub.BroadcastTenant(tenantID, map[string]any{
			"type":       "tenant.limit.updated",
			"tenantId":   tenantID,
			"moduleCode": moduleCode,
			"limitKey":   limitKey,
			"resolved":   output.Resolved,
			"byUserId":   claims.Subject,
		})
	}

	writeJSON(w, http.StatusOK, output)
}

func (h *CoreHandler) ResolveModuleLimit(w http.ResponseWriter, r *http.Request) {
	tenantID := strings.TrimSpace(chi.URLParam(r, "tenantId"))
	moduleCode := strings.TrimSpace(chi.URLParam(r, "moduleCode"))
	limitKey := strings.TrimSpace(chi.URLParam(r, "limitKey"))
	if _, ok := h.authorizeTenantPermission(w, r, tenantID, "tenant.limits.read"); !ok {
		return
	}
	if tenantID == "" || moduleCode == "" || limitKey == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "tenantId, moduleCode and limitKey are required")
		return
	}

	resolved, err := h.service.ResolveLimit(r.Context(), tenantID, moduleCode, limitKey)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to resolve limit")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"tenantId":   tenantID,
		"moduleCode": moduleCode,
		"limitKey":   limitKey,
		"resolved":   resolved,
	})
}

func (h *CoreHandler) AssignTenantUserToModule(w http.ResponseWriter, r *http.Request) {
	tenantID := strings.TrimSpace(chi.URLParam(r, "tenantId"))
	moduleCode := strings.TrimSpace(chi.URLParam(r, "moduleCode"))
	tenantUserID := strings.TrimSpace(chi.URLParam(r, "tenantUserId"))
	claims, ok := h.authorizeTenantPermission(w, r, tenantID, "tenant.users.modules.assign")
	if !ok {
		return
	}
	if tenantID == "" || moduleCode == "" || tenantUserID == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "tenantId, moduleCode and tenantUserId are required")
		return
	}

	output, err := h.service.AssignTenantUserToModule(r.Context(), core.AssignTenantUserInput{
		TenantID:     tenantID,
		ModuleCode:   moduleCode,
		TenantUserID: tenantUserID,
		ActorUserID:  claims.Subject,
		LimitKey:     "users",
	})
	if err != nil {
		h.writeCoreError(w, err, "failed to assign tenant user")
		return
	}

	if h.hub != nil {
		h.hub.BroadcastTenant(tenantID, map[string]any{
			"type":         "tenant.user.module.assigned",
			"tenantId":     tenantID,
			"moduleCode":   moduleCode,
			"tenantUserId": tenantUserID,
			"byUserId":     claims.Subject,
			"resolvedLimit": map[string]any{
				"isUnlimited": output.ResolvedLimit.IsUnlimited,
				"value":       output.ResolvedLimit.Value,
				"source":      output.ResolvedLimit.Source,
			},
			"activeUsersInModule": output.ActiveUsers,
		})
	}

	writeJSON(w, http.StatusOK, output)
}

func (h *CoreHandler) UnassignTenantUserFromModule(w http.ResponseWriter, r *http.Request) {
	tenantID := strings.TrimSpace(chi.URLParam(r, "tenantId"))
	moduleCode := strings.TrimSpace(chi.URLParam(r, "moduleCode"))
	tenantUserID := strings.TrimSpace(chi.URLParam(r, "tenantUserId"))
	claims, ok := h.authorizeTenantPermission(w, r, tenantID, "tenant.users.modules.assign")
	if !ok {
		return
	}
	if tenantID == "" || moduleCode == "" || tenantUserID == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "tenantId, moduleCode and tenantUserId are required")
		return
	}

	output, err := h.service.UnassignTenantUserFromModule(r.Context(), core.UnassignTenantUserInput{
		TenantID:     tenantID,
		ModuleCode:   moduleCode,
		TenantUserID: tenantUserID,
		ActorUserID:  claims.Subject,
	})
	if err != nil {
		h.writeCoreError(w, err, "failed to unassign tenant user")
		return
	}

	if h.hub != nil {
		h.hub.BroadcastTenant(tenantID, map[string]any{
			"type":                "tenant.user.module.unassigned",
			"tenantId":            tenantID,
			"moduleCode":          moduleCode,
			"tenantUserId":        tenantUserID,
			"byUserId":            claims.Subject,
			"activeUsersInModule": output.ActiveUsers,
		})
	}

	writeJSON(w, http.StatusOK, output)
}

func (h *CoreHandler) authorizeTenantPermission(w http.ResponseWriter, r *http.Request, tenantID, permissionCode string) (domainauth.Claims, bool) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return domainauth.Claims{}, false
	}

	allowed, err := h.service.HasTenantPermission(r.Context(), tenantID, claims.Subject, permissionCode, claims.IsPlatformAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to validate permission")
		return domainauth.Claims{}, false
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "forbidden", "permission denied")
		return domainauth.Claims{}, false
	}

	return claims, true
}

func (h *CoreHandler) writeCoreError(w http.ResponseWriter, err error, fallbackMessage string) {
	switch {
	case errors.Is(err, core.ErrInvalidInput):
		writeError(w, http.StatusBadRequest, "bad_request", "invalid input")
	case errors.Is(err, core.ErrForbidden):
		writeError(w, http.StatusForbidden, "forbidden", "operation not allowed")
	case errors.Is(err, core.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "resource not found")
	case errors.Is(err, core.ErrModuleInactive):
		writeError(w, http.StatusConflict, "module_inactive", "module is not active for tenant")
	case errors.Is(err, core.ErrUserInactive):
		writeError(w, http.StatusConflict, "tenant_user_inactive", "tenant user is not active")
	case errors.Is(err, core.ErrLimitReached):
		writeError(w, http.StatusConflict, "limit_reached", "module users limit reached")
	case errors.Is(err, core.ErrLimitNotConfigured):
		writeError(w, http.StatusUnprocessableEntity, "limit_not_configured", "module users limit is not configured")
	default:
		writeError(w, http.StatusInternalServerError, "internal_error", fallbackMessage)
	}
}

func trimStringPtr(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	return &trimmed
}

func trimLowerStringPtr(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(strings.ToLower(*value))
	return &trimmed
}
