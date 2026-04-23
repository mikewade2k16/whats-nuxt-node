package operations

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

	registerMutationRoute := func(pattern string, handler func(http.ResponseWriter, *http.Request, AccessContext)) {
		registerReadRoute(pattern, func(w http.ResponseWriter, r *http.Request, access AccessContext) {
			if !CanMutateOperationsRole(access.Role) {
				httpapi.WriteError(w, r, http.StatusForbidden, "forbidden", "Este acesso pode apenas visualizar a operacao da loja.")
				return
			}

			handler(w, r, access)
		})
	}

	registerReadRoute("GET /v1/operations/overview", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		overview, err := service.Overview(r.Context(), access)
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, overview)
	})

	registerReadRoute("GET /v1/operations/snapshot", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		includeHistory := true
		if raw := strings.TrimSpace(r.URL.Query().Get("includeHistory")); raw != "" {
			parsed, err := strconv.ParseBool(raw)
			if err == nil {
				includeHistory = parsed
			}
		}

		includeActivitySessions := false
		if raw := strings.TrimSpace(r.URL.Query().Get("includeActivitySessions")); raw != "" {
			parsed, err := strconv.ParseBool(raw)
			if err == nil {
				includeActivitySessions = parsed
			}
		}

		snapshot, err := service.Snapshot(r.Context(), access, strings.TrimSpace(r.URL.Query().Get("storeId")), SnapshotLoadOptions{
			IncludeHistory:          includeHistory,
			IncludeActivitySessions: includeActivitySessions,
		})
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, snapshot)
	})

	registerMutationRoute("POST /v1/operations/queue", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		var input QueueCommandInput
		if err := httpapi.ReadJSON(r, &input); err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "invalid_json", "Payload invalido.")
			return
		}

		ack, err := service.AddToQueue(r.Context(), access, input)
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, ack)
	})

	registerMutationRoute("POST /v1/operations/pause", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		var input PauseCommandInput
		if err := httpapi.ReadJSON(r, &input); err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "invalid_json", "Payload invalido.")
			return
		}

		ack, err := service.Pause(r.Context(), access, input)
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, ack)
	})

	registerMutationRoute("POST /v1/operations/assign-task", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		var input AssignTaskCommandInput
		if err := httpapi.ReadJSON(r, &input); err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "invalid_json", "Payload invalido.")
			return
		}

		ack, err := service.AssignTask(r.Context(), access, input)
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, ack)
	})

	registerMutationRoute("POST /v1/operations/resume", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		var input QueueCommandInput
		if err := httpapi.ReadJSON(r, &input); err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "invalid_json", "Payload invalido.")
			return
		}

		ack, err := service.Resume(r.Context(), access, input)
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, ack)
	})

	registerMutationRoute("POST /v1/operations/start", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		var input StartCommandInput
		if err := httpapi.ReadJSON(r, &input); err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "invalid_json", "Payload invalido.")
			return
		}

		ack, err := service.Start(r.Context(), access, input)
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, ack)
	})

	registerMutationRoute("POST /v1/operations/finish", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		var input FinishCommandInput
		if err := httpapi.ReadJSON(r, &input); err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "invalid_json", "Payload invalido.")
			return
		}

		ack, err := service.Finish(r.Context(), access, input)
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, ack)
	})
}

func writeAccessError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, ErrUnauthorized):
		httpapi.WriteError(w, r, http.StatusUnauthorized, "unauthorized", "Autenticacao obrigatoria.")
	case errors.Is(err, ErrForbidden):
		httpapi.WriteError(w, r, http.StatusForbidden, "forbidden", "Sem permissao para acessar este recurso.")
	default:
		httpapi.WriteError(w, r, http.StatusInternalServerError, "internal_error", "Erro ao resolver o contexto da operacao.")
	}
}

func writeServiceError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, ErrUnauthorized):
		httpapi.WriteError(w, r, http.StatusUnauthorized, "unauthorized", "Autenticacao obrigatoria.")
	case errors.Is(err, ErrForbidden):
		httpapi.WriteError(w, r, http.StatusForbidden, "forbidden", "Sem permissao para acessar este recurso.")
	case errors.Is(err, ErrStoreRequired), errors.Is(err, ErrValidation):
		httpapi.WriteError(w, r, http.StatusBadRequest, "validation_error", "Verifique os dados da operacao.")
	case errors.Is(err, ErrConsultantBusy):
		httpapi.WriteError(w, r, http.StatusConflict, "consultant_busy", "O consultor ja esta em atendimento e nao pode ser deslocado agora.")
	case errors.Is(err, ErrStoreNotFound):
		httpapi.WriteError(w, r, http.StatusNotFound, "store_not_found", "Loja nao encontrada.")
	case errors.Is(err, ErrConsultantNotFound):
		httpapi.WriteError(w, r, http.StatusNotFound, "consultant_not_found", "Consultor nao encontrado.")
	default:
		httpapi.WriteError(w, r, http.StatusInternalServerError, "internal_error", "Erro ao processar a operacao.")
	}
}
