package contracts

import "testing"

func TestNewAccessContextBuildsNormalizedEnvelope(t *testing.T) {
	actor := ActorContext{
		UserID:      " user-1 ",
		DisplayName: " Maria Silva ",
		Email:       " maria@example.com ",
		Role:        " owner ",
		StoreIDs:    []string{" loja-1 ", "", "loja-2"},
	}
	tenant := TenantContext{
		TenantID:   " tenant-1 ",
		TenantSlug: " acme ",
	}
	policy := AccessPolicy{
		Capabilities:  []string{" fila-atendimento.operation.read ", ""},
		ActiveModules: []string{" fila-atendimento ", "  "},
	}

	got := NewAccessContext(actor, tenant, policy)

	if got.UserID != "user-1" {
		t.Fatalf("UserID = %q, want %q", got.UserID, "user-1")
	}
	if got.DisplayName != "Maria Silva" {
		t.Fatalf("DisplayName = %q, want %q", got.DisplayName, "Maria Silva")
	}
	if got.Email != "maria@example.com" {
		t.Fatalf("Email = %q, want %q", got.Email, "maria@example.com")
	}
	if got.TenantID != "tenant-1" {
		t.Fatalf("TenantID = %q, want %q", got.TenantID, "tenant-1")
	}
	if got.TenantSlug != "acme" {
		t.Fatalf("TenantSlug = %q, want %q", got.TenantSlug, "acme")
	}
	if got.Role != "owner" {
		t.Fatalf("Role = %q, want %q", got.Role, "owner")
	}
	if len(got.StoreIDs) != 2 || got.StoreIDs[0] != "loja-1" || got.StoreIDs[1] != "loja-2" {
		t.Fatalf("StoreIDs = %#v, want [loja-1 loja-2]", got.StoreIDs)
	}
	if len(got.Capabilities) != 1 || got.Capabilities[0] != "fila-atendimento.operation.read" {
		t.Fatalf("Capabilities = %#v, want [fila-atendimento.operation.read]", got.Capabilities)
	}
	if len(got.ActiveModules) != 1 || got.ActiveModules[0] != "fila-atendimento" {
		t.Fatalf("ActiveModules = %#v, want [fila-atendimento]", got.ActiveModules)
	}

	actorView := got.ActorContext()
	if actorView.UserID != "user-1" || actorView.Role != "owner" {
		t.Fatalf("ActorContext = %#v, want normalized actor fields", actorView)
	}

	tenantView := got.TenantContext()
	if tenantView.TenantID != "tenant-1" || tenantView.TenantSlug != "acme" {
		t.Fatalf("TenantContext = %#v, want normalized tenant fields", tenantView)
	}

	policyView := got.AccessPolicy()
	if len(policyView.Capabilities) != 1 || policyView.Capabilities[0] != "fila-atendimento.operation.read" {
		t.Fatalf("AccessPolicy = %#v, want normalized policy fields", policyView)
	}
}
