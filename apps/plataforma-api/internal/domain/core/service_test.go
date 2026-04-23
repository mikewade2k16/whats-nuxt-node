package core

import (
	"context"
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
	assignedCoreTenantID := "11111111-1111-1111-1111-111111111111"

	tests := []struct {
		name                  string
		actorIsPlatformAdmin  bool
		targetIsPlatformAdmin bool
		coreTenantID          *string
		want                  bool
	}{
		{name: "tenant admin always creates membership", actorIsPlatformAdmin: false, targetIsPlatformAdmin: false, coreTenantID: nil, want: true},
		{name: "root creating platform admin creates membership", actorIsPlatformAdmin: true, targetIsPlatformAdmin: true, coreTenantID: nil, want: true},
		{name: "root creating client scoped user with client creates membership", actorIsPlatformAdmin: true, targetIsPlatformAdmin: false, coreTenantID: &assignedCoreTenantID, want: true},
		{name: "root creating user without client keeps pending without membership", actorIsPlatformAdmin: true, targetIsPlatformAdmin: false, coreTenantID: nil, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := shouldCreateAdminUserTenantMembership(tt.actorIsPlatformAdmin, tt.targetIsPlatformAdmin, tt.coreTenantID)
			if got != tt.want {
				t.Fatalf("expected %v, got %v", tt.want, got)
			}
		})
	}
}

func TestCanActivateManagedAdminUser(t *testing.T) {
	assignedCoreTenantID := "tenant-1"

	if !canActivateManagedAdminUser(AdminUser{IsPlatformAdmin: true}, "") {
		t.Fatalf("platform admin should always be activatable")
	}

	if canActivateManagedAdminUser(AdminUser{CoreTenantID: nil, IsPlatformAdmin: false}, "") {
		t.Fatalf("user without client assignment should not be activatable")
	}

	if !canActivateManagedAdminUser(AdminUser{CoreTenantID: &assignedCoreTenantID, IsPlatformAdmin: false}, "tenant-1") {
		t.Fatalf("user with tenant scope and client assignment should be activatable")
	}
}

func TestResolveAdminUserBusinessRole(t *testing.T) {
	tests := []struct {
		name            string
		raw             string
		level           string
		userType        string
		isPlatformAdmin bool
		want            string
	}{
		{name: "platform admin always resolves to system admin", raw: "marketing", level: "admin", userType: "admin", isPlatformAdmin: true, want: "system_admin"},
		{name: "tenant admin defaults to owner", raw: "", level: "admin", userType: "admin", want: "owner"},
		{name: "consultant level defaults to consultant", raw: "", level: "consultant", userType: "client", want: "consultant"},
		{name: "manager defaults to general manager", raw: "", level: "manager", userType: "client", want: "general_manager"},
		{name: "explicit consultant is preserved", raw: "consultant", level: "consultant", userType: "client", want: "consultant"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := resolveAdminUserBusinessRole(tt.raw, tt.level, tt.userType, tt.isPlatformAdmin, false)
			if got != tt.want {
				t.Fatalf("expected %s, got %s", tt.want, got)
			}
		})
	}
}

func TestResolveAccessLevelForBusinessRole(t *testing.T) {
	tests := []struct {
		name            string
		role            string
		fallbackLevel   string
		isPlatformAdmin bool
		want            string
	}{
		{name: "platform admin always resolves to admin", role: "system_admin", fallbackLevel: "marketing", isPlatformAdmin: true, want: "admin"},
		{name: "consultant maps to consultant level", role: "consultant", fallbackLevel: "marketing", want: "consultant"},
		{name: "store manager maps to manager level", role: "store_manager", fallbackLevel: "marketing", want: "manager"},
		{name: "general manager maps to manager level", role: "general_manager", fallbackLevel: "marketing", want: "manager"},
		{name: "owner maps to admin level", role: "owner", fallbackLevel: "marketing", want: "admin"},
		{name: "unknown role keeps normalized fallback", role: "", fallbackLevel: "finance", want: "finance"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := resolveAccessLevelForBusinessRole(tt.role, tt.fallbackLevel, tt.isPlatformAdmin)
			if got != tt.want {
				t.Fatalf("expected %s, got %s", tt.want, got)
			}
		})
	}
}

func TestResolveAdminUserMembershipState(t *testing.T) {
	tests := []struct {
		name            string
		rawRole         string
		level           string
		isPlatformAdmin bool
		wantRole        string
		wantLevel       string
		wantUserType    string
		wantIsOwner     bool
	}{
		{name: "admin level defaults to owner membership", rawRole: "", level: "admin", wantRole: "owner", wantLevel: "admin", wantUserType: "admin", wantIsOwner: true},
		{name: "explicit owner stays owner", rawRole: "owner", level: "marketing", wantRole: "owner", wantLevel: "admin", wantUserType: "admin", wantIsOwner: true},
		{name: "manager level resolves to general manager", rawRole: "", level: "manager", wantRole: "general_manager", wantLevel: "manager", wantUserType: "client", wantIsOwner: false},
		{name: "platform admin resolves to system admin", rawRole: "marketing", level: "marketing", isPlatformAdmin: true, wantRole: "system_admin", wantLevel: "admin", wantUserType: "admin", wantIsOwner: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := resolveAdminUserMembershipState(tt.rawRole, tt.level, tt.isPlatformAdmin)
			if got.BusinessRole != tt.wantRole {
				t.Fatalf("expected role %s, got %s", tt.wantRole, got.BusinessRole)
			}
			if got.AccessLevel != tt.wantLevel {
				t.Fatalf("expected level %s, got %s", tt.wantLevel, got.AccessLevel)
			}
			if got.UserType != tt.wantUserType {
				t.Fatalf("expected user type %s, got %s", tt.wantUserType, got.UserType)
			}
			if got.IsOwner != tt.wantIsOwner {
				t.Fatalf("expected isOwner %v, got %v", tt.wantIsOwner, got.IsOwner)
			}
		})
	}
}

func TestValidateExplicitBusinessRole(t *testing.T) {
	if err := validateExplicitBusinessRole("owner", false); err != nil {
		t.Fatalf("expected owner role to be accepted, got %v", err)
	}

	if !errors.Is(validateExplicitBusinessRole("system_admin", false), ErrForbidden) {
		t.Fatalf("expected system_admin to be forbidden for tenant user")
	}

	if !errors.Is(validateExplicitBusinessRole("nao-existe", false), ErrInvalidInput) {
		t.Fatalf("expected invalid role to be rejected")
	}
}

func TestValidateAdminUserDirectoryRequirements(t *testing.T) {
	tests := []struct {
		name  string
		state adminUserDirectoryState
		rules tenantUserDirectoryRules
		want  error
	}{
		{
			name: "consultant in multi store requires store and registration",
			state: adminUserDirectoryState{
				BusinessRole:       "consultant",
				StoreID:            "",
				RegistrationNumber: "",
			},
			rules: tenantUserDirectoryRules{
				RequireStoreLink:    true,
				RequireRegistration: true,
				StoreCount:          3,
			},
			want: ErrInvalidInput,
		},
		{
			name: "consultant with registration only still needs store in multi store",
			state: adminUserDirectoryState{
				BusinessRole:       "consultant",
				StoreID:            "",
				RegistrationNumber: "321",
			},
			rules: tenantUserDirectoryRules{
				RequireStoreLink:    true,
				RequireRegistration: true,
				StoreCount:          4,
			},
			want: ErrInvalidInput,
		},
		{
			name: "consultant in single store can omit store but keeps registration rule",
			state: adminUserDirectoryState{
				BusinessRole:       "consultant",
				StoreID:            "",
				RegistrationNumber: "321",
			},
			rules: tenantUserDirectoryRules{
				RequireStoreLink:    true,
				RequireRegistration: true,
				StoreCount:          1,
			},
			want: nil,
		},
		{
			name: "marketing can stay global",
			state: adminUserDirectoryState{
				BusinessRole:       "marketing",
				StoreID:            "",
				RegistrationNumber: "",
			},
			rules: tenantUserDirectoryRules{
				RequireStoreLink:    true,
				RequireRegistration: true,
				StoreCount:          5,
			},
			want: nil,
		},
		{
			name: "general manager can stay global but still requires registration",
			state: adminUserDirectoryState{
				BusinessRole:       "general_manager",
				StoreID:            "",
				RegistrationNumber: "",
			},
			rules: tenantUserDirectoryRules{
				RequireStoreLink:    true,
				RequireRegistration: true,
				StoreCount:          4,
			},
			want: ErrInvalidInput,
		},
		{
			name: "general manager with registration can stay global",
			state: adminUserDirectoryState{
				BusinessRole:       "general_manager",
				StoreID:            "",
				RegistrationNumber: "301",
			},
			rules: tenantUserDirectoryRules{
				RequireStoreLink:    true,
				RequireRegistration: true,
				StoreCount:          4,
			},
			want: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateAdminUserDirectoryRequirements(tt.state, tt.rules)
			if !errors.Is(err, tt.want) {
				t.Fatalf("expected %v, got %v", tt.want, err)
			}
		})
	}
}

func TestSanitizeAdminUserDirectoryStateRejectsInvalidRole(t *testing.T) {
	svc := NewService(nil, 3)
	_, err := svc.sanitizeAdminUserDirectoryState(context.Background(), "", adminUserDirectoryState{BusinessRole: "invalido"})
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput, got %v", err)
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
