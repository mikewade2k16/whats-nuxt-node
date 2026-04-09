package finance

import (
	"fmt"
	"regexp"
	"strings"
	"time"
)

var brazilLocation = mustLoadLocation("America/Sao_Paulo")
var uuidPattern = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

const (
	maxSheetLinesPerKind      = 200
	maxAdjustmentsPerLine     = 60
	maxCategoriesPerConfig    = 120
	maxFixedAccountsPerConfig = 160
	maxMembersPerFixedAccount = 80
	maxRecurringEntriesConfig = 300
)

func normalizeText(v string, max int) string {
	text := strings.TrimSpace(v)
	if max > 0 && len(text) > max {
		return text[:max]
	}
	return text
}

func normalizePeriod(v string) string {
	v = strings.TrimSpace(v)
	if len(v) == 7 && v[4] == '-' {
		return v
	}
	return ""
}

func normalizeDate(v string) string {
	v = strings.TrimSpace(v)
	if len(v) == 10 && v[4] == '-' && v[7] == '-' {
		return v
	}
	return ""
}

func normalizeLineEffectiveDate(line LineInput) string {
	normalized := normalizeDate(line.EffectiveDate)
	if normalized != "" {
		return normalized
	}
	if !line.Effective {
		return ""
	}
	return dateInBrazil(time.Now())
}

func normalizeStatus(v string) string {
	switch strings.TrimSpace(strings.ToLower(v)) {
	case "conferencia":
		return "conferencia"
	case "fechada":
		return "fechada"
	default:
		return "aberta"
	}
}

func normalizeKind(v string) string {
	switch strings.TrimSpace(strings.ToLower(v)) {
	case "entrada":
		return "entrada"
	case "saida":
		return "saida"
	default:
		return "ambas"
	}
}

func normalizeUUID(v string) string {
	normalized := strings.TrimSpace(strings.ToLower(v))
	if uuidPattern.MatchString(normalized) {
		return normalized
	}
	return ""
}

func nullableUUID(v string) *string {
	normalized := normalizeUUID(v)
	if normalized == "" {
		return nil
	}
	return &normalized
}

func validateSheetCollections(entradas, saidas []LineInput) error {
	if len(entradas) > maxSheetLinesPerKind || len(saidas) > maxSheetLinesPerKind {
		return ErrInvalidInput
	}

	for _, line := range entradas {
		if len(line.Adjustments) > maxAdjustmentsPerLine {
			return ErrInvalidInput
		}
	}

	for _, line := range saidas {
		if len(line.Adjustments) > maxAdjustmentsPerLine {
			return ErrInvalidInput
		}
	}

	return nil
}

func validateConfigCollections(categories []CategoryInput, fixedAccounts []FixedAccountInput, recurringEntries []RecurringEntryInput) error {
	if len(categories) > maxCategoriesPerConfig {
		return ErrInvalidInput
	}
	if len(fixedAccounts) > maxFixedAccountsPerConfig {
		return ErrInvalidInput
	}
	if len(recurringEntries) > maxRecurringEntriesConfig {
		return ErrInvalidInput
	}

	for _, account := range fixedAccounts {
		if len(account.Members) > maxMembersPerFixedAccount {
			return ErrInvalidInput
		}
	}

	return nil
}

func dateInBrazil(now time.Time) string {
	return now.In(brazilLocation).Format("2006-01-02")
}

func mustLoadLocation(name string) *time.Location {
	location, err := time.LoadLocation(name)
	if err != nil {
		return time.FixedZone("BRT", -3*60*60)
	}
	return location
}

func normalizePageAndLimit(page, limit int) (int, int) {
	if page <= 0 {
		page = 1
	}
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	return page, limit
}

func sumAdjustments(adjs []LineAdjustment) float64 {
	var total float64
	for _, a := range adjs {
		total += a.Amount
	}
	return total
}

func computeSummary(entradas, saidas []Line) SheetSummary {
	var expectedIn, effectiveIn, expectedOut, effectiveOut float64
	for _, line := range entradas {
		total := line.Amount + line.AdjustmentAmount
		expectedIn += total
		if line.Effective {
			effectiveIn += total
		}
	}
	for _, line := range saidas {
		total := line.Amount + line.AdjustmentAmount
		expectedOut += total
		if line.Effective {
			effectiveOut += total
		}
	}
	return SheetSummary{
		ExpectedIn:       expectedIn,
		EffectiveIn:      effectiveIn,
		ExpectedOut:      expectedOut,
		EffectiveOut:     effectiveOut,
		ExpectedBalance:  expectedIn - expectedOut,
		EffectiveBalance: effectiveIn - effectiveOut,
	}
}

func buildPreview(period string, summary SheetSummary) string {
	if period == "" {
		return ""
	}
	return fmt.Sprintf("%s • Receita R$%.0f • Despesa R$%.0f • Saldo R$%.0f",
		period, summary.ExpectedIn, summary.ExpectedOut, summary.ExpectedBalance)
}

func filterLinesByKind(lines []Line, kind string) []Line {
	if lines == nil {
		return []Line{}
	}
	out := make([]Line, 0, len(lines))
	for _, l := range lines {
		if l.Kind == kind {
			out = append(out, l)
		}
	}
	return out
}
