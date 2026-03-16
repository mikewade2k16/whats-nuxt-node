import type {
  FinanceCategoryConfig,
  FinanceRecurringEntryConfig,
  FinanceConfigResponse,
  FinanceFixedAccountConfig
} from '~/types/finances'

interface FinanceConfigState {
  clientId: number
  categories: FinanceCategoryConfig[]
  fixedAccounts: FinanceFixedAccountConfig[]
  recurringEntries: FinanceRecurringEntryConfig[]
  updatedAt: string
}

function normalizeText(value: unknown, max = 300) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function normalizeAmount(value: unknown) {
  const parsed = Number(value ?? 0)
  if (!Number.isFinite(parsed)) return 0
  return Number(parsed.toFixed(2))
}

export function useFinancesConfigManager() {
  const { bffFetch } = useBffFetch()
  const loading = ref(false)
  const saving = ref(false)
  const errorMessage = ref('')
  const config = ref<FinanceConfigState | null>(null)

  async function fetchConfig(clientId?: number) {
    loading.value = true
    errorMessage.value = ''

    try {
      const response = await bffFetch<FinanceConfigResponse>('/api/admin/finances/config', {
        query: {
          clientId: Number.isFinite(Number(clientId)) ? Number(clientId) : undefined
        }
      })
      config.value = response.data
      return response.data
    } catch {
      errorMessage.value = 'Falha ao carregar configuracoes financeiras.'
      return null
    } finally {
      loading.value = false
    }
  }

  async function saveConfig(payload: {
    clientId?: number
    categories?: FinanceCategoryConfig[]
    fixedAccounts?: FinanceFixedAccountConfig[]
    recurringEntries?: FinanceRecurringEntryConfig[]
  }) {
    saving.value = true
    errorMessage.value = ''

    try {
      const response = await bffFetch<FinanceConfigResponse>('/api/admin/finances/config', {
        method: 'PATCH',
        body: {
          clientId: payload.clientId,
          categories: Array.isArray(payload.categories)
            ? payload.categories.map((category) => ({
              id: normalizeText(category.id, 90),
              name: normalizeText(category.name, 120),
              kind: category.kind,
              description: normalizeText(category.description, 400)
            }))
            : undefined,
          fixedAccounts: Array.isArray(payload.fixedAccounts)
            ? payload.fixedAccounts.map((account) => ({
              id: normalizeText(account.id, 90),
              name: normalizeText(account.name, 120),
              kind: account.kind,
              categoryId: normalizeText(account.categoryId, 90),
              defaultAmount: normalizeAmount(account.defaultAmount),
              notes: normalizeText(account.notes, 500),
              members: Array.isArray(account.members)
                ? account.members.map((member) => ({
                  id: normalizeText(member.id, 90),
                  name: normalizeText(member.name, 120),
                  amount: normalizeAmount(member.amount)
                }))
                : []
            }))
            : undefined,
          recurringEntries: Array.isArray(payload.recurringEntries)
            ? payload.recurringEntries.map((entry) => ({
              sourceClientId: Number(entry.sourceClientId || 0),
              adjustmentAmount: normalizeAmount(entry.adjustmentAmount),
              notes: normalizeText(entry.notes, 240)
            }))
            : undefined
        }
      })

      config.value = response.data
      return response.data
    } catch {
      errorMessage.value = 'Falha ao salvar configuracoes financeiras.'
      return null
    } finally {
      saving.value = false
    }
  }

  return {
    config,
    loading,
    saving,
    errorMessage,
    fetchConfig,
    saveConfig
  }
}
