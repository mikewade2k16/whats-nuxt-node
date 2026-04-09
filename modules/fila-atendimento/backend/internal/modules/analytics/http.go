package analytics

import (
	"errors"
	"net/http"
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

	registerReadRoute("GET /v1/analytics/ranking", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		response, err := service.Ranking(r.Context(), access, strings.TrimSpace(r.URL.Query().Get("storeId")))
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, response)
	})

	registerReadRoute("GET /v1/analytics/data", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		response, err := service.Data(r.Context(), access, strings.TrimSpace(r.URL.Query().Get("storeId")))
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, response)
	})

	registerReadRoute("GET /v1/analytics/intelligence", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		response, err := service.Intelligence(r.Context(), access, strings.TrimSpace(r.URL.Query().Get("storeId")))
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
		httpapi.WriteError(w, r, http.StatusInternalServerError, "internal_error", "Erro ao resolver o contexto do analytics.")
	}
}

func writeServiceError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, stores.ErrForbidden):
		httpapi.WriteError(w, r, http.StatusForbidden, "forbidden", "Sem permissao para acessar este recurso.")
	case errors.Is(err, stores.ErrStoreNotFound):
		httpapi.WriteError(w, r, http.StatusNotFound, "store_not_found", "Loja nao encontrada.")
	case errors.Is(err, ErrStoreRequired):
		httpapi.WriteError(w, r, http.StatusBadRequest, "validation_error", "Informe a loja para carregar o analytics.")
	default:
		httpapi.WriteError(w, r, http.StatusInternalServerError, "internal_error", "Erro ao processar o analytics.")
	}
}
