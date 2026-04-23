package operations

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type stubOperationsRepository struct {
	lastLoadSnapshotOptions SnapshotLoadOptions
}

func (repository *stubOperationsRepository) StoreExists(_ context.Context, storeID string) (bool, error) {
	return strings.TrimSpace(storeID) != "", nil
}

func (repository *stubOperationsRepository) GetStoreName(_ context.Context, _ string) (string, error) {
	return "Loja teste", nil
}

func (repository *stubOperationsRepository) GetMaxConcurrentServices(_ context.Context, _ string) (int, error) {
	return 10, nil
}

func (repository *stubOperationsRepository) ListRoster(_ context.Context, _ string) ([]ConsultantProfile, error) {
	return []ConsultantProfile{}, nil
}

func (repository *stubOperationsRepository) LoadSnapshot(_ context.Context, _ string, options SnapshotLoadOptions) (SnapshotState, error) {
	repository.lastLoadSnapshotOptions = options
	return SnapshotState{
		ConsultantCurrentStatus: map[string]ConsultantStatus{},
	}, nil
}

func (repository *stubOperationsRepository) Persist(_ context.Context, _ PersistInput) error {
	return nil
}

type stubAccessContextResolver struct {
	access AccessContext
	err    error
}

func (resolver stubAccessContextResolver) ResolveAccessContext(_ context.Context) (AccessContext, error) {
	if resolver.err != nil {
		return AccessContext{}, resolver.err
	}

	return resolver.access, nil
}

func identityRouteGuard(next http.Handler) http.Handler {
	return next
}

func TestRegisterRoutesWithOptionsRejectsMissingAccessContext(t *testing.T) {
	mux := http.NewServeMux()
	RegisterRoutesWithOptions(mux, NewService(nil, nil, nil), HTTPRouteOptions{
		RequireAuth:    identityRouteGuard,
		AccessResolver: stubAccessContextResolver{err: ErrUnauthorized},
	})

	req := httptest.NewRequest(http.MethodGet, "/v1/operations/overview", nil)
	res := httptest.NewRecorder()
	mux.ServeHTTP(res, req)

	if res.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusUnauthorized)
	}
}

func TestRegisterRoutesWithOptionsUsesGenericResolverOnReadRoutes(t *testing.T) {
	mux := http.NewServeMux()
	RegisterRoutesWithOptions(mux, NewService(nil, nil, nil), HTTPRouteOptions{
		RequireAuth: identityRouteGuard,
		AccessResolver: stubAccessContextResolver{access: AccessContext{
			UserID:   "user-1",
			TenantID: "tenant-1",
			Role:     RoleOwner,
		}},
	})

	req := httptest.NewRequest(http.MethodGet, "/v1/operations/overview", nil)
	res := httptest.NewRecorder()
	mux.ServeHTTP(res, req)

	if res.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusForbidden)
	}

	if !strings.Contains(res.Body.String(), "forbidden") {
		t.Fatalf("body = %q, want forbidden marker", res.Body.String())
	}
}

func TestRegisterRoutesWithOptionsBlocksMutationForReadOnlyRole(t *testing.T) {
	mux := http.NewServeMux()
	RegisterRoutesWithOptions(mux, NewService(nil, nil, nil), HTTPRouteOptions{
		RequireAuth: identityRouteGuard,
		AccessResolver: stubAccessContextResolver{access: AccessContext{
			UserID:   "user-1",
			TenantID: "tenant-1",
			Role:     RoleMarketing,
		}},
	})

	req := httptest.NewRequest(http.MethodPost, "/v1/operations/queue", strings.NewReader(`{"storeId":"store-1","personId":"consultant-1"}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	mux.ServeHTTP(res, req)

	if res.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusForbidden)
	}
}

func TestWriteAccessErrorMapsUnexpectedResolverFailures(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/v1/operations/overview", nil)
	res := httptest.NewRecorder()

	writeAccessError(res, req, errors.New("resolver exploded"))

	if res.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusInternalServerError)
	}
}

func TestRegisterRoutesWithOptionsSnapshotDefaultsToHistory(t *testing.T) {
	repository := &stubOperationsRepository{}
	mux := http.NewServeMux()
	RegisterRoutesWithOptions(mux, NewService(repository, nil, nil), HTTPRouteOptions{
		RequireAuth: identityRouteGuard,
		AccessResolver: stubAccessContextResolver{access: AccessContext{
			UserID:   "user-1",
			TenantID: "tenant-1",
			Role:     RoleOwner,
			StoreIDs: []string{"store-1"},
		}},
	})

	req := httptest.NewRequest(http.MethodGet, "/v1/operations/snapshot?storeId=store-1", nil)
	res := httptest.NewRecorder()
	mux.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusOK)
	}

	if !repository.lastLoadSnapshotOptions.IncludeHistory {
		t.Fatalf("expected snapshot default to include history")
	}

	if repository.lastLoadSnapshotOptions.IncludeActivitySessions {
		t.Fatalf("expected snapshot default to skip consultant activity sessions")
	}
}

func TestRegisterRoutesWithOptionsSnapshotCanSkipHistory(t *testing.T) {
	repository := &stubOperationsRepository{}
	mux := http.NewServeMux()
	RegisterRoutesWithOptions(mux, NewService(repository, nil, nil), HTTPRouteOptions{
		RequireAuth: identityRouteGuard,
		AccessResolver: stubAccessContextResolver{access: AccessContext{
			UserID:   "user-1",
			TenantID: "tenant-1",
			Role:     RoleOwner,
			StoreIDs: []string{"store-1"},
		}},
	})

	req := httptest.NewRequest(http.MethodGet, "/v1/operations/snapshot?storeId=store-1&includeHistory=false", nil)
	res := httptest.NewRecorder()
	mux.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusOK)
	}

	if repository.lastLoadSnapshotOptions.IncludeHistory {
		t.Fatalf("expected snapshot request to skip history when includeHistory=false")
	}
}

func TestRegisterRoutesWithOptionsSnapshotCanIncludeActivitySessions(t *testing.T) {
	repository := &stubOperationsRepository{}
	mux := http.NewServeMux()
	RegisterRoutesWithOptions(mux, NewService(repository, nil, nil), HTTPRouteOptions{
		RequireAuth: identityRouteGuard,
		AccessResolver: stubAccessContextResolver{access: AccessContext{
			UserID:   "user-1",
			TenantID: "tenant-1",
			Role:     RoleOwner,
			StoreIDs: []string{"store-1"},
		}},
	})

	req := httptest.NewRequest(http.MethodGet, "/v1/operations/snapshot?storeId=store-1&includeActivitySessions=true", nil)
	res := httptest.NewRecorder()
	mux.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusOK)
	}

	if !repository.lastLoadSnapshotOptions.IncludeActivitySessions {
		t.Fatalf("expected snapshot request to include consultant activity sessions when includeActivitySessions=true")
	}
}
