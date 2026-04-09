package stores

import (
	"context"
	"testing"

	modulecontracts "github.com/mikewade2k16/lista-da-vez/back/moduleapi/contracts"
)

func TestScopeProviderListAccessibleUsesModuleAccessContext(t *testing.T) {
	repository := &repositorySpy{}
	service := NewService(repository, nil)
	provider := NewScopeProvider(service)

	repository.listRows = []Store{
		{
			ID:       "store-1",
			TenantID: "tenant-1",
			Code:     "LOJA1",
			Name:     "Loja 1",
			City:     "Sao Paulo",
		},
	}

	rows, err := provider.ListAccessible(context.Background(), modulecontracts.AccessContext{
		UserID:   "user-1",
		TenantID: "tenant-1",
		Role:     "manager",
		StoreIDs: []string{"store-1", "store-2"},
	}, modulecontracts.StoreScopeFilter{
		TenantID: "tenant-1",
	})
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}

	if repository.listPrincipal.UserID != "user-1" {
		t.Fatalf("expected user-1, got %s", repository.listPrincipal.UserID)
	}

	if repository.listPrincipal.Role != "manager" {
		t.Fatalf("expected manager role, got %s", repository.listPrincipal.Role)
	}

	if repository.listInput.TenantID != "tenant-1" {
		t.Fatalf("expected tenant filter tenant-1, got %s", repository.listInput.TenantID)
	}

	if len(rows) != 1 || rows[0].ID != "store-1" {
		t.Fatalf("expected mapped store scope rows, got %+v", rows)
	}
}
