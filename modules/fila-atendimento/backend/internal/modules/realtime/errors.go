package realtime

import "errors"

var (
	ErrUnauthorized   = errors.New("realtime: unauthorized")
	ErrForbidden      = errors.New("realtime: forbidden")
	ErrValidation     = errors.New("realtime: validation")
	ErrStoreRequired  = errors.New("realtime: store required")
	ErrTenantRequired = errors.New("realtime: tenant required")
	ErrStoreNotFound  = errors.New("realtime: store not found")
)
