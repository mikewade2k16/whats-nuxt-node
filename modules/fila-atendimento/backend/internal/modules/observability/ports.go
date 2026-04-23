package observability

import modulecontracts "github.com/mikewade2k16/lista-da-vez/back/moduleapi/contracts"

const (
	RoleAdmin         = "admin"
	RoleConsultant    = "consultant"
	RoleStoreTerminal = "store_terminal"
	RoleManager       = "manager"
	RoleMarketing     = "marketing"
	RoleOwner         = "owner"
	RolePlatformAdmin = "platform_admin"
)

type AccessContext = modulecontracts.AccessContext
