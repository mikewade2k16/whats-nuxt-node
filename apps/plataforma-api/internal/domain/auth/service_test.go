package auth

import (
	"errors"
	"testing"
)

func TestResolveProfileTenantFilter(t *testing.T) {
	tests := []struct {
		name   string
		claims Claims
		want   string
	}{
		{
			name: "platform admin ignores stale tenant claim",
			claims: Claims{
				TenantID:        "636d19e4-0a0c-466d-a32d-e9abf4633947",
				IsPlatformAdmin: true,
			},
			want: "",
		},
		{
			name: "tenant scoped user keeps tenant claim",
			claims: Claims{
				TenantID: " c907cb97-bd4d-4efe-9854-ee9ec4dbce91 ",
			},
			want: "c907cb97-bd4d-4efe-9854-ee9ec4dbce91",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := resolveProfileTenantFilter(tt.claims)
			if got != tt.want {
				t.Fatalf("expected %q, got %q", tt.want, got)
			}
		})
	}
}

func TestResolveProfileTenantID(t *testing.T) {
	tests := []struct {
		name             string
		claims           Claims
		resolvedTenantID string
		want             *string
	}{
		{
			name: "prefers resolved tenant id from current membership",
			claims: Claims{
				TenantID: "636d19e4-0a0c-466d-a32d-e9abf4633947",
			},
			resolvedTenantID: "c907cb97-bd4d-4efe-9854-ee9ec4dbce91",
			want:             stringPointer("c907cb97-bd4d-4efe-9854-ee9ec4dbce91"),
		},
		{
			name: "falls back to tenant claim when current membership is not resolved",
			claims: Claims{
				TenantID: " c907cb97-bd4d-4efe-9854-ee9ec4dbce91 ",
			},
			want: stringPointer("c907cb97-bd4d-4efe-9854-ee9ec4dbce91"),
		},
		{
			name: "returns nil when neither source has tenant id",
			want: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := resolveProfileTenantID(tt.claims, tt.resolvedTenantID)
			if tt.want == nil {
				if got != nil {
					t.Fatalf("expected nil, got %q", *got)
				}
				return
			}

			if got == nil {
				t.Fatal("expected tenant id, got nil")
			}

			if *got != *tt.want {
				t.Fatalf("expected %q, got %q", *tt.want, *got)
			}
		})
	}
}

func TestResolveLoginUserStatusError(t *testing.T) {
	tests := []struct {
		name   string
		status string
		want   error
	}{
		{name: "active user can login", status: "active", want: nil},
		{name: "inactive user is rejected with explicit error", status: "inactive", want: ErrUserInactive},
		{name: "blocked user is rejected with explicit error", status: "blocked", want: ErrUserBlocked},
		{name: "pending invite user is rejected with explicit error", status: "pending_invite", want: ErrUserPendingInvite},
		{name: "unknown status falls back to unauthorized", status: "ghost", want: ErrUnauthorized},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := resolveLoginUserStatusError(tt.status)
			if tt.want == nil {
				if got != nil {
					t.Fatalf("expected nil error, got %v", got)
				}
				return
			}

			if !errors.Is(got, tt.want) {
				t.Fatalf("expected %v, got %v", tt.want, got)
			}
		})
	}
}
