package finance

import (
	"testing"
	"time"
)

func TestNormalizeUUID(t *testing.T) {
	t.Parallel()

	valid := "123E4567-E89B-42D3-A456-426614174000"
	if got := normalizeUUID(valid); got != "123e4567-e89b-42d3-a456-426614174000" {
		t.Fatalf("expected normalized uuid, got %q", got)
	}

	if got := normalizeUUID("cat-123"); got != "" {
		t.Fatalf("expected invalid uuid to be blank, got %q", got)
	}
}

func TestNullableUUID(t *testing.T) {
	t.Parallel()

	if got := nullableUUID("fixed-123"); got != nil {
		t.Fatalf("expected invalid uuid to become nil, got %v", *got)
	}

	got := nullableUUID("123e4567-e89b-42d3-a456-426614174000")
	if got == nil || *got != "123e4567-e89b-42d3-a456-426614174000" {
		t.Fatalf("expected valid uuid pointer, got %v", got)
	}
}

func TestNormalizeLineEffectiveDate(t *testing.T) {
	t.Parallel()

	if got := normalizeLineEffectiveDate(LineInput{
		Effective:     false,
		EffectiveDate: "",
	}); got != "" {
		t.Fatalf("expected empty effective date for non-effective line, got %q", got)
	}

	if got := normalizeLineEffectiveDate(LineInput{
		Effective:     true,
		EffectiveDate: "2026-03-31",
	}); got != "2026-03-31" {
		t.Fatalf("expected explicit effective date to be preserved, got %q", got)
	}

	if got := normalizeLineEffectiveDate(LineInput{
		Effective:     true,
		EffectiveDate: "",
	}); got == "" {
		t.Fatalf("expected effective line without date to receive a default date")
	}
}

func TestDateInBrazil(t *testing.T) {
	t.Parallel()

	utcBoundary := mustParseTime(t, "2026-04-01T01:30:00Z")
	if got := dateInBrazil(utcBoundary); got != "2026-03-31" {
		t.Fatalf("expected Brazil local date before midnight rollover, got %q", got)
	}

	brazilMorning := mustParseTime(t, "2026-04-01T13:30:00Z")
	if got := dateInBrazil(brazilMorning); got != "2026-04-01" {
		t.Fatalf("expected Brazil local date after midnight rollover, got %q", got)
	}
}

func mustParseTime(t *testing.T, value string) time.Time {
	t.Helper()

	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		t.Fatalf("failed to parse time %q: %v", value, err)
	}

	return parsed
}
