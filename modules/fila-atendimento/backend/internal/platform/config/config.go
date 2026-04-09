package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	AppName                   string
	Env                       string
	HTTPAddr                  string
	WebAppURL                 string
	UploadsDir                string
	DatabaseURL               string
	DatabaseMinConns          int
	DatabaseMaxConns          int
	CORSAllowedOrigins        []string
	AuthTokenSecret           string
	AuthTokenTTL              time.Duration
	AuthInviteTTL             time.Duration
	AuthShellBridgeSecret     string
	AuthShellBridgeTenantSlug string
	BcryptCost                int
	ConsultantEmailDomain     string
	ConsultantDefaultPassword string
}

func Load() Config {
	return Config{
		AppName:          getEnv("APP_NAME", "lista-da-vez-api"),
		Env:              getEnv("APP_ENV", "development"),
		HTTPAddr:         getEnv("APP_ADDR", ":8080"),
		WebAppURL:        getEnv("WEB_APP_URL", "http://localhost:3003"),
		UploadsDir:       getEnv("UPLOADS_DIR", "data/uploads"),
		DatabaseURL:      getEnv("DATABASE_URL", ""),
		DatabaseMinConns: getEnvInt("DATABASE_MIN_CONNS", 0),
		DatabaseMaxConns: getEnvInt("DATABASE_MAX_CONNS", 10),
		CORSAllowedOrigins: getEnvCSV(
			"CORS_ALLOWED_ORIGINS",
			[]string{
				"http://localhost:*",
				"http://127.0.0.1:*",
				"http://[::1]:*",
			},
		),
		AuthTokenSecret:           getEnv("AUTH_TOKEN_SECRET", "dev-secret-change-me"),
		AuthTokenTTL:              getEnvDuration("AUTH_TOKEN_TTL", 12*time.Hour),
		AuthInviteTTL:             getEnvDuration("AUTH_INVITE_TTL", 7*24*time.Hour),
		AuthShellBridgeSecret:     getEnv("AUTH_SHELL_BRIDGE_SECRET", ""),
		AuthShellBridgeTenantSlug: getEnv("AUTH_SHELL_BRIDGE_TENANT_SLUG", ""),
		BcryptCost:                getEnvInt("AUTH_BCRYPT_COST", 10),
		ConsultantEmailDomain:     getEnv("AUTH_CONSULTANT_EMAIL_DOMAIN", "acesso.omni.local"),
		ConsultantDefaultPassword: getEnv("AUTH_CONSULTANT_DEFAULT_PASSWORD", "Omni@123"),
	}
}

func getEnv(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	return value
}

func getEnvInt(key string, fallback int) int {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}

	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}

	return value
}

func getEnvDuration(key string, fallback time.Duration) time.Duration {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}

	value, err := time.ParseDuration(raw)
	if err != nil {
		return fallback
	}

	return value
}

func getEnvCSV(key string, fallback []string) []string {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return append([]string{}, fallback...)
	}

	items := strings.Split(raw, ",")
	values := make([]string, 0, len(items))

	for _, item := range items {
		normalized := strings.TrimSpace(item)
		if normalized == "" {
			continue
		}

		values = append(values, normalized)
	}

	if len(values) == 0 {
		return append([]string{}, fallback...)
	}

	return values
}
