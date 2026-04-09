package users

import (
	"context"
	"testing"

	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/auth"
)

type serviceTestRepository struct {
	user                   User
	updatedUser            User
	upsertedShellGrantUser User
	updateCalled           bool
	createCalled           bool
	upsertShellGrantCalled bool
	storeScopes            []StoreScope
	findErr                error
	findByCoreErr          error
	updateErr              error
	createErr              error
	upsertShellGrantErr    error
	resolveErr             error
}

func (repository *serviceTestRepository) ListAccessible(ctx context.Context, principal auth.Principal, input ListInput) ([]User, error) {
	return nil, nil
}

func (repository *serviceTestRepository) FindAccessibleByID(ctx context.Context, principal auth.Principal, userID string) (User, error) {
	if repository.findErr != nil {
		return User{}, repository.findErr
	}

	return repository.user, nil
}

func (repository *serviceTestRepository) FindAccessibleByCoreUserID(ctx context.Context, principal auth.Principal, coreUserID string) (User, error) {
	if repository.findByCoreErr != nil {
		return User{}, repository.findByCoreErr
	}

	if repository.user.CoreUserID != "" && repository.user.CoreUserID != coreUserID {
		return User{}, ErrNotFound
	}

	return repository.user, nil
}

func (repository *serviceTestRepository) ResolveStoreScopes(ctx context.Context, storeIDs []string) ([]StoreScope, error) {
	if repository.resolveErr != nil {
		return nil, repository.resolveErr
	}

	return repository.storeScopes, nil
}

func (repository *serviceTestRepository) Create(ctx context.Context, user User, passwordHash *string) (User, error) {
	repository.createCalled = true
	if repository.createErr != nil {
		return User{}, repository.createErr
	}

	return user, nil
}

func (repository *serviceTestRepository) Update(ctx context.Context, user User, passwordHash *string) (User, error) {
	repository.updateCalled = true
	repository.updatedUser = user
	if repository.updateErr != nil {
		return User{}, repository.updateErr
	}

	if passwordHash != nil {
		user.HasPassword = true
	}

	return user, nil
}

func (repository *serviceTestRepository) UpsertShellGrant(ctx context.Context, user User) (User, error) {
	repository.upsertShellGrantCalled = true
	repository.upsertedShellGrantUser = user
	if repository.upsertShellGrantErr != nil {
		return User{}, repository.upsertShellGrantErr
	}

	return user, nil
}

type serviceTestHasher struct{}

func (serviceTestHasher) Hash(password string) (string, error) {
	return "hashed:" + password, nil
}

func (serviceTestHasher) Verify(hash, password string) error {
	return nil
}

func TestCreateRejectsConsultantRoleInUsersModule(t *testing.T) {
	repository := &serviceTestRepository{}
	service := NewService(repository, serviceTestHasher{}, nil, nil, nil)

	_, err := service.Create(context.Background(), auth.Principal{
		UserID:   "owner-1",
		Role:     auth.RoleOwner,
		TenantID: "tenant-1",
	}, CreateInput{
		DisplayName: "Consultor",
		Email:       "consultor@demo.local",
		Role:        auth.RoleConsultant,
		StoreIDs:    []string{"store-1"},
	})
	if err != ErrConsultantManaged {
		t.Fatalf("expected ErrConsultantManaged, got %v", err)
	}
	if repository.createCalled {
		t.Fatalf("expected repository.Create not to be called")
	}
}

func TestUpdateRejectsManagedConsultant(t *testing.T) {
	repository := &serviceTestRepository{
		user: User{
			ID:                "user-1",
			DisplayName:       "Consultor",
			Email:             "consultor@demo.local",
			Role:              auth.RoleConsultant,
			TenantID:          "tenant-1",
			StoreIDs:          []string{"store-1"},
			Active:            true,
			HasPassword:       true,
			ManagedBy:         "consultants",
			ManagedResourceID: "consultant-1",
		},
	}
	service := NewService(repository, serviceTestHasher{}, nil, nil, nil)
	newName := "Consultor Editado"

	_, err := service.Update(context.Background(), auth.Principal{
		UserID:   "owner-1",
		Role:     auth.RoleOwner,
		TenantID: "tenant-1",
	}, UpdateInput{
		ID:          "user-1",
		DisplayName: &newName,
	})
	if err != ErrConsultantManaged {
		t.Fatalf("expected ErrConsultantManaged, got %v", err)
	}
	if repository.updateCalled {
		t.Fatalf("expected repository.Update not to be called")
	}
}

func TestArchiveRejectsManagedConsultant(t *testing.T) {
	repository := &serviceTestRepository{
		user: User{
			ID:                "user-1",
			DisplayName:       "Consultor",
			Email:             "consultor@demo.local",
			Role:              auth.RoleConsultant,
			TenantID:          "tenant-1",
			StoreIDs:          []string{"store-1"},
			Active:            true,
			ManagedBy:         "consultants",
			ManagedResourceID: "consultant-1",
		},
	}
	service := NewService(repository, serviceTestHasher{}, nil, nil, nil)

	_, err := service.Archive(context.Background(), auth.Principal{
		UserID:   "owner-1",
		Role:     auth.RoleOwner,
		TenantID: "tenant-1",
	}, "user-1")
	if err != ErrConsultantManaged {
		t.Fatalf("expected ErrConsultantManaged, got %v", err)
	}
	if repository.updateCalled {
		t.Fatalf("expected repository.Update not to be called")
	}
}

func TestResetPasswordKeepsAdministrativePathForManagedConsultant(t *testing.T) {
	repository := &serviceTestRepository{
		user: User{
			ID:                "user-1",
			DisplayName:       "Consultor",
			Email:             "consultor@demo.local",
			Role:              auth.RoleConsultant,
			TenantID:          "tenant-1",
			StoreIDs:          []string{"store-1"},
			Active:            true,
			HasPassword:       true,
			ManagedBy:         "consultants",
			ManagedResourceID: "consultant-1",
		},
	}
	service := NewService(repository, serviceTestHasher{}, nil, nil, nil)

	result, err := service.ResetPassword(context.Background(), auth.Principal{
		UserID:   "owner-1",
		Role:     auth.RoleOwner,
		TenantID: "tenant-1",
	}, "user-1", "NovaSenha123")
	if err != nil {
		t.Fatalf("expected reset to succeed, got %v", err)
	}
	if !repository.updateCalled {
		t.Fatalf("expected repository.Update to be called")
	}
	if !repository.updatedUser.MustChangePassword {
		t.Fatalf("expected managed consultant reset to require password change")
	}
	if result.TemporaryPassword != "NovaSenha123" {
		t.Fatalf("unexpected temporary password result: %q", result.TemporaryPassword)
	}
}

func TestUpsertShellGrantUsesCoreUserIdentity(t *testing.T) {
	repository := &serviceTestRepository{
		findByCoreErr: ErrNotFound,
		storeScopes: []StoreScope{{
			ID:       "store-1",
			TenantID: "tenant-1",
			Active:   true,
		}},
	}
	service := NewService(repository, serviceTestHasher{}, nil, nil, nil)

	result, err := service.UpsertShellGrant(context.Background(), auth.Principal{
		UserID:   "owner-1",
		Role:     auth.RoleOwner,
		TenantID: "tenant-1",
	}, UpsertShellGrantInput{
		CoreUserID:  "42",
		DisplayName: "Usuario Shell",
		Email:       "shell@demo.local",
		Role:        auth.RoleManager,
		StoreIDs:    []string{"store-1"},
	})
	if err != nil {
		t.Fatalf("expected shell grant upsert to succeed, got %v", err)
	}
	if !repository.upsertShellGrantCalled {
		t.Fatalf("expected repository.UpsertShellGrant to be called")
	}
	if repository.upsertedShellGrantUser.CoreUserID != "42" {
		t.Fatalf("expected core user id 42, got %q", repository.upsertedShellGrantUser.CoreUserID)
	}
	if repository.upsertedShellGrantUser.Role != auth.RoleManager {
		t.Fatalf("expected role manager, got %q", repository.upsertedShellGrantUser.Role)
	}
	if result.CoreUserID != "42" {
		t.Fatalf("expected result core user id 42, got %q", result.CoreUserID)
	}
}

func TestResetPasswordRejectsShellManagedIdentity(t *testing.T) {
	repository := &serviceTestRepository{
		user: User{
			ID:         "user-1",
			CoreUserID: "42",
			Email:      "shell@demo.local",
			Role:       auth.RoleOwner,
			TenantID:   "tenant-1",
			Active:     true,
		},
	}
	service := NewService(repository, serviceTestHasher{}, nil, nil, nil)

	_, err := service.ResetPassword(context.Background(), auth.Principal{
		UserID:   "owner-1",
		Role:     auth.RoleOwner,
		TenantID: "tenant-1",
	}, "user-1", "NovaSenha123")
	if err != ErrShellManaged {
		t.Fatalf("expected ErrShellManaged, got %v", err)
	}
	if repository.updateCalled {
		t.Fatalf("expected repository.Update not to be called")
	}
}
