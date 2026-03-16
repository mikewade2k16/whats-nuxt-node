package middleware

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

type rateLimitBucket struct {
	Count        int
	ResetAt      time.Time
	BlockedUntil time.Time
}

type rateLimitStore struct {
	mu      sync.Mutex
	buckets map[string]rateLimitBucket
}

type RateLimitOptions struct {
	Scope    string
	Max      int
	Window   time.Duration
	Block    time.Duration
	Message  string
	RedisURL string
}

type rateLimitResult struct {
	Allowed    bool
	Remaining  int
	ResetAt    time.Time
	RetryAfter int
}

var globalRateLimitStore = &rateLimitStore{
	buckets: make(map[string]rateLimitBucket),
}

var (
	rateLimitRedisMu      sync.Mutex
	rateLimitRedisClients = map[string]*redis.Client{}
)

const rateLimitRedisScript = `
local bucketKey = KEYS[1]
local blockKey = KEYS[2]
local now = tonumber(ARGV[1])
local maxRequests = tonumber(ARGV[2])
local windowMs = tonumber(ARGV[3])
local blockMs = tonumber(ARGV[4])

local blockedUntil = tonumber(redis.call('GET', blockKey) or '0')
if blockedUntil > now then
  local retryAfter = math.floor((blockedUntil - now + 999) / 1000)
  return {0, 0, blockedUntil, retryAfter}
end

local count = redis.call('INCR', bucketKey)
if count == 1 then
  redis.call('PEXPIRE', bucketKey, windowMs)
end

local ttl = redis.call('PTTL', bucketKey)
if ttl < 0 then
  ttl = windowMs
  redis.call('PEXPIRE', bucketKey, windowMs)
end

local resetAt = now + ttl
local remaining = maxRequests - count
if remaining < 0 then
  remaining = 0
end

if count > maxRequests then
  local nextBlockedUntil = now + blockMs
  redis.call('SET', blockKey, tostring(nextBlockedUntil), 'PX', blockMs)
  local retryAfter = math.floor((blockMs + 999) / 1000)
  return {0, 0, resetAt, retryAfter}
end

return {1, remaining, resetAt, 0}
`

func RateLimit(options RateLimitOptions) func(http.Handler) http.Handler {
	scope := normalizeRateLimitKey(options.Scope)
	max := options.Max
	if max <= 0 {
		max = 10
	}
	window := options.Window
	if window <= 0 {
		window = 5 * time.Minute
	}
	block := options.Block
	if block < window {
		block = window
	}
	message := strings.TrimSpace(options.Message)
	if message == "" {
		message = "too many requests"
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			now := time.Now()
			key := scope + ":" + normalizeRateLimitKey(resolveClientIP(r))

			result, err := applyRedisRateLimit(r.Context(), options.RedisURL, key, max, window, block)
			if err != nil {
				result = applyMemoryRateLimit(now, key, max, window, block)
			}

			writeRateLimitHeaders(w, max, result.Remaining, result.ResetAt, result.RetryAfter)
			if !result.Allowed {
				writeRateLimitError(w, message)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func applyMemoryRateLimit(now time.Time, key string, max int, window, block time.Duration) rateLimitResult {
	globalRateLimitStore.mu.Lock()
	defer globalRateLimitStore.mu.Unlock()

	globalRateLimitStore.cleanupLocked(now)
	bucket, ok := globalRateLimitStore.buckets[key]
	if !ok || !now.Before(bucket.ResetAt) {
		bucket = rateLimitBucket{
			Count:   0,
			ResetAt: now.Add(window),
		}
	}

	if now.Before(bucket.BlockedUntil) {
		retryAfter := int(bucket.BlockedUntil.Sub(now).Seconds())
		if retryAfter < 1 {
			retryAfter = 1
		}
		globalRateLimitStore.buckets[key] = bucket
		return rateLimitResult{
			Allowed:    false,
			Remaining:  0,
			ResetAt:    bucket.ResetAt,
			RetryAfter: retryAfter,
		}
	}

	bucket.Count++
	remaining := max - bucket.Count
	if remaining < 0 {
		remaining = 0
	}

	if bucket.Count > max {
		bucket.BlockedUntil = now.Add(block)
		globalRateLimitStore.buckets[key] = bucket
		retryAfter := int(block.Seconds())
		if retryAfter < 1 {
			retryAfter = 1
		}
		return rateLimitResult{
			Allowed:    false,
			Remaining:  0,
			ResetAt:    bucket.ResetAt,
			RetryAfter: retryAfter,
		}
	}

	globalRateLimitStore.buckets[key] = bucket
	return rateLimitResult{
		Allowed:    true,
		Remaining:  remaining,
		ResetAt:    bucket.ResetAt,
		RetryAfter: 0,
	}
}

func applyRedisRateLimit(ctx context.Context, redisURL, key string, max int, window, block time.Duration) (rateLimitResult, error) {
	client, err := getRateLimitRedisClient(redisURL)
	if err != nil || client == nil {
		return rateLimitResult{}, err
	}

	now := time.Now()
	windowMs := window.Milliseconds()
	if windowMs < 1000 {
		windowMs = 1000
	}
	blockMs := block.Milliseconds()
	if blockMs < windowMs {
		blockMs = windowMs
	}

	result, err := client.Eval(
		ctx,
		rateLimitRedisScript,
		[]string{
			"rate-limit:" + key,
			"rate-limit:block:" + key,
		},
		now.UnixMilli(),
		max,
		windowMs,
		blockMs,
	).Result()
	if err != nil {
		return rateLimitResult{}, err
	}

	values, ok := result.([]interface{})
	if !ok || len(values) < 4 {
		return rateLimitResult{}, redis.ErrClosed
	}

	allowed := toInt64(values[0]) == 1
	remaining := int(toInt64(values[1]))
	resetAtMs := toInt64(values[2])
	retryAfter := int(toInt64(values[3]))
	if retryAfter < 0 {
		retryAfter = 0
	}

	return rateLimitResult{
		Allowed:    allowed,
		Remaining:  remaining,
		ResetAt:    time.UnixMilli(resetAtMs),
		RetryAfter: retryAfter,
	}, nil
}

func getRateLimitRedisClient(redisURL string) (*redis.Client, error) {
	normalized := strings.TrimSpace(redisURL)
	if normalized == "" {
		return nil, nil
	}

	rateLimitRedisMu.Lock()
	defer rateLimitRedisMu.Unlock()

	if client, ok := rateLimitRedisClients[normalized]; ok {
		return client, nil
	}

	options, err := redis.ParseURL(normalized)
	if err != nil {
		return nil, err
	}
	options.MaxRetries = 2
	client := redis.NewClient(options)
	rateLimitRedisClients[normalized] = client
	return client, nil
}

func toInt64(value interface{}) int64 {
	switch typed := value.(type) {
	case int64:
		return typed
	case int:
		return int64(typed)
	case float64:
		return int64(typed)
	case string:
		parsed, err := strconv.ParseInt(strings.TrimSpace(typed), 10, 64)
		if err == nil {
			return parsed
		}
	}
	return 0
}

func (s *rateLimitStore) cleanupLocked(now time.Time) {
	if len(s.buckets) < 2000 {
		return
	}
	for key, bucket := range s.buckets {
		if now.Before(bucket.BlockedUntil) || now.Before(bucket.ResetAt) {
			continue
		}
		delete(s.buckets, key)
	}
}

func resolveClientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err == nil && host != "" {
		return host
	}

	if strings.TrimSpace(r.RemoteAddr) != "" {
		return strings.TrimSpace(r.RemoteAddr)
	}

	return "unknown"
}

func normalizeRateLimitKey(value string) string {
	normalized := strings.TrimSpace(strings.ToLower(value))
	normalized = strings.ReplaceAll(normalized, " ", ":")
	if normalized == "" {
		return "unknown"
	}
	return normalized
}

func writeRateLimitHeaders(w http.ResponseWriter, limit, remaining int, resetAt time.Time, retryAfter int) {
	w.Header().Set("X-Rate-Limit-Limit", strconv.Itoa(limit))
	w.Header().Set("X-Rate-Limit-Remaining", strconv.Itoa(remaining))
	w.Header().Set("X-Rate-Limit-Reset", strconv.FormatInt(resetAt.Unix(), 10))
	if retryAfter > 0 {
		w.Header().Set("Retry-After", strconv.Itoa(retryAfter))
	}
}

func writeRateLimitError(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusTooManyRequests)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error":   "rate_limited",
		"message": message,
	})
}
