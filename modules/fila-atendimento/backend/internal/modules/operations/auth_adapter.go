package operations

import (
	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/auth"
	modulecontracts "github.com/mikewade2k16/lista-da-vez/back/moduleapi/contracts"
)

func AccessContextFromShell(actor modulecontracts.ActorContext, tenant modulecontracts.TenantContext, policy modulecontracts.AccessPolicy) AccessContext {
	return modulecontracts.NewAccessContext(actor, tenant, policy)
}

func AccessContextFromPrincipal(principal auth.Principal) AccessContext {
	return AccessContextFromShell(
		modulecontracts.ActorContext{
			UserID:      principal.UserID,
			DisplayName: principal.DisplayName,
			Email:       principal.Email,
			Role:        string(principal.Role),
			StoreIDs:    append([]string{}, principal.StoreIDs...),
		},
		modulecontracts.TenantContext{
			TenantID: principal.TenantID,
		},
		modulecontracts.AccessPolicy{},
	)
}
