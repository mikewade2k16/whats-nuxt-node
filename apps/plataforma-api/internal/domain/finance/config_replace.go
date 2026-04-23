package finance

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

func replaceFinanceCategories(ctx context.Context, tx pgx.Tx, configUUID string, categories []CategoryInput) error {
	keepIDs := make([]string, 0, len(categories))

	for index, category := range categories {
		var categoryID string
		err := tx.QueryRow(ctx, `
			INSERT INTO finance.finance_categories (id, config_id, name, kind, description, position)
			VALUES (COALESCE(NULLIF($1,''), gen_random_uuid()::text)::uuid, $2::uuid, $3, $4, $5, $6)
			ON CONFLICT (id) DO UPDATE
			SET name = EXCLUDED.name,
			    kind = EXCLUDED.kind,
			    description = EXCLUDED.description,
			    position = EXCLUDED.position
			WHERE finance_categories.config_id = EXCLUDED.config_id
			RETURNING id::text
		`,
			normalizeUUID(category.ID),
			configUUID,
			normalizeText(category.Name, 100),
			normalizeKind(category.Kind),
			normalizeText(category.Description, 500),
			index,
		).Scan(&categoryID)
		if err != nil {
			if err == pgx.ErrNoRows {
				return ErrInvalidInput
			}
			return err
		}

		keepIDs = append(keepIDs, categoryID)
	}

	return deleteScopedUUIDRows(ctx, tx, "finance.finance_categories", "config_id", configUUID, "id", keepIDs)
}

func replaceFinanceFixedAccounts(ctx context.Context, tx pgx.Tx, configUUID string, fixedAccounts []FixedAccountInput) error {
	keepIDs := make([]string, 0, len(fixedAccounts))

	for index, account := range fixedAccounts {
		categoryID, err := resolveScopedFinanceCategoryID(ctx, tx, configUUID, account.CategoryID)
		if err != nil {
			return err
		}

		var accountID string
		err = tx.QueryRow(ctx, `
			INSERT INTO finance.finance_fixed_accounts (id, config_id, name, kind, category_id, default_amount, notes, position)
			VALUES (COALESCE(NULLIF($1,''), gen_random_uuid()::text)::uuid, $2::uuid, $3, $4, $5::uuid, $6, $7, $8)
			ON CONFLICT (id) DO UPDATE
			SET name = EXCLUDED.name,
			    kind = EXCLUDED.kind,
			    category_id = EXCLUDED.category_id,
			    default_amount = EXCLUDED.default_amount,
			    notes = EXCLUDED.notes,
			    position = EXCLUDED.position
			WHERE finance_fixed_accounts.config_id = EXCLUDED.config_id
			RETURNING id::text
		`,
			normalizeUUID(account.ID),
			configUUID,
			normalizeText(account.Name, 100),
			normalizeKind(account.Kind),
			categoryID,
			account.DefaultAmount,
			normalizeText(account.Notes, 500),
			index,
		).Scan(&accountID)
		if err != nil {
			if err == pgx.ErrNoRows {
				return ErrInvalidInput
			}
			return err
		}

		if err := replaceFinanceFixedAccountMembers(ctx, tx, accountID, account.Members); err != nil {
			return err
		}

		keepIDs = append(keepIDs, accountID)
	}

	return deleteScopedUUIDRows(ctx, tx, "finance.finance_fixed_accounts", "config_id", configUUID, "id", keepIDs)
}

func resolveScopedFinanceCategoryID(ctx context.Context, tx pgx.Tx, configUUID, rawCategoryID string) (*string, error) {
	categoryID := normalizeUUID(rawCategoryID)
	if categoryID == "" {
		return nil, nil
	}

	var scopedCategoryID string
	err := tx.QueryRow(ctx, `
		SELECT id::text
		FROM finance.finance_categories
		WHERE id = $1::uuid
		  AND config_id = $2::uuid
	`, categoryID, configUUID).Scan(&scopedCategoryID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrInvalidInput
		}
		return nil, err
	}

	return &scopedCategoryID, nil
}

func replaceFinanceFixedAccountMembers(ctx context.Context, tx pgx.Tx, fixedAccountID string, members []FixedAccountMemberInput) error {
	keepIDs := make([]string, 0, len(members))

	for index, member := range members {
		var memberID string
		err := tx.QueryRow(ctx, `
			INSERT INTO finance.finance_fixed_account_members (id, fixed_account_id, name, amount, position)
			VALUES (COALESCE(NULLIF($1,''), gen_random_uuid()::text)::uuid, $2::uuid, $3, $4, $5)
			ON CONFLICT (id) DO UPDATE
			SET name = EXCLUDED.name,
			    amount = EXCLUDED.amount,
			    position = EXCLUDED.position
			WHERE finance_fixed_account_members.fixed_account_id = EXCLUDED.fixed_account_id
			RETURNING id::text
		`,
			normalizeUUID(member.ID),
			fixedAccountID,
			normalizeText(member.Name, 100),
			member.Amount,
			index,
		).Scan(&memberID)
		if err != nil {
			if err == pgx.ErrNoRows {
				return ErrInvalidInput
			}
			return err
		}

		keepIDs = append(keepIDs, memberID)
	}

	return deleteScopedUUIDRows(ctx, tx, "finance.finance_fixed_account_members", "fixed_account_id", fixedAccountID, "id", keepIDs)
}

func replaceFinanceRecurringEntries(ctx context.Context, tx pgx.Tx, configUUID string, recurringEntries []RecurringEntryInput) error {
	keepSourceTenantIDs := make([]string, 0, len(recurringEntries))

	for _, entry := range recurringEntries {
		if strings.TrimSpace(entry.SourceCoreTenantID) == "" {
			return ErrInvalidInput
		}

		var sourceTenantID string
		err := tx.QueryRow(ctx, `
			SELECT id::text
			FROM platform_core.tenants
			WHERE id = $1::uuid
			  AND deleted_at IS NULL
			LIMIT 1
		`, strings.TrimSpace(entry.SourceCoreTenantID)).Scan(&sourceTenantID)
		if err != nil {
			if err == pgx.ErrNoRows {
				return ErrInvalidInput
			}
			return err
		}

		if _, err := tx.Exec(ctx, `
			INSERT INTO finance.finance_recurring_entries (config_id, source_tenant_id, adjustment_amount, notes)
			VALUES ($1::uuid, $2::uuid, $3, $4)
			ON CONFLICT (config_id, source_tenant_id) DO UPDATE
			SET adjustment_amount = EXCLUDED.adjustment_amount,
			    notes = EXCLUDED.notes
		`,
			configUUID,
			sourceTenantID,
			entry.AdjustmentAmount,
			normalizeText(entry.Notes, 500),
		); err != nil {
			return err
		}

		keepSourceTenantIDs = append(keepSourceTenantIDs, sourceTenantID)
	}

	return deleteScopedUUIDRows(ctx, tx, "finance.finance_recurring_entries", "config_id", configUUID, "source_tenant_id", keepSourceTenantIDs)
}

func deleteScopedUUIDRows(ctx context.Context, tx pgx.Tx, tableName, scopeColumn, scopeValue, targetColumn string, keepIDs []string) error {
	query := fmt.Sprintf(`DELETE FROM %s WHERE %s = $1::uuid`, tableName, scopeColumn)
	args := []any{scopeValue}

	if len(keepIDs) > 0 {
		placeholders := make([]string, 0, len(keepIDs))
		for _, keepID := range keepIDs {
			args = append(args, keepID)
			placeholders = append(placeholders, fmt.Sprintf("$%d::uuid", len(args)))
		}
		query = fmt.Sprintf(`%s AND %s NOT IN (%s)`, query, targetColumn, strings.Join(placeholders, ", "))
	}

	_, err := tx.Exec(ctx, query, args...)
	return err
}
