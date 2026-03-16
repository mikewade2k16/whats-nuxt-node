package handlers

import (
	"net/http"
	"time"
)

type HealthHandler struct {
	startedAt time.Time
}

func NewHealthHandler(startedAt time.Time) *HealthHandler {
	return &HealthHandler{startedAt: startedAt}
}

func (h *HealthHandler) Get(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":    "ok",
		"service":   "platform-core",
		"startedAt": h.startedAt.UTC(),
		"now":       time.Now().UTC(),
	})
}
