package finance

import "time"

// ---- List response (lightweight — no lines/adjustments) ----

type SheetListItem struct {
	ID         string       `json:"id"`
	Title      string       `json:"title"`
	Period     string       `json:"period"`
	Status     string       `json:"status"`
	Notes      string       `json:"notes"`
	ClientID   int          `json:"clientId"`
	ClientName string       `json:"clientName"`
	Summary    SheetSummary `json:"summary"`
	Preview    string       `json:"preview"`
	CreatedAt  time.Time    `json:"createdAt"`
	UpdatedAt  time.Time    `json:"updatedAt"`
}

// ---- Detail response (full — with lines and adjustments) ----

type SheetDetail struct {
	ID         string       `json:"id"`
	Title      string       `json:"title"`
	Period     string       `json:"period"`
	Status     string       `json:"status"`
	Notes      string       `json:"notes"`
	ClientID   int          `json:"clientId"`
	ClientName string       `json:"clientName"`
	Entradas   []Line       `json:"entradas"`
	Saidas     []Line       `json:"saidas"`
	Summary    SheetSummary `json:"summary"`
	Preview    string       `json:"preview"`
	CreatedAt  time.Time    `json:"createdAt"`
	UpdatedAt  time.Time    `json:"updatedAt"`
}

type SheetSummary struct {
	ExpectedIn       float64 `json:"expectedIn"`
	EffectiveIn      float64 `json:"effectiveIn"`
	ExpectedOut      float64 `json:"expectedOut"`
	EffectiveOut     float64 `json:"effectiveOut"`
	ExpectedBalance  float64 `json:"expectedBalance"`
	EffectiveBalance float64 `json:"effectiveBalance"`
}

type LineMutationResult struct {
	SheetID   string       `json:"sheetId"`
	LineID    string       `json:"lineId"`
	Line      Line         `json:"line"`
	Summary   SheetSummary `json:"summary"`
	Preview   string       `json:"preview"`
	UpdatedAt time.Time    `json:"updatedAt"`
}

type LineAdjustment struct {
	ID     string  `json:"id"`
	Amount float64 `json:"amount"`
	Note   string  `json:"note"`
	Date   string  `json:"date"`
}

type Line struct {
	ID               string           `json:"id"`
	Kind             string           `json:"kind"`
	Description      string           `json:"description"`
	Category         string           `json:"category"`
	Effective        bool             `json:"effective"`
	EffectiveDate    string           `json:"effectiveDate"`
	Amount           float64          `json:"amount"`
	AdjustmentAmount float64          `json:"adjustmentAmount"`
	Adjustments      []LineAdjustment `json:"adjustments"`
	FixedAccountID   string           `json:"fixedAccountId"`
	Details          string           `json:"details"`
}

// ---- Config response ----

type Category struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Kind        string `json:"kind"`
	Description string `json:"description"`
}

type FixedAccountMember struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Amount float64 `json:"amount"`
}

type FixedAccount struct {
	ID            string               `json:"id"`
	Name          string               `json:"name"`
	Kind          string               `json:"kind"`
	CategoryID    string               `json:"categoryId"`
	DefaultAmount float64              `json:"defaultAmount"`
	Notes         string               `json:"notes"`
	Members       []FixedAccountMember `json:"members"`
}

type RecurringEntry struct {
	SourceClientID   int     `json:"sourceClientId"`
	AdjustmentAmount float64 `json:"adjustmentAmount"`
	Notes            string  `json:"notes"`
}

type Config struct {
	ClientID         int              `json:"clientId"`
	Categories       []Category       `json:"categories"`
	FixedAccounts    []FixedAccount   `json:"fixedAccounts"`
	RecurringEntries []RecurringEntry `json:"recurringEntries"`
	UpdatedAt        string           `json:"updatedAt"`
}

// ---- Input types ----

type LineAdjustmentInput struct {
	ID     string  `json:"id"`
	Amount float64 `json:"amount"`
	Note   string  `json:"note"`
	Date   string  `json:"date"`
}

type LineInput struct {
	ID               string                `json:"id"`
	Description      string                `json:"description"`
	Category         string                `json:"category"`
	Effective        bool                  `json:"effective"`
	EffectiveDate    string                `json:"effectiveDate"`
	Amount           float64               `json:"amount"`
	AdjustmentAmount float64               `json:"adjustmentAmount"`
	FixedAccountID   string                `json:"fixedAccountId"`
	Details          string                `json:"details"`
	Adjustments      []LineAdjustmentInput `json:"adjustments"`
}

type ListSheetsInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	Query           string
	ClientID        int
	Period          string
	Page            int
	Limit           int
}

type GetSheetInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	SheetID         string
}

type CreateSheetInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	Title           string
	Period          string
	Status          string
	Notes           string
	ClientID        int
	Entradas        []LineInput
	Saidas          []LineInput
}

type ReplaceSheetInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	SheetID         string
	Title           string
	Period          string
	Status          string
	Notes           string
	ClientID        int
	Entradas        []LineInput
	Saidas          []LineInput
}

type PatchLineInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	SheetID         string
	LineID          string
	Effective       *bool
	EffectiveDate   *string
}

type DeleteSheetInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	SheetID         string
}

type GetConfigInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	ClientID        int
}

type CategoryInput struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Kind        string `json:"kind"`
	Description string `json:"description"`
}

type FixedAccountMemberInput struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Amount float64 `json:"amount"`
}

type FixedAccountInput struct {
	ID            string                    `json:"id"`
	Name          string                    `json:"name"`
	Kind          string                    `json:"kind"`
	CategoryID    string                    `json:"categoryId"`
	DefaultAmount float64                   `json:"defaultAmount"`
	Notes         string                    `json:"notes"`
	Members       []FixedAccountMemberInput `json:"members"`
}

type RecurringEntryInput struct {
	SourceClientID   int     `json:"sourceClientId"`
	AdjustmentAmount float64 `json:"adjustmentAmount"`
	Notes            string  `json:"notes"`
}

type ReplaceConfigInput struct {
	UserID           string
	TenantID         string
	IsPlatformAdmin  bool
	ClientID         int
	Categories       []CategoryInput
	FixedAccounts    []FixedAccountInput
	RecurringEntries []RecurringEntryInput
}
