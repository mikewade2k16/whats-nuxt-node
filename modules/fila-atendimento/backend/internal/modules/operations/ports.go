package operations

import modulecontracts "github.com/mikewade2k16/lista-da-vez/back/moduleapi/contracts"

const (
	RoleConsultant    = "consultant"
	RoleStoreTerminal = "store_terminal"
	RoleManager       = "manager"
	RoleMarketing     = "marketing"
	RoleOwner         = "owner"
	RolePlatformAdmin = "platform_admin"
)

type AccessContext = modulecontracts.AccessContext

type StoreScopeFilter = modulecontracts.StoreScopeFilter

type StoreScopeView = modulecontracts.StoreScopeView

type StoreScopeProvider = modulecontracts.StoreScopeProvider
