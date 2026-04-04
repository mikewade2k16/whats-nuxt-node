package finance

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

// ---- Sheets ----

// ListSheets returns lightweight sheet items with SQL-computed summaries.
// Does NOT load individual lines — avoids multi-MB payloads on large lists.
func (s *Service) ListSheets(ctx context.Context, input ListSheetsInput) ([]SheetListItem, int, error) {
	input.Page, input.Limit = normalizePageAndLimit(input.Page, input.Limit)

	args := make([]any, 0, 8)
	arg := func(v any) string {
		args = append(args, v)
		return fmt.Sprintf("$%d", len(args))
	}

	var conditions []string

	if !input.IsPlatformAdmin {
		conditions = append(conditions, fmt.Sprintf("fs.tenant_id = %s", arg(strings.TrimSpace(input.TenantID))))
	} else if input.ClientID > 0 {
		conditions = append(conditions, fmt.Sprintf("t.legacy_id = %s", arg(input.ClientID)))
	}

	if p := normalizePeriod(input.Period); p != "" {
		conditions = append(conditions, fmt.Sprintf("fs.period = %s", arg(p)))
	}

	if q := strings.TrimSpace(input.Query); q != "" {
		like := "%" + q + "%"
		conditions = append(conditions, fmt.Sprintf("(fs.title ILIKE %s OR fs.period ILIKE %s)", arg(like), arg(like)))
	}

	whereClause := "1=1"
	if len(conditions) > 0 {
		whereClause = strings.Join(conditions, " AND ")
	}

	// Count
	var total int
	countSQL := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM finance_sheets fs
		JOIN tenants t ON t.id = fs.tenant_id
		WHERE %s
	`, whereClause)
	if err := s.pool.QueryRow(ctx, countSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	offset := (input.Page - 1) * input.Limit

	// Summary computed via SQL aggregation — no line loading
	listSQL := fmt.Sprintf(`
		SELECT
			fs.id::text,
			fs.title,
			fs.period,
			fs.status,
			fs.notes,
			t.legacy_id  AS client_id,
			t.name        AS client_name,
			fs.created_at,
			fs.updated_at,
			COALESCE(s.expected_in, 0),
			COALESCE(s.effective_in, 0),
			COALESCE(s.expected_out, 0),
			COALESCE(s.effective_out, 0)
		FROM finance_sheets fs
		JOIN tenants t ON t.id = fs.tenant_id
		LEFT JOIN LATERAL (
			SELECT
				SUM(CASE WHEN fl.kind = 'entrada' THEN fl.amount + COALESCE(adj.adj_sum, 0) ELSE 0 END) AS expected_in,
				SUM(CASE WHEN fl.kind = 'entrada' AND fl.effective THEN fl.amount + COALESCE(adj.adj_sum, 0) ELSE 0 END) AS effective_in,
				SUM(CASE WHEN fl.kind = 'saida' THEN fl.amount + COALESCE(adj.adj_sum, 0) ELSE 0 END) AS expected_out,
				SUM(CASE WHEN fl.kind = 'saida' AND fl.effective THEN fl.amount + COALESCE(adj.adj_sum, 0) ELSE 0 END) AS effective_out
			FROM finance_lines fl
			LEFT JOIN LATERAL (
				SELECT COALESCE(SUM(fla.amount), 0) AS adj_sum
				FROM finance_line_adjustments fla
				WHERE fla.line_id = fl.id
			) adj ON true
			WHERE fl.sheet_id = fs.id
		) s ON true
		WHERE %s
		ORDER BY fs.period DESC, fs.created_at DESC
		LIMIT %s OFFSET %s
	`, whereClause, arg(input.Limit), arg(offset))

	rows, err := s.pool.Query(ctx, listSQL, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	items := make([]SheetListItem, 0, input.Limit)
	for rows.Next() {
		var item SheetListItem
		if err := rows.Scan(
			&item.ID, &item.Title, &item.Period, &item.Status, &item.Notes,
			&item.ClientID, &item.ClientName, &item.CreatedAt, &item.UpdatedAt,
			&item.Summary.ExpectedIn, &item.Summary.EffectiveIn,
			&item.Summary.ExpectedOut, &item.Summary.EffectiveOut,
		); err != nil {
			return nil, 0, err
		}
		item.Summary.ExpectedBalance = item.Summary.ExpectedIn - item.Summary.ExpectedOut
		item.Summary.EffectiveBalance = item.Summary.EffectiveIn - item.Summary.EffectiveOut
		item.Preview = buildPreview(item.Period, item.Summary)
		items = append(items, item)
	}
	if rows.Err() != nil {
		return nil, 0, rows.Err()
	}

	if items == nil {
		items = []SheetListItem{}
	}

	return items, total, nil
}

// GetSheet returns a single sheet with full lines and adjustments.
func (s *Service) GetSheet(ctx context.Context, input GetSheetInput) (*SheetDetail, error) {
	var detail SheetDetail
	sheetID := normalizeUUID(input.SheetID)
	if sheetID == "" {
		return nil, ErrInvalidInput
	}

	err := s.pool.QueryRow(ctx, `
		SELECT fs.id::text, fs.title, fs.period, fs.status, fs.notes,
		       t.legacy_id, t.name, fs.created_at, fs.updated_at
		FROM finance_sheets fs
		JOIN tenants t ON t.id = fs.tenant_id
		WHERE fs.id = $1::uuid
	`, sheetID).Scan(
		&detail.ID, &detail.Title, &detail.Period, &detail.Status, &detail.Notes,
		&detail.ClientID, &detail.ClientName, &detail.CreatedAt, &detail.UpdatedAt,
	)
	if err != nil {
		return nil, ErrNotFound
	}

	// Access control
	if !input.IsPlatformAdmin {
		var ownerTenantUUID string
		_ = s.pool.QueryRow(ctx, `SELECT tenant_id FROM finance_sheets WHERE id = $1::uuid`, detail.ID).Scan(&ownerTenantUUID)
		if strings.TrimSpace(input.TenantID) != ownerTenantUUID {
			return nil, ErrForbidden
		}
	}

	lines, err := s.loadLinesBySheetUUIDs(ctx, []string{detail.ID})
	if err != nil {
		return nil, err
	}

	allLines := lines[detail.ID]
	detail.Entradas = filterLinesByKind(allLines, "entrada")
	detail.Saidas = filterLinesByKind(allLines, "saida")
	detail.Summary = computeSummary(detail.Entradas, detail.Saidas)
	detail.Preview = buildPreview(detail.Period, detail.Summary)

	return &detail, nil
}

func (s *Service) CreateSheet(ctx context.Context, input CreateSheetInput) (*SheetDetail, error) {
	tenantUUID, clientLegacyID, clientName, err := s.resolveFinanceTenant(ctx, input.TenantID, input.IsPlatformAdmin, input.ClientID)
	if err != nil {
		return nil, err
	}
	if err := validateSheetCollections(input.Entradas, input.Saidas); err != nil {
		return nil, err
	}

	if input.Entradas == nil {
		input.Entradas = []LineInput{}
	}
	if input.Saidas == nil {
		input.Saidas = []LineInput{}
	}
	if err := s.sanitizeSheetFixedAccountRefs(ctx, tenantUUID, input.Entradas, input.Saidas); err != nil {
		return nil, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var sheetUUID string
	var createdAt, updatedAt time.Time

	err = tx.QueryRow(ctx, `
		INSERT INTO finance_sheets (tenant_id, title, period, status, notes)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at, updated_at
	`,
		tenantUUID,
		normalizeText(input.Title, 200),
		normalizePeriod(input.Period),
		normalizeStatus(input.Status),
		normalizeText(input.Notes, 2000),
	).Scan(&sheetUUID, &createdAt, &updatedAt)
	if err != nil {
		return nil, err
	}

	if err := insertLines(ctx, tx, sheetUUID, input.Entradas, "entrada"); err != nil {
		return nil, err
	}
	if err := insertLines(ctx, tx, sheetUUID, input.Saidas, "saida"); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return s.loadSheetDetail(ctx, sheetUUID, clientLegacyID, clientName, createdAt, updatedAt)
}

func (s *Service) ReplaceSheet(ctx context.Context, input ReplaceSheetInput) (*SheetDetail, error) {
	sheetUUID := normalizeUUID(input.SheetID)
	if sheetUUID == "" {
		return nil, ErrInvalidInput
	}
	if err := validateSheetCollections(input.Entradas, input.Saidas); err != nil {
		return nil, err
	}

	var ownerTenantUUID string
	var ownerLegacyID int
	var ownerName string

	err := s.pool.QueryRow(ctx, `
		SELECT fs.tenant_id, t.legacy_id, t.name
		FROM finance_sheets fs
		JOIN tenants t ON t.id = fs.tenant_id
		WHERE fs.id = $1::uuid
	`, sheetUUID).Scan(&ownerTenantUUID, &ownerLegacyID, &ownerName)
	if err != nil {
		return nil, ErrNotFound
	}

	if !input.IsPlatformAdmin && strings.TrimSpace(input.TenantID) != ownerTenantUUID {
		return nil, ErrForbidden
	}
	if input.Entradas == nil {
		input.Entradas = []LineInput{}
	}
	if input.Saidas == nil {
		input.Saidas = []LineInput{}
	}
	if err := s.sanitizeSheetFixedAccountRefs(ctx, ownerTenantUUID, input.Entradas, input.Saidas); err != nil {
		return nil, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var updatedAt time.Time
	err = tx.QueryRow(ctx, `
		UPDATE finance_sheets
		SET title = $1,
		    period = $2,
		    status = $3,
		    notes = $4,
		    updated_at = now()
		WHERE id = $5::uuid
		RETURNING updated_at
	`,
		normalizeText(input.Title, 200),
		normalizePeriod(input.Period),
		normalizeStatus(input.Status),
		normalizeText(input.Notes, 2000),
		sheetUUID,
	).Scan(&updatedAt)
	if err != nil {
		return nil, err
	}

	if _, err := tx.Exec(ctx, `DELETE FROM finance_lines WHERE sheet_id = $1::uuid`, sheetUUID); err != nil {
		return nil, err
	}
	if err := insertLines(ctx, tx, sheetUUID, input.Entradas, "entrada"); err != nil {
		return nil, err
	}
	if err := insertLines(ctx, tx, sheetUUID, input.Saidas, "saida"); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	var createdAt time.Time
	_ = s.pool.QueryRow(ctx, `SELECT created_at FROM finance_sheets WHERE id = $1::uuid`, sheetUUID).Scan(&createdAt)

	return s.loadSheetDetail(ctx, sheetUUID, ownerLegacyID, ownerName, createdAt, updatedAt)
}

func (s *Service) PatchLine(ctx context.Context, input PatchLineInput) (*LineMutationResult, error) {
	sheetUUID := normalizeUUID(input.SheetID)
	lineUUID := normalizeUUID(input.LineID)
	if sheetUUID == "" || lineUUID == "" {
		return nil, ErrInvalidInput
	}
	if input.Effective == nil && input.EffectiveDate == nil {
		return nil, ErrInvalidInput
	}

	var ownerTenantUUID string
	var period string
	var currentEffective bool
	var currentEffectiveDate string

	err := s.pool.QueryRow(ctx, `
		SELECT fs.tenant_id, fs.period, fl.effective, fl.effective_date
		FROM finance_sheets fs
		JOIN finance_lines fl ON fl.sheet_id = fs.id
		WHERE fs.id = $1::uuid
		  AND fl.id = $2::uuid
	`, sheetUUID, lineUUID).Scan(
		&ownerTenantUUID,
		&period,
		&currentEffective,
		&currentEffectiveDate,
	)
	if err != nil {
		return nil, ErrNotFound
	}

	if !input.IsPlatformAdmin && strings.TrimSpace(input.TenantID) != ownerTenantUUID {
		return nil, ErrForbidden
	}

	nextEffective := currentEffective
	if input.Effective != nil {
		nextEffective = *input.Effective
	}

	nextEffectiveDate := normalizeDate(currentEffectiveDate)
	if input.EffectiveDate != nil {
		nextEffectiveDate = normalizeDate(*input.EffectiveDate)
	}
	if !nextEffective {
		nextEffectiveDate = ""
	} else if nextEffectiveDate == "" {
		nextEffectiveDate = dateInBrazil(time.Now())
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	result, err := tx.Exec(ctx, `
		UPDATE finance_lines
		SET effective = $1,
		    effective_date = $2
		WHERE id = $3::uuid
		  AND sheet_id = $4::uuid
	`, nextEffective, nextEffectiveDate, lineUUID, sheetUUID)
	if err != nil {
		return nil, err
	}
	if result.RowsAffected() == 0 {
		return nil, ErrNotFound
	}

	var updatedAt time.Time
	if err := tx.QueryRow(ctx, `
		UPDATE finance_sheets
		SET updated_at = now()
		WHERE id = $1::uuid
		RETURNING updated_at
	`, sheetUUID).Scan(&updatedAt); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	line, err := s.loadLine(ctx, sheetUUID, lineUUID)
	if err != nil {
		return nil, err
	}

	summary, err := s.loadSheetSummary(ctx, sheetUUID)
	if err != nil {
		return nil, err
	}

	return &LineMutationResult{
		SheetID:   sheetUUID,
		LineID:    lineUUID,
		Line:      *line,
		Summary:   summary,
		Preview:   buildPreview(period, summary),
		UpdatedAt: updatedAt,
	}, nil
}

func (s *Service) DeleteSheet(ctx context.Context, input DeleteSheetInput) error {
	sheetUUID := normalizeUUID(input.SheetID)
	if sheetUUID == "" {
		return ErrInvalidInput
	}

	var ownerTenantUUID string
	err := s.pool.QueryRow(ctx, `
		SELECT tenant_id FROM finance_sheets WHERE id = $1::uuid
	`, sheetUUID).Scan(&ownerTenantUUID)
	if err != nil {
		return ErrNotFound
	}

	if !input.IsPlatformAdmin && strings.TrimSpace(input.TenantID) != ownerTenantUUID {
		return ErrForbidden
	}

	result, err := s.pool.Exec(ctx, `DELETE FROM finance_sheets WHERE id = $1::uuid`, sheetUUID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ---- Config ----

func (s *Service) GetConfig(ctx context.Context, input GetConfigInput) (*Config, error) {
	tenantUUID, clientLegacyID, err := s.resolveFinanceTenantUUID(ctx, input.TenantID, input.IsPlatformAdmin, input.ClientID)
	if err != nil {
		return nil, err
	}

	configUUID, err := s.ensureConfig(ctx, tenantUUID)
	if err != nil {
		return nil, err
	}

	return s.loadConfig(ctx, configUUID, clientLegacyID)
}

func (s *Service) ReplaceConfig(ctx context.Context, input ReplaceConfigInput) (*Config, error) {
	tenantUUID, clientLegacyID, err := s.resolveFinanceTenantUUID(ctx, input.TenantID, input.IsPlatformAdmin, input.ClientID)
	if err != nil {
		return nil, err
	}
	if input.Categories == nil {
		input.Categories = []CategoryInput{}
	}
	if input.FixedAccounts == nil {
		input.FixedAccounts = []FixedAccountInput{}
	}
	if input.RecurringEntries == nil {
		input.RecurringEntries = []RecurringEntryInput{}
	}
	if err := validateConfigCollections(input.Categories, input.FixedAccounts, input.RecurringEntries); err != nil {
		return nil, err
	}

	configUUID, err := s.ensureConfig(ctx, tenantUUID)
	if err != nil {
		return nil, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := replaceFinanceCategories(ctx, tx, configUUID, input.Categories); err != nil {
		return nil, err
	}
	if err := replaceFinanceFixedAccounts(ctx, tx, configUUID, input.FixedAccounts); err != nil {
		return nil, err
	}
	if err := replaceFinanceRecurringEntries(ctx, tx, configUUID, input.RecurringEntries); err != nil {
		return nil, err
	}

	if _, err := tx.Exec(ctx, `UPDATE finance_configs SET updated_at = now() WHERE id = $1`, configUUID); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return s.loadConfig(ctx, configUUID, clientLegacyID)
}

// ---- Internal helpers ----

func (s *Service) resolveFinanceTenant(ctx context.Context, jwtTenantID string, isPlatformAdmin bool, clientLegacyID int) (string, int, string, error) {
	if isPlatformAdmin && clientLegacyID > 0 {
		var uuid, name string
		var legacyID int
		err := s.pool.QueryRow(ctx, `
			SELECT id, legacy_id, name FROM tenants WHERE legacy_id = $1 AND deleted_at IS NULL LIMIT 1
		`, clientLegacyID).Scan(&uuid, &legacyID, &name)
		if err != nil {
			return "", 0, "", ErrNotFound
		}
		return uuid, legacyID, name, nil
	}

	tenantID := strings.TrimSpace(jwtTenantID)
	if tenantID == "" {
		return "", 0, "", ErrInvalidInput
	}
	var legacyID int
	var name string
	err := s.pool.QueryRow(ctx, `
		SELECT legacy_id, name FROM tenants WHERE id = $1 AND deleted_at IS NULL LIMIT 1
	`, tenantID).Scan(&legacyID, &name)
	if err != nil {
		return "", 0, "", ErrNotFound
	}
	return tenantID, legacyID, name, nil
}

func (s *Service) resolveFinanceTenantUUID(ctx context.Context, jwtTenantID string, isPlatformAdmin bool, clientLegacyID int) (string, int, error) {
	uuid, legacyID, _, err := s.resolveFinanceTenant(ctx, jwtTenantID, isPlatformAdmin, clientLegacyID)
	return uuid, legacyID, err
}

func (s *Service) ensureConfig(ctx context.Context, tenantUUID string) (string, error) {
	if _, err := s.pool.Exec(ctx, `
		INSERT INTO finance_configs (tenant_id) VALUES ($1)
		ON CONFLICT (tenant_id) DO NOTHING
	`, tenantUUID); err != nil {
		return "", err
	}

	var configUUID string
	err := s.pool.QueryRow(ctx, `SELECT id FROM finance_configs WHERE tenant_id = $1`, tenantUUID).Scan(&configUUID)
	if err != nil {
		return "", err
	}
	return configUUID, nil
}

func (s *Service) loadConfig(ctx context.Context, configUUID string, clientLegacyID int) (*Config, error) {
	var updatedAt time.Time
	if err := s.pool.QueryRow(ctx, `SELECT updated_at FROM finance_configs WHERE id = $1`, configUUID).Scan(&updatedAt); err != nil {
		return nil, err
	}

	// Categories
	catRows, err := s.pool.Query(ctx, `
		SELECT id, name, kind, description
		FROM finance_categories
		WHERE config_id = $1
		ORDER BY position, name
	`, configUUID)
	if err != nil {
		return nil, err
	}
	defer catRows.Close()

	categories := []Category{}
	for catRows.Next() {
		var c Category
		if err := catRows.Scan(&c.ID, &c.Name, &c.Kind, &c.Description); err != nil {
			return nil, err
		}
		categories = append(categories, c)
	}
	if catRows.Err() != nil {
		return nil, catRows.Err()
	}

	// Fixed accounts with members (single query via JSON_AGG)
	faRows, err := s.pool.Query(ctx, `
		SELECT
			fa.id,
			fa.name,
			fa.kind,
			COALESCE(fa.category_id::text, '') AS category_id,
			fa.default_amount,
			fa.notes,
			COALESCE(
				JSON_AGG(
					JSON_BUILD_OBJECT(
						'id',     fam.id::text,
						'name',   fam.name,
						'amount', fam.amount
					) ORDER BY fam.position
				) FILTER (WHERE fam.id IS NOT NULL),
				'[]'::json
			) AS members
		FROM finance_fixed_accounts fa
		LEFT JOIN finance_fixed_account_members fam ON fam.fixed_account_id = fa.id
		WHERE fa.config_id = $1
		GROUP BY fa.id, fa.name, fa.kind, fa.category_id, fa.default_amount, fa.notes, fa.position
		ORDER BY fa.position, fa.name
	`, configUUID)
	if err != nil {
		return nil, err
	}
	defer faRows.Close()

	fixedAccounts := []FixedAccount{}
	for faRows.Next() {
		var fa FixedAccount
		var membersJSON json.RawMessage
		if err := faRows.Scan(
			&fa.ID, &fa.Name, &fa.Kind, &fa.CategoryID,
			&fa.DefaultAmount, &fa.Notes, &membersJSON,
		); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(membersJSON, &fa.Members); err != nil {
			fa.Members = []FixedAccountMember{}
		}
		if fa.Members == nil {
			fa.Members = []FixedAccountMember{}
		}
		fixedAccounts = append(fixedAccounts, fa)
	}
	if faRows.Err() != nil {
		return nil, faRows.Err()
	}

	// Recurring entries
	reRows, err := s.pool.Query(ctx, `
		SELECT t.legacy_id, fre.adjustment_amount, fre.notes
		FROM finance_recurring_entries fre
		JOIN tenants t ON t.id = fre.source_tenant_id
		WHERE fre.config_id = $1
		ORDER BY t.legacy_id
	`, configUUID)
	if err != nil {
		return nil, err
	}
	defer reRows.Close()

	recurringEntries := []RecurringEntry{}
	for reRows.Next() {
		var re RecurringEntry
		if err := reRows.Scan(&re.SourceClientID, &re.AdjustmentAmount, &re.Notes); err != nil {
			return nil, err
		}
		recurringEntries = append(recurringEntries, re)
	}
	if reRows.Err() != nil {
		return nil, reRows.Err()
	}

	return &Config{
		ClientID:         clientLegacyID,
		Categories:       categories,
		FixedAccounts:    fixedAccounts,
		RecurringEntries: recurringEntries,
		UpdatedAt:        updatedAt.Format(time.RFC3339),
	}, nil
}

func (s *Service) loadSheetSummary(ctx context.Context, sheetUUID string) (SheetSummary, error) {
	var summary SheetSummary

	err := s.pool.QueryRow(ctx, `
		SELECT
			COALESCE(SUM(CASE WHEN fl.kind = 'entrada' THEN fl.amount + COALESCE(adj.adj_sum, 0) ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN fl.kind = 'entrada' AND fl.effective THEN fl.amount + COALESCE(adj.adj_sum, 0) ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN fl.kind = 'saida' THEN fl.amount + COALESCE(adj.adj_sum, 0) ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN fl.kind = 'saida' AND fl.effective THEN fl.amount + COALESCE(adj.adj_sum, 0) ELSE 0 END), 0)
		FROM finance_lines fl
		LEFT JOIN LATERAL (
			SELECT COALESCE(SUM(fla.amount), 0) AS adj_sum
			FROM finance_line_adjustments fla
			WHERE fla.line_id = fl.id
		) adj ON true
		WHERE fl.sheet_id = $1::uuid
	`, sheetUUID).Scan(
		&summary.ExpectedIn,
		&summary.EffectiveIn,
		&summary.ExpectedOut,
		&summary.EffectiveOut,
	)
	if err != nil {
		return SheetSummary{}, err
	}

	summary.ExpectedBalance = summary.ExpectedIn - summary.ExpectedOut
	summary.EffectiveBalance = summary.EffectiveIn - summary.EffectiveOut
	return summary, nil
}

func (s *Service) loadLine(ctx context.Context, sheetUUID, lineUUID string) (*Line, error) {
	var line Line
	var adjustmentsJSON json.RawMessage
	var effectiveDate string

	err := s.pool.QueryRow(ctx, `
		SELECT
			fl.id::text,
			fl.kind,
			fl.description,
			fl.category,
			fl.effective,
			fl.effective_date,
			fl.amount,
			COALESCE(fl.fixed_account_id::text, '') AS fixed_account_id,
			fl.details,
			COALESCE(
				JSON_AGG(
					JSON_BUILD_OBJECT(
						'id',     fla.id::text,
						'amount', fla.amount,
						'note',   fla.note,
						'date',   fla.date
					) ORDER BY fla.position
				) FILTER (WHERE fla.id IS NOT NULL),
				'[]'::json
			) AS adjustments
		FROM finance_lines fl
		LEFT JOIN finance_line_adjustments fla ON fla.line_id = fl.id
		WHERE fl.sheet_id = $1::uuid
		  AND fl.id = $2::uuid
		GROUP BY fl.id, fl.kind, fl.description, fl.category, fl.effective,
		         fl.effective_date, fl.amount, fl.fixed_account_id, fl.details
	`, sheetUUID, lineUUID).Scan(
		&line.ID,
		&line.Kind,
		&line.Description,
		&line.Category,
		&line.Effective,
		&effectiveDate,
		&line.Amount,
		&line.FixedAccountID,
		&line.Details,
		&adjustmentsJSON,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}

	line.EffectiveDate = effectiveDate
	if err := json.Unmarshal(adjustmentsJSON, &line.Adjustments); err != nil {
		line.Adjustments = []LineAdjustment{}
	}
	if line.Adjustments == nil {
		line.Adjustments = []LineAdjustment{}
	}
	line.AdjustmentAmount = sumAdjustments(line.Adjustments)
	return &line, nil
}

// loadLinesBySheetUUIDs bulk-loads all lines + adjustments for a set of sheet UUIDs.
func (s *Service) loadLinesBySheetUUIDs(ctx context.Context, sheetUUIDs []string) (map[string][]Line, error) {
	if len(sheetUUIDs) == 0 {
		return map[string][]Line{}, nil
	}

	placeholders := make([]string, len(sheetUUIDs))
	args := make([]any, len(sheetUUIDs))
	for i, id := range sheetUUIDs {
		placeholders[i] = fmt.Sprintf("$%d::uuid", i+1)
		args[i] = id
	}

	query := fmt.Sprintf(`
		SELECT
			fl.sheet_id::text,
			fl.id::text,
			fl.kind,
			fl.description,
			fl.category,
			fl.effective,
			fl.effective_date,
			fl.amount,
			COALESCE(fl.fixed_account_id::text, '') AS fixed_account_id,
			fl.details,
			fl.position,
			COALESCE(
				JSON_AGG(
					JSON_BUILD_OBJECT(
						'id',     fla.id::text,
						'amount', fla.amount,
						'note',   fla.note,
						'date',   fla.date
					) ORDER BY fla.position
				) FILTER (WHERE fla.id IS NOT NULL),
				'[]'::json
			) AS adjustments
		FROM finance_lines fl
		LEFT JOIN finance_line_adjustments fla ON fla.line_id = fl.id
		WHERE fl.sheet_id IN (%s)
		GROUP BY fl.sheet_id, fl.id, fl.kind, fl.description, fl.category,
		         fl.effective, fl.effective_date, fl.amount,
		         fl.fixed_account_id, fl.details, fl.position
		ORDER BY fl.sheet_id, fl.kind, fl.position
	`, strings.Join(placeholders, ", "))

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string][]Line, len(sheetUUIDs))
	for rows.Next() {
		var sheetID string
		var line Line
		var adjustmentsJSON json.RawMessage
		var position int

		if err := rows.Scan(
			&sheetID, &line.ID, &line.Kind, &line.Description, &line.Category,
			&line.Effective, &line.EffectiveDate, &line.Amount,
			&line.FixedAccountID, &line.Details, &position, &adjustmentsJSON,
		); err != nil {
			return nil, err
		}

		if err := json.Unmarshal(adjustmentsJSON, &line.Adjustments); err != nil {
			line.Adjustments = []LineAdjustment{}
		}
		if line.Adjustments == nil {
			line.Adjustments = []LineAdjustment{}
		}
		line.AdjustmentAmount = sumAdjustments(line.Adjustments)
		result[sheetID] = append(result[sheetID], line)
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}

	return result, nil
}

func (s *Service) loadSheetDetail(
	ctx context.Context,
	sheetUUID string,
	clientLegacyID int,
	clientName string,
	createdAt, updatedAt time.Time,
) (*SheetDetail, error) {
	linesBySheet, err := s.loadLinesBySheetUUIDs(ctx, []string{sheetUUID})
	if err != nil {
		return nil, err
	}

	lines := linesBySheet[sheetUUID]
	entradas := filterLinesByKind(lines, "entrada")
	saidas := filterLinesByKind(lines, "saida")

	var title, period, status, notes string
	_ = s.pool.QueryRow(ctx, `
		SELECT title, period, status, notes FROM finance_sheets WHERE id = $1::uuid
	`, sheetUUID).Scan(&title, &period, &status, &notes)

	summary := computeSummary(entradas, saidas)

	return &SheetDetail{
		ID:         sheetUUID,
		Title:      title,
		Period:     period,
		Status:     status,
		Notes:      notes,
		ClientID:   clientLegacyID,
		ClientName: clientName,
		Entradas:   entradas,
		Saidas:     saidas,
		Summary:    summary,
		Preview:    buildPreview(period, summary),
		CreatedAt:  createdAt,
		UpdatedAt:  updatedAt,
	}, nil
}

func insertLines(ctx context.Context, tx pgx.Tx, sheetUUID string, lines []LineInput, kind string) error {
	for i, line := range lines {
		var lineUUID string
		effectiveDate := normalizeLineEffectiveDate(line)
		lineID := normalizeUUID(line.ID)
		err := tx.QueryRow(ctx, `
			INSERT INTO finance_lines
				(id, sheet_id, kind, description, category, effective, effective_date, amount, fixed_account_id, details, position)
			VALUES (COALESCE(NULLIF($1, ''), gen_random_uuid()::text)::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9::uuid, $10, $11)
			RETURNING id
		`,
			lineID,
			sheetUUID,
			kind,
			normalizeText(line.Description, 300),
			normalizeText(line.Category, 100),
			line.Effective,
			effectiveDate,
			line.Amount,
			nullableUUID(strings.TrimSpace(line.FixedAccountID)),
			normalizeText(line.Details, 2000),
			i,
		).Scan(&lineUUID)
		if err != nil {
			return err
		}

		for j, adj := range line.Adjustments {
			adjustmentID := normalizeUUID(adj.ID)
			if _, err := tx.Exec(ctx, `
				INSERT INTO finance_line_adjustments (id, line_id, amount, note, date, position)
				VALUES (COALESCE(NULLIF($1, ''), gen_random_uuid()::text)::uuid, $2, $3, $4, $5, $6)
			`,
				adjustmentID,
				lineUUID,
				adj.Amount,
				normalizeText(adj.Note, 300),
				normalizeDate(adj.Date),
				j,
			); err != nil {
				return err
			}
		}
	}
	return nil
}
