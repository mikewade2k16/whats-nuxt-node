package core

import (
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

func TestApplyDefaultLimitUsesConfiguredValueForUsers(t *testing.T) {
	svc := NewService(nil, 3)
	result := svc.applyDefaultLimit("core_panel", "users", ResolvedLimit{Source: "default"})
	if result.Value == nil {
		t.Fatalf("expected default users limit to be applied")
	}
	if *result.Value != 3 {
		t.Fatalf("expected value 3, got %d", *result.Value)
	}
}

func TestApplyDefaultLimitKeepsExistingValue(t *testing.T) {
	svc := NewService(nil, 3)
	value := 8
	result := svc.applyDefaultLimit("core_panel", "users", ResolvedLimit{Source: "plan_limit", Value: &value})
	if result.Value == nil || *result.Value != 8 {
		t.Fatalf("expected existing limit to be preserved")
	}
	if result.Source != "plan_limit" {
		t.Fatalf("expected source plan_limit, got %s", result.Source)
	}
}

func TestApplyDefaultLimitNoFallbackForNonUsersKey(t *testing.T) {
	svc := NewService(nil, 3)
	result := svc.applyDefaultLimit("core_panel", "connections", ResolvedLimit{Source: "default"})
	if result.Value != nil {
		t.Fatalf("expected no fallback for non-users key")
	}
}

func TestApplyDefaultLimitUsesAtendimentoDefaults(t *testing.T) {
	svc := NewService(nil, 10)

	usersResult := svc.applyDefaultLimit("atendimento", "users", ResolvedLimit{Source: "default"})
	if usersResult.Value == nil || *usersResult.Value != 3 {
		t.Fatalf("expected atendimento users default 3, got %#v", usersResult.Value)
	}

	instancesResult := svc.applyDefaultLimit("atendimento", "instances", ResolvedLimit{Source: "default"})
	if instancesResult.Value == nil || *instancesResult.Value != 1 {
		t.Fatalf("expected atendimento instances default 1, got %#v", instancesResult.Value)
	}
}

func TestShouldCreateAdminUserTenantMembership(t *testing.T) {
	assignedClientID := 12

	tests := []struct {
		name                  string
		actorIsPlatformAdmin  bool
		targetIsPlatformAdmin bool
		clientID              *int
		want                  bool
	}{
		{name: "tenant admin always creates membership", actorIsPlatformAdmin: false, targetIsPlatformAdmin: false, clientID: nil, want: true},
		{name: "root creating platform admin creates membership", actorIsPlatformAdmin: true, targetIsPlatformAdmin: true, clientID: nil, want: true},
		{name: "root creating client scoped user with client creates membership", actorIsPlatformAdmin: true, targetIsPlatformAdmin: false, clientID: &assignedClientID, want: true},
		{name: "root creating user without client keeps pending without membership", actorIsPlatformAdmin: true, targetIsPlatformAdmin: false, clientID: nil, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := shouldCreateAdminUserTenantMembership(tt.actorIsPlatformAdmin, tt.targetIsPlatformAdmin, tt.clientID)
			if got != tt.want {
				t.Fatalf("expected %v, got %v", tt.want, got)
			}
		})
	}
}

func TestCanActivateManagedAdminUser(t *testing.T) {
	assignedClientID := 7

	if !canActivateManagedAdminUser(AdminUser{IsPlatformAdmin: true}, "") {
		t.Fatalf("platform admin should always be activatable")
	}

	if canActivateManagedAdminUser(AdminUser{ClientID: nil, IsPlatformAdmin: false}, "") {
		t.Fatalf("user without client assignment should not be activatable")
	}

	if !canActivateManagedAdminUser(AdminUser{ClientID: &assignedClientID, IsPlatformAdmin: false}, "tenant-1") {
		t.Fatalf("user with tenant scope and client assignment should be activatable")
	}
}

func TestNormalizeOwnProfileUpdateErrorMapsDuplicateEmail(t *testing.T) {
	err := normalizeOwnProfileUpdateError("email", &pgconn.PgError{
		Code:           "23505",
		ConstraintName: "users_email_key",
	})

	if !errors.Is(err, ErrEmailAlreadyInUse) {
		t.Fatalf("expected ErrEmailAlreadyInUse, got %v", err)
	}
}

func TestNormalizeOwnProfileUpdateErrorMapsDuplicateEmailWithoutConstraintName(t *testing.T) {
	err := normalizeOwnProfileUpdateError("email", &pgconn.PgError{
		Code:    "23505",
		Message: `duplicate key value violates unique constraint "users_email_key"`,
		Detail:  `Key (email)=(root@core.local) already exists.`,
	})

	if !errors.Is(err, ErrEmailAlreadyInUse) {
		t.Fatalf("expected ErrEmailAlreadyInUse, got %v", err)
	}
}

func TestNormalizeOwnProfileUpdateErrorWrapsUnexpectedError(t *testing.T) {
	baseErr := errors.New("boom")
	err := normalizeOwnProfileUpdateError("name", baseErr)

	if errors.Is(err, ErrEmailAlreadyInUse) {
		t.Fatalf("unexpected email conflict mapping for non-email field")
	}

	if !errors.Is(err, baseErr) {
		t.Fatalf("expected wrapped original error, got %v", err)
	}
}
