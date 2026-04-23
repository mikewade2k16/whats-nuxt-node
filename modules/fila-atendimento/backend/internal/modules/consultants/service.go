package consultants

import (
	"context"
	"errors"
	"strings"
)

type Service struct {
	repository           Repository
	storeCatalogProvider StoreCatalogProvider
}

func NewService(repository Repository, storeCatalogProvider StoreCatalogProvider) *Service {
	return &Service{
		repository:           repository,
		storeCatalogProvider: storeCatalogProvider,
	}
}

func (service *Service) ListByStore(ctx context.Context, access AccessContext, storeID string) ([]ConsultantView, error) {
	store, err := service.resolveAccessibleStore(ctx, access, storeID)
	if err != nil {
		return nil, err
	}

	consultants, err := service.repository.ListByStore(ctx, store.ID)
	if err != nil {
		return nil, err
	}

	views := make([]ConsultantView, 0, len(consultants))
	for _, consultant := range consultants {
		views = append(views, consultant.View())
	}

	return views, nil
}

func (service *Service) Create(ctx context.Context, access AccessContext, input CreateInput) (CreateResult, error) {
	if !canWriteConsultants(access.Role) {
		return CreateResult{}, ErrForbidden
	}

	store, err := service.resolveAccessibleStore(ctx, access, input.StoreID)
	if err != nil {
		return CreateResult{}, err
	}

	name := strings.TrimSpace(input.Name)
	if name == "" {
		return CreateResult{}, ErrValidation
	}

	consultant, err := service.repository.Create(ctx, Consultant{
		TenantID:       store.TenantID,
		StoreID:        store.ID,
		Name:           name,
		RoleLabel:      strings.TrimSpace(input.RoleLabel),
		Initials:       buildInitials(name),
		Color:          normalizeColor(input.Color),
		MonthlyGoal:    maxFloat(input.MonthlyGoal, 0),
		CommissionRate: maxFloat(input.CommissionRate, 0),
		ConversionGoal: clampFloat(input.ConversionGoal, 0, 100),
		AvgTicketGoal:  maxFloat(input.AvgTicketGoal, 0),
		PAGoal:         maxFloat(input.PAGoal, 0),
		Active:         true,
	})
	if err != nil {
		return CreateResult{}, err
	}

	refreshed, err := service.repository.FindByID(ctx, consultant.ID)
	if err != nil {
		return CreateResult{}, err
	}

	return CreateResult{
		Consultant: refreshed.View(),
	}, nil
}

func (service *Service) Update(ctx context.Context, access AccessContext, input UpdateInput) (ConsultantView, error) {
	if !canWriteConsultants(access.Role) {
		return ConsultantView{}, ErrForbidden
	}

	consultantID := strings.TrimSpace(input.ID)
	if consultantID == "" {
		return ConsultantView{}, ErrValidation
	}

	existing, err := service.repository.FindByID(ctx, consultantID)
	if err != nil {
		return ConsultantView{}, err
	}

	_, err = service.resolveAccessibleStore(ctx, access, existing.StoreID)
	if err != nil {
		return ConsultantView{}, err
	}

	if input.Name != nil {
		existing.Name = strings.TrimSpace(*input.Name)
		existing.Initials = buildInitials(existing.Name)
	}

	if input.RoleLabel != nil {
		existing.RoleLabel = strings.TrimSpace(*input.RoleLabel)
	}

	if input.Color != nil {
		existing.Color = normalizeColor(*input.Color)
	}

	if input.MonthlyGoal != nil {
		existing.MonthlyGoal = maxFloat(*input.MonthlyGoal, 0)
	}

	if input.CommissionRate != nil {
		existing.CommissionRate = maxFloat(*input.CommissionRate, 0)
	}

	if input.ConversionGoal != nil {
		existing.ConversionGoal = clampFloat(*input.ConversionGoal, 0, 100)
	}

	if input.AvgTicketGoal != nil {
		existing.AvgTicketGoal = maxFloat(*input.AvgTicketGoal, 0)
	}

	if input.PAGoal != nil {
		existing.PAGoal = maxFloat(*input.PAGoal, 0)
	}

	if strings.TrimSpace(existing.Name) == "" {
		return ConsultantView{}, ErrValidation
	}

	updated, err := service.repository.Update(ctx, existing)
	if err != nil {
		return ConsultantView{}, err
	}

	refreshed, err := service.repository.FindByID(ctx, updated.ID)
	if err != nil {
		return ConsultantView{}, err
	}

	return refreshed.View(), nil
}

func (service *Service) Archive(ctx context.Context, access AccessContext, consultantID string) error {
	if !canWriteConsultants(access.Role) {
		return ErrForbidden
	}

	trimmedID := strings.TrimSpace(consultantID)
	if trimmedID == "" {
		return ErrValidation
	}

	existing, err := service.repository.FindByID(ctx, trimmedID)
	if err != nil {
		return err
	}

	if _, err := service.resolveAccessibleStore(ctx, access, existing.StoreID); err != nil {
		return err
	}

	return service.repository.Archive(ctx, trimmedID)
}

func (service *Service) resolveAccessibleStore(ctx context.Context, access AccessContext, storeID string) (StoreCatalogView, error) {
	trimmedStoreID := strings.TrimSpace(storeID)
	if trimmedStoreID == "" {
		return StoreCatalogView{}, ErrStoreRequired
	}

	if !canBypassStoreScope(access.Role) && !containsString(access.StoreIDs, trimmedStoreID) {
		return StoreCatalogView{}, ErrForbidden
	}

	if service.storeCatalogProvider == nil {
		return StoreCatalogView{}, errors.New("consultants: store catalog unavailable")
	}

	store, err := service.storeCatalogProvider.FindAccessibleStore(ctx, access, trimmedStoreID)
	if err != nil {
		return StoreCatalogView{}, err
	}

	return store, nil
}

func buildInitials(name string) string {
	parts := strings.Fields(strings.TrimSpace(name))
	if len(parts) == 0 {
		return "CO"
	}

	first := []rune(parts[0])
	second := first
	if len(parts) > 1 {
		second = []rune(parts[1])
	}

	initials := string(first[0])
	if len(second) > 0 {
		initials += string(second[0])
	} else if len(first) > 1 {
		initials += string(first[1])
	} else {
		initials += "O"
	}

	return strings.ToUpper(initials)
}

func normalizeColor(color string) string {
	trimmed := strings.TrimSpace(color)
	if trimmed == "" {
		return "#168aad"
	}

	return trimmed
}

func maxFloat(value float64, minimum float64) float64 {
	if value < minimum {
		return minimum
	}

	return value
}

func clampFloat(value float64, minimum float64, maximum float64) float64 {
	if value < minimum {
		return minimum
	}

	if value > maximum {
		return maximum
	}

	return value
}

func canWriteConsultants(role string) bool {
	return role == RoleOwner || role == RolePlatformAdmin
}

func canBypassStoreScope(role string) bool {
	return role == RoleOwner || role == RolePlatformAdmin
}

func containsString(values []string, target string) bool {
	trimmedTarget := strings.TrimSpace(target)
	for _, value := range values {
		if strings.TrimSpace(value) == trimmedTarget {
			return true
		}
	}

	return false
}
