import type { IndicatorsGovernancePolicyState } from '~/types/indicators-management'
import {
  buildModuleSummary,
  buildTemplateMutationPayload,
  cloneIndicators,
  createTemplateDuplicateCode,
  createTemplateDuplicateName,
  mapGovernanceOverview,
  mapTemplateListItem,
  type ApiTemplateDetail,
  type IndicatorsGovernanceOverviewState,
  useIndicatorsApi
} from '~/composables/useIndicatorsData'

export function useIndicatorsGovernance() {
  const api = useIndicatorsApi()
  const ui = useUiStore()
  const realtime = useTenantRealtime()
  const sessionSimulation = useSessionSimulationStore()
  realtime.start()

  const loading = ref(false)
  const saving = ref(false)
  const errorMessage = ref('')
  const overview = ref<IndicatorsGovernanceOverviewState>({
    stats: [],
    policies: [],
    providers: [],
    tenantAdoption: [],
    roadmap: []
  })
  const templates = ref([] as ReturnType<typeof mapTemplateListItem>[])
  const selectedTemplateId = ref('')
  const selectedTemplateDetail = ref<ApiTemplateDetail | null>(null)

  const selectedTemplate = computed(() => {
    return templates.value.find(template => template.id === selectedTemplateId.value) ?? templates.value[0] ?? null
  })

  const summary = computed(() => {
    return buildModuleSummary({
      clientLabel: 'Root platform',
      activeProfileName: selectedTemplate.value?.name || 'Catalogo global de indicadores',
      templateLabel: selectedTemplate.value ? `Template ${selectedTemplate.value.code}` : `${templates.value.length} template(s) carregado(s)`,
      storesConfigured: overview.value.tenantAdoption.length,
      providerOnlineCount: overview.value.providers.filter(provider => provider.status === 'online').length,
      providerTotal: overview.value.providers.length,
      pendingChanges: templates.value.filter(template => template.status === 'draft').length,
      lastSyncLabel: 'Sincronizado com governanca core'
    })
  })

  const governanceStats = computed(() => overview.value.stats)
  const policies = computed(() => overview.value.policies)
  const providerRegistry = computed(() => overview.value.providers)
  const tenantAdoption = computed(() => overview.value.tenantAdoption)
  const roadmap = computed(() => overview.value.roadmap)

  async function loadGovernanceOverview() {
    const payload = await api.getGovernanceOverview()
    overview.value = mapGovernanceOverview(payload)
  }

  async function loadTemplatesList() {
    const items = await api.listTemplates()
    templates.value = items.map(item => mapTemplateListItem(item))

    if (!selectedTemplateId.value || !templates.value.some(template => template.id === selectedTemplateId.value)) {
      selectedTemplateId.value = templates.value[0]?.id || ''
    }
  }

  async function loadSelectedTemplateDetail(silent = false) {
    if (!selectedTemplateId.value) {
      selectedTemplateDetail.value = null
      return
    }

    try {
      const detail = await api.getTemplate(selectedTemplateId.value)
      selectedTemplateDetail.value = detail
      const mapped = mapTemplateListItem(detail, detail)
      templates.value = templates.value.map(template => template.id === mapped.id ? mapped : template)
    } catch (error: unknown) {
      if (!silent) {
        throw error
      }
    }
  }

  async function loadGovernance(silent = false) {
    loading.value = true
    if (!silent) {
      errorMessage.value = ''
    }

    try {
      await Promise.all([
        loadGovernanceOverview(),
        loadTemplatesList()
      ])
      if (selectedTemplateId.value) {
        await loadSelectedTemplateDetail(true)
      }
      errorMessage.value = ''
    } catch (error: unknown) {
      errorMessage.value = error instanceof Error ? error.message : 'Falha ao carregar a governanca do modulo.'
      if (!silent) {
        ui.error(errorMessage.value, 'Indicadores')
      }
    } finally {
      loading.value = false
    }
  }

  function selectTemplate(templateId: string) {
    selectedTemplateId.value = templateId
  }

  async function updatePolicyState(policyId: string, state: IndicatorsGovernancePolicyState) {
    const current = overview.value.policies.find(policy => policy.id === policyId)
    if (!current || current.state === state) {
      return
    }

    saving.value = true
    errorMessage.value = ''

    try {
      const updated = await api.updateGovernancePolicy(policyId, state)
      overview.value = {
        ...overview.value,
        policies: overview.value.policies.map(policy => {
          if (policy.id !== policyId) {
            return policy
          }

          return {
            ...policy,
            state: updated.state === 'system' || updated.state === 'custom' ? updated.state : 'recommended',
            value: updated.value,
            affectedArea: updated.affectedArea,
            description: updated.description,
            title: updated.title
          }
        })
      }
      ui.success(`Politica ${current.title} atualizada no core.`, 'Indicadores')
    } catch (error: unknown) {
      errorMessage.value = error instanceof Error ? error.message : 'Falha ao atualizar politica de governanca.'
      ui.error(errorMessage.value, 'Indicadores')
    } finally {
      saving.value = false
    }
  }

  async function publishDraftVersion() {
    if (!selectedTemplateDetail.value || !selectedTemplate.value) {
      ui.info('Selecione um template para publicar a versao de trabalho.', 'Indicadores')
      return
    }

    saving.value = true
    errorMessage.value = ''

    try {
      await api.updateTemplate(
        selectedTemplate.value.id,
        buildTemplateMutationPayload(selectedTemplateDetail.value, {
          publish: true,
          notes: 'Publicacao iniciada pelo painel web.'
        })
      )
      await loadGovernance(true)
      await loadSelectedTemplateDetail(true)
      ui.success(`Template ${selectedTemplate.value.name} publicado no core.`, 'Indicadores')
    } catch (error: unknown) {
      errorMessage.value = error instanceof Error ? error.message : 'Falha ao publicar template.'
      ui.error(errorMessage.value, 'Indicadores')
    } finally {
      saving.value = false
    }
  }

  async function duplicateTemplate() {
    if (!selectedTemplateDetail.value || !selectedTemplate.value) {
      ui.info('Selecione um template para duplicar.', 'Indicadores')
      return
    }

    saving.value = true
    errorMessage.value = ''

    try {
      const created = await api.createTemplate(
        buildTemplateMutationPayload(selectedTemplateDetail.value, {
          code: createTemplateDuplicateCode(selectedTemplateDetail.value.code),
          name: createTemplateDuplicateName(selectedTemplateDetail.value.name),
          status: 'draft',
          publish: false,
          notes: `Duplicado a partir de ${selectedTemplateDetail.value.code}.`
        })
      )

      await loadGovernance(true)
      selectedTemplateId.value = created.recordId
      await loadSelectedTemplateDetail(true)
      ui.success(`Template ${selectedTemplate.value.name} duplicado no core.`, 'Indicadores')
    } catch (error: unknown) {
      errorMessage.value = error instanceof Error ? error.message : 'Falha ao duplicar template.'
      ui.error(errorMessage.value, 'Indicadores')
    } finally {
      saving.value = false
    }
  }

  watch(
    selectedTemplateId,
    (value) => {
      if (!value) return
      void loadSelectedTemplateDetail(true)
    }
  )

  watch(
    () => sessionSimulation.requestContextHash,
    () => {
      void loadGovernance(true)
    }
  )

  const stopRealtimeSubscription = realtime.subscribeEntity('indicators', () => {
    void loadGovernance(true)
  })

  onScopeDispose(() => {
    stopRealtimeSubscription()
  })

  void loadGovernance(true)

  return {
    loading,
    saving,
    errorMessage,
    summary,
    templates,
    selectedTemplateId,
    selectedTemplate,
    governanceStats,
    policies,
    providerRegistry,
    tenantAdoption,
    roadmap,
    selectTemplate,
    updatePolicyState,
    publishDraftVersion,
    duplicateTemplate
  }
}