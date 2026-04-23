package auth

import (
	"errors"
	"testing"
)

func TestResolveShellBridgeRole(t *testing.T) {
	tests := []struct {
		name   string
		claims ShellBridgeClaims
		want   Role
		err    error
	}{
		{
			name:   "platform admin bypasses business role",
			claims: ShellBridgeClaims{IsPlatformAdmin: true, BusinessRole: "consultant", ScopeMode: "platform"},
			want:   RolePlatformAdmin,
		},
		{
			name:   "platform admin scoped to tenant falls back to tenant role",
			claims: ShellBridgeClaims{IsPlatformAdmin: true, BusinessRole: "system_admin", UserLevel: "admin", ScopeMode: "all_stores"},
			want:   RoleOwner,
		},
		{
			name:   "consultant business role maps to consultant",
			claims: ShellBridgeClaims{BusinessRole: "consultant"},
			want:   RoleConsultant,
		},
		{
			name:   "store manager business role maps to manager",
			claims: ShellBridgeClaims{BusinessRole: "store_manager"},
			want:   RoleManager,
		},
		{
			name:   "general manager business role maps to owner",
			claims: ShellBridgeClaims{BusinessRole: "general_manager"},
			want:   RoleOwner,
		},
		{
			name:   "consultant level fallback remains supported",
			claims: ShellBridgeClaims{UserLevel: "consultant"},
			want:   RoleConsultant,
		},
		{
			name:   "unknown role is forbidden",
			claims: ShellBridgeClaims{BusinessRole: "finance", UserLevel: "finance"},
			err:    ErrShellBridgeForbidden,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := resolveShellBridgeRole(tt.claims)
			if !errors.Is(err, tt.err) {
				t.Fatalf("expected error %v, got %v", tt.err, err)
			}
			if got != tt.want {
				t.Fatalf("expected role %s, got %s", tt.want, got)
			}
		})
	}
}

func TestResolveShellBridgeScopeMode(t *testing.T) {
	tests := []struct {
		name   string
		claims ShellBridgeClaims
		role   Role
		want   string
	}{
		{
			name:   "consultant stays first store",
			claims: ShellBridgeClaims{BusinessRole: "consultant"},
			role:   RoleConsultant,
			want:   "first_store",
		},
		{
			name:   "general manager spans all stores",
			claims: ShellBridgeClaims{BusinessRole: "general_manager"},
			role:   RoleOwner,
			want:   "all_stores",
		},
		{
			name:   "platform admin remains platform scoped",
			claims: ShellBridgeClaims{},
			role:   RolePlatformAdmin,
			want:   "platform",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := resolveShellBridgeScopeMode(tt.claims, tt.role)
			if got != tt.want {
				t.Fatalf("expected scope %s, got %s", tt.want, got)
			}
		})
	}
}

func TestResolveShellBridgeStoreIDs(t *testing.T) {
	got := resolveShellBridgeStoreIDs(
		[]string{"store-2", "store-2", "store-missing", "store-1"},
		[]shellBridgeStore{{ID: "store-1"}, {ID: "store-2"}},
	)

	if len(got) != 2 || got[0] != "store-2" || got[1] != "store-1" {
		t.Fatalf("unexpected claimed stores: %+v", got)
	}
}

func TestCanProvisionShellBridgeWithoutStores(t *testing.T) {
	tests := []struct {
		name      string
		role      Role
		scopeMode string
		want      bool
	}{
		{
			name:      "owner can enter tenant without stores",
			role:      RoleOwner,
			scopeMode: "all_stores",
			want:      true,
		},
		{
			name:      "marketing can enter tenant without stores",
			role:      RoleMarketing,
			scopeMode: "all_stores",
			want:      true,
		},
		{
			name:      "platform admin can enter scoped tenant without stores",
			role:      RolePlatformAdmin,
			scopeMode: "all_stores",
			want:      true,
		},
		{
			name:      "first store scope still requires store",
			role:      RoleOwner,
			scopeMode: "first_store",
			want:      false,
		},
		{
			name:      "manager cannot enter without store",
			role:      RoleManager,
			scopeMode: "all_stores",
			want:      false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := canProvisionShellBridgeWithoutStores(tt.role, tt.scopeMode)
			if got != tt.want {
				t.Fatalf("expected %v, got %v", tt.want, got)
			}
		})
	}
}
