<script setup lang="ts">
import QRCode from 'qrcode'
import OmniCollectionFilters from '~/components/omni/filters/OmniCollectionFilters.vue'
import OmniDataTable from '~/components/omni/table/OmniDataTable.vue'
import type { QrCodeItem } from '~/types/qrcodes'
import type { OmniFilterDefinition, OmniTableCellUpdate, OmniTableColumn } from '~/types/omni/collection'

definePageMeta({
  layout: 'admin'
})

const {
  qrcodes,
  loading,
  creating,
  deletingId,
  errorMessage,
  savingMap,
  fetchQrCodes,
  createQrCode,
  updateQrCode,
  deleteQrCode
} = useQrcodesManager()
const sessionSimulation = useSessionSimulationStore()
const { bffFetch } = useBffFetch()

const selectedIds = ref<Array<string | number>>([])
const modalOpen = ref(false)
const modalMode = ref<'create' | 'edit'>('create')
const previewQrImage = ref('')
const previewErrorMessage = ref('')
const submitSuccessMessage = ref('')
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

const formState = reactive({
  id: 0,
  slug: '',
  targetUrl: '',
  fillColor: '#000000',
  backColor: '#ffffff',
  size: 220,
  isActive: true,
  clientId: DEFAULT_ADMIN_CLIENT_ID
})

const filtersState = ref<Record<string, unknown>>({
  query: '',
  statusFilter: ''
})

const filterDefinitions = computed<OmniFilterDefinition[]>(() => [
  {
    key: 'query',
    label: 'Buscar',
    type: 'text',
    placeholder: 'Pesquisar por slug ou destino...',
    mode: 'columns',
    columns: ['clientName', 'slug', 'targetUrl']
  },
  {
    key: 'statusFilter',
    label: 'Status',
    type: 'select',
    placeholder: 'Status',
    options: [
      { label: 'Ativo', value: 'active' },
      { label: 'Inativo', value: 'inactive' }
    ],
    accessor: row => (Boolean(row.isActive) ? 'active' : 'inactive')
  }
])

const allTableColumns = computed<OmniTableColumn[]>(() => [
  { key: 'id', label: 'ID', type: 'number', editable: false, minWidth: 90 },
  { key: 'clientName', label: 'Cliente', adminOnly: true, type: 'text', editable: false, minWidth: 180 },
  { key: 'slug', label: 'Slug', type: 'text', editable: false, minWidth: 170 },
  { key: 'targetUrl', label: 'Destino', type: 'text', editable: false, minWidth: 330 },
  {
    key: 'qrImagePath',
    label: 'QR Code',
    type: 'image',
    editable: false,
    minWidth: 120,
    align: 'center'
  },
  {
    key: 'isActive',
    label: 'Ativo',
    type: 'switch',
    editable: true,
    immediate: true,
    switchOnValue: true,
    switchOffValue: false,
    minWidth: 110,
    align: 'center'
  },
  { key: 'scanCount', label: 'Scans', type: 'number', editable: false, minWidth: 110 },
  {
    key: 'createdAt',
    label: 'Criado em',
    type: 'text',
    editable: false,
    minWidth: 170,
    formatter: value => formatDate(String(value ?? ''))
  },
  { key: 'actions', label: 'Opcoes', type: 'custom', minWidth: 170, align: 'center' }
])

const columnExcludeKeys = ['actions']
const alwaysVisibleColumnKeys = new Set(['actions'])
const { visibleColumnKeys, tableColumns } = useOmniVisibleColumns({
  preferenceKey: 'admin.tools.qr-codes',
  allColumns: allTableColumns,
  columnExcludeKeys,
  alwaysVisibleColumnKeys
})

const filteredRows = computed(() => {
  const rows = qrcodes.value as unknown as Array<Record<string, unknown>>
  return applyOmniFilters(rows, filtersState.value, filterDefinitions.value)
})

const modalTitle = computed(() => modalMode.value === 'create' ? 'Novo QR Code' : 'Editar QR Code')

const submitLoading = computed(() => {
  if (modalMode.value === 'create') return creating.value
  const id = Number(formState.id || 0)
  if (!id) return false
  return Boolean(savingMap.value[`${id}:update`])
})

function toQrCode(row: Record<string, unknown>) {
  return row as unknown as QrCodeItem
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

function normalizeSlug(value: string) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
}

function normalizeTargetUrl(value: string) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  return `https://${raw}`
}

function normalizeColor(value: string, fallback: string) {
  const raw = String(value ?? '').trim()
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toLowerCase() : fallback
}

function normalizeSize(value: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return 220
  if (parsed < 120) return 120
  if (parsed > 1000) return 1000
  return parsed
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
    formState.clientId = ownClientId
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
    clientSelectLoading.value = false
  }
}

async function refreshPreview() {
  previewErrorMessage.value = ''
  const targetUrl = normalizeTargetUrl(formState.targetUrl)
  if (!targetUrl) {
    previewQrImage.value = ''
    return
  }

  try {
    const dataUrl = await QRCode.toDataURL(targetUrl, {
      width: normalizeSize(formState.size),
      margin: 1,
      color: {
        dark: normalizeColor(formState.fillColor, '#000000'),
        light: normalizeColor(formState.backColor, '#ffffff')
      },
      errorCorrectionLevel: 'H'
    })

    previewQrImage.value = dataUrl
  } catch {
    previewQrImage.value = ''
    previewErrorMessage.value = 'Falha ao gerar preview do QR Code.'
  }
}

watch(
  () => [formState.targetUrl, formState.fillColor, formState.backColor, formState.size, modalOpen.value],
  async (value) => {
    const open = Boolean(value[4])
    if (!open) return
    await refreshPreview()
  },
  { immediate: false }
)

function openCreateModal() {
  modalMode.value = 'create'
  formState.id = 0
  formState.slug = ''
  formState.targetUrl = ''
  formState.fillColor = '#000000'
  formState.backColor = '#ffffff'
  formState.size = 220
  formState.isActive = true
  formState.clientId = viewerUserType.value === 'client' ? viewerClientId.value : DEFAULT_ADMIN_CLIENT_ID
  previewQrImage.value = ''
  previewErrorMessage.value = ''
  submitSuccessMessage.value = ''
  modalOpen.value = true
}

function openEditModal(item: QrCodeItem) {
  modalMode.value = 'edit'
  formState.id = item.id
  formState.slug = item.slug
  formState.targetUrl = item.targetUrl
  formState.fillColor = item.fillColor
  formState.backColor = item.backColor
  formState.size = item.size
  formState.isActive = item.isActive
  formState.clientId = item.clientId || DEFAULT_ADMIN_CLIENT_ID
  previewQrImage.value = item.qrImagePath || ''
  previewErrorMessage.value = ''
  submitSuccessMessage.value = ''
  modalOpen.value = true
}

async function submitQrCode() {
  submitSuccessMessage.value = ''

  const payload = {
    slug: normalizeSlug(formState.slug),
    targetUrl: normalizeTargetUrl(formState.targetUrl),
    fillColor: normalizeColor(formState.fillColor, '#000000'),
    backColor: normalizeColor(formState.backColor, '#ffffff'),
    size: normalizeSize(formState.size),
    isActive: Boolean(formState.isActive),
    clientId: canChooseClient.value ? normalizeClientId(formState.clientId) : viewerClientId.value,
    clientName: clientLabelForValue(canChooseClient.value ? normalizeClientId(formState.clientId) : viewerClientId.value)
  }

  if (!payload.targetUrl) {
    previewErrorMessage.value = 'Informe a URL de destino.'
    return
  }

  if (modalMode.value === 'create') {
    const created = await createQrCode(payload)
    if (!created) return
    submitSuccessMessage.value = `QR criado com slug ${created.slug}.`
    modalOpen.value = false
    return
  }

  const id = Number(formState.id || 0)
  if (!id) return

  const updated = await updateQrCode(id, payload, 'update')
  if (!updated) return
  submitSuccessMessage.value = `QR atualizado com slug ${updated.slug}.`
  previewQrImage.value = updated.qrImagePath
  modalOpen.value = false
}

async function onCellUpdate(payload: OmniTableCellUpdate) {
  const field = String(payload.key)
  if (field !== 'isActive') return

  const id = Number(payload.rowId)
  if (!Number.isFinite(id) || id <= 0) return

  await updateQrCode(id, {
    isActive: Boolean(payload.value)
  }, 'toggle')
}

function downloadQr(item: QrCodeItem) {
  if (!import.meta.client) return
  const href = String(item.qrImagePath ?? '').trim()
  if (!href) return

  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = `${item.slug || 'qrcode'}.png`
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

async function onDeleteQrCode(id: number) {
  if (import.meta.client) {
    const confirmed = window.confirm('Excluir este QR Code? Esta acao nao pode ser desfeita.')
    if (!confirmed) {
      return
    }
  }

  await deleteQrCode(id)
}

function onResetFilters() {
  filtersState.value = {
    query: '',
    statusFilter: ''
  }
}

onMounted(() => {
  sessionSimulation.initialize()
  void Promise.all([
    fetchQrCodes(),
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
  <section class="qr-codes-page space-y-4">
    <AdminPageHeader
      class="qr-codes-page__header"
      eyebrow="Tools"
      title="QR Code"
      description="Gere QR Codes personalizados, com preview em tempo real, download e controle de status."
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
          label="Novo QR"
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
      empty-text="Nenhum QR Code encontrado com os filtros atuais."
      @update:cell="onCellUpdate"
    >
      <template #cell-actions="{ row }">
        <div class="qr-codes-page__row-actions flex items-center justify-end gap-1">
          <UButton
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="sm"
            aria-label="Editar QR"
            @click="openEditModal(toQrCode(row))"
          />

          <UButton
            icon="i-lucide-download"
            color="neutral"
            variant="ghost"
            size="sm"
            aria-label="Baixar QR"
            @click="downloadQr(toQrCode(row))"
          />

          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            size="sm"
            aria-label="Excluir"
            :loading="deletingId === rowIdValue(row) || Boolean(savingMap[`${rowIdValue(row)}:delete`])"
            @click="onDeleteQrCode(rowIdValue(row))"
          />
        </div>
      </template>
    </OmniDataTable>
  </section>

  <UModal
    v-model:open="modalOpen"
    :title="modalTitle"
    description="Preencha os dados para gerar ou editar o QR Code."
    :ui="{ content: 'max-w-4xl' }"
  >
    <template #body>
      <div class="qr-codes-page__modal-body grid gap-3 md:grid-cols-[minmax(0,1fr)_280px]">
        <div class="space-y-3">
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="space-y-1">
              <p class="text-xs text-[rgb(var(--muted))]">Slug</p>
              <UInput
                v-model="formState.slug"
                placeholder="meu-qr"
                @update:model-value="submitSuccessMessage = ''"
              />
            </div>

            <div class="space-y-1">
              <p class="text-xs text-[rgb(var(--muted))]">Tamanho (px)</p>
              <UInput
                v-model.number="formState.size"
                type="number"
                min="120"
                max="1000"
                @update:model-value="submitSuccessMessage = ''"
              />
            </div>
          </div>

          <div class="space-y-1">
            <p class="text-xs text-[rgb(var(--muted))]">Destino (URL)</p>
            <UInput
              v-model="formState.targetUrl"
              placeholder="https://..."
              @update:model-value="submitSuccessMessage = ''"
            />
          </div>

          <div class="space-y-1">
            <p class="text-xs text-[rgb(var(--muted))]">Cliente</p>
            <USelect
              v-if="canChooseClient"
              v-model="formState.clientId"
              :items="clientSelectOptions"
              :loading="clientSelectLoading"
            />
            <UInput
              v-else
              :model-value="clientLabelForValue(viewerClientId)"
              disabled
            />
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div class="space-y-1">
              <p class="text-xs text-[rgb(var(--muted))]">Cor do QR</p>
              <input v-model="formState.fillColor" type="color" class="h-9 w-full cursor-pointer rounded border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-1">
            </div>

            <div class="space-y-1">
              <p class="text-xs text-[rgb(var(--muted))]">Cor de fundo</p>
              <input v-model="formState.backColor" type="color" class="h-9 w-full cursor-pointer rounded border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-1">
            </div>
          </div>

          <div class="flex items-center gap-2">
            <USwitch v-model="formState.isActive" />
            <span class="text-xs text-[rgb(var(--muted))]">QR ativo</span>
          </div>

          <UAlert
            v-if="previewErrorMessage"
            color="error"
            variant="soft"
            icon="i-lucide-alert-triangle"
            :description="previewErrorMessage"
          />

          <UAlert
            v-if="submitSuccessMessage"
            color="success"
            variant="soft"
            icon="i-lucide-badge-check"
            :description="submitSuccessMessage"
          />
        </div>

        <aside class="qr-codes-page__preview-panel rounded-[var(--radius-md)] border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-3">
          <p class="mb-2 text-xs font-medium text-[rgb(var(--muted))]">Pre-visualizacao</p>

          <div class="flex min-h-[240px] items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2">
            <img
              v-if="previewQrImage"
              :src="previewQrImage"
              alt="Preview QR"
              class="max-h-[220px] max-w-full object-contain"
            >
            <p v-else class="text-xs text-[rgb(var(--muted))]">Informe a URL para gerar o preview.</p>
          </div>
        </aside>
      </div>
    </template>

    <template #footer>
      <div class="qr-codes-page__modal-footer flex w-full items-center justify-end gap-2">
        <UButton label="Fechar" color="neutral" variant="ghost" @click="modalOpen = false" />
        <UButton
          :label="modalMode === 'create' ? 'Salvar QR' : 'Atualizar QR'"
          icon="i-lucide-save"
          color="primary"
          :loading="submitLoading"
          :disabled="submitLoading"
          @click="submitQrCode"
        />
      </div>
    </template>
  </UModal>
</template>
