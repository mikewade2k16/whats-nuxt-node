package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"strings"
	"time"
)

const shellBridgeTokenPrefix = "ldv-shell-v1"

type ShellBridgeClaims struct {
	Subject         string   `json:"sub"`
	DisplayName     string   `json:"name"`
	Email           string   `json:"email"`
	UserType        string   `json:"userType"`
	UserLevel       string   `json:"userLevel"`
	BusinessRole    string   `json:"businessRole,omitempty"`
	TenantID        string   `json:"tenantId,omitempty"`
	TenantSlug      string   `json:"tenantSlug,omitempty"`
	ClientID        int      `json:"clientId,omitempty"`
	IsPlatformAdmin bool     `json:"isPlatformAdmin"`
	ModuleCodes     []string `json:"moduleCodes,omitempty"`
	StoreIDs        []string `json:"storeIds,omitempty"`
	ScopeMode       string   `json:"scopeMode,omitempty"`
	IssuedAt        int64    `json:"iat"`
	ExpiresAt       int64    `json:"exp"`
}

type ShellBridgeTokenManager struct {
	secret []byte
}

func NewShellBridgeTokenManager(secret string) *ShellBridgeTokenManager {
	if strings.TrimSpace(secret) == "" {
		return nil
	}

	return &ShellBridgeTokenManager{
		secret: []byte(strings.TrimSpace(secret)),
	}
}

func (manager *ShellBridgeTokenManager) Parse(token string) (ShellBridgeClaims, error) {
	if manager == nil || len(manager.secret) == 0 {
		return ShellBridgeClaims{}, ErrShellBridgeDisabled
	}

	parts := strings.Split(strings.TrimSpace(token), ".")
	if len(parts) != 3 || parts[0] != shellBridgeTokenPrefix {
		return ShellBridgeClaims{}, ErrShellBridgeUnauthorized
	}

	encodedPayload := parts[1]
	signature := parts[2]
	expectedSignature := manager.sign(encodedPayload)
	if !hmac.Equal([]byte(signature), []byte(expectedSignature)) {
		return ShellBridgeClaims{}, ErrShellBridgeUnauthorized
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(encodedPayload)
	if err != nil {
		return ShellBridgeClaims{}, ErrShellBridgeUnauthorized
	}

	var claims ShellBridgeClaims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return ShellBridgeClaims{}, ErrShellBridgeUnauthorized
	}

	claims.Subject = strings.TrimSpace(claims.Subject)
	claims.DisplayName = strings.TrimSpace(claims.DisplayName)
	claims.Email = strings.ToLower(strings.TrimSpace(claims.Email))
	claims.UserType = strings.ToLower(strings.TrimSpace(claims.UserType))
	claims.UserLevel = strings.ToLower(strings.TrimSpace(claims.UserLevel))
	claims.BusinessRole = strings.ToLower(strings.TrimSpace(claims.BusinessRole))
	claims.TenantID = strings.TrimSpace(claims.TenantID)
	claims.TenantSlug = strings.ToLower(strings.TrimSpace(claims.TenantSlug))
	claims.ScopeMode = strings.ToLower(strings.TrimSpace(claims.ScopeMode))
	claims.StoreIDs = normalizeShellBridgeStringList(claims.StoreIDs)

	if claims.Subject == "" || claims.Email == "" {
		return ShellBridgeClaims{}, ErrShellBridgeUnauthorized
	}

	expiresAt := time.Unix(claims.ExpiresAt, 0).UTC()
	if time.Now().UTC().After(expiresAt) {
		return ShellBridgeClaims{}, ErrShellBridgeUnauthorized
	}

	return claims, nil
}

func normalizeShellBridgeStringList(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		result = append(result, trimmed)
	}

	return result
}

func (manager *ShellBridgeTokenManager) sign(encodedPayload string) string {
	mac := hmac.New(sha256.New, manager.secret)
	_, _ = mac.Write([]byte(encodedPayload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
