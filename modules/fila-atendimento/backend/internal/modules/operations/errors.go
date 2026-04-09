package operations

import "errors"

var (
	ErrUnauthorized       = errors.New("operations: unauthorized")
	ErrForbidden          = errors.New("operations: forbidden")
	ErrStoreRequired      = errors.New("operations: store required")
	ErrStoreNotFound      = errors.New("operations: store not found")
	ErrValidation         = errors.New("operations: validation error")
	ErrConsultantNotFound = errors.New("operations: consultant not found")
	ErrConsultantBusy     = errors.New("operations: consultant busy")
)
