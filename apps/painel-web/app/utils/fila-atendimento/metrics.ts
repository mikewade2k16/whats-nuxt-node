import type { FilaAtendimentoServiceHistoryEntry } from '~/types/fila-atendimento'

function getMonthStamp(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function formatCurrencyBRL(value: unknown) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value || 0))
}

export function formatPercent(value: unknown) {
  return `${Number(value || 0).toFixed(1)}%`
}

export function formatDurationMinutes(durationMs: unknown) {
  const minutes = Math.round(Number(durationMs || 0) / 60000)
  return `${minutes} min`
}

export function formatDateTime(value: unknown) {
  const timestamp = Number(value || 0)
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '-'
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(timestamp))
}

export function buildConsultantStats(input: {
  history: FilaAtendimentoServiceHistoryEntry[]
  consultantId: string
  monthlyGoal?: number
  commissionRate?: number
  conversionGoal?: number
  avgTicketGoal?: number
  paGoal?: number
}) {
  const now = Date.now()
  const currentMonth = getMonthStamp(now)
  const monthEntries = (Array.isArray(input.history) ? input.history : []).filter(
    (entry) => entry.personId === input.consultantId && getMonthStamp(Number(entry.finishedAt || 0)) === currentMonth
  )
  const convertedEntries = monthEntries.filter(
    (entry) => entry.finishOutcome === 'compra' || entry.finishOutcome === 'reserva' || entry.outcome === 'compra' || entry.outcome === 'reserva'
  )
  const soldValue = convertedEntries.reduce((sum, entry) => sum + Number(entry.saleAmount || 0), 0)
  const conversionRate = monthEntries.length ? (convertedEntries.length / monthEntries.length) * 100 : 0
  const averageDurationMs = monthEntries.length
    ? monthEntries.reduce((sum, entry) => sum + Number(entry.durationMs || 0), 0) / monthEntries.length
    : 0
  const ticketAverage = convertedEntries.length ? soldValue / convertedEntries.length : 0
  const totalPieces = monthEntries.reduce((sum, entry) => {
    const closed = Array.isArray(entry.productsClosed) ? entry.productsClosed.length : 0
    return sum + closed
  }, 0)
  const paScore = monthEntries.length ? totalPieces / monthEntries.length : 0
  const monthlyGoal = Number(input.monthlyGoal || 0)
  const commissionRate = Number(input.commissionRate || 0)

  return {
    monthEntries,
    soldValue,
    conversions: convertedEntries.length,
    nonConversions: monthEntries.length - convertedEntries.length,
    conversionRate,
    ticketAverage,
    paScore,
    averageDurationMs,
    remainingToGoal: Math.max(0, monthlyGoal - soldValue),
    monthlyGoal,
    commissionRate,
    estimatedCommission: soldValue * commissionRate,
    conversionGoal: Number(input.conversionGoal || 0),
    avgTicketGoal: Number(input.avgTicketGoal || 0),
    paGoal: Number(input.paGoal || 0)
  }
}