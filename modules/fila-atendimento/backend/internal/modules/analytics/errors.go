package analytics

import "errors"

var (
	ErrUnauthorized  = errors.New("analytics: unauthorized")
	ErrStoreRequired = errors.New("analytics: store required")
)
