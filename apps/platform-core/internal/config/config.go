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
	AllowedOrigins     []string
	TrustedProxyRanges []string
	WSPingInterval     time.Duration
	WSWriteTimeout     time.Duration
	WSReadTimeout      time.Duration
	AutoMigrate        bool
	DefaultUsersLimit  int
}

func Load() (Config, error) {
	databaseURL := firstNonEmpty(os.Getenv("CORE_DATABASE_URL"), os.Getenv("DATABASE_URL"))
	if databaseURL == "" {
		return Config{}, errors.New("CORE_DATABASE_URL or DATABASE_URL is required")
	}

	jwtSecret := os.Getenv("CORE_JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = os.Getenv("JWT_SECRET")
	}
	if jwtSecret == "" {
		return Config{}, errors.New("CORE_JWT_SECRET or JWT_SECRET is required")
	}

	cfg := Config{
		HTTPAddr:           envOrDefault("CORE_HTTP_ADDR", ":4100"),
		DatabaseURL:        databaseURL,
		DatabaseSchema:     envOrDefault("CORE_DB_SCHEMA", "platform_core"),
		RedisURL:           firstNonEmpty(os.Getenv("CORE_REDIS_URL"), os.Getenv("REDIS_URL")),
		JWTSecret:          jwtSecret,
		JWTIssuer:          envOrDefault("CORE_JWT_ISSUER", "platform-core"),
		JWTTTL:             minutesAsDuration("CORE_JWT_TTL_MINUTES", 60),
		AllowedOrigins:     csv("CORE_ALLOWED_ORIGINS", "http://localhost:3000"),
		TrustedProxyRanges: csvWithFallbacks([]string{"CORE_TRUSTED_PROXY_RANGES", "TRUSTED_PROXY_RANGES"}, "loopback,private"),
		WSPingInterval:     secondsAsDuration("CORE_WS_PING_INTERVAL_SECONDS", 20),
		WSWriteTimeout:     secondsAsDuration("CORE_WS_WRITE_TIMEOUT_SECONDS", 10),
		WSReadTimeout:      secondsAsDuration("CORE_WS_READ_TIMEOUT_SECONDS", 60),
		AutoMigrate:        boolEnv("CORE_AUTO_MIGRATE", false),
		DefaultUsersLimit:  intEnv("CORE_DEFAULT_USERS_LIMIT", 3),
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
