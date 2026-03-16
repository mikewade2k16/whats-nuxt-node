package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	domainauth "platform-core/internal/domain/auth"
)

type contextKey string

const claimsContextKey contextKey = "auth_claims"

func RequireAuth(authService *domainauth.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			rawToken := bearerToken(r.Header.Get("Authorization"))
			if rawToken == "" {
				writeUnauthorized(w)
				return
			}

			claims, err := authService.ParseToken(rawToken)
			if err != nil {
				writeUnauthorized(w)
				return
			}
			if err := authService.ValidateSession(r.Context(), claims); err != nil {
				writeUnauthorized(w)
				return
			}

			ctx := context.WithValue(r.Context(), claimsContextKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func ClaimsFromContext(ctx context.Context) (domainauth.Claims, bool) {
	claims, ok := ctx.Value(claimsContextKey).(domainauth.Claims)
	return claims, ok
}

func bearerToken(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	const prefix = "Bearer "
	if !strings.HasPrefix(value, prefix) {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(value, prefix))
}

func writeUnauthorized(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
}
