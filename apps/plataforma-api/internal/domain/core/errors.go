package core

import "errors"

var (
	ErrForbidden          = errors.New("forbidden")
	ErrNotFound           = errors.New("not_found")
	ErrInvalidInput       = errors.New("invalid_input")
	ErrEmailAlreadyInUse  = errors.New("email_already_in_use")
	ErrModuleInactive     = errors.New("module_inactive")
	ErrUserInactive       = errors.New("tenant_user_inactive")
	ErrLimitReached       = errors.New("limit_reached")
	ErrLimitNotConfigured = errors.New("limit_not_configured")
)
