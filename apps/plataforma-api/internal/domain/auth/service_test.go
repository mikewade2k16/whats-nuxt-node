package auth

import (
	"errors"
	"testing"
)

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
