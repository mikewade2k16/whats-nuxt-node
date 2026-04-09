package reports

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/stores"
	"github.com/mikewade2k16/lista-da-vez/back/internal/platform/httpapi"
	modulecontracts "github.com/mikewade2k16/lista-da-vez/back/moduleapi/contracts"
)

type RouteGuard func(http.Handler) http.Handler

type HTTPRouteOptions struct {
	RequireAuth    RouteGuard
	AccessResolver modulecontracts.AccessContextResolver
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

	registerReadRoute := func(pattern string, handler func(http.ResponseWriter, *http.Request, AccessContext)) {
		mux.Handle(pattern, requireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			access, err := resolveAccess(r)
			if err != nil {
				writeAccessError(w, r, err)
				return
			}

			handler(w, r, access)
		})))
	}

	registerReadRoute("GET /v1/reports/overview", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		filters, err := parseFilters(r)
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		response, err := service.Overview(r.Context(), access, filters)
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, response)
	})

	registerReadRoute("GET /v1/reports/results", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		filters, err := parseFilters(r)
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		response, err := service.Results(r.Context(), access, filters)
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, response)
	})

	registerReadRoute("GET /v1/reports/recent-services", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		filters, err := parseFilters(r)
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		response, err := service.RecentServices(r.Context(), access, filters)
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, response)
	})

	registerReadRoute("GET /v1/reports/multistore-overview", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		filters, err := parseFilters(r)
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		response, err := service.MultiStoreOverview(r.Context(), access, filters)
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, response)
	})
}

func writeAccessError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, ErrUnauthorized):
		httpapi.WriteError(w, r, http.StatusUnauthorized, "unauthorized", "Autenticacao obrigatoria.")
	default:
		httpapi.WriteError(w, r, http.StatusInternalServerError, "internal_error", "Erro ao resolver o contexto do relatorio.")
	}
}

func parseFilters(r *http.Request) (Filters, error) {
	query := r.URL.Query()

	minSaleAmount, err := parseOptionalFloat(query.Get("minSaleAmount"))
	if err != nil {
		return Filters{}, ErrValidation
	}

	maxSaleAmount, err := parseOptionalFloat(query.Get("maxSaleAmount"))
	if err != nil {
		return Filters{}, ErrValidation
	}

	page, err := parseOptionalInt(query.Get("page"))
	if err != nil {
		return Filters{}, ErrValidation
	}

	pageSize, err := parseOptionalInt(query.Get("pageSize"))
	if err != nil {
		return Filters{}, ErrValidation
	}

	return Filters{
		TenantID:              strings.TrimSpace(query.Get("tenantId")),
		StoreID:               strings.TrimSpace(query.Get("storeId")),
		DateFrom:              strings.TrimSpace(query.Get("dateFrom")),
		DateTo:                strings.TrimSpace(query.Get("dateTo")),
		ConsultantIDs:         collectQueryValues(query, "consultantId", "consultantIds"),
		Outcomes:              collectQueryValues(query, "outcome", "outcomes"),
		SourceIDs:             collectQueryValues(query, "sourceId", "sourceIds"),
		VisitReasonIDs:        collectQueryValues(query, "visitReasonId", "visitReasonIds"),
		StartModes:            collectQueryValues(query, "startMode", "startModes"),
		ExistingCustomerModes: collectQueryValues(query, "existingCustomer", "existingCustomerModes"),
		CompletionLevels:      collectQueryValues(query, "completionLevel", "completionLevels"),
		CampaignIDs:           collectQueryValues(query, "campaignId", "campaignIds"),
		MinSaleAmount:         minSaleAmount,
		MaxSaleAmount:         maxSaleAmount,
		Search:                strings.TrimSpace(query.Get("search")),
		Page:                  page,
		PageSize:              pageSize,
	}, nil
}

func writeServiceError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, stores.ErrForbidden):
		httpapi.WriteError(w, r, http.StatusForbidden, "forbidden", "Sem permissao para acessar este recurso.")
	case errors.Is(err, stores.ErrStoreNotFound):
		httpapi.WriteError(w, r, http.StatusNotFound, "store_not_found", "Loja nao encontrada.")
	case errors.Is(err, ErrStoreRequired), errors.Is(err, ErrValidation):
		httpapi.WriteError(w, r, http.StatusBadRequest, "validation_error", "Verifique os filtros do relatorio.")
	default:
		httpapi.WriteError(w, r, http.StatusInternalServerError, "internal_error", "Erro ao processar o relatorio.")
	}
}

func parseOptionalFloat(raw string) (*float64, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return nil, nil
	}

	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return nil, err
	}

	return &parsed, nil
}

func parseOptionalInt(raw string) (int, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return 0, nil
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0, err
	}

	return parsed, nil
}

func collectQueryValues(query map[string][]string, keys ...string) []string {
	values := make([]string, 0)
	for _, key := range keys {
		values = append(values, query[key]...)
	}
	return values
}
