package operations

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

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
