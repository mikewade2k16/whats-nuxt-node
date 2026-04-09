package handlers

import (
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"plataforma-api/internal/domain/finance"
	authmw "plataforma-api/internal/httpapi/middleware"
)

type FinanceHandler struct {
	service *finance.Service
}

func NewFinanceHandler(service *finance.Service) *FinanceHandler {
	return &FinanceHandler{service: service}
}

type createFinanceSheetRequest struct {
	Title    string              `json:"title"`
	Period   string              `json:"period"`
	Status   string              `json:"status,omitempty"`
	Notes    string              `json:"notes,omitempty"`
	ClientID *int                `json:"clientId,omitempty"`
	Entradas []finance.LineInput `json:"entradas,omitempty"`
	Saidas   []finance.LineInput `json:"saidas,omitempty"`
}

type replaceFinanceSheetRequest struct {
	Title    string              `json:"title"`
	Period   string              `json:"period"`
	Status   string              `json:"status,omitempty"`
	Notes    string              `json:"notes,omitempty"`
	ClientID *int                `json:"clientId,omitempty"`
	Entradas []finance.LineInput `json:"entradas"`
	Saidas   []finance.LineInput `json:"saidas"`
}

type replaceFinanceConfigRequest struct {
	ClientID         *int                          `json:"clientId,omitempty"`
	Categories       []finance.CategoryInput       `json:"categories"`
	FixedAccounts    []finance.FixedAccountInput   `json:"fixedAccounts"`
	RecurringEntries []finance.RecurringEntryInput `json:"recurringEntries"`
}

type updateFinanceLineRequest struct {
	Effective     *bool   `json:"effective,omitempty"`
	EffectiveDate *string `json:"effectiveDate,omitempty"`
}

func (h *FinanceHandler) ListAdminFinances(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	page, limit := parsePageAndLimit(r)
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	period := strings.TrimSpace(r.URL.Query().Get("period"))
	clientID := parseIntQueryParam(r, "clientId")

	items, total, err := h.service.ListSheets(r.Context(), finance.ListSheetsInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		Query:           q,
		ClientID:        clientID,
		Period:          period,
		Page:            page,
		Limit:           limit,
	})
	if err != nil {
		h.writeFinanceError(w, err, "failed to list finance sheets")
		return
	}

	meta := buildListMeta(page, limit, total)
	writeJSON(w, http.StatusOK, map[string]any{
		"items": items,
		"meta":  meta,
	})
}

func (h *FinanceHandler) GetAdminFinance(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	sheetID := strings.TrimSpace(chi.URLParam(r, "sheetId"))
	if sheetID == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid sheet id")
		return
	}

	sheet, err := h.service.GetSheet(r.Context(), finance.GetSheetInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		SheetID:         sheetID,
	})
	if err != nil {
		h.writeFinanceError(w, err, "failed to get finance sheet")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"item": sheet})
}

func (h *FinanceHandler) CreateAdminFinance(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	var req createFinanceSheetRequest
	if err := decodeJSONWithLimit(w, r, 512*1024, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	clientID := 0
	if req.ClientID != nil {
		clientID = *req.ClientID
	}

	sheet, err := h.service.CreateSheet(r.Context(), finance.CreateSheetInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		Title:           req.Title,
		Period:          req.Period,
		Status:          req.Status,
		Notes:           req.Notes,
		ClientID:        clientID,
		Entradas:        req.Entradas,
		Saidas:          req.Saidas,
	})
	if err != nil {
		h.writeFinanceError(w, err, "failed to create finance sheet")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{"item": sheet})
}

func (h *FinanceHandler) ReplaceAdminFinance(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	sheetID := strings.TrimSpace(chi.URLParam(r, "sheetId"))
	if sheetID == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid sheet id")
		return
	}

	var req replaceFinanceSheetRequest
	if err := decodeJSONWithLimit(w, r, 512*1024, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	clientID := 0
	if req.ClientID != nil {
		clientID = *req.ClientID
	}

	sheet, err := h.service.ReplaceSheet(r.Context(), finance.ReplaceSheetInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		SheetID:         sheetID,
		Title:           req.Title,
		Period:          req.Period,
		Status:          req.Status,
		Notes:           req.Notes,
		ClientID:        clientID,
		Entradas:        req.Entradas,
		Saidas:          req.Saidas,
	})
	if err != nil {
		h.writeFinanceError(w, err, "failed to replace finance sheet")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"item": sheet})
}

func (h *FinanceHandler) UpdateAdminFinanceLine(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	sheetID := strings.TrimSpace(chi.URLParam(r, "sheetId"))
	if sheetID == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid sheet id")
		return
	}

	lineID := strings.TrimSpace(chi.URLParam(r, "lineId"))
	if lineID == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid line id")
		return
	}

	var req updateFinanceLineRequest
	if err := decodeJSONWithLimit(w, r, 8*1024, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	result, err := h.service.PatchLine(r.Context(), finance.PatchLineInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		SheetID:         sheetID,
		LineID:          lineID,
		Effective:       req.Effective,
		EffectiveDate:   req.EffectiveDate,
	})
	if err != nil {
		h.writeFinanceError(w, err, "failed to update finance line")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"item": result})
}

func (h *FinanceHandler) DeleteAdminFinance(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	sheetID := strings.TrimSpace(chi.URLParam(r, "sheetId"))
	if sheetID == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid sheet id")
		return
	}

	if err := h.service.DeleteSheet(r.Context(), finance.DeleteSheetInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		SheetID:         sheetID,
	}); err != nil {
		h.writeFinanceError(w, err, "failed to delete finance sheet")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *FinanceHandler) GetAdminFinanceConfig(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	clientID := parseIntQueryParam(r, "clientId")
	config, err := h.service.GetConfig(r.Context(), finance.GetConfigInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		ClientID:        clientID,
	})
	if err != nil {
		h.writeFinanceError(w, err, "failed to get finance config")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"config": config})
}

func (h *FinanceHandler) ReplaceAdminFinanceConfig(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	var req replaceFinanceConfigRequest
	if err := decodeJSONWithLimit(w, r, 512*1024, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	clientID := 0
	if req.ClientID != nil {
		clientID = *req.ClientID
	}

	config, err := h.service.ReplaceConfig(r.Context(), finance.ReplaceConfigInput{
		UserID:           claims.Subject,
		TenantID:         claims.TenantID,
		IsPlatformAdmin:  claims.IsPlatformAdmin,
		ClientID:         clientID,
		Categories:       req.Categories,
		FixedAccounts:    req.FixedAccounts,
		RecurringEntries: req.RecurringEntries,
	})
	if err != nil {
		h.writeFinanceError(w, err, "failed to replace finance config")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"config": config})
}

func (h *FinanceHandler) writeFinanceError(w http.ResponseWriter, err error, fallbackMessage string) {
	switch {
	case errors.Is(err, finance.ErrInvalidInput):
		writeError(w, http.StatusBadRequest, "bad_request", "invalid input")
	case errors.Is(err, finance.ErrForbidden):
		writeError(w, http.StatusForbidden, "forbidden", "operation not allowed")
	case errors.Is(err, finance.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "resource not found")
	default:
		log.Printf("finance error [%s]: %v", fallbackMessage, err)
		writeError(w, http.StatusInternalServerError, "internal_error", fallbackMessage)
	}
}

func parseIntQueryParam(r *http.Request, key string) int {
	raw := strings.TrimSpace(r.URL.Query().Get(key))
	if raw == "" {
		return 0
	}
	parsed, err := strconv.Atoi(raw)
	if err != nil || parsed <= 0 {
		return 0
	}
	return parsed
}
