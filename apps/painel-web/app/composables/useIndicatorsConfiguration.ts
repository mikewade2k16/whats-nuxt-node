import type {
  IndicatorsEvidencePolicy,
  IndicatorsInputType,
  IndicatorsProfileIndicatorConfig,
  IndicatorsScopeMode,
  IndicatorsSourceKind,
  IndicatorsValueType
} from '~/types/indicators-management'
import {
  buildCategories,
  buildConfigSnapshot,
  buildModuleSummary,
  buildModuleSummaryWithPending,
  buildProfileSavePayload,
  buildStoreOverrideSavePayload,
  buildWeightStatus,
  cloneIndicators,
  mapActiveProfileState,
  type IndicatorsProfileDraftMeta,
  useIndicatorsApi
} from '~/composables/useIndicatorsData'

type IndicatorField = 'name' | 'weight' | 'scopeMode' | 'sourceKind' | 'valueType' | 'evidencePolicy' | 'enabled' | 'supportsStoreBreakdown'
type ItemField = 'label' | 'inputType' | 'evidencePolicy' | 'required' | 'weight'

function defaultProfileMeta(): IndicatorsProfileDraftMeta {
  return {
    recordId: '',
    name: 'Perfil ativo',
    description: '',
    status: 'active',
    scopeMode: 'client_global',
    storeBreakdownEnabled: true,
    providerSyncEnabled: true,
    metadata: {}
  }
}

function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function useIndicatorsConfiguration() {
  const api = useIndicatorsApi()
  const ui = useUiStore()
  const realtime = useTenantRealtime()
  const sessionSimulation = useSessionSimulationStore()
  realtime.start()

  const loading = ref(false)
  const saving = ref(false)
  const errorMessage = ref('')
  const baseSummary = ref(buildModuleSummary())
  const clientLabel = ref('Cliente nao selecionado')
  const profileMeta = ref<IndicatorsProfileDraftMeta>(defaultProfileMeta())
  const indicators = ref<IndicatorsProfileIndicatorConfig[]>([])
  const stores = ref([] as ReturnType<typeof mapActiveProfileState>['stores'])
  const targetSets = ref([] as ReturnType<typeof mapActiveProfileState>['targetSets'])
  const providers = ref([] as ReturnType<typeof mapActiveProfileState>['providers'])
  const profileDirty = ref(false)
  const dirtyStoreIds = ref<string[]>([])

  const categories = computed(() => buildCategories(indicators.value))
  const configSnapshot = computed(() => buildConfigSnapshot(indicators.value, stores.value))
  const weightStatus = computed(() => buildWeightStatus(indicators.value))
  const pendingChangeCount = computed(() => (profileDirty.value ? 1 : 0) + dirtyStoreIds.value.length)
  const summary = computed(() => buildModuleSummaryWithPending(baseSummary.value, pendingChangeCount.value))

  function markProfileDirty() {
    profileDirty.value = true
  }

  function markStoreDirty(storeId: string) {
    if (!dirtyStoreIds.value.includes(storeId)) {
      dirtyStoreIds.value = [...dirtyStoreIds.value, storeId]
    }
  }

  function applyRemoteState() {
    profileDirty.value = false
    dirtyStoreIds.value = []
  }

  function hydrateFromRemote() {
    return api.getActiveProfile().then((payload) => mapActiveProfileState(payload))
  }

  async function loadConfiguration(silent = false) {
    loading.value = true
    if (!silent) {
      errorMessage.value = ''
    }

    try {
      const state = await hydrateFromRemote()
      baseSummary.value = state.summary
      clientLabel.value = state.clientLabel
      profileMeta.value = cloneIndicators(state.profileMeta)
      indicators.value = cloneIndicators(state.indicators)
      stores.value = cloneIndicators(state.stores)
      targetSets.value = cloneIndicators(state.targetSets)
      providers.value = cloneIndicators(state.providers)
      applyRemoteState()
      errorMessage.value = ''
    } catch (error: unknown) {
      errorMessage.value = error instanceof Error ? error.message : 'Falha ao carregar configuracoes do modulo.'
      if (!silent) {
        ui.error(errorMessage.value, 'Indicadores')
      }
    } finally {
      loading.value = false
    }
  }

  function updateIndicatorField(
    indicatorId: string,
    field: IndicatorField,
    value: string | number | boolean
  ) {
    const indicator = indicators.value.find(entry => entry.id === indicatorId)
    if (!indicator) return

    if (field === 'name') indicator.name = String(value ?? '')
    if (field === 'weight') indicator.weight = toNumber(value)
    if (field === 'scopeMode') indicator.scopeMode = String(value ?? 'client_global') as IndicatorsScopeMode
    if (field === 'sourceKind') indicator.sourceKind = String(value ?? 'manual') as IndicatorsSourceKind
    if (field === 'valueType') indicator.valueType = String(value ?? 'score') as IndicatorsValueType
    if (field === 'evidencePolicy') indicator.evidencePolicy = String(value ?? 'optional') as IndicatorsEvidencePolicy
    if (field === 'enabled') indicator.enabled = Boolean(value)
    if (field === 'supportsStoreBreakdown') indicator.supportsStoreBreakdown = Boolean(value)
    markProfileDirty()
  }

  function updateItemField(
    indicatorId: string,
    itemId: string,
    field: ItemField,
    value: string | number | boolean
  ) {
    const indicator = indicators.value.find(entry => entry.id === indicatorId)
    const item = indicator?.items.find(entry => entry.id === itemId)
    if (!indicator || !item) return

    if (field === 'label') item.label = String(value ?? '')
    if (field === 'inputType') item.inputType = String(value ?? 'text') as IndicatorsInputType
    if (field === 'evidencePolicy') item.evidencePolicy = String(value ?? 'inherit') as IndicatorsEvidencePolicy
    if (field === 'required') item.required = Boolean(value)
    if (field === 'weight') item.weight = toNumber(value)
    markProfileDirty()
  }

  function addIndicatorItem(indicatorId: string) {
    const indicator = indicators.value.find(entry => entry.id === indicatorId)
    if (!indicator) return

    indicator.items.push({
      id: `${indicatorId}-item-${Date.now()}`,
      label: 'Novo item',
      inputType: 'text',
      evidencePolicy: 'inherit',
      required: false,
      weight: 0
    })
    markProfileDirty()
  }

  function removeIndicator(indicatorId: string) {
    indicators.value = indicators.value.filter(entry => entry.id !== indicatorId)
    markProfileDirty()
  }

  function removeIndicatorItem(indicatorId: string, itemId: string) {
    const indicator = indicators.value.find(entry => entry.id === indicatorId)
    if (!indicator) return

    indicator.items = indicator.items.filter(entry => entry.id !== itemId)
    markProfileDirty()
  }

  function rebalanceIndicatorItems(indicatorId: string) {
    const indicator = indicators.value.find(entry => entry.id === indicatorId)
    if (!indicator || indicator.items.length === 0) return

    const distributedWeight = Number((100 / indicator.items.length).toFixed(2))
    let totalAssigned = 0
    indicator.items = indicator.items.map((item, index) => {
      const weight = index === indicator.items.length - 1
        ? Number((100 - totalAssigned).toFixed(2))
        : distributedWeight
      totalAssigned = Number((totalAssigned + weight).toFixed(2))
      return {
        ...item,
        weight
      }
    })
    markProfileDirty()
  }

  function updateStoreField(storeId: string, field: 'scopeMode' | 'status' | 'note', value: string) {
    const store = stores.value.find(entry => entry.id === storeId)
    if (!store) return

    if (field === 'scopeMode') store.scopeMode = String(value ?? 'client_global') as IndicatorsScopeMode
    if (field === 'status') store.status = String(value ?? 'inherit') as typeof store.status
    if (field === 'note') store.note = String(value ?? '')
    markStoreDirty(storeId)
  }

  function updateStoreRuleField(
    storeId: string,
    ruleId: string,
    field: 'enabled' | 'weight' | 'note',
    value: string | number | boolean | null
  ) {
    const store = stores.value.find(entry => entry.id === storeId)
    const rule = store?.overrides.find(entry => entry.id === ruleId)
    if (!store || !rule) return

    if (field === 'enabled') rule.enabled = Boolean(value)
    if (field === 'weight') rule.weight = value === null ? null : toNumber(value)
    if (field === 'note') rule.note = String(value ?? '')
    rule.changed = true
    markStoreDirty(storeId)
  }

  async function saveDraft() {
    if (pendingChangeCount.value === 0) {
      ui.info('Nao ha mudancas locais para salvar.', 'Indicadores')
      return
    }

    if (Math.abs(configSnapshot.value.enabledWeight - 100) > 0.05) {
      ui.error('O peso habilitado precisa fechar exatamente em 100% antes de salvar.', 'Indicadores')
      return
    }

    if (weightStatus.value.hasBlockingIssues) {
      ui.error('Existem indicadores com pesos internos pendentes. Corrija antes de salvar.', 'Indicadores')
      return
    }

    saving.value = true
    errorMessage.value = ''

    try {
      if (profileDirty.value) {
        await api.replaceActiveProfile(buildProfileSavePayload(profileMeta.value, indicators.value))
      }

      for (const storeId of dirtyStoreIds.value) {
        const store = stores.value.find(entry => entry.id === storeId)
        if (!store) continue
        await api.replaceStoreOverride(store.id, buildStoreOverrideSavePayload(store))
      }

      await loadConfiguration(true)
      ui.success('Configuracoes de indicadores sincronizadas com o backend core.', 'Indicadores')
    } catch (error: unknown) {
      errorMessage.value = error instanceof Error ? error.message : 'Falha ao salvar configuracoes do modulo.'
      ui.error(errorMessage.value, 'Indicadores')
    } finally {
      saving.value = false
    }
  }

  async function reloadConfiguration() {
    await loadConfiguration(false)
  }

  watch(
    () => sessionSimulation.requestContextHash,
    () => {
      void loadConfiguration(true)
    }
  )

  const stopRealtimeSubscription = realtime.subscribeEntity('indicators', () => {
    void loadConfiguration(true)
  })

  onScopeDispose(() => {
    stopRealtimeSubscription()
  })

  void loadConfiguration(true)

  return {
    loading,
    saving,
    errorMessage,
    summary,
    clientLabel,
    indicators,
    stores,
    targetSets,
    providers,
    categories,
    configSnapshot,
    weightStatus,
    updateIndicatorField,
    updateItemField,
    addIndicatorItem,
    removeIndicator,
    removeIndicatorItem,
    rebalanceIndicatorItems,
    updateStoreField,
    updateStoreRuleField,
    saveDraft,
    reloadConfiguration
  }
}