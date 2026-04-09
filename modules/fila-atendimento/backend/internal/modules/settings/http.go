package settings

import (
	"errors"
	"net/http"
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

	registerRoute("GET /v1/settings", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		bundle, err := service.GetBundle(r.Context(), access, strings.TrimSpace(r.URL.Query().Get("storeId")))
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, bundle)
	})

	registerRoute("PUT /v1/settings", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		var bundle Bundle
		if err := httpapi.ReadJSON(r, &bundle); err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "invalid_json", "Payload invalido.")
			return
		}

		ack, err := service.SaveBundle(r.Context(), access, bundle)
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, ack)
	})

	registerRoute("PATCH /v1/settings/operation", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		var input OperationSectionInput
		if err := httpapi.ReadJSON(r, &input); err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "invalid_json", "Payload invalido.")
			return
		}

		ack, err := service.SaveOperationSection(r.Context(), access, input)
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, ack)
	})

	registerRoute("PATCH /v1/settings/modal", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		var input ModalSectionInput
		if err := httpapi.ReadJSON(r, &input); err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "invalid_json", "Payload invalido.")
			return
		}

		ack, err := service.SaveModalSection(r.Context(), access, input)
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, ack)
	})

	registerRoute("POST /v1/settings/options/{group}", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		var input OptionItemInput
		if err := httpapi.ReadJSON(r, &input); err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "invalid_json", "Payload invalido.")
			return
		}

		optionGroup, err := normalizeOptionGroupPath(r.PathValue("group"))
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		ack, err := service.SaveOptionItem(r.Context(), access, input.StoreID, optionGroup, input.Item)
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusCreated, ack)
	})

	registerRoute("PATCH /v1/settings/options/{group}/{itemId}", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		var input OptionItemPatchInput
		if err := httpapi.ReadJSON(r, &input); err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "invalid_json", "Payload invalido.")
			return
		}

		optionGroup, err := normalizeOptionGroupPath(r.PathValue("group"))
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		ack, err := service.SaveOptionItem(r.Context(), access, input.StoreID, optionGroup, OptionItem{
			ID:    strings.TrimSpace(r.PathValue("itemId")),
			Label: input.Label,
		})
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, ack)
	})

	registerRoute("DELETE /v1/settings/options/{group}/{itemId}", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		optionGroup, err := normalizeOptionGroupPath(r.PathValue("group"))
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		ack, err := service.DeleteOptionItem(
			r.Context(),
			access,
			strings.TrimSpace(r.URL.Query().Get("storeId")),
			optionGroup,
			r.PathValue("itemId"),
		)
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, ack)
	})

	registerRoute("PUT /v1/settings/options/{group}", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		var input OptionSectionInput
		if err := httpapi.ReadJSON(r, &input); err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "invalid_json", "Payload invalido.")
			return
		}

		optionGroup, err := normalizeOptionGroupPath(r.PathValue("group"))
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		ack, err := service.SaveOptionSection(r.Context(), access, input.StoreID, optionGroup, input.Items)
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, ack)
	})

	registerRoute("POST /v1/settings/products", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		var input ProductItemInput
		if err := httpapi.ReadJSON(r, &input); err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "invalid_json", "Payload invalido.")
			return
		}

		ack, err := service.SaveProductItem(r.Context(), access, input)
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusCreated, ack)
	})

	registerRoute("PATCH /v1/settings/products/{itemId}", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		var input ProductItemPatchInput
		if err := httpapi.ReadJSON(r, &input); err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "invalid_json", "Payload invalido.")
			return
		}

		ack, err := service.SaveProductItem(r.Context(), access, ProductItemInput{
			StoreID: input.StoreID,
			Item: ProductItem{
				ID:        strings.TrimSpace(r.PathValue("itemId")),
				Name:      input.Name,
				Code:      input.Code,
				Category:  input.Category,
				BasePrice: input.BasePrice,
			},
		})
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, ack)
	})

	registerRoute("DELETE /v1/settings/products/{itemId}", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		ack, err := service.DeleteProductItem(
			r.Context(),
			access,
			strings.TrimSpace(r.URL.Query().Get("storeId")),
			r.PathValue("itemId"),
		)
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, ack)
	})

	registerRoute("POST /v1/settings/campaigns", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		var input CampaignItemInput
		if err := httpapi.ReadJSON(r, &input); err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "invalid_json", "Payload invalido.")
			return
		}

		ack, err := service.SaveCampaignItem(r.Context(), access, input)
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusCreated, ack)
	})

	registerRoute("PATCH /v1/settings/campaigns/{itemId}", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		var input CampaignItemPatchInput
		if err := httpapi.ReadJSON(r, &input); err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "invalid_json", "Payload invalido.")
			return
		}

		ack, err := service.SaveCampaignItem(r.Context(), access, CampaignItemInput{
			StoreID: input.StoreID,
			Item: CampaignItem{
				ID:                     strings.TrimSpace(r.PathValue("itemId")),
				Name:                   input.Name,
				Description:            input.Description,
				CampaignType:           input.CampaignType,
				IsActive:               input.IsActive,
				StartsAt:               input.StartsAt,
				EndsAt:                 input.EndsAt,
				TargetOutcome:          input.TargetOutcome,
				MinSaleAmount:          input.MinSaleAmount,
				MaxServiceMinutes:      input.MaxServiceMinutes,
				ProductCodes:           input.ProductCodes,
				SourceIDs:              input.SourceIDs,
				ReasonIDs:              input.ReasonIDs,
				QueueJumpOnly:          input.QueueJumpOnly,
				ExistingCustomerFilter: input.ExistingCustomerFilter,
				BonusFixed:             input.BonusFixed,
				BonusRate:              input.BonusRate,
			},
		})
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, ack)
	})

	registerRoute("DELETE /v1/settings/campaigns/{itemId}", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		ack, err := service.DeleteCampaignItem(
			r.Context(),
			access,
			strings.TrimSpace(r.URL.Query().Get("storeId")),
			r.PathValue("itemId"),
		)
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, ack)
	})

	registerRoute("PUT /v1/settings/campaigns", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		var input CampaignSectionInput
		if err := httpapi.ReadJSON(r, &input); err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "invalid_json", "Payload invalido.")
			return
		}

		ack, err := service.SaveCampaignSection(r.Context(), access, input)
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, ack)
	})

	registerRoute("PUT /v1/settings/products", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		var input ProductSectionInput
		if err := httpapi.ReadJSON(r, &input); err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "invalid_json", "Payload invalido.")
			return
		}

		ack, err := service.SaveProductSection(r.Context(), access, input)
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
	default:
		httpapi.WriteError(w, r, http.StatusInternalServerError, "internal_error", "Erro ao resolver o contexto de configuracoes.")
	}
}

func normalizeOptionGroupPath(rawGroup string) (string, error) {
	switch strings.TrimSpace(rawGroup) {
	case "visit-reasons":
		return optionKindVisitReason, nil
	case "customer-sources":
		return optionKindCustomerSource, nil
	case "queue-jump-reasons":
		return optionKindQueueJump, nil
	case "loss-reasons":
		return optionKindLossReason, nil
	case "professions":
		return optionKindProfession, nil
	default:
		return "", ErrValidation
	}
}

func writeServiceError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, ErrForbidden):
		httpapi.WriteError(w, r, http.StatusForbidden, "forbidden", "Sem permissao para acessar este recurso.")
	case errors.Is(err, ErrStoreRequired), errors.Is(err, ErrValidation):
		httpapi.WriteError(w, r, http.StatusBadRequest, "validation_error", "Verifique os dados de configuracao.")
	case errors.Is(err, ErrStoreNotFound):
		httpapi.WriteError(w, r, http.StatusNotFound, "store_not_found", "Loja nao encontrada.")
	default:
		httpapi.WriteError(w, r, http.StatusInternalServerError, "internal_error", "Erro ao processar as configuracoes.")
	}
}
