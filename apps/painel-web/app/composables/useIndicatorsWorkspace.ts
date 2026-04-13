import { useIndicatorsConfigurationMock } from '~/composables/useIndicatorsModuleMock'
import type {
  IndicatorChartDatum,
  IndicatorCode,
  IndicatorDashboardModel,
  IndicatorEvaluationDraftPayload,
  IndicatorEvaluationRecord,
  IndicatorExportFormat,
  IndicatorRangePreset,
  IndicatorSectionModel,
  IndicatorSelectionOption,
  IndicatorTone,
  IndicatorUnitOption
} from '~/types/indicators'
import type {
  IndicatorsProfileIndicatorConfig,
  IndicatorsProviderHealth,
  IndicatorsStoreOverride,
  IndicatorsProfileItemConfig
} from '~/types/indicators-management'

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function toIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function shiftDays(baseDate: Date, days: number) {
  const clone = new Date(baseDate)
  clone.setDate(clone.getDate() + days)
  return clone
}

function getCurrentMonthRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  return {
    start: toIsoDate(start),
    end: toIsoDate(end)
  }
}

function getPresetRange(presetId: string, now = new Date()) {
  if (presetId === 'today') {
    const value = toIsoDate(now)
    return { start: value, end: value }
  }

  if (presetId === 'last_7_days') {
    return {
      start: toIsoDate(shiftDays(now, -6)),
      end: toIsoDate(now)
    }
  }

  if (presetId === 'last_30_days') {
    return {
      start: toIsoDate(shiftDays(now, -29)),
      end: toIsoDate(now)
    }
  }

  return getCurrentMonthRange(now)
}

function overlapsRange(periodStart: string, periodEnd: string, filterStart: string, filterEnd: string) {
  return !(periodEnd < filterStart || periodStart > filterEnd)
}

function formatDisplayDate(value: string) {
  const raw = normalizeText(value)
  if (!raw) return '--'

  const parsed = new Date(`${raw}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return raw

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(parsed).replace(/\./g, '')
}

function detailAsset(id: string, title: string, previewLabel: string, accentColor: string) {
  return {
    id,
    title,
    previewLabel,
    accentColor
  }
}

const RANGE_PRESETS: IndicatorRangePreset[] = [
  { id: 'today', label: 'Hoje' },
  { id: 'last_7_days', label: 'Ultimos 7 dias' },
  { id: 'last_30_days', label: 'Ultimos 30 dias' },
  { id: 'this_month', label: 'Este mes' }
]

const UNIT_OPTIONS: IndicatorUnitOption[] = [
  {
    id: 'riomar',
    label: 'Riomar',
    accentColor: '#0f766e',
    teamSnapshot: {
      stiAverage: 8.9,
      survey360: 8.7
    },
    targetSnapshot: {
      returnTarget: 10,
      revenueTarget: 100,
      avgTicketTarget: 1850,
      discountTarget: 9
    }
  },
  {
    id: 'jardins',
    label: 'Jardins',
    accentColor: '#b45309',
    teamSnapshot: {
      stiAverage: 8.4,
      survey360: 8.2
    },
    targetSnapshot: {
      returnTarget: 10,
      revenueTarget: 100,
      avgTicketTarget: 1760,
      discountTarget: 10
    }
  },
  {
    id: 'garcia',
    label: 'Garcia',
    accentColor: '#be123c',
    teamSnapshot: {
      stiAverage: 7.9,
      survey360: 7.8
    },
    targetSnapshot: {
      returnTarget: 10,
      revenueTarget: 100,
      avgTicketTarget: 1680,
      discountTarget: 11
    }
  },
  {
    id: 'treze',
    label: 'Treze',
    accentColor: '#1d4ed8',
    teamSnapshot: {
      stiAverage: 7.4,
      survey360: 7.3
    },
    targetSnapshot: {
      returnTarget: 10,
      revenueTarget: 100,
      avgTicketTarget: 1600,
      discountTarget: 12
    }
  }
]

const INDICATOR_OPTIONS: IndicatorSelectionOption[] = [
  {
    code: 'indicator_1',
    label: '1. Ambiente Aconchegante',
    shortLabel: 'Ambiente Aconchegante',
    weight: 15
  },
  {
    code: 'indicator_2',
    label: '2. Time de Especialistas',
    shortLabel: 'Time de Especialistas',
    weight: 25
  },
  {
    code: 'indicator_3',
    label: '3. Qualidade de Produtos e Servicos',
    shortLabel: 'Qualidade e Servicos',
    weight: 10
  },
  {
    code: 'indicator_4',
    label: '4. Posicionamento e Branding',
    shortLabel: 'Branding',
    weight: 15
  },
  {
    code: 'indicator_5',
    label: '5. Indicadores de Resultado',
    shortLabel: 'Resultado',
    weight: 35
  }
]

const INDICATOR_LABEL_BY_CODE = INDICATOR_OPTIONS.reduce<Record<IndicatorCode, string>>((accumulator, option) => {
  accumulator[option.code] = option.label
  return accumulator
}, {
  indicator_1: '1. Ambiente Aconchegante',
  indicator_2: '2. Time de Especialistas',
  indicator_3: '3. Qualidade de Produtos e Servicos',
  indicator_4: '4. Posicionamento e Branding',
  indicator_5: '5. Indicadores de Resultado'
})

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
      INDICATOR_LABEL_BY_CODE.indicator_1,
      INDICATOR_LABEL_BY_CODE.indicator_2,
      INDICATOR_LABEL_BY_CODE.indicator_4
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
      INDICATOR_LABEL_BY_CODE.indicator_1,
      INDICATOR_LABEL_BY_CODE.indicator_3,
      INDICATOR_LABEL_BY_CODE.indicator_5
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
      INDICATOR_LABEL_BY_CODE.indicator_1,
      INDICATOR_LABEL_BY_CODE.indicator_2,
      INDICATOR_LABEL_BY_CODE.indicator_3,
      INDICATOR_LABEL_BY_CODE.indicator_4,
      INDICATOR_LABEL_BY_CODE.indicator_5
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
      INDICATOR_LABEL_BY_CODE.indicator_2,
      INDICATOR_LABEL_BY_CODE.indicator_4,
      INDICATOR_LABEL_BY_CODE.indicator_5
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
      INDICATOR_LABEL_BY_CODE.indicator_1,
      INDICATOR_LABEL_BY_CODE.indicator_5
    ]
  }
]

const DASHBOARD_MODEL: IndicatorDashboardModel = {
  title: 'Nota Geral das Lojas em todos indicadores',
  description: 'Ranking consolidado da auditoria com a mesma hierarquia visual do dashboard legado.',
  chart: [
    { id: 'riomar', label: 'Riomar', value: 92.4, color: '#0f766e', helper: 'Peso usado: 100%' },
    { id: 'jardins', label: 'Jardins', value: 87.2, color: '#b45309', helper: 'Peso usado: 100%' },
    { id: 'garcia', label: 'Garcia', value: 82.6, color: '#be123c', helper: 'Peso usado: 100%' },
    { id: 'treze', label: 'Treze', value: 75.8, color: '#1d4ed8', helper: 'Peso usado: 100%' }
  ],
  stats: [
    {
      id: 'best-store',
      label: 'Melhor loja',
      value: 'Riomar',
      helper: '92.4% na media ponderada do periodo.'
    },
    {
      id: 'worst-store',
      label: 'Pior loja',
      value: 'Treze',
      helper: '75.8% com maior concentracao de gargalos visuais.'
    },
    {
      id: 'best-indicator',
      label: 'Melhor indicador',
      value: 'Ambiente Aconchegante',
      helper: '91.3% de media consolidada nas quatro unidades.'
    },
    {
      id: 'coverage',
      label: 'Cobertura',
      value: '4 lojas',
      helper: '5 indicadores acompanhados no mesmo painel.'
    }
  ],
  ranking: [
    {
      id: 'rank-riomar',
      unitName: 'Riomar',
      score: 92.4,
      usedWeight: 100,
      accentColor: '#0f766e',
      helper: 'Fluxo mais estavel entre experiencia, time e resultado.'
    },
    {
      id: 'rank-jardins',
      unitName: 'Jardins',
      score: 87.2,
      usedWeight: 100,
      accentColor: '#b45309',
      helper: 'Performance equilibrada, com oportunidade em branding e NPS.'
    },
    {
      id: 'rank-garcia',
      unitName: 'Garcia',
      score: 82.6,
      usedWeight: 100,
      accentColor: '#be123c',
      helper: 'Recuperou resultado, mas segue com gaps de ambiente e pos-venda.'
    },
    {
      id: 'rank-treze',
      unitName: 'Treze',
      score: 75.8,
      usedWeight: 100,
      accentColor: '#1d4ed8',
      helper: 'Maior pressao em padrao visual, NPS e desconto medio.'
    }
  ]
}

const INDICATOR_SECTIONS: IndicatorSectionModel[] = [
  {
    code: 'indicator_1',
    order: 1,
    title: 'Ambiente Aconchegante',
    weight: 15,
    description: 'Replica a leitura do legado: experiencia da loja, reposicao, apresentacao e evidencia visual por falha.',
    itemLabels: [
      'Reposicao de cafe',
      'Bolo / bebidas / comidas',
      'Embalagens certas',
      'Mezanino organizado'
    ],
    chart: [
      { id: 'i1-riomar', label: 'Riomar', value: 95, color: '#0f766e' },
      { id: 'i1-jardins', label: 'Jardins', value: 91, color: '#b45309' },
      { id: 'i1-garcia', label: 'Garcia', value: 86, color: '#be123c' },
      { id: 'i1-treze', label: 'Treze', value: 78, color: '#1d4ed8' }
    ],
    stores: [
      {
        id: 'i1-store-riomar',
        unitId: 'riomar',
        unitName: 'Riomar',
        accentColor: '#0f766e',
        scoreLabel: 'Media bruta',
        scoreValue: '95.0%',
        scoreDescription: 'Para calculo: 14.25%',
        metrics: [
          { id: 'riomar-i1-evals', label: 'Avaliacoes no periodo', value: '3', tone: 'success' },
          { id: 'riomar-i1-ok', label: 'Itens conformes', value: '11/12', tone: 'success' },
          { id: 'riomar-i1-evidence', label: 'Falhas com evidencia', value: '1', tone: 'warning' }
        ],
        bulletTitle: 'Itens faltantes unicos',
        bullets: ['Bolo / bebidas / comidas'],
        ctaLabel: 'Ver imagens',
        detailEntries: [
          {
            id: 'i1-riomar-detail-1',
            evaluatorName: 'Joyce',
            evaluatedAt: '04 abr 2026',
            rawScore: '75.0%',
            finalScore: '11.25%',
            lines: [
              { id: 'i1-riomar-line-1', label: 'Reposicao de cafe', value: 'Conforme', tone: 'success' },
              { id: 'i1-riomar-line-2', label: 'Bolo / bebidas / comidas', value: 'Falhou', tone: 'warning' },
              { id: 'i1-riomar-line-3', label: 'Embalagens certas', value: 'Conforme', tone: 'success' },
              { id: 'i1-riomar-line-4', label: 'Mezanino organizado', value: 'Conforme', tone: 'success' }
            ],
            assets: [
              detailAsset('i1-riomar-asset-1', 'Bolo / bebidas / comidas', 'Evidencia da ilha fria sem reposicao completa', '#0f766e')
            ]
          }
        ],
        detailFooter: 'Media final da loja no indicador: 95.0% | Para calculo: 14.25%'
      },
      {
        id: 'i1-store-jardins',
        unitId: 'jardins',
        unitName: 'Jardins',
        accentColor: '#b45309',
        scoreLabel: 'Media bruta',
        scoreValue: '91.0%',
        scoreDescription: 'Para calculo: 13.65%',
        metrics: [
          { id: 'jardins-i1-evals', label: 'Avaliacoes no periodo', value: '2', tone: 'success' },
          { id: 'jardins-i1-ok', label: 'Itens conformes', value: '7/8', tone: 'success' },
          { id: 'jardins-i1-evidence', label: 'Falhas com evidencia', value: '0', tone: 'neutral' }
        ],
        bulletTitle: 'Status do periodo',
        bullets: ['Todos os itens foram cumpridos no recorte atual.'],
        ctaLabel: 'Ver detalhes',
        detailEntries: [
          {
            id: 'i1-jardins-detail-1',
            evaluatorName: 'Mike',
            evaluatedAt: '06 abr 2026',
            rawScore: '100.0%',
            finalScore: '15.00%',
            lines: [
              { id: 'i1-jardins-line-1', label: 'Reposicao de cafe', value: 'Conforme', tone: 'success' },
              { id: 'i1-jardins-line-2', label: 'Bolo / bebidas / comidas', value: 'Conforme', tone: 'success' },
              { id: 'i1-jardins-line-3', label: 'Embalagens certas', value: 'Conforme', tone: 'success' },
              { id: 'i1-jardins-line-4', label: 'Mezanino organizado', value: 'Conforme', tone: 'success' }
            ]
          }
        ],
        detailFooter: 'Media final da loja no indicador: 91.0% | Para calculo: 13.65%'
      },
      {
        id: 'i1-store-garcia',
        unitId: 'garcia',
        unitName: 'Garcia',
        accentColor: '#be123c',
        scoreLabel: 'Media bruta',
        scoreValue: '86.0%',
        scoreDescription: 'Para calculo: 12.90%',
        metrics: [
          { id: 'garcia-i1-evals', label: 'Avaliacoes no periodo', value: '2', tone: 'neutral' },
          { id: 'garcia-i1-ok', label: 'Itens conformes', value: '6/8', tone: 'warning' },
          { id: 'garcia-i1-evidence', label: 'Falhas com evidencia', value: '1', tone: 'warning' }
        ],
        bulletTitle: 'Itens faltantes unicos',
        bullets: ['Mezanino organizado'],
        ctaLabel: 'Ver imagens',
        detailEntries: [
          {
            id: 'i1-garcia-detail-1',
            evaluatorName: 'Bruno',
            evaluatedAt: '08 abr 2026',
            rawScore: '75.0%',
            finalScore: '11.25%',
            lines: [
              { id: 'i1-garcia-line-1', label: 'Reposicao de cafe', value: 'Conforme', tone: 'success' },
              { id: 'i1-garcia-line-2', label: 'Bolo / bebidas / comidas', value: 'Conforme', tone: 'success' },
              { id: 'i1-garcia-line-3', label: 'Embalagens certas', value: 'Conforme', tone: 'success' },
              { id: 'i1-garcia-line-4', label: 'Mezanino organizado', value: 'Falhou', tone: 'warning' }
            ],
            assets: [
              detailAsset('i1-garcia-asset-1', 'Mezanino organizado', 'Foto de organizacao fora do padrao no segundo piso', '#be123c')
            ]
          }
        ],
        detailFooter: 'Media final da loja no indicador: 86.0% | Para calculo: 12.90%'
      },
      {
        id: 'i1-store-treze',
        unitId: 'treze',
        unitName: 'Treze',
        accentColor: '#1d4ed8',
        scoreLabel: 'Media bruta',
        scoreValue: '78.0%',
        scoreDescription: 'Para calculo: 11.70%',
        metrics: [
          { id: 'treze-i1-evals', label: 'Avaliacoes no periodo', value: '2', tone: 'neutral' },
          { id: 'treze-i1-ok', label: 'Itens conformes', value: '5/8', tone: 'warning' },
          { id: 'treze-i1-evidence', label: 'Falhas com evidencia', value: '2', tone: 'warning' }
        ],
        bulletTitle: 'Itens faltantes unicos',
        bullets: ['Reposicao de cafe', 'Embalagens certas'],
        ctaLabel: 'Ver imagens',
        detailEntries: [
          {
            id: 'i1-treze-detail-1',
            evaluatorName: 'Aline',
            evaluatedAt: '05 abr 2026',
            rawScore: '50.0%',
            finalScore: '7.50%',
            lines: [
              { id: 'i1-treze-line-1', label: 'Reposicao de cafe', value: 'Falhou', tone: 'warning' },
              { id: 'i1-treze-line-2', label: 'Bolo / bebidas / comidas', value: 'Conforme', tone: 'success' },
              { id: 'i1-treze-line-3', label: 'Embalagens certas', value: 'Falhou', tone: 'warning' },
              { id: 'i1-treze-line-4', label: 'Mezanino organizado', value: 'Conforme', tone: 'success' }
            ],
            assets: [
              detailAsset('i1-treze-asset-1', 'Reposicao de cafe', 'Evidencia de apoio sem itens completos na copa', '#1d4ed8'),
              detailAsset('i1-treze-asset-2', 'Embalagens certas', 'Foto de kits com embalagem fora do padrao', '#1d4ed8')
            ]
          }
        ],
        detailFooter: 'Media final da loja no indicador: 78.0% | Para calculo: 11.70%'
      }
    ]
  },
  {
    code: 'indicator_2',
    order: 2,
    title: 'Time de Especialistas',
    weight: 25,
    description: 'Mantem a leitura do legado com STI, equilibrio do time, desenvolvimento e pesquisa 360 no mesmo bloco.',
    itemLabels: [
      'Media do STI',
      'Equilibrio entre o time',
      'Desenvolvimento de lideres',
      'Pesquisa 360 (NPS)'
    ],
    chart: [
      { id: 'i2-riomar', label: 'Riomar', value: 89, color: '#0f766e' },
      { id: 'i2-jardins', label: 'Jardins', value: 84, color: '#b45309' },
      { id: 'i2-garcia', label: 'Garcia', value: 82, color: '#be123c' },
      { id: 'i2-treze', label: 'Treze', value: 76, color: '#1d4ed8' }
    ],
    stores: [
      {
        id: 'i2-store-riomar',
        unitId: 'riomar',
        unitName: 'Riomar',
        accentColor: '#0f766e',
        scoreLabel: 'Nota final media bruta',
        scoreValue: '89.0%',
        scoreDescription: 'Para calculo: 22.25%',
        metrics: [
          { id: 'i2-riomar-sti', label: 'STI medio', value: '89%', tone: 'success' },
          { id: 'i2-riomar-balance', label: 'Equilibrio do time', value: '86%', tone: 'success' },
          { id: 'i2-riomar-leaders', label: 'Desenv. lideres', value: '92%', tone: 'success' },
          { id: 'i2-riomar-survey', label: 'Satisfacao 360', value: '87%', tone: 'success' }
        ],
        bullets: [],
        ctaLabel: 'Ver detalhes',
        detailEntries: [
          {
            id: 'i2-riomar-detail-1',
            evaluatorName: 'Joyce',
            evaluatedAt: '04 abr 2026',
            rawScore: '89.00%',
            finalScore: '22.25%',
            lines: [
              { id: 'i2-riomar-line-1', label: 'STI bruto', value: '8.9 / 10 (nota 26%)', tone: 'success' },
              { id: 'i2-riomar-line-2', label: 'Equilibrio do time', value: '14% de diferenca (nota 24%)', tone: 'success' },
              { id: 'i2-riomar-line-3', label: 'Desenv. lideres', value: '9.2 / 10 (nota 22%)', tone: 'success' },
              { id: 'i2-riomar-line-4', label: 'Pesquisa 360', value: '8.7 / 10 (nota 17%)', tone: 'success' }
            ]
          }
        ],
        detailFooter: 'Nota final do indicador na loja: 89.0% | Para calculo: 22.25%'
      },
      {
        id: 'i2-store-jardins',
        unitId: 'jardins',
        unitName: 'Jardins',
        accentColor: '#b45309',
        scoreLabel: 'Nota final media bruta',
        scoreValue: '84.0%',
        scoreDescription: 'Para calculo: 21.00%',
        metrics: [
          { id: 'i2-jardins-sti', label: 'STI medio', value: '84%', tone: 'success' },
          { id: 'i2-jardins-balance', label: 'Equilibrio do time', value: '80%', tone: 'neutral' },
          { id: 'i2-jardins-leaders', label: 'Desenv. lideres', value: '88%', tone: 'success' },
          { id: 'i2-jardins-survey', label: 'Satisfacao 360', value: '82%', tone: 'neutral' }
        ],
        bullets: [],
        ctaLabel: 'Ver detalhes',
        detailEntries: [
          {
            id: 'i2-jardins-detail-1',
            evaluatorName: 'Mike',
            evaluatedAt: '06 abr 2026',
            rawScore: '84.00%',
            finalScore: '21.00%',
            lines: [
              { id: 'i2-jardins-line-1', label: 'STI bruto', value: '8.4 / 10 (nota 25%)', tone: 'success' },
              { id: 'i2-jardins-line-2', label: 'Equilibrio do time', value: '22% de diferenca (nota 20%)', tone: 'neutral' },
              { id: 'i2-jardins-line-3', label: 'Desenv. lideres', value: '8.8 / 10 (nota 22%)', tone: 'success' },
              { id: 'i2-jardins-line-4', label: 'Pesquisa 360', value: '8.2 / 10 (nota 17%)', tone: 'neutral' }
            ]
          }
        ],
        detailFooter: 'Nota final do indicador na loja: 84.0% | Para calculo: 21.00%'
      },
      {
        id: 'i2-store-garcia',
        unitId: 'garcia',
        unitName: 'Garcia',
        accentColor: '#be123c',
        scoreLabel: 'Nota final media bruta',
        scoreValue: '82.0%',
        scoreDescription: 'Para calculo: 20.50%',
        metrics: [
          { id: 'i2-garcia-sti', label: 'STI medio', value: '79%', tone: 'neutral' },
          { id: 'i2-garcia-balance', label: 'Equilibrio do time', value: '82%', tone: 'neutral' },
          { id: 'i2-garcia-leaders', label: 'Desenv. lideres', value: '86%', tone: 'success' },
          { id: 'i2-garcia-survey', label: 'Satisfacao 360', value: '78%', tone: 'warning' }
        ],
        bullets: [],
        ctaLabel: 'Ver detalhes',
        detailEntries: [
          {
            id: 'i2-garcia-detail-1',
            evaluatorName: 'Bruno',
            evaluatedAt: '08 abr 2026',
            rawScore: '82.00%',
            finalScore: '20.50%',
            lines: [
              { id: 'i2-garcia-line-1', label: 'STI bruto', value: '7.9 / 10 (nota 24%)', tone: 'neutral' },
              { id: 'i2-garcia-line-2', label: 'Equilibrio do time', value: '24% de diferenca (nota 20%)', tone: 'neutral' },
              { id: 'i2-garcia-line-3', label: 'Desenv. lideres', value: '8.6 / 10 (nota 21%)', tone: 'success' },
              { id: 'i2-garcia-line-4', label: 'Pesquisa 360', value: '7.8 / 10 (nota 17%)', tone: 'warning' }
            ]
          }
        ],
        detailFooter: 'Nota final do indicador na loja: 82.0% | Para calculo: 20.50%'
      },
      {
        id: 'i2-store-treze',
        unitId: 'treze',
        unitName: 'Treze',
        accentColor: '#1d4ed8',
        scoreLabel: 'Nota final media bruta',
        scoreValue: '76.0%',
        scoreDescription: 'Para calculo: 19.00%',
        metrics: [
          { id: 'i2-treze-sti', label: 'STI medio', value: '74%', tone: 'warning' },
          { id: 'i2-treze-balance', label: 'Equilibrio do time', value: '68%', tone: 'warning' },
          { id: 'i2-treze-leaders', label: 'Desenv. lideres', value: '80%', tone: 'neutral' },
          { id: 'i2-treze-survey', label: 'Satisfacao 360', value: '73%', tone: 'warning' }
        ],
        bullets: [],
        ctaLabel: 'Ver detalhes',
        detailEntries: [
          {
            id: 'i2-treze-detail-1',
            evaluatorName: 'Aline',
            evaluatedAt: '05 abr 2026',
            rawScore: '76.00%',
            finalScore: '19.00%',
            lines: [
              { id: 'i2-treze-line-1', label: 'STI bruto', value: '7.4 / 10 (nota 22%)', tone: 'warning' },
              { id: 'i2-treze-line-2', label: 'Equilibrio do time', value: '31% de diferenca (nota 17%)', tone: 'warning' },
              { id: 'i2-treze-line-3', label: 'Desenv. lideres', value: '8.0 / 10 (nota 20%)', tone: 'neutral' },
              { id: 'i2-treze-line-4', label: 'Pesquisa 360', value: '7.3 / 10 (nota 17%)', tone: 'warning' }
            ]
          }
        ],
        detailFooter: 'Nota final do indicador na loja: 76.0% | Para calculo: 19.00%'
      }
    ]
  },
  {
    code: 'indicator_3',
    order: 3,
    title: 'Qualidade de Produtos e Servicos',
    weight: 10,
    description: 'Corrige a nomenclatura do front novo separando NPS bruto e percentual medio no card da loja.',
    itemLabels: [
      'NPS ligado a servico'
    ],
    chart: [
      { id: 'i3-riomar', label: 'Riomar', value: 92, color: '#0f766e' },
      { id: 'i3-jardins', label: 'Jardins', value: 88, color: '#b45309' },
      { id: 'i3-garcia', label: 'Garcia', value: 80, color: '#be123c' },
      { id: 'i3-treze', label: 'Treze', value: 74, color: '#1d4ed8' }
    ],
    stores: [
      {
        id: 'i3-store-riomar',
        unitId: 'riomar',
        unitName: 'Riomar',
        accentColor: '#0f766e',
        scoreLabel: 'Percentual medio',
        scoreValue: '92.0%',
        scoreDescription: 'NPS bruto medio: 4.6 / 5',
        metrics: [
          { id: 'i3-riomar-nps', label: 'Meta visual', value: 'Bateu a meta', tone: 'success' },
          { id: 'i3-riomar-final', label: 'Nota final', value: '9.20%', tone: 'success' },
          { id: 'i3-riomar-evals', label: 'Avaliacoes no periodo', value: '2', tone: 'neutral' }
        ],
        bullets: [],
        ctaLabel: 'Ver detalhes',
        detailEntries: [
          {
            id: 'i3-riomar-detail-1',
            evaluatorName: 'Joyce',
            evaluatedAt: '04 abr 2026',
            rawScore: '4.6 / 5',
            finalScore: '9.20%',
            lines: [
              { id: 'i3-riomar-line-1', label: 'NPS bruto', value: '4.6 / 5', tone: 'success' },
              { id: 'i3-riomar-line-2', label: 'Percentual individual', value: '92.0%', tone: 'success' },
              { id: 'i3-riomar-line-3', label: 'Peso aplicado', value: '10%', tone: 'neutral' }
            ]
          }
        ],
        detailFooter: 'Percentual medio do indicador: 92.0% | Nota final aplicada: 9.20%'
      },
      {
        id: 'i3-store-jardins',
        unitId: 'jardins',
        unitName: 'Jardins',
        accentColor: '#b45309',
        scoreLabel: 'Percentual medio',
        scoreValue: '88.0%',
        scoreDescription: 'NPS bruto medio: 4.4 / 5',
        metrics: [
          { id: 'i3-jardins-nps', label: 'Meta visual', value: 'Bateu a meta', tone: 'success' },
          { id: 'i3-jardins-final', label: 'Nota final', value: '8.80%', tone: 'success' },
          { id: 'i3-jardins-evals', label: 'Avaliacoes no periodo', value: '2', tone: 'neutral' }
        ],
        bullets: [],
        ctaLabel: 'Ver detalhes',
        detailEntries: [
          {
            id: 'i3-jardins-detail-1',
            evaluatorName: 'Mike',
            evaluatedAt: '06 abr 2026',
            rawScore: '4.4 / 5',
            finalScore: '8.80%',
            lines: [
              { id: 'i3-jardins-line-1', label: 'NPS bruto', value: '4.4 / 5', tone: 'success' },
              { id: 'i3-jardins-line-2', label: 'Percentual individual', value: '88.0%', tone: 'success' },
              { id: 'i3-jardins-line-3', label: 'Peso aplicado', value: '10%', tone: 'neutral' }
            ]
          }
        ],
        detailFooter: 'Percentual medio do indicador: 88.0% | Nota final aplicada: 8.80%'
      },
      {
        id: 'i3-store-garcia',
        unitId: 'garcia',
        unitName: 'Garcia',
        accentColor: '#be123c',
        scoreLabel: 'Percentual medio',
        scoreValue: '80.0%',
        scoreDescription: 'NPS bruto medio: 4.0 / 5',
        metrics: [
          { id: 'i3-garcia-nps', label: 'Meta visual', value: 'No limite', tone: 'warning' },
          { id: 'i3-garcia-final', label: 'Nota final', value: '8.00%', tone: 'neutral' },
          { id: 'i3-garcia-evals', label: 'Avaliacoes no periodo', value: '1', tone: 'neutral' }
        ],
        bullets: [],
        ctaLabel: 'Ver detalhes',
        detailEntries: [
          {
            id: 'i3-garcia-detail-1',
            evaluatorName: 'Bruno',
            evaluatedAt: '08 abr 2026',
            rawScore: '4.0 / 5',
            finalScore: '8.00%',
            lines: [
              { id: 'i3-garcia-line-1', label: 'NPS bruto', value: '4.0 / 5', tone: 'warning' },
              { id: 'i3-garcia-line-2', label: 'Percentual individual', value: '80.0%', tone: 'warning' },
              { id: 'i3-garcia-line-3', label: 'Peso aplicado', value: '10%', tone: 'neutral' }
            ]
          }
        ],
        detailFooter: 'Percentual medio do indicador: 80.0% | Nota final aplicada: 8.00%'
      },
      {
        id: 'i3-store-treze',
        unitId: 'treze',
        unitName: 'Treze',
        accentColor: '#1d4ed8',
        scoreLabel: 'Percentual medio',
        scoreValue: '74.0%',
        scoreDescription: 'NPS bruto medio: 3.7 / 5',
        metrics: [
          { id: 'i3-treze-nps', label: 'Meta visual', value: 'Abaixo da meta', tone: 'warning' },
          { id: 'i3-treze-final', label: 'Nota final', value: '7.40%', tone: 'warning' },
          { id: 'i3-treze-evals', label: 'Avaliacoes no periodo', value: '1', tone: 'neutral' }
        ],
        bullets: [],
        ctaLabel: 'Ver detalhes',
        detailEntries: [
          {
            id: 'i3-treze-detail-1',
            evaluatorName: 'Aline',
            evaluatedAt: '05 abr 2026',
            rawScore: '3.7 / 5',
            finalScore: '7.40%',
            lines: [
              { id: 'i3-treze-line-1', label: 'NPS bruto', value: '3.7 / 5', tone: 'warning' },
              { id: 'i3-treze-line-2', label: 'Percentual individual', value: '74.0%', tone: 'warning' },
              { id: 'i3-treze-line-3', label: 'Peso aplicado', value: '10%', tone: 'neutral' }
            ]
          }
        ],
        detailFooter: 'Percentual medio do indicador: 74.0% | Nota final aplicada: 7.40%'
      }
    ]
  },
  {
    code: 'indicator_4',
    order: 4,
    title: 'Posicionamento e Branding',
    weight: 15,
    description: 'Combina retorno de pos-venda, vitrines, mimos e dress code com evidencias visuais quando houver falha.',
    itemLabels: [
      'Retorno do pos-venda',
      'Vitrines e TVs no padrao',
      'Mimos disponiveis',
      'Dress code'
    ],
    chart: [
      { id: 'i4-riomar', label: 'Riomar', value: 90, color: '#0f766e' },
      { id: 'i4-jardins', label: 'Jardins', value: 86, color: '#b45309' },
      { id: 'i4-garcia', label: 'Garcia', value: 81, color: '#be123c' },
      { id: 'i4-treze', label: 'Treze', value: 72, color: '#1d4ed8' }
    ],
    stores: [
      {
        id: 'i4-store-riomar',
        unitId: 'riomar',
        unitName: 'Riomar',
        accentColor: '#0f766e',
        scoreLabel: 'Media final bruta',
        scoreValue: '90.0%',
        scoreDescription: 'Retorno de pos-venda: 12.4% | Meta vigente: 10%',
        metrics: [
          { id: 'i4-riomar-return', label: 'Pos-venda', value: 'Bateu a meta', tone: 'success' },
          { id: 'i4-riomar-missing', label: 'Itens nao cumpridos', value: '1', tone: 'warning' },
          { id: 'i4-riomar-final', label: 'Peso aplicado', value: '13.50%', tone: 'success' }
        ],
        bulletTitle: 'Itens nao cumpridos',
        bullets: ['Vitrines e TVs no padrao'],
        ctaLabel: 'Ver detalhes',
        detailEntries: [
          {
            id: 'i4-riomar-detail-1',
            evaluatorName: 'Joyce',
            evaluatedAt: '04 abr 2026',
            rawScore: '90.00%',
            finalScore: '13.50%',
            lines: [
              { id: 'i4-riomar-line-1', label: 'Retorno de pos-venda', value: '12.4% (meta 10%)', tone: 'success' },
              { id: 'i4-riomar-line-2', label: 'Vitrines e TVs no padrao', value: 'Falhou', tone: 'warning' },
              { id: 'i4-riomar-line-3', label: 'Mimos disponiveis', value: 'Conforme', tone: 'success' },
              { id: 'i4-riomar-line-4', label: 'Dress code', value: 'Conforme', tone: 'success' }
            ],
            assets: [
              detailAsset('i4-riomar-asset-1', 'Vitrines e TVs no padrao', 'Visual com TV fora do loop institucional', '#0f766e')
            ]
          }
        ],
        detailFooter: 'Nota final do indicador: 90.0% | Para calculo: 13.50%'
      },
      {
        id: 'i4-store-jardins',
        unitId: 'jardins',
        unitName: 'Jardins',
        accentColor: '#b45309',
        scoreLabel: 'Media final bruta',
        scoreValue: '86.0%',
        scoreDescription: 'Retorno de pos-venda: 10.8% | Meta vigente: 10%',
        metrics: [
          { id: 'i4-jardins-return', label: 'Pos-venda', value: 'Bateu a meta', tone: 'success' },
          { id: 'i4-jardins-missing', label: 'Itens nao cumpridos', value: '1', tone: 'warning' },
          { id: 'i4-jardins-final', label: 'Peso aplicado', value: '12.90%', tone: 'success' }
        ],
        bulletTitle: 'Itens nao cumpridos',
        bullets: ['Mimos disponiveis'],
        ctaLabel: 'Ver detalhes',
        detailEntries: [
          {
            id: 'i4-jardins-detail-1',
            evaluatorName: 'Mike',
            evaluatedAt: '06 abr 2026',
            rawScore: '86.00%',
            finalScore: '12.90%',
            lines: [
              { id: 'i4-jardins-line-1', label: 'Retorno de pos-venda', value: '10.8% (meta 10%)', tone: 'success' },
              { id: 'i4-jardins-line-2', label: 'Vitrines e TVs no padrao', value: 'Conforme', tone: 'success' },
              { id: 'i4-jardins-line-3', label: 'Mimos disponiveis', value: 'Falhou', tone: 'warning' },
              { id: 'i4-jardins-line-4', label: 'Dress code', value: 'Conforme', tone: 'success' }
            ],
            assets: [
              detailAsset('i4-jardins-asset-1', 'Mimos disponiveis', 'Checklist registrou ausencia do kit de boas-vindas', '#b45309')
            ]
          }
        ],
        detailFooter: 'Nota final do indicador: 86.0% | Para calculo: 12.90%'
      },
      {
        id: 'i4-store-garcia',
        unitId: 'garcia',
        unitName: 'Garcia',
        accentColor: '#be123c',
        scoreLabel: 'Media final bruta',
        scoreValue: '81.0%',
        scoreDescription: 'Retorno de pos-venda: 9.6% | Meta vigente: 10%',
        metrics: [
          { id: 'i4-garcia-return', label: 'Pos-venda', value: 'Nao bateu a meta', tone: 'warning' },
          { id: 'i4-garcia-missing', label: 'Itens nao cumpridos', value: '2', tone: 'warning' },
          { id: 'i4-garcia-final', label: 'Peso aplicado', value: '12.15%', tone: 'neutral' }
        ],
        bulletTitle: 'Itens nao cumpridos',
        bullets: ['Vitrines e TVs no padrao', 'Dress code'],
        ctaLabel: 'Ver detalhes',
        detailEntries: [
          {
            id: 'i4-garcia-detail-1',
            evaluatorName: 'Bruno',
            evaluatedAt: '08 abr 2026',
            rawScore: '81.00%',
            finalScore: '12.15%',
            lines: [
              { id: 'i4-garcia-line-1', label: 'Retorno de pos-venda', value: '9.6% (meta 10%)', tone: 'warning' },
              { id: 'i4-garcia-line-2', label: 'Vitrines e TVs no padrao', value: 'Falhou', tone: 'warning' },
              { id: 'i4-garcia-line-3', label: 'Mimos disponiveis', value: 'Conforme', tone: 'success' },
              { id: 'i4-garcia-line-4', label: 'Dress code', value: 'Falhou', tone: 'warning' }
            ],
            assets: [
              detailAsset('i4-garcia-asset-1', 'Vitrines e TVs no padrao', 'TV lateral exibindo conteudo sem padrao visual', '#be123c'),
              detailAsset('i4-garcia-asset-2', 'Dress code', 'Registro de equipe com padrao incompleto no turno da tarde', '#be123c')
            ]
          }
        ],
        detailFooter: 'Nota final do indicador: 81.0% | Para calculo: 12.15%'
      },
      {
        id: 'i4-store-treze',
        unitId: 'treze',
        unitName: 'Treze',
        accentColor: '#1d4ed8',
        scoreLabel: 'Media final bruta',
        scoreValue: '72.0%',
        scoreDescription: 'Retorno de pos-venda: 8.1% | Meta vigente: 10%',
        metrics: [
          { id: 'i4-treze-return', label: 'Pos-venda', value: 'Nao bateu a meta', tone: 'warning' },
          { id: 'i4-treze-missing', label: 'Itens nao cumpridos', value: '2', tone: 'warning' },
          { id: 'i4-treze-final', label: 'Peso aplicado', value: '10.80%', tone: 'warning' }
        ],
        bulletTitle: 'Itens nao cumpridos',
        bullets: ['Mimos disponiveis', 'Dress code'],
        ctaLabel: 'Ver detalhes',
        detailEntries: [
          {
            id: 'i4-treze-detail-1',
            evaluatorName: 'Aline',
            evaluatedAt: '05 abr 2026',
            rawScore: '72.00%',
            finalScore: '10.80%',
            lines: [
              { id: 'i4-treze-line-1', label: 'Retorno de pos-venda', value: '8.1% (meta 10%)', tone: 'warning' },
              { id: 'i4-treze-line-2', label: 'Vitrines e TVs no padrao', value: 'Conforme', tone: 'success' },
              { id: 'i4-treze-line-3', label: 'Mimos disponiveis', value: 'Falhou', tone: 'warning' },
              { id: 'i4-treze-line-4', label: 'Dress code', value: 'Falhou', tone: 'warning' }
            ],
            assets: [
              detailAsset('i4-treze-asset-1', 'Mimos disponiveis', 'Balcao sem kit previsto para a semana promocional', '#1d4ed8'),
              detailAsset('i4-treze-asset-2', 'Dress code', 'Uniformizacao incompleta no horario de pico', '#1d4ed8')
            ]
          }
        ],
        detailFooter: 'Nota final do indicador: 72.0% | Para calculo: 10.80%'
      }
    ]
  },
  {
    code: 'indicator_5',
    order: 5,
    title: 'Indicadores de Resultado',
    weight: 35,
    description: 'Fecha a leitura da auditoria com meta batida, ticket medio e percentual de desconto medio da unidade.',
    itemLabels: [
      'Meta batida',
      'Ticket medio',
      'Percentual de desconto medio'
    ],
    chart: [
      { id: 'i5-riomar', label: 'Riomar', value: 96, color: '#0f766e' },
      { id: 'i5-jardins', label: 'Jardins', value: 87, color: '#b45309' },
      { id: 'i5-garcia', label: 'Garcia', value: 84, color: '#be123c' },
      { id: 'i5-treze', label: 'Treze', value: 79, color: '#1d4ed8' }
    ],
    stores: [
      {
        id: 'i5-store-riomar',
        unitId: 'riomar',
        unitName: 'Riomar',
        accentColor: '#0f766e',
        scoreLabel: 'Nota final media',
        scoreValue: '96.0%',
        scoreDescription: 'Meta 118% | Ticket R$ 1.930 | Desconto 7.2%',
        metrics: [
          { id: 'i5-riomar-meta', label: 'Meta batida', value: '118% / alvo 100%', tone: 'success' },
          { id: 'i5-riomar-ticket', label: 'Ticket medio', value: 'R$ 1.930 / alvo R$ 1.850', tone: 'success' },
          { id: 'i5-riomar-disc', label: 'Desconto medio', value: '7.2% / max 9%', tone: 'success' }
        ],
        bullets: [],
        ctaLabel: 'Ver detalhes',
        detailEntries: [
          {
            id: 'i5-riomar-detail-1',
            evaluatorName: 'Joyce',
            evaluatedAt: '04 abr 2026',
            rawScore: '96.00%',
            finalScore: '33.60%',
            lines: [
              { id: 'i5-riomar-line-1', label: 'Desempenho meta', value: '100.0% | nota item 60%', tone: 'success' },
              { id: 'i5-riomar-line-2', label: 'Desempenho ticket', value: '100.0% | nota item 30%', tone: 'success' },
              { id: 'i5-riomar-line-3', label: 'Desempenho desconto', value: '60.0% | nota item 6%', tone: 'success' }
            ]
          }
        ],
        detailFooter: 'Nota final do indicador: 96.0% | Para calculo: 33.60%'
      },
      {
        id: 'i5-store-jardins',
        unitId: 'jardins',
        unitName: 'Jardins',
        accentColor: '#b45309',
        scoreLabel: 'Nota final media',
        scoreValue: '87.0%',
        scoreDescription: 'Meta 104% | Ticket R$ 1.805 | Desconto 9.4%',
        metrics: [
          { id: 'i5-jardins-meta', label: 'Meta batida', value: '104% / alvo 100%', tone: 'success' },
          { id: 'i5-jardins-ticket', label: 'Ticket medio', value: 'R$ 1.805 / alvo R$ 1.760', tone: 'success' },
          { id: 'i5-jardins-disc', label: 'Desconto medio', value: '9.4% / max 10%', tone: 'neutral' }
        ],
        bullets: [],
        ctaLabel: 'Ver detalhes',
        detailEntries: [
          {
            id: 'i5-jardins-detail-1',
            evaluatorName: 'Mike',
            evaluatedAt: '06 abr 2026',
            rawScore: '87.00%',
            finalScore: '30.45%',
            lines: [
              { id: 'i5-jardins-line-1', label: 'Desempenho meta', value: '100.0% | nota item 60%', tone: 'success' },
              { id: 'i5-jardins-line-2', label: 'Desempenho ticket', value: '100.0% | nota item 30%', tone: 'success' },
              { id: 'i5-jardins-line-3', label: 'Desempenho desconto', value: '70.0% | nota item 7%', tone: 'neutral' }
            ]
          }
        ],
        detailFooter: 'Nota final do indicador: 87.0% | Para calculo: 30.45%'
      },
      {
        id: 'i5-store-garcia',
        unitId: 'garcia',
        unitName: 'Garcia',
        accentColor: '#be123c',
        scoreLabel: 'Nota final media',
        scoreValue: '84.0%',
        scoreDescription: 'Meta 98% | Ticket R$ 1.710 | Desconto 10.8%',
        metrics: [
          { id: 'i5-garcia-meta', label: 'Meta batida', value: '98% / alvo 100%', tone: 'neutral' },
          { id: 'i5-garcia-ticket', label: 'Ticket medio', value: 'R$ 1.710 / alvo R$ 1.680', tone: 'success' },
          { id: 'i5-garcia-disc', label: 'Desconto medio', value: '10.8% / max 11%', tone: 'neutral' }
        ],
        bullets: [],
        ctaLabel: 'Ver detalhes',
        detailEntries: [
          {
            id: 'i5-garcia-detail-1',
            evaluatorName: 'Bruno',
            evaluatedAt: '08 abr 2026',
            rawScore: '84.00%',
            finalScore: '29.40%',
            lines: [
              { id: 'i5-garcia-line-1', label: 'Desempenho meta', value: '98.0% | nota item 58.8%', tone: 'neutral' },
              { id: 'i5-garcia-line-2', label: 'Desempenho ticket', value: '100.0% | nota item 30%', tone: 'success' },
              { id: 'i5-garcia-line-3', label: 'Desempenho desconto', value: '52.0% | nota item 5.2%', tone: 'neutral' }
            ]
          }
        ],
        detailFooter: 'Nota final do indicador: 84.0% | Para calculo: 29.40%'
      },
      {
        id: 'i5-store-treze',
        unitId: 'treze',
        unitName: 'Treze',
        accentColor: '#1d4ed8',
        scoreLabel: 'Nota final media',
        scoreValue: '79.0%',
        scoreDescription: 'Meta 93% | Ticket R$ 1.560 | Desconto 12.8%',
        metrics: [
          { id: 'i5-treze-meta', label: 'Meta batida', value: '93% / alvo 100%', tone: 'warning' },
          { id: 'i5-treze-ticket', label: 'Ticket medio', value: 'R$ 1.560 / alvo R$ 1.600', tone: 'warning' },
          { id: 'i5-treze-disc', label: 'Desconto medio', value: '12.8% / max 12%', tone: 'warning' }
        ],
        bullets: [],
        ctaLabel: 'Ver detalhes',
        detailEntries: [
          {
            id: 'i5-treze-detail-1',
            evaluatorName: 'Aline',
            evaluatedAt: '05 abr 2026',
            rawScore: '79.00%',
            finalScore: '27.65%',
            lines: [
              { id: 'i5-treze-line-1', label: 'Desempenho meta', value: '93.0% | nota item 55.8%', tone: 'warning' },
              { id: 'i5-treze-line-2', label: 'Desempenho ticket', value: '97.5% | nota item 29.3%', tone: 'warning' },
              { id: 'i5-treze-line-3', label: 'Desempenho desconto', value: '0.0% | nota item 0%', tone: 'warning' }
            ]
          }
        ],
        detailFooter: 'Nota final do indicador: 79.0% | Para calculo: 27.65%'
      }
    ]
  }
]

const LEGACY_SECTION_TEMPLATE_BY_PROFILE_ID: Record<string, IndicatorCode> = {
  ambiente_acolhimento: 'indicator_1',
  time_especialistas: 'indicator_2',
  qualidade_servico: 'indicator_3',
  branding_posvenda: 'indicator_4',
  resultado_comercial: 'indicator_5'
}

const LEGACY_SECTION_TEMPLATES = INDICATOR_SECTIONS.reduce<Record<string, IndicatorSectionModel>>((accumulator, section) => {
  accumulator[section.code] = section
  return accumulator
}, {})

function formatPercent(value: number, digits = 1) {
  const normalized = Number.isFinite(value) ? value : 0
  return `${normalized.toFixed(digits)}%`
}

function formatWeight(value: number) {
  const rounded = Math.round((Number.isFinite(value) ? value : 0) * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
}

function parsePercentValue(value: string, fallback: number) {
  const normalized = String(value ?? '').replace(/[^\d.,-]/g, '').replace(',', '.')
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return parsed
}

function resolveIndicatorTone(score: number): IndicatorTone {
  if (score >= 90) return 'success'
  if (score >= 80) return 'neutral'
  return 'warning'
}

function describeInputType(inputType: IndicatorsProfileItemConfig['inputType']) {
  if (inputType === 'provider_metric') return 'provider'
  if (inputType === 'image_required') return 'imagem obrigatoria'
  if (inputType === 'image') return 'imagem'
  if (inputType === 'boolean') return 'checklist'
  if (inputType === 'currency') return 'valor'
  if (inputType === 'percent') return 'percentual'
  if (inputType === 'count') return 'contagem'
  if (inputType === 'score') return 'score'
  if (inputType === 'select') return 'selecao'
  return 'texto'
}

function resolveProviderForIndicator(
  indicator: IndicatorsProfileIndicatorConfig,
  providers: IndicatorsProviderHealth[]
) {
  const sourceModule = normalizeText(indicator.sourceModule).toLowerCase()
  if (!sourceModule) {
    return null
  }

  return providers.find((provider) => normalizeText(provider.sourceModule).toLowerCase() === sourceModule) ?? null
}

function buildGenericDetailEntry(
  indicator: IndicatorsProfileIndicatorConfig,
  store: IndicatorsStoreOverride,
  score: number,
  provider: IndicatorsProviderHealth | null
) {
  return {
    id: `${indicator.id}-${store.id}-config-detail`,
    evaluatorName: store.managerName,
    evaluatedAt: 'Estado atual do perfil',
    rawScore: formatPercent(score),
    finalScore: `${((score * indicator.weight) / 100).toFixed(2)}%`,
    lines: indicator.items.map((item) => ({
      id: `${indicator.id}-${store.id}-${item.id}`,
      label: item.label,
      value: `${formatWeight(item.weight)}% | ${describeInputType(item.inputType)}${item.required ? ' | obrigatorio' : ''}`,
      tone: item.evidencePolicy === 'required'
        ? 'warning'
        : item.inputType === 'provider_metric'
          ? 'success'
          : 'neutral'
    })),
    assets: provider && indicator.evidencePolicy === 'required'
      ? [{
          id: `${indicator.id}-${store.id}-asset`,
          title: 'Politica de evidencia',
          previewLabel: provider.note,
          accentColor: store.accentColor
        }]
      : []
  }
}

function buildIndicatorChart(
  indicator: IndicatorsProfileIndicatorConfig,
  stores: IndicatorsStoreOverride[]
) {
  const legacyCode = LEGACY_SECTION_TEMPLATE_BY_PROFILE_ID[indicator.id]
  const legacyTemplate = legacyCode ? LEGACY_SECTION_TEMPLATES[legacyCode] : null
  if (legacyTemplate) {
    return legacyTemplate.chart.map((entry) => ({
      ...entry,
      helper: `Peso ${formatWeight(indicator.weight)}%`
    }))
  }

  return [...stores]
    .sort((left, right) => left.ranking - right.ranking)
    .map<IndicatorChartDatum>((store) => ({
      id: `${indicator.id}-${store.id}-chart`,
      label: store.unitName,
      value: Number(store.score.toFixed(1)),
      color: store.accentColor,
      helper: `Peso ${formatWeight(indicator.weight)}%`
    }))
}

function buildIndicatorStoreCards(
  indicator: IndicatorsProfileIndicatorConfig,
  stores: IndicatorsStoreOverride[],
  providers: IndicatorsProviderHealth[]
) {
  const provider = resolveProviderForIndicator(indicator, providers)
  const legacyCode = LEGACY_SECTION_TEMPLATE_BY_PROFILE_ID[indicator.id]
  const legacyTemplate = legacyCode ? LEGACY_SECTION_TEMPLATES[legacyCode] : null

  if (legacyTemplate) {
    return legacyTemplate.stores.map((templateStore) => {
      const runtimeStore = stores.find((store) => store.id === templateStore.unitId || store.id === templateStore.id) ?? null
      const score = parsePercentValue(templateStore.scoreValue, runtimeStore?.score ?? 0)
      const detailEntries = templateStore.detailEntries.length > 0
        ? templateStore.detailEntries.map((entry) => ({
            ...entry,
            finalScore: `${((score * indicator.weight) / 100).toFixed(2)}%`
          }))
        : [buildGenericDetailEntry(indicator, runtimeStore ?? {
          id: templateStore.unitId,
          unitName: templateStore.unitName,
          accentColor: templateStore.accentColor,
          managerName: 'Operacao',
          ranking: 0,
          score,
          scopeMode: indicator.scopeMode,
          status: 'inherit',
          note: '',
          overrides: []
        }, score, provider)]

      return {
        ...templateStore,
        id: `${indicator.id}-${templateStore.unitId}`,
        scoreDescription: [templateStore.scoreDescription, `Peso ${formatWeight(indicator.weight)}%`, provider?.freshnessLabel].filter(Boolean).join(' | '),
        metrics: [
          {
            id: `${indicator.id}-${templateStore.unitId}-weight`,
            label: 'Peso do perfil',
            value: `${formatWeight(indicator.weight)}%`,
            tone: 'neutral'
          },
          ...templateStore.metrics
        ],
        bullets: templateStore.bullets.length > 0
          ? templateStore.bullets
          : indicator.tags.slice(0, 2),
        detailEntries
      }
    })
  }

  return [...stores]
    .sort((left, right) => left.ranking - right.ranking)
    .map((store) => ({
      id: `${indicator.id}-${store.id}`,
      unitId: store.id,
      unitName: store.unitName,
      accentColor: store.accentColor,
      scoreLabel: indicator.valueType === 'percent' ? 'Percentual projetado' : 'Score projetado',
      scoreValue: formatPercent(store.score),
      scoreDescription: [
        `Peso ${formatWeight(indicator.weight)}%`,
        indicator.scopeMode === 'per_store' ? 'Leitura por loja' : 'Escopo global',
        provider?.freshnessLabel
      ].filter(Boolean).join(' | '),
      metrics: [
        {
          id: `${indicator.id}-${store.id}-source`,
          label: 'Fonte',
          value: indicator.sourceKind === 'manual' ? 'Manual' : (indicator.sourceModule || 'Provider'),
          tone: provider?.status === 'attention' ? 'warning' : provider?.status === 'offline' ? 'error' : 'neutral'
        },
        {
          id: `${indicator.id}-${store.id}-items`,
          label: 'Itens ativos',
          value: String(indicator.items.length),
          tone: 'neutral'
        },
        {
          id: `${indicator.id}-${store.id}-evidence`,
          label: 'Evidencia',
          value: indicator.evidencePolicy === 'required' ? 'Obrigatoria' : indicator.evidencePolicy === 'optional' ? 'Opcional' : 'Livre',
          tone: indicator.evidencePolicy === 'required' ? 'warning' : 'neutral'
        }
      ],
      bulletTitle: 'Sinais do perfil',
      bullets: [
        `Escopo: ${indicator.scopeMode === 'per_store' ? 'Por loja' : 'Cliente global'}`,
        provider?.coverageLabel || 'Sem provider externo vinculado'
      ],
      ctaLabel: 'Ver parametros',
      detailEntries: [buildGenericDetailEntry(indicator, store, store.score, provider)],
      detailFooter: `Total interno: ${formatWeight(indicator.items.reduce((accumulator, item) => accumulator + item.weight, 0))}% | Fonte: ${indicator.sourceKind}`
    }))
}

function buildOperationalIndicatorSection(
  indicator: IndicatorsProfileIndicatorConfig,
  order: number,
  stores: IndicatorsStoreOverride[],
  providers: IndicatorsProviderHealth[]
) {
  return {
    code: indicator.code,
    order,
    title: indicator.name,
    weight: indicator.weight,
    description: indicator.description,
    itemLabels: indicator.items.map((item) => item.label),
    chart: buildIndicatorChart(indicator, stores),
    stores: buildIndicatorStoreCards(indicator, stores, providers)
  } satisfies IndicatorSectionModel
}

function buildOperationalDashboard(
  stores: IndicatorsStoreOverride[],
  indicators: IndicatorsProfileIndicatorConfig[],
  providers: IndicatorsProviderHealth[]
) {
  const orderedStores = [...stores].sort((left, right) => left.ranking - right.ranking)
  const enabledIndicators = indicators.filter((indicator) => indicator.enabled)
  const enabledWeight = enabledIndicators.reduce((accumulator, indicator) => accumulator + indicator.weight, 0)
  const bestStore = orderedStores[0] ?? null
  const worstStore = orderedStores[orderedStores.length - 1] ?? null
  const providerOnlineCount = providers.filter((provider) => provider.status === 'online').length

  return {
    title: 'Nota Geral das Lojas em todos indicadores',
    description: `${enabledIndicators.length} indicadores ativos no perfil atual, refletidos no workspace operacional sem reload.`,
    chart: orderedStores.map((store) => ({
      id: store.id,
      label: store.unitName,
      value: Number(store.score.toFixed(1)),
      color: store.accentColor,
      helper: `Ranking ${store.ranking}`
    })),
    stats: [
      {
        id: 'best-store',
        label: 'Melhor loja',
        value: bestStore?.unitName || '--',
        helper: bestStore ? `${formatPercent(bestStore.score)} na visao operacional atual.` : 'Sem lojas carregadas.'
      },
      {
        id: 'worst-store',
        label: 'Pior loja',
        value: worstStore?.unitName || '--',
        helper: worstStore ? `${formatPercent(worstStore.score)} na visao operacional atual.` : 'Sem lojas carregadas.'
      },
      {
        id: 'active-indicators',
        label: 'Indicadores ativos',
        value: String(enabledIndicators.length),
        helper: `Peso habilitado: ${formatWeight(enabledWeight)}% no perfil.`
      },
      {
        id: 'provider-coverage',
        label: 'Providers online',
        value: `${providerOnlineCount}/${providers.length}`,
        helper: 'Atualiza em tempo real quando o perfil muda.'
      }
    ],
    ranking: orderedStores.map((store) => ({
      id: `rank-${store.id}`,
      unitName: store.unitName,
      score: Number(store.score.toFixed(1)),
      usedWeight: Number(enabledWeight.toFixed(2)),
      accentColor: store.accentColor,
      helper: store.note
    }))
  } satisfies IndicatorDashboardModel
}

export function useIndicatorsWorkspace() {
  const sessionSimulation = useSessionSimulationStore()
  const { coreUser } = useAdminSession()
  const ui = useUiStore()
  const {
    summary,
    clientLabel,
    indicators: configuredIndicators,
    stores: configuredStores,
    providers: configuredProviders,
    evaluations: sharedEvaluations,
    publishRealtimeState
  } = useIndicatorsConfigurationMock()

  const currentMonthRange = getCurrentMonthRange()
  const draftStart = ref(currentMonthRange.start)
  const draftEnd = ref(currentMonthRange.end)
  const appliedStart = ref(currentMonthRange.start)
  const appliedEnd = ref(currentMonthRange.end)
  const evaluationsOpen = ref(false)
  const evaluationModalOpen = ref(false)

  const actorName = computed(() => {
    const preferred = normalizeText(coreUser.value?.name || coreUser.value?.nick)
    if (preferred) return preferred

    const email = normalizeText(coreUser.value?.email)
    if (email.includes('@')) {
      return email.split('@')[0] || 'Nao identificado'
    }

    return email || 'Nao identificado'
  })

  const appliedRangeLabel = computed(() => {
    return `Exibindo dados de: ${formatDisplayDate(appliedStart.value)} ate ${formatDisplayDate(appliedEnd.value)}`
  })

  const filteredEvaluations = computed(() => {
    return sharedEvaluations.value.filter((entry) => {
      return overlapsRange(entry.periodStart, entry.periodEnd, appliedStart.value, appliedEnd.value)
    })
  })

  const totalEvaluationCount = computed(() => filteredEvaluations.value.length)
  const activeIndicators = computed(() => configuredIndicators.value.filter((indicator) => indicator.enabled))
  const hasResults = computed(() => filteredEvaluations.value.length > 0 || activeIndicators.value.length > 0)

  const dashboard = computed(() => buildOperationalDashboard(configuredStores.value, configuredIndicators.value, configuredProviders.value))
  const indicatorSections = computed(() => {
    return activeIndicators.value.map((indicator, index) => {
      return buildOperationalIndicatorSection(indicator, index + 1, configuredStores.value, configuredProviders.value)
    })
  })
  const rangePresets = computed(() => RANGE_PRESETS)
  const unitOptions = computed(() => UNIT_OPTIONS)
  const indicatorOptions = computed(() => INDICATOR_OPTIONS)

  function toggleEvaluations() {
    evaluationsOpen.value = !evaluationsOpen.value
  }

  function applyFilters() {
    if (!draftStart.value || !draftEnd.value) {
      ui.error('Informe a data inicial e final para aplicar o filtro.', 'Indicadores')
      return
    }

    if (draftEnd.value < draftStart.value) {
      ui.error('A data final nao pode ser menor do que a data inicial.', 'Indicadores')
      return
    }

    appliedStart.value = draftStart.value
    appliedEnd.value = draftEnd.value
  }

  function applyPreset(presetId: string) {
    const range = getPresetRange(presetId)
    draftStart.value = range.start
    draftEnd.value = range.end
    applyFilters()
  }

  function openEvaluationForm() {
    evaluationModalOpen.value = true
  }

  function closeEvaluationForm() {
    evaluationModalOpen.value = false
  }

  async function deleteEvaluation(evaluationId: number) {
    const target = evaluations.value.find((entry) => entry.id === evaluationId)
    if (!target) return

    const confirmation = await ui.confirm({
      title: 'Excluir avaliacao',
      message: `Remover a avaliacao de ${target.unitName} feita por ${target.evaluatorName}?`,
      confirmLabel: 'Excluir',
      cancelLabel: 'Cancelar'
    })

    if (!confirmation.confirmed) return

    sharedEvaluations.value = sharedEvaluations.value.filter((entry) => entry.id !== evaluationId)
    publishRealtimeState('operation')
    ui.success('A avaliacao foi removida da grade local do front.', 'Indicadores')
  }

  function exportEvaluations(format: IndicatorExportFormat) {
    if (filteredEvaluations.value.length === 0) {
      ui.info('Nao ha avaliacoes visiveis para exportar neste recorte.', 'Exportacao')
      return
    }

    ui.info(`Exportacao ${format.toUpperCase()} preparada no front. A conexao real entra na etapa de BFF.`, 'Exportacao')
  }

  function createEvaluation(payload: IndicatorEvaluationDraftPayload) {
    const nextId = sharedEvaluations.value.reduce((highestId, entry) => Math.max(highestId, entry.id), 0) + 1
    const indicatorLabels = payload.indicatorCodes.map((code) => INDICATOR_LABEL_BY_CODE[code] || code)

    sharedEvaluations.value = [
      {
        id: nextId,
        evaluatorName: payload.evaluatorName,
        unitId: payload.unitId,
        unitName: payload.unitName,
        periodStart: payload.periodStart,
        periodEnd: payload.periodEnd,
        indicatorCodes: [...payload.indicatorCodes],
        indicatorLabels
      },
      ...sharedEvaluations.value
    ]

    publishRealtimeState('operation')

    evaluationModalOpen.value = false
    evaluationsOpen.value = true

    const isVisibleInCurrentRange = overlapsRange(payload.periodStart, payload.periodEnd, appliedStart.value, appliedEnd.value)
    if (isVisibleInCurrentRange) {
      ui.success(`Avaliacao de ${payload.unitName} adicionada na tabela do front.`, 'Indicadores')
      return
    }

    ui.info('A avaliacao foi criada, mas ficou fora do periodo aplicado no painel.', 'Indicadores')
  }

  return {
    summary,
    actorName,
    clientLabel,
    draftStart,
    draftEnd,
    appliedStart,
    appliedEnd,
    appliedRangeLabel,
    evaluationsOpen,
    evaluationModalOpen,
    evaluations: filteredEvaluations,
    totalEvaluationCount,
    hasResults,
    dashboard,
    indicatorSections,
    rangePresets,
    unitOptions,
    indicatorOptions,
    toggleEvaluations,
    applyFilters,
    applyPreset,
    openEvaluationForm,
    closeEvaluationForm,
    deleteEvaluation,
    exportEvaluations,
    createEvaluation
  }
}