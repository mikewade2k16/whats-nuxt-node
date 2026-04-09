package realtime

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

type realtimeContextResolverStub struct {
	resolveContext   RealtimeContext
	resolveErr       error
	canSubscribe     bool
	canSubscribeErr  error
	canSubscribeFunc func(context.Context, AccessContext, RealtimeSubscriptionScope) (bool, error)
	lastToken        string
	lastAccess       AccessContext
	lastScope        RealtimeSubscriptionScope
}

func (stub *realtimeContextResolverStub) ResolveRealtimeContext(_ context.Context, token string) (RealtimeContext, error) {
	stub.lastToken = token
	return stub.resolveContext, stub.resolveErr
}

func (stub *realtimeContextResolverStub) CanSubscribe(ctx context.Context, access AccessContext, scope RealtimeSubscriptionScope) (bool, error) {
	stub.lastAccess = access
	stub.lastScope = scope
	if stub.canSubscribeFunc != nil {
		return stub.canSubscribeFunc(ctx, access, scope)
	}

	return stub.canSubscribe, stub.canSubscribeErr
}

func TestHandleOperationSocketRequiresToken(t *testing.T) {
	service := NewService(&realtimeContextResolverStub{}, nil, NewHub())
	server, wsURL := newRealtimeTestServer(t, service)
	defer server.Close()

	connection, response, err := websocket.DefaultDialer.Dial(wsURL+"/v1/realtime/operations?storeId=store-1", nil)
	if err == nil {
		connection.Close()
		t.Fatal("expected websocket handshake failure")
	}

	if response == nil || response.StatusCode != http.StatusUnauthorized {
		statusCode := 0
		if response != nil {
			statusCode = response.StatusCode
		}
		t.Fatalf("expected 401, got %d", statusCode)
	}
}

func TestHandleOperationSocketConnectsWithAuthorizedStore(t *testing.T) {
	resolver := &realtimeContextResolverStub{
		resolveContext: RealtimeContext{
			Access: AccessContext{UserID: "user-1", Role: "manager", TenantID: "tenant-1"},
		},
		canSubscribe: true,
	}

	service := NewService(resolver, nil, NewHub())
	server, wsURL := newRealtimeTestServer(t, service)
	defer server.Close()

	connection, response, err := websocket.DefaultDialer.Dial(wsURL+"/v1/realtime/operations?storeId=store-1&access_token=test-token", nil)
	if err != nil {
		statusCode := 0
		if response != nil {
			statusCode = response.StatusCode
		}
		t.Fatalf("expected websocket connection, got status %d: %v", statusCode, err)
	}
	defer connection.Close()

	connection.SetReadDeadline(time.Now().Add(2 * time.Second))
	var event Event
	if err := connection.ReadJSON(&event); err != nil {
		t.Fatalf("expected connected event: %v", err)
	}

	if event.Type != EventTypeConnected || event.StoreID != "store-1" {
		t.Fatalf("unexpected event: %+v", event)
	}

	if resolver.lastToken != "test-token" {
		t.Fatalf("expected token to be forwarded, got %q", resolver.lastToken)
	}

	if resolver.lastScope.Channel != RealtimeChannelOperations || resolver.lastScope.StoreID != "store-1" {
		t.Fatalf("unexpected subscription scope: %+v", resolver.lastScope)
	}
}

func TestHandleContextSocketUsesSingleAccessibleTenantWhenMissingQuery(t *testing.T) {
	resolver := &realtimeContextResolverStub{
		resolveContext: RealtimeContext{
			Access: AccessContext{UserID: "admin-1", Role: "platform_admin"},
			Scopes: []RealtimeSubscriptionScope{{Channel: RealtimeChannelContext, TenantID: "tenant-1"}},
		},
		canSubscribe: true,
	}

	service := NewService(resolver, nil, NewHub())
	server, wsURL := newRealtimeTestServer(t, service)
	defer server.Close()

	connection, response, err := websocket.DefaultDialer.Dial(wsURL+"/v1/realtime/context?access_token=test-token", nil)
	if err != nil {
		statusCode := 0
		if response != nil {
			statusCode = response.StatusCode
		}
		t.Fatalf("expected websocket connection, got status %d: %v", statusCode, err)
	}
	defer connection.Close()

	connection.SetReadDeadline(time.Now().Add(2 * time.Second))
	var event Event
	if err := connection.ReadJSON(&event); err != nil {
		t.Fatalf("expected connected event: %v", err)
	}

	if event.Type != EventTypeConnected || event.TenantID != "tenant-1" {
		t.Fatalf("unexpected event: %+v", event)
	}

	if resolver.lastScope.Channel != RealtimeChannelContext || resolver.lastScope.TenantID != "tenant-1" {
		t.Fatalf("unexpected subscription scope: %+v", resolver.lastScope)
	}
}

func newRealtimeTestServer(t *testing.T, service *Service) (*httptest.Server, string) {
	t.Helper()

	mux := http.NewServeMux()
	RegisterRoutes(mux, service)
	server := httptest.NewServer(mux)
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	return server, wsURL
}
