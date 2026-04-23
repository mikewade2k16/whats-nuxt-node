package consultants

import (
	"context"
	"time"
)

type Consultant struct {
	ID             string
	TenantID       string
	StoreID        string
	UserID         string
	AccessEmail    string
	AccessActive   bool
	Name           string
	RoleLabel      string
	Initials       string
	AvatarURL      string
	Color          string
	MonthlyGoal    float64
	CommissionRate float64
	ConversionGoal float64
	AvgTicketGoal  float64
	PAGoal         float64
	Active         bool
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

type ConsultantAccessView struct {
	UserID string `json:"userId"`
	Email  string `json:"email"`
	Active bool   `json:"active"`
}

type ConsultantView struct {
	ID             string                `json:"id"`
	StoreID        string                `json:"storeId"`
	Name           string                `json:"name"`
	Role           string                `json:"role"`
	Initials       string                `json:"initials"`
	AvatarURL      string                `json:"avatarUrl,omitempty"`
	Color          string                `json:"color"`
	MonthlyGoal    float64               `json:"monthlyGoal"`
	CommissionRate float64               `json:"commissionRate"`
	ConversionGoal float64               `json:"conversionGoal"`
	AvgTicketGoal  float64               `json:"avgTicketGoal"`
	PAGoal         float64               `json:"paGoal"`
	Active         bool                  `json:"active"`
	Access         *ConsultantAccessView `json:"access,omitempty"`
}

type CreateResult struct {
	Consultant ConsultantView `json:"consultant"`
}

type CreateInput struct {
	StoreID        string
	Name           string
	RoleLabel      string
	Color          string
	MonthlyGoal    float64
	CommissionRate float64
	ConversionGoal float64
	AvgTicketGoal  float64
	PAGoal         float64
}

type UpdateInput struct {
	ID             string
	Name           *string
	RoleLabel      *string
	Color          *string
	MonthlyGoal    *float64
	CommissionRate *float64
	ConversionGoal *float64
	AvgTicketGoal  *float64
	PAGoal         *float64
}

type Repository interface {
	ListByStore(ctx context.Context, storeID string) ([]Consultant, error)
	FindByID(ctx context.Context, consultantID string) (Consultant, error)
	SyncLinkedIdentity(ctx context.Context, userID string, name string, initials string) error
	Create(ctx context.Context, consultant Consultant) (Consultant, error)
	Update(ctx context.Context, consultant Consultant) (Consultant, error)
	Delete(ctx context.Context, consultantID string) error
	Archive(ctx context.Context, consultantID string) error
}

func (consultant Consultant) View() ConsultantView {
	return ConsultantView{
		ID:             consultant.ID,
		StoreID:        consultant.StoreID,
		Name:           consultant.Name,
		Role:           consultant.RoleLabel,
		Initials:       consultant.Initials,
		AvatarURL:      consultant.AvatarURL,
		Color:          consultant.Color,
		MonthlyGoal:    consultant.MonthlyGoal,
		CommissionRate: consultant.CommissionRate,
		ConversionGoal: consultant.ConversionGoal,
		AvgTicketGoal:  consultant.AvgTicketGoal,
		PAGoal:         consultant.PAGoal,
		Active:         consultant.Active,
		Access:         buildAccessView(consultant),
	}
}

func buildAccessView(consultant Consultant) *ConsultantAccessView {
	if consultant.UserID == "" && consultant.AccessEmail == "" {
		return nil
	}

	return &ConsultantAccessView{
		UserID: consultant.UserID,
		Email:  consultant.AccessEmail,
		Active: consultant.AccessActive,
	}
}
