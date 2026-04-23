package observability

import "errors"

var (
	ErrUnauthorized = errors.New("observability unauthorized")
	ErrForbidden    = errors.New("observability forbidden")
	ErrValidation   = errors.New("observability validation")
)
