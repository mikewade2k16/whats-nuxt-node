package settings

import (
	"context"
	"net/http"

	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/auth"
	modulecontracts "github.com/mikewade2k16/lista-da-vez/back/moduleapi/contracts"
)

type authAccessContextResolver struct{}

func NewAuthAccessContextResolver() modulecontracts.AccessContextResolver {
	return authAccessContextResolver{}
}

func (authAccessContextResolver) ResolveAccessContext(ctx context.Context) (AccessContext, error) {
	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return AccessContext{}, ErrUnauthorized
	}

	return AccessContextFromPrincipal(principal), nil
}

func AccessContextFromPrincipal(principal auth.Principal) AccessContext {
	return modulecontracts.NewAccessContext(
		modulecontracts.ActorContext{
			UserID:   principal.UserID,
			Role:     string(principal.Role),
			StoreIDs: append([]string{}, principal.StoreIDs...),
		},
		modulecontracts.TenantContext{TenantID: principal.TenantID},
		modulecontracts.AccessPolicy{},
	)
}

func AuthRouteGuard(middleware *auth.Middleware) RouteGuard {
	if middleware == nil {
		return nil
	}

	return func(next http.Handler) http.Handler {
		return middleware.RequireAuth(next)
	}
}

func RegisterRoutes(mux *http.ServeMux, service *Service, middleware *auth.Middleware) {
	RegisterRoutesWithOptions(mux, service, HTTPRouteOptions{
		RequireAuth:    AuthRouteGuard(middleware),
		AccessResolver: NewAuthAccessContextResolver(),
	})
}
