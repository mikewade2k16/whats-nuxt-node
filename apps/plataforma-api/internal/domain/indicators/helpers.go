package indicators

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

var indicatorAccentPalette = []string{
	"#0f766e",
	"#b45309",
	"#be123c",
	"#1d4ed8",
	"#7c3aed",
	"#15803d",
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

func normalizeText(value string, maxLen int) string {
	value = strings.TrimSpace(value)
	if maxLen > 0 && len(value) > maxLen {
		return value[:maxLen]
	}
	return value
}

func normalizeLower(value string, maxLen int) string {
	return strings.ToLower(normalizeText(value, maxLen))
}

func normalizeUUID(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	return value
}

func normalizeScopeMode(value string) string {
	value = normalizeLower(value, 30)
	switch value {
	case "per_store":
		return "per_store"
	default:
		return "client_global"
	}
}

func normalizeTemplateStatus(value string) string {
	value = normalizeLower(value, 20)
	switch value {
	case "active", "archived":
		return value
	default:
		return "draft"
	}
}

func normalizeTemplateVersionStatus(value string) string {
	value = normalizeLower(value, 20)
	switch value {
	case "published", "archived":
		return value
	default:
		return "draft"
	}
}

func normalizeGovernancePolicyState(value string) string {
	value = normalizeLower(value, 20)
	switch value {
	case "system", "custom":
		return value
	default:
		return "recommended"
	}
}

func normalizeRoadmapStage(value string) string {
	value = normalizeLower(value, 20)
	switch value {
	case "now", "next":
		return value
	default:
		return "later"
	}
}

func normalizeProfileStatus(value string) string {
	value = normalizeLower(value, 20)
	switch value {
	case "draft", "archived":
		return value
	default:
		return "active"
	}
}

func normalizeTargetStatus(value string) string {
	value = normalizeLower(value, 20)
	switch value {
	case "draft", "archived":
		return value
	default:
		return "active"
	}
}

func normalizeEvaluationStatus(value string) string {
	value = normalizeLower(value, 20)
	switch value {
	case "draft", "cancelled":
		return value
	default:
		return "completed"
	}
}

func normalizeIndicatorKind(value string) string {
	value = normalizeLower(value, 30)
	switch value {
	case "derived", "composite":
		return value
	default:
		return "native"
	}
}

func normalizeSourceKind(value string) string {
	value = normalizeLower(value, 30)
	switch value {
	case "provider", "hybrid":
		return value
	default:
		return "manual"
	}
}

func normalizeAggregationMode(value string) string {
	value = normalizeLower(value, 30)
	switch value {
	case "sum", "average", "max", "min", "manual":
		return value
	default:
		return "weighted_average"
	}
}

func normalizeValueType(value string) string {
	value = normalizeLower(value, 30)
	switch value {
	case "percent", "currency", "count", "boolean", "composite":
		return value
	default:
		return "score"
	}
}

func normalizeEvidencePolicy(value string) string {
	value = normalizeLower(value, 30)
	switch value {
	case "none", "required", "inherit":
		return value
	default:
		return "optional"
	}
}

func normalizeInputType(value string) string {
	value = normalizeLower(value, 30)
	switch value {
	case "boolean", "percent", "currency", "count", "text", "image", "image_required", "select", "provider_metric":
		return value
	default:
		return "score"
	}
}

func normalizePeriodKind(value string) string {
	value = normalizeLower(value, 30)
	switch value {
	case "daily", "weekly", "quarterly", "yearly", "custom":
		return value
	default:
		return "monthly"
	}
}

func normalizeComparator(value string) string {
	value = normalizeLower(value, 20)
	switch value {
	case "lte", "eq", "between":
		return value
	default:
		return "gte"
	}
}

func parseDate(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", nil
	}
	parsed, err := time.Parse("2006-01-02", value)
	if err != nil {
		return "", ErrInvalidInput
	}
	return parsed.Format("2006-01-02"), nil
}

func mustDate(value string) string {
	parsed, _ := parseDate(value)
	return parsed
}

func mustJSONMap(value map[string]any) []byte {
	if len(value) == 0 {
		return []byte("{}")
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return []byte("{}")
	}
	return raw
}

func mustJSONArray(value any) []byte {
	if value == nil {
		return []byte("[]")
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return []byte("[]")
	}
	return raw
}

func decodeJSONMap(raw []byte) map[string]any {
	if len(raw) == 0 {
		return map[string]any{}
	}
	var output map[string]any
	if err := json.Unmarshal(raw, &output); err != nil {
		return map[string]any{}
	}
	if output == nil {
		return map[string]any{}
	}
	return output
}

func decodeStringSlice(raw []byte) []string {
	if len(raw) == 0 {
		return []string{}
	}
	var output []string
	if err := json.Unmarshal(raw, &output); err != nil {
		return []string{}
	}
	if output == nil {
		return []string{}
	}
	return output
}

func metadataString(metadata map[string]any, key string) string {
	if metadata == nil {
		return ""
	}
	value, ok := metadata[key]
	if !ok || value == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(value))
}

func metadataStringSlice(metadata map[string]any, key string) []string {
	if metadata == nil {
		return []string{}
	}
	value, ok := metadata[key]
	if !ok || value == nil {
		return []string{}
	}
	switch typed := value.(type) {
	case []string:
		return typed
	case []any:
		output := make([]string, 0, len(typed))
		for _, item := range typed {
			text := strings.TrimSpace(fmt.Sprint(item))
			if text == "" {
				continue
			}
			output = append(output, text)
		}
		return output
	default:
		return []string{}
	}
}

func accentColorForIndex(index int) string {
	if index < 0 {
		index = 0
	}
	return indicatorAccentPalette[index%len(indicatorAccentPalette)]
}

func sanitizeFileName(value string) string {
	value = normalizeText(value, 255)
	if value == "" {
		return "asset.bin"
	}
	base := filepath.Base(strings.ReplaceAll(value, "\\", "/"))
	base = strings.ReplaceAll(base, "..", "")
	base = strings.ReplaceAll(base, " ", "-")
	if base == "" || base == "." || base == "-" {
		return "asset.bin"
	}
	return base
}

func pointerFloat64(value float64) *float64 {
	return &value
}

func pointerBool(value bool) *bool {
	return &value
}

func stringOrFallback(value, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

func formatRFC3339Time(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.UTC().Format(time.RFC3339)
}

func formatFreshnessLabel(lastSnapshot *time.Time) string {
	if lastSnapshot == nil || lastSnapshot.IsZero() {
		return "Sem snapshot recente"
	}
	delta := time.Since(lastSnapshot.UTC())
	if delta < time.Minute {
		return "Atualizado agora"
	}
	if delta < time.Hour {
		return fmt.Sprintf("Atualizado ha %dm", int(delta.Minutes()))
	}
	if delta < 24*time.Hour {
		return fmt.Sprintf("Atualizado ha %dh", int(delta.Hours()))
	}
	return fmt.Sprintf("Atualizado ha %dd", int(delta.Hours()/24))
}

func formatGovernanceChangeLabel(value time.Time, timezone string) string {
	if value.IsZero() {
		return "Sem alteracao recente"
	}

	location, err := time.LoadLocation(strings.TrimSpace(timezone))
	if err != nil || location == nil {
		location = time.FixedZone("America/Sao_Paulo", -3*60*60)
	}

	now := time.Now().In(location)
	target := value.In(location)
	nowYear, nowMonth, nowDay := now.Date()
	targetYear, targetMonth, targetDay := target.Date()
	nowDate := time.Date(nowYear, nowMonth, nowDay, 0, 0, 0, 0, location)
	targetDate := time.Date(targetYear, targetMonth, targetDay, 0, 0, 0, 0, location)
	deltaDays := int(nowDate.Sub(targetDate).Hours() / 24)

	if deltaDays == 0 {
		return fmt.Sprintf("Hoje, %02d:%02d", target.Hour(), target.Minute())
	}
	if deltaDays == 1 {
		return fmt.Sprintf("Ontem, %02d:%02d", target.Hour(), target.Minute())
	}

	months := []string{"jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"}
	monthIndex := int(target.Month()) - 1
	monthLabel := "jan"
	if monthIndex >= 0 && monthIndex < len(months) {
		monthLabel = months[monthIndex]
	}

	return fmt.Sprintf("%02d %s %d", target.Day(), monthLabel, target.Year())
}

func providerStatusFromFreshness(lastSnapshot *time.Time) string {
	if lastSnapshot == nil || lastSnapshot.IsZero() {
		return "attention"
	}
	delta := time.Since(lastSnapshot.UTC())
	if delta <= 24*time.Hour {
		return "online"
	}
	if delta <= 72*time.Hour {
		return "attention"
	}
	return "offline"
}

func scoreTone(value float64) string {
	if value >= 90 {
		return "success"
	}
	if value >= 80 {
		return "neutral"
	}
	return "warning"
}

func roundFloat(value float64, precision int) float64 {
	factor := 1.0
	for range precision {
		factor *= 10
	}
	return float64(int(value*factor+0.5)) / factor
}

func parseFirstInt(value string, fallback int) int {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}

	buffer := strings.Builder{}
	for _, character := range value {
		if character >= '0' && character <= '9' {
			buffer.WriteRune(character)
			continue
		}
		if buffer.Len() > 0 {
			break
		}
	}

	if buffer.Len() == 0 {
		return fallback
	}

	parsed, err := strconv.Atoi(buffer.String())
	if err != nil || parsed <= 0 {
		return fallback
	}

	return parsed
}

func providerDisplayName(sourceModule string) string {
	sourceModule = strings.TrimSpace(sourceModule)
	if sourceModule == "" {
		return "Provider"
	}

	parts := strings.FieldsFunc(sourceModule, func(character rune) bool {
		return character == '-' || character == '_' || character == ' '
	})
	if len(parts) == 0 {
		return strings.ToUpper(sourceModule[:1]) + strings.ToLower(sourceModule[1:])
	}

	for index, part := range parts {
		if part == "" {
			continue
		}
		parts[index] = strings.ToUpper(part[:1]) + strings.ToLower(part[1:])
	}

	return strings.Join(parts, " ")
}

func indicatorBusinessID(code string, metadata map[string]any) string {
	if legacyID := metadataString(metadata, "legacyId"); legacyID != "" {
		return legacyID
	}
	return code
}

func evaluationScoreFromIndicators(indicators []EvaluationIndicatorInput) (float64, float64) {
	var weighted float64
	var totalWeight float64
	for _, indicator := range indicators {
		if indicator.Weight <= 0 {
			continue
		}
		weighted += indicator.Score * indicator.Weight
		totalWeight += indicator.Weight
	}
	if totalWeight == 0 {
		return 0, 0
	}
	return roundFloat(weighted/totalWeight, 4), roundFloat(totalWeight, 4)
}

func normalizeOptionalFloatString(value string) *float64 {
	value = strings.TrimSpace(strings.ReplaceAll(value, ",", "."))
	if value == "" {
		return nil
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return nil
	}
	return &parsed
}

func computeWeightStatus(indicators []ProfileIndicatorConfig) WeightStatus {
	status := WeightStatus{BlockingItemTotals: []BlockingIndicatorTotal{}}
	for _, indicator := range indicators {
		if !indicator.Enabled {
			continue
		}
		var total float64
		for _, item := range indicator.Items {
			total += item.Weight
		}
		total = roundFloat(total, 2)
		if total != 100 {
			status.BlockingItemTotals = append(status.BlockingItemTotals, BlockingIndicatorTotal{
				IndicatorID:   indicator.ID,
				IndicatorCode: indicator.Code,
				IndicatorName: indicator.Name,
				Total:         total,
			})
		}
	}
	status.HasBlockingIssues = len(status.BlockingItemTotals) > 0
	return status
}
