package auth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type Service struct {
	pool      *pgxpool.Pool
	jwtSecret []byte
	issuer    string
	ttl       time.Duration
}

func NewService(pool *pgxpool.Pool, jwtSecret, issuer string, ttl time.Duration) *Service {
	return &Service{
		pool:      pool,
		jwtSecret: []byte(jwtSecret),
		issuer:    issuer,
		ttl:       ttl,
	}
}

type userRecord struct {
	ID              string
	Name            string
	Email           string
	PasswordHash    string
	Status          string
	IsPlatformAdmin bool
}

func (s *Service) Login(ctx context.Context, input LoginInput) (LoginOutput, error) {
	email := strings.TrimSpace(strings.ToLower(input.Email))
	if email == "" || strings.TrimSpace(input.Password) == "" {
		return LoginOutput{}, ErrUnauthorized
	}

	user, err := s.findUserByEmail(ctx, email)
	if err != nil {
		return LoginOutput{}, err
	}
	if user.Status != "active" {
		return LoginOutput{}, ErrUnauthorized
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.Password)); err != nil {
		return LoginOutput{}, ErrUnauthorized
	}

	tenantID, err := s.resolveTenantID(ctx, user.ID, input.TenantID)
	if err != nil {
		return LoginOutput{}, err
	}
	if !user.IsPlatformAdmin && tenantID == "" {
		return LoginOutput{}, ErrUnauthorized
	}

	now := time.Now().UTC()
	expiresAt := now.Add(s.ttl)
	claims := Claims{
		TenantID:        tenantID,
		SessionID:       "",
		IsPlatformAdmin: user.IsPlatformAdmin,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    s.issuer,
			Subject:   user.ID,
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}

	tokenString, sessionID, err := s.issueSessionToken(ctx, user.ID, tenantID, claims, expiresAt, input.RemoteIP, input.UserAgent)
	if err != nil {
		return LoginOutput{}, err
	}

	claims.SessionID = sessionID
	outputUser := UserSummary{
		ID:              user.ID,
		Name:            user.Name,
		Email:           user.Email,
		IsPlatformAdmin: user.IsPlatformAdmin,
	}
	if tenantID != "" {
		outputUser.TenantID = &tenantID
	}

	return LoginOutput{
		AccessToken: tokenString,
		ExpiresAt:   expiresAt,
		User:        outputUser,
	}, nil
}

func (s *Service) issueSessionToken(
	ctx context.Context,
	userID, tenantID string,
	baseClaims Claims,
	expiresAt time.Time,
	remoteIP, userAgent string,
) (tokenString string, sessionID string, err error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", "", fmt.Errorf("begin login tx: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()

	tenantArg := nullableString(tenantID)
	ipArg := nullableIP(remoteIP)
	var createdSessionID string
	err = tx.QueryRow(
		ctx,
		`INSERT INTO user_sessions (user_id, tenant_id, session_token_hash, status, last_seen_at, expires_at, ip, user_agent)
		 VALUES ($1, $2, '', 'active', now(), $3, $4, $5)
		 RETURNING id`,
		userID,
		tenantArg,
		expiresAt,
		ipArg,
		nullableString(userAgent),
	).Scan(&createdSessionID)
	if err != nil {
		return "", "", fmt.Errorf("create user session: %w", err)
	}

	claims := baseClaims
	claims.SessionID = createdSessionID
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err = token.SignedString(s.jwtSecret)
	if err != nil {
		return "", "", fmt.Errorf("sign token: %w", err)
	}

	hashed := hashToken(tokenString)
	if _, err := tx.Exec(
		ctx,
		`UPDATE user_sessions SET session_token_hash = $1 WHERE id = $2`,
		hashed,
		createdSessionID,
	); err != nil {
		return "", "", fmt.Errorf("store token hash: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return "", "", fmt.Errorf("commit login tx: %w", err)
	}

	return tokenString, createdSessionID, nil
}

func (s *Service) ParseToken(rawToken string) (Claims, error) {
	rawToken = strings.TrimSpace(rawToken)
	if rawToken == "" {
		return Claims{}, ErrUnauthorized
	}

	parsed, err := jwt.ParseWithClaims(
		rawToken,
		&Claims{},
		func(token *jwt.Token) (interface{}, error) {
			if token.Method != jwt.SigningMethodHS256 {
				return nil, ErrUnauthorized
			}
			return s.jwtSecret, nil
		},
		jwt.WithIssuer(s.issuer),
	)
	if err != nil {
		return Claims{}, ErrUnauthorized
	}

	claims, ok := parsed.Claims.(*Claims)
	if !ok || claims.Subject == "" || claims.SessionID == "" {
		return Claims{}, ErrUnauthorized
	}

	return *claims, nil
}

func (s *Service) ValidateSession(ctx context.Context, claims Claims) error {
	var sessionStatus string
	var userStatus string
	var expiresAt time.Time

	err := s.pool.QueryRow(
		ctx,
		`SELECT s.status, s.expires_at, u.status
		 FROM user_sessions s
		 JOIN users u ON u.id = s.user_id
		 WHERE s.id = $1 AND s.user_id = $2`,
		claims.SessionID,
		claims.Subject,
	).Scan(&sessionStatus, &expiresAt, &userStatus)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrUnauthorized
		}
		return fmt.Errorf("validate session: %w", err)
	}

	if sessionStatus != "active" || userStatus != "active" || expiresAt.Before(time.Now().UTC()) {
		return ErrUnauthorized
	}

	_, _ = s.pool.Exec(ctx, `UPDATE user_sessions SET last_seen_at = now() WHERE id = $1`, claims.SessionID)
	return nil
}

func (s *Service) Logout(ctx context.Context, claims Claims) error {
	result, err := s.pool.Exec(
		ctx,
		`UPDATE user_sessions
		 SET status = 'revoked', revoked_at = now()
		 WHERE id = $1 AND user_id = $2 AND status = 'active'`,
		claims.SessionID,
		claims.Subject,
	)
	if err != nil {
		return fmt.Errorf("logout: %w", err)
	}
	if result.RowsAffected() == 0 {
		return ErrUnauthorized
	}
	return nil
}

func (s *Service) Me(ctx context.Context, claims Claims) (MeOutput, error) {
	var user UserSummary
	var (
		clientID        *int
		moduleCodesJSON []byte
	)
	err := s.pool.QueryRow(
		ctx,
		`SELECT
			u.id,
			u.name,
			u.email::text,
			COALESCE(u.nick, ''),
			COALESCE(u.avatar_url, ''),
			u.is_platform_admin,
			t.legacy_id,
			COALESCE(t.name, ''),
			CASE
				WHEN NULLIF(scope.access_level, '') IS NOT NULL THEN scope.access_level
				WHEN u.is_platform_admin THEN 'admin'
				ELSE 'marketing'
			END,
			CASE
				WHEN NULLIF(scope.user_type, '') IS NOT NULL THEN scope.user_type
				WHEN u.is_platform_admin THEN 'admin'
				ELSE 'client'
			END,
			COALESCE(u.preferences::text, '{}'),
			COALESCE(module_scope.module_codes, '[]'::json),
			COALESCE(module_scope.atendimento_access, false)
		 FROM users u
		 LEFT JOIN LATERAL (
			SELECT
				tu.id,
				tu.tenant_id,
				tu.access_level,
				tu.user_type,
				tu.is_owner,
				tu.created_at
			FROM tenant_users tu
			WHERE tu.user_id = $1::uuid
			  AND ($2 = '' OR tu.tenant_id = NULLIF($2, '')::uuid)
			  AND tu.status IN ('active', 'invited', 'suspended')
			ORDER BY
				CASE tu.status
					WHEN 'active' THEN 0
					WHEN 'invited' THEN 1
					ELSE 2
				END,
				tu.is_owner DESC,
				tu.created_at DESC
			LIMIT 1
		 ) scope ON true
		 LEFT JOIN tenants t ON t.id = scope.tenant_id AND t.deleted_at IS NULL
		 LEFT JOIN LATERAL (
			SELECT
				COALESCE(
					json_agg(m.code ORDER BY m.code) FILTER (WHERE m.code IS NOT NULL),
					'[]'::json
				) AS module_codes,
				COALESCE(bool_or(m.code = 'atendimento'), false) AS atendimento_access
			FROM tenant_user_modules tum
			JOIN modules m ON m.id = tum.module_id
			WHERE tum.tenant_user_id = scope.id
			  AND tum.status = 'active'
		 ) module_scope ON true
		 WHERE u.id = $1::uuid AND u.status = 'active' AND u.deleted_at IS NULL`,
		claims.Subject,
		claims.TenantID,
	).Scan(
		&user.ID,
		&user.Name,
		&user.Email,
		&user.Nick,
		&user.ProfileImage,
		&user.IsPlatformAdmin,
		&clientID,
		&user.ClientName,
		&user.Level,
		&user.UserType,
		&user.Preferences,
		&moduleCodesJSON,
		&user.AtendimentoAccess,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return MeOutput{}, ErrUnauthorized
		}
		return MeOutput{}, fmt.Errorf("fetch me: %w", err)
	}

	if claims.TenantID != "" {
		user.TenantID = &claims.TenantID
	}
	user.ClientID = clientID
	if err := json.Unmarshal(moduleCodesJSON, &user.ModuleCodes); err != nil {
		user.ModuleCodes = []string{}
	}
	if user.IsPlatformAdmin {
		user.Level = "admin"
		user.UserType = "admin"
	}

	return MeOutput{User: user}, nil
}

func (s *Service) findUserByEmail(ctx context.Context, email string) (userRecord, error) {
	var user userRecord
	err := s.pool.QueryRow(
		ctx,
		`SELECT id, name, email::text, password_hash, status, is_platform_admin
		 FROM users
		 WHERE email = $1 AND deleted_at IS NULL
		 LIMIT 1`,
		email,
	).Scan(&user.ID, &user.Name, &user.Email, &user.PasswordHash, &user.Status, &user.IsPlatformAdmin)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return userRecord{}, ErrUnauthorized
		}
		return userRecord{}, fmt.Errorf("find user by email: %w", err)
	}

	return user, nil
}

func (s *Service) resolveTenantID(ctx context.Context, userID, requestedTenantID string) (string, error) {
	if requestedTenantID != "" {
		var tenantID string
		err := s.pool.QueryRow(
			ctx,
			`SELECT tenant_id
			 FROM tenant_users
			 WHERE user_id = $1 AND tenant_id = $2 AND status = 'active'
			 LIMIT 1`,
			userID,
			requestedTenantID,
		).Scan(&tenantID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return "", ErrUnauthorized
			}
			return "", fmt.Errorf("resolve explicit tenant: %w", err)
		}
		return tenantID, nil
	}

	var tenantID string
	err := s.pool.QueryRow(
		ctx,
		`SELECT tenant_id
		 FROM tenant_users
		 WHERE user_id = $1 AND status = 'active'
		 ORDER BY is_owner DESC, created_at ASC
		 LIMIT 1`,
		userID,
	).Scan(&tenantID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil
		}
		return "", fmt.Errorf("resolve tenant from memberships: %w", err)
	}

	return tenantID, nil
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func nullableString(value string) interface{} {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return strings.TrimSpace(value)
}

func nullableIP(value string) interface{} {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}

	if host, _, err := net.SplitHostPort(value); err == nil {
		value = host
	}
	if ip := net.ParseIP(value); ip != nil {
		return ip.String()
	}
	return nil
}
