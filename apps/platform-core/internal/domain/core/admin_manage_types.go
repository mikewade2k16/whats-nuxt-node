package core

type AdminClientStore struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Amount float64 `json:"amount"`
}

type AdminClientModule struct {
	Code   string `json:"code"`
	Name   string `json:"name"`
	Status string `json:"status"`
}

type AdminClient struct {
	ID                   int                 `json:"id"`
	CoreTenantID         string              `json:"coreTenantId"`
	Name                 string              `json:"name"`
	Status               string              `json:"status"`
	UserCount            int                 `json:"userCount"`
	UserNicks            string              `json:"userNicks"`
	ProjectCount         int                 `json:"projectCount"`
	ProjectSegments      string              `json:"projectSegments"`
	BillingMode          string              `json:"billingMode"`
	MonthlyPaymentAmount float64             `json:"monthlyPaymentAmount"`
	PaymentDueDay        string              `json:"paymentDueDay"`
	Stores               []AdminClientStore  `json:"stores"`
	StoresCount          int                 `json:"storesCount"`
	Modules              []AdminClientModule `json:"modules"`
	Logo                 string              `json:"logo"`
	WebhookEnabled       bool                `json:"webhookEnabled"`
	WebhookKey           string              `json:"webhookKey"`
	ContactPhone         string              `json:"contactPhone"`
	ContactSite          string              `json:"contactSite"`
	ContactAddress       string              `json:"contactAddress"`
}

type AdminClientStoreInput struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Amount float64 `json:"amount"`
}

type ListAdminClientsInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	Query           string
	Status          string
	Page            int
	Limit           int
}

type CreateAdminClientInput struct {
	UserID          string
	IsPlatformAdmin bool
	Name            string
	Status          string
	AdminName       string
	AdminEmail      string
	AdminPassword   string
}

type UpdateAdminClientFieldInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	ClientID        int
	Field           string
	Value           any
}

type ReplaceAdminClientStoresInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	ClientID        int
	Stores          []AdminClientStoreInput
}

type RotateAdminClientWebhookInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	ClientID        int
}

type DeleteAdminClientInput struct {
	UserID          string
	IsPlatformAdmin bool
	ClientID        int
}

type AdminUser struct {
	ID                int      `json:"id"`
	CoreUserID        string   `json:"coreUserId"`
	IsPlatformAdmin   bool     `json:"isPlatformAdmin"`
	Level             string   `json:"level"`
	ClientID          *int     `json:"clientId"`
	ClientName        string   `json:"clientName"`
	Name              string   `json:"name"`
	Nick              string   `json:"nick"`
	Email             string   `json:"email"`
	Password          string   `json:"password"`
	Phone             string   `json:"phone"`
	Status            string   `json:"status"`
	ProfileImg        string   `json:"profileImage"`
	LastLogin         string   `json:"lastLogin"`
	CreatedAt         string   `json:"createdAt"`
	UserType          string   `json:"userType"`
	Preference        string   `json:"preferences"`
	ModuleCodes       []string `json:"moduleCodes"`
	AtendimentoAccess bool     `json:"atendimentoAccess"`
}

type ListAdminUsersInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	Query           string
	ClientID        *int
	Page            int
	Limit           int
}

type CreateAdminUserInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	Name            string
	Nick            string
	Email           string
	Password        string
	Phone           string
	ClientID        *int
	Level           string
	UserType        string
}

type UpdateAdminUserFieldInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	UserIDLegacy    int
	Field           string
	Value           any
}

type ApproveAdminUserInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	UserIDLegacy    int
}

type DeleteAdminUserInput struct {
	UserID          string
	TenantID        string
	IsPlatformAdmin bool
	UserIDLegacy    int
}
