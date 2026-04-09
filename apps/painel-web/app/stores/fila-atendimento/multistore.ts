import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type {
  FilaAtendimentoConsultantProfilePayload,
  FilaAtendimentoManagedStore,
  FilaAtendimentoMultiStoreMutationResult,
  FilaAtendimentoMultiStoreOverviewResponse,
  FilaAtendimentoMultiStoreOverviewRow,
  FilaAtendimentoStoreDeleteDependency
} from '~/types/fila-atendimento'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'
import { canManageStores } from '~/utils/fila-atendimento/permissions'

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeCode(value: unknown) {
  return normalizeText(value).toUpperCase()
}

function normalizeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeNullableNumber(value: unknown) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) {
    return null
  }

  return Math.max(0, parsed)
}

function normalizeErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object') {
    const serverMessage = normalizeText((error as { statusMessage?: unknown }).statusMessage)
    if (serverMessage) {
      return serverMessage
    }

    const errorData = (error as { data?: Record<string, unknown> }).data
    const dataMessage = normalizeText(errorData?.message)
    if (dataMessage) {
      return dataMessage
    }

    const rawMessage = normalizeText((error as { message?: unknown }).message)
    if (rawMessage) {
      return rawMessage
    }
  }

  return fallback
}

function normalizeStore(input: unknown): FilaAtendimentoManagedStore {
  const store = input as Record<string, unknown>
  return {
    id: normalizeText(store?.id),
    tenantId: normalizeText(store?.tenantId),
    code: normalizeCode(store?.code),
    name: normalizeText(store?.name),
    city: normalizeText(store?.city),
    isActive: Boolean(store?.isActive ?? true),
    defaultTemplateId: normalizeText(store?.defaultTemplateId),
    monthlyGoal: Math.max(0, normalizeNumber(store?.monthlyGoal)),
    weeklyGoal: Math.max(0, normalizeNumber(store?.weeklyGoal)),
    avgTicketGoal: Math.max(0, normalizeNumber(store?.avgTicketGoal)),
    conversionGoal: Math.max(0, normalizeNumber(store?.conversionGoal)),
    paGoal: Math.max(0, normalizeNumber(store?.paGoal))
  }
}

function normalizeStores(items: unknown): FilaAtendimentoManagedStore[] {
  const seen = new Set<string>()
  return (Array.isArray(items) ? items : [])
    .map((item) => normalizeStore(item))
    .filter((store) => {
      if (!store.id || seen.has(store.id)) {
        return false
      }

      seen.add(store.id)
      return true
    })
}

function normalizeOverviewRow(input: unknown): FilaAtendimentoMultiStoreOverviewRow {
  const row = input as Record<string, unknown>
  return {
    storeId: normalizeText(row?.storeId),
    storeName: normalizeText(row?.storeName),
    storeCode: normalizeText(row?.storeCode),
    storeCity: normalizeText(row?.storeCity),
    consultants: Math.max(0, normalizeNumber(row?.consultants)),
    queueCount: Math.max(0, normalizeNumber(row?.queueCount)),
    activeCount: Math.max(0, normalizeNumber(row?.activeCount)),
    pausedCount: Math.max(0, normalizeNumber(row?.pausedCount)),
    attendances: Math.max(0, normalizeNumber(row?.attendances)),
    conversionRate: Math.max(0, normalizeNumber(row?.conversionRate)),
    soldValue: Math.max(0, normalizeNumber(row?.soldValue)),
    ticketAverage: Math.max(0, normalizeNumber(row?.ticketAverage)),
    paScore: Math.max(0, normalizeNumber(row?.paScore)),
    averageQueueWaitMs: Math.max(0, normalizeNumber(row?.averageQueueWaitMs)),
    queueJumpRate: Math.max(0, normalizeNumber(row?.queueJumpRate)),
    healthScore: Math.max(0, normalizeNumber(row?.healthScore)),
    monthlyGoal: Math.max(0, normalizeNumber(row?.monthlyGoal)),
    weeklyGoal: Math.max(0, normalizeNumber(row?.weeklyGoal)),
    avgTicketGoal: Math.max(0, normalizeNumber(row?.avgTicketGoal)),
    conversionGoal: Math.max(0, normalizeNumber(row?.conversionGoal)),
    paGoal: Math.max(0, normalizeNumber(row?.paGoal)),
    defaultTemplateId: normalizeText(row?.defaultTemplateId)
  }
}

function normalizeOverview(input: unknown): FilaAtendimentoMultiStoreOverviewResponse {
  const overview = input as Record<string, unknown>
  const summary = (overview?.summary ?? {}) as Record<string, unknown>

  return {
    tenantId: normalizeText(overview?.tenantId),
    summary: {
      activeStores: Math.max(0, normalizeNumber(summary?.activeStores)),
      totalAttendances: Math.max(0, normalizeNumber(summary?.totalAttendances)),
      totalSoldValue: Math.max(0, normalizeNumber(summary?.totalSoldValue)),
      totalQueue: Math.max(0, normalizeNumber(summary?.totalQueue)),
      totalActiveServices: Math.max(0, normalizeNumber(summary?.totalActiveServices)),
      averageHealthScore: Math.max(0, normalizeNumber(summary?.averageHealthScore))
    },
    stores: (Array.isArray(overview?.stores) ? overview.stores : []).map((row) => normalizeOverviewRow(row))
  }
}

function normalizeDeleteDependencies(input: unknown): FilaAtendimentoStoreDeleteDependency[] {
  return (Array.isArray(input) ? input : []).map((item) => {
    const dependency = item as Record<string, unknown>
    return {
      key: normalizeText(dependency?.key),
      label: normalizeText(dependency?.label),
      count: Math.max(0, normalizeNumber(dependency?.count))
    }
  }).filter((item) => Boolean(item.key || item.label))
}

function assignIfChanged<T>(
  body: Record<string, unknown>,
  key: string,
  nextValue: unknown,
  currentValue: unknown,
  normalize: (value: unknown) => T
) {
  const next = normalize(nextValue)
  const current = normalize(currentValue)

  if (next !== current) {
    body[key] = next
  }
}

function buildCreatePayload(payload: Record<string, unknown>, tenantId: string) {
  const body: Record<string, unknown> = {
    tenantId: normalizeText(tenantId),
    name: normalizeText(payload.name),
    code: normalizeCode(payload.code)
  }

  const city = normalizeText(payload.city)
  const defaultTemplateId = normalizeText(payload.defaultTemplateId)
  const monthlyGoal = normalizeNullableNumber(payload.monthlyGoal)
  const weeklyGoal = normalizeNullableNumber(payload.weeklyGoal)
  const avgTicketGoal = normalizeNullableNumber(payload.avgTicketGoal)
  const conversionGoal = normalizeNullableNumber(payload.conversionGoal)
  const paGoal = normalizeNullableNumber(payload.paGoal)

  if (city) {
    body.city = city
  }

  if (defaultTemplateId) {
    body.defaultTemplateId = defaultTemplateId
  }

  if (monthlyGoal !== null) {
    body.monthlyGoal = monthlyGoal
  }

  if (weeklyGoal !== null) {
    body.weeklyGoal = weeklyGoal
  }

  if (avgTicketGoal !== null) {
    body.avgTicketGoal = avgTicketGoal
  }

  if (conversionGoal !== null) {
    body.conversionGoal = conversionGoal
  }

  if (paGoal !== null) {
    body.paGoal = paGoal
  }

  return body
}

function buildUpdatePayload(payload: Record<string, unknown>, currentStore: FilaAtendimentoManagedStore) {
  const body: Record<string, unknown> = {}

  assignIfChanged(body, 'name', payload.name, currentStore.name, normalizeText)
  assignIfChanged(body, 'code', payload.code, currentStore.code, normalizeCode)
  assignIfChanged(body, 'city', payload.city, currentStore.city, normalizeText)
  assignIfChanged(body, 'defaultTemplateId', payload.defaultTemplateId, currentStore.defaultTemplateId, normalizeText)
  assignIfChanged(body, 'monthlyGoal', payload.monthlyGoal, currentStore.monthlyGoal, normalizeNullableNumber)
  assignIfChanged(body, 'weeklyGoal', payload.weeklyGoal, currentStore.weeklyGoal, normalizeNullableNumber)
  assignIfChanged(body, 'avgTicketGoal', payload.avgTicketGoal, currentStore.avgTicketGoal, normalizeNullableNumber)
  assignIfChanged(body, 'conversionGoal', payload.conversionGoal, currentStore.conversionGoal, normalizeNullableNumber)
  assignIfChanged(body, 'paGoal', payload.paGoal, currentStore.paGoal, normalizeNullableNumber)

  return body
}

function normalizeConsultantPayload(payload: Partial<FilaAtendimentoConsultantProfilePayload>): FilaAtendimentoConsultantProfilePayload {
  return {
    name: normalizeText(payload.name),
    role: normalizeText(payload.role),
    color: normalizeText(payload.color) || '#168aad',
    monthlyGoal: Math.max(0, normalizeNumber(payload.monthlyGoal)),
    commissionRate: Math.max(0, normalizeNumber(payload.commissionRate)),
    conversionGoal: Math.max(0, normalizeNumber(payload.conversionGoal)),
    avgTicketGoal: Math.max(0, normalizeNumber(payload.avgTicketGoal)),
    paGoal: Math.max(0, normalizeNumber(payload.paGoal))
  }
}

export const useFilaAtendimentoMultiStoreStore = defineStore('fila-atendimento-multistore', () => {
  const { bffFetch } = useBffFetch()
  const operationsStore = useFilaAtendimentoOperationsStore()

  const overview = ref<FilaAtendimentoMultiStoreOverviewResponse | null>(null)
  const managedStores = ref<FilaAtendimentoManagedStore[]>([])
  const overviewPending = ref(false)
  const managedStoresPending = ref(false)
  const ready = ref(false)
  const errorMessage = ref('')
  const lastLoadedTenantId = ref('')

  const activeTenantId = computed(() =>
    normalizeText(
      operationsStore.moduleContext?.context?.activeTenantId
      || operationsStore.moduleContext?.principal?.tenantId
      || operationsStore.moduleContext?.context?.tenants?.[0]?.id
      || ''
    )
  )
  const pending = computed(() => overviewPending.value || managedStoresPending.value)
  const canManage = computed(() => canManageStores(operationsStore.role))

  function clearState() {
    overview.value = null
    managedStores.value = []
    ready.value = false
    errorMessage.value = ''
    lastLoadedTenantId.value = ''
  }

  function buildManagedStoresQuery() {
    const params = new URLSearchParams()
    if (activeTenantId.value) {
      params.set('tenantId', activeTenantId.value)
    }
    params.set('includeInactive', 'true')
    return params.toString()
  }

  function buildOverviewQuery() {
    const params = new URLSearchParams()
    if (activeTenantId.value) {
      params.set('tenantId', activeTenantId.value)
    }
    return params.toString()
  }

  async function refreshManagedStores() {
    if (!operationsStore.sessionReady || !activeTenantId.value) {
      managedStores.value = []
      return []
    }

    managedStoresPending.value = true
    errorMessage.value = ''

    try {
      const response = await bffFetch<{ stores?: unknown[] }>(
        `/api/admin/modules/fila-atendimento/stores?${buildManagedStoresQuery()}`
      )
      managedStores.value = normalizeStores(response?.stores)
      return managedStores.value
    } catch (error) {
      errorMessage.value = normalizeErrorMessage(error, 'Nao foi possivel carregar as lojas do modulo.')
      throw error
    } finally {
      managedStoresPending.value = false
    }
  }

  async function refreshOverview() {
    if (!operationsStore.sessionReady || !activeTenantId.value) {
      overview.value = null
      ready.value = false
      errorMessage.value = ''
      return null
    }

    overviewPending.value = true
    errorMessage.value = ''

    try {
      const response = await bffFetch<FilaAtendimentoMultiStoreOverviewResponse>(
        `/api/admin/modules/fila-atendimento/reports-multistore-overview?${buildOverviewQuery()}`
      )
      overview.value = normalizeOverview(response)
      return overview.value
    } catch (error) {
      errorMessage.value = normalizeErrorMessage(error, 'Nao foi possivel carregar a visao multiloja.')
      throw error
    } finally {
      overviewPending.value = false
    }
  }

  async function refreshAll(force = false) {
    if (!operationsStore.sessionReady || !activeTenantId.value) {
      clearState()
      return null
    }

    if (!force && ready.value && lastLoadedTenantId.value === activeTenantId.value) {
      return {
        overview: overview.value,
        managedStores: managedStores.value
      }
    }

    errorMessage.value = ''

    try {
      const [nextOverview, nextStores] = await Promise.all([
        refreshOverview(),
        refreshManagedStores()
      ])

      ready.value = true
      lastLoadedTenantId.value = activeTenantId.value

      return {
        overview: nextOverview,
        managedStores: nextStores
      }
    } catch (error) {
      ready.value = false
      throw error
    }
  }

  async function ensureLoaded() {
    if (!operationsStore.sessionReady || !activeTenantId.value) {
      clearState()
      return false
    }

    try {
      await refreshAll()
      return true
    } catch {
      return false
    }
  }

  async function syncAfterMutation() {
    await operationsStore.loadContext().catch(() => undefined)
    await refreshAll(true)
  }

  async function cloneActiveRosterToStore(storeId: string) {
    for (const consultant of operationsStore.state.roster) {
      await bffFetch('/api/admin/modules/fila-atendimento/consultants', {
        method: 'POST',
        body: {
          storeId,
          ...normalizeConsultantPayload(consultant)
        }
      })
    }
  }

  async function createStore(payload: Record<string, unknown>) {
    await ensureLoaded()

    if (!operationsStore.sessionReady || !activeTenantId.value) {
      return { ok: false, message: 'Sessao do modulo indisponivel.' } as FilaAtendimentoMultiStoreMutationResult
    }

    if (!canManage.value) {
      return { ok: false, message: 'Seu acesso nao pode gerenciar lojas.' } as FilaAtendimentoMultiStoreMutationResult
    }

    const requestBody = buildCreatePayload(payload, activeTenantId.value)
    if (!normalizeText(requestBody.name) || !normalizeText(requestBody.code)) {
      return { ok: false, message: 'Preencha nome e codigo da loja.' } as FilaAtendimentoMultiStoreMutationResult
    }

    try {
      const response = await bffFetch<{ store?: unknown }>('/api/admin/modules/fila-atendimento/stores', {
        method: 'POST',
        body: requestBody
      })

      const createdStore = normalizeStore(response?.store)
      let warningMessage = ''

      if (payload.cloneActiveRoster && operationsStore.state.roster.length > 0 && createdStore.id) {
        try {
          await cloneActiveRosterToStore(createdStore.id)
        } catch (error) {
          warningMessage = normalizeErrorMessage(error, 'Loja criada, mas nao foi possivel copiar os consultores da loja ativa.')
        }
      }

      await syncAfterMutation()

      return {
        ok: true,
        store: createdStore,
        warningMessage
      } as FilaAtendimentoMultiStoreMutationResult
    } catch (error) {
      return {
        ok: false,
        message: normalizeErrorMessage(error, 'Nao foi possivel criar a loja.')
      } as FilaAtendimentoMultiStoreMutationResult
    }
  }

  async function updateStore(storeId: string, payload: Record<string, unknown>) {
    await ensureLoaded()

    if (!operationsStore.sessionReady || !activeTenantId.value) {
      return { ok: false, message: 'Sessao do modulo indisponivel.' } as FilaAtendimentoMultiStoreMutationResult
    }

    if (!canManage.value) {
      return { ok: false, message: 'Seu acesso nao pode gerenciar lojas.' } as FilaAtendimentoMultiStoreMutationResult
    }

    const currentStore = managedStores.value.find((item) => item.id === normalizeText(storeId))
    if (!currentStore) {
      return { ok: false, message: 'Loja nao encontrada.' } as FilaAtendimentoMultiStoreMutationResult
    }

    const requestBody = buildUpdatePayload(payload, currentStore)
    if (!Object.keys(requestBody).length) {
      return { ok: true, noChange: true } as FilaAtendimentoMultiStoreMutationResult
    }

    try {
      const response = await bffFetch<{ store?: unknown }>(
        `/api/admin/modules/fila-atendimento/stores/${encodeURIComponent(normalizeText(storeId))}`,
        {
          method: 'PATCH',
          body: requestBody
        }
      )

      await syncAfterMutation()

      return {
        ok: true,
        store: normalizeStore(response?.store)
      } as FilaAtendimentoMultiStoreMutationResult
    } catch (error) {
      return {
        ok: false,
        message: normalizeErrorMessage(error, 'Nao foi possivel atualizar a loja.')
      } as FilaAtendimentoMultiStoreMutationResult
    }
  }

  async function archiveStore(storeId: string) {
    await ensureLoaded()

    if (!operationsStore.sessionReady || !activeTenantId.value) {
      return { ok: false, message: 'Sessao do modulo indisponivel.' } as FilaAtendimentoMultiStoreMutationResult
    }

    if (!canManage.value) {
      return { ok: false, message: 'Seu acesso nao pode gerenciar lojas.' } as FilaAtendimentoMultiStoreMutationResult
    }

    try {
      const response = await bffFetch<{ store?: unknown }>(
        `/api/admin/modules/fila-atendimento/stores/${encodeURIComponent(normalizeText(storeId))}/archive`,
        {
          method: 'POST'
        }
      )

      await syncAfterMutation()

      return {
        ok: true,
        store: normalizeStore(response?.store)
      } as FilaAtendimentoMultiStoreMutationResult
    } catch (error) {
      return {
        ok: false,
        message: normalizeErrorMessage(error, 'Nao foi possivel arquivar a loja.')
      } as FilaAtendimentoMultiStoreMutationResult
    }
  }

  async function restoreStore(storeId: string) {
    await ensureLoaded()

    if (!operationsStore.sessionReady || !activeTenantId.value) {
      return { ok: false, message: 'Sessao do modulo indisponivel.' } as FilaAtendimentoMultiStoreMutationResult
    }

    if (!canManage.value) {
      return { ok: false, message: 'Seu acesso nao pode gerenciar lojas.' } as FilaAtendimentoMultiStoreMutationResult
    }

    try {
      const response = await bffFetch<{ store?: unknown }>(
        `/api/admin/modules/fila-atendimento/stores/${encodeURIComponent(normalizeText(storeId))}/restore`,
        {
          method: 'POST'
        }
      )

      await syncAfterMutation()

      return {
        ok: true,
        store: normalizeStore(response?.store)
      } as FilaAtendimentoMultiStoreMutationResult
    } catch (error) {
      return {
        ok: false,
        message: normalizeErrorMessage(error, 'Nao foi possivel restaurar a loja.')
      } as FilaAtendimentoMultiStoreMutationResult
    }
  }

  async function deleteStore(storeId: string) {
    await ensureLoaded()

    if (!operationsStore.sessionReady || !activeTenantId.value) {
      return { ok: false, message: 'Sessao do modulo indisponivel.' } as FilaAtendimentoMultiStoreMutationResult
    }

    if (!canManage.value) {
      return { ok: false, message: 'Seu acesso nao pode gerenciar lojas.' } as FilaAtendimentoMultiStoreMutationResult
    }

    try {
      const response = await bffFetch<{ storeId?: unknown }>(
        `/api/admin/modules/fila-atendimento/stores/${encodeURIComponent(normalizeText(storeId))}`,
        {
          method: 'DELETE'
        }
      )

      await syncAfterMutation()

      return {
        ok: true,
        storeId: normalizeText(response?.storeId)
      } as FilaAtendimentoMultiStoreMutationResult
    } catch (error) {
      const dependencies = normalizeDeleteDependencies(
        (error as { data?: { details?: { dependencies?: unknown } } })?.data?.details?.dependencies
      )

      const dependencyMessage = dependencies.length
        ? ` Vinculos encontrados: ${dependencies.map((item) => `${item.label || item.key} (${item.count || 0})`).join(', ')}.`
        : ''

      return {
        ok: false,
        blockedDependencies: dependencies,
        message: `${normalizeErrorMessage(error, 'Nao foi possivel remover a loja.')}${dependencyMessage}`
      } as FilaAtendimentoMultiStoreMutationResult
    }
  }

  async function setActiveStore(storeId: string) {
    if (!normalizeText(storeId)) {
      return {
        ok: false,
        message: 'Selecione uma loja valida.'
      }
    }

    try {
      await operationsStore.selectStore(storeId)
      return { ok: true }
    } catch (error) {
      return {
        ok: false,
        message: normalizeErrorMessage(error, 'Nao foi possivel ativar a loja selecionada.')
      }
    }
  }

  if (import.meta.client) {
    watch(
      () => [operationsStore.sessionReady, activeTenantId.value] as const,
      ([sessionReady, tenantId], [previousReady, previousTenantId]) => {
        if (!sessionReady) {
          clearState()
          return
        }

        if (normalizeText(tenantId) !== normalizeText(previousTenantId) || sessionReady !== previousReady) {
          overview.value = null
          managedStores.value = []
          ready.value = false
          errorMessage.value = ''
          lastLoadedTenantId.value = ''
        }
      }
    )
  }

  return {
    overview,
    managedStores,
    ready,
    pending,
    errorMessage,
    canManage,
    activeTenantId,
    refreshOverview,
    refreshManagedStores,
    refreshAll,
    ensureLoaded,
    createStore,
    updateStore,
    archiveStore,
    restoreStore,
    deleteStore,
    setActiveStore,
    clearState
  }
})