package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"plataforma-api/internal/domain/core"
	authmw "plataforma-api/internal/httpapi/middleware"
)

type adminListMeta struct {
	Page       int  `json:"page"`
	Limit      int  `json:"limit"`
	Total      int  `json:"total"`
	TotalPages int  `json:"totalPages"`
	HasMore    bool `json:"hasMore"`
}

type updateFieldRequest struct {
	Field string `json:"field"`
	Value any    `json:"value"`
}

type replaceStoresRequest struct {
	Stores []core.AdminClientStoreInput `json:"stores"`
}

type createAdminClientRequest struct {
	Name          string `json:"name"`
	Status        string `json:"status,omitempty"`
	AdminName     string `json:"adminName,omitempty"`
	AdminEmail    string `json:"adminEmail,omitempty"`
	AdminPassword string `json:"adminPassword,omitempty"`
}

type createAdminUserRequest struct {
	Name            string `json:"name"`
	Nick            string `json:"nick,omitempty"`
	Email           string `json:"email"`
	Password        string `json:"password,omitempty"`
	Phone           string `json:"phone,omitempty"`
	ClientID        *int   `json:"clientId,omitempty"`
	Level           string `json:"level,omitempty"`
	UserType        string `json:"userType,omitempty"`
	IsPlatformAdmin bool   `json:"isPlatformAdmin,omitempty"`
}

func writeOwnProfileUpdateError(w http.ResponseWriter, field string, err error) bool {
	switch {
	case errors.Is(err, core.ErrEmailAlreadyInUse):
		writeError(w, http.StatusConflict, "email_already_in_use", "Email ja esta em uso por outra conta.")
		return true
	case errors.Is(err, core.ErrInvalidInput):
		switch strings.TrimSpace(field) {
		case "email":
			writeError(w, http.StatusBadRequest, "bad_request", "Email invalido.")
		case "name":
			writeError(w, http.StatusBadRequest, "bad_request", "Nome invalido.")
		case "password":
			writeError(w, http.StatusBadRequest, "bad_request", "Nova senha precisa ter no minimo 6 caracteres.")
		default:
			writeError(w, http.StatusBadRequest, "bad_request", "Dados invalidos para atualizar o perfil.")
		}
		return true
	default:
		return false
	}
}

func (h *CoreHandler) ListAdminClients(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	page, limit := parsePageAndLimit(r)
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	status := strings.TrimSpace(r.URL.Query().Get("status"))

	items, total, err := h.service.ListAdminClients(r.Context(), core.ListAdminClientsInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		Query:           q,
		Status:          status,
		Page:            page,
		Limit:           limit,
	})
	if err != nil {
		h.writeCoreError(w, err, "failed to list admin clients")
		return
	}

	meta := buildListMeta(page, limit, total)
	writeJSON(w, http.StatusOK, map[string]any{
		"items": items,
		"meta":  meta,
	})
}

func (h *CoreHandler) GetAdminClient(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	clientID, err := parseLegacyIDParam(r, "clientId")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	item, err := h.service.GetAdminClient(r.Context(), core.GetAdminClientInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		ClientID:        clientID,
	})
	if err != nil {
		h.writeCoreError(w, err, "failed to load admin client")
		return
	}

	writeJSON(w, http.StatusOK, item)
}

func (h *CoreHandler) CreateAdminClient(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	var request createAdminClientRequest
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	item, err := h.service.CreateAdminClient(r.Context(), core.CreateAdminClientInput{
		UserID:          claims.Subject,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		Name:            strings.TrimSpace(request.Name),
		Status:          strings.TrimSpace(request.Status),
		AdminName:       strings.TrimSpace(request.AdminName),
		AdminEmail:      strings.TrimSpace(strings.ToLower(request.AdminEmail)),
		AdminPassword:   strings.TrimSpace(request.AdminPassword),
	})
	if err != nil {
		h.writeCoreError(w, err, "failed to create admin client")
		return
	}

	writeJSON(w, http.StatusCreated, item)
}

func (h *CoreHandler) UpdateAdminClientField(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	clientID, err := parseLegacyIDParam(r, "clientId")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	var request updateFieldRequest
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	item, err := h.service.UpdateAdminClientField(r.Context(), core.UpdateAdminClientFieldInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		ClientID:        clientID,
		Field:           strings.TrimSpace(request.Field),
		Value:           request.Value,
	})
	if err != nil {
		h.writeCoreError(w, err, "failed to update admin client")
		return
	}

	if h.hub != nil {
		h.hub.BroadcastTenant(item.CoreTenantID, map[string]any{
			"entity":    "clients",
			"action":    "updated",
			"clientId":  item.ID,
			"payload":   map[string]any{"field": strings.TrimSpace(request.Field)},
			"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
		})
	}

	writeJSON(w, http.StatusOK, item)
}

func (h *CoreHandler) ReplaceAdminClientStores(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	clientID, err := parseLegacyIDParam(r, "clientId")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	var request replaceStoresRequest
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	item, err := h.service.ReplaceAdminClientStores(r.Context(), core.ReplaceAdminClientStoresInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		ClientID:        clientID,
		Stores:          request.Stores,
	})
	if err != nil {
		h.writeCoreError(w, err, "failed to replace admin client stores")
		return
	}

	if h.hub != nil {
		h.hub.BroadcastTenant(item.CoreTenantID, map[string]any{
			"entity":    "clients",
			"action":    "updated",
			"clientId":  item.ID,
			"payload":   map[string]any{"field": "stores"},
			"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
		})
	}

	writeJSON(w, http.StatusOK, item)
}

func (h *CoreHandler) RotateAdminClientWebhook(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	clientID, err := parseLegacyIDParam(r, "clientId")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	item, err := h.service.RotateAdminClientWebhook(r.Context(), core.RotateAdminClientWebhookInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		ClientID:        clientID,
	})
	if err != nil {
		h.writeCoreError(w, err, "failed to rotate admin client webhook")
		return
	}

	writeJSON(w, http.StatusOK, item)
}

func (h *CoreHandler) DeleteAdminClient(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	clientID, err := parseLegacyIDParam(r, "clientId")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	err = h.service.DeleteAdminClient(r.Context(), core.DeleteAdminClientInput{
		UserID:          claims.Subject,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		ClientID:        clientID,
	})
	if err != nil {
		h.writeCoreError(w, err, "failed to delete admin client")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"status": "deleted"})
}

func (h *CoreHandler) ListAdminUsers(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	page, limit := parsePageAndLimit(r)
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	clientIDFilter, err := parseOptionalLegacyIDQueryParam(r, "clientId")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	items, total, err := h.service.ListAdminUsers(r.Context(), core.ListAdminUsersInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		Query:           q,
		ClientID:        clientIDFilter,
		Page:            page,
		Limit:           limit,
	})
	if err != nil {
		h.writeCoreError(w, err, "failed to list admin users")
		return
	}

	meta := buildListMeta(page, limit, total)
	writeJSON(w, http.StatusOK, map[string]any{
		"items": items,
		"meta":  meta,
	})
}

func (h *CoreHandler) CreateAdminUser(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	var request createAdminUserRequest
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	item, tenantID, err := h.service.CreateAdminUser(r.Context(), core.CreateAdminUserInput{
		UserID:                claims.Subject,
		TenantID:              claims.TenantID,
		IsPlatformAdmin:       claims.IsPlatformAdmin,
		TargetIsPlatformAdmin: request.IsPlatformAdmin,
		Name:                  strings.TrimSpace(request.Name),
		Nick:                  strings.TrimSpace(request.Nick),
		Email:                 strings.TrimSpace(strings.ToLower(request.Email)),
		Password:              strings.TrimSpace(request.Password),
		Phone:                 strings.TrimSpace(request.Phone),
		ClientID:              request.ClientID,
		Level:                 strings.TrimSpace(request.Level),
		UserType:              strings.TrimSpace(request.UserType),
	})
	if err != nil {
		h.writeCoreError(w, err, "failed to create admin user")
		return
	}

	h.broadcastAdminUserEvent(tenantID, "created", item, nil)

	writeJSON(w, http.StatusCreated, item)
}

func (h *CoreHandler) UpdateAdminUserField(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	userID, err := parseLegacyIDParam(r, "userId")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	var request updateFieldRequest
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	item, tenantID, err := h.service.UpdateAdminUserField(r.Context(), core.UpdateAdminUserFieldInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		UserIDLegacy:    userID,
		Field:           strings.TrimSpace(request.Field),
		Value:           request.Value,
	})
	if err != nil {
		h.writeCoreError(w, err, "failed to update admin user")
		return
	}

	h.broadcastAdminUserEvent(tenantID, "updated", item, map[string]any{
		"field": strings.TrimSpace(request.Field),
	})

	writeJSON(w, http.StatusOK, item)
}

func (h *CoreHandler) ApproveAdminUser(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	userID, err := parseLegacyIDParam(r, "userId")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	item, tenantID, err := h.service.ApproveAdminUser(r.Context(), core.ApproveAdminUserInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		UserIDLegacy:    userID,
	})
	if err != nil {
		h.writeCoreError(w, err, "failed to approve admin user")
		return
	}

	h.broadcastAdminUserEvent(tenantID, "updated", item, map[string]any{
		"field":  "status",
		"reason": "approved",
	})

	writeJSON(w, http.StatusOK, item)
}

func (h *CoreHandler) DeleteAdminUser(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	userID, err := parseLegacyIDParam(r, "userId")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	item, tenantID, err := h.service.DeleteAdminUser(r.Context(), core.DeleteAdminUserInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		UserIDLegacy:    userID,
	})
	if err != nil {
		h.writeCoreError(w, err, "failed to delete admin user")
		return
	}

	h.broadcastAdminUserEvent(tenantID, "deleted", item, nil)

	writeJSON(w, http.StatusOK, map[string]any{"status": "deleted"})
}

func (h *CoreHandler) broadcastAdminUserEvent(tenantID, action string, item core.AdminUser, payload map[string]any) {
	if h.hub == nil || strings.TrimSpace(tenantID) == "" {
		return
	}

	clientID := 0
	if item.ClientID != nil && *item.ClientID > 0 {
		clientID = *item.ClientID
	}

	envelopePayload := map[string]any{
		"userId":     item.ID,
		"coreUserId": strings.TrimSpace(item.CoreUserID),
		"email":      strings.TrimSpace(strings.ToLower(item.Email)),
	}
	for key, value := range payload {
		envelopePayload[key] = value
	}

	h.hub.BroadcastTenant(tenantID, map[string]any{
		"entity":    "users",
		"action":    action,
		"clientId":  clientID,
		"payload":   envelopePayload,
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
	})
}

func parseLegacyIDParam(r *http.Request, param string) (int, error) {
	raw := strings.TrimSpace(chi.URLParam(r, param))
	if raw == "" {
		return 0, core.ErrInvalidInput
	}

	parsed, err := strconv.Atoi(raw)
	if err != nil || parsed <= 0 {
		return 0, core.ErrInvalidInput
	}
	return parsed, nil
}

func parsePageAndLimit(r *http.Request) (int, int) {
	page := 1
	limit := 50

	if raw := strings.TrimSpace(r.URL.Query().Get("page")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			page = parsed
		}
	}

	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	return page, limit
}

func parseOptionalLegacyIDQueryParam(r *http.Request, key string) (*int, error) {
	raw := strings.TrimSpace(r.URL.Query().Get(key))
	if raw == "" {
		return nil, nil
	}

	parsed, err := strconv.Atoi(raw)
	if err != nil || parsed < 0 {
		return nil, core.ErrInvalidInput
	}

	return &parsed, nil
}

// UpdateSelfProfile handles PATCH /core/auth/profile â€” updates a single field
// for the authenticated user using their JWT UUID, no legacy_id required.
func (h *CoreHandler) UpdateSelfProfile(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	var req updateFieldRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	if err := h.service.UpdateOwnProfileField(r.Context(), core.UpdateOwnProfileFieldInput{
		ActorCoreUserID: claims.Subject,
		Field:           req.Field,
		Value:           req.Value,
	}); err != nil {
		if writeOwnProfileUpdateError(w, req.Field, err) {
			return
		}
		h.writeCoreError(w, err, "failed to update profile")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func buildListMeta(page, limit, total int) adminListMeta {
	if page <= 0 {
		page = 1
	}
	if limit <= 0 {
		limit = 1
	}
	totalPages := total / limit
	if total%limit != 0 {
		totalPages++
	}
	if totalPages <= 0 {
		totalPages = 1
	}

	return adminListMeta{
		Page:       page,
		Limit:      limit,
		Total:      total,
		TotalPages: totalPages,
		HasMore:    page < totalPages,
	}
}
