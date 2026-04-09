package consultants

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/mikewade2k16/lista-da-vez/back/internal/platform/httpapi"
	modulecontracts "github.com/mikewade2k16/lista-da-vez/back/moduleapi/contracts"
)

type RouteGuard func(http.Handler) http.Handler

type HTTPRouteOptions struct {
	RequireAuth    RouteGuard
	AccessResolver modulecontracts.AccessContextResolver
}

type listResponse struct {
	Consultants []ConsultantView `json:"consultants"`
}

type consultantResponse struct {
	Consultant ConsultantView     `json:"consultant"`
	Access     *ProvisionedAccess `json:"access,omitempty"`
}

type createRequest struct {
	StoreID        string  `json:"storeId"`
	Name           string  `json:"name"`
	Role           string  `json:"role"`
	Color          string  `json:"color"`
	MonthlyGoal    float64 `json:"monthlyGoal"`
	CommissionRate float64 `json:"commissionRate"`
	ConversionGoal float64 `json:"conversionGoal"`
	AvgTicketGoal  float64 `json:"avgTicketGoal"`
	PAGoal         float64 `json:"paGoal"`
}

type updateRequest struct {
	Name           *string `json:"name"`
	Role           *string `json:"role"`
	Color          *string `json:"color"`
	MonthlyGoal    any     `json:"monthlyGoal"`
	CommissionRate any     `json:"commissionRate"`
	ConversionGoal any     `json:"conversionGoal"`
	AvgTicketGoal  any     `json:"avgTicketGoal"`
	PAGoal         any     `json:"paGoal"`
}

func RegisterRoutesWithOptions(mux *http.ServeMux, service *Service, options HTTPRouteOptions) {
	requireAuth := options.RequireAuth
	if requireAuth == nil {
		requireAuth = func(next http.Handler) http.Handler {
			return next
		}
	}

	resolveAccess := func(r *http.Request) (AccessContext, error) {
		if options.AccessResolver == nil {
			return AccessContext{}, ErrUnauthorized
		}

		return options.AccessResolver.ResolveAccessContext(r.Context())
	}

	registerRoute := func(pattern string, handler func(http.ResponseWriter, *http.Request, AccessContext)) {
		mux.Handle(pattern, requireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			access, err := resolveAccess(r)
			if err != nil {
				writeAccessError(w, r, err)
				return
			}

			handler(w, r, access)
		})))
	}

	registerRoute("GET /v1/consultants", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		consultants, err := service.ListByStore(r.Context(), access, strings.TrimSpace(r.URL.Query().Get("storeId")))
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, listResponse{Consultants: consultants})
	})

	registerRoute("POST /v1/consultants", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		var request createRequest
		if err := httpapi.ReadJSON(r, &request); err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "invalid_json", "Payload invalido.")
			return
		}

		result, err := service.Create(r.Context(), access, CreateInput{
			StoreID:        request.StoreID,
			Name:           request.Name,
			RoleLabel:      request.Role,
			Color:          request.Color,
			MonthlyGoal:    request.MonthlyGoal,
			CommissionRate: request.CommissionRate,
			ConversionGoal: request.ConversionGoal,
			AvgTicketGoal:  request.AvgTicketGoal,
			PAGoal:         request.PAGoal,
		})
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusCreated, consultantResponse{Consultant: result.Consultant, Access: result.Access})
	})

	registerRoute("PATCH /v1/consultants/{id}", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		var request updateRequest
		if err := httpapi.ReadJSON(r, &request); err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "invalid_json", "Payload invalido.")
			return
		}

		monthlyGoal, err := parseOptionalNumber(request.MonthlyGoal)
		if err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "validation_error", "Campo monthlyGoal invalido.")
			return
		}

		commissionRate, err := parseOptionalNumber(request.CommissionRate)
		if err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "validation_error", "Campo commissionRate invalido.")
			return
		}

		conversionGoal, err := parseOptionalNumber(request.ConversionGoal)
		if err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "validation_error", "Campo conversionGoal invalido.")
			return
		}

		avgTicketGoal, err := parseOptionalNumber(request.AvgTicketGoal)
		if err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "validation_error", "Campo avgTicketGoal invalido.")
			return
		}

		paGoal, err := parseOptionalNumber(request.PAGoal)
		if err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "validation_error", "Campo paGoal invalido.")
			return
		}

		consultant, err := service.Update(r.Context(), access, UpdateInput{
			ID:             strings.TrimSpace(r.PathValue("id")),
			Name:           request.Name,
			RoleLabel:      request.Role,
			Color:          request.Color,
			MonthlyGoal:    monthlyGoal,
			CommissionRate: commissionRate,
			ConversionGoal: conversionGoal,
			AvgTicketGoal:  avgTicketGoal,
			PAGoal:         paGoal,
		})
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, consultantResponse{Consultant: consultant})
	})

	registerRoute("POST /v1/consultants/{id}/archive", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		if err := service.Archive(r.Context(), access, strings.TrimSpace(r.PathValue("id"))); err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
	})
}

func writeAccessError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, ErrUnauthorized):
		httpapi.WriteError(w, r, http.StatusUnauthorized, "unauthorized", "Autenticacao obrigatoria.")
	case errors.Is(err, ErrForbidden):
		httpapi.WriteError(w, r, http.StatusForbidden, "forbidden", "Sem permissao para acessar este recurso.")
	default:
		httpapi.WriteError(w, r, http.StatusInternalServerError, "internal_error", "Erro ao resolver o contexto do consultor.")
	}
}

func writeServiceError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, ErrUnauthorized):
		httpapi.WriteError(w, r, http.StatusUnauthorized, "unauthorized", "Autenticacao obrigatoria.")
	case errors.Is(err, ErrForbidden):
		httpapi.WriteError(w, r, http.StatusForbidden, "forbidden", "Sem permissao para acessar este recurso.")
	case errors.Is(err, ErrStoreRequired), errors.Is(err, ErrValidation):
		httpapi.WriteError(w, r, http.StatusBadRequest, "validation_error", "Verifique os dados do consultor.")
	case errors.Is(err, ErrStoreNotFound):
		httpapi.WriteError(w, r, http.StatusNotFound, "store_not_found", "Loja nao encontrada.")
	case errors.Is(err, ErrConsultantNotFound):
		httpapi.WriteError(w, r, http.StatusNotFound, "consultant_not_found", "Consultor nao encontrado.")
	case errors.Is(err, ErrConsultantConflict):
		httpapi.WriteError(w, r, http.StatusConflict, "consultant_conflict", "Ja existe um consultor ativo com esse nome na loja.")
	case errors.Is(err, ErrAccessConflict):
		httpapi.WriteError(w, r, http.StatusConflict, "consultant_access_conflict", "Nao foi possivel gerar um acesso unico para este consultor.")
	case errors.Is(err, ErrAccessProvisioning):
		httpapi.WriteError(w, r, http.StatusInternalServerError, "consultant_access_provisioning_failed", "O consultor foi validado, mas o acesso vinculado nao conseguiu ser provisionado.")
	default:
		httpapi.WriteError(w, r, http.StatusInternalServerError, "internal_error", "Erro ao processar o consultor.")
	}
}

func parseOptionalNumber(raw any) (*float64, error) {
	if raw == nil {
		return nil, nil
	}

	switch value := raw.(type) {
	case float64:
		return &value, nil
	case string:
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return nil, nil
		}

		parsed, err := strconv.ParseFloat(trimmed, 64)
		if err != nil {
			return nil, err
		}

		return &parsed, nil
	default:
		return nil, ErrValidation
	}
}
