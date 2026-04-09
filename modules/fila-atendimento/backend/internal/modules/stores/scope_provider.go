package stores

import (
	"context"
	"strings"

	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/auth"
	modulecontracts "github.com/mikewade2k16/lista-da-vez/back/moduleapi/contracts"
)

type ScopeProvider struct {
	service *Service
}

func NewScopeProvider(service *Service) *ScopeProvider {
	return &ScopeProvider{service: service}
}

func (provider *ScopeProvider) ListAccessible(
	ctx context.Context,
	access modulecontracts.AccessContext,
	filter modulecontracts.StoreScopeFilter,
) ([]modulecontracts.StoreScopeView, error) {
	if provider == nil || provider.service == nil {
		return nil, nil
	}

	rows, err := provider.service.ListAccessible(ctx, principalFromAccessContext(access), ListInput{
		TenantID: strings.TrimSpace(filter.TenantID),
	})
	if err != nil {
		return nil, err
	}

	result := make([]modulecontracts.StoreScopeView, 0, len(rows))
	for _, row := range rows {
		result = append(result, modulecontracts.StoreScopeView{
			ID:       row.ID,
			TenantID: row.TenantID,
			Code:     row.Code,
			Name:     row.Name,
			City:     row.City,
		})
	}

	return result, nil
}

func principalFromAccessContext(access modulecontracts.AccessContext) auth.Principal {
	return auth.Principal{
		UserID:   strings.TrimSpace(access.UserID),
		TenantID: strings.TrimSpace(access.TenantID),
		Role:     auth.Role(strings.TrimSpace(access.Role)),
		StoreIDs: append([]string{}, access.StoreIDs...),
	}
}
