package auth

import "errors"

var (
	ErrUnauthorized             = errors.New("unauthorized")
	ErrForbidden                = errors.New("forbidden")
	ErrUserInactive             = errors.New("user_inactive")
	ErrUserBlocked              = errors.New("user_blocked")
	ErrUserPendingInvite        = errors.New("user_pending_invite")
	ErrTenantMembership         = errors.New("tenant_membership_required")
	ErrPasswordResetUnavailable = errors.New("password_reset_unavailable")
	ErrPasswordResetCodeInvalid = errors.New("password_reset_code_invalid")
	ErrPasswordResetCodeExpired = errors.New("password_reset_code_expired")
	ErrInvalidSessionTTL        = errors.New("invalid_session_ttl")
	ErrSessionNotFound          = errors.New("session_not_found")
)
