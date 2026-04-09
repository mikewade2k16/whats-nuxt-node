package stores

import (
	"context"
	"testing"

	modulecontracts "github.com/mikewade2k16/lista-da-vez/back/moduleapi/contracts"
)

func TestCatalogProviderListAccessibleStoresUsesModuleAccessContext(t *testing.T) {
	repository := &repositorySpy{}
	service := NewService(repository, nil)
	provider := NewCatalogProvider(service)

	repository.listRows = []Store{
		{
			ID:                "store-1",
			TenantID:          "tenant-1",
			Code:              "LOJA1",
			Name:              "Loja 1",
			City:              "Sao Paulo",
			Active:            true,
			DefaultTemplateID: "template-1",
			MonthlyGoal:       100,
			WeeklyGoal:        25,
			AvgTicketGoal:     10,
			ConversionGoal:    15,
			PAGoal:            2,
		},
	}

	rows, err := provider.ListAccessibleStores(context.Background(), modulecontracts.AccessContext{
		UserID:   "user-1",
		TenantID: "tenant-1",
		Role:     "manager",
		StoreIDs: []string{"store-1"},
	}, modulecontracts.StoreCatalogFilter{
		TenantID:        "tenant-1",
		IncludeInactive: true,
	})
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}

	if repository.listPrincipal.UserID != "user-1" {
		t.Fatalf("expected user-1, got %s", repository.listPrincipal.UserID)
	}

	if !repository.listInput.IncludeInactive {
		t.Fatalf("expected includeInactive to be forwarded")
	}

	if len(rows) != 1 || rows[0].DefaultTemplateID != "template-1" || rows[0].MonthlyGoal != 100 {
		t.Fatalf("expected mapped catalog rows, got %+v", rows)
	}
}

func TestCatalogProviderFindAccessibleStoreUsesModuleAccessContext(t *testing.T) {
	repository := &repositorySpy{
		findStore: Store{
			ID:       "store-1",
			TenantID: "tenant-1",
			Code:     "LOJA1",
			Name:     "Loja 1",
			City:     "Sao Paulo",
			Active:   true,
		},
	}
	service := NewService(repository, nil)
	provider := NewCatalogProvider(service)

	row, err := provider.FindAccessibleStore(context.Background(), modulecontracts.AccessContext{
		UserID:   "user-1",
		TenantID: "tenant-1",
		Role:     "owner",
	}, "store-1")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}

	if row.ID != "store-1" {
		t.Fatalf("expected store-1, got %s", row.ID)
	}
}
