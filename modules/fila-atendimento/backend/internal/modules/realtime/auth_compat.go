package realtime

import (
	"context"
	"errors"
	"strings"

	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/auth"
	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/operations"
	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/stores"
	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/tenants"
	modulecontracts "github.com/mikewade2k16/lista-da-vez/back/moduleapi/contracts"
)

type tokenAuthenticator interface {
	AuthenticateToken(ctx context.Context, token string) (auth.Principal, error)
}

type accessibleStoreFinder interface {
	FindAccessible(ctx context.Context, principal auth.Principal, storeID string) (stores.StoreView, error)
}

type accessibleTenantLister interface {
	ListAccessible(ctx context.Context, principal auth.Principal) ([]tenants.TenantView, error)
}

type AuthRealtimeContextResolver struct {
	authenticator tokenAuthenticator
	storeFinder   accessibleStoreFinder
	tenantLister  accessibleTenantLister
}

func NewAuthRealtimeContextResolver(authenticator tokenAuthenticator, storeFinder accessibleStoreFinder, tenantLister accessibleTenantLister) *AuthRealtimeContextResolver {
	return &AuthRealtimeContextResolver{
		authenticator: authenticator,
		storeFinder:   storeFinder,
		tenantLister:  tenantLister,
	}
}

func (resolver *AuthRealtimeContextResolver) SetStoreFinder(storeFinder accessibleStoreFinder) {
	resolver.storeFinder = storeFinder
}

func (resolver *AuthRealtimeContextResolver) ResolveRealtimeContext(ctx context.Context, token string) (RealtimeContext, error) {
	if resolver == nil || resolver.authenticator == nil {
		return RealtimeContext{}, ErrUnauthorized
	}

	principal, err := resolver.authenticator.AuthenticateToken(ctx, strings.TrimSpace(token))
	if err != nil {
		return RealtimeContext{}, mapAuthError(err)
	}

	access := AccessContextFromPrincipal(principal)
	scopes, err := resolver.buildScopes(ctx, principal, access)
	if err != nil {
		return RealtimeContext{}, err
	}

	return RealtimeContext{
		Access: access,
		Scopes: scopes,
	}, nil
}

func (resolver *AuthRealtimeContextResolver) CanSubscribe(ctx context.Context, access AccessContext, scope RealtimeSubscriptionScope) (bool, error) {
	if resolver == nil {
		return false, ErrUnauthorized
	}

	switch strings.TrimSpace(scope.Channel) {
	case RealtimeChannelOperations:
		if !operations.CanAccessOperationsRole(access.Role) {
			return false, nil
		}

		storeID := strings.TrimSpace(scope.StoreID)
		if storeID == "" {
			return false, ErrStoreRequired
		}

		if resolver.storeFinder == nil {
			return false, errors.New("realtime: store finder unavailable")
		}

		_, err := resolver.storeFinder.FindAccessible(ctx, principalFromAccessContext(access), storeID)
		if err != nil {
			switch {
			case errors.Is(err, stores.ErrForbidden):
				return false, nil
			case errors.Is(err, stores.ErrStoreNotFound):
				return false, ErrStoreNotFound
			default:
				return false, err
			}
		}

		return true, nil
	case RealtimeChannelContext:
		tenantID := strings.TrimSpace(scope.TenantID)
		if tenantID == "" {
			return false, ErrTenantRequired
		}

		if strings.TrimSpace(access.TenantID) != "" {
			return strings.TrimSpace(access.TenantID) == tenantID, nil
		}

		if strings.TrimSpace(access.Role) != operations.RolePlatformAdmin {
			return false, nil
		}

		if resolver.tenantLister == nil {
			return false, errors.New("realtime: tenant lister unavailable")
		}

		tenantViews, err := resolver.tenantLister.ListAccessible(ctx, principalFromAccessContext(access))
		if err != nil {
			return false, err
		}

		for _, tenantView := range tenantViews {
			if strings.TrimSpace(tenantView.ID) == tenantID {
				return true, nil
			}
		}

		return false, nil
	default:
		return false, ErrValidation
	}
}

func AccessContextFromPrincipal(principal auth.Principal) AccessContext {
	return modulecontracts.NewAccessContext(
		modulecontracts.ActorContext{
			UserID:      principal.UserID,
			DisplayName: principal.DisplayName,
			Email:       principal.Email,
			Role:        string(principal.Role),
			StoreIDs:    append([]string{}, principal.StoreIDs...),
		},
		modulecontracts.TenantContext{TenantID: principal.TenantID},
		modulecontracts.AccessPolicy{},
	)
}

func principalFromAccessContext(access AccessContext) auth.Principal {
	return auth.Principal{
		UserID:      strings.TrimSpace(access.UserID),
		DisplayName: strings.TrimSpace(access.DisplayName),
		Email:       strings.TrimSpace(access.Email),
		Role:        auth.Role(strings.TrimSpace(access.Role)),
		TenantID:    strings.TrimSpace(access.TenantID),
		StoreIDs:    append([]string{}, access.StoreIDs...),
	}
}

func mapAuthError(err error) error {
	switch {
	case errors.Is(err, auth.ErrUnauthorized), errors.Is(err, auth.ErrUserInactive):
		return ErrUnauthorized
	default:
		return err
	}
}

func (resolver *AuthRealtimeContextResolver) buildScopes(ctx context.Context, principal auth.Principal, access AccessContext) ([]RealtimeSubscriptionScope, error) {
	scopes := make([]RealtimeSubscriptionScope, 0, len(access.StoreIDs)+1)
	for _, storeID := range access.StoreIDs {
		normalizedStoreID := strings.TrimSpace(storeID)
		if normalizedStoreID == "" {
			continue
		}

		scopes = append(scopes, RealtimeSubscriptionScope{
			Channel: RealtimeChannelOperations,
			StoreID: normalizedStoreID,
		})
	}

	if strings.TrimSpace(access.TenantID) != "" {
		scopes = append(scopes, RealtimeSubscriptionScope{
			Channel:  RealtimeChannelContext,
			TenantID: strings.TrimSpace(access.TenantID),
		})
		return scopes, nil
	}

	if resolver.tenantLister == nil {
		return scopes, nil
	}

	tenantViews, err := resolver.tenantLister.ListAccessible(ctx, principal)
	if err != nil {
		return nil, err
	}

	for _, tenantView := range tenantViews {
		normalizedTenantID := strings.TrimSpace(tenantView.ID)
		if normalizedTenantID == "" {
			continue
		}

		scopes = append(scopes, RealtimeSubscriptionScope{
			Channel:  RealtimeChannelContext,
			TenantID: normalizedTenantID,
		})
	}

	return scopes, nil
}
