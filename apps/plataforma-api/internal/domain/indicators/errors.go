package indicators

import "errors"

var (
	ErrNotFound             = errors.New("not found")
	ErrForbidden            = errors.New("forbidden")
	ErrInvalidInput         = errors.New("invalid input")
	ErrTemplateLocked       = errors.New("template locked")
	ErrBootstrapUnavailable = errors.New("bootstrap unavailable")
	ErrNotSupported         = errors.New("not supported")
)
