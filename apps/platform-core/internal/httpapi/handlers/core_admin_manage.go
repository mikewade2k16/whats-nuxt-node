package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"platform-core/internal/domain/core"
	authmw "platform-core/internal/httpapi/middleware"
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
	Name     string `json:"name"`
	Nick     string `json:"nick,omitempty"`
	Email    string `json:"email"`
	Password string `json:"password,omitempty"`
	Phone    string `json:"phone,omitempty"`
	ClientID *int   `json:"clientId,omitempty"`
	Level    string `json:"level,omitempty"`
	UserType string `json:"userType,omitempty"`
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

	item, err := h.service.CreateAdminUser(r.Context(), core.CreateAdminUserInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		Name:            strings.TrimSpace(request.Name),
		Nick:            strings.TrimSpace(request.Nick),
		Email:           strings.TrimSpace(strings.ToLower(request.Email)),
		Password:        strings.TrimSpace(request.Password),
		Phone:           strings.TrimSpace(request.Phone),
		ClientID:        request.ClientID,
		Level:           strings.TrimSpace(request.Level),
		UserType:        strings.TrimSpace(request.UserType),
	})
	if err != nil {
		h.writeCoreError(w, err, "failed to create admin user")
		return
	}

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

	item, err := h.service.UpdateAdminUserField(r.Context(), core.UpdateAdminUserFieldInput{
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

	item, err := h.service.ApproveAdminUser(r.Context(), core.ApproveAdminUserInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		UserIDLegacy:    userID,
	})
	if err != nil {
		h.writeCoreError(w, err, "failed to approve admin user")
		return
	}

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

	err = h.service.DeleteAdminUser(r.Context(), core.DeleteAdminUserInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		UserIDLegacy:    userID,
	})
	if err != nil {
		h.writeCoreError(w, err, "failed to delete admin user")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"status": "deleted"})
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
