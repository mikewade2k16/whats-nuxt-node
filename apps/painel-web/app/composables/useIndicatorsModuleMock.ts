import type {
  IndicatorEvaluationRecord,
} from '~/types/indicators'
import type {
  IndicatorsConfigSnapshot,
  IndicatorsDefaultPolicy,
  IndicatorsGovernanceStat,
  IndicatorsModuleSummary,
  IndicatorsProfileIndicatorConfig,
  IndicatorsProfileItemConfig,
  IndicatorsProviderHealth,
  IndicatorsTargetSetSummary,
  IndicatorsTemplateCatalogItem,
  IndicatorsTenantAdoption,
  IndicatorsRoadmapCard,
  IndicatorsStoreOverride,
  IndicatorsEvidencePolicy,
  IndicatorsInputType,
  IndicatorsScopeMode,
  IndicatorsSourceKind,
  IndicatorsValueType
} from '~/types/indicators-management'

function cloneMock<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

const MAX_WEIGHT = 100
const WEIGHT_TOLERANCE = 0.05

function roundWeight(value: number) {
  return Math.round(value * 100) / 100
}

function hasTargetWeight(value: number) {
  return Math.abs(value - MAX_WEIGHT) <= WEIGHT_TOLERANCE
}

function buildEqualWeightDistribution(itemsCount: number) {
  if (itemsCount <= 0) {
    return [] as number[]
  }

  const baseWeight = roundWeight(MAX_WEIGHT / itemsCount)

  return Array.from({ length: itemsCount }, (_, index) => {
    if (index === itemsCount - 1) {
      return roundWeight(MAX_WEIGHT - (baseWeight * (itemsCount - 1)))
    }

    return baseWeight
  })
}

const INITIAL_EVALUATIONS: IndicatorEvaluationRecord[] = [
  {
    id: 204,
    evaluatorName: 'Joyce',
    unitId: 'riomar',
    unitName: 'Riomar',
    periodStart: '2026-04-01',
    periodEnd: '2026-04-07',
    indicatorCodes: ['indicator_1', 'indicator_2', 'indicator_4'],
    indicatorLabels: [
      '1. Ambiente Aconchegante',
      '2. Time de Especialistas',
      '4. Posicionamento e Branding'
    ]
  },
  {
    id: 205,
    evaluatorName: 'Mike',
    unitId: 'jardins',
    unitName: 'Jardins',
    periodStart: '2026-04-03',
    periodEnd: '2026-04-08',
    indicatorCodes: ['indicator_1', 'indicator_3', 'indicator_5'],
    indicatorLabels: [
      '1. Ambiente Aconchegante',
      '3. Qualidade de Produtos e Servicos',
      '5. Indicadores de Resultado'
    ]
  },
  {
    id: 206,
    evaluatorName: 'Bruno',
    unitId: 'garcia',
    unitName: 'Garcia',
    periodStart: '2026-04-05',
    periodEnd: '2026-04-11',
    indicatorCodes: ['indicator_1', 'indicator_2', 'indicator_3', 'indicator_4', 'indicator_5'],
    indicatorLabels: [
      '1. Ambiente Aconchegante',
      '2. Time de Especialistas',
      '3. Qualidade de Produtos e Servicos',
      '4. Posicionamento e Branding',
      '5. Indicadores de Resultado'
    ]
  },
  {
    id: 207,
    evaluatorName: 'Aline',
    unitId: 'treze',
    unitName: 'Treze',
    periodStart: '2026-04-02',
    periodEnd: '2026-04-09',
    indicatorCodes: ['indicator_2', 'indicator_4', 'indicator_5'],
    indicatorLabels: [
      '2. Time de Especialistas',
      '4. Posicionamento e Branding',
      '5. Indicadores de Resultado'
    ]
  },
  {
    id: 208,
    evaluatorName: 'Carlos',
    unitId: 'riomar',
    unitName: 'Riomar',
    periodStart: '2026-03-22',
    periodEnd: '2026-03-29',
    indicatorCodes: ['indicator_1', 'indicator_5'],
    indicatorLabels: [
      '1. Ambiente Aconchegante',
      '5. Indicadores de Resultado'
    ]
  }
]

interface IndicatorsRealtimeStateSnapshot {
  changeCount: number
  indicators: IndicatorsProfileIndicatorConfig[]
  stores: IndicatorsStoreOverride[]
  targetSets: IndicatorsTargetSetSummary[]
  providers: IndicatorsProviderHealth[]
  evaluations: IndicatorEvaluationRecord[]
}

interface IndicatorsRealtimePayload {
  kind: 'state.sync'
  source: 'configuration' | 'operation'
  state: IndicatorsRealtimeStateSnapshot
}

let indicatorsRealtimeBound = false
let indicatorsRealtimeBroadcastTimer: ReturnType<typeof setTimeout> | null = null

function normalizeChangeCount(value: unknown) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0
  }

  return parsed
}

function normalizeIndicatorsRealtimePayload(raw: unknown) {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const payload = raw as Record<string, unknown>
  const state = payload.state
  if (payload.kind !== 'state.sync' || !state || typeof state !== 'object') {
    return null
  }

  const snapshot = state as Record<string, unknown>
  if (
    !Array.isArray(snapshot.indicators)
    || !Array.isArray(snapshot.stores)
    || !Array.isArray(snapshot.targetSets)
    || !Array.isArray(snapshot.providers)
    || !Array.isArray(snapshot.evaluations)
  ) {
    return null
  }

  return {
    kind: 'state.sync',
    source: payload.source === 'operation' ? 'operation' : 'configuration',
    state: {
      changeCount: normalizeChangeCount(snapshot.changeCount),
      indicators: cloneMock(snapshot.indicators as IndicatorsProfileIndicatorConfig[]),
      stores: cloneMock(snapshot.stores as IndicatorsStoreOverride[]),
      targetSets: cloneMock(snapshot.targetSets as IndicatorsTargetSetSummary[]),
      providers: cloneMock(snapshot.providers as IndicatorsProviderHealth[]),
      evaluations: cloneMock(snapshot.evaluations as IndicatorEvaluationRecord[])
    }
  } satisfies IndicatorsRealtimePayload
}

function useIndicatorsMockRuntimeState() {
  const changeCount = useState<number>('indicators-mock:change-count', () => 4)
  const indicators = useState<IndicatorsProfileIndicatorConfig[]>('indicators-mock:indicators', () => cloneMock(PROFILE_INDICATORS))
  const stores = useState<IndicatorsStoreOverride[]>('indicators-mock:stores', () => cloneMock(STORE_OVERRIDES))
  const targetSets = useState<IndicatorsTargetSetSummary[]>('indicators-mock:target-sets', () => cloneMock(TARGET_SETS))
  const providers = useState<IndicatorsProviderHealth[]>('indicators-mock:providers', () => cloneMock(PROVIDERS))
  const evaluations = useState<IndicatorEvaluationRecord[]>('indicators-mock:evaluations', () => cloneMock(INITIAL_EVALUATIONS))

  return {
    changeCount,
    indicators,
    stores,
    targetSets,
    providers,
    evaluations
  }
}

function snapshotIndicatorsRealtimeState(runtimeState: ReturnType<typeof useIndicatorsMockRuntimeState>) {
  return {
    changeCount: normalizeChangeCount(runtimeState.changeCount.value),
    indicators: cloneMock(runtimeState.indicators.value),
    stores: cloneMock(runtimeState.stores.value),
    targetSets: cloneMock(runtimeState.targetSets.value),
    providers: cloneMock(runtimeState.providers.value),
    evaluations: cloneMock(runtimeState.evaluations.value)
  } satisfies IndicatorsRealtimeStateSnapshot
}

function applyIndicatorsRealtimeState(
  runtimeState: ReturnType<typeof useIndicatorsMockRuntimeState>,
  snapshot: IndicatorsRealtimeStateSnapshot
) {
  runtimeState.changeCount.value = normalizeChangeCount(snapshot.changeCount)
  runtimeState.indicators.value = cloneMock(snapshot.indicators)
  runtimeState.stores.value = cloneMock(snapshot.stores)
  runtimeState.targetSets.value = cloneMock(snapshot.targetSets)
  runtimeState.providers.value = cloneMock(snapshot.providers)
  runtimeState.evaluations.value = cloneMock(snapshot.evaluations)
}

function useIndicatorsRealtimeBridge(runtimeState: ReturnType<typeof useIndicatorsMockRuntimeState>) {
  const realtime = useTenantRealtime()
  realtime.start()

  if (import.meta.client && !indicatorsRealtimeBound) {
    indicatorsRealtimeBound = true

    realtime.subscribeEntity('indicators', (event) => {
      const payload = normalizeIndicatorsRealtimePayload(event.payload)
      if (!payload) {
        return
      }

      applyIndicatorsRealtimeState(runtimeState, payload.state)
    })
  }

  function publishNow(source: IndicatorsRealtimePayload['source']) {
    realtime.publish({
      entity: 'indicators',
      action: 'updated',
      payload: {
        kind: 'state.sync',
        source,
        state: snapshotIndicatorsRealtimeState(runtimeState)
      } satisfies IndicatorsRealtimePayload
    })
  }

  function schedulePublish(source: IndicatorsRealtimePayload['source']) {
    if (!import.meta.client) {
      return
    }

    if (indicatorsRealtimeBroadcastTimer) {
      clearTimeout(indicatorsRealtimeBroadcastTimer)
    }

    indicatorsRealtimeBroadcastTimer = setTimeout(() => {
      indicatorsRealtimeBroadcastTimer = null
      publishNow(source)
    }, 140)
  }

  return {
    publishNow,
    schedulePublish
  }
}

const PROFILE_INDICATORS: IndicatorsProfileIndicatorConfig[] = [
  {
    id: 'ambiente_acolhimento',
    code: 'ambiente_acolhimento',
    categoryCode: 'operacao-loja',
    categoryLabel: 'Operacao de loja',
    name: 'Ambiente acolhedor',
    description: 'Replica o legado com checklist visual, evidencia opcional e score consolidado por unidade.',
    enabled: true,
    weight: 15,
    scopeMode: 'per_store',
    sourceKind: 'manual',
    valueType: 'score',
    evidencePolicy: 'required',
    supportsStoreBreakdown: true,
    tags: ['legado', 'visual', 'evidencia'],
    items: [
      { id: 'coffee_restock', label: 'Reposicao de cafe', inputType: 'boolean', evidencePolicy: 'required', required: true, weight: 25 },
      { id: 'food_display', label: 'Bolo, bebidas e comidas', inputType: 'boolean', evidencePolicy: 'required', required: true, weight: 25 },
      { id: 'packaging_standard', label: 'Embalagens no padrao', inputType: 'boolean', evidencePolicy: 'optional', required: true, weight: 25 },
      { id: 'mezzanine', label: 'Mezanino organizado', inputType: 'boolean', evidencePolicy: 'optional', required: true, weight: 25 }
    ]
  },
  {
    id: 'time_especialistas',
    code: 'time_especialistas',
    categoryCode: 'provas-loja',
    categoryLabel: 'Provas e pessoas',
    name: 'Time de especialistas',
    description: 'Mistura inputs manuais com snapshots de STI e pesquisa 360, preservando o historico da coleta.',
    enabled: true,
    weight: 20,
    scopeMode: 'per_store',
    sourceKind: 'hybrid',
    sourceModule: 'atendimento-online',
    valueType: 'score',
    evidencePolicy: 'none',
    supportsStoreBreakdown: true,
    tags: ['snapshot', 'sti', '360'],
    items: [
      { id: 'highest_value', label: 'Maior valor do time', inputType: 'currency', evidencePolicy: 'none', required: true, weight: 25 },
      { id: 'lowest_value', label: 'Menor valor do time', inputType: 'currency', evidencePolicy: 'none', required: true, weight: 25 },
      { id: 'sti_average', label: 'Media STI', inputType: 'provider_metric', evidencePolicy: 'none', required: true, weight: 25, sourceMetricKey: 'sti.average' },
      { id: 'survey_360', label: 'Pesquisa 360', inputType: 'provider_metric', evidencePolicy: 'none', required: true, weight: 25, sourceMetricKey: 'collab.360.score' }
    ]
  },
  {
    id: 'qualidade_servico',
    code: 'qualidade_servico',
    categoryCode: 'atendimento-online',
    categoryLabel: 'Atendimento online',
    name: 'Qualidade de produtos e servicos',
    description: 'Indicador provider-first para NPS bruto e conversao em percentual no contrato unico.',
    enabled: true,
    weight: 10,
    scopeMode: 'client_global',
    sourceKind: 'provider',
    sourceModule: 'atendimento-online',
    valueType: 'percent',
    evidencePolicy: 'none',
    supportsStoreBreakdown: false,
    tags: ['nps', 'provider', 'global'],
    items: [
      { id: 'service_nps', label: 'NPS de servico', inputType: 'provider_metric', evidencePolicy: 'none', required: true, weight: 100, sourceMetricKey: 'nps.service' }
    ]
  },
  {
    id: 'branding_posvenda',
    code: 'branding_posvenda',
    categoryCode: 'operacao-loja',
    categoryLabel: 'Operacao de loja',
    name: 'Posicionamento e branding',
    description: 'Combina retorno de pos-venda com checklist visual e override por loja para campanhas sazonais.',
    enabled: true,
    weight: 15,
    scopeMode: 'per_store',
    sourceKind: 'hybrid',
    sourceModule: 'sales',
    valueType: 'score',
    evidencePolicy: 'required',
    supportsStoreBreakdown: true,
    tags: ['branding', 'campanha', 'imagem'],
    items: [
      { id: 'post_sale_return', label: 'Retorno do pos-venda', inputType: 'percent', evidencePolicy: 'none', required: true, weight: 30 },
      { id: 'window_standard', label: 'Vitrines e TVs no padrao', inputType: 'image_required', evidencePolicy: 'required', required: true, weight: 25 },
      { id: 'store_gifts', label: 'Mimos disponiveis', inputType: 'image_required', evidencePolicy: 'required', required: true, weight: 20 },
      { id: 'dress_code', label: 'Dress code', inputType: 'image_required', evidencePolicy: 'required', required: true, weight: 25 }
    ]
  },
  {
    id: 'resultado_comercial',
    code: 'resultado_comercial',
    categoryCode: 'comercial',
    categoryLabel: 'Comercial',
    name: 'Indicadores de resultado',
    description: 'Consolida meta, ticket e desconto com target set versionado por cliente e por loja.',
    enabled: true,
    weight: 25,
    scopeMode: 'per_store',
    sourceKind: 'provider',
    sourceModule: 'sales',
    valueType: 'score',
    evidencePolicy: 'none',
    supportsStoreBreakdown: true,
    tags: ['meta', 'ticket', 'desconto'],
    items: [
      { id: 'revenue_target', label: 'Meta batida', inputType: 'provider_metric', evidencePolicy: 'none', required: true, weight: 60, sourceMetricKey: 'sales.revenue_target_ratio' },
      { id: 'avg_ticket', label: 'Ticket medio', inputType: 'provider_metric', evidencePolicy: 'none', required: true, weight: 25, sourceMetricKey: 'sales.avg_ticket_ratio' },
      { id: 'discount_ratio', label: 'Percentual desconto medio', inputType: 'provider_metric', evidencePolicy: 'none', required: true, weight: 15, sourceMetricKey: 'sales.discount_ratio' }
    ]
  },
  {
    id: 'fila_resolucao',
    code: 'fila_resolucao',
    categoryCode: 'fila-atendimento',
    categoryLabel: 'Fila de atendimento',
    name: 'Tempo de resolucao de fila',
    description: 'Novo bloco derivado da fila com corte por loja para comparar operacao fisica e digital.',
    enabled: true,
    weight: 15,
    scopeMode: 'per_store',
    sourceKind: 'provider',
    sourceModule: 'fila-atendimento',
    valueType: 'score',
    evidencePolicy: 'none',
    supportsStoreBreakdown: true,
    tags: ['fila', 'sla', 'realtime'],
    items: [
      { id: 'resolution_time', label: 'Tempo medio de resolucao', inputType: 'provider_metric', evidencePolicy: 'none', required: true, weight: 70, sourceMetricKey: 'queue.resolution_minutes' },
      { id: 'escalation_ratio', label: 'Taxa de escalonamento', inputType: 'provider_metric', evidencePolicy: 'none', required: true, weight: 30, sourceMetricKey: 'queue.escalation_ratio' }
    ]
  }
]

const STORE_OVERRIDES: IndicatorsStoreOverride[] = [
  {
    id: 'riomar',
    unitName: 'Riomar',
    accentColor: '#0f766e',
    managerName: 'Joyce',
    ranking: 1,
    score: 92.4,
    scopeMode: 'per_store',
    status: 'custom',
    note: 'Riomar exige evidencia obrigatoria no branding por conta da campanha premium do mes.',
    overrides: [
      { id: 'riomar-branding-weight', label: 'Peso de branding', enabled: true, weight: 18, note: 'Sobe 3 pontos no periodo da campanha.', changed: true },
      { id: 'riomar-fila-enable', label: 'Habilitar fila resolucao', enabled: true, weight: 15, note: 'Mantem integrado com a fila hospedada.', changed: false },
      { id: 'riomar-quality-global', label: 'Usar qualidade global do cliente', enabled: true, weight: null, note: 'Nao quebra por loja.', changed: false }
    ]
  },
  {
    id: 'jardins',
    unitName: 'Jardins',
    accentColor: '#b45309',
    managerName: 'Aline',
    ranking: 2,
    score: 87.2,
    scopeMode: 'per_store',
    status: 'inherit',
    note: 'Jardins segue o perfil base sem override ativo nesta rodada.',
    overrides: [
      { id: 'jardins-branding-weight', label: 'Peso de branding', enabled: false, weight: null, note: 'Herdando template.', changed: false },
      { id: 'jardins-time-required', label: 'Time de especialistas obrigatorio', enabled: true, weight: 20, note: 'Sem ajuste local.', changed: false },
      { id: 'jardins-fila-enable', label: 'Habilitar fila resolucao', enabled: true, weight: 15, note: 'Provider ja conectado.', changed: false }
    ]
  },
  {
    id: 'garcia',
    unitName: 'Garcia',
    accentColor: '#be123c',
    managerName: 'Bruno',
    ranking: 3,
    score: 82.6,
    scopeMode: 'per_store',
    status: 'custom',
    note: 'Garcia ainda usa um target set proprio para desconto e retorno de pos-venda.',
    overrides: [
      { id: 'garcia-discount-target', label: 'Meta de desconto local', enabled: true, weight: 12, note: 'Desconto maximo ficou mais restritivo.', changed: true },
      { id: 'garcia-environment-photo', label: 'Foto obrigatoria no ambiente', enabled: true, weight: null, note: 'Auditoria visual intensificada.', changed: true },
      { id: 'garcia-queue-scope', label: 'Fila visivel por loja', enabled: true, weight: 10, note: 'Compara loja fisica e fila digital.', changed: false }
    ]
  },
  {
    id: 'treze',
    unitName: 'Treze',
    accentColor: '#1d4ed8',
    managerName: 'Carlos',
    ranking: 4,
    score: 75.8,
    scopeMode: 'per_store',
    status: 'paused',
    note: 'Treze esta com rollout de provider de fila pausado e permanece no pacote manual.',
    overrides: [
      { id: 'treze-fila-enable', label: 'Habilitar fila resolucao', enabled: false, weight: 0, note: 'Provider ainda fora da homologacao.', changed: true },
      { id: 'treze-branding-photo', label: 'Branding com foto obrigatoria', enabled: true, weight: 15, note: 'Mantido por causa de auditoria externa.', changed: false },
      { id: 'treze-result-weight', label: 'Peso resultado comercial', enabled: true, weight: 20, note: 'Reduzido ate estabilizar a equipe.', changed: true }
    ]
  }
]

const TARGET_SETS: IndicatorsTargetSetSummary[] = [
  {
    id: 'abril-2026',
    name: 'Abril 2026 - Operacao + Comercial',
    periodLabel: '01 abr 2026 - 30 abr 2026',
    scopeMode: 'per_store',
    status: 'active',
    items: [
      { id: 'revenue', label: 'Meta de faturamento', currentValue: '96', targetValue: '100', unitLabel: '%', status: 'risk' },
      { id: 'discount', label: 'Desconto medio', currentValue: '10.8', targetValue: '10', unitLabel: '%', status: 'off_track' },
      { id: 'queue', label: 'Tempo medio de fila', currentValue: '12', targetValue: '15', unitLabel: 'min', status: 'on_track' }
    ]
  },
  {
    id: 'maio-2026',
    name: 'Maio 2026 - Campanha premium',
    periodLabel: '01 maio 2026 - 31 maio 2026',
    scopeMode: 'per_store',
    status: 'draft',
    items: [
      { id: 'branding', label: 'Branding com foto obrigatoria', currentValue: '2', targetValue: '0', unitLabel: 'falhas', status: 'risk' },
      { id: 'ticket', label: 'Ticket medio premium', currentValue: '1820', targetValue: '1900', unitLabel: 'R$', status: 'risk' },
      { id: 'nps', label: 'NPS servico premium', currentValue: '4.4', targetValue: '4.6', unitLabel: 'pts', status: 'risk' }
    ]
  }
]

const PROVIDERS: IndicatorsProviderHealth[] = [
  {
    id: 'provider-fila',
    name: 'Fila Atendimento Metrics',
    sourceModule: 'fila-atendimento',
    status: 'online',
    freshnessLabel: 'Atualizado ha 2 min',
    coverageLabel: '3/4 lojas com snapshot valido',
    mappedIndicators: ['Tempo de resolucao de fila'],
    note: 'Treze segue sem binding ativo por decisao do cliente.'
  },
  {
    id: 'provider-online',
    name: 'Atendimento Online NPS',
    sourceModule: 'atendimento-online',
    status: 'online',
    freshnessLabel: 'Atualizado ha 9 min',
    coverageLabel: 'Cliente global sem quebra por loja',
    mappedIndicators: ['Qualidade de produtos e servicos', 'Time de especialistas'],
    note: 'Leitura atual entra como snapshot no momento da avaliacao.'
  },
  {
    id: 'provider-sales',
    name: 'Sales Metrics',
    sourceModule: 'sales',
    status: 'attention',
    freshnessLabel: 'Atraso de 1h 12m',
    coverageLabel: '4/4 lojas com payload, 1 com desconto fora do contrato',
    mappedIndicators: ['Posicionamento e branding', 'Indicadores de resultado'],
    note: 'Precisa separar target set mensal de campanha premium antes do Go.'
  },
  {
    id: 'provider-manual',
    name: 'Auditoria manual do gerente',
    sourceModule: 'manual',
    status: 'online',
    freshnessLabel: 'Fluxo local no front',
    coverageLabel: 'Disponivel em qualquer loja',
    mappedIndicators: ['Ambiente acolhedor', 'Posicionamento e branding'],
    note: 'Mock front-first para ajustar UX e payload antes do backend.'
  }
]

const TEMPLATE_CATALOG: IndicatorsTemplateCatalogItem[] = [
  {
    id: 'tpl-varejo-premium',
    code: 'varejo-premium',
    name: 'Varejo Premium',
    description: 'Template base do cliente atual, com operacao, comercial e extensoes de fila.',
    status: 'active',
    defaultScopeMode: 'client_global',
    categoryCount: 5,
    indicatorCount: 6,
    clientCount: 3,
    versions: [
      { id: 'v2.1', versionLabel: 'v2.1', status: 'active', publishedAt: '04 abr 2026', note: 'Inclui fila resolucao como provider opcional.' },
      { id: 'v2.2-draft', versionLabel: 'v2.2-draft', status: 'draft', note: 'Abre campo de evidencia configuravel por item.' }
    ],
    highlights: ['Suporta override por loja', 'Fila opcional', 'Mantem paridade com legado']
  },
  {
    id: 'tpl-multistore-service',
    code: 'multistore-service',
    name: 'Multistore Service',
    description: 'Template mais enxuto para clientes com foco em SLA, NPS e operacao de loja.',
    status: 'draft',
    defaultScopeMode: 'per_store',
    categoryCount: 4,
    indicatorCount: 5,
    clientCount: 1,
    versions: [
      { id: 'v0.9', versionLabel: 'v0.9', status: 'draft', note: 'Em calibracao de pesos e targets.' }
    ],
    highlights: ['Provider-heavy', 'Escopo por loja como default', 'Sem dependencias do legado']
  },
  {
    id: 'tpl-light-retail',
    code: 'light-retail',
    name: 'Light Retail',
    description: 'Onboarding rapido para cliente single-store com poucos indicadores e foco comercial.',
    status: 'archived',
    defaultScopeMode: 'client_global',
    categoryCount: 3,
    indicatorCount: 4,
    clientCount: 0,
    versions: [
      { id: 'v1.0', versionLabel: 'v1.0', status: 'archived', publishedAt: '18 mar 2026', note: 'Descontinuado apos consolidar o premium.' }
    ],
    highlights: ['Onboarding curto', 'Sem override por loja', 'Baixo custo de manutencao']
  }
]

const GOVERNANCE_STATS: IndicatorsGovernanceStat[] = [
  { id: 'templates', label: 'Templates ativos', value: '2', helper: '1 legado expandido + 1 multistore moderno', tone: 'success' },
  { id: 'clients', label: 'Clientes em rollout', value: '4', helper: '3 em producao mockada + 1 piloto', tone: 'neutral' },
  { id: 'providers', label: 'Providers homologados', value: '3/4', helper: 'Sales ainda exige ajuste de payload', tone: 'warning' },
  { id: 'policy-drift', label: 'Drift de politicas', value: '2', helper: 'Dois pontos com custom local acima do desejado', tone: 'warning' }
]

const DEFAULT_POLICIES: IndicatorsDefaultPolicy[] = [
  {
    id: 'scope-default',
    title: 'Escopo default do onboarding',
    description: 'Comeca client_global e abre por loja so quando o cliente pede ranking ou alvo local.',
    state: 'recommended',
    value: 'client_global',
    affectedArea: 'Perfil base'
  },
  {
    id: 'evidence-branding',
    title: 'Evidencia visual em branding',
    description: 'Todo item visual de branding nasce como foto obrigatoria para reduzir ambiguidade.',
    state: 'system',
    value: 'required',
    affectedArea: 'Template / itens'
  },
  {
    id: 'provider-fallback',
    title: 'Fallback de provider em atraso',
    description: 'Provider com atraso acima de 45 minutos volta para snapshot anterior e marca badge de atencao.',
    state: 'recommended',
    value: 'snapshot-previous',
    affectedArea: 'Runtime / dashboard'
  },
  {
    id: 'store-override-limit',
    title: 'Limite de overrides por loja',
    description: 'Evita divergencia excessiva entre cliente e lojas durante o rollout do modulo.',
    state: 'custom',
    value: 'max-3-overrides',
    affectedArea: 'Governanca / rollout'
  }
]

const TENANT_ADOPTION: IndicatorsTenantAdoption[] = [
  {
    id: 'tenant-acme',
    clientLabel: 'Cliente atual',
    activeTemplate: 'Varejo Premium v2.1',
    scopeMode: 'per_store',
    rolloutStatus: 'rolling',
    providerCoverage: '3 providers + manual fallback',
    lastChangeLabel: 'Hoje, 09:12'
  },
  {
    id: 'tenant-demo',
    clientLabel: 'Demo Core',
    activeTemplate: 'Multistore Service v0.9',
    scopeMode: 'client_global',
    rolloutStatus: 'pilot',
    providerCoverage: '2 providers + mock local',
    lastChangeLabel: 'Ontem, 17:48'
  },
  {
    id: 'tenant-river',
    clientLabel: 'River Shops',
    activeTemplate: 'Varejo Premium v2.1',
    scopeMode: 'per_store',
    rolloutStatus: 'stable',
    providerCoverage: '4 providers sem atraso',
    lastChangeLabel: '08 abr 2026'
  }
]

const ROADMAP: IndicatorsRoadmapCard[] = [
  {
    id: 'roadmap-config-ui',
    title: 'Fechar UX de configuracao',
    description: 'Travar o fluxo de editar peso, campo e evidencia antes de subir DTOs no Go.',
    stage: 'now',
    owner: 'Front / produto',
    dependencies: ['Mock navegavel', 'Validacao com cliente atual']
  },
  {
    id: 'roadmap-provider-contracts',
    title: 'Assinar contratos de provider',
    description: 'Congelar shape de snapshots para fila, atendimento-online e sales.',
    stage: 'next',
    owner: 'Core / modulos',
    dependencies: ['AGENTS do modulo', 'DTO de score unificado']
  },
  {
    id: 'roadmap-history',
    title: 'Historico e auditoria final',
    description: 'Persistir snapshots imutaveis e trilha de alteracoes de template, perfil e override.',
    stage: 'later',
    owner: 'Backend / auditoria',
    dependencies: ['Schema foundation', 'Handlers do Go']
  }
]

function buildModuleSummary(clientLabel: string, pendingChanges: number): IndicatorsModuleSummary {
  const providerOnlineCount = PROVIDERS.filter(provider => provider.status === 'online').length

  return {
    clientLabel,
    activeProfileName: 'Operacao Omnichannel Premium',
    templateLabel: 'Varejo Premium v2.1',
    storesConfigured: STORE_OVERRIDES.length,
    providerOnlineCount,
    providerTotal: PROVIDERS.length,
    pendingChanges,
    lastSyncLabel: 'Mock local atualizado ha 12 min'
  }
}

export function useIndicatorsConfigurationMock() {
  const ui = useUiStore()
  const sessionSimulation = useSessionSimulationStore()
  const { coreUser } = useAdminSession()
  const runtimeState = useIndicatorsMockRuntimeState()
  const { publishNow, schedulePublish } = useIndicatorsRealtimeBridge(runtimeState)

  const {
    changeCount,
    indicators,
    stores,
    targetSets,
    providers,
    evaluations
  } = runtimeState

  const clientLabel = computed(() => {
    const simulated = normalizeText(sessionSimulation.activeClientLabel)
    if (simulated) return simulated
    return normalizeText(coreUser.value?.clientName || coreUser.value?.tenantName) || 'Cliente atual'
  })

  function normalizeWeight(value: unknown) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return 0
    return roundWeight(Math.max(0, parsed))
  }

  function enabledWeightWithout(indicatorId: string) {
    return roundWeight(indicators.value.reduce((accumulator, indicator) => {
      if (!indicator.enabled || indicator.id === indicatorId) {
        return accumulator
      }

      return accumulator + indicator.weight
    }, 0))
  }

  function itemWeightWithout(indicator: IndicatorsProfileIndicatorConfig, itemId: string) {
    return roundWeight(indicator.items.reduce((accumulator, item) => {
      if (item.id === itemId) {
        return accumulator
      }

      return accumulator + item.weight
    }, 0))
  }

  function itemWeightTotal(indicator: IndicatorsProfileIndicatorConfig) {
    return roundWeight(indicator.items.reduce((accumulator, item) => accumulator + item.weight, 0))
  }

  function itemsUseUniformWeights(indicator: IndicatorsProfileIndicatorConfig) {
    if (indicator.items.length <= 1) {
      return true
    }

    const firstWeight = roundWeight(indicator.items[0]?.weight ?? 0)
    return indicator.items.every(item => Math.abs(roundWeight(item.weight) - firstWeight) <= WEIGHT_TOLERANCE)
  }

  function rebalanceIndicatorItemsInternal(indicator: IndicatorsProfileIndicatorConfig) {
    const nextWeights = buildEqualWeightDistribution(indicator.items.length)
    indicator.items = indicator.items.map((item, index) => ({
      ...item,
      weight: nextWeights[index] ?? 0
    }))
  }

  function buildNewItem(indicator: IndicatorsProfileIndicatorConfig): IndicatorsProfileItemConfig {
    const remainingWeight = Math.max(0, MAX_WEIGHT - itemWeightTotal(indicator))
    const nextIndex = indicator.items.length + 1

    return {
      id: `${indicator.id}-item-${Date.now()}-${nextIndex}`,
      label: `Novo item ${nextIndex}`,
      inputType: 'boolean',
      evidencePolicy: 'inherit',
      required: false,
      weight: remainingWeight
    }
  }

  const categories = computed(() => {
    const seen = new Map<string, string>()
    for (const indicator of indicators.value) {
      if (!seen.has(indicator.categoryCode)) {
        seen.set(indicator.categoryCode, indicator.categoryLabel)
      }
    }

    return [...seen.entries()].map(([value, label]) => ({ value, label }))
  })

  const summary = computed(() => buildModuleSummary(clientLabel.value, changeCount.value))

  const configSnapshot = computed<IndicatorsConfigSnapshot>(() => {
    const enabledIndicators = indicators.value.filter(indicator => indicator.enabled)
    const providerBindings = enabledIndicators.filter(indicator => indicator.sourceKind !== 'manual').length
    const requiredEvidence = enabledIndicators.filter(indicator => indicator.evidencePolicy === 'required').length
    const customStores = stores.value.filter(store => store.status === 'custom').length

    return {
      enabledIndicators: enabledIndicators.length,
      enabledWeight: roundWeight(enabledIndicators.reduce((accumulator, indicator) => accumulator + indicator.weight, 0)),
      customStores,
      providerBindings,
      requiredEvidence
    }
  })

  const weightStatus = computed(() => {
    const enabledIndicators = indicators.value.filter(indicator => indicator.enabled)
    const profileTotal = roundWeight(enabledIndicators.reduce((accumulator, indicator) => accumulator + indicator.weight, 0))
    const indicatorTotals = indicators.value.map((indicator) => {
      const total = itemWeightTotal(indicator)

      return {
        indicatorId: indicator.id,
        indicatorName: indicator.name,
        enabled: indicator.enabled,
        total,
        remaining: roundWeight(Math.max(0, MAX_WEIGHT - total)),
        exceeds: roundWeight(Math.max(0, total - MAX_WEIGHT)),
        isValid: hasTargetWeight(total),
        isUniform: itemsUseUniformWeights(indicator)
      }
    })

    const blockingItemTotals = indicatorTotals.filter(entry => entry.enabled && !entry.isValid)

    return {
      profileTotal,
      indicatorTotals,
      blockingItemTotals,
      hasProfileMismatch: !hasTargetWeight(profileTotal),
      hasBlockingIssues: !hasTargetWeight(profileTotal) || blockingItemTotals.length > 0
    }
  })

  function touchDraft() {
    changeCount.value += 1
    schedulePublish('configuration')
  }

  function updateIndicatorField(
    indicatorId: string,
    field: 'name' | 'weight' | 'scopeMode' | 'sourceKind' | 'valueType' | 'evidencePolicy' | 'enabled' | 'supportsStoreBreakdown',
    value: string | number | boolean
  ) {
    const indicator = indicators.value.find(entry => entry.id === indicatorId)
    if (!indicator) return

    if (field === 'weight') {
      const nextWeight = normalizeWeight(value)
      const maxAllowed = indicator.enabled ? roundWeight(Math.max(0, MAX_WEIGHT - enabledWeightWithout(indicator.id))) : MAX_WEIGHT
      const cappedWeight = Math.min(nextWeight, maxAllowed)

      if (nextWeight > maxAllowed) {
        ui.info(`O peso de ${indicator.name} foi limitado a ${maxAllowed}% para o total dos indicadores nao passar de 100%.`, 'Indicadores')
      }

      if (indicator.weight === cappedWeight) {
        return
      }

      indicator.weight = cappedWeight
      touchDraft()
      return
    }

    if (field === 'enabled' || field === 'supportsStoreBreakdown') {
      const nextValue = Boolean(value)

      if (field === 'enabled' && nextValue) {
        const remainingWeight = roundWeight(Math.max(0, MAX_WEIGHT - enabledWeightWithout(indicator.id)))

        if (remainingWeight <= 0) {
          ui.error(`Rebalanceie os pesos antes de ativar ${indicator.name}. O total dos indicadores ja esta em 100%.`, 'Indicadores')
          return
        }

        if (indicator.weight > remainingWeight) {
          indicator.weight = remainingWeight
          ui.info(`O peso de ${indicator.name} foi ajustado para ${remainingWeight}% para caber no total do perfil.`, 'Indicadores')
        }
      }

      if (indicator[field] === nextValue) {
        return
      }

      indicator[field] = nextValue as never
      touchDraft()
      return
    }

    indicator[field] = value as never
    touchDraft()
  }

  function updateItemField(
    indicatorId: string,
    itemId: string,
    field: 'label' | 'inputType' | 'evidencePolicy' | 'required' | 'weight',
    value: string | number | boolean
  ) {
    const indicator = indicators.value.find(entry => entry.id === indicatorId)
    const item = indicator?.items.find(entry => entry.id === itemId)
    if (!item) return

    if (field === 'weight') {
      const nextWeight = normalizeWeight(value)
      const maxAllowed = roundWeight(Math.max(0, MAX_WEIGHT - itemWeightWithout(indicator, item.id)))
      const cappedWeight = Math.min(nextWeight, maxAllowed)

      if (nextWeight > maxAllowed) {
        ui.info(`O item ${item.label} foi limitado a ${maxAllowed}% para ${indicator.name} nao ultrapassar 100% nos pesos internos.`, 'Indicadores')
      }

      if (item.weight === cappedWeight) {
        return
      }

      item.weight = cappedWeight
      touchDraft()
      return
    }

    if (field === 'required') {
      item.required = Boolean(value)
      touchDraft()
      return
    }

    item[field] = value as never
    touchDraft()
  }

  function addIndicatorItem(indicatorId: string) {
    const indicator = indicators.value.find(entry => entry.id === indicatorId)
    if (!indicator) return

    const shouldRebalanceEvenly = itemsUseUniformWeights(indicator)
    const nextItem = buildNewItem(indicator)
    indicator.items = [...indicator.items, nextItem]

    if (shouldRebalanceEvenly) {
      rebalanceIndicatorItemsInternal(indicator)
      touchDraft()
      ui.info(`Novo item criado em ${indicator.name}. Os ${indicator.items.length} itens foram redistribuidos para fechar 100% automaticamente.`, 'Indicadores')
      return
    }

    touchDraft()

    if (nextItem.weight === 0) {
      ui.info(`Novo item criado com 0%. Use a sugestao de dividir 100% igualmente ou ajuste manualmente os pesos de ${indicator.name}.`, 'Indicadores')
      return
    }

    ui.info(`Novo item criado em ${indicator.name} com ${nextItem.weight}% disponivel.`, 'Indicadores')
  }

  async function removeIndicator(indicatorId: string) {
    const indicatorIndex = indicators.value.findIndex(entry => entry.id === indicatorId)
    const indicator = indicatorIndex >= 0 ? indicators.value[indicatorIndex] : null
    if (!indicator) return

    const confirmation = await ui.confirm({
      title: 'Excluir indicador',
      message: `Remover ${indicator.name} deste perfil mock?`,
      confirmLabel: 'Excluir',
      cancelLabel: 'Cancelar'
    })

    if (!confirmation.confirmed) {
      return
    }

    indicators.value = indicators.value.filter(entry => entry.id !== indicatorId)
    touchDraft()

    ui.info(`Indicador ${indicator.name} removido do perfil mock. Rebalanceie o total do perfil antes de salvar se precisar.`, 'Indicadores')
  }

  async function removeIndicatorItem(indicatorId: string, itemId: string) {
    const indicator = indicators.value.find(entry => entry.id === indicatorId)
    const item = indicator?.items.find(entry => entry.id === itemId)
    if (!indicator || !item) return

    const confirmation = await ui.confirm({
      title: 'Excluir item',
      message: `Remover ${item.label} de ${indicator.name}?`,
      confirmLabel: 'Excluir',
      cancelLabel: 'Cancelar'
    })

    if (!confirmation.confirmed) {
      return
    }

    const shouldRebalanceEvenly = itemsUseUniformWeights(indicator)
    indicator.items = indicator.items.filter(entry => entry.id !== itemId)

    if (shouldRebalanceEvenly && indicator.items.length > 0) {
      rebalanceIndicatorItemsInternal(indicator)
      touchDraft()
      ui.info(`Item removido de ${indicator.name}. Os pesos restantes foram redistribuidos igualmente para fechar 100%.`, 'Indicadores')
      return
    }

    touchDraft()
    ui.info(`Item ${item.label} removido de ${indicator.name}. Ajuste os pesos restantes se quiser fechar 100% novamente.`, 'Indicadores')
  }

  function rebalanceIndicatorItems(indicatorId: string) {
    const indicator = indicators.value.find(entry => entry.id === indicatorId)
    if (!indicator || indicator.items.length === 0) return

    rebalanceIndicatorItemsInternal(indicator)
    touchDraft()
    ui.info(`Pesos de ${indicator.name} redistribuidos igualmente entre ${indicator.items.length} itens.`, 'Indicadores')
  }

  function updateStoreField(
    storeId: string,
    field: 'scopeMode' | 'status' | 'note',
    value: string
  ) {
    const store = stores.value.find(entry => entry.id === storeId)
    if (!store) return
    store[field] = value as never
    touchDraft()
  }

  function updateStoreRuleField(
    storeId: string,
    ruleId: string,
    field: 'enabled' | 'weight' | 'note',
    value: string | number | boolean | null
  ) {
    const store = stores.value.find(entry => entry.id === storeId)
    const rule = store?.overrides.find(entry => entry.id === ruleId)
    if (!rule) return

    if (field === 'enabled') {
      rule.enabled = Boolean(value)
    } else if (field === 'weight') {
      rule.weight = value === null || value === '' ? null : Math.max(0, Number(value) || 0)
    } else {
      rule.note = String(value ?? '')
    }

    rule.changed = true
    touchDraft()
  }

  function saveDraft() {
    if (weightStatus.value.hasProfileMismatch) {
      ui.error(`O perfil ativo esta com ${weightStatus.value.profileTotal}%. Feche em 100% antes de salvar.`, 'Indicadores')
      return
    }

    if (weightStatus.value.blockingItemTotals.length > 0) {
      const firstIssue = weightStatus.value.blockingItemTotals[0]
      ui.error(`${firstIssue.indicatorName} esta com ${firstIssue.total}%. Feche os itens internos em 100% antes de salvar.`, 'Indicadores')
      return
    }

    changeCount.value = 0
    publishNow('configuration')
    ui.success('Mock de configuracao atualizado. Ainda nao persiste no Go nem no banco.', 'Indicadores')
  }

  function resetMock() {
    indicators.value = cloneMock(PROFILE_INDICATORS)
    stores.value = cloneMock(STORE_OVERRIDES)
    targetSets.value = cloneMock(TARGET_SETS)
    providers.value = cloneMock(PROVIDERS)
    changeCount.value = 0
    publishNow('configuration')
    ui.info('Workspace mock restaurado para o estado base do modulo.', 'Indicadores')
  }

  return {
    clientLabel,
    summary,
    indicators,
    stores,
    targetSets,
    providers,
    evaluations,
    categories,
    configSnapshot,
    weightStatus,
    publishRealtimeState: publishNow,
    updateIndicatorField,
    updateItemField,
    addIndicatorItem,
    removeIndicator,
    removeIndicatorItem,
    rebalanceIndicatorItems,
    updateStoreField,
    updateStoreRuleField,
    saveDraft,
    resetMock
  }
}

export function useIndicatorsGovernanceMock() {
  const ui = useUiStore()

  const changeCount = ref(2)
  const templates = ref(cloneMock(TEMPLATE_CATALOG))
  const governanceStats = ref(cloneMock(GOVERNANCE_STATS))
  const policies = ref(cloneMock(DEFAULT_POLICIES))
  const providerRegistry = ref(cloneMock(PROVIDERS))
  const tenantAdoption = ref(cloneMock(TENANT_ADOPTION))
  const roadmap = ref(cloneMock(ROADMAP))
  const selectedTemplateId = ref(templates.value[0]?.id ?? '')

  const summary = computed(() => buildModuleSummary('Root governanca', changeCount.value))
  const selectedTemplate = computed(() => templates.value.find(template => template.id === selectedTemplateId.value) ?? templates.value[0] ?? null)

  function selectTemplate(templateId: string) {
    selectedTemplateId.value = templateId
  }

  function updatePolicyState(policyId: string, nextState: IndicatorsDefaultPolicy['state']) {
    const policy = policies.value.find(entry => entry.id === policyId)
    if (!policy) return
    policy.state = nextState
    changeCount.value += 1
  }

  function publishDraftVersion() {
    const template = selectedTemplate.value
    if (!template) return

    const draftVersion = template.versions.find(version => version.status === 'draft')
    if (!draftVersion) {
      ui.info('Este template nao possui versao draft pronta para publicar.', 'Indicadores')
      return
    }

    for (const version of template.versions) {
      if (version.status === 'active') {
        version.status = 'archived'
      }
    }

    draftVersion.status = 'active'
    draftVersion.publishedAt = 'Hoje, 11:06'
    template.status = 'active'
    changeCount.value += 1
    ui.success(`Versao ${draftVersion.versionLabel} publicada no mock de governanca.`, 'Indicadores')
  }

  function duplicateTemplate() {
    const template = selectedTemplate.value
    if (!template) return

    const duplicate = cloneMock(template)
    duplicate.id = `${template.id}-copy-${templates.value.length + 1}`
    duplicate.code = `${template.code}-copy`
    duplicate.name = `${template.name} Copy`
    duplicate.status = 'draft'
    duplicate.clientCount = 0
    duplicate.versions = [{ id: `${duplicate.id}-v0`, versionLabel: 'v0.1-draft', status: 'draft', note: 'Duplicado no mock para iterar UX.' }]
    templates.value = [duplicate, ...templates.value]
    selectedTemplateId.value = duplicate.id
    changeCount.value += 1
    ui.success(`Template ${duplicate.name} criado no mock.`, 'Indicadores')
  }

  return {
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