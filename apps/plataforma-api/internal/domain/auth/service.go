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
	pool             *pgxpool.Pool
	jwtSecret        []byte
	issuer           string
	ttl              time.Duration
	passwordResetTTL time.Duration
	smtpConfig       SMTPConfig
	now              func() time.Time
	sendMail         func(SMTPConfig, []string, []byte) error
}

const globalSessionConfigKey = "global"

func NewService(pool *pgxpool.Pool, jwtSecret, issuer string, ttl time.Duration) *Service {
	return &Service{
		pool:             pool,
		jwtSecret:        []byte(jwtSecret),
		issuer:           issuer,
		ttl:              ttl,
		passwordResetTTL: defaultPasswordResetTTL,
		now:              time.Now,
		sendMail:         defaultSendMail,
	}
}

func (s *Service) ConfigurePasswordReset(ttl time.Duration, smtpConfig SMTPConfig) {
	if ttl <= 0 {
		ttl = defaultPasswordResetTTL
	}

	s.passwordResetTTL = ttl
	s.smtpConfig = smtpConfig
	if s.now == nil {
		s.now = time.Now
	}
	if s.sendMail == nil {
		s.sendMail = defaultSendMail
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

type activeSessionRow struct {
	SessionID       string
	UserID          string
	UserName        string
	UserEmail       string
	IsPlatformAdmin bool
	TenantID        string
	TenantSlug      string
	TenantName      string
	DeviceName      string
	UserAgent       string
	IP              string
	CreatedAt       time.Time
	LastSeenAt      time.Time
	ExpiresAt       time.Time
}

type sessionManagementScope struct {
	PlatformWide bool
	TenantID     string
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
	if err := resolveLoginUserStatusError(user.Status); err != nil {
		return LoginOutput{}, err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.Password)); err != nil {
		return LoginOutput{}, ErrUnauthorized
	}

	tenantID, err := s.resolveTenantID(ctx, user.ID, input.TenantID)
	if err != nil {
		return LoginOutput{}, err
	}
	if !user.IsPlatformAdmin && tenantID == "" {
		return LoginOutput{}, ErrTenantMembership
	}

	now := time.Now().UTC()
	sessionTTL, err := s.resolveSessionTTL(ctx)
	if err != nil {
		return LoginOutput{}, err
	}
	expiresAt := now.Add(sessionTTL)
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
	if meOutput, meErr := s.Me(ctx, claims); meErr == nil {
		outputUser = meOutput.User
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

	now := time.Now().UTC()
	if sessionStatus != "active" || userStatus != "active" || !expiresAt.After(now) {
		if sessionStatus == "active" && !expiresAt.After(now) {
			_, _ = s.pool.Exec(ctx, `UPDATE user_sessions SET status = 'expired' WHERE id = $1 AND status = 'active'`, claims.SessionID)
		}
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

func (s *Service) GetSessionConfig(ctx context.Context) (SessionConfig, error) {
	if err := s.ensureSessionConfig(ctx); err != nil {
		return SessionConfig{}, err
	}

	var config SessionConfig
	err := s.pool.QueryRow(
		ctx,
		`SELECT ttl_minutes, updated_at
		 FROM auth_session_settings
		 WHERE scope_key = $1`,
		globalSessionConfigKey,
	).Scan(&config.TTLMinutes, &config.UpdatedAt)
	if err != nil {
		return SessionConfig{}, fmt.Errorf("load session config: %w", err)
	}

	config.DefaultTTLMinutes = s.defaultTTLMinutes()
	config.MinTTLMinutes = MinSessionTTLMinutes
	config.MaxTTLMinutes = MaxSessionTTLMinutes
	return config, nil
}

func (s *Service) UpdateSessionConfig(ctx context.Context, input UpdateSessionConfigInput) (SessionConfig, error) {
	if input.TTLMinutes < MinSessionTTLMinutes || input.TTLMinutes > MaxSessionTTLMinutes {
		return SessionConfig{}, ErrInvalidSessionTTL
	}

	if err := s.ensureSessionConfig(ctx); err != nil {
		return SessionConfig{}, err
	}

	if _, err := s.pool.Exec(
		ctx,
		`UPDATE auth_session_settings
		 SET ttl_minutes = $2,
		     updated_at = now(),
		     updated_by_user_id = NULLIF($3, '')::uuid
		 WHERE scope_key = $1`,
		globalSessionConfigKey,
		input.TTLMinutes,
		strings.TrimSpace(input.UpdatedByUserID),
	); err != nil {
		return SessionConfig{}, fmt.Errorf("update session config: %w", err)
	}

	return s.GetSessionConfig(ctx)
}

func (s *Service) ListActiveSessions(ctx context.Context, claims Claims) ([]ActiveSessionUser, error) {
	scope, err := s.resolveSessionManagementScope(ctx, claims)
	if err != nil {
		return nil, err
	}

	if err := s.expireStaleSessions(ctx); err != nil {
		return nil, err
	}

	query := `SELECT
			s.id::text,
			u.id::text,
			u.name,
			u.email::text,
			u.is_platform_admin,
			COALESCE(t.id::text, ''),
			COALESCE(t.slug, ''),
			COALESCE(t.name, ''),
			COALESCE(s.device_name, ''),
			COALESCE(s.user_agent, ''),
			COALESCE(s.ip::text, ''),
			s.created_at,
			s.last_seen_at,
			s.expires_at
		 FROM user_sessions s
		 JOIN users u ON u.id = s.user_id
		 LEFT JOIN tenants t ON t.id = s.tenant_id AND t.deleted_at IS NULL
		 WHERE s.status = 'active'
		   AND s.expires_at > now()
	`
	args := []any{}
	if !scope.PlatformWide {
		query += ` AND s.tenant_id = NULLIF($1, '')::uuid
		  AND u.is_platform_admin = false`
		args = append(args, scope.TenantID)
	}
	query += ` ORDER BY u.name ASC, u.email ASC, s.last_seen_at DESC, s.created_at DESC`

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list active sessions: %w", err)
	}
	defer rows.Close()

	groups := make([]ActiveSessionUser, 0)
	groupIndexByUserID := make(map[string]int)

	for rows.Next() {
		var row activeSessionRow
		if err := rows.Scan(
			&row.SessionID,
			&row.UserID,
			&row.UserName,
			&row.UserEmail,
			&row.IsPlatformAdmin,
			&row.TenantID,
			&row.TenantSlug,
			&row.TenantName,
			&row.DeviceName,
			&row.UserAgent,
			&row.IP,
			&row.CreatedAt,
			&row.LastSeenAt,
			&row.ExpiresAt,
		); err != nil {
			return nil, fmt.Errorf("scan active session: %w", err)
		}

		device := ActiveSessionDevice{
			ID:         row.SessionID,
			TenantID:   stringPointer(row.TenantID),
			TenantSlug: stringPointer(row.TenantSlug),
			TenantName: row.TenantName,
			DeviceName: row.DeviceName,
			UserAgent:  row.UserAgent,
			IP:         row.IP,
			CreatedAt:  row.CreatedAt,
			LastSeenAt: row.LastSeenAt,
			ExpiresAt:  row.ExpiresAt,
			Current:    row.SessionID == claims.SessionID,
		}

		groupIndex, exists := groupIndexByUserID[row.UserID]
		if !exists {
			groups = append(groups, ActiveSessionUser{
				UserID:          row.UserID,
				Name:            row.UserName,
				Email:           row.UserEmail,
				IsPlatformAdmin: row.IsPlatformAdmin,
				LastSeenAt:      row.LastSeenAt,
				ExpiresAt:       row.ExpiresAt,
				ActiveSessions:  []ActiveSessionDevice{},
			})
			groupIndex = len(groups) - 1
			groupIndexByUserID[row.UserID] = groupIndex
		}

		group := &groups[groupIndex]
		group.ActiveSessions = append(group.ActiveSessions, device)
		group.SessionCount = len(group.ActiveSessions)
		group.MultipleDevices = group.SessionCount > 1
		group.HasCurrentSession = group.HasCurrentSession || device.Current
		if row.LastSeenAt.After(group.LastSeenAt) {
			group.LastSeenAt = row.LastSeenAt
		}
		if row.ExpiresAt.After(group.ExpiresAt) {
			group.ExpiresAt = row.ExpiresAt
		}
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate active sessions: %w", err)
	}

	return groups, nil
}

func (s *Service) RevokeSession(ctx context.Context, claims Claims, sessionID string) (SessionRevocationResult, error) {
	scope, err := s.resolveSessionManagementScope(ctx, claims)
	if err != nil {
		return SessionRevocationResult{}, err
	}

	normalizedSessionID := strings.TrimSpace(sessionID)
	if normalizedSessionID == "" {
		return SessionRevocationResult{}, ErrSessionNotFound
	}

	var revokedUserID string
	if scope.PlatformWide {
		err = s.pool.QueryRow(
			ctx,
			`UPDATE user_sessions
		 SET status = 'revoked', revoked_at = now()
		 WHERE id = $1
		   AND status = 'active'
		   AND expires_at > now()
		 RETURNING user_id::text`,
			normalizedSessionID,
		).Scan(&revokedUserID)
	} else {
		err = s.pool.QueryRow(
			ctx,
			`UPDATE user_sessions AS s
			 SET status = 'revoked', revoked_at = now()
			 FROM users AS u
			 WHERE s.id = $1
			   AND s.status = 'active'
			   AND s.expires_at > now()
			   AND s.tenant_id = NULLIF($2, '')::uuid
			   AND s.user_id = u.id
			   AND u.is_platform_admin = false
			 RETURNING s.user_id::text`,
			normalizedSessionID,
			scope.TenantID,
		).Scan(&revokedUserID)
	}
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return SessionRevocationResult{}, ErrSessionNotFound
		}
		return SessionRevocationResult{}, fmt.Errorf("revoke session: %w", err)
	}

	return SessionRevocationResult{
		UserID:                revokedUserID,
		SessionID:             normalizedSessionID,
		RevokedCount:          1,
		RevokedCurrentSession: normalizedSessionID == claims.SessionID,
	}, nil
}

func (s *Service) RevokeUserSessions(ctx context.Context, claims Claims, userID string) (SessionRevocationResult, error) {
	scope, err := s.resolveSessionManagementScope(ctx, claims)
	if err != nil {
		return SessionRevocationResult{}, err
	}

	normalizedUserID := strings.TrimSpace(userID)
	if normalizedUserID == "" {
		return SessionRevocationResult{}, ErrSessionNotFound
	}

	query := `UPDATE user_sessions
		 SET status = 'revoked', revoked_at = now()
		 WHERE user_id = NULLIF($1, '')::uuid
		   AND status = 'active'
		   AND expires_at > now()`
	args := []any{normalizedUserID}
	if scope.PlatformWide {
		query += ` RETURNING id::text`
	} else {
		query = `UPDATE user_sessions AS s
		 SET status = 'revoked', revoked_at = now()
		 FROM users AS u
		 WHERE s.user_id = NULLIF($1, '')::uuid
		   AND s.status = 'active'
		   AND s.expires_at > now()
		   AND s.tenant_id = NULLIF($2, '')::uuid
		   AND s.user_id = u.id
		   AND u.is_platform_admin = false
		 RETURNING s.id::text`
		args = append(args, scope.TenantID)
	}

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return SessionRevocationResult{}, fmt.Errorf("revoke user sessions: %w", err)
	}
	defer rows.Close()

	revokedCount := 0
	revokedCurrentSession := false
	for rows.Next() {
		var revokedSessionID string
		if err := rows.Scan(&revokedSessionID); err != nil {
			return SessionRevocationResult{}, fmt.Errorf("scan revoked session: %w", err)
		}
		revokedCount++
		if revokedSessionID == claims.SessionID {
			revokedCurrentSession = true
		}
	}

	if err := rows.Err(); err != nil {
		return SessionRevocationResult{}, fmt.Errorf("iterate revoked sessions: %w", err)
	}

	if revokedCount == 0 {
		return SessionRevocationResult{}, ErrSessionNotFound
	}

	return SessionRevocationResult{
		UserID:                normalizedUserID,
		RevokedCount:          revokedCount,
		RevokedCurrentSession: revokedCurrentSession,
	}, nil
}

func (s *Service) Me(ctx context.Context, claims Claims) (MeOutput, error) {
	var user UserSummary
	var (
		resolvedTenantID   string
		resolvedTenantSlug string
		clientID           *int
		moduleCodesJSON    []byte
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
			COALESCE(scope.tenant_id::text, ''),
			COALESCE(t.slug, ''),
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
		&resolvedTenantID,
		&resolvedTenantSlug,
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
	} else if resolvedTenantID != "" {
		user.TenantID = &resolvedTenantID
	}
	if resolvedTenantSlug != "" {
		user.TenantSlug = &resolvedTenantSlug
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

func (s *Service) ensureSessionConfig(ctx context.Context) error {
	_, err := s.pool.Exec(
		ctx,
		`INSERT INTO auth_session_settings (scope_key, ttl_minutes)
		 VALUES ($1, $2)
		 ON CONFLICT (scope_key) DO NOTHING`,
		globalSessionConfigKey,
		s.defaultTTLMinutes(),
	)
	if err != nil {
		return fmt.Errorf("ensure session config: %w", err)
	}

	return nil
}

func (s *Service) resolveSessionManagementScope(ctx context.Context, claims Claims) (sessionManagementScope, error) {
	if claims.IsPlatformAdmin {
		return sessionManagementScope{PlatformWide: true}, nil
	}

	me, err := s.Me(ctx, claims)
	if err != nil {
		if errors.Is(err, ErrUnauthorized) {
			return sessionManagementScope{}, ErrForbidden
		}
		return sessionManagementScope{}, err
	}

	tenantID := strings.TrimSpace(claims.TenantID)
	if me.User.TenantID != nil && strings.TrimSpace(*me.User.TenantID) != "" {
		tenantID = strings.TrimSpace(*me.User.TenantID)
	}

	level := strings.ToLower(strings.TrimSpace(me.User.Level))
	userType := strings.ToLower(strings.TrimSpace(me.User.UserType))
	if tenantID == "" || userType != "admin" || level != "admin" {
		return sessionManagementScope{}, ErrForbidden
	}

	return sessionManagementScope{TenantID: tenantID}, nil
}

func (s *Service) expireStaleSessions(ctx context.Context) error {
	if _, err := s.pool.Exec(
		ctx,
		`UPDATE user_sessions
		 SET status = 'expired'
		 WHERE status = 'active'
		   AND expires_at <= now()`,
	); err != nil {
		return fmt.Errorf("expire stale sessions: %w", err)
	}

	return nil
}

func (s *Service) resolveSessionTTL(ctx context.Context) (time.Duration, error) {
	config, err := s.GetSessionConfig(ctx)
	if err != nil {
		return 0, err
	}

	return time.Duration(config.TTLMinutes) * time.Minute, nil
}

func (s *Service) defaultTTLMinutes() int {
	minutes := int(s.ttl / time.Minute)
	if minutes < MinSessionTTLMinutes {
		return MinSessionTTLMinutes
	}
	if minutes > MaxSessionTTLMinutes {
		return MaxSessionTTLMinutes
	}
	return minutes
}

func resolveLoginUserStatusError(status string) error {
	switch strings.TrimSpace(strings.ToLower(status)) {
	case "active":
		return nil
	case "inactive":
		return ErrUserInactive
	case "blocked":
		return ErrUserBlocked
	case "pending_invite":
		return ErrUserPendingInvite
	default:
		return ErrUnauthorized
	}
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

func stringPointer(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}
