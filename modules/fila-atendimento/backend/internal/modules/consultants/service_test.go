package consultants

import (
	"context"
	"errors"
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

type identityProvisionerStub struct {
	identityInput ConsultantIdentityInput
	consultantID  string
	identity      ProvisionedIdentity
	err           error
	deactivated   []string
}

func (stub *identityProvisionerStub) EnsureConsultantIdentity(_ context.Context, _ AccessContext, input ConsultantIdentityInput) (ProvisionedIdentity, error) {
	stub.identityInput = input
	return stub.identity, stub.err
}

func (stub *identityProvisionerStub) DeactivateConsultantIdentity(_ context.Context, _ AccessContext, consultantID string) error {
	stub.deactivated = append(stub.deactivated, consultantID)
	return stub.err
}

func TestCreateUsesIdentityProvisioner(t *testing.T) {
	repository := &repositoryStub{
		created: Consultant{ID: "consult-1", StoreID: "store-1", TenantID: "tenant-1", Name: "Maria Silva", Color: "#168aad", Initials: "MS", Active: true},
		found:   []Consultant{{ID: "consult-1", StoreID: "store-1", TenantID: "tenant-1", UserID: "user-1", AccessEmail: "maria.silva.loja@acesso.omni.local", AccessActive: true, Name: "Maria Silva", Color: "#168aad", Initials: "MS", Active: true}},
	}
	storeCatalog := &storeCatalogProviderStub{store: StoreCatalogView{ID: "store-1", TenantID: "tenant-1", Code: "loja"}}
	provisioner := &identityProvisionerStub{identity: ProvisionedIdentity{UserID: "user-1", MustChangePassword: true}}
	service := NewService(repository, storeCatalog, provisioner, "acesso.omni.local", "Omni@123")

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

	if provisioner.identityInput.ConsultantID != "consult-1" || provisioner.identityInput.Email == "" || provisioner.identityInput.Role != RoleConsultant {
		t.Fatalf("unexpected identity input: %+v", provisioner.identityInput)
	}

	if result.Access == nil || result.Access.InitialPassword != "Omni@123" {
		t.Fatalf("expected provisioned access payload, got %+v", result.Access)
	}

	if result.Consultant.Access == nil || result.Consultant.Access.UserID != "user-1" {
		t.Fatalf("expected linked consultant access, got %+v", result.Consultant.Access)
	}

	if len(repository.deletedIDs) != 0 {
		t.Fatalf("did not expect rollback delete, got %+v", repository.deletedIDs)
	}
}

func TestCreateRollsBackWhenIdentityFails(t *testing.T) {
	repository := &repositoryStub{
		created: Consultant{ID: "consult-1", StoreID: "store-1", TenantID: "tenant-1", Name: "Maria Silva", Color: "#168aad", Initials: "MS", Active: true},
	}
	storeCatalog := &storeCatalogProviderStub{store: StoreCatalogView{ID: "store-1", TenantID: "tenant-1", Code: "loja"}}
	provisioner := &identityProvisionerStub{err: ErrAccessProvisioning}
	service := NewService(repository, storeCatalog, provisioner, "acesso.omni.local", "Omni@123")

	_, err := service.Create(context.Background(), AccessContext{Role: RoleOwner, TenantID: "tenant-1"}, CreateInput{StoreID: "store-1", Name: "Maria Silva"})
	if !errors.Is(err, ErrAccessProvisioning) {
		t.Fatalf("expected ErrAccessProvisioning, got %v", err)
	}

	if len(repository.deletedIDs) != 1 || repository.deletedIDs[0] != "consult-1" {
		t.Fatalf("expected rollback delete, got %+v", repository.deletedIDs)
	}
}
