import { randomUUID } from 'node:crypto'
import { createError, getQuery, setHeader } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'
import { resolveOwnedClientId } from '~~/server/utils/access-context'
import { buildCoreQuery, coreAdminFetch } from '~~/server/utils/core-admin-fetch'

type ExportFormat = 'csv' | 'xlsx' | 'pdf'

interface IndicatorsModuleSummary {
  clientLabel?: string
  activeProfileName?: string
  templateLabel?: string
  storesConfigured?: number
  providerOnlineCount?: number
  providerTotal?: number
  pendingChanges?: number
  lastSyncLabel?: string
}

interface IndicatorsDashboardRankingItem {
  unitName?: string
  score?: number
  evaluationsCount?: number
  usedWeight?: number
}

interface IndicatorsDashboardResponse {
  summary?: IndicatorsModuleSummary
  rangeStart?: string
  rangeEnd?: string
  evaluationCount?: number
  ranking?: IndicatorsDashboardRankingItem[]
}

interface IndicatorsEvaluationListItem {
  id?: string
  evaluatorName?: string
  unitExternalID?: string
  unitExternalId?: string
  unitName?: string
  scopeMode?: string
  status?: string
  periodStart?: string
  periodEnd?: string
  overallScore?: number
  totalWeight?: number
  indicatorLabels?: string[]
  indicatorCodes?: string[]
  createdAt?: string
}

interface ApiEnvelope<T> {
  item?: T
}

interface ApiItemsEnvelope<T> {
  items?: T[]
  meta?: {
    total?: number
  }
}

interface ExportSummaryRow {
  Campo: string
  Valor: string | number
}

interface ExportEvaluationRow {
  ID: string
  Avaliador: string
  Loja: string
  Escopo: string
  Status: string
  'Periodo inicio': string
  'Periodo fim': string
  'Pontuacao geral': number
  'Peso total': number
  Indicadores: string
  'Qtd indicadores': number
  'Criado em': string
}

interface ExportRankingRow {
  Posicao: number
  Loja: string
  Pontuacao: number
  Avaliacoes: number
  'Peso usado': number
}

const INDICATORS_CORE_BASE = '/core/modules/indicators/v1'
const EXPORT_PAGE_LIMIT = 200
const EXPORT_MAX_ITEMS = 2000
const PDF_PAGE_WIDTH = 841.89
const PDF_PAGE_HEIGHT = 595.28
const PDF_MARGIN = 36
const PDF_FONT_SIZE = 10
const PDF_LINE_HEIGHT = 14

function normalizeText(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

function normalizeNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[]
  return value
    .map(item => normalizeText(item))
    .filter(Boolean)
}

function normalizeFormat(value: unknown): ExportFormat {
  const normalized = normalizeText(value, 'csv').toLowerCase()
  if (normalized === 'xlsx' || normalized === 'pdf') {
    return normalized
  }
  return 'csv'
}

function normalizeDateInput(value: unknown) {
  return normalizeText(value).slice(0, 10)
}

function isValidDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function formatDate(value: string) {
  const raw = normalizeText(value)
  if (!raw) return '--'

  const parsed = new Date(`${raw}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return raw

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(parsed)
}

function formatDateTime(value: string) {
  const raw = normalizeText(value)
  if (!raw) return '--'

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return raw

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(parsed)
}

function formatScopeLabel(value: string) {
  return normalizeText(value) === 'per_store' ? 'Por loja' : 'Cliente global'
}

function formatStatusLabel(value: string) {
  const raw = normalizeText(value)
  if (!raw) return 'Sem status'

  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

function formatScore(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(normalizeNumber(value))
}

function sanitizeFilePart(value: string, fallback: string) {
  const normalized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, 64)

  return normalized || fallback
}

function buildFileName(format: ExportFormat, summary: IndicatorsModuleSummary | null, startDate: string, endDate: string, unitLabel: string) {
  const clientPart = sanitizeFilePart(normalizeText(summary?.clientLabel, 'cliente'), 'cliente')
  const unitPart = sanitizeFilePart(unitLabel || 'todas-as-lojas', 'todas-as-lojas')
  const startPart = sanitizeFilePart(startDate, 'inicio')
  const endPart = sanitizeFilePart(endDate, 'fim')
  return `indicadores-${clientPart}-${unitPart}-${startPart}-a-${endPart}.${format}`
}

function toQueryPath(path: string, query: Record<string, string | number | undefined>) {
  return `${path}${buildCoreQuery(query)}`
}

function wrapByChars(text: string, maxChars: number) {
  const chunks = String(text ?? '').split('\n')
  const lines: string[] = []

  for (const chunk of chunks) {
    const normalized = chunk.trim()
    if (!normalized) {
      lines.push('')
      continue
    }

    const words = normalized.split(/\s+/)
    let current = ''

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (candidate.length <= maxChars) {
        current = candidate
        continue
      }

      if (current) {
        lines.push(current)
        current = ''
      }

      if (word.length <= maxChars) {
        current = word
        continue
      }

      for (let index = 0; index < word.length; index += maxChars) {
        const part = word.slice(index, index + maxChars)
        if (part.length === maxChars) {
          lines.push(part)
        } else {
          current = part
        }
      }
    }

    if (current) {
      lines.push(current)
    }
  }

  return lines.length > 0 ? lines : ['']
}

async function getXlsxModule() {
  const mod = await import('xlsx')
  return (mod.default ?? mod) as typeof import('xlsx')
}

function buildSummaryRows(params: {
  summary: IndicatorsModuleSummary | null
  startDate: string
  endDate: string
  generatedAt: Date
  unitLabel: string
  evaluationCount: number
}) {
  const { summary, startDate, endDate, generatedAt, unitLabel, evaluationCount } = params

  return [
    { Campo: 'Cliente', Valor: normalizeText(summary?.clientLabel, 'Cliente nao identificado') },
    { Campo: 'Perfil ativo', Valor: normalizeText(summary?.activeProfileName, 'Perfil nao informado') },
    { Campo: 'Template', Valor: normalizeText(summary?.templateLabel, 'Template nao informado') },
    { Campo: 'Periodo', Valor: `${formatDate(startDate)} ate ${formatDate(endDate)}` },
    { Campo: 'Filtro loja', Valor: unitLabel || 'Todas as lojas' },
    { Campo: 'Avaliacoes exportadas', Valor: evaluationCount },
    { Campo: 'Lojas configuradas', Valor: normalizeNumber(summary?.storesConfigured) },
    { Campo: 'Providers online', Valor: `${normalizeNumber(summary?.providerOnlineCount)}/${normalizeNumber(summary?.providerTotal)}` },
    { Campo: 'Pendencias de configuracao', Valor: normalizeNumber(summary?.pendingChanges) },
    { Campo: 'Ultima sincronizacao', Valor: normalizeText(summary?.lastSyncLabel, '--') },
    { Campo: 'Gerado em', Valor: generatedAt.toLocaleString('pt-BR') }
  ] as ExportSummaryRow[]
}

function buildEvaluationRows(items: IndicatorsEvaluationListItem[]) {
  return items.map((item) => {
    const indicatorLabels = normalizeStringArray(item.indicatorLabels)
    const indicatorCodes = normalizeStringArray(item.indicatorCodes)
    const indicators = indicatorLabels.length > 0 ? indicatorLabels : indicatorCodes

    return {
      ID: normalizeText(item.id, '--'),
      Avaliador: normalizeText(item.evaluatorName, 'Nao informado'),
      Loja: normalizeText(item.unitName, 'Nao informada'),
      Escopo: formatScopeLabel(normalizeText(item.scopeMode)),
      Status: formatStatusLabel(normalizeText(item.status)),
      'Periodo inicio': formatDate(normalizeText(item.periodStart)),
      'Periodo fim': formatDate(normalizeText(item.periodEnd)),
      'Pontuacao geral': Number(normalizeNumber(item.overallScore).toFixed(1)),
      'Peso total': Number(normalizeNumber(item.totalWeight).toFixed(1)),
      Indicadores: indicators.join(' | '),
      'Qtd indicadores': indicators.length,
      'Criado em': formatDateTime(normalizeText(item.createdAt))
    }
  })
}

function buildRankingRows(dashboard: IndicatorsDashboardResponse | null) {
  const ranking = Array.isArray(dashboard?.ranking) ? dashboard?.ranking : []
  return ranking.map((item, index) => ({
    Posicao: index + 1,
    Loja: normalizeText(item.unitName, 'Nao informada'),
    Pontuacao: Number(normalizeNumber(item.score).toFixed(1)),
    Avaliacoes: Math.round(normalizeNumber(item.evaluationsCount)),
    'Peso usado': Number(normalizeNumber(item.usedWeight).toFixed(1))
  }))
}

async function generateCsvBuffer(rows: ExportEvaluationRow[]) {
  const XLSX = await getXlsxModule()
  const sheet = XLSX.utils.json_to_sheet(rows)
  const csv = XLSX.utils.sheet_to_csv(sheet, {
    FS: ';',
    RS: '\n'
  })
  return Buffer.from(csv, 'utf8')
}

async function generateXlsxBuffer(summaryRows: ExportSummaryRow[], evaluationRows: ExportEvaluationRow[], rankingRows: ExportRankingRow[]) {
  const XLSX = await getXlsxModule()
  const workbook = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Resumo')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(evaluationRows), 'Avaliacoes')

  if (rankingRows.length > 0) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rankingRows), 'Ranking')
  }

  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx'
  }) as Buffer
}

async function generatePdfBuffer(summaryRows: ExportSummaryRow[], evaluationRows: ExportEvaluationRow[], rankingRows: ExportRankingRow[]) {
  const mod = await import('pdf-lib')
  const { PDFDocument, StandardFonts, rgb } = mod
  const pdfDoc = await PDFDocument.create()
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Courier)
  const fontBold = await pdfDoc.embedFont(StandardFonts.CourierBold)
  const maxChars = 98
  const lines: Array<{ text: string, bold?: boolean }> = []

  lines.push({ text: 'EXPORTACAO DE INDICADORES', bold: true })
  lines.push({ text: '' })

  summaryRows.forEach((row) => {
    wrapByChars(`${row.Campo}: ${String(row.Valor)}`, maxChars).forEach((line) => {
      lines.push({ text: line })
    })
  })

  if (rankingRows.length > 0) {
    lines.push({ text: '' })
    lines.push({ text: 'TOP RANKING', bold: true })
    rankingRows.slice(0, 5).forEach((row) => {
      lines.push({ text: `${row.Posicao}. ${row.Loja} | nota ${formatScore(row.Pontuacao)} | ${row.Avaliacoes} avaliacao(oes)` })
    })
  }

  lines.push({ text: '' })
  lines.push({ text: 'AVALIACOES', bold: true })

  evaluationRows.forEach((row, index) => {
    lines.push({
      text: `${index + 1}. ${row.Loja} | ${row.Avaliador} | ${row['Periodo inicio']} ate ${row['Periodo fim']}`,
      bold: true
    })
    lines.push({ text: `   Score: ${formatScore(row['Pontuacao geral'])} | Status: ${row.Status} | Escopo: ${row.Escopo}` })
    wrapByChars(`   Indicadores: ${row.Indicadores || 'Nenhum indicador informado'}`, maxChars).forEach((line) => {
      lines.push({ text: line })
    })
    lines.push({ text: `   Criado em: ${row['Criado em']}` })
    lines.push({ text: '' })
  })

  let page = pdfDoc.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT])
  let cursorY = PDF_PAGE_HEIGHT - PDF_MARGIN

  function addPage() {
    page = pdfDoc.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT])
    cursorY = PDF_PAGE_HEIGHT - PDF_MARGIN
  }

  lines.forEach((line) => {
    if (cursorY <= PDF_MARGIN + PDF_LINE_HEIGHT) {
      addPage()
    }

    page.drawText(line.text, {
      x: PDF_MARGIN,
      y: cursorY,
      size: PDF_FONT_SIZE,
      font: line.bold ? fontBold : fontRegular,
      color: rgb(0.12, 0.12, 0.12)
    })

    cursorY -= PDF_LINE_HEIGHT
  })

  return Buffer.from(await pdfDoc.save())
}

async function fetchDashboard(
  event: Parameters<typeof coreAdminFetch>[0],
  clientId: number,
  startDate: string,
  endDate: string,
  unitExternalId: string
) {
  const response = await coreAdminFetch<ApiEnvelope<IndicatorsDashboardResponse>>(
    event,
    toQueryPath(`${INDICATORS_CORE_BASE}/dashboard`, {
      clientId,
      startDate,
      endDate,
      unitExternalId: unitExternalId || undefined
    })
  )

  return response.item ?? null
}

async function fetchEvaluationsPage(
  event: Parameters<typeof coreAdminFetch>[0],
  params: {
    clientId: number
    startDate: string
    endDate: string
    unitExternalId: string
    page: number
  }
) {
  return coreAdminFetch<ApiItemsEnvelope<IndicatorsEvaluationListItem>>(
    event,
    toQueryPath(`${INDICATORS_CORE_BASE}/evaluations`, {
      clientId: params.clientId,
      startDate: params.startDate,
      endDate: params.endDate,
      unitExternalId: params.unitExternalId || undefined,
      page: params.page,
      limit: EXPORT_PAGE_LIMIT
    })
  )
}

async function fetchAllEvaluations(
  event: Parameters<typeof coreAdminFetch>[0],
  params: {
    clientId: number
    startDate: string
    endDate: string
    unitExternalId: string
  }
) {
  const firstPage = await fetchEvaluationsPage(event, {
    ...params,
    page: 1
  })

  const total = Math.max(0, Math.round(normalizeNumber(firstPage.meta?.total, Array.isArray(firstPage.items) ? firstPage.items.length : 0)))
  if (total > EXPORT_MAX_ITEMS) {
    throw createError({
      statusCode: 422,
      statusMessage: `A exportacao excede o limite de ${EXPORT_MAX_ITEMS} avaliacoes. Refine o periodo ou a loja.`
    })
  }

  const pageCount = total > 0 ? Math.ceil(total / EXPORT_PAGE_LIMIT) : 1
  if (pageCount === 1) {
    return Array.isArray(firstPage.items) ? firstPage.items : []
  }

  const remainingPages = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) => {
      return fetchEvaluationsPage(event, {
        ...params,
        page: index + 2
      })
    })
  )

  return [
    ...(Array.isArray(firstPage.items) ? firstPage.items : []),
    ...remainingPages.flatMap(page => (Array.isArray(page.items) ? page.items : []))
  ]
}

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/indicadores')
  const query = getQuery(event)
  const format = normalizeFormat(query.format)
  const startDate = normalizeDateInput(query.startDate)
  const endDate = normalizeDateInput(query.endDate)
  const unitExternalId = normalizeText(query.unitId)
  const clientId = resolveOwnedClientId(access, query.clientId)

  if (!isValidDateInput(startDate) || !isValidDateInput(endDate)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Informe startDate e endDate validos no formato YYYY-MM-DD.'
    })
  }

  if (endDate < startDate) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A data final nao pode ser menor do que a data inicial.'
    })
  }

  const requestId = randomUUID()
  const startedAt = Date.now()
  const generatedAt = new Date()

  const [dashboardResult, evaluations] = await Promise.all([
    fetchDashboard(event, clientId, startDate, endDate, unitExternalId).catch(() => null),
    fetchAllEvaluations(event, {
      clientId,
      startDate,
      endDate,
      unitExternalId
    })
  ])

  if (evaluations.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Nenhuma avaliacao encontrada para exportar neste recorte.'
    })
  }

  const summary = dashboardResult?.summary ?? null
  const unitLabel = unitExternalId
    ? normalizeText(evaluations[0]?.unitName, 'loja-filtrada')
    : 'todas-as-lojas'
  const summaryRows = buildSummaryRows({
    summary,
    startDate,
    endDate,
    generatedAt,
    unitLabel,
    evaluationCount: evaluations.length
  })
  const evaluationRows = buildEvaluationRows(evaluations)
  const rankingRows = buildRankingRows(dashboardResult)

  let bytes: Buffer
  let contentType = 'text/csv; charset=utf-8'

  if (format === 'xlsx') {
    bytes = await generateXlsxBuffer(summaryRows, evaluationRows, rankingRows)
    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  } else if (format === 'pdf') {
    bytes = await generatePdfBuffer(summaryRows, evaluationRows, rankingRows)
    contentType = 'application/pdf'
  } else {
    bytes = await generateCsvBuffer(evaluationRows)
  }

  const fileName = buildFileName(format, summary, startDate, endDate, unitLabel)
  const elapsedMs = Date.now() - startedAt

  setHeader(event, 'Content-Type', contentType)
  setHeader(event, 'Content-Length', String(bytes.length))
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'X-Export-Request-Id', requestId)
  setHeader(event, 'X-Export-Generation-Ms', String(elapsedMs))
  setHeader(event, 'Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`)

  console.info('[indicators-export] generated', {
    requestId,
    format,
    clientId,
    unitExternalId: unitExternalId || null,
    rows: evaluationRows.length,
    bytes: bytes.length,
    elapsedMs,
    generatedAt: generatedAt.toISOString(),
    viewerUserType: access.userType,
    viewerClientId: access.clientId
  })

  return bytes
})