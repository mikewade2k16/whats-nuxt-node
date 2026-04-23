package auth

import "strings"

type shellBridgeStore struct {
	ID       string
	TenantID string
	Code     string
	Name     string
	City     string
}

func resolveShellBridgeRole(claims ShellBridgeClaims) (Role, error) {
	scopeMode := strings.ToLower(strings.TrimSpace(claims.ScopeMode))
	if claims.IsPlatformAdmin && (scopeMode == "" || scopeMode == "platform") {
		return RolePlatformAdmin, nil
	}

	switch strings.ToLower(strings.TrimSpace(claims.BusinessRole)) {
	case "owner":
		return RoleOwner, nil
	case "system_admin":
		if scopeMode == "" || scopeMode == "platform" {
			return RolePlatformAdmin, nil
		}
		return RoleOwner, nil
	case "general_manager":
		return RoleOwner, nil
	case "store_manager":
		return RoleManager, nil
	case "consultant":
		return RoleConsultant, nil
	case "marketing":
		return RoleMarketing, nil
	}

	switch strings.ToLower(strings.TrimSpace(claims.UserLevel)) {
	case "admin":
		return RoleOwner, nil
	case "consultant":
		return RoleConsultant, nil
	case "manager":
		return RoleManager, nil
	case "marketing":
		return RoleMarketing, nil
	default:
		return "", ErrShellBridgeForbidden
	}
}

func resolveShellBridgeScopeMode(claims ShellBridgeClaims, role Role) string {
	scopeMode := strings.ToLower(strings.TrimSpace(claims.ScopeMode))
	if scopeMode != "" {
		return scopeMode
	}

	switch strings.ToLower(strings.TrimSpace(claims.BusinessRole)) {
	case "consultant", "store_manager":
		return "first_store"
	case "general_manager":
		return "all_stores"
	}

	if role == RoleManager {
		return "first_store"
	}

	if role == RolePlatformAdmin {
		return "platform"
	}

	return "all_stores"
}

func resolveShellBridgeStoreIDs(claimed []string, activeStores []shellBridgeStore) []string {
	if len(claimed) < 1 || len(activeStores) < 1 {
		return nil
	}

	allowed := make(map[string]struct{}, len(activeStores))
	for _, store := range activeStores {
		allowed[strings.TrimSpace(store.ID)] = struct{}{}
	}

	result := make([]string, 0, len(claimed))
	seen := make(map[string]struct{}, len(claimed))
	for _, storeID := range claimed {
		trimmed := strings.TrimSpace(storeID)
		if trimmed == "" {
			continue
		}
		if _, ok := allowed[trimmed]; !ok {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		result = append(result, trimmed)
	}

	return result
}
