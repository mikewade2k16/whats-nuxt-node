package config

import (
	"errors"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	HTTPAddr           string
	DatabaseURL        string
	DatabaseSchema     string
	RedisURL           string
	JWTSecret          string
	JWTIssuer          string
	JWTTTL             time.Duration
	PersistentJWTTTL   time.Duration
	PasswordResetTTL   time.Duration
	SMTP               SMTPConfig
	AllowedOrigins     []string
	TrustedProxyRanges []string
	WSPingInterval     time.Duration
	WSWriteTimeout     time.Duration
	WSReadTimeout      time.Duration
	AutoMigrate        bool
	DefaultUsersLimit  int
	FilaAtendimento    FilaAtendimentoConfig
}

type SMTPConfig struct {
	Host      string
	Port      int
	Username  string
	Password  string
	FromEmail string
	FromName  string
}

type FilaAtendimentoConfig struct {
	Enabled                   bool
	AppName                   string
	Env                       string
	DatabaseURL               string
	DatabaseSchema            string
	WebAppURL                 string
	UploadsDir                string
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

func Load() (Config, error) {
	databaseURL := firstNonEmpty(os.Getenv("CORE_DATABASE_URL"), os.Getenv("DATABASE_URL"))
	if databaseURL == "" {
		return Config{}, errors.New("CORE_DATABASE_URL or DATABASE_URL is required")
	}

	jwtSecret := os.Getenv("CORE_JWT_SECRET")
	if jwtSecret == "" {
		return Config{}, errors.New("CORE_JWT_SECRET is required")
	}

	cfg := Config{
		HTTPAddr:           envOrDefault("CORE_HTTP_ADDR", ":4100"),
		DatabaseURL:        databaseURL,
		DatabaseSchema:     envOrDefault("CORE_DB_SCHEMA", "platform_core"),
		RedisURL:           firstNonEmpty(os.Getenv("CORE_REDIS_URL"), os.Getenv("REDIS_URL")),
		JWTSecret:          jwtSecret,
		JWTIssuer:          envOrDefault("CORE_JWT_ISSUER", "plataforma-api"),
		JWTTTL:             minutesAsDuration("CORE_JWT_TTL_MINUTES", 720),
		PersistentJWTTTL:   minutesAsDuration("CORE_PERSISTENT_JWT_TTL_MINUTES", 43200),
		PasswordResetTTL:   minutesAsDuration("CORE_PASSWORD_RESET_TTL_MINUTES", 15),
		AllowedOrigins:     csv("CORE_ALLOWED_ORIGINS", "http://localhost:3000"),
		TrustedProxyRanges: csvWithFallbacks([]string{"CORE_TRUSTED_PROXY_RANGES", "TRUSTED_PROXY_RANGES"}, "loopback,private"),
		WSPingInterval:     secondsAsDuration("CORE_WS_PING_INTERVAL_SECONDS", 20),
		WSWriteTimeout:     secondsAsDuration("CORE_WS_WRITE_TIMEOUT_SECONDS", 10),
		WSReadTimeout:      secondsAsDuration("CORE_WS_READ_TIMEOUT_SECONDS", 60),
		AutoMigrate:        boolEnv("CORE_AUTO_MIGRATE", false),
		DefaultUsersLimit:  intEnv("CORE_DEFAULT_USERS_LIMIT", 3),
	}

	cfg.SMTP = SMTPConfig{
		Host:      strings.TrimSpace(os.Getenv("CORE_SMTP_HOST")),
		Port:      intEnv("CORE_SMTP_PORT", 0),
		Username:  strings.TrimSpace(os.Getenv("CORE_SMTP_USERNAME")),
		Password:  os.Getenv("CORE_SMTP_PASSWORD"),
		FromEmail: strings.TrimSpace(os.Getenv("CORE_SMTP_FROM_EMAIL")),
		FromName:  envOrDefault("CORE_SMTP_FROM_NAME", "Plataforma"),
	}

	cfg.FilaAtendimento = FilaAtendimentoConfig{
		Enabled:                   boolEnv("FILA_ATENDIMENTO_ENABLED", true),
		AppName:                   envOrDefault("FILA_ATENDIMENTO_APP_NAME", "fila-atendimento-api"),
		Env:                       envOrDefault("FILA_ATENDIMENTO_APP_ENV", "hosted"),
		DatabaseURL:               firstNonEmpty(os.Getenv("FILA_ATENDIMENTO_DATABASE_URL"), databaseURL),
		DatabaseSchema:            envOrDefault("FILA_ATENDIMENTO_DB_SCHEMA", "fila_atendimento"),
		WebAppURL:                 firstNonEmpty(os.Getenv("FILA_ATENDIMENTO_WEB_APP_URL"), os.Getenv("NUXT_PUBLIC_FILA_ATENDIMENTO_BASE"), "http://localhost:3000"),
		UploadsDir:                envOrDefault("FILA_ATENDIMENTO_UPLOADS_DIR", "data/fila-atendimento/uploads"),
		DatabaseMinConns:          intEnv("FILA_ATENDIMENTO_DATABASE_MIN_CONNS", 0),
		DatabaseMaxConns:          intEnv("FILA_ATENDIMENTO_DATABASE_MAX_CONNS", 10),
		CORSAllowedOrigins:        csv("FILA_ATENDIMENTO_CORS_ALLOWED_ORIGINS", strings.Join(cfg.AllowedOrigins, ",")),
		AuthTokenSecret:           firstNonEmpty(os.Getenv("FILA_ATENDIMENTO_AUTH_TOKEN_SECRET"), jwtSecret),
		AuthTokenTTL:              durationEnv("FILA_ATENDIMENTO_AUTH_TOKEN_TTL", 12*time.Hour),
		AuthInviteTTL:             durationEnv("FILA_ATENDIMENTO_AUTH_INVITE_TTL", 7*24*time.Hour),
		AuthShellBridgeSecret:     firstNonEmpty(os.Getenv("FILA_ATENDIMENTO_SHELL_BRIDGE_SECRET"), jwtSecret),
		AuthShellBridgeTenantSlug: envOrDefault("FILA_ATENDIMENTO_AUTH_SHELL_BRIDGE_TENANT_SLUG", "tenant-demo"),
		BcryptCost:                intEnv("FILA_ATENDIMENTO_AUTH_BCRYPT_COST", 10),
		ConsultantEmailDomain:     envOrDefault("FILA_ATENDIMENTO_AUTH_CONSULTANT_EMAIL_DOMAIN", "acesso.omni.local"),
		ConsultantDefaultPassword: envOrDefault("FILA_ATENDIMENTO_AUTH_CONSULTANT_DEFAULT_PASSWORD", "Omni@123"),
	}

	return cfg, nil
}

func envOrDefault(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func intEnv(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func minutesAsDuration(key string, fallbackMinutes int) time.Duration {
	return time.Duration(intEnv(key, fallbackMinutes)) * time.Minute
}

func secondsAsDuration(key string, fallbackSeconds int) time.Duration {
	return time.Duration(intEnv(key, fallbackSeconds)) * time.Second
}

func boolEnv(key string, fallback bool) bool {
	value := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func durationEnv(key string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	parsed, err := time.ParseDuration(value)
	if err != nil {
		return fallback
	}

	return parsed
}

func csv(key, fallback string) []string {
	return csvWithFallbacks([]string{key}, fallback)
}

func csvWithFallbacks(keys []string, fallback string) []string {
	raw := ""
	for _, key := range keys {
		raw = strings.TrimSpace(os.Getenv(key))
		if raw != "" {
			break
		}
	}
	if raw == "" {
		raw = fallback
	}
	parts := strings.Split(raw, ",")
	values := make([]string, 0, len(parts))
	for _, part := range parts {
		item := strings.TrimSpace(part)
		if item != "" {
			values = append(values, item)
		}
	}
	return values
}
