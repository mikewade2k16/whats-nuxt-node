package handlers

import (
	"errors"
	"testing"

	domainauth "plataforma-api/internal/domain/auth"
)

func TestResolveLoginErrorResponse(t *testing.T) {
	tests := []struct {
		name        string
		err         error
		wantCode    string
		wantMessage string
		wantOK      bool
	}{
		{
			name:        "maps inactive user",
			err:         domainauth.ErrUserInactive,
			wantCode:    "user_inactive",
			wantMessage: "Seu usuario esta inativo. Entre em contato com um administrador para liberar o acesso.",
			wantOK:      true,
		},
		{
			name:        "maps invalid credentials",
			err:         domainauth.ErrUnauthorized,
			wantCode:    "unauthorized",
			wantMessage: "Email ou senha invalidos.",
			wantOK:      true,
		},
		{
			name:   "ignores unrelated errors",
			err:    errors.New("boom"),
			wantOK: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, code, message, ok := resolveLoginErrorResponse(tt.err)
			if ok != tt.wantOK {
				t.Fatalf("expected ok=%v, got %v", tt.wantOK, ok)
			}
			if !tt.wantOK {
				return
			}

			if code != tt.wantCode {
				t.Fatalf("expected code %s, got %s", tt.wantCode, code)
			}
			if message != tt.wantMessage {
				t.Fatalf("expected message %q, got %q", tt.wantMessage, message)
			}
		})
	}
}

func TestResolvePasswordResetErrorResponse(t *testing.T) {
	tests := []struct {
		name        string
		err         error
		wantStatus  int
		wantCode    string
		wantMessage string
		wantOK      bool
	}{
		{
			name:        "maps reset unavailable",
			err:         domainauth.ErrPasswordResetUnavailable,
			wantStatus:  503,
			wantCode:    "password_reset_unavailable",
			wantMessage: "A recuperacao de senha nao esta disponivel agora. Tente novamente em instantes.",
			wantOK:      true,
		},
		{
			name:        "maps expired code",
			err:         domainauth.ErrPasswordResetCodeExpired,
			wantStatus:  400,
			wantCode:    "password_reset_code_expired",
			wantMessage: "O codigo expirou. Solicite um novo codigo e tente novamente.",
			wantOK:      true,
		},
		{
			name:        "maps invalid code",
			err:         domainauth.ErrPasswordResetCodeInvalid,
			wantStatus:  400,
			wantCode:    "password_reset_code_invalid",
			wantMessage: "Codigo invalido. Confira o email recebido e tente novamente.",
			wantOK:      true,
		},
		{
			name:   "ignores unrelated errors",
			err:    errors.New("boom"),
			wantOK: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			status, code, message, ok := resolvePasswordResetErrorResponse(tt.err)
			if ok != tt.wantOK {
				t.Fatalf("expected ok=%v, got %v", tt.wantOK, ok)
			}
			if !tt.wantOK {
				return
			}

			if status != tt.wantStatus {
				t.Fatalf("expected status %d, got %d", tt.wantStatus, status)
			}
			if code != tt.wantCode {
				t.Fatalf("expected code %s, got %s", tt.wantCode, code)
			}
			if message != tt.wantMessage {
				t.Fatalf("expected message %q, got %q", tt.wantMessage, message)
			}
		})
	}
}
