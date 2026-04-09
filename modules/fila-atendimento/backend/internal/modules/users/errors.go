package users

import "errors"

var (
	ErrForbidden         = errors.New("users: forbidden")
	ErrValidation        = errors.New("users: validation failed")
	ErrConflict          = errors.New("users: conflict")
	ErrNotFound          = errors.New("users: not found")
	ErrShellManaged      = errors.New("users: shell managed identity")
	ErrTenantRequired    = errors.New("users: tenant required")
	ErrStoreRequired     = errors.New("users: store required")
	ErrInvalidStoreScope = errors.New("users: invalid store scope")
	ErrSelfArchive       = errors.New("users: self archive forbidden")
	ErrInviteNotAllowed  = errors.New("users: invite not allowed")
	ErrConsultantManaged = errors.New("users: consultant managed by roster")
)
