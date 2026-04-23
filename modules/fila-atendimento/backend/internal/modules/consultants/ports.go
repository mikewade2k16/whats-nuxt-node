package consultants

import modulecontracts "github.com/mikewade2k16/lista-da-vez/back/moduleapi/contracts"

const (
	RoleConsultant    = "consultant"
	RoleOwner         = "owner"
	RolePlatformAdmin = "platform_admin"
)

type AccessContext = modulecontracts.AccessContext
type StoreCatalogFilter = modulecontracts.StoreCatalogFilter
type StoreCatalogProvider = modulecontracts.StoreCatalogProvider
type StoreCatalogView = modulecontracts.StoreCatalogView
