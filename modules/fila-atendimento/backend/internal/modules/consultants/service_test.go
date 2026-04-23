package consultants

import (
	"context"
	"testing"
)

type repositoryStub struct {
	created           Consultant
	updated           Consultant
	found             []Consultant
	deletedIDs        []string
	archivedIDs       []string
	createErr         error
	updateErr         error
	findErr           error
	archiveErr        error
	deleteErr         error
	listRows          []Consultant
	listStoreID       string
	createdConsultant Consultant
	updatedConsultant Consultant
}

func (stub *repositoryStub) ListByStore(_ context.Context, storeID string) ([]Consultant, error) {
	stub.listStoreID = storeID
	return stub.listRows, nil
}

func (stub *repositoryStub) FindByID(_ context.Context, _ string) (Consultant, error) {
	if stub.findErr != nil {
		return Consultant{}, stub.findErr
	}

	if len(stub.found) == 0 {
		return Consultant{}, ErrConsultantNotFound
	}

	result := stub.found[0]
	stub.found = stub.found[1:]
	return result, nil
}

func (stub *repositoryStub) SyncLinkedIdentity(context.Context, string, string, string) error {
	return nil
}

func (stub *repositoryStub) Create(_ context.Context, consultant Consultant) (Consultant, error) {
	stub.createdConsultant = consultant
	if stub.createErr != nil {
		return Consultant{}, stub.createErr
	}

	return stub.created, nil
}

func (stub *repositoryStub) Update(_ context.Context, consultant Consultant) (Consultant, error) {
	stub.updatedConsultant = consultant
	if stub.updateErr != nil {
		return Consultant{}, stub.updateErr
	}

	return stub.updated, nil
}

func (stub *repositoryStub) Delete(_ context.Context, consultantID string) error {
	stub.deletedIDs = append(stub.deletedIDs, consultantID)
	return stub.deleteErr
}

func (stub *repositoryStub) Archive(_ context.Context, consultantID string) error {
	stub.archivedIDs = append(stub.archivedIDs, consultantID)
	return stub.archiveErr
}

type storeCatalogProviderStub struct {
	store   StoreCatalogView
	err     error
	storeID string
	access  AccessContext
}

func (stub *storeCatalogProviderStub) ListAccessibleStores(context.Context, AccessContext, StoreCatalogFilter) ([]StoreCatalogView, error) {
	return nil, nil
}

func (stub *storeCatalogProviderStub) FindAccessibleStore(_ context.Context, access AccessContext, storeID string) (StoreCatalogView, error) {
	stub.access = access
	stub.storeID = storeID
	return stub.store, stub.err
}

func TestCreateKeepsConsultantScopedToStoreWithoutProvisioningAccess(t *testing.T) {
	repository := &repositoryStub{
		created: Consultant{ID: "consult-1", StoreID: "store-1", TenantID: "tenant-1", Name: "Maria Silva", Color: "#168aad", Initials: "MS", Active: true},
		found:   []Consultant{{ID: "consult-1", StoreID: "store-1", TenantID: "tenant-1", Name: "Maria Silva", Color: "#168aad", Initials: "MS", Active: true}},
	}
	storeCatalog := &storeCatalogProviderStub{store: StoreCatalogView{ID: "store-1", TenantID: "tenant-1", Code: "loja"}}
	service := NewService(repository, storeCatalog)

	result, err := service.Create(context.Background(), AccessContext{Role: RoleOwner, TenantID: "tenant-1"}, CreateInput{
		StoreID: "store-1",
		Name:    "Maria Silva",
	})
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}

	if repository.createdConsultant.StoreID != "store-1" || repository.createdConsultant.TenantID != "tenant-1" {
		t.Fatalf("unexpected created consultant: %+v", repository.createdConsultant)
	}

	if result.Consultant.Access != nil {
		t.Fatalf("did not expect linked consultant access, got %+v", result.Consultant.Access)
	}

	if len(repository.deletedIDs) != 0 {
		t.Fatalf("did not expect cleanup delete, got %+v", repository.deletedIDs)
	}
}

func TestArchiveDoesNotDependOnLinkedIdentity(t *testing.T) {
	repository := &repositoryStub{
		found: []Consultant{{ID: "consult-1", StoreID: "store-1", TenantID: "tenant-1", UserID: "user-1", Name: "Maria Silva", Color: "#168aad", Initials: "MS", Active: true}},
	}
	storeCatalog := &storeCatalogProviderStub{store: StoreCatalogView{ID: "store-1", TenantID: "tenant-1", Code: "loja"}}
	service := NewService(repository, storeCatalog)

	if err := service.Archive(context.Background(), AccessContext{Role: RoleOwner, TenantID: "tenant-1"}, "consult-1"); err != nil {
		t.Fatalf("Archive returned error: %v", err)
	}

	if len(repository.archivedIDs) != 1 || repository.archivedIDs[0] != "consult-1" {
		t.Fatalf("expected archive call, got %+v", repository.archivedIDs)
	}
}
