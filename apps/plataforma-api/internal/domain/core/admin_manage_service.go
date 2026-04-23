package core

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"
)

const (
	adminDefaultPageLimit = 50
	adminMaxPageLimit     = 200
)

var slugInvalidCharsPattern = regexp.MustCompile(`[^a-z0-9]+`)

var managedAdminRoleCodes = []string{
	"platform_root",
	"tenant_admin",
	"module_manager",
	"module_agent",
}

type tenantUserDirectoryRules struct {
	RequireStoreLink    bool
	RequireRegistration bool
	StoreCount          int
}

type adminUserDirectoryState struct {
	BusinessRole       string
	StoreID            string
	RegistrationNumber string
}

type adminUserMembershipState struct {
	BusinessRole string
	AccessLevel  string
	UserType     string
	IsOwner      bool
}

func resolveBusinessRoleForAccessLevel(level string, isPlatformAdmin bool) string {
	if isPlatformAdmin {
		return "system_admin"
	}

	switch normalizeAccessLevel(level) {
	case "admin":
		return "owner"
	case "consultant":
		return "consultant"
	case "manager":
		return "general_manager"
	case "finance":
		return "finance"
	case "viewer":
		return "viewer"
	default:
		return "marketing"
	}
}

func resolveUserTypeForBusinessRole(role string, isPlatformAdmin bool) string {
	if isPlatformAdmin {
		return "admin"
	}

	switch normalizeBusinessRole(role) {
	case "owner", "system_admin":
		return "admin"
	default:
		return "client"
	}
}

func resolveOwnerFlagForBusinessRole(role string, isPlatformAdmin bool) bool {
	if isPlatformAdmin {
		return true
	}

	switch normalizeBusinessRole(role) {
	case "owner", "system_admin":
		return true
	default:
		return false
	}
}

func resolveAdminUserMembershipState(rawRole, level string, isPlatformAdmin bool) adminUserMembershipState {
	if isPlatformAdmin {
		return adminUserMembershipState{
			BusinessRole: "system_admin",
			AccessLevel:  "admin",
			UserType:     "admin",
			IsOwner:      true,
		}
	}

	role := normalizeBusinessRole(rawRole)
	if role == "" {
		role = resolveBusinessRoleForAccessLevel(level, isPlatformAdmin)
	}

	return adminUserMembershipState{
		BusinessRole: role,
		AccessLevel:  resolveAccessLevelForBusinessRole(role, level, isPlatformAdmin),
		UserType:     resolveUserTypeForBusinessRole(role, isPlatformAdmin),
		IsOwner:      resolveOwnerFlagForBusinessRole(role, isPlatformAdmin),
	}
}

func validateExplicitBusinessRole(raw string, allowSystemAdmin bool) error {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}

	role := normalizeBusinessRole(trimmed)
	if role == "" {
		return ErrInvalidInput
	}
	if role == "system_admin" && !allowSystemAdmin {
		return ErrForbidden
	}

	return nil
}

func effectiveTenantUserAccessLevelSQL(scopeAlias, userAlias string) string {
	return fmt.Sprintf(`CASE
		WHEN NULLIF(%s.access_level, '') IS NOT NULL THEN %s.access_level
		WHEN COALESCE(%s.business_role, '') IN ('owner', 'system_admin') THEN 'admin'
		WHEN COALESCE(%s.business_role, '') = 'consultant' THEN 'consultant'
		WHEN COALESCE(%s.business_role, '') IN ('store_manager', 'general_manager') THEN 'manager'
		WHEN COALESCE(%s.business_role, '') = 'finance' THEN 'finance'
		WHEN COALESCE(%s.business_role, '') = 'viewer' THEN 'viewer'
		WHEN %s.is_platform_admin THEN 'admin'
		ELSE 'marketing'
	END`, scopeAlias, scopeAlias, scopeAlias, scopeAlias, scopeAlias, scopeAlias, scopeAlias, userAlias)
}

func effectiveTenantUserTypeSQL(scopeAlias, userAlias string) string {
	return fmt.Sprintf(`CASE
		WHEN NULLIF(%s.user_type, '') IS NOT NULL THEN %s.user_type
		WHEN COALESCE(%s.business_role, '') IN ('owner', 'system_admin') THEN 'admin'
		WHEN %s.is_platform_admin THEN 'admin'
		ELSE 'client'
	END`, scopeAlias, scopeAlias, scopeAlias, userAlias)
}

func effectiveTenantUserBusinessRoleSQL(scopeAlias, userAlias string) string {
	return fmt.Sprintf(`CASE
		WHEN NULLIF(%s.business_role, '') IS NOT NULL THEN %s.business_role
		WHEN %s.is_platform_admin THEN 'system_admin'
		WHEN COALESCE(%s.access_level, '') = 'admin' THEN 'owner'
		WHEN COALESCE(%s.access_level, '') = 'consultant' THEN 'consultant'
		WHEN COALESCE(%s.access_level, '') = 'manager' THEN 'general_manager'
		WHEN COALESCE(%s.access_level, '') = 'finance' THEN 'finance'
		WHEN COALESCE(%s.access_level, '') = 'viewer' THEN 'viewer'
		ELSE 'marketing'
	END`, scopeAlias, scopeAlias, userAlias, scopeAlias, scopeAlias, scopeAlias, scopeAlias, scopeAlias)
}

func effectiveAdminMembershipOrderSQL(scopeAlias string) string {
	return fmt.Sprintf(`CASE
		WHEN %s.is_owner
			OR COALESCE(%s.business_role, '') IN ('owner', 'system_admin')
			OR COALESCE(%s.access_level, '') = 'admin'
			OR COALESCE(%s.user_type, '') = 'admin'
		THEN 0
		ELSE 1
	END`, scopeAlias, scopeAlias, scopeAlias, scopeAlias)
}

func isUniqueConstraintError(err error, constraintName string) bool {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23505" {
		return false
	}

	if strings.TrimSpace(constraintName) == "" {
		return true
	}

	return pgErr.ConstraintName == constraintName
}

func isUsersEmailConflictError(err error) bool {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23505" {
		return false
	}

	if isUniqueConstraintError(err, "users_email_key") {
		return true
	}

	message := strings.ToLower(strings.TrimSpace(pgErr.Message))
	detail := strings.ToLower(strings.TrimSpace(pgErr.Detail))
	tableName := strings.ToLower(strings.TrimSpace(pgErr.TableName))
	columnName := strings.ToLower(strings.TrimSpace(pgErr.ColumnName))

	return strings.Contains(message, "users_email_key") ||
		strings.Contains(detail, "users_email_key") ||
		(tableName == "users" && columnName == "email") ||
		(tableName == "users" && strings.Contains(detail, "(email)="))
}

func normalizeOwnProfileUpdateError(field string, err error) error {
	if err == nil {
		return nil
	}

	if strings.TrimSpace(field) == "email" && isUsersEmailConflictError(err) {
		return ErrEmailAlreadyInUse
	}

	return fmt.Errorf("update own profile field: %w", err)
}

func normalizeBusinessRole(raw string) string {
	switch strings.TrimSpace(strings.ToLower(raw)) {
	case "consultant":
		return "consultant"
	case "store_manager":
		return "store_manager"
	case "marketing":
		return "marketing"
	case "finance":
		return "finance"
	case "general_manager":
		return "general_manager"
	case "owner":
		return "owner"
	case "viewer":
		return "viewer"
	case "system_admin":
		return "system_admin"
	default:
		return ""
	}
}

func resolveDefaultBusinessRole(level, userType string, isPlatformAdmin, isOwner bool) string {
	if isPlatformAdmin {
		return "system_admin"
	}

	if isOwner || (normalizeAccessLevel(level) == "admin" && normalizeUserType(userType) == "admin") {
		return "owner"
	}

	switch normalizeAccessLevel(level) {
	case "consultant":
		return "consultant"
	case "manager":
		return "general_manager"
	case "finance":
		return "finance"
	case "viewer":
		return "viewer"
	default:
		return "marketing"
	}
}

func resolveAdminUserBusinessRole(raw, level, userType string, isPlatformAdmin, isOwner bool) string {
	if isPlatformAdmin {
		return "system_admin"
	}

	role := normalizeBusinessRole(raw)
	if role == "" || role == "system_admin" {
		return resolveDefaultBusinessRole(level, userType, false, isOwner)
	}

	return role
}

func resolveAccessLevelForBusinessRole(role, fallbackLevel string, isPlatformAdmin bool) string {
	if isPlatformAdmin {
		return "admin"
	}

	switch normalizeBusinessRole(role) {
	case "consultant":
		return "consultant"
	case "store_manager", "general_manager":
		return "manager"
	case "finance":
		return "finance"
	case "viewer":
		return "viewer"
	case "owner", "system_admin":
		return "admin"
	case "marketing":
		return "marketing"
	default:
		return normalizeAccessLevel(fallbackLevel)
	}
}

func isStoreScopedBusinessRole(role string) bool {
	switch normalizeBusinessRole(role) {
	case "consultant", "store_manager":
		return true
	default:
		return false
	}
}

func requiresRegistrationBusinessRole(role string) bool {
	switch normalizeBusinessRole(role) {
	case "consultant", "store_manager", "general_manager":
		return true
	default:
		return false
	}
}

func normalizeOptionalStoreID(value any) string {
	raw := strings.TrimSpace(stringValue(value))
	switch strings.ToLower(raw) {
	case "", "0", "all", "todas":
		return ""
	default:
		return raw
	}
}

func normalizeRegistrationNumber(value any) string {
	return trimText(value, 60)
}

func stringPtr(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func stringFromPtr(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func validateAdminUserDirectoryRequirements(state adminUserDirectoryState, rules tenantUserDirectoryRules) error {
	if isStoreScopedBusinessRole(state.BusinessRole) && rules.RequireStoreLink && rules.StoreCount > 1 && strings.TrimSpace(state.StoreID) == "" {
		return ErrInvalidInput
	}

	if requiresRegistrationBusinessRole(state.BusinessRole) && rules.RequireRegistration && strings.TrimSpace(state.RegistrationNumber) == "" {
		return ErrInvalidInput
	}

	return nil
}

func resolveAdminUserRoleCodes(level string, isPlatformAdmin bool) []string {
	if isPlatformAdmin {
		return []string{"platform_root"}
	}

	switch normalizeAccessLevel(level) {
	case "admin":
		return []string{"tenant_admin"}
	case "manager":
		return []string{"module_manager"}
	default:
		return nil
	}
}

func adminUserModuleScopeJoinClause() string {
	return `
LEFT JOIN LATERAL (
	WITH tenant_effective_modules AS (
		SELECT module_state.code
		FROM (
			SELECT
				m.code,
				CASE
					WHEN tm.status IS NOT NULL THEN tm.status::text
					WHEN inherited_module.is_active THEN 'active'
					ELSE 'inactive'
				END AS status,
				CASE WHEN tm.status IS NOT NULL THEN 0 ELSE 1 END AS source_priority,
				m.is_core
			FROM modules m
			LEFT JOIN tenant_modules tm
			  ON tm.module_id = m.id
			 AND tm.tenant_id = scope.tenant_id
			LEFT JOIN LATERAL (
				SELECT true AS is_active
				FROM tenant_subscriptions ts
				JOIN plan_modules pm
				  ON pm.plan_id = ts.plan_id
				 AND pm.enabled = true
				WHERE ts.tenant_id = scope.tenant_id
				  AND ts.status IN ('trialing', 'active')
				  AND pm.module_id = m.id
				LIMIT 1
			) inherited_module ON true
			WHERE m.is_active = true
		) module_state
		WHERE module_state.status = 'active'
	),
	effective_user_modules AS (
		SELECT tenant_effective_modules.code
		FROM tenant_effective_modules
		WHERE scope.id IS NOT NULL
		  AND (
			scope.is_owner
				OR COALESCE(scope.business_role, '') IN ('owner', 'system_admin')
			OR COALESCE(scope.access_level, '') = 'admin'
			OR COALESCE(scope.user_type, '') = 'admin'
		  )
		UNION
		SELECT tenant_effective_modules.code
		FROM tenant_user_modules tum
		JOIN modules m ON m.id = tum.module_id
		JOIN tenant_effective_modules ON tenant_effective_modules.code = m.code
		WHERE tum.tenant_user_id = scope.id
		  AND tum.status = 'active'
	)
	SELECT
		COALESCE(json_agg(mod.code ORDER BY mod.code), '[]'::json) AS module_codes,
		COALESCE(bool_or(mod.code = 'fila-atendimento'), false) AS atendimento_access
	FROM (
		SELECT DISTINCT code
		FROM effective_user_modules
	) mod
) module_scope ON true
`
}

func (s *Service) resolveRootTenantID(ctx context.Context) (string, error) {
	var tenantID string
	err := s.pool.QueryRow(
		ctx,
		`SELECT id
		 FROM tenants
		 WHERE slug = 'root'
		   AND deleted_at IS NULL
		 LIMIT 1`,
	).Scan(&tenantID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrNotFound
		}
		return "", fmt.Errorf("resolve root tenant: %w", err)
	}

	return tenantID, nil
}

func (s *Service) syncManagedTenantUserRoles(
	ctx context.Context,
	tx pgx.Tx,
	tenantID, tenantUserID, actorUserID, level string,
	isPlatformAdmin bool,
) error {
	desiredRoleCodes := resolveAdminUserRoleCodes(level, isPlatformAdmin)
	desired := make(map[string]struct{}, len(desiredRoleCodes))
	for _, roleCode := range desiredRoleCodes {
		desired[roleCode] = struct{}{}
	}

	rows, err := tx.Query(
		ctx,
		`SELECT tur.role_id, r.code
		 FROM tenant_user_roles tur
		 JOIN roles r ON r.id = tur.role_id
		 WHERE tur.tenant_user_id = $1
		   AND r.code = ANY($2)`,
		tenantUserID,
		managedAdminRoleCodes,
	)
	if err != nil {
		return fmt.Errorf("load managed tenant user roles: %w", err)
	}
	defer rows.Close()

	roleIDsToDelete := make([]string, 0)
	for rows.Next() {
		var roleID string
		var roleCode string
		if scanErr := rows.Scan(&roleID, &roleCode); scanErr != nil {
			return fmt.Errorf("scan managed tenant user role: %w", scanErr)
		}

		if _, keep := desired[roleCode]; keep {
			delete(desired, roleCode)
			continue
		}

		roleIDsToDelete = append(roleIDsToDelete, roleID)
	}
	if rows.Err() != nil {
		return fmt.Errorf("iterate managed tenant user roles: %w", rows.Err())
	}

	if len(roleIDsToDelete) > 0 {
		if _, err := tx.Exec(
			ctx,
			`DELETE FROM tenant_user_roles
			 WHERE tenant_user_id = $1
			   AND role_id = ANY($2)`,
			tenantUserID,
			roleIDsToDelete,
		); err != nil {
			return fmt.Errorf("delete stale managed tenant user roles: %w", err)
		}
	}

	if len(desired) < 1 {
		return nil
	}

	missingRoleCodes := make([]string, 0, len(desired))
	for roleCode := range desired {
		missingRoleCodes = append(missingRoleCodes, roleCode)
	}

	if err := assignRoles(ctx, tx, tenantID, tenantUserID, actorUserID, missingRoleCodes); err != nil {
		return fmt.Errorf("sync managed tenant user roles: %w", err)
	}

	return nil
}

func (s *Service) grantPlatformAdminModules(
	ctx context.Context,
	tx pgx.Tx,
	tenantID, tenantUserID, actorUserID string,
) error {
	if _, err := tx.Exec(
		ctx,
		`INSERT INTO tenant_user_modules (
			tenant_id,
			tenant_user_id,
			module_id,
			status,
			granted_by_user_id,
			granted_at,
			metadata
		)
		SELECT
			$1,
			$2,
			tm.module_id,
			'active',
			$3,
			now(),
			'{}'::jsonb
		FROM tenant_modules tm
		WHERE tm.tenant_id = $1
		  AND tm.status = 'active'
		ON CONFLICT (tenant_user_id, module_id)
		DO UPDATE SET
			status = 'active',
			revoked_at = NULL,
			granted_at = now(),
			granted_by_user_id = EXCLUDED.granted_by_user_id,
			updated_at = now()`,
		tenantID,
		tenantUserID,
		nullableString(strings.TrimSpace(actorUserID)),
	); err != nil {
		return fmt.Errorf("grant platform admin modules: %w", err)
	}

	return nil
}

func (s *Service) resolveTenantUserDirectoryRules(ctx context.Context, tenantID string) (tenantUserDirectoryRules, error) {
	rules := tenantUserDirectoryRules{}
	if strings.TrimSpace(tenantID) == "" {
		return rules, ErrInvalidInput
	}

	err := s.pool.QueryRow(
		ctx,
		`SELECT
			COALESCE(t.require_user_store_link, true),
			COALESCE(t.require_user_registration, true),
			COALESCE((
				SELECT COUNT(*)
				FROM tenant_stores ts
				WHERE ts.tenant_id = t.id
				  AND ts.is_active = true
			), 0)
		 FROM tenants t
		 WHERE t.id = $1
		   AND t.deleted_at IS NULL
		 LIMIT 1`,
		tenantID,
	).Scan(&rules.RequireStoreLink, &rules.RequireRegistration, &rules.StoreCount)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return tenantUserDirectoryRules{}, ErrNotFound
		}
		return tenantUserDirectoryRules{}, fmt.Errorf("resolve tenant user directory rules: %w", err)
	}

	return rules, nil
}

func (s *Service) sanitizeAdminUserDirectoryState(
	ctx context.Context,
	tenantID string,
	state adminUserDirectoryState,
) (adminUserDirectoryState, error) {
	state.BusinessRole = normalizeBusinessRole(state.BusinessRole)
	if state.BusinessRole == "" {
		return adminUserDirectoryState{}, ErrInvalidInput
	}
	state.StoreID = normalizeOptionalStoreID(state.StoreID)
	state.RegistrationNumber = normalizeRegistrationNumber(state.RegistrationNumber)

	if strings.TrimSpace(tenantID) == "" || !isStoreScopedBusinessRole(state.BusinessRole) {
		state.StoreID = ""
		return state, nil
	}

	if state.StoreID == "" {
		return state, nil
	}

	var normalizedStoreID string
	err := s.pool.QueryRow(
		ctx,
		`SELECT id::text
		 FROM tenant_stores
		 WHERE tenant_id = $1
		   AND id = $2
		   AND is_active = true
		 LIMIT 1`,
		tenantID,
		state.StoreID,
	).Scan(&normalizedStoreID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return adminUserDirectoryState{}, ErrInvalidInput
		}
		return adminUserDirectoryState{}, fmt.Errorf("validate tenant user store link: %w", err)
	}

	state.StoreID = normalizedStoreID
	return state, nil
}

func (s *Service) enforceAdminUserDirectoryRequirements(
	ctx context.Context,
	tenantID string,
	state adminUserDirectoryState,
) error {
	if strings.TrimSpace(tenantID) == "" {
		return nil
	}

	rules, err := s.resolveTenantUserDirectoryRules(ctx, tenantID)
	if err != nil {
		return err
	}

	return validateAdminUserDirectoryRequirements(state, rules)
}

func (s *Service) canActivateManagedAdminUserRecord(ctx context.Context, current AdminUser, scopeTenantID string) (bool, error) {
	if !canActivateManagedAdminUser(current, scopeTenantID) {
		return false, nil
	}

	state, err := s.sanitizeAdminUserDirectoryState(ctx, scopeTenantID, adminUserDirectoryState{
		BusinessRole:       resolveAdminUserBusinessRole(current.BusinessRole, current.Level, current.UserType, current.IsPlatformAdmin, false),
		StoreID:            stringFromPtr(current.StoreID),
		RegistrationNumber: current.RegistrationNumber,
	})
	if err != nil {
		if errors.Is(err, ErrInvalidInput) {
			return false, nil
		}
		return false, err
	}

	if err := s.enforceAdminUserDirectoryRequirements(ctx, scopeTenantID, state); err != nil {
		if errors.Is(err, ErrInvalidInput) {
			return false, nil
		}
		return false, err
	}

	return true, nil
}

func (s *Service) ListAdminClients(ctx context.Context, input ListAdminClientsInput) ([]AdminClient, int, error) {
	page, limit := normalizePageAndLimit(input.Page, input.Limit, adminDefaultPageLimit, adminMaxPageLimit)
	offset := (page - 1) * limit

	if !input.IsPlatformAdmin && strings.TrimSpace(input.TenantID) == "" {
		return []AdminClient{}, 0, nil
	}

	args := make([]any, 0, 8)
	arg := func(value any) string {
		args = append(args, value)
		return fmt.Sprintf("$%d", len(args))
	}

	conditions := []string{"t.deleted_at IS NULL"}
	if !input.IsPlatformAdmin {
		conditions = append(conditions, fmt.Sprintf("t.id = %s", arg(strings.TrimSpace(input.TenantID))))
	}

	queryText := strings.TrimSpace(strings.ToLower(input.Query))
	if queryText != "" {
		like := "%" + queryText + "%"
		placeholder := arg(like)
		conditions = append(conditions, fmt.Sprintf(`(
			LOWER(t.name) LIKE %s
			OR LOWER(t.slug) LIKE %s
			OR LOWER(COALESCE(t.contact_email, '')) LIKE %s
			OR LOWER(COALESCE(t.contact_phone, '')) LIKE %s
			OR LOWER(COALESCE(t.contact_site, '')) LIKE %s
		)`, placeholder, placeholder, placeholder, placeholder, placeholder))
	}

	switch normalizeClientFilterStatus(input.Status) {
	case "active":
		conditions = append(conditions, "t.status IN ('active', 'trialing')")
	case "inactive":
		conditions = append(conditions, "t.status IN ('suspended', 'cancelled')")
	}

	limitPlaceholder := arg(limit)
	offsetPlaceholder := arg(offset)

	query := fmt.Sprintf(`
SELECT
	t.legacy_id,
	t.id,
	t.name,
	t.status::text,
	COALESCE(t.user_count, 0),
	COALESCE(array_to_string(t.user_nicks, ', '), ''),
	COALESCE(t.project_count, 0),
	COALESCE(array_to_string(t.project_segments, ', '), ''),
	COALESCE(NULLIF(t.billing_mode, ''), 'single'),
	CASE
		WHEN COALESCE(NULLIF(t.billing_mode, ''), 'single') = 'per_store' THEN COALESCE((
			SELECT SUM(sc.amount)::float8
			FROM tenant_store_charges sc
			JOIN tenant_stores ts ON ts.id = sc.store_id
			WHERE sc.tenant_id = t.id
			  AND ts.is_active = true
		), 0)
		ELSE COALESCE(t.monthly_payment_amount, 0)::float8
	END,
	t.billing_day,
	COALESCE(t.logo_url, ''),
	COALESCE(t.webhook_enabled, false),
	COALESCE(t.webhook_key, ''),
	COALESCE(t.contact_phone, ''),
	COALESCE(t.contact_site, ''),
	COALESCE(t.contact_address, ''),
	COALESCE(t.require_user_store_link, true),
	COALESCE(t.require_user_registration, true),
	COALESCE((
		SELECT json_agg(
			json_build_object(
				'id', ts.id::text,
				'name', ts.name,
				'amount', COALESCE(sc.amount, 0)::float8
			)
			ORDER BY ts.sort_order ASC, ts.created_at ASC
		)
		FROM tenant_stores ts
		LEFT JOIN tenant_store_charges sc ON sc.store_id = ts.id
		WHERE ts.tenant_id = t.id
		  AND ts.is_active = true
	), '[]'::json),
	COALESCE((
		WITH module_scope AS (
			SELECT
				m.code,
				m.name,
				tm.status::text AS status,
				0 AS source_priority,
				m.is_core
			FROM tenant_modules tm
			JOIN modules m ON m.id = tm.module_id
			WHERE tm.tenant_id = t.id

			UNION ALL

			SELECT
				m.code,
				m.name,
				'active'::text AS status,
				1 AS source_priority,
				m.is_core
			FROM tenant_subscriptions ts
			JOIN plan_modules pm
			  ON pm.plan_id = ts.plan_id
			 AND pm.enabled = true
			JOIN modules m ON m.id = pm.module_id
			WHERE ts.tenant_id = t.id
			  AND ts.status IN ('trialing', 'active')
			  AND m.is_active = true
		),
		module_dedupe AS (
			SELECT DISTINCT ON (code)
				code,
				name,
				status,
				source_priority,
				is_core
			FROM module_scope
			ORDER BY code ASC, source_priority ASC
		)
		SELECT json_agg(
			json_build_object(
				'code', md.code,
				'name', md.name,
				'status', md.status
			)
			ORDER BY md.source_priority ASC, md.is_core DESC, md.code ASC
		)
		FROM module_dedupe md
		WHERE md.status = 'active'
	), '[]'::json),
	COUNT(*) OVER()
FROM tenants t
WHERE %s
ORDER BY t.created_at DESC
LIMIT %s OFFSET %s
`, strings.Join(conditions, " AND "), limitPlaceholder, offsetPlaceholder)

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list admin clients: %w", err)
	}
	defer rows.Close()

	items := make([]AdminClient, 0)
	total := 0

	for rows.Next() {
		var (
			item        AdminClient
			billingDay  *int16
			storesJSON  []byte
			modulesJSON []byte
			rowCount    int
		)
		if err := rows.Scan(
			&item.ID,
			&item.CoreTenantID,
			&item.Name,
			&item.Status,
			&item.UserCount,
			&item.UserNicks,
			&item.ProjectCount,
			&item.ProjectSegments,
			&item.BillingMode,
			&item.MonthlyPaymentAmount,
			&billingDay,
			&item.Logo,
			&item.WebhookEnabled,
			&item.WebhookKey,
			&item.ContactPhone,
			&item.ContactSite,
			&item.ContactAddress,
			&item.RequireUserStoreLink,
			&item.RequireUserRegistration,
			&storesJSON,
			&modulesJSON,
			&rowCount,
		); err != nil {
			return nil, 0, fmt.Errorf("scan admin client row: %w", err)
		}

		item.Status = normalizeClientRecordStatus(item.Status)
		item.PaymentDueDay = formatBillingDay(billingDay)
		item.BillingMode = normalizeBillingModeValue(item.BillingMode)
		if err := json.Unmarshal(storesJSON, &item.Stores); err != nil {
			item.Stores = []AdminClientStore{}
		}
		if err := json.Unmarshal(modulesJSON, &item.Modules); err != nil {
			item.Modules = []AdminClientModule{}
		}
		item.StoresCount = len(item.Stores)
		total = rowCount
		items = append(items, item)
	}

	if rows.Err() != nil {
		return nil, 0, fmt.Errorf("iterate admin clients rows: %w", rows.Err())
	}

	return items, total, nil
}

func (s *Service) GetAdminClient(ctx context.Context, input GetAdminClientInput) (AdminClient, error) {
	if strings.TrimSpace(input.CoreTenantID) == "" {
		return AdminClient{}, ErrInvalidInput
	}

	item, tenantID, err := s.getAdminClientByCoreTenantID(ctx, input.CoreTenantID)
	if err != nil {
		return AdminClient{}, err
	}

	if !input.IsPlatformAdmin {
		if strings.TrimSpace(input.TenantID) == "" {
			return AdminClient{}, ErrForbidden
		}
		if strings.TrimSpace(input.TenantID) != strings.TrimSpace(tenantID) {
			return AdminClient{}, ErrForbidden
		}
	}

	return item, nil
}

func (s *Service) CreateAdminClient(ctx context.Context, input CreateAdminClientInput) (AdminClient, error) {
	if !input.IsPlatformAdmin {
		return AdminClient{}, ErrForbidden
	}

	name := strings.TrimSpace(input.Name)
	if name == "" {
		return AdminClient{}, ErrInvalidInput
	}

	slug, err := s.generateUniqueTenantSlug(ctx, name)
	if err != nil {
		return AdminClient{}, err
	}

	status := mapClientStatusToTenantStatus(input.Status)
	if status == "" {
		status = "active"
	}

	adminName := strings.TrimSpace(input.AdminName)
	if adminName == "" {
		adminName = fmt.Sprintf("Admin %s", name)
	}

	adminEmail := strings.TrimSpace(strings.ToLower(input.AdminEmail))
	if adminEmail == "" {
		adminEmail = fmt.Sprintf("admin@%s.local", slug)
	}

	adminPassword := strings.TrimSpace(input.AdminPassword)
	if adminPassword == "" {
		adminPassword = "123456"
	}
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(adminPassword), bcrypt.DefaultCost)
	if err != nil {
		return AdminClient{}, fmt.Errorf("hash bootstrap admin password: %w", err)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return AdminClient{}, fmt.Errorf("begin create admin client tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var (
		tenantID              string
		legacyID              int
		bootstrapUserID       string
		bootstrapTenantUserID string
	)

	err = tx.QueryRow(
		ctx,
		`INSERT INTO tenants (
			slug,
			name,
			status,
			billing_mode,
			monthly_payment_amount,
			webhook_enabled,
			webhook_key,
			user_count,
			project_count,
			user_nicks,
			project_segments
		)
		VALUES (
			$1,
			$2,
			$3::tenant_status,
			'single',
			0,
			false,
			'',
			10,
			0,
			'{}'::text[],
			'{}'::text[]
		)
		RETURNING id, legacy_id`,
		slug,
		name,
		status,
	).Scan(&tenantID, &legacyID)
	if err != nil {
		return AdminClient{}, fmt.Errorf("create admin client tenant: %w", err)
	}

	if _, err := tx.Exec(
		ctx,
		`INSERT INTO tenant_modules (tenant_id, module_id, status, source, activated_at, deactivated_at, metadata)
		 SELECT $1, m.id, 'active', 'custom', now(), NULL, '{}'::jsonb
		 FROM modules m
		 WHERE m.is_active = true
		   AND m.code IN ('core_panel', 'atendimento')
		 ON CONFLICT (tenant_id, module_id)
		 DO UPDATE SET
		   status = 'active',
		   source = EXCLUDED.source,
		   activated_at = now(),
		   deactivated_at = NULL,
		   updated_at = now()`,
		tenantID,
	); err != nil {
		return AdminClient{}, fmt.Errorf("bootstrap tenant modules: %w", err)
	}

	if _, err := tx.Exec(
		ctx,
		`INSERT INTO tenant_module_limits (
			tenant_id,
			module_id,
			limit_key,
			limit_value_int,
			is_unlimited,
			source,
			notes,
			created_by_user_id,
			metadata
		)
		SELECT
			$1,
			m.id,
			limit_config.limit_key,
			limit_config.limit_value_int,
			false,
			'bootstrap',
			limit_config.notes,
			$2,
			'{}'::jsonb
		FROM modules m
		JOIN (
			VALUES
				('core_panel', 'users', 10, 'Default users limit for new client in core panel'),
				('atendimento', 'users', 3, 'Default atendimento users limit for new client'),
				('atendimento', 'instances', 1, 'Default atendimento instance limit for new client')
		) AS limit_config(module_code, limit_key, limit_value_int, notes)
		  ON limit_config.module_code = m.code
		WHERE m.is_active = true
		  AND m.code IN ('core_panel', 'atendimento')
		ON CONFLICT (tenant_id, module_id, limit_key)
		DO UPDATE SET
			limit_value_int = EXCLUDED.limit_value_int,
			is_unlimited = EXCLUDED.is_unlimited,
			source = EXCLUDED.source,
			notes = EXCLUDED.notes,
			created_by_user_id = EXCLUDED.created_by_user_id,
			updated_at = now()`,
		tenantID,
		nullableString(strings.TrimSpace(input.UserID)),
	); err != nil {
		return AdminClient{}, fmt.Errorf("bootstrap tenant module users limit: %w", err)
	}

	if err := tx.QueryRow(
		ctx,
		`INSERT INTO users (
			name,
			display_name,
			nick,
			email,
			password_hash,
			status,
			is_platform_admin,
			email_verified_at,
			preferences,
			metadata
		)
		VALUES (
			$1,
			$1,
			'Admin',
			$2,
			$3,
			'active',
			false,
			now(),
			'{}'::jsonb,
			'{}'::jsonb
		)
		RETURNING id`,
		adminName,
		adminEmail,
		string(passwordHash),
	).Scan(&bootstrapUserID); err != nil {
		return AdminClient{}, fmt.Errorf("create bootstrap admin user: %w", err)
	}

	if err := tx.QueryRow(
		ctx,
		`INSERT INTO tenant_users (
			tenant_id,
			user_id,
			status,
			is_owner,
			joined_at,
			access_level,
			user_type,
			business_role,
			metadata
		)
		VALUES (
			$1,
			$2,
			'active',
			true,
			now(),
			'admin',
			'admin',
			'owner',
			'{}'::jsonb
		)
		ON CONFLICT (tenant_id, user_id)
		DO UPDATE SET
			status = 'active',
			is_owner = true,
			joined_at = COALESCE(tenant_users.joined_at, now()),
			access_level = 'admin',
			user_type = 'admin',
			business_role = 'owner',
			updated_at = now()
		RETURNING id`,
		tenantID,
		bootstrapUserID,
	).Scan(&bootstrapTenantUserID); err != nil {
		return AdminClient{}, fmt.Errorf("create bootstrap tenant user: %w", err)
	}

	if _, err := tx.Exec(
		ctx,
		`INSERT INTO tenant_user_modules (
			tenant_id,
			tenant_user_id,
			module_id,
			status,
			granted_by_user_id,
			granted_at,
			metadata
		)
		SELECT
			$1,
			$2,
			m.id,
			'active',
			$3,
			now(),
			'{}'::jsonb
		FROM modules m
		WHERE m.code IN ('core_panel', 'atendimento')
		ON CONFLICT (tenant_user_id, module_id)
		DO UPDATE SET
			status = 'active',
			revoked_at = NULL,
			granted_at = now(),
			granted_by_user_id = EXCLUDED.granted_by_user_id,
			updated_at = now()`,
		tenantID,
		bootstrapTenantUserID,
		nullableString(strings.TrimSpace(input.UserID)),
	); err != nil {
		return AdminClient{}, fmt.Errorf("assign bootstrap admin user module: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return AdminClient{}, fmt.Errorf("commit create admin client tx: %w", err)
	}

	item, _, err := s.getAdminClientByCoreTenantID(ctx, tenantID)
	if err != nil {
		return AdminClient{}, err
	}

	_ = s.insertAudit(ctx, auditInput{
		TenantID:   item.CoreTenantID,
		UserID:     input.UserID,
		Action:     "admin.client.created",
		EntityType: "tenant",
		EntityID:   item.CoreTenantID,
		AfterData:  item,
		Metadata: map[string]any{
			"bootstrapAdminEmail":              adminEmail,
			"defaultCorePanelUsersLimit":       10,
			"defaultAtendimentoUsersLimit":     3,
			"defaultAtendimentoInstancesLimit": 1,
		},
	})

	return item, nil
}

func (s *Service) UpdateAdminClientField(ctx context.Context, input UpdateAdminClientFieldInput) (AdminClient, error) {
	item, tenantID, err := s.getAdminClientByCoreTenantID(ctx, input.CoreTenantID)
	if err != nil {
		return AdminClient{}, err
	}

	if !input.IsPlatformAdmin && strings.TrimSpace(input.TenantID) != tenantID {
		return AdminClient{}, ErrForbidden
	}

	field := strings.TrimSpace(input.Field)
	switch field {
	case "name":
		value := strings.TrimSpace(stringValue(input.Value))
		if value == "" {
			return AdminClient{}, ErrInvalidInput
		}
		_, err = s.pool.Exec(ctx, `UPDATE tenants SET name = $2, updated_at = now() WHERE id = $1`, tenantID, value)
	case "status":
		status := mapClientStatusToTenantStatus(stringValue(input.Value))
		if status == "" {
			return AdminClient{}, ErrInvalidInput
		}
		_, err = s.pool.Exec(ctx, `UPDATE tenants SET status = $2::tenant_status, updated_at = now() WHERE id = $1`, tenantID, status)
	case "billingMode":
		mode := normalizeBillingModeValue(stringValue(input.Value))
		if mode == "per_store" {
			_, err = s.pool.Exec(
				ctx,
				`UPDATE tenants
				 SET billing_mode = $2,
				     monthly_payment_amount = COALESCE((
				       SELECT SUM(sc.amount)::float8
				       FROM tenant_store_charges sc
				       JOIN tenant_stores ts ON ts.id = sc.store_id
				       WHERE sc.tenant_id = $1
				         AND ts.is_active = true
				     ), 0),
				     updated_at = now()
				 WHERE id = $1`,
				tenantID,
				mode,
			)
		} else {
			_, err = s.pool.Exec(ctx, `UPDATE tenants SET billing_mode = $2, updated_at = now() WHERE id = $1`, tenantID, mode)
		}
	case "monthlyPaymentAmount":
		amount := numericValue(input.Value)
		if amount < 0 {
			amount = 0
		}
		_, err = s.pool.Exec(
			ctx,
			`UPDATE tenants
			 SET monthly_payment_amount = CASE
			       WHEN billing_mode = 'per_store' THEN COALESCE((
			         SELECT SUM(sc.amount)::float8
			         FROM tenant_store_charges sc
			         JOIN tenant_stores ts ON ts.id = sc.store_id
			         WHERE sc.tenant_id = $1
			           AND ts.is_active = true
			       ), 0)
			       ELSE $2
			     END,
			     updated_at = now()
			 WHERE id = $1`,
			tenantID,
			amount,
		)
	case "paymentDueDay":
		day := normalizeBillingDay(input.Value)
		if day == 0 {
			_, err = s.pool.Exec(ctx, `UPDATE tenants SET billing_day = NULL, updated_at = now() WHERE id = $1`, tenantID)
		} else {
			_, err = s.pool.Exec(ctx, `UPDATE tenants SET billing_day = $2, updated_at = now() WHERE id = $1`, tenantID, day)
		}
	case "userCount":
		count := intValue(input.Value)
		if count < 0 {
			count = 0
		}
		_, err = s.pool.Exec(ctx, `UPDATE tenants SET user_count = $2, updated_at = now() WHERE id = $1`, tenantID, count)
	case "userNicks":
		values := normalizeListValues(input.Value)
		_, err = s.pool.Exec(ctx, `UPDATE tenants SET user_nicks = $2, updated_at = now() WHERE id = $1`, tenantID, values)
	case "projectCount":
		count := intValue(input.Value)
		if count < 0 {
			count = 0
		}
		_, err = s.pool.Exec(ctx, `UPDATE tenants SET project_count = $2, updated_at = now() WHERE id = $1`, tenantID, count)
	case "projectSegments":
		values := normalizeListValues(input.Value)
		_, err = s.pool.Exec(ctx, `UPDATE tenants SET project_segments = $2, updated_at = now() WHERE id = $1`, tenantID, values)
	case "logo":
		_, err = s.pool.Exec(ctx, `UPDATE tenants SET logo_url = $2, updated_at = now() WHERE id = $1`, tenantID, trimText(input.Value, 500))
	case "webhookEnabled":
		_, err = s.pool.Exec(ctx, `UPDATE tenants SET webhook_enabled = $2, updated_at = now() WHERE id = $1`, tenantID, boolValue(input.Value))
	case "contactPhone":
		_, err = s.pool.Exec(ctx, `UPDATE tenants SET contact_phone = $2, updated_at = now() WHERE id = $1`, tenantID, trimText(input.Value, 30))
	case "contactSite":
		_, err = s.pool.Exec(ctx, `UPDATE tenants SET contact_site = $2, updated_at = now() WHERE id = $1`, tenantID, normalizeSiteValue(input.Value))
	case "contactAddress":
		_, err = s.pool.Exec(ctx, `UPDATE tenants SET contact_address = $2, updated_at = now() WHERE id = $1`, tenantID, trimText(input.Value, 255))
	case "requireUserStoreLink":
		_, err = s.pool.Exec(ctx, `UPDATE tenants SET require_user_store_link = $2, updated_at = now() WHERE id = $1`, tenantID, boolValue(input.Value))
	case "requireUserRegistration":
		_, err = s.pool.Exec(ctx, `UPDATE tenants SET require_user_registration = $2, updated_at = now() WHERE id = $1`, tenantID, boolValue(input.Value))
	case "modules":
		moduleCodes := normalizeModuleCodesInput(input.Value)
		err = s.replaceTenantModuleSet(ctx, tenantID, moduleCodes)
	default:
		return AdminClient{}, ErrInvalidInput
	}
	if err != nil {
		return AdminClient{}, fmt.Errorf("update admin client field: %w", err)
	}

	updated, _, err := s.getAdminClientByCoreTenantID(ctx, tenantID)
	if err != nil {
		return AdminClient{}, err
	}

	_ = s.insertAudit(ctx, auditInput{
		TenantID:   tenantID,
		UserID:     input.UserID,
		Action:     "admin.client.updated",
		EntityType: "tenant",
		EntityID:   tenantID,
		BeforeData: item,
		AfterData:  updated,
		Metadata: map[string]any{
			"field": field,
		},
	})

	return updated, nil
}

func (s *Service) ReplaceAdminClientStores(ctx context.Context, input ReplaceAdminClientStoresInput) (AdminClient, error) {
	_, tenantID, err := s.getAdminClientByCoreTenantID(ctx, input.CoreTenantID)
	if err != nil {
		return AdminClient{}, err
	}

	if !input.IsPlatformAdmin && strings.TrimSpace(input.TenantID) != tenantID {
		return AdminClient{}, ErrForbidden
	}

	stores := normalizeStoreInputs(input.Stores)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return AdminClient{}, fmt.Errorf("begin stores tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	type existingStoreRecord struct {
		ID   string
		Name string
		Code string
	}

	existingStoresRows, err := tx.Query(ctx, `
		SELECT id::text, name, code
		FROM tenant_stores
		WHERE tenant_id = $1
	`, tenantID)
	if err != nil {
		return AdminClient{}, fmt.Errorf("list tenant stores: %w", err)
	}

	existingStoresByID := make(map[string]existingStoreRecord)
	existingStoresByName := make(map[string]existingStoreRecord)
	usedCodes := make(map[string]bool)
	for existingStoresRows.Next() {
		var record existingStoreRecord
		if err := existingStoresRows.Scan(&record.ID, &record.Name, &record.Code); err != nil {
			existingStoresRows.Close()
			return AdminClient{}, fmt.Errorf("scan tenant store: %w", err)
		}
		record.ID = strings.TrimSpace(record.ID)
		record.Name = strings.TrimSpace(record.Name)
		record.Code = normalizeAdminStoreCode(record.Code)
		existingStoresByID[record.ID] = record
		if record.Name != "" {
			existingStoresByName[strings.ToLower(record.Name)] = record
		}
		if record.Code != "" {
			usedCodes[record.Code] = true
		}
	}
	if err := existingStoresRows.Err(); err != nil {
		existingStoresRows.Close()
		return AdminClient{}, fmt.Errorf("iterate tenant stores: %w", err)
	}
	existingStoresRows.Close()

	totalAmount := 0.0
	desiredStoreIDs := make([]string, 0, len(stores))

	for index, store := range stores {
		totalAmount += store.Amount

		resolvedStoreID := strings.TrimSpace(store.ID)
		existingRecord, hasExisting := existingStoresByID[resolvedStoreID]
		if !hasExisting && resolvedStoreID == "" {
			existingRecord, hasExisting = existingStoresByName[strings.ToLower(strings.TrimSpace(store.Name))]
		}
		if !hasExisting && resolvedStoreID != "" {
			return AdminClient{}, ErrInvalidInput
		}

		storeCode := ""
		if hasExisting {
			resolvedStoreID = existingRecord.ID
			storeCode = normalizeAdminStoreCode(existingRecord.Code)
		}
		if storeCode == "" {
			storeCode = buildAdminStoreCode(store.Name, usedCodes)
		}
		usedCodes[storeCode] = true

		if err := tx.QueryRow(
			ctx,
			`INSERT INTO tenant_stores (id, tenant_id, code, name, city, is_active, sort_order, metadata)
			 VALUES (COALESCE(NULLIF($1, '')::uuid, gen_random_uuid()), $2, $3, $4, '', true, $5, '{}'::jsonb)
			 ON CONFLICT (id) DO UPDATE
			 SET code = EXCLUDED.code,
			     name = EXCLUDED.name,
			     city = EXCLUDED.city,
			     is_active = true,
			     sort_order = EXCLUDED.sort_order,
			     updated_at = now()
			 RETURNING id::text`,
			resolvedStoreID,
			tenantID,
			storeCode,
			store.Name,
			index,
		).Scan(&resolvedStoreID); err != nil {
			return AdminClient{}, fmt.Errorf("upsert tenant store directory: %w", err)
		}

		if _, err := tx.Exec(
			ctx,
			`INSERT INTO tenant_store_charges (tenant_id, store_id, amount, metadata)
			 VALUES ($1, $2, $3, '{}'::jsonb)
			 ON CONFLICT (store_id) DO UPDATE
			 SET tenant_id = EXCLUDED.tenant_id,
			     amount = EXCLUDED.amount,
			     updated_at = now()`,
			tenantID,
			resolvedStoreID,
			store.Amount,
		); err != nil {
			return AdminClient{}, fmt.Errorf("upsert tenant store billing: %w", err)
		}

		desiredStoreIDs = append(desiredStoreIDs, resolvedStoreID)
	}

	if len(desiredStoreIDs) > 0 {
		if _, err := tx.Exec(
			ctx,
			`UPDATE tenant_stores
			 SET is_active = false,
			     updated_at = now()
			 WHERE tenant_id = $1
			   AND NOT (id::text = ANY($2))`,
			tenantID,
			desiredStoreIDs,
		); err != nil {
			return AdminClient{}, fmt.Errorf("archive removed tenant stores: %w", err)
		}

		if _, err := tx.Exec(
			ctx,
			`DELETE FROM tenant_store_charges
			 WHERE tenant_id = $1
			   AND NOT (store_id::text = ANY($2))`,
			tenantID,
			desiredStoreIDs,
		); err != nil {
			return AdminClient{}, fmt.Errorf("clear removed tenant store billing: %w", err)
		}
	} else {
		if _, err := tx.Exec(
			ctx,
			`UPDATE tenant_stores
			 SET is_active = false,
			     updated_at = now()
			 WHERE tenant_id = $1`,
			tenantID,
		); err != nil {
			return AdminClient{}, fmt.Errorf("archive tenant stores: %w", err)
		}

		if _, err := tx.Exec(ctx, `DELETE FROM tenant_store_charges WHERE tenant_id = $1`, tenantID); err != nil {
			return AdminClient{}, fmt.Errorf("clear tenant store billing: %w", err)
		}
	}

	if _, err := tx.Exec(
		ctx,
		`UPDATE tenants
		 SET monthly_payment_amount = $2,
		     updated_at = now()
		 WHERE id = $1`,
		tenantID,
		totalAmount,
	); err != nil {
		return AdminClient{}, fmt.Errorf("sync tenant monthly payment from stores: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return AdminClient{}, fmt.Errorf("commit stores tx: %w", err)
	}

	updated, _, err := s.getAdminClientByCoreTenantID(ctx, tenantID)
	if err != nil {
		return AdminClient{}, err
	}

	_ = s.insertAudit(ctx, auditInput{
		TenantID:   tenantID,
		UserID:     input.UserID,
		Action:     "admin.client.stores.replaced",
		EntityType: "tenant",
		EntityID:   tenantID,
		AfterData:  updated,
	})

	return updated, nil
}

func (s *Service) RotateAdminClientWebhook(ctx context.Context, input RotateAdminClientWebhookInput) (AdminClient, error) {
	_, tenantID, err := s.getAdminClientByCoreTenantID(ctx, input.CoreTenantID)
	if err != nil {
		return AdminClient{}, err
	}

	if !input.IsPlatformAdmin && strings.TrimSpace(input.TenantID) != tenantID {
		return AdminClient{}, ErrForbidden
	}

	key, err := generateWebhookKey()
	if err != nil {
		return AdminClient{}, fmt.Errorf("generate webhook key: %w", err)
	}

	if _, err := s.pool.Exec(
		ctx,
		`UPDATE tenants
		 SET webhook_key = $2,
		     webhook_enabled = true,
		     updated_at = now()
		 WHERE id = $1`,
		tenantID,
		key,
	); err != nil {
		return AdminClient{}, fmt.Errorf("rotate webhook key: %w", err)
	}

	updated, _, err := s.getAdminClientByCoreTenantID(ctx, tenantID)
	if err != nil {
		return AdminClient{}, err
	}

	_ = s.insertAudit(ctx, auditInput{
		TenantID:   tenantID,
		UserID:     input.UserID,
		Action:     "admin.client.webhook.rotated",
		EntityType: "tenant",
		EntityID:   tenantID,
		AfterData:  updated,
	})

	return updated, nil
}

func (s *Service) DeleteAdminClient(ctx context.Context, input DeleteAdminClientInput) error {
	if !input.IsPlatformAdmin {
		return ErrForbidden
	}

	coreTenantID := strings.TrimSpace(input.CoreTenantID)
	if coreTenantID == "" {
		return ErrInvalidInput
	}

	result, err := s.pool.Exec(
		ctx,
		`UPDATE tenants
		 SET status = 'cancelled',
		     deleted_at = COALESCE(deleted_at, now()),
		     updated_at = now()
		 WHERE id = $1::uuid
		   AND deleted_at IS NULL`,
		coreTenantID,
	)
	if err != nil {
		return fmt.Errorf("delete admin client: %w", err)
	}
	if result.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

func (s *Service) ListAdminUsers(ctx context.Context, input ListAdminUsersInput) ([]AdminUser, int, error) {
	page, limit := normalizePageAndLimit(input.Page, input.Limit, adminDefaultPageLimit, adminMaxPageLimit)
	offset := (page - 1) * limit

	if !input.IsPlatformAdmin && strings.TrimSpace(input.TenantID) == "" {
		return []AdminUser{}, 0, nil
	}

	args := make([]any, 0, 10)
	arg := func(value any) string {
		args = append(args, value)
		return fmt.Sprintf("$%d", len(args))
	}

	conditions := []string{"u.deleted_at IS NULL"}

	joinClause := fmt.Sprintf(`
LEFT JOIN LATERAL (
	SELECT
		tu.id,
		tu.tenant_id,
		tu.access_level,
		tu.user_type,
		tu.business_role,
		tu.store_id,
		tu.registration_number,
		tu.status,
		tu.is_owner,
		tu.created_at
	FROM tenant_users tu
	WHERE tu.user_id = u.id
	  AND tu.status IN ('active', 'invited', 'suspended')
	ORDER BY
		CASE tu.status
			WHEN 'active' THEN 0
			WHEN 'invited' THEN 1
			ELSE 2
		END,
		%s,
		tu.created_at DESC
	LIMIT 1
) scope ON true
LEFT JOIN tenants t ON t.id = scope.tenant_id AND t.deleted_at IS NULL
LEFT JOIN tenant_stores store ON store.id = scope.store_id
%s
`, effectiveAdminMembershipOrderSQL("tu"), adminUserModuleScopeJoinClause())

	if !input.IsPlatformAdmin {
		tenantPlaceholder := arg(strings.TrimSpace(input.TenantID))
		joinClause = fmt.Sprintf(`
JOIN tenant_users scope ON scope.user_id = u.id
	AND scope.tenant_id = %s
	AND scope.status IN ('active', 'invited', 'suspended')
JOIN tenants t ON t.id = scope.tenant_id AND t.deleted_at IS NULL
LEFT JOIN tenant_stores store ON store.id = scope.store_id
%s
`, tenantPlaceholder, adminUserModuleScopeJoinClause())
	}

	queryText := strings.TrimSpace(strings.ToLower(input.Query))
	if queryText != "" {
		like := "%" + queryText + "%"
		placeholder := arg(like)
		conditions = append(conditions, fmt.Sprintf(`(
			LOWER(u.name) LIKE %s
			OR LOWER(COALESCE(u.nick, '')) LIKE %s
			OR LOWER(u.email::text) LIKE %s
			OR LOWER(COALESCE(u.phone, '')) LIKE %s
			OR LOWER(COALESCE(scope.access_level, '')) LIKE %s
			OR LOWER(COALESCE(scope.user_type, '')) LIKE %s
			OR LOWER(COALESCE(scope.business_role, '')) LIKE %s
			OR LOWER(COALESCE(store.name, '')) LIKE %s
			OR LOWER(COALESCE(scope.registration_number, '')) LIKE %s
			OR LOWER(COALESCE(t.name, '')) LIKE %s
			OR u.id::text LIKE %s
			OR COALESCE(scope.tenant_id::text, '') LIKE %s
		)`, placeholder, placeholder, placeholder, placeholder, placeholder, placeholder, placeholder, placeholder, placeholder, placeholder, placeholder, placeholder))
	}

	if input.CoreTenantID != nil {
		if strings.TrimSpace(*input.CoreTenantID) == "" {
			conditions = append(conditions, "scope.tenant_id IS NULL")
		} else {
			conditions = append(conditions, fmt.Sprintf("scope.tenant_id = %s::uuid", arg(strings.TrimSpace(*input.CoreTenantID))))
		}
	}

	limitPlaceholder := arg(limit)
	offsetPlaceholder := arg(offset)

	query := fmt.Sprintf(`
SELECT
	u.id::text,
	u.is_platform_admin,
	scope.tenant_id,
	COALESCE(t.name, ''),
	u.name,
	COALESCE(u.nick, ''),
	u.email::text,
	COALESCE(u.phone, ''),
	u.status::text,
	COALESCE(u.avatar_url, ''),
	u.last_login_at,
	u.created_at,
	%s,
	%s,
	%s,
	scope.store_id::text,
			COALESCE(store.name, ''),
			COALESCE(scope.registration_number, ''),
	COALESCE(u.preferences::text, '{}'),
	COALESCE(module_scope.module_codes, '[]'::json),
	COALESCE(module_scope.atendimento_access, false),
	COUNT(*) OVER()
FROM users u
%s
WHERE %s
ORDER BY u.created_at DESC
LIMIT %s OFFSET %s
`,
		effectiveTenantUserAccessLevelSQL("scope", "u"),
		effectiveTenantUserTypeSQL("scope", "u"),
		effectiveTenantUserBusinessRoleSQL("scope", "u"),
		joinClause,
		strings.Join(conditions, " AND "),
		limitPlaceholder,
		offsetPlaceholder,
	)

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list admin users: %w", err)
	}
	defer rows.Close()

	items := make([]AdminUser, 0)
	total := 0

	for rows.Next() {
		var (
			item            AdminUser
			scopeTenantID   *string
			storeID         *string
			lastLoginAt     *time.Time
			createdAt       time.Time
			moduleCodesJSON []byte
			totalRows       int
		)

		if err := rows.Scan(
			&item.CoreUserID,
			&item.IsPlatformAdmin,
			&scopeTenantID,
			&item.ClientName,
			&item.Name,
			&item.Nick,
			&item.Email,
			&item.Phone,
			&item.Status,
			&item.ProfileImg,
			&lastLoginAt,
			&createdAt,
			&item.Level,
			&item.UserType,
			&item.BusinessRole,
			&storeID,
			&item.StoreName,
			&item.RegistrationNumber,
			&item.Preference,
			&moduleCodesJSON,
			&item.AtendimentoAccess,
			&totalRows,
		); err != nil {
			return nil, 0, fmt.Errorf("scan admin users row: %w", err)
		}

		item.ID = item.CoreUserID
		item.CoreTenantID = scopeTenantID
		item.StoreID = storeID
		item.Status = normalizeUserRecordStatus(item.Status)
		item.UserType = normalizeUserType(item.UserType)
		item.BusinessRole = resolveAdminUserBusinessRole(item.BusinessRole, item.Level, item.UserType, item.IsPlatformAdmin, false)
		item.Level = resolveAccessLevelForBusinessRole(item.BusinessRole, item.Level, item.IsPlatformAdmin)
		item.RegistrationNumber = normalizeRegistrationNumber(item.RegistrationNumber)
		if err := json.Unmarshal(moduleCodesJSON, &item.ModuleCodes); err != nil {
			item.ModuleCodes = []string{}
		}
		if item.IsPlatformAdmin {
			item.Level = "admin"
			item.UserType = "admin"
			item.BusinessRole = "system_admin"
			item.StoreID = nil
			item.StoreName = ""
		}
		item.Password = "********"
		item.CreatedAt = createdAt.UTC().Format(time.RFC3339)
		if lastLoginAt != nil {
			item.LastLogin = lastLoginAt.UTC().Format(time.RFC3339)
		} else {
			item.LastLogin = ""
		}
		total = totalRows
		items = append(items, item)
	}

	if rows.Err() != nil {
		return nil, 0, fmt.Errorf("iterate admin users rows: %w", rows.Err())
	}

	return items, total, nil
}

func (s *Service) CreateAdminUser(ctx context.Context, input CreateAdminUserInput) (AdminUser, string, error) {
	name := strings.TrimSpace(input.Name)
	email := strings.TrimSpace(strings.ToLower(input.Email))
	if name == "" || email == "" {
		return AdminUser{}, "", ErrInvalidInput
	}

	targetIsPlatformAdmin := input.TargetIsPlatformAdmin && input.IsPlatformAdmin
	if err := validateExplicitBusinessRole(input.BusinessRole, targetIsPlatformAdmin); err != nil {
		return AdminUser{}, "", err
	}
	shouldCreateTenantMembership := shouldCreateAdminUserTenantMembership(input.IsPlatformAdmin, targetIsPlatformAdmin, input.CoreTenantID)

	var targetTenantID string
	var err error
	if shouldCreateTenantMembership {
		if targetIsPlatformAdmin {
			targetTenantID, err = s.resolveRootTenantID(ctx)
		} else {
			targetTenantID, err = s.resolveTargetTenantForUserMutation(ctx, input.TenantID, input.IsPlatformAdmin, input.CoreTenantID)
		}
		if err != nil {
			return AdminUser{}, "", err
		}
	}

	level := normalizeAccessLevel(input.Level)
	if targetIsPlatformAdmin {
		level = "admin"
	}
	membershipState := resolveAdminUserMembershipState(input.BusinessRole, level, targetIsPlatformAdmin)
	desiredUserStatus := resolveCreatedAdminUserStatus(shouldCreateTenantMembership)
	directoryState := adminUserDirectoryState{
		BusinessRole:       membershipState.BusinessRole,
		StoreID:            normalizeOptionalStoreID(input.StoreID),
		RegistrationNumber: normalizeRegistrationNumber(input.RegistrationNumber),
	}
	if shouldCreateTenantMembership {
		directoryState, err = s.sanitizeAdminUserDirectoryState(ctx, targetTenantID, directoryState)
		if err != nil {
			return AdminUser{}, "", err
		}
		if err := s.enforceAdminUserDirectoryRequirements(ctx, targetTenantID, directoryState); err != nil {
			return AdminUser{}, "", err
		}
	} else {
		directoryState.StoreID = ""
		directoryState.RegistrationNumber = ""
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return AdminUser{}, "", fmt.Errorf("begin create user tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var (
		coreUserID   string
		tenantUserID string
	)

	coreUserID, _, err = upsertAdminManagedUserByEmail(
		ctx,
		tx,
		adminManagedUserInput{
			Name:            name,
			Nick:            trimText(input.Nick, 80),
			Email:           email,
			Password:        strings.TrimSpace(input.Password),
			Phone:           trimText(input.Phone, 30),
			Status:          desiredUserStatus,
			IsPlatformAdmin: targetIsPlatformAdmin,
		},
	)
	if err != nil {
		return AdminUser{}, "", err
	}

	if shouldCreateTenantMembership {
		if err := tx.QueryRow(
			ctx,
			`INSERT INTO tenant_users (
				tenant_id,
				user_id,
				status,
				is_owner,
				joined_at,
				access_level,
				user_type,
				business_role,
				store_id,
				registration_number,
				metadata
			)
			VALUES (
				$1,
				$2,
				'active',
				$3,
				now(),
				$4,
				$5,
				$6,
				NULLIF($7, '')::uuid,
				NULLIF($8, ''),
				'{}'::jsonb
			)
			ON CONFLICT (tenant_id, user_id)
			DO UPDATE SET
				status = 'active',
				is_owner = CASE WHEN EXCLUDED.is_owner THEN true ELSE tenant_users.is_owner END,
				joined_at = COALESCE(tenant_users.joined_at, now()),
				access_level = EXCLUDED.access_level,
				user_type = EXCLUDED.user_type,
				business_role = EXCLUDED.business_role,
				store_id = EXCLUDED.store_id,
				registration_number = EXCLUDED.registration_number,
				updated_at = now()
			RETURNING id`,
			targetTenantID,
			coreUserID,
			membershipState.IsOwner,
			membershipState.AccessLevel,
			membershipState.UserType,
			directoryState.BusinessRole,
			directoryState.StoreID,
			directoryState.RegistrationNumber,
		).Scan(&tenantUserID); err != nil {
			return AdminUser{}, "", fmt.Errorf("create tenant user membership: %w", err)
		}

		if err := s.syncManagedTenantUserRoles(
			ctx,
			tx,
			targetTenantID,
			tenantUserID,
			strings.TrimSpace(input.UserID),
			membershipState.AccessLevel,
			targetIsPlatformAdmin,
		); err != nil {
			return AdminUser{}, "", err
		}

		if targetIsPlatformAdmin {
			if err := s.grantPlatformAdminModules(ctx, tx, targetTenantID, tenantUserID, strings.TrimSpace(input.UserID)); err != nil {
				return AdminUser{}, "", err
			}
		} else if membershipState.AccessLevel == "admin" && membershipState.UserType == "admin" {
			if _, err := tx.Exec(
				ctx,
				`INSERT INTO tenant_user_modules (
					tenant_id,
					tenant_user_id,
					module_id,
					status,
					granted_by_user_id,
					granted_at,
					metadata
				)
				SELECT
					$1,
					$2,
					m.id,
					'active',
					$3,
					now(),
					'{}'::jsonb
				FROM modules m
				JOIN tenant_modules tm ON tm.module_id = m.id
				WHERE tm.tenant_id = $1
				  AND tm.status = 'active'
				  AND m.code = 'atendimento'
				ON CONFLICT (tenant_user_id, module_id)
				DO UPDATE SET
					status = 'active',
					revoked_at = NULL,
					granted_at = now(),
					granted_by_user_id = EXCLUDED.granted_by_user_id,
					updated_at = now()`,
				targetTenantID,
				tenantUserID,
				nullableString(strings.TrimSpace(input.UserID)),
			); err != nil {
				return AdminUser{}, "", fmt.Errorf("assign atendimento module to tenant admin: %w", err)
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return AdminUser{}, "", fmt.Errorf("commit create user tx: %w", err)
	}

	item, _, err := s.getAdminUserByCoreUserID(ctx, coreUserID, targetTenantID, false)
	if err != nil {
		return AdminUser{}, "", err
	}

	return item, targetTenantID, nil
}

type adminManagedUserInput struct {
	Name            string
	Nick            string
	Email           string
	Password        string
	Phone           string
	Status          string
	IsPlatformAdmin bool
}

func upsertAdminManagedUserByEmail(ctx context.Context, tx pgx.Tx, input adminManagedUserInput) (string, int, error) {
	password := strings.TrimSpace(input.Password)
	if password == "" {
		password = "Senha@123"
	}
	desiredStatus := mapUserStatusToDB(input.Status)

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", 0, fmt.Errorf("hash password: %w", err)
	}

	var (
		userID       string
		legacyID     int
		status       string
		hadDeletedAt bool
	)

	err = tx.QueryRow(
		ctx,
		`SELECT id, legacy_id, status::text, deleted_at IS NOT NULL
		 FROM users
		 WHERE email = $1
		 LIMIT 1`,
		input.Email,
	).Scan(&userID, &legacyID, &status, &hadDeletedAt)
	if err == nil {
		shouldRefreshPassword := strings.TrimSpace(status) != "active" || hadDeletedAt
		if _, err := tx.Exec(
			ctx,
			`UPDATE users
			 SET name = $2,
			     display_name = $2,
			     nick = CASE WHEN NULLIF($3, '') IS NOT NULL THEN $3 ELSE users.nick END,
			     password_hash = CASE WHEN $4 THEN $5 ELSE users.password_hash END,
			     phone = CASE WHEN NULLIF($6, '') IS NOT NULL THEN $6 ELSE users.phone END,
			     status = $7::user_status,
			     is_platform_admin = users.is_platform_admin OR $8,
			     email_verified_at = COALESCE(users.email_verified_at, now()),
			     deleted_at = NULL,
			     updated_at = now()
			 WHERE id = $1`,
			userID,
			input.Name,
			input.Nick,
			shouldRefreshPassword,
			string(passwordHash),
			input.Phone,
			desiredStatus,
			input.IsPlatformAdmin,
		); err != nil {
			return "", 0, fmt.Errorf("update admin user by email: %w", err)
		}

		return userID, legacyID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", 0, fmt.Errorf("find admin user by email: %w", err)
	}

	err = tx.QueryRow(
		ctx,
		`INSERT INTO users (
			name,
			display_name,
			nick,
			email,
			password_hash,
			phone,
			status,
			is_platform_admin,
			email_verified_at,
			preferences,
			metadata
		)
		VALUES (
			$1,
			$1,
			$2,
			$3,
			$4,
			$5,
			$6::user_status,
			$7,
			now(),
			'{}'::jsonb,
			'{}'::jsonb
		)
		RETURNING id, legacy_id`,
		input.Name,
		input.Nick,
		input.Email,
		string(passwordHash),
		input.Phone,
		desiredStatus,
		input.IsPlatformAdmin,
	).Scan(&userID, &legacyID)
	if err != nil {
		return "", 0, fmt.Errorf("create admin user: %w", err)
	}

	return userID, legacyID, nil
}

func (s *Service) UpdateAdminUserField(ctx context.Context, input UpdateAdminUserFieldInput) (AdminUser, string, error) {
	current, scopeTenantID, err := s.getAdminUserByCoreUserID(ctx, input.TargetCoreUserID, input.TenantID, !input.IsPlatformAdmin)
	if err != nil {
		return AdminUser{}, "", err
	}

	field := strings.TrimSpace(input.Field)
	switch field {
	case "coreTenantId":
		if !input.IsPlatformAdmin {
			return AdminUser{}, "", ErrForbidden
		}
		if current.IsPlatformAdmin {
			return AdminUser{}, "", ErrForbidden
		}

		nextCoreTenantID := strings.TrimSpace(stringValue(input.Value))
		if nextCoreTenantID == "" {
			return AdminUser{}, "", ErrInvalidInput
		}

		if current.CoreTenantID != nil && strings.TrimSpace(*current.CoreTenantID) == nextCoreTenantID {
			return current, scopeTenantID, nil
		}

		nextTenantID, resolveErr := s.resolveTargetTenantForUserMutation(ctx, input.TenantID, true, stringPtr(nextCoreTenantID))
		if resolveErr != nil {
			return AdminUser{}, "", resolveErr
		}

		nextMembershipState := resolveAdminUserMembershipState(current.BusinessRole, current.Level, current.IsPlatformAdmin)

		nextDirectoryState, stateErr := s.sanitizeAdminUserDirectoryState(ctx, nextTenantID, adminUserDirectoryState{
			BusinessRole:       nextMembershipState.BusinessRole,
			StoreID:            "",
			RegistrationNumber: current.RegistrationNumber,
		})
		if stateErr != nil {
			return AdminUser{}, "", stateErr
		}

		nextUserStatus := "active"
		nextTenantUserStatus := "active"
		if requirementErr := s.enforceAdminUserDirectoryRequirements(ctx, nextTenantID, nextDirectoryState); requirementErr != nil {
			if !errors.Is(requirementErr, ErrInvalidInput) {
				return AdminUser{}, "", requirementErr
			}
			nextUserStatus = "inactive"
			nextTenantUserStatus = "suspended"
		}

		tx, beginErr := s.pool.Begin(ctx)
		if beginErr != nil {
			return AdminUser{}, "", fmt.Errorf("begin reassign admin user tenant tx: %w", beginErr)
		}
		defer func() { _ = tx.Rollback(ctx) }()

		if _, execErr := tx.Exec(
			ctx,
			`UPDATE tenant_user_modules tum
			 SET status = 'inactive',
			     revoked_at = COALESCE(tum.revoked_at, now()),
			     updated_at = now()
			 FROM tenant_users tu
			 WHERE tum.tenant_user_id = tu.id
			   AND tu.user_id = $1
			   AND tum.status = 'active'`,
			current.CoreUserID,
		); execErr != nil {
			return AdminUser{}, "", fmt.Errorf("deactivate old tenant user modules on user reassign: %w", execErr)
		}

		if _, execErr := tx.Exec(
			ctx,
			`UPDATE tenant_users
			 SET status = 'suspended',
			     is_owner = false,
			     updated_at = now()
			 WHERE user_id = $1
			   AND status IN ('active', 'invited')`,
			current.CoreUserID,
		); execErr != nil {
			return AdminUser{}, "", fmt.Errorf("suspend previous tenant memberships on user reassign: %w", execErr)
		}

		var nextTenantUserID string
		if scanErr := tx.QueryRow(
			ctx,
			`INSERT INTO tenant_users (
				tenant_id,
				user_id,
				status,
				is_owner,
				joined_at,
				access_level,
				user_type,
				business_role,
				store_id,
				registration_number,
				metadata
			)
			VALUES (
				$1,
				$2,
				$3::tenant_user_status,
				$4,
				now(),
				$5,
				$6,
				$7,
				NULLIF($8, '')::uuid,
				NULLIF($9, ''),
				'{}'::jsonb
			)
			ON CONFLICT (tenant_id, user_id)
			DO UPDATE SET
				status = EXCLUDED.status,
				is_owner = EXCLUDED.is_owner,
				access_level = EXCLUDED.access_level,
				user_type = EXCLUDED.user_type,
				business_role = EXCLUDED.business_role,
				store_id = EXCLUDED.store_id,
				registration_number = EXCLUDED.registration_number,
				updated_at = now()
			RETURNING id`,
			nextTenantID,
			current.CoreUserID,
			nextTenantUserStatus,
			nextMembershipState.IsOwner,
			nextMembershipState.AccessLevel,
			nextMembershipState.UserType,
			nextDirectoryState.BusinessRole,
			nextDirectoryState.StoreID,
			nextDirectoryState.RegistrationNumber,
		).Scan(&nextTenantUserID); scanErr != nil {
			return AdminUser{}, "", fmt.Errorf("upsert reassigned tenant user membership: %w", scanErr)
		}

		if _, execErr := tx.Exec(
			ctx,
			`UPDATE users
			 SET status = $2::user_status,
			     updated_at = now()
			 WHERE id = $1`,
			current.CoreUserID,
			mapUserStatusToDB(nextUserStatus),
		); execErr != nil {
			return AdminUser{}, "", fmt.Errorf("reactivate user after client assignment: %w", execErr)
		}

		if _, execErr := tx.Exec(
			ctx,
			`INSERT INTO tenant_modules (tenant_id, module_id, status, source, activated_at, deactivated_at, metadata)
			 SELECT $1, m.id, 'active', 'custom', now(), NULL, '{}'::jsonb
			 FROM modules m
			 WHERE m.code = 'core_panel'
			 ON CONFLICT (tenant_id, module_id)
			 DO UPDATE SET
			   status = 'active',
			   source = EXCLUDED.source,
			   activated_at = now(),
			   deactivated_at = NULL,
			   updated_at = now()`,
			nextTenantID,
		); execErr != nil {
			return AdminUser{}, "", fmt.Errorf("ensure core_panel module active on user reassign: %w", execErr)
		}

		if _, execErr := tx.Exec(
			ctx,
			`INSERT INTO tenant_user_modules (
				tenant_id,
				tenant_user_id,
				module_id,
				status,
				granted_by_user_id,
				granted_at,
				metadata
			)
			SELECT
				$1,
				$2,
				m.id,
				'active',
				$3,
				now(),
				'{}'::jsonb
			FROM modules m
			WHERE m.code = 'core_panel'
			ON CONFLICT (tenant_user_id, module_id)
			DO UPDATE SET
				status = 'active',
				revoked_at = NULL,
				granted_at = now(),
				granted_by_user_id = EXCLUDED.granted_by_user_id,
				updated_at = now()`,
			nextTenantID,
			nextTenantUserID,
			nullableString(strings.TrimSpace(input.UserID)),
		); execErr != nil {
			return AdminUser{}, "", fmt.Errorf("assign core_panel module on user reassign: %w", execErr)
		}

		if commitErr := tx.Commit(ctx); commitErr != nil {
			return AdminUser{}, "", fmt.Errorf("commit user tenant reassignment: %w", commitErr)
		}

		scopeTenantID = nextTenantID
	case "level":
		if scopeTenantID == "" {
			return AdminUser{}, "", ErrInvalidInput
		}
		nextMembershipState := resolveAdminUserMembershipState("", stringValue(input.Value), current.IsPlatformAdmin)
		nextState, stateErr := s.sanitizeAdminUserDirectoryState(ctx, scopeTenantID, adminUserDirectoryState{
			BusinessRole:       nextMembershipState.BusinessRole,
			StoreID:            stringFromPtr(current.StoreID),
			RegistrationNumber: current.RegistrationNumber,
		})
		if stateErr != nil {
			return AdminUser{}, "", stateErr
		}
		if current.Status == "active" {
			if requirementErr := s.enforceAdminUserDirectoryRequirements(ctx, scopeTenantID, nextState); requirementErr != nil {
				return AdminUser{}, "", requirementErr
			}
		}
		_, err = s.pool.Exec(
			ctx,
			`UPDATE tenant_users
			 SET is_owner = $3,
			     access_level = $4,
			     user_type = $5,
			     business_role = $6,
			     store_id = NULLIF($7, '')::uuid,
			     updated_at = now()
			 WHERE tenant_id = $1
			   AND user_id = $2`,
			scopeTenantID,
			current.CoreUserID,
			nextMembershipState.IsOwner,
			nextMembershipState.AccessLevel,
			nextMembershipState.UserType,
			nextState.BusinessRole,
			nextState.StoreID,
		)
	case "userType":
		if scopeTenantID == "" {
			return AdminUser{}, "", ErrInvalidInput
		}
		_, err = s.pool.Exec(
			ctx,
			`UPDATE tenant_users
			 SET user_type = $3,
			     updated_at = now()
			 WHERE tenant_id = $1
			   AND user_id = $2`,
			scopeTenantID,
			current.CoreUserID,
			normalizeUserType(stringValue(input.Value)),
		)
	case "businessRole":
		if current.IsPlatformAdmin {
			return AdminUser{}, "", ErrForbidden
		}
		if scopeTenantID == "" {
			return AdminUser{}, "", ErrInvalidInput
		}
		if err := validateExplicitBusinessRole(stringValue(input.Value), false); err != nil {
			return AdminUser{}, "", err
		}
		nextMembershipState := resolveAdminUserMembershipState(stringValue(input.Value), current.Level, false)
		nextState, stateErr := s.sanitizeAdminUserDirectoryState(ctx, scopeTenantID, adminUserDirectoryState{
			BusinessRole:       nextMembershipState.BusinessRole,
			StoreID:            stringFromPtr(current.StoreID),
			RegistrationNumber: current.RegistrationNumber,
		})
		if stateErr != nil {
			return AdminUser{}, "", stateErr
		}
		if current.Status == "active" {
			if requirementErr := s.enforceAdminUserDirectoryRequirements(ctx, scopeTenantID, nextState); requirementErr != nil {
				return AdminUser{}, "", requirementErr
			}
		}
		_, err = s.pool.Exec(
			ctx,
			`UPDATE tenant_users
			 SET is_owner = $3,
			     access_level = $4,
			     user_type = $5,
			     business_role = $6,
			     store_id = NULLIF($7, '')::uuid,
			     updated_at = now()
			 WHERE tenant_id = $1
			   AND user_id = $2`,
			scopeTenantID,
			current.CoreUserID,
			nextMembershipState.IsOwner,
			nextMembershipState.AccessLevel,
			nextMembershipState.UserType,
			nextState.BusinessRole,
			nextState.StoreID,
		)
	case "storeId":
		if current.IsPlatformAdmin {
			return AdminUser{}, "", ErrForbidden
		}
		if scopeTenantID == "" {
			return AdminUser{}, "", ErrInvalidInput
		}
		nextState, stateErr := s.sanitizeAdminUserDirectoryState(ctx, scopeTenantID, adminUserDirectoryState{
			BusinessRole:       resolveAdminUserBusinessRole(current.BusinessRole, current.Level, current.UserType, false, normalizeAccessLevel(current.Level) == "admin" && normalizeUserType(current.UserType) == "admin"),
			StoreID:            normalizeOptionalStoreID(input.Value),
			RegistrationNumber: current.RegistrationNumber,
		})
		if stateErr != nil {
			return AdminUser{}, "", stateErr
		}
		if current.Status == "active" {
			if requirementErr := s.enforceAdminUserDirectoryRequirements(ctx, scopeTenantID, nextState); requirementErr != nil {
				return AdminUser{}, "", requirementErr
			}
		}
		_, err = s.pool.Exec(
			ctx,
			`UPDATE tenant_users
			 SET store_id = NULLIF($3, '')::uuid,
			     updated_at = now()
			 WHERE tenant_id = $1
			   AND user_id = $2`,
			scopeTenantID,
			current.CoreUserID,
			nextState.StoreID,
		)
	case "registrationNumber":
		if current.IsPlatformAdmin {
			return AdminUser{}, "", ErrForbidden
		}
		if scopeTenantID == "" {
			return AdminUser{}, "", ErrInvalidInput
		}
		nextState, stateErr := s.sanitizeAdminUserDirectoryState(ctx, scopeTenantID, adminUserDirectoryState{
			BusinessRole:       resolveAdminUserBusinessRole(current.BusinessRole, current.Level, current.UserType, false, normalizeAccessLevel(current.Level) == "admin" && normalizeUserType(current.UserType) == "admin"),
			StoreID:            stringFromPtr(current.StoreID),
			RegistrationNumber: normalizeRegistrationNumber(input.Value),
		})
		if stateErr != nil {
			return AdminUser{}, "", stateErr
		}
		if current.Status == "active" {
			if requirementErr := s.enforceAdminUserDirectoryRequirements(ctx, scopeTenantID, nextState); requirementErr != nil {
				return AdminUser{}, "", requirementErr
			}
		}
		_, err = s.pool.Exec(
			ctx,
			`UPDATE tenant_users
			 SET registration_number = NULLIF($3, ''),
			     updated_at = now()
			 WHERE tenant_id = $1
			   AND user_id = $2`,
			scopeTenantID,
			current.CoreUserID,
			nextState.RegistrationNumber,
		)
	case "name":
		value := strings.TrimSpace(stringValue(input.Value))
		if value == "" {
			return AdminUser{}, "", ErrInvalidInput
		}
		_, err = s.pool.Exec(
			ctx,
			`UPDATE users
			 SET name = $2,
			     display_name = $2,
			     updated_at = now()
			 WHERE id = $1`,
			current.CoreUserID,
			value,
		)
	case "nick":
		_, err = s.pool.Exec(ctx, `UPDATE users SET nick = $2, updated_at = now() WHERE id = $1`, current.CoreUserID, trimText(input.Value, 80))
	case "email":
		email := strings.TrimSpace(strings.ToLower(stringValue(input.Value)))
		if email == "" {
			return AdminUser{}, "", ErrInvalidInput
		}
		_, err = s.pool.Exec(ctx, `UPDATE users SET email = $2, updated_at = now() WHERE id = $1`, current.CoreUserID, email)
	case "phone":
		_, err = s.pool.Exec(ctx, `UPDATE users SET phone = $2, updated_at = now() WHERE id = $1`, current.CoreUserID, trimText(input.Value, 30))
	case "password":
		password := strings.TrimSpace(stringValue(input.Value))
		if len(password) < 6 {
			return AdminUser{}, "", ErrInvalidInput
		}
		passwordHash, hashErr := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if hashErr != nil {
			return AdminUser{}, "", fmt.Errorf("hash password for admin user update: %w", hashErr)
		}
		_, err = s.pool.Exec(ctx, `UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, current.CoreUserID, string(passwordHash))
	case "status":
		normalized := normalizeUserRecordStatus(stringValue(input.Value))
		if normalized == "active" {
			canActivate, activationErr := s.canActivateManagedAdminUserRecord(ctx, current, scopeTenantID)
			if activationErr != nil {
				return AdminUser{}, "", activationErr
			}
			if !canActivate {
				return AdminUser{}, "", ErrInvalidInput
			}
		}
		tenantUserStatus := "suspended"
		if normalized == "active" {
			tenantUserStatus = "active"
		}
		_, err = s.pool.Exec(
			ctx,
			`UPDATE users
			 SET status = $2::user_status,
			     updated_at = now()
			 WHERE id = $1`,
			current.CoreUserID,
			mapUserStatusToDB(normalized),
		)
		if err == nil && scopeTenantID != "" {
			_, err = s.pool.Exec(
				ctx,
				`UPDATE tenant_users
				 SET status = $3::tenant_user_status,
				     updated_at = now()
				 WHERE tenant_id = $1
				   AND user_id = $2`,
				scopeTenantID,
				current.CoreUserID,
				tenantUserStatus,
			)
		}
	case "profileImage":
		_, err = s.pool.Exec(ctx, `UPDATE users SET avatar_url = $2, updated_at = now() WHERE id = $1`, current.CoreUserID, trimText(input.Value, 500))
	case "lastLogin":
		timestamp := parseTimestamp(input.Value)
		if timestamp == nil {
			_, err = s.pool.Exec(ctx, `UPDATE users SET last_login_at = NULL, updated_at = now() WHERE id = $1`, current.CoreUserID)
		} else {
			_, err = s.pool.Exec(ctx, `UPDATE users SET last_login_at = $2, updated_at = now() WHERE id = $1`, current.CoreUserID, *timestamp)
		}
	case "createdAt":
		timestamp := parseTimestamp(input.Value)
		if timestamp == nil {
			return AdminUser{}, "", ErrInvalidInput
		}
		_, err = s.pool.Exec(ctx, `UPDATE users SET created_at = $2, updated_at = now() WHERE id = $1`, current.CoreUserID, *timestamp)
	case "preferences":
		preferences := normalizePreferencesJSON(input.Value)
		_, err = s.pool.Exec(ctx, `UPDATE users SET preferences = $2::jsonb, updated_at = now() WHERE id = $1`, current.CoreUserID, preferences)
	case "atendimentoAccess":
		if current.IsPlatformAdmin || scopeTenantID == "" {
			return AdminUser{}, "", ErrForbidden
		}
		tenantUserID, lookupErr := s.findTenantUserIDByUserID(ctx, scopeTenantID, current.CoreUserID)
		if lookupErr != nil {
			return AdminUser{}, "", lookupErr
		}
		if boolValue(input.Value) {
			_, err = s.AssignTenantUserToModule(ctx, AssignTenantUserInput{
				TenantID:     scopeTenantID,
				ModuleCode:   "atendimento",
				TenantUserID: tenantUserID,
				ActorUserID:  input.UserID,
				LimitKey:     "users",
			})
		} else {
			_, err = s.UnassignTenantUserFromModule(ctx, UnassignTenantUserInput{
				TenantID:     scopeTenantID,
				ModuleCode:   "atendimento",
				TenantUserID: tenantUserID,
				ActorUserID:  input.UserID,
			})
		}
	default:
		return AdminUser{}, "", ErrInvalidInput
	}
	if err != nil {
		return AdminUser{}, "", fmt.Errorf("update admin user field: %w", err)
	}

	updated, _, err := s.getAdminUserByCoreUserID(ctx, input.TargetCoreUserID, input.TenantID, !input.IsPlatformAdmin)
	if err != nil {
		return AdminUser{}, "", err
	}

	_ = s.insertAudit(ctx, auditInput{
		TenantID:   scopeTenantID,
		UserID:     input.UserID,
		Action:     "admin.user.updated",
		EntityType: "user",
		EntityID:   updated.CoreUserID,
		BeforeData: current,
		AfterData:  updated,
		Metadata: map[string]any{
			"field": field,
		},
	})

	return updated, scopeTenantID, nil
}

// UpdateOwnProfileField updates a single self-serviceable field for the authenticated user,
// identified by UUID (JWT claims.Subject). Does NOT allow admin-only fields.
func (s *Service) UpdateOwnProfileField(ctx context.Context, input UpdateOwnProfileFieldInput) error {
	userCoreID := strings.TrimSpace(input.ActorCoreUserID)
	if userCoreID == "" {
		return ErrInvalidInput
	}

	field := strings.TrimSpace(input.Field)

	var err error
	switch field {
	case "name":
		value := strings.TrimSpace(stringValue(input.Value))
		if value == "" {
			return ErrInvalidInput
		}
		_, err = s.pool.Exec(ctx,
			`UPDATE users SET name = $2, display_name = $2, updated_at = now() WHERE id = $1`,
			userCoreID, value)
	case "nick":
		_, err = s.pool.Exec(ctx,
			`UPDATE users SET nick = $2, updated_at = now() WHERE id = $1`,
			userCoreID, trimText(input.Value, 80))
	case "email":
		email := strings.TrimSpace(strings.ToLower(stringValue(input.Value)))
		if email == "" {
			return ErrInvalidInput
		}
		_, err = s.pool.Exec(ctx,
			`UPDATE users SET email = $2, updated_at = now() WHERE id = $1`,
			userCoreID, email)
	case "phone":
		_, err = s.pool.Exec(ctx,
			`UPDATE users SET phone = $2, updated_at = now() WHERE id = $1`,
			userCoreID, trimText(input.Value, 30))
	case "profileImage":
		_, err = s.pool.Exec(ctx,
			`UPDATE users SET avatar_url = $2, updated_at = now() WHERE id = $1`,
			userCoreID, trimText(input.Value, 500))
	case "preferences":
		preferences := normalizePreferencesJSON(input.Value)
		_, err = s.pool.Exec(ctx,
			`UPDATE users SET preferences = $2::jsonb, updated_at = now() WHERE id = $1`,
			userCoreID, preferences)
	case "password":
		password := strings.TrimSpace(stringValue(input.Value))
		if len(password) < 6 {
			return ErrInvalidInput
		}
		passwordHash, hashErr := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if hashErr != nil {
			return fmt.Errorf("hash password for self profile update: %w", hashErr)
		}
		_, err = s.pool.Exec(ctx,
			`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`,
			userCoreID, string(passwordHash))
	default:
		return ErrInvalidInput
	}

	if err != nil {
		return normalizeOwnProfileUpdateError(field, err)
	}
	return nil
}

func (s *Service) ApproveAdminUser(ctx context.Context, input ApproveAdminUserInput) (AdminUser, string, error) {
	current, scopeTenantID, err := s.getAdminUserByCoreUserID(ctx, input.TargetCoreUserID, input.TenantID, !input.IsPlatformAdmin)
	if err != nil {
		return AdminUser{}, "", err
	}
	canActivate, activationErr := s.canActivateManagedAdminUserRecord(ctx, current, scopeTenantID)
	if activationErr != nil {
		return AdminUser{}, "", activationErr
	}
	if !canActivate {
		return AdminUser{}, "", ErrInvalidInput
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return AdminUser{}, "", fmt.Errorf("begin approve user tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(
		ctx,
		`UPDATE users
		 SET status = 'active',
		     last_login_at = now(),
		     updated_at = now()
		 WHERE id = $1`,
		current.CoreUserID,
	); err != nil {
		return AdminUser{}, "", fmt.Errorf("approve user status: %w", err)
	}

	if scopeTenantID != "" {
		if _, err := tx.Exec(
			ctx,
			`UPDATE tenant_users
			 SET status = 'active',
			     joined_at = COALESCE(joined_at, now()),
			     updated_at = now()
			 WHERE tenant_id = $1
			   AND user_id = $2`,
			scopeTenantID,
			current.CoreUserID,
		); err != nil {
			return AdminUser{}, "", fmt.Errorf("approve tenant user status: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return AdminUser{}, "", fmt.Errorf("commit approve user tx: %w", err)
	}

	updated, _, err := s.getAdminUserByCoreUserID(ctx, input.TargetCoreUserID, input.TenantID, !input.IsPlatformAdmin)
	if err != nil {
		return AdminUser{}, "", err
	}

	return updated, scopeTenantID, nil
}

func (s *Service) DeleteAdminUser(ctx context.Context, input DeleteAdminUserInput) (AdminUser, string, error) {
	current, scopeTenantID, err := s.getAdminUserByCoreUserID(ctx, input.TargetCoreUserID, input.TenantID, !input.IsPlatformAdmin)
	if err != nil {
		return AdminUser{}, "", err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return AdminUser{}, "", fmt.Errorf("begin delete user tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(
		ctx,
		`UPDATE users
		 SET status = 'inactive',
		     deleted_at = COALESCE(deleted_at, now()),
		     updated_at = now()
		 WHERE id = $1`,
		current.CoreUserID,
	); err != nil {
		return AdminUser{}, "", fmt.Errorf("soft delete user: %w", err)
	}

	if scopeTenantID != "" {
		if _, err := tx.Exec(
			ctx,
			`UPDATE tenant_users
			 SET status = 'suspended',
			     updated_at = now()
			 WHERE tenant_id = $1
			   AND user_id = $2`,
			scopeTenantID,
			current.CoreUserID,
		); err != nil {
			return AdminUser{}, "", fmt.Errorf("suspend tenant user: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return AdminUser{}, "", fmt.Errorf("commit delete user tx: %w", err)
	}

	return current, scopeTenantID, nil
}

func (s *Service) getAdminClientByCoreTenantID(ctx context.Context, coreTenantID string) (AdminClient, string, error) {
	rows, err := s.pool.Query(
		ctx,
		`
SELECT
	t.legacy_id,
	t.id,
	t.name,
	t.status::text,
	COALESCE(t.user_count, 0),
	COALESCE(array_to_string(t.user_nicks, ', '), ''),
	COALESCE(t.project_count, 0),
	COALESCE(array_to_string(t.project_segments, ', '), ''),
	COALESCE(NULLIF(t.billing_mode, ''), 'single'),
	CASE
		WHEN COALESCE(NULLIF(t.billing_mode, ''), 'single') = 'per_store' THEN COALESCE((
			SELECT SUM(sc.amount)::float8
			FROM tenant_store_charges sc
			JOIN tenant_stores ts ON ts.id = sc.store_id
			WHERE sc.tenant_id = t.id
			  AND ts.is_active = true
		), 0)
		ELSE COALESCE(t.monthly_payment_amount, 0)::float8
	END,
	t.billing_day,
	COALESCE(t.logo_url, ''),
	COALESCE(t.webhook_enabled, false),
	COALESCE(t.webhook_key, ''),
	COALESCE(t.contact_phone, ''),
	COALESCE(t.contact_site, ''),
	COALESCE(t.contact_address, ''),
	COALESCE(t.require_user_store_link, true),
	COALESCE(t.require_user_registration, true),
	COALESCE((
		SELECT json_agg(
			json_build_object(
				'id', ts.id::text,
				'name', ts.name,
				'amount', COALESCE(sc.amount, 0)::float8
			)
			ORDER BY ts.sort_order ASC, ts.created_at ASC
		)
		FROM tenant_stores ts
		LEFT JOIN tenant_store_charges sc ON sc.store_id = ts.id
		WHERE ts.tenant_id = t.id
		  AND ts.is_active = true
	), '[]'::json),
	COALESCE((
		WITH module_scope AS (
			SELECT
				m.code,
				m.name,
				tm.status::text AS status,
				0 AS source_priority,
				m.is_core
			FROM tenant_modules tm
			JOIN modules m ON m.id = tm.module_id
			WHERE tm.tenant_id = t.id

			UNION ALL

			SELECT
				m.code,
				m.name,
				'active'::text AS status,
				1 AS source_priority,
				m.is_core
			FROM tenant_subscriptions ts
			JOIN plan_modules pm
			  ON pm.plan_id = ts.plan_id
			 AND pm.enabled = true
			JOIN modules m ON m.id = pm.module_id
			WHERE ts.tenant_id = t.id
			  AND ts.status IN ('trialing', 'active')
			  AND m.is_active = true
		),
		module_dedupe AS (
			SELECT DISTINCT ON (code)
				code,
				name,
				status,
				source_priority,
				is_core
			FROM module_scope
			ORDER BY code ASC, source_priority ASC
		)
		SELECT json_agg(
			json_build_object(
				'code', md.code,
				'name', md.name,
				'status', md.status
			)
			ORDER BY md.source_priority ASC, md.is_core DESC, md.code ASC
		)
		FROM module_dedupe md
		WHERE md.status = 'active'
	), '[]'::json)
FROM tenants t
WHERE t.id = $1::uuid
  AND t.deleted_at IS NULL
LIMIT 1
`,
		strings.TrimSpace(coreTenantID),
	)
	if err != nil {
		return AdminClient{}, "", fmt.Errorf("get admin client by id: %w", err)
	}
	defer rows.Close()

	if !rows.Next() {
		return AdminClient{}, "", ErrNotFound
	}

	var (
		item        AdminClient
		billingDay  *int16
		storesJSON  []byte
		modulesJSON []byte
	)
	if err := rows.Scan(
		&item.ID,
		&item.CoreTenantID,
		&item.Name,
		&item.Status,
		&item.UserCount,
		&item.UserNicks,
		&item.ProjectCount,
		&item.ProjectSegments,
		&item.BillingMode,
		&item.MonthlyPaymentAmount,
		&billingDay,
		&item.Logo,
		&item.WebhookEnabled,
		&item.WebhookKey,
		&item.ContactPhone,
		&item.ContactSite,
		&item.ContactAddress,
		&item.RequireUserStoreLink,
		&item.RequireUserRegistration,
		&storesJSON,
		&modulesJSON,
	); err != nil {
		return AdminClient{}, "", fmt.Errorf("scan admin client by id: %w", err)
	}

	item.Status = normalizeClientRecordStatus(item.Status)
	item.PaymentDueDay = formatBillingDay(billingDay)
	item.BillingMode = normalizeBillingModeValue(item.BillingMode)
	if err := json.Unmarshal(storesJSON, &item.Stores); err != nil {
		item.Stores = []AdminClientStore{}
	}
	if err := json.Unmarshal(modulesJSON, &item.Modules); err != nil {
		item.Modules = []AdminClientModule{}
	}
	item.StoresCount = len(item.Stores)

	return item, item.CoreTenantID, nil
}

func (s *Service) getAdminUserByCoreUserID(ctx context.Context, coreUserID, tenantID string, enforceTenant bool) (AdminUser, string, error) {
	args := make([]any, 0, 4)
	arg := func(value any) string {
		args = append(args, value)
		return fmt.Sprintf("$%d", len(args))
	}

	userPlaceholder := arg(strings.TrimSpace(coreUserID))
	joinClause := fmt.Sprintf(`
LEFT JOIN LATERAL (
	SELECT
		tu.id,
		tu.tenant_id,
		tu.access_level,
		tu.user_type,
		tu.business_role,
		tu.store_id,
		tu.registration_number,
		tu.status,
		tu.is_owner,
		tu.created_at
	FROM tenant_users tu
	WHERE tu.user_id = u.id
	  AND tu.status IN ('active', 'invited', 'suspended')
	ORDER BY
		CASE tu.status
			WHEN 'active' THEN 0
			WHEN 'invited' THEN 1
			ELSE 2
		END,
		%s,
		tu.created_at DESC
	LIMIT 1
) scope ON true
LEFT JOIN tenants t ON t.id = scope.tenant_id AND t.deleted_at IS NULL
LEFT JOIN tenant_stores store ON store.id = scope.store_id
%s
`, effectiveAdminMembershipOrderSQL("tu"), adminUserModuleScopeJoinClause())
	conditions := []string{
		fmt.Sprintf("u.id = %s::uuid", userPlaceholder),
		"u.deleted_at IS NULL",
	}

	if enforceTenant {
		tenantPlaceholder := arg(strings.TrimSpace(tenantID))
		joinClause = fmt.Sprintf(`
JOIN tenant_users scope ON scope.user_id = u.id
	AND scope.tenant_id = %s
	AND scope.status IN ('active', 'invited', 'suspended')
JOIN tenants t ON t.id = scope.tenant_id AND t.deleted_at IS NULL
LEFT JOIN tenant_stores store ON store.id = scope.store_id
%s
`, tenantPlaceholder, adminUserModuleScopeJoinClause())
	}

	query := fmt.Sprintf(`
SELECT
	u.id::text,
	u.is_platform_admin,
	scope.tenant_id,
	COALESCE(t.name, ''),
	u.name,
	COALESCE(u.nick, ''),
	u.email::text,
	COALESCE(u.phone, ''),
	u.status::text,
	COALESCE(u.avatar_url, ''),
	u.last_login_at,
	u.created_at,
	%s,
	%s,
	%s,
	scope.store_id::text,
	COALESCE(store.name, ''),
	COALESCE(scope.registration_number, ''),
	COALESCE(u.preferences::text, '{}'),
	COALESCE(module_scope.module_codes, '[]'::json),
	COALESCE(module_scope.atendimento_access, false)
FROM users u
%s
WHERE %s
LIMIT 1
`,
		effectiveTenantUserAccessLevelSQL("scope", "u"),
		effectiveTenantUserTypeSQL("scope", "u"),
		effectiveTenantUserBusinessRoleSQL("scope", "u"),
		joinClause,
		strings.Join(conditions, " AND "),
	)

	var (
		item            AdminUser
		scopeTenantID   *string
		storeID         *string
		lastLoginAt     *time.Time
		createdAt       time.Time
		moduleCodesJSON []byte
	)

	err := s.pool.QueryRow(ctx, query, args...).Scan(
		&item.CoreUserID,
		&item.IsPlatformAdmin,
		&scopeTenantID,
		&item.ClientName,
		&item.Name,
		&item.Nick,
		&item.Email,
		&item.Phone,
		&item.Status,
		&item.ProfileImg,
		&lastLoginAt,
		&createdAt,
		&item.Level,
		&item.UserType,
		&item.BusinessRole,
		&storeID,
		&item.StoreName,
		&item.RegistrationNumber,
		&item.Preference,
		&moduleCodesJSON,
		&item.AtendimentoAccess,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return AdminUser{}, "", ErrNotFound
		}
		return AdminUser{}, "", fmt.Errorf("get admin user by id: %w", err)
	}

	item.ID = item.CoreUserID
	item.CoreTenantID = scopeTenantID
	item.StoreID = storeID
	item.Status = normalizeUserRecordStatus(item.Status)
	item.UserType = normalizeUserType(item.UserType)
	item.BusinessRole = resolveAdminUserBusinessRole(item.BusinessRole, item.Level, item.UserType, item.IsPlatformAdmin, false)
	item.Level = resolveAccessLevelForBusinessRole(item.BusinessRole, item.Level, item.IsPlatformAdmin)
	item.RegistrationNumber = normalizeRegistrationNumber(item.RegistrationNumber)
	if err := json.Unmarshal(moduleCodesJSON, &item.ModuleCodes); err != nil {
		item.ModuleCodes = []string{}
	}
	if item.IsPlatformAdmin {
		item.Level = "admin"
		item.UserType = "admin"
		item.BusinessRole = "system_admin"
		item.StoreID = nil
		item.StoreName = ""
	}
	item.Password = "********"
	item.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	if lastLoginAt != nil {
		item.LastLogin = lastLoginAt.UTC().Format(time.RFC3339)
	}

	if scopeTenantID == nil {
		return item, "", nil
	}
	return item, *scopeTenantID, nil
}

func (s *Service) findTenantUserIDByUserID(ctx context.Context, tenantID, userID string) (string, error) {
	var tenantUserID string
	err := s.pool.QueryRow(
		ctx,
		`SELECT id
		 FROM tenant_users
		 WHERE tenant_id = $1
		   AND user_id = $2
		   AND status IN ('active', 'invited', 'suspended')
		 LIMIT 1`,
		tenantID,
		userID,
	).Scan(&tenantUserID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrNotFound
		}
		return "", fmt.Errorf("find tenant user by user id: %w", err)
	}

	return tenantUserID, nil
}

func (s *Service) resolveTargetTenantForUserMutation(ctx context.Context, claimsTenantID string, isPlatformAdmin bool, coreTenantID *string) (string, error) {
	if !isPlatformAdmin {
		tenantID := strings.TrimSpace(claimsTenantID)
		if tenantID == "" {
			return "", ErrForbidden
		}
		return tenantID, nil
	}

	if coreTenantID != nil && strings.TrimSpace(*coreTenantID) != "" {
		var tenantID string
		err := s.pool.QueryRow(
			ctx,
			`SELECT id
			 FROM tenants
			 WHERE id = $1::uuid
			   AND deleted_at IS NULL
			 LIMIT 1`,
			strings.TrimSpace(*coreTenantID),
		).Scan(&tenantID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return "", ErrNotFound
			}
			return "", fmt.Errorf("resolve target tenant by core tenant id: %w", err)
		}
		return tenantID, nil
	}

	tenantID := strings.TrimSpace(claimsTenantID)
	if tenantID == "" {
		return "", ErrInvalidInput
	}
	return tenantID, nil
}

func hasAssignedAdminTenant(coreTenantID *string) bool {
	return coreTenantID != nil && strings.TrimSpace(*coreTenantID) != ""
}

func shouldCreateAdminUserTenantMembership(actorIsPlatformAdmin, targetIsPlatformAdmin bool, coreTenantID *string) bool {
	if targetIsPlatformAdmin {
		return true
	}
	if !actorIsPlatformAdmin {
		return true
	}
	return hasAssignedAdminTenant(coreTenantID)
}

func resolveCreatedAdminUserStatus(shouldCreateTenantMembership bool) string {
	if shouldCreateTenantMembership {
		return "active"
	}
	return "inactive"
}

func canActivateManagedAdminUser(current AdminUser, scopeTenantID string) bool {
	if current.IsPlatformAdmin {
		return true
	}
	if strings.TrimSpace(scopeTenantID) == "" {
		return false
	}
	return hasAssignedAdminTenant(current.CoreTenantID)
}

func (s *Service) generateUniqueTenantSlug(ctx context.Context, name string) (string, error) {
	base := slugify(name)
	if base == "" {
		base = fmt.Sprintf("cliente-%d", time.Now().Unix())
	}

	for attempt := 0; attempt < 24; attempt++ {
		candidate := base
		if attempt > 0 {
			candidate = fmt.Sprintf("%s-%d", base, attempt+1)
		}

		var exists bool
		if err := s.pool.QueryRow(
			ctx,
			`SELECT EXISTS(SELECT 1 FROM tenants WHERE slug = $1)`,
			candidate,
		).Scan(&exists); err != nil {
			return "", fmt.Errorf("check tenant slug collision: %w", err)
		}
		if !exists {
			return candidate, nil
		}
	}

	return "", ErrInvalidInput
}

func normalizePageAndLimit(page, limit, defaultLimit, maxLimit int) (int, int) {
	if page <= 0 {
		page = 1
	}
	if limit <= 0 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}
	return page, limit
}

func normalizeClientFilterStatus(raw string) string {
	switch strings.TrimSpace(strings.ToLower(raw)) {
	case "active":
		return "active"
	case "inactive":
		return "inactive"
	default:
		return ""
	}
}

func normalizeClientRecordStatus(raw string) string {
	switch strings.TrimSpace(strings.ToLower(raw)) {
	case "active", "trialing":
		return "active"
	default:
		return "inactive"
	}
}

func mapClientStatusToTenantStatus(raw string) string {
	switch strings.TrimSpace(strings.ToLower(raw)) {
	case "active":
		return "active"
	case "inactive":
		return "suspended"
	default:
		return ""
	}
}

func normalizeBillingModeValue(raw string) string {
	switch strings.TrimSpace(strings.ToLower(raw)) {
	case "per_store":
		return "per_store"
	default:
		return "single"
	}
}

func normalizeAccessLevel(raw string) string {
	switch strings.TrimSpace(strings.ToLower(raw)) {
	case "admin":
		return "admin"
	case "consultant":
		return "consultant"
	case "manager":
		return "manager"
	case "finance":
		return "finance"
	case "viewer":
		return "viewer"
	default:
		return "marketing"
	}
}

func normalizeUserType(raw string) string {
	switch strings.TrimSpace(strings.ToLower(raw)) {
	case "admin":
		return "admin"
	default:
		return "client"
	}
}

func normalizeUserRecordStatus(raw string) string {
	switch strings.TrimSpace(strings.ToLower(raw)) {
	case "active":
		return "active"
	default:
		return "inactive"
	}
}

func mapUserStatusToDB(raw string) string {
	switch normalizeUserRecordStatus(raw) {
	case "active":
		return "active"
	default:
		return "inactive"
	}
}

func normalizeBillingDay(value any) int16 {
	day := intValue(value)
	if day < 1 || day > 31 {
		return 0
	}
	return int16(day)
}

func normalizeListValues(value any) []string {
	parts := strings.FieldsFunc(stringValue(value), func(r rune) bool {
		return r == ',' || r == ';' || r == '|' || r == '\n' || r == '\r'
	})
	seen := make(map[string]bool, len(parts))
	output := make([]string, 0, len(parts))
	for _, part := range parts {
		item := strings.TrimSpace(part)
		if item == "" {
			continue
		}
		key := strings.ToLower(item)
		if seen[key] {
			continue
		}
		seen[key] = true
		output = append(output, item)
		if len(output) >= 30 {
			break
		}
	}
	return output
}

func normalizeStoreInputs(stores []AdminClientStoreInput) []AdminClientStoreInput {
	seen := make(map[string]bool, len(stores))
	output := make([]AdminClientStoreInput, 0, len(stores))
	for _, store := range stores {
		name := strings.TrimSpace(store.Name)
		if name == "" {
			continue
		}
		key := strings.ToLower(name)
		if seen[key] {
			continue
		}
		seen[key] = true
		amount := store.Amount
		if amount < 0 {
			amount = 0
		}
		output = append(output, AdminClientStoreInput{
			ID:     strings.TrimSpace(store.ID),
			Name:   trimText(name, 120),
			Amount: amount,
		})
		if len(output) >= 60 {
			break
		}
	}
	return output
}

func normalizeAdminStoreCode(value string) string {
	trimmed := strings.ToUpper(strings.TrimSpace(value))
	if trimmed == "" {
		return ""
	}

	var builder strings.Builder
	lastDash := false
	for _, char := range trimmed {
		isLetter := char >= 'A' && char <= 'Z'
		isNumber := char >= '0' && char <= '9'
		if isLetter || isNumber {
			builder.WriteRune(char)
			lastDash = false
			continue
		}
		if !lastDash {
			builder.WriteByte('-')
			lastDash = true
		}
	}

	return trimText(strings.Trim(builder.String(), "-"), 40)
}

func buildAdminStoreCode(name string, used map[string]bool) string {
	base := normalizeAdminStoreCode(name)
	if base == "" {
		base = "STORE"
	}

	if !used[base] {
		return base
	}

	for suffix := 2; suffix <= 999; suffix++ {
		candidate := trimText(fmt.Sprintf("%s-%d", base, suffix), 40)
		if candidate == "" {
			continue
		}
		if !used[candidate] {
			return candidate
		}
	}

	return trimText(fmt.Sprintf("%s-%d", base, time.Now().UTC().Unix()%1000), 40)
}

func normalizeModuleCodesInput(value any) []string {
	seen := make(map[string]bool)
	output := make([]string, 0, 8)

	add := func(raw string) {
		code := strings.TrimSpace(strings.ToLower(raw))
		if code == "" {
			return
		}
		code = strings.ReplaceAll(code, " ", "_")
		if seen[code] {
			return
		}
		seen[code] = true
		output = append(output, code)
	}

	extractCode := func(item any) string {
		switch typed := item.(type) {
		case map[string]any:
			if raw, ok := typed["code"]; ok {
				return stringValue(raw)
			}
			if raw, ok := typed["value"]; ok {
				return stringValue(raw)
			}
			if raw, ok := typed["id"]; ok {
				return stringValue(raw)
			}
		case map[string]string:
			if raw, ok := typed["code"]; ok {
				return raw
			}
			if raw, ok := typed["value"]; ok {
				return raw
			}
			if raw, ok := typed["id"]; ok {
				return raw
			}
		}

		return stringValue(item)
	}

	switch typed := value.(type) {
	case []string:
		for _, item := range typed {
			add(item)
		}
	case []any:
		for _, item := range typed {
			add(extractCode(item))
		}
	default:
		raw := stringValue(value)
		parts := strings.FieldsFunc(raw, func(r rune) bool {
			return r == ',' || r == ';' || r == '|' || r == '\n' || r == '\r'
		})
		for _, part := range parts {
			add(part)
		}
	}

	add("core_panel")

	if len(output) > 24 {
		return output[:24]
	}

	return output
}

func (s *Service) replaceTenantModuleSet(ctx context.Context, tenantID string, moduleCodes []string) error {
	if strings.TrimSpace(tenantID) == "" {
		return ErrInvalidInput
	}

	codes := normalizeModuleCodesInput(moduleCodes)
	if len(codes) == 0 {
		codes = []string{"core_panel"}
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin replace tenant modules tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	rows, err := tx.Query(
		ctx,
		`SELECT id, code
		 FROM modules
		 WHERE is_active = true`,
	)
	if err != nil {
		return fmt.Errorf("list active modules for tenant module replacement: %w", err)
	}
	defer rows.Close()

	type activeModule struct {
		ID   string
		Code string
	}
	activeModules := make([]activeModule, 0)
	for rows.Next() {
		var item activeModule
		if scanErr := rows.Scan(&item.ID, &item.Code); scanErr != nil {
			return fmt.Errorf("scan active module for tenant module replacement: %w", scanErr)
		}
		activeModules = append(activeModules, item)
	}
	if rows.Err() != nil {
		return fmt.Errorf("iterate active modules for tenant module replacement: %w", rows.Err())
	}

	selected := make(map[string]bool, len(codes))
	for _, code := range codes {
		normalized := strings.TrimSpace(strings.ToLower(code))
		if normalized == "" {
			continue
		}
		selected[normalized] = true
	}
	selected["core_panel"] = true

	for _, module := range activeModules {
		status := "inactive"
		deactivatedAt := "now()"
		if selected[strings.TrimSpace(strings.ToLower(module.Code))] {
			status = "active"
			deactivatedAt = "NULL"
		}

		query := fmt.Sprintf(
			`INSERT INTO tenant_modules (tenant_id, module_id, status, source, activated_at, deactivated_at, metadata)
			 VALUES ($1, $2, $3::tenant_module_status, 'custom', now(), %s, '{}'::jsonb)
			 ON CONFLICT (tenant_id, module_id)
			 DO UPDATE SET
			   status = EXCLUDED.status,
			   source = EXCLUDED.source,
			   activated_at = CASE WHEN EXCLUDED.status = 'active' THEN now() ELSE tenant_modules.activated_at END,
			   deactivated_at = CASE WHEN EXCLUDED.status = 'active' THEN NULL ELSE now() END,
			   updated_at = now()`,
			deactivatedAt,
		)
		if _, execErr := tx.Exec(ctx, query, tenantID, module.ID, status); execErr != nil {
			return fmt.Errorf("upsert tenant module status in replacement: %w", execErr)
		}
	}

	if _, err := tx.Exec(
		ctx,
		`UPDATE tenant_user_modules tum
		 SET status = 'inactive',
		     revoked_at = COALESCE(tum.revoked_at, now()),
		     updated_at = now()
		 FROM tenant_users tu
		 JOIN tenant_modules tm
		   ON tm.tenant_id = tu.tenant_id
		 WHERE tum.tenant_user_id = tu.id
		   AND tm.module_id = tum.module_id
		   AND tu.tenant_id = $1
		   AND tm.status <> 'active'
		   AND tum.status = 'active'`,
		tenantID,
	); err != nil {
		return fmt.Errorf("deactivate tenant user module assignments after module replacement: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit replace tenant modules tx: %w", err)
	}

	return nil
}

func normalizePreferencesJSON(value any) string {
	raw := strings.TrimSpace(stringValue(value))
	if raw == "" {
		return "{}"
	}

	var parsed any
	if json.Unmarshal([]byte(raw), &parsed) == nil {
		normalized, err := json.Marshal(parsed)
		if err == nil && len(normalized) > 0 {
			return string(normalized)
		}
	}

	wrapped, _ := json.Marshal(map[string]string{"raw": raw})
	if len(wrapped) == 0 {
		return "{}"
	}
	return string(wrapped)
}

func normalizeSiteValue(value any) string {
	raw := trimText(value, 255)
	if raw == "" {
		return ""
	}
	normalized := strings.ToLower(raw)
	if strings.HasPrefix(normalized, "http://") || strings.HasPrefix(normalized, "https://") {
		return raw
	}
	return "https://" + strings.TrimLeft(raw, "/")
}

func parseTimestamp(value any) *time.Time {
	raw := strings.TrimSpace(stringValue(value))
	if raw == "" {
		return nil
	}
	parsed, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return nil
	}
	return &parsed
}

func formatBillingDay(day *int16) string {
	if day == nil || *day <= 0 {
		return ""
	}
	return fmt.Sprintf("%02d", *day)
}

func slugify(value string) string {
	normalized := strings.ToLower(strings.TrimSpace(value))
	normalized = slugInvalidCharsPattern.ReplaceAllString(normalized, "-")
	normalized = strings.Trim(normalized, "-")
	if len(normalized) > 70 {
		normalized = strings.Trim(normalized[:70], "-")
	}
	return normalized
}

func generateWebhookKey() (string, error) {
	buffer := make([]byte, 12)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return "whk_" + hex.EncodeToString(buffer), nil
}

func stringValue(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	default:
		return fmt.Sprint(value)
	}
}

func trimText(value any, max int) string {
	text := strings.TrimSpace(stringValue(value))
	if max <= 0 {
		return text
	}
	if len(text) <= max {
		return text
	}
	return text[:max]
}

func intValue(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int8:
		return int(typed)
	case int16:
		return int(typed)
	case int32:
		return int(typed)
	case int64:
		return int(typed)
	case float32:
		return int(typed)
	case float64:
		return int(typed)
	case json.Number:
		parsed, err := typed.Int64()
		if err == nil {
			return int(parsed)
		}
		floatParsed, err := typed.Float64()
		if err == nil {
			return int(floatParsed)
		}
	case string:
		parsed, err := strconv.Atoi(strings.TrimSpace(typed))
		if err == nil {
			return parsed
		}
	}
	return 0
}

func numericValue(value any) float64 {
	switch typed := value.(type) {
	case float64:
		return typed
	case float32:
		return float64(typed)
	case int:
		return float64(typed)
	case int32:
		return float64(typed)
	case int64:
		return float64(typed)
	case json.Number:
		parsed, err := typed.Float64()
		if err == nil {
			return parsed
		}
	case string:
		raw := strings.TrimSpace(typed)
		if raw == "" {
			return 0
		}
		raw = strings.ReplaceAll(raw, "R$", "")
		raw = strings.ReplaceAll(raw, " ", "")
		raw = strings.ReplaceAll(raw, ".", "")
		raw = strings.ReplaceAll(raw, ",", ".")
		parsed, err := strconv.ParseFloat(raw, 64)
		if err == nil {
			return parsed
		}
	}
	return 0
}

func boolValue(value any) bool {
	switch typed := value.(type) {
	case bool:
		return typed
	case int:
		return typed > 0
	case float64:
		return typed > 0
	case string:
		raw := strings.TrimSpace(strings.ToLower(typed))
		return raw == "1" || raw == "true" || raw == "on" || raw == "yes" || raw == "sim"
	default:
		return false
	}
}
