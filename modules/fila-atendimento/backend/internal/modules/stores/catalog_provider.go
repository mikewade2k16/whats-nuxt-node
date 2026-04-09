package stores

import (
	"context"
	"strings"

	modulecontracts "github.com/mikewade2k16/lista-da-vez/back/moduleapi/contracts"
)

type CatalogProvider struct {
	service *Service
}

func NewCatalogProvider(service *Service) *CatalogProvider {
	return &CatalogProvider{service: service}
}

func (provider *CatalogProvider) ListAccessibleStores(
	ctx context.Context,
	access modulecontracts.AccessContext,
	filter modulecontracts.StoreCatalogFilter,
) ([]modulecontracts.StoreCatalogView, error) {
	if provider == nil || provider.service == nil {
		return nil, nil
	}

	rows, err := provider.service.ListAccessible(ctx, principalFromAccessContext(access), ListInput{
		TenantID:        strings.TrimSpace(filter.TenantID),
		IncludeInactive: filter.IncludeInactive,
	})
	if err != nil {
		return nil, err
	}

	result := make([]modulecontracts.StoreCatalogView, 0, len(rows))
	for _, row := range rows {
		result = append(result, storeCatalogViewFromStoreView(row))
	}

	return result, nil
}

func (provider *CatalogProvider) FindAccessibleStore(
	ctx context.Context,
	access modulecontracts.AccessContext,
	storeID string,
) (modulecontracts.StoreCatalogView, error) {
	if provider == nil || provider.service == nil {
		return modulecontracts.StoreCatalogView{}, nil
	}

	row, err := provider.service.FindAccessible(ctx, principalFromAccessContext(access), strings.TrimSpace(storeID))
	if err != nil {
		return modulecontracts.StoreCatalogView{}, err
	}

	return storeCatalogViewFromStoreView(row), nil
}

func storeCatalogViewFromStoreView(row StoreView) modulecontracts.StoreCatalogView {
	return modulecontracts.StoreCatalogView{
		ID:                row.ID,
		TenantID:          row.TenantID,
		Code:              row.Code,
		Name:              row.Name,
		City:              row.City,
		Active:            row.Active,
		DefaultTemplateID: row.DefaultTemplateID,
		MonthlyGoal:       row.MonthlyGoal,
		WeeklyGoal:        row.WeeklyGoal,
		AvgTicketGoal:     row.AvgTicketGoal,
		ConversionGoal:    row.ConversionGoal,
		PAGoal:            row.PAGoal,
	}
}
