<script setup lang="ts">
import OmniCollectionFilters from '~/components/omni/filters/OmniCollectionFilters.vue'
import OmniDataTable from '~/components/omni/table/OmniDataTable.vue'
import type { ShortLinkItem } from '~/types/short-links'
import type { OmniFilterDefinition, OmniTableColumn } from '~/types/omni/collection'

definePageMeta({
  layout: 'admin'
})

const {
  shortLinks,
  loading,
  creating,
  deletingId,
  errorMessage,
  savingMap,
  fetchShortLinks,
  createShortLink,
  deleteShortLink
} = useShortLinksManager()
const sessionSimulation = useSessionSimulationStore()
const { bffFetch } = useBffFetch()

const selectedIds = ref<Array<string | number>>([])
const modalOpen = ref(false)
const createSuccessMessage = ref('')
const DEFAULT_ADMIN_CLIENT_ID = 106

const viewerUserType = computed<'admin' | 'client'>(() => {
  return sessionSimulation.userType === 'client' ? 'client' : 'admin'
})
const viewerClientId = computed(() => {
  return Number(sessionSimulation.clientId || DEFAULT_ADMIN_CLIENT_ID)
})
const canChooseClient = computed(() => viewerUserType.value !== 'client')

const clientSelectLoading = ref(false)
const clientSelectOptions = ref<Array<{ label: string, value: number }>>([
  { label: 'crow (Admin)', value: DEFAULT_ADMIN_CLIENT_ID }
])

const createForm = reactive({
  targetUrl: '',
  slug: '',
  clientId: DEFAULT_ADMIN_CLIENT_ID
})

const filtersState = ref<Record<string, unknown>>({
  query: ''
})

const filterDefinitions = computed<OmniFilterDefinition[]>(() => [
  {
    key: 'query',
    label: 'Buscar',
    type: 'text',
    placeholder: 'Pesquisar por slug ou destino...',
    mode: 'columns',
    columns: ['clientName', 'slug', 'targetUrl', 'shortUrl']
  }
])

const allTableColumns = computed<OmniTableColumn[]>(() => [
  { key: 'clientName', label: 'Cliente', adminOnly: true, type: 'text', editable: false, minWidth: 180 },
  { key: 'slug', label: 'Slug', type: 'text', editable: false, minWidth: 180 },
  { key: 'targetUrl', label: 'Destino', type: 'text', editable: false, minWidth: 360 },
  { key: 'hits', label: 'Cliques', type: 'number', editable: false, minWidth: 120 },
  {
    key: 'createdAt',
    label: 'Criado em',
    type: 'text',
    editable: false,
    minWidth: 170,
    formatter: value => formatDate(String(value ?? ''))
  },
  { key: 'shortUrl', label: 'Link Curto', type: 'text', editable: false, minWidth: 360 },
  { key: 'actions', label: 'Opcoes', type: 'custom', minWidth: 160, align: 'center' }
])

const columnExcludeKeys = ['actions']
const alwaysVisibleColumnKeys = new Set(['actions'])
const { visibleColumnKeys, tableColumns } = useOmniVisibleColumns({
  preferenceKey: 'admin.tools.short-links',
  allColumns: allTableColumns,
  columnExcludeKeys,
  alwaysVisibleColumnKeys
})

const filteredRows = computed(() => {
  const rows = shortLinks.value as unknown as Array<Record<string, unknown>>
  return applyOmniFilters(rows, filtersState.value, filterDefinitions.value)
})

function toShortLink(row: Record<string, unknown>) {
  return row as unknown as ShortLinkItem
}

function rowIdValue(row: Record<string, unknown>) {
  const raw = row.id
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatDate(value: string) {
  const raw = String(value ?? '').trim()
  if (!raw) return '-'

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return date.toLocaleString('pt-BR')
}

function normalizeUrl(value: string) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  return `https://${raw}`
}

function normalizeClientId(value: unknown) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return parsed
}

function clientLabelForValue(value: number) {
  const found = clientSelectOptions.value.find(item => Number(item.value) === Number(value))
  if (found) return found.label
  if (Number.isFinite(value) && value > 0) return `Cliente #${value}`
  return 'Sem cliente'
}

async function fetchClientOptions() {
  clientSelectLoading.value = true

  if (viewerUserType.value === 'client') {
    const ownClientId = viewerClientId.value
    clientSelectOptions.value = [
      { label: `Cliente #${ownClientId}`, value: ownClientId }
    ]
    createForm.clientId = ownClientId
    clientSelectLoading.value = false
    return
  }

  try {
    const response = await bffFetch<{ status: string, data: Array<{ id: number, name: string }> }>('/api/admin/clients', {
      query: {
        page: 1,
        limit: 300
      }
    })

    const merged = [
      { label: 'crow (Admin)', value: DEFAULT_ADMIN_CLIENT_ID },
      ...response.data.map(item => ({
        label: String(item.name ?? '').trim() || `Cliente #${item.id}`,
        value: Number(item.id)
      }))
    ].filter(item => Number.isFinite(item.value) && item.value > 0)

    const unique = new Map<number, { label: string, value: number }>()
    merged.forEach((item) => {
      if (!unique.has(item.value)) {
        unique.set(item.value, item)
      }
    })

    clientSelectOptions.value = [...unique.values()]
  } catch {
    clientSelectOptions.value = [{ label: 'crow (Admin)', value: DEFAULT_ADMIN_CLIENT_ID }]
  } finally {
    const selected = normalizeClientId(createForm.clientId)
    createForm.clientId = selected > 0 ? selected : DEFAULT_ADMIN_CLIENT_ID

    clientSelectLoading.value = false
  }
}

function openExternal(url: string) {
  if (!import.meta.client) return
  const target = String(url ?? '').trim()
  if (!target) return
  window.open(target, '_blank', 'noopener,noreferrer')
}

async function copyText(value: string) {
  if (!import.meta.client) return
  const text = String(value ?? '').trim()
  if (!text) return

  if (!navigator.clipboard?.writeText) return
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // no-op
  }
}

function openCreateModal() {
  createForm.targetUrl = ''
  createForm.slug = ''
  createForm.clientId = viewerUserType.value === 'client' ? viewerClientId.value : DEFAULT_ADMIN_CLIENT_ID
  createSuccessMessage.value = ''
  modalOpen.value = true
}

async function submitCreate() {
  createSuccessMessage.value = ''
  const selectedClientId = canChooseClient.value
    ? normalizeClientId(createForm.clientId)
    : viewerClientId.value
  const selectedClientName = clientLabelForValue(selectedClientId)

  const created = await createShortLink({
    targetUrl: normalizeUrl(createForm.targetUrl),
    slug: createForm.slug,
    clientId: selectedClientId,
    clientName: selectedClientName
  })

  if (!created) return

  createSuccessMessage.value = `Link curto criado: ${created.shortUrl}`
  createForm.targetUrl = ''
  createForm.slug = ''
  createForm.clientId = viewerUserType.value === 'client' ? viewerClientId.value : DEFAULT_ADMIN_CLIENT_ID
  modalOpen.value = false
}

function onResetFilters() {
  filtersState.value = {
    query: ''
  }
}

async function onDeleteLink(id: number) {
  if (import.meta.client) {
    const confirmed = window.confirm('Excluir este link curto? Esta acao nao pode ser desfeita.')
    if (!confirmed) {
      return
    }
  }

  await deleteShortLink(id)
}

onMounted(() => {
  sessionSimulation.initialize()
  void Promise.all([
    fetchShortLinks(),
    fetchClientOptions()
  ])
})

watch(
  () => sessionSimulation.requestContextHash,
  () => {
    void fetchClientOptions()
  }
)
</script>

<template>
  <section class="short-links-page space-y-4">
    <AdminPageHeader
      class="short-links-page__header"
      eyebrow="Tools"
      title="Encurtador de Link"
      description="Crie links curtos rapidamente com slug personalizado e gerenciamento simples."
    />

    <OmniCollectionFilters
      v-model="filtersState"
      :filters="filterDefinitions"
      :viewer-user-type="viewerUserType"
      :table-columns="allTableColumns"
      v-model:visible-columns="visibleColumnKeys"
      :column-exclude-keys="columnExcludeKeys"
      :loading="loading"
      @reset="onResetFilters"
    >
      <template #actions>
        <UBadge color="neutral" variant="soft">
          Selecionados: {{ selectedIds.length }}
        </UBadge>

        <UButton
          icon="i-lucide-plus"
          label="Novo link curto"
          color="primary"
          :loading="creating"
          :disabled="creating"
          @click="openCreateModal"
        />
      </template>
    </OmniCollectionFilters>

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      icon="i-lucide-alert-triangle"
      title="Erro"
      :description="errorMessage"
    />

    <OmniDataTable
      v-model="selectedIds"
      :rows="filteredRows"
      :columns="tableColumns"
      :viewer-user-type="viewerUserType"
      row-key="id"
      :loading="loading"
      empty-text="Nenhum link encontrado com os filtros atuais."
    >
      <template #cell-actions="{ row }">
        <div class="short-links-page__row-actions flex items-center justify-end gap-1">
          <UButton
            icon="i-lucide-copy"
            color="neutral"
            variant="ghost"
            size="sm"
            aria-label="Copiar link curto"
            @click="copyText(toShortLink(row).shortUrl)"
          />

          <UButton
            icon="i-lucide-external-link"
            color="neutral"
            variant="ghost"
            size="sm"
            aria-label="Abrir link curto"
            @click="openExternal(toShortLink(row).shortUrl)"
          />

          <UButton
            icon="i-lucide-link"
            color="neutral"
            variant="ghost"
            size="sm"
            aria-label="Abrir destino"
            @click="openExternal(toShortLink(row).targetUrl)"
          />

          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            size="sm"
            aria-label="Excluir"
            :loading="deletingId === rowIdValue(row) || Boolean(savingMap[`${rowIdValue(row)}:delete`])"
            @click="onDeleteLink(rowIdValue(row))"
          />
        </div>
      </template>
    </OmniDataTable>
  </section>

  <UModal
    v-model:open="modalOpen"
    title="Novo link curto"
    description="Informe a URL original e opcionalmente um slug personalizado."
    :ui="{ content: 'max-w-xl' }"
  >
    <template #body>
      <div class="short-links-page__create-modal-body space-y-3">
        <div class="space-y-1">
          <p class="text-xs text-[rgb(var(--muted))]">URL original</p>
          <UInput v-model="createForm.targetUrl" placeholder="https://..." />
        </div>

        <div class="space-y-1">
          <p class="text-xs text-[rgb(var(--muted))]">Slug personalizado (opcional)</p>
          <UInput v-model="createForm.slug" placeholder="promo2026" />
          <p class="text-[11px] text-[rgb(var(--muted))]">Permitido: letras, numeros, ponto, traço e underline.</p>
        </div>

        <div class="space-y-1">
          <p class="text-xs text-[rgb(var(--muted))]">Cliente</p>
          <USelect
            v-if="canChooseClient"
            v-model="createForm.clientId"
            :items="clientSelectOptions"
            :loading="clientSelectLoading"
          />
          <UInput
            v-else
            :model-value="clientLabelForValue(viewerClientId)"
            disabled
          />
        </div>

        <UAlert
          v-if="createSuccessMessage"
          color="success"
          variant="soft"
          icon="i-lucide-badge-check"
          :description="createSuccessMessage"
        />
      </div>
    </template>

    <template #footer>
      <div class="short-links-page__create-modal-footer flex w-full items-center justify-end gap-2">
        <UButton label="Fechar" color="neutral" variant="ghost" @click="modalOpen = false" />
        <UButton label="Encurtar" icon="i-lucide-scissors" color="primary" :loading="creating" :disabled="creating" @click="submitCreate" />
      </div>
    </template>
  </UModal>
</template>
