package finance

import "context"

func (s *Service) sanitizeSheetFixedAccountRefs(ctx context.Context, tenantUUID string, collections ...[]LineInput) error {
	allowedIDs, err := s.loadTenantFixedAccountIDs(ctx, tenantUUID)
	if err != nil {
		return err
	}

	for _, lines := range collections {
		for index := range lines {
			fixedAccountID := normalizeUUID(lines[index].FixedAccountID)
			if fixedAccountID == "" {
				lines[index].FixedAccountID = ""
				continue
			}
			if _, ok := allowedIDs[fixedAccountID]; !ok {
				lines[index].FixedAccountID = ""
				continue
			}
			lines[index].FixedAccountID = fixedAccountID
		}
	}

	return nil
}

func (s *Service) loadTenantFixedAccountIDs(ctx context.Context, tenantUUID string) (map[string]struct{}, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT fa.id::text
		FROM finance.finance_fixed_accounts fa
		JOIN finance.finance_configs fc ON fc.id = fa.config_id
		WHERE fc.tenant_id = $1::uuid
	`, tenantUUID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]struct{})
	for rows.Next() {
		var accountID string
		if err := rows.Scan(&accountID); err != nil {
			return nil, err
		}
		result[accountID] = struct{}{}
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}

	return result, nil
}
