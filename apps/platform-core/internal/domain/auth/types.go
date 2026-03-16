package auth

import (
	"time"

	"github.com/golang-jwt/jwt/v5"
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

type UserSummary struct {
	ID                string   `json:"id"`
	Name              string   `json:"name"`
	Email             string   `json:"email"`
	Nick              string   `json:"nick,omitempty"`
	ProfileImage      string   `json:"profileImage,omitempty"`
	IsPlatformAdmin   bool     `json:"isPlatformAdmin"`
	TenantID          *string  `json:"tenantId,omitempty"`
	ClientID          *int     `json:"clientId,omitempty"`
	ClientName        string   `json:"clientName,omitempty"`
	Level             string   `json:"level,omitempty"`
	UserType          string   `json:"userType,omitempty"`
	Preferences       string   `json:"preferences,omitempty"`
	ModuleCodes       []string `json:"moduleCodes,omitempty"`
	AtendimentoAccess bool     `json:"atendimentoAccess"`
}

type LoginOutput struct {
	AccessToken string      `json:"accessToken"`
	ExpiresAt   time.Time   `json:"expiresAt"`
	User        UserSummary `json:"user"`
}

type MeOutput struct {
	User UserSummary `json:"user"`
}
