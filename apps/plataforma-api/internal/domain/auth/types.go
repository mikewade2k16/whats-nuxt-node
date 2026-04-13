package auth

import (
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	MinSessionTTLMinutes = 30
	MaxSessionTTLMinutes = 10080
)

type Claims struct {
	TenantID        string `json:"tenant_id,omitempty"`
	SessionID       string `json:"sid"`
	IsPlatformAdmin bool   `json:"is_platform_admin"`
	jwt.RegisteredClaims
}

type LoginInput struct {
	Email     string
	Password  string
	TenantID  string
	RemoteIP  string
	UserAgent string
}

type PasswordResetRequestInput struct {
	Email     string
	RemoteIP  string
	UserAgent string
}

type PasswordResetConfirmInput struct {
	Email       string
	Code        string
	NewPassword string
	RemoteIP    string
	UserAgent   string
}

type UserSummary struct {
	ID                 string   `json:"id"`
	Name               string   `json:"name"`
	Email              string   `json:"email"`
	Nick               string   `json:"nick,omitempty"`
	ProfileImage       string   `json:"profileImage,omitempty"`
	IsPlatformAdmin    bool     `json:"isPlatformAdmin"`
	TenantID           *string  `json:"tenantId,omitempty"`
	TenantSlug         *string  `json:"tenantSlug,omitempty"`
	ClientID           *int     `json:"clientId,omitempty"`
	ClientName         string   `json:"clientName,omitempty"`
	Level              string   `json:"level,omitempty"`
	UserType           string   `json:"userType,omitempty"`
	BusinessRole       string   `json:"businessRole,omitempty"`
	StoreID            *string  `json:"storeId,omitempty"`
	RegistrationNumber string   `json:"registrationNumber,omitempty"`
	Preferences        string   `json:"preferences,omitempty"`
	ModuleCodes        []string `json:"moduleCodes,omitempty"`
	AtendimentoAccess  bool     `json:"atendimentoAccess"`
}

type LoginOutput struct {
	AccessToken string      `json:"accessToken"`
	ExpiresAt   time.Time   `json:"expiresAt"`
	User        UserSummary `json:"user"`
}

type SessionConfig struct {
	TTLMinutes        int       `json:"ttlMinutes"`
	DefaultTTLMinutes int       `json:"defaultTTLMinutes"`
	MinTTLMinutes     int       `json:"minTTLMinutes"`
	MaxTTLMinutes     int       `json:"maxTTLMinutes"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

type UpdateSessionConfigInput struct {
	TTLMinutes      int
	UpdatedByUserID string
}

type ActiveSessionDevice struct {
	ID         string    `json:"id"`
	TenantID   *string   `json:"tenantId,omitempty"`
	TenantSlug *string   `json:"tenantSlug,omitempty"`
	TenantName string    `json:"tenantName,omitempty"`
	DeviceName string    `json:"deviceName,omitempty"`
	UserAgent  string    `json:"userAgent,omitempty"`
	IP         string    `json:"ip,omitempty"`
	CreatedAt  time.Time `json:"createdAt"`
	LastSeenAt time.Time `json:"lastSeenAt"`
	ExpiresAt  time.Time `json:"expiresAt"`
	Current    bool      `json:"current"`
}

type ActiveSessionUser struct {
	UserID            string                `json:"userId"`
	Name              string                `json:"name"`
	Email             string                `json:"email"`
	IsPlatformAdmin   bool                  `json:"isPlatformAdmin"`
	SessionCount      int                   `json:"sessionCount"`
	MultipleDevices   bool                  `json:"multipleDevices"`
	HasCurrentSession bool                  `json:"hasCurrentSession"`
	LastSeenAt        time.Time             `json:"lastSeenAt"`
	ExpiresAt         time.Time             `json:"expiresAt"`
	ActiveSessions    []ActiveSessionDevice `json:"activeSessions"`
}

type SessionRevocationResult struct {
	UserID                string `json:"userId,omitempty"`
	SessionID             string `json:"sessionId,omitempty"`
	RevokedCount          int    `json:"revokedCount"`
	RevokedCurrentSession bool   `json:"revokedCurrentSession"`
}

type MeOutput struct {
	User UserSummary `json:"user"`
}

type PasswordResetRequestOutput struct {
	OK      bool   `json:"ok"`
	Message string `json:"message"`
}

type PasswordResetConfirmOutput struct {
	OK      bool   `json:"ok"`
	Message string `json:"message"`
}
