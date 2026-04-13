package handlers

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	indicatorsdomain "plataforma-api/internal/domain/indicators"
	authmw "plataforma-api/internal/httpapi/middleware"
	"plataforma-api/internal/realtime"
)

type IndicatorsHandler struct {
	service *indicatorsdomain.Service
	hub     *realtime.Hub
}

func NewIndicatorsHandler(service *indicatorsdomain.Service, hub *realtime.Hub) *IndicatorsHandler {
	return &IndicatorsHandler{service: service, hub: hub}
}

func (h *IndicatorsHandler) GetDashboard(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	item, err := h.service.GetDashboard(r.Context(), indicatorsdomain.GetDashboardInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		ClientID:        parseIntQueryParam(r, "clientId"),
		StartDate:       strings.TrimSpace(r.URL.Query().Get("startDate")),
		EndDate:         strings.TrimSpace(r.URL.Query().Get("endDate")),
		UnitExternalID:  strings.TrimSpace(r.URL.Query().Get("unitExternalId")),
	})
	if err != nil {
		h.writeIndicatorsError(w, err, "failed to get indicators dashboard")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"item": item})
}

func (h *IndicatorsHandler) GetDashboardStores(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	item, err := h.service.GetDashboard(r.Context(), indicatorsdomain.GetDashboardInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		ClientID:        parseIntQueryParam(r, "clientId"),
		StartDate:       strings.TrimSpace(r.URL.Query().Get("startDate")),
		EndDate:         strings.TrimSpace(r.URL.Query().Get("endDate")),
		UnitExternalID:  strings.TrimSpace(r.URL.Query().Get("unitExternalId")),
	})
	if err != nil {
		h.writeIndicatorsError(w, err, "failed to get indicators stores dashboard")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"summary":         item.Summary,
		"evaluationCount": item.EvaluationCount,
		"items":           item.Stores,
		"ranking":         item.Ranking,
	})
}

func (h *IndicatorsHandler) GetGovernanceOverview(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	item, err := h.service.GetGovernanceOverview(r.Context(), indicatorsdomain.GetGovernanceInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
	})
	if err != nil {
		h.writeIndicatorsError(w, err, "failed to get indicators governance overview")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"item": item})
}

func (h *IndicatorsHandler) UpdateGovernancePolicy(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	policyID := strings.TrimSpace(chi.URLParam(r, "policyId"))
	if policyID == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid policy id")
		return
	}

	var req indicatorsdomain.UpdateGovernancePolicyInput
	if err := decodeJSONWithLimit(w, r, 64*1024, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	req.UserID = claims.Subject
	req.TenantID = claims.TenantID
	req.IsPlatformAdmin = claims.IsPlatformAdmin
	req.PolicyID = policyID

	item, err := h.service.UpdateGovernancePolicy(r.Context(), req)
	if err != nil {
		h.writeIndicatorsError(w, err, "failed to update indicators governance policy")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"item": item})
}

func (h *IndicatorsHandler) ListTemplates(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	page, limit := parsePageAndLimit(r)
	items, total, err := h.service.ListTemplates(r.Context(), indicatorsdomain.ListTemplatesInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		Query:           strings.TrimSpace(r.URL.Query().Get("q")),
		Status:          strings.TrimSpace(r.URL.Query().Get("status")),
		Page:            page,
		Limit:           limit,
	})
	if err != nil {
		h.writeIndicatorsError(w, err, "failed to list indicators templates")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"items": items,
		"meta":  buildListMeta(page, limit, total),
	})
}

func (h *IndicatorsHandler) GetTemplate(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	templateID := strings.TrimSpace(chi.URLParam(r, "templateId"))
	if templateID == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid template id")
		return
	}

	item, err := h.service.GetTemplate(r.Context(), indicatorsdomain.GetTemplateInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		TemplateID:      templateID,
	})
	if err != nil {
		h.writeIndicatorsError(w, err, "failed to get indicators template")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"item": item})
}

func (h *IndicatorsHandler) CreateTemplate(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	var req indicatorsdomain.TemplateMutationInput
	if err := decodeJSONWithLimit(w, r, 1024*1024, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	req.UserID = claims.Subject
	req.IsPlatformAdmin = claims.IsPlatformAdmin

	item, err := h.service.CreateTemplate(r.Context(), req)
	if err != nil {
		h.writeIndicatorsError(w, err, "failed to create indicators template")
		return
	}

	if tenantID, clientID, ok := h.resolveIndicatorsBroadcastTenant(r.Context(), claims.TenantID, claims.IsPlatformAdmin, parseIntQueryParam(r, "clientId")); ok {
		h.broadcastIndicatorsEvent(tenantID, "created", clientID, map[string]any{
			"scope":      "template",
			"templateId": item.RecordID,
		})
	}

	writeJSON(w, http.StatusCreated, map[string]any{"item": item})
}

func (h *IndicatorsHandler) UpdateTemplate(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	templateID := strings.TrimSpace(chi.URLParam(r, "templateId"))
	if templateID == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid template id")
		return
	}

	var req indicatorsdomain.TemplateMutationInput
	if err := decodeJSONWithLimit(w, r, 1024*1024, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	req.UserID = claims.Subject
	req.IsPlatformAdmin = claims.IsPlatformAdmin
	req.TemplateID = templateID

	item, err := h.service.UpdateTemplate(r.Context(), req)
	if err != nil {
		h.writeIndicatorsError(w, err, "failed to update indicators template")
		return
	}

	if tenantID, clientID, ok := h.resolveIndicatorsBroadcastTenant(r.Context(), claims.TenantID, claims.IsPlatformAdmin, parseIntQueryParam(r, "clientId")); ok {
		h.broadcastIndicatorsEvent(tenantID, "updated", clientID, map[string]any{
			"scope":      "template",
			"templateId": item.RecordID,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{"item": item})
}

func (h *IndicatorsHandler) GetActiveProfile(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	item, err := h.service.GetActiveProfile(r.Context(), indicatorsdomain.GetActiveProfileInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		ClientID:        parseIntQueryParam(r, "clientId"),
	})
	if err != nil {
		h.writeIndicatorsError(w, err, "failed to get active indicators profile")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"item": item})
}

func (h *IndicatorsHandler) ReplaceActiveProfile(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	var req indicatorsdomain.ReplaceActiveProfileInput
	if err := decodeJSONWithLimit(w, r, 1024*1024, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	req.UserID = claims.Subject
	req.TenantID = claims.TenantID
	req.IsPlatformAdmin = claims.IsPlatformAdmin
	req.ClientID = parseIntQueryParam(r, "clientId")

	item, err := h.service.ReplaceActiveProfile(r.Context(), req)
	if err != nil {
		h.writeIndicatorsError(w, err, "failed to replace active indicators profile")
		return
	}

	if tenantID, clientID, ok := h.resolveIndicatorsBroadcastTenant(r.Context(), claims.TenantID, claims.IsPlatformAdmin, req.ClientID); ok {
		h.broadcastIndicatorsEvent(tenantID, "updated", clientID, map[string]any{
			"scope":     "profile",
			"profileId": item.Profile.RecordID,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{"item": item})
}

func (h *IndicatorsHandler) GetActiveProfileStore(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	storeID := strings.TrimSpace(chi.URLParam(r, "storeId"))
	if storeID == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid store id")
		return
	}

	item, err := h.service.GetStoreOverride(r.Context(), indicatorsdomain.GetStoreOverrideInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		ClientID:        parseIntQueryParam(r, "clientId"),
		StoreID:         storeID,
	})
	if err != nil {
		h.writeIndicatorsError(w, err, "failed to get indicators store override")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"item": item})
}

func (h *IndicatorsHandler) ReplaceActiveProfileStore(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	storeID := strings.TrimSpace(chi.URLParam(r, "storeId"))
	if storeID == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid store id")
		return
	}

	var req indicatorsdomain.ReplaceStoreOverrideInput
	if err := decodeJSONWithLimit(w, r, 512*1024, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	req.UserID = claims.Subject
	req.TenantID = claims.TenantID
	req.IsPlatformAdmin = claims.IsPlatformAdmin
	req.ClientID = parseIntQueryParam(r, "clientId")
	req.StoreID = storeID

	item, err := h.service.ReplaceStoreOverride(r.Context(), req)
	if err != nil {
		h.writeIndicatorsError(w, err, "failed to replace indicators store override")
		return
	}

	if tenantID, clientID, ok := h.resolveIndicatorsBroadcastTenant(r.Context(), claims.TenantID, claims.IsPlatformAdmin, req.ClientID); ok {
		h.broadcastIndicatorsEvent(tenantID, "updated", clientID, map[string]any{
			"scope":   "store",
			"storeId": item.ID,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{"item": item})
}

func (h *IndicatorsHandler) ListEvaluations(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	page, limit := parsePageAndLimit(r)
	items, total, err := h.service.ListEvaluations(r.Context(), indicatorsdomain.ListEvaluationsInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		ClientID:        parseIntQueryParam(r, "clientId"),
		UnitExternalID:  strings.TrimSpace(r.URL.Query().Get("unitExternalId")),
		Status:          strings.TrimSpace(r.URL.Query().Get("status")),
		StartDate:       strings.TrimSpace(r.URL.Query().Get("startDate")),
		EndDate:         strings.TrimSpace(r.URL.Query().Get("endDate")),
		Page:            page,
		Limit:           limit,
	})
	if err != nil {
		h.writeIndicatorsError(w, err, "failed to list indicators evaluations")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"items": items,
		"meta":  buildListMeta(page, limit, total),
	})
}

func (h *IndicatorsHandler) GetEvaluation(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	evaluationID := strings.TrimSpace(chi.URLParam(r, "evaluationId"))
	if evaluationID == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid evaluation id")
		return
	}

	item, err := h.service.GetEvaluation(r.Context(), indicatorsdomain.GetEvaluationInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		ClientID:        parseIntQueryParam(r, "clientId"),
		EvaluationID:    evaluationID,
	})
	if err != nil {
		h.writeIndicatorsError(w, err, "failed to get indicators evaluation")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"item": item})
}

func (h *IndicatorsHandler) CreateEvaluation(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	var req indicatorsdomain.CreateEvaluationInput
	if err := decodeJSONWithLimit(w, r, 1024*1024, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	req.UserID = claims.Subject
	req.TenantID = claims.TenantID
	req.IsPlatformAdmin = claims.IsPlatformAdmin
	req.ClientID = parseIntQueryParam(r, "clientId")

	item, err := h.service.CreateEvaluation(r.Context(), req)
	if err != nil {
		h.writeIndicatorsError(w, err, "failed to create indicators evaluation")
		return
	}

	if tenantID, clientID, ok := h.resolveIndicatorsBroadcastTenant(r.Context(), claims.TenantID, claims.IsPlatformAdmin, req.ClientID); ok {
		h.broadcastIndicatorsEvent(tenantID, "created", clientID, map[string]any{
			"scope":        "evaluation",
			"evaluationId": item.ID,
		})
	}

	writeJSON(w, http.StatusCreated, map[string]any{"item": item})
}

func (h *IndicatorsHandler) DeleteEvaluation(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	evaluationID := strings.TrimSpace(chi.URLParam(r, "evaluationId"))
	if evaluationID == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid evaluation id")
		return
	}

	clientID := parseIntQueryParam(r, "clientId")
	tenantID, _ := h.service.ResolveEvaluationRealtimeTenant(r.Context(), evaluationID)

	if err := h.service.DeleteEvaluation(r.Context(), indicatorsdomain.DeleteEvaluationInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		ClientID:        clientID,
		EvaluationID:    evaluationID,
	}); err != nil {
		h.writeIndicatorsError(w, err, "failed to delete indicators evaluation")
		return
	}

	if strings.TrimSpace(tenantID) != "" {
		h.broadcastIndicatorsEvent(tenantID, "deleted", clientID, map[string]any{
			"scope":        "evaluation",
			"evaluationId": evaluationID,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *IndicatorsHandler) GetTargets(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	items, err := h.service.GetTargets(r.Context(), indicatorsdomain.GetActiveProfileInput{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
		ClientID:        parseIntQueryParam(r, "clientId"),
	})
	if err != nil {
		h.writeIndicatorsError(w, err, "failed to get indicators targets")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *IndicatorsHandler) ReplaceTargets(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	var req indicatorsdomain.ReplaceTargetsInput
	if err := decodeJSONWithLimit(w, r, 512*1024, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	req.UserID = claims.Subject
	req.TenantID = claims.TenantID
	req.IsPlatformAdmin = claims.IsPlatformAdmin
	req.ClientID = parseIntQueryParam(r, "clientId")

	items, err := h.service.ReplaceTargets(r.Context(), req)
	if err != nil {
		h.writeIndicatorsError(w, err, "failed to replace indicators targets")
		return
	}

	if tenantID, clientID, ok := h.resolveIndicatorsBroadcastTenant(r.Context(), claims.TenantID, claims.IsPlatformAdmin, req.ClientID); ok {
		h.broadcastIndicatorsEvent(tenantID, "updated", clientID, map[string]any{
			"scope": "targets",
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *IndicatorsHandler) IngestProviderSnapshots(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	var req indicatorsdomain.IngestProviderSnapshotsInput
	if err := decodeJSONWithLimit(w, r, 512*1024, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	req.UserID = claims.Subject
	req.TenantID = claims.TenantID
	req.IsPlatformAdmin = claims.IsPlatformAdmin
	req.ClientID = parseIntQueryParam(r, "clientId")

	items, err := h.service.IngestProviderSnapshots(r.Context(), req)
	if err != nil {
		h.writeIndicatorsError(w, err, "failed to ingest indicators provider snapshots")
		return
	}

	if tenantID, clientID, ok := h.resolveIndicatorsBroadcastTenant(r.Context(), claims.TenantID, claims.IsPlatformAdmin, req.ClientID); ok {
		h.broadcastIndicatorsEvent(tenantID, "updated", clientID, map[string]any{
			"scope":        "providers",
			"providerName": req.ProviderName,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *IndicatorsHandler) CreateAssetUploadIntent(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	var req indicatorsdomain.CreateAssetUploadIntentInput
	if err := decodeJSONWithLimit(w, r, 64*1024, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	req.UserID = claims.Subject
	req.TenantID = claims.TenantID
	req.IsPlatformAdmin = claims.IsPlatformAdmin
	req.ClientID = parseIntQueryParam(r, "clientId")

	item, err := h.service.CreateAssetUploadIntent(r.Context(), req)
	if err != nil {
		h.writeIndicatorsError(w, err, "failed to create indicators asset upload intent")
		return
	}

	if tenantID, clientID, ok := h.resolveIndicatorsBroadcastTenant(r.Context(), claims.TenantID, claims.IsPlatformAdmin, req.ClientID); ok {
		h.broadcastIndicatorsEvent(tenantID, "updated", clientID, map[string]any{
			"scope":   "assets",
			"assetId": item.AssetID,
		})
	}

	writeJSON(w, http.StatusCreated, map[string]any{"item": item})
}

func (h *IndicatorsHandler) broadcastIndicatorsEvent(tenantID, action string, clientID int, payload map[string]any) {
	if h.hub == nil || strings.TrimSpace(tenantID) == "" {
		return
	}
	h.hub.BroadcastTenant(tenantID, map[string]any{
		"entity":    "indicators",
		"action":    action,
		"clientId":  clientID,
		"payload":   payload,
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
	})
}

func (h *IndicatorsHandler) resolveIndicatorsBroadcastTenant(ctx context.Context, tenantID string, isPlatformAdmin bool, clientID int) (string, int, bool) {
	tenantID, err := h.service.ResolveRealtimeTenant(ctx, tenantID, isPlatformAdmin, clientID)
	if err != nil {
		return "", 0, false
	}
	return tenantID, clientID, true
}

func (h *IndicatorsHandler) writeIndicatorsError(w http.ResponseWriter, err error, fallbackMessage string) {
	switch {
	case errors.Is(err, indicatorsdomain.ErrInvalidInput):
		writeError(w, http.StatusBadRequest, "bad_request", "invalid input")
	case errors.Is(err, indicatorsdomain.ErrForbidden):
		writeError(w, http.StatusForbidden, "forbidden", "operation not allowed")
	case errors.Is(err, indicatorsdomain.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "resource not found")
	case errors.Is(err, indicatorsdomain.ErrTemplateLocked):
		writeError(w, http.StatusConflict, "conflict", "template locked")
	case errors.Is(err, indicatorsdomain.ErrBootstrapUnavailable):
		writeError(w, http.StatusServiceUnavailable, "service_unavailable", "bootstrap unavailable")
	case errors.Is(err, indicatorsdomain.ErrNotSupported):
		writeError(w, http.StatusNotImplemented, "not_supported", "operation not supported")
	default:
		log.Printf("indicators error [%s]: %v", fallbackMessage, err)
		writeError(w, http.StatusInternalServerError, "internal_error", fallbackMessage)
	}
}
