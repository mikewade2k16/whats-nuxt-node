package auth

import "errors"

var (
	ErrInvalidCredentials         = errors.New("auth: invalid credentials")
	ErrUnauthorized               = errors.New("auth: unauthorized")
	ErrForbidden                  = errors.New("auth: forbidden")
	ErrUserInactive               = errors.New("auth: user inactive")
	ErrOnboardingRequired         = errors.New("auth: onboarding required")
	ErrInvalidRoleScope           = errors.New("auth: invalid role scope")
	ErrConflict                   = errors.New("auth: conflict")
	ErrInvalidAvatar              = errors.New("auth: invalid avatar")
	ErrInvitationNotFound         = errors.New("auth: invitation not found")
	ErrInvitationExpired          = errors.New("auth: invitation expired")
	ErrInvitationAccepted         = errors.New("auth: invitation accepted")
	ErrInvitationRevoked          = errors.New("auth: invitation revoked")
	ErrShellBridgeDisabled        = errors.New("auth: shell bridge disabled")
	ErrShellBridgeUnauthorized    = errors.New("auth: shell bridge unauthorized")
	ErrShellBridgeForbidden       = errors.New("auth: shell bridge forbidden")
	ErrShellBridgeScopeUnresolved = errors.New("auth: shell bridge scope unresolved")
)
