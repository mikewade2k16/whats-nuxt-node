import { createError } from 'h3'
import { evaluateAdminRouteAccess } from '~~/app/utils/admin-access'
import type { AccessContext } from '~~/server/utils/access-context'

export function assertAdminFeatureAccess(access: AccessContext, path: string, options?: { hasModule?: (moduleCode: string) => boolean }) {
  const result = evaluateAdminRouteAccess(path, {
    isAuthenticated: access.isAuthenticated,
    isRootUser: access.isPlatformAdmin,
    profileUserType: access.profileUserType,
    profileUserLevel: access.profileUserLevel,
    sessionUserType: access.userType,
    sessionUserLevel: access.userLevel,
    preferences: access.preferences,
    hasModule: options?.hasModule ?? (() => true)
  })

  if (!result.allowed) {
    throw createError({
      statusCode: 403,
      statusMessage: result.reason === 'module-atendimento' || result.reason === 'module-finance'
        ? 'Modulo indisponivel para esta sessao.'
        : result.reason === 'login-required'
          ? 'Sessao nao autenticada.'
          : 'Voce nao tem permissao para acessar este recurso.',
      data: {
        reason: result.reason,
        featureCode: result.featureCode ?? undefined
      }
    })
  }
}
