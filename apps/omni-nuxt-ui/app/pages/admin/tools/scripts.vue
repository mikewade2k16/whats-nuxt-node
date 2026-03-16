<script setup lang="ts">
import OmniSelectMenuInput from '~/components/inputs/OmniSelectMenuInput.vue'
import OmniCollectionFilters from '~/components/omni/filters/OmniCollectionFilters.vue'
import type { ScriptDocumentItem, ScriptRowItem } from '~/types/scripts'
import type { OmniFilterDefinition, OmniSelectOption } from '~/types/omni/collection'

definePageMeta({
  layout: 'admin'
})

const DEFAULT_ADMIN_CLIENT_ID = 106
const AUTOSAVE_DELAY_MS = 420
const DEFAULT_SCRIPT_STATUS = 'em_criacao'

const SCRIPT_STATUS_PRESETS: OmniSelectOption[] = [
  { label: 'Em criacao', value: 'em_criacao' },
  { label: 'Roteirizando', value: 'roteirizando' },
  { label: 'Em revisao', value: 'em_revisao' },
  { label: 'Aprovado', value: 'aprovado' },
  { label: 'Pronto para gravar', value: 'pronto_para_gravar' },
  { label: 'Em gravacao', value: 'em_gravacao' },
  { label: 'Em edicao', value: 'em_edicao' },
  { label: 'Finalizado', value: 'finalizado' }
]

const SCRIPT_STATUS_COLOR_MAP: Record<string, 'primary' | 'neutral' | 'success' | 'info' | 'warning' | 'error'> = {
  em_criacao: 'warning',
  roteirizando: 'info',
  em_revisao: 'warning',
  aprovado: 'primary',
  pronto_para_gravar: 'primary',
  em_gravacao: 'info',
  em_edicao: 'warning',
  finalizado: 'success',
  pausado: 'neutral',
  arquivado: 'neutral'
}

const sessionSimulation = useSessionSimulationStore()
const { bffFetch } = useBffFetch()

const {
  scripts,
  loading,
  creating,
  deletingId,
  errorMessage,
  savingMap,
  fetchScripts,
  createScript,
  updateScript,
  deleteScript
} = useScriptsManager()

const viewerUserType = computed<'admin' | 'client'>(() => {
  return sessionSimulation.userType === 'client' ? 'client' : 'admin'
})
const viewerClientId = computed(() => Number(sessionSimulation.clientId || DEFAULT_ADMIN_CLIENT_ID))
const canChooseClient = computed(() => viewerUserType.value === 'admin')

const clientSelectLoading = ref(false)
const clientSelectOptions = ref<Array<{ label: string, value: number }>>([
  { label: 'crow (Admin)', value: DEFAULT_ADMIN_CLIENT_ID }
])
const createdStatusOptions = ref<OmniSelectOption[]>([])

const filtersState = ref<Record<string, unknown>>({
  query: '',
  clientFilter: '',
  statusFilter: ''
})

const filterDefinitions = computed<OmniFilterDefinition[]>(() => [
  {
    key: 'query',
    label: 'Buscar',
    type: 'text',
    placeholder: 'Pesquisar por titulo ou conteudo...',
    mode: 'columns',
    columns: ['title', 'preview', 'clientName', 'status']
  },
  {
    key: 'statusFilter',
    label: 'Status',
    type: 'select',
    placeholder: 'Todos os status',
    options: statusSelectOptions.value,
    accessor: row => row.status
  },
  {
    key: 'clientFilter',
    label: 'Cliente',
    type: 'select',
    adminOnly: true,
    placeholder: 'Todos os clientes',
    options: clientSelectOptions.value.map(option => ({
      label: option.label,
      value: option.value
    })),
    accessor: row => row.clientId
  }
])

const filteredScripts = computed(() => {
  const rows = scripts.value as unknown as Array<Record<string, unknown>>
  return applyOmniFilters(rows, filtersState.value, filterDefinitions.value) as unknown as ScriptDocumentItem[]
})

const selectedScriptId = ref<number | null>(null)
const isHydratingDraft = ref(false)
let autosaveTimer: ReturnType<typeof setTimeout> | null = null
const pdfModalOpen = ref(false)
const pdfGenerating = ref(false)
const pdfPreviewUrl = ref('')
const pdfFileName = ref('roteiro.pdf')
const pdfErrorMessage = ref('')
const pdfIframeEl = ref<HTMLIFrameElement | null>(null)
const editorShellEl = ref<HTMLElement | null>(null)
const sidebarHeightPx = ref(0)
let editorResizeObserver: ResizeObserver | null = null
const pdfDebugState = reactive({
  status: 'idle' as 'idle' | 'loading' | 'success' | 'error',
  httpStatus: 0,
  requestId: '',
  serverMs: '',
  elapsedMs: 0,
  bytes: 0,
  message: ''
})

const draft = reactive<{
  title: string
  status: string
  notes: string
  clientId: number
  rows: ScriptRowItem[]
}>({
  title: '',
  status: DEFAULT_SCRIPT_STATUS,
  notes: '',
  clientId: DEFAULT_ADMIN_CLIENT_ID,
  rows: []
})

function normalizeText(value: unknown, max = 220) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function statusKey(value: unknown) {
  return normalizeText(value, 120)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function formatStatusLabel(value: unknown) {
  const raw = normalizeText(value, 120)
  if (!raw) return 'Sem status'
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

function statusLabelFromValue(value: unknown) {
  const raw = normalizeText(value, 120)
  if (!raw) return 'Sem status'
  const known = statusSelectOptions.value.find(option => statusKey(option.value) === statusKey(raw))
  if (known) return known.label
  return formatStatusLabel(raw)
}

function dedupeSelectOptions(options: OmniSelectOption[]) {
  const seen = new Set<string>()
  const out: OmniSelectOption[] = []

  options.forEach((option) => {
    const value = normalizeText(option.value, 120)
    if (!value) return
    const key = statusKey(value)
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push({
      label: normalizeText(option.label || value, 120) || value,
      value
    })
  })

  return out
}

const statusSelectOptions = computed<OmniSelectOption[]>(() => {
  const dynamic = scripts.value
    .map((script) => {
      const value = normalizeText(script.status, 120)
      if (!value) return null
      return {
        label: formatStatusLabel(value),
        value
      } as OmniSelectOption
    })
    .filter((item): item is OmniSelectOption => Boolean(item))

  return dedupeSelectOptions([
    ...SCRIPT_STATUS_PRESETS,
    ...createdStatusOptions.value,
    ...dynamic
  ])
})

function statusBadgeColor(value: unknown) {
  return SCRIPT_STATUS_COLOR_MAP[statusKey(value)] || 'neutral'
}

function scriptCellPreview(script: ScriptDocumentItem, field: 'audio' | 'video') {
  const rows = (script.rows || [])
    .map(row => normalizeText(row[field], 120))
    .filter(Boolean)

  if (rows.length === 0) {
    return field === 'audio' ? 'Sem audio' : 'Sem video'
  }

  return rows.slice(0, 2).join(' / ')
}

const activeScript = computed(() => {
  const id = Number(selectedScriptId.value || 0)
  if (!id) return null
  return scripts.value.find(item => item.id === id) ?? null
})

const activeScriptSaving = computed(() => {
  const id = Number(selectedScriptId.value || 0)
  if (!id) return false
  return Boolean(savingMap.value[`${id}:update`])
})

function normalizeClientId(value: unknown) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return parsed
}

function buildRowId(index: number) {
  return `row-${Date.now()}-${index + 1}`
}

function ensureDraftHasRows() {
  if (draft.rows.length > 0) return
  draft.rows = [{
    id: buildRowId(0),
    audio: '',
    video: ''
  }]
}

function resetDraft() {
  isHydratingDraft.value = true
  draft.title = ''
  draft.status = DEFAULT_SCRIPT_STATUS
  draft.notes = ''
  draft.clientId = viewerUserType.value === 'client' ? viewerClientId.value : DEFAULT_ADMIN_CLIENT_ID
  draft.rows = [{
    id: buildRowId(0),
    audio: '',
    video: ''
  }]
  isHydratingDraft.value = false
}

function hydrateDraftFromScript(script: ScriptDocumentItem | null) {
  isHydratingDraft.value = true

  if (!script) {
    resetDraft()
    isHydratingDraft.value = false
    return
  }

  draft.title = String(script.title ?? '')
  draft.status = normalizeText(script.status, 120) || DEFAULT_SCRIPT_STATUS
  draft.notes = String(script.notes ?? '')
  draft.clientId = Number(script.clientId || (viewerUserType.value === 'client' ? viewerClientId.value : DEFAULT_ADMIN_CLIENT_ID))
  draft.rows = (script.rows || []).map((row, index) => ({
    id: String(row.id || buildRowId(index)),
    audio: String(row.audio ?? ''),
    video: String(row.video ?? '')
  }))
  ensureDraftHasRows()
  isHydratingDraft.value = false
}

function selectScript(id: number) {
  if (!Number.isFinite(id) || id <= 0) return
  selectedScriptId.value = id
}

function selectFirstAvailableScript() {
  if (filteredScripts.value.length === 0) {
    selectedScriptId.value = null
    resetDraft()
    return
  }

  const alreadyVisible = filteredScripts.value.some(item => item.id === selectedScriptId.value)
  if (alreadyVisible) return

  selectedScriptId.value = filteredScripts.value[0]?.id ?? null
}

function scheduleAutosave() {
  if (isHydratingDraft.value) return
  if (!selectedScriptId.value) return

  if (autosaveTimer) {
    clearTimeout(autosaveTimer)
    autosaveTimer = null
  }

  autosaveTimer = setTimeout(() => {
    void persistDraftChanges()
  }, AUTOSAVE_DELAY_MS)
}

async function persistDraftChanges() {
  const id = Number(selectedScriptId.value || 0)
  if (!id) return

  const selectedClientOption = clientSelectOptions.value.find(option => option.value === draft.clientId)
  await updateScript(id, {
    title: draft.title,
    status: draft.status,
    notes: draft.notes,
    rows: draft.rows,
    clientId: canChooseClient.value ? draft.clientId : viewerClientId.value,
    clientName: selectedClientOption?.label ?? `Cliente #${draft.clientId}`
  })
}

function addRow() {
  draft.rows.push({
    id: buildRowId(draft.rows.length),
    audio: '',
    video: ''
  })
  scheduleAutosave()
}

function removeRow(index: number) {
  if (index < 0 || index >= draft.rows.length) return
  draft.rows.splice(index, 1)
  ensureDraftHasRows()
  scheduleAutosave()
}

function moveRow(index: number, direction: -1 | 1) {
  const nextIndex = index + direction
  if (index < 0 || index >= draft.rows.length) return
  if (nextIndex < 0 || nextIndex >= draft.rows.length) return

  const [current] = draft.rows.splice(index, 1)
  if (!current) return
  draft.rows.splice(nextIndex, 0, current)
  scheduleAutosave()
}

function onDraftClientChange(value: unknown) {
  if (!canChooseClient.value) return
  const next = normalizeClientId(value)
  if (next <= 0) return
  draft.clientId = next
  scheduleAutosave()
}

function onDraftStatusChange(value: unknown) {
  const status = normalizeText(value, 120)
  if (!status) return
  draft.status = status
  scheduleAutosave()
}

function onCreateStatusOption(option: OmniSelectOption) {
  const value = normalizeText(option.value, 120)
  if (!value) return

  createdStatusOptions.value = dedupeSelectOptions([
    ...createdStatusOptions.value,
    {
      label: normalizeText(option.label || value, 120) || value,
      value
    }
  ])

  draft.status = value
  scheduleAutosave()
}

function onResetFilters() {
  filtersState.value = {
    query: '',
    clientFilter: '',
    statusFilter: ''
  }
}

function syncSidebarHeightWithEditor() {
  if (!import.meta.client) return
  const editorEl = editorShellEl.value
  if (!editorEl) return

  const nextHeight = Math.round(editorEl.getBoundingClientRect().height)
  if (nextHeight <= 0) return
  sidebarHeightPx.value = nextHeight
}

const sidebarContainerStyle = computed(() => {
  if (!sidebarHeightPx.value) return {}
  const height = `${sidebarHeightPx.value}px`
  return {
    height,
    maxHeight: height
  }
})

const dashboardPanelStyle = {
  minHeight: '0px',
  height: 'auto'
} as const

function resetPdfDebugState() {
  pdfDebugState.status = 'idle'
  pdfDebugState.httpStatus = 0
  pdfDebugState.requestId = ''
  pdfDebugState.serverMs = ''
  pdfDebugState.elapsedMs = 0
  pdfDebugState.bytes = 0
  pdfDebugState.message = ''
}

function clearPdfPreviewUrl() {
  if (!import.meta.client) return
  if (!pdfPreviewUrl.value) return
  URL.revokeObjectURL(pdfPreviewUrl.value)
  pdfPreviewUrl.value = ''
}

function toSafePdfFileName(rawTitle: string) {
  const title = String(rawTitle ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, 120)

  const fallback = `roteiro-${selectedScriptId.value || 'draft'}`
  const baseName = title || fallback
  return `${baseName}.pdf`
}

function extractFileNameFromContentDisposition(value: string | null) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const utf8Match = raw.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match && utf8Match[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim())
    } catch {
      return utf8Match[1].trim()
    }
  }

  const simpleMatch = raw.match(/filename="([^"]+)"/i) || raw.match(/filename=([^;]+)/i)
  if (!simpleMatch || !simpleMatch[1]) return ''
  return simpleMatch[1].trim()
}

function buildPdfPayload() {
  return {
    scriptId: Number(selectedScriptId.value || 0),
    title: String(draft.title ?? ''),
    notes: String(draft.notes ?? ''),
    rows: draft.rows.map((row) => ({
      id: String(row.id ?? ''),
      audio: String(row.audio ?? ''),
      video: String(row.video ?? '')
    }))
  }
}

async function generatePdfPreview() {
  if (!import.meta.client) return
  if (!selectedScriptId.value) return

  pdfGenerating.value = true
  pdfErrorMessage.value = ''
  resetPdfDebugState()
  clearPdfPreviewUrl()

  const payload = buildPdfPayload()
  const startedAt = performance.now()

  try {
    console.groupCollapsed('[scripts-pdf] generating preview')
    console.info('[scripts-pdf] payload', payload)

    const response = await fetch('/api/admin/scripts/pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...sessionSimulation.requestHeaders
      },
      body: JSON.stringify(payload)
    })

    const elapsedMs = Math.round(performance.now() - startedAt)
    const requestId = String(response.headers.get('x-pdf-request-id') ?? '')
    const serverMs = String(response.headers.get('x-pdf-generation-ms') ?? '')

    pdfDebugState.httpStatus = response.status
    pdfDebugState.requestId = requestId
    pdfDebugState.serverMs = serverMs
    pdfDebugState.elapsedMs = elapsedMs

    console.info('[scripts-pdf] response', {
      status: response.status,
      statusText: response.statusText,
      requestId,
      serverMs,
      engine: response.headers.get('x-pdf-engine'),
      fallbackReason: response.headers.get('x-pdf-fallback-reason'),
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length')
    })

    if (!response.ok) {
      const rawError = await response.text().catch(() => '')
      pdfDebugState.status = 'error'
      pdfDebugState.message = rawError || `Falha ao gerar PDF (HTTP ${response.status}).`
      pdfErrorMessage.value = pdfDebugState.message
      console.error('[scripts-pdf] error payload', rawError)
      return
    }

    const blob = await response.blob()
    if (!blob || blob.size <= 0) {
      pdfDebugState.status = 'error'
      pdfDebugState.message = 'O endpoint retornou PDF vazio.'
      pdfErrorMessage.value = pdfDebugState.message
      console.error('[scripts-pdf] empty blob')
      return
    }

    const fileNameFromHeader = extractFileNameFromContentDisposition(response.headers.get('content-disposition'))
    pdfFileName.value = fileNameFromHeader || toSafePdfFileName(payload.title)
    pdfPreviewUrl.value = URL.createObjectURL(blob)
    pdfDebugState.status = 'success'
    pdfDebugState.bytes = blob.size
    pdfDebugState.message = 'PDF gerado com sucesso.'

    console.info('[scripts-pdf] success', {
      fileName: pdfFileName.value,
      bytes: blob.size,
      elapsedMs,
      requestId,
      serverMs
    })
  } catch (error) {
    const elapsedMs = Math.round(performance.now() - startedAt)
    const message = error instanceof Error ? error.message : 'Erro inesperado ao gerar PDF.'
    pdfDebugState.status = 'error'
    pdfDebugState.elapsedMs = elapsedMs
    pdfDebugState.message = message
    pdfErrorMessage.value = message
    console.error('[scripts-pdf] request failed', { elapsedMs, message, error })
  } finally {
    pdfGenerating.value = false
    console.groupEnd()
  }
}

async function openPdfModal() {
  if (!selectedScriptId.value) return
  pdfModalOpen.value = true
  await generatePdfPreview()
}

function downloadPdfPreview() {
  if (!import.meta.client) return
  if (!pdfPreviewUrl.value) return

  const anchor = document.createElement('a')
  anchor.href = pdfPreviewUrl.value
  anchor.download = pdfFileName.value || toSafePdfFileName(draft.title)
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  console.info('[scripts-pdf] download triggered', {
    fileName: anchor.download,
    requestId: pdfDebugState.requestId
  })
}

function printPdfPreview() {
  if (!import.meta.client) return
  const frame = pdfIframeEl.value
  if (!frame?.contentWindow) return

  frame.contentWindow.focus()
  frame.contentWindow.print()

  console.info('[scripts-pdf] print triggered', {
    fileName: pdfFileName.value,
    requestId: pdfDebugState.requestId
  })
}

async function fetchClientOptions() {
  clientSelectLoading.value = true

  if (!canChooseClient.value) {
    const ownClientId = viewerClientId.value
    clientSelectOptions.value = [{
      label: `Cliente #${ownClientId}`,
      value: ownClientId
    }]
    draft.clientId = ownClientId
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

async function onCreateScript() {
  const selectedFilterClientId = normalizeClientId(filtersState.value.clientFilter)
  const newScriptClientId = canChooseClient.value
    ? (selectedFilterClientId > 0 ? selectedFilterClientId : DEFAULT_ADMIN_CLIENT_ID)
    : viewerClientId.value

  const selectedClientOption = clientSelectOptions.value.find(option => option.value === newScriptClientId)

  const created = await createScript({
    title: 'Novo roteiro',
    status: DEFAULT_SCRIPT_STATUS,
    notes: '',
    rows: [{
      id: buildRowId(0),
      audio: '',
      video: ''
    }],
    clientId: newScriptClientId,
    clientName: selectedClientOption?.label ?? `Cliente #${newScriptClientId}`
  })

  if (!created) return
  selectedScriptId.value = created.id
  hydrateDraftFromScript(created)
}

async function onDeleteScript(id: number) {
  if (!Number.isFinite(id) || id <= 0) return
  if (import.meta.client) {
    const confirmed = window.confirm('Excluir este documento? Esta acao nao pode ser desfeita.')
    if (!confirmed) return
  }

  const deleted = await deleteScript(id)
  if (!deleted) return

  if (selectedScriptId.value === id) {
    selectFirstAvailableScript()
  }
}

watch(
  filteredScripts,
  () => {
    selectFirstAvailableScript()
    nextTick(() => syncSidebarHeightWithEditor())
  },
  { immediate: true, deep: true }
)

watch(
  selectedScriptId,
  (nextId) => {
    const id = Number(nextId || 0)
    if (!id) {
      resetDraft()
      return
    }
    const found = scripts.value.find(item => item.id === id) ?? null
    hydrateDraftFromScript(found)
    nextTick(() => syncSidebarHeightWithEditor())
  },
  { immediate: true }
)

watch(pdfModalOpen, (open) => {
  if (open) return
  pdfGenerating.value = false
  pdfErrorMessage.value = ''
  resetPdfDebugState()
  clearPdfPreviewUrl()
})

watch(
  () => sessionSimulation.requestContextHash,
  () => {
    if (!canChooseClient.value) {
      filtersState.value = {
        ...filtersState.value,
        clientFilter: ''
      }
    }
    void fetchClientOptions()
    nextTick(() => syncSidebarHeightWithEditor())
  }
)

watch(
  () => [
    draft.rows.length,
    draft.title,
    draft.notes,
    draft.status,
    canChooseClient.value ? draft.clientId : viewerClientId.value
  ],
  () => {
    nextTick(() => syncSidebarHeightWithEditor())
  }
)

onBeforeUnmount(() => {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer)
    autosaveTimer = null
  }
  clearPdfPreviewUrl()
  if (import.meta.client) {
    window.removeEventListener('resize', syncSidebarHeightWithEditor)
  }
  if (editorResizeObserver) {
    editorResizeObserver.disconnect()
    editorResizeObserver = null
  }
})

onMounted(() => {
  sessionSimulation.initialize()
  void Promise.all([
    fetchScripts(),
    fetchClientOptions()
  ])
  nextTick(() => {
    syncSidebarHeightWithEditor()
    if (!import.meta.client || typeof ResizeObserver === 'undefined') return
    window.addEventListener('resize', syncSidebarHeightWithEditor)
    editorResizeObserver = new ResizeObserver(() => {
      syncSidebarHeightWithEditor()
    })
    if (editorShellEl.value) {
      editorResizeObserver.observe(editorShellEl.value)
    }
  })
})
</script>

<template>
  <section class="scripts-page space-y-4">
    <AdminPageHeader
      class="scripts-page__header"
      eyebrow="Tools"
      title="Scripts"
      description="Editor rapido de roteiros em duas colunas (audio/video) com autosave e organizacao por cliente."
    />

    <OmniCollectionFilters v-model="filtersState" :filters="filterDefinitions" :viewer-user-type="viewerUserType"
      :show-column-filter="false" :loading="loading" @reset="onResetFilters">
      <template #actions>
        <UBadge color="neutral" variant="soft">
          Documentos: {{ filteredScripts.length }}
        </UBadge>
      </template>
    </OmniCollectionFilters>

    <UAlert v-if="errorMessage" color="error" variant="soft" icon="i-lucide-alert-triangle" title="Erro"
      :description="errorMessage" />

    <div class="scripts-page__layout">
      <UDashboardGroup storage="local" storage-key="admin-tools-scripts-sidebar"
        class="scripts-page__dashboard-group !static !inset-auto !h-auto !w-full">
        <UDashboardSidebar class="scripts-page__sidebar" :style="sidebarContainerStyle" resizable collapsible
          :min-size="10" :default-size="30"
          :max-size="40" :collapsed-size="10" :ui="{
            root: 'scripts-page__sidebar-root !min-w-0 !min-h-0 !h-full border border-[rgb(var(--border))] rounded-[var(--radius-md)] bg-[rgb(var(--surface-2))]',
            header: 'p-3 border-b border-[rgb(var(--border))]',
            body: 'scripts-page__sidebar-body !min-h-0 !overflow-y-auto !overflow-x-hidden p-3'
          }">
          <template #header="{ collapsed }">
            <div class="scripts-page__sidebar-header flex items-center justify-between gap-2">
              <h2 class="scripts-page__sidebar-title font-semibold text-[rgb(var(--text))]"
                :class="collapsed ? 'text-[11px] tracking-wide' : 'text-sm'">
                Documentos salvos
              </h2>

              <div class="scripts-page__sidebar-header-actions flex items-center gap-1">
                <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="sm" :square="collapsed"
                  :loading="creating" :disabled="creating" aria-label="Novo script" @click="onCreateScript" />

                <UDashboardSidebarCollapse color="neutral" variant="ghost" size="sm"
                  aria-label="Mostrar ou ocultar sidebar" />
              </div>
            </div>
          </template>

          <template #default="{ collapsed }">
            <div v-if="loading && scripts.length === 0" class="scripts-page__sidebar-loading space-y-2">
              <USkeleton v-for="index in 4" :key="`script-skeleton-${index}`"
                class="h-[92px] rounded-[var(--radius-sm)]" />
            </div>

            <div v-else class="scripts-page__sidebar-list space-y-2">
              <button v-for="script in filteredScripts" :key="script.id" type="button"
                class="scripts-page__sidebar-item w-full rounded-[var(--radius-sm)] border p-3 text-left transition-colors"
                :class="script.id === selectedScriptId
                  ? 'border-primary bg-[rgb(var(--surface))]'
                  : 'border-[rgb(var(--border))] bg-transparent hover:bg-[rgb(var(--surface))]'"
                @click="selectScript(script.id)">
                <div class="scripts-page__sidebar-item-head mb-1 flex items-start justify-between gap-2">
                  <p class="scripts-page__sidebar-item-title line-clamp-1 font-semibold text-[rgb(var(--text))]"
                    :class="collapsed ? 'text-[12px]' : 'text-sm'">
                    {{ script.title || 'Sem titulo' }}
                  </p>

                  <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs"
                    :class="collapsed ? 'scripts-page__sidebar-delete--collapsed' : ''"
                    :loading="deletingId === script.id" :disabled="deletingId === script.id"
                    aria-label="Excluir documento" @click.stop="onDeleteScript(script.id)" />
                </div>

                <div class="scripts-page__sidebar-item-badges mb-2 flex flex-wrap items-center gap-1">
                  <UBadge class="scripts-page__sidebar-item-badge" color="neutral" variant="soft" size="xs">
                    {{ script.clientName }}
                  </UBadge>
                  <UBadge class="scripts-page__sidebar-item-badge" :color="statusBadgeColor(script.status)"
                    variant="soft" size="xs">
                    {{ statusLabelFromValue(script.status) }}
                  </UBadge>
                </div>

                <div class="scripts-page__sidebar-preview-grid"
                  :class="collapsed ? 'scripts-page__sidebar-preview-grid--collapsed' : ''">
                  <div class="scripts-page__sidebar-preview-head">
                    <span>Audio</span>
                    <span>Video</span>
                  </div>
                  <div class="scripts-page__sidebar-preview-body">
                    <p class="scripts-page__sidebar-preview-cell">
                      {{ scriptCellPreview(script, 'audio') }}
                    </p>
                    <p class="scripts-page__sidebar-preview-cell">
                      {{ scriptCellPreview(script, 'video') }}
                    </p>
                  </div>
                </div>
              </button>

              <UAlert v-if="filteredScripts.length === 0" color="neutral" variant="soft" icon="i-lucide-file-x"
                title="Sem documentos" description="Nenhum script encontrado para os filtros atuais." />
            </div>
          </template>
        </UDashboardSidebar>

        <UDashboardPanel class="scripts-page__dashboard-panel" :style="dashboardPanelStyle" :ui="{
          root: 'scripts-page__dashboard-panel-root !min-w-0 !min-h-0 !h-auto',
          body: 'scripts-page__dashboard-panel-body !overflow-visible !p-0'
        }">
          <section ref="editorShellEl"
            class="scripts-page__editor rounded-[var(--radius-md)] border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-4">
            <div class="scripts-page__paper">
              <div v-if="!selectedScriptId" class="scripts-page__editor-empty py-14 text-center">
                <p class="scripts-page__paper-muted text-sm">Selecione um documento ou crie um novo script para comecar.
                </p>
              </div>

              <template v-else>
                <div class="scripts-page__editor-header mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div class="scripts-page__editor-title-wrap min-w-[240px] flex-1 space-y-2">
                    <input v-model="draft.title" class="scripts-page__paper-title-input w-full"
                      placeholder="Titulo do roteiro" type="text" @input="scheduleAutosave">

                    <div class="scripts-page__editor-meta flex flex-wrap items-center gap-2">
                      <div v-if="canChooseClient" class="scripts-page__editor-client w-[220px]">
                        <OmniSelectMenuInput :model-value="draft.clientId" :items="clientSelectOptions"
                          :loading="clientSelectLoading" placeholder="Cliente" :searchable="true"
                          :full-content-width="true" item-display-mode="text" color="neutral" variant="none"
                          :highlight="false" :badge-mode="true" clear option-edit-mode="color"
                          @update:model-value="onDraftClientChange" />
                      </div>

                      <div class="scripts-page__editor-status ">
                        <OmniSelectMenuInput :model-value="draft.status" :items="statusSelectOptions"
                          placeholder="Status do roteiro" :creatable="{ when: 'always', position: 'bottom' }"
                          :searchable="true" :full-content-width="true" item-display-mode="text" color="neutral"
                          variant="none" :highlight="false" :badge-mode="true" clear option-edit-mode="full"
                          @update:model-value="onDraftStatusChange" @create="onCreateStatusOption" />
                      </div>

                      <UBadge class="scripts-page__editor-status-badge" :color="statusBadgeColor(draft.status)"
                        variant="soft">
                        {{ statusLabelFromValue(draft.status) }}
                      </UBadge>
                    </div>
                  </div>

                  <div class="scripts-page__editor-actions flex items-center gap-2">
                    <UDashboardSidebarCollapse color="neutral" variant="soft" size="sm"
                      aria-label="Mostrar ou ocultar documentos salvos" />

                    <UButton icon="i-lucide-file-down" color="neutral" variant="soft" size="sm" label="PDF"
                      @click="openPdfModal" />

                    <UButton icon="i-lucide-trash-2" color="error" variant="soft" size="sm" label="Excluir"
                      :loading="deletingId === selectedScriptId" :disabled="deletingId === selectedScriptId"
                      @click="onDeleteScript(Number(selectedScriptId))" />
                  </div>
                </div>

                <div class="scripts-page__rows-wrap overflow-x-auto">
                  <table class="scripts-page__rows-table min-w-[760px] w-full border-collapse">
                    <thead>
                      <tr class="scripts-page__rows-head">
                        <th class="scripts-page__rows-head-cell scripts-page__rows-head-cell--audio">Audio</th>
                        <th class="scripts-page__rows-head-cell">Video</th>
                        <th class="scripts-page__rows-head-cell scripts-page__rows-head-cell--actions">Acoes</th>
                      </tr>
                    </thead>

                    <tbody>
                      <tr v-for="(row, index) in draft.rows" :key="row.id" class="scripts-page__row">
                        <td class="scripts-page__cell scripts-page__cell--audio">
                          <textarea v-model="row.audio" class="scripts-page__paper-cell-input w-full" rows="4"
                            placeholder="Texto de audio..." @input="scheduleAutosave" />
                        </td>

                        <td class="scripts-page__cell">
                          <textarea v-model="row.video" class="scripts-page__paper-cell-input w-full" rows="4"
                            placeholder="Direcao de video..." @input="scheduleAutosave" />
                        </td>

                        <td class="scripts-page__row-actions">
                          <div class="scripts-page__row-actions-buttons">
                            <UButton icon="i-lucide-arrow-up" color="neutral" variant="ghost" size="xs"
                              :disabled="index === 0" aria-label="Subir linha" @click="moveRow(index, -1)" />
                            <UButton icon="i-lucide-arrow-down" color="neutral" variant="ghost" size="xs"
                              :disabled="index >= draft.rows.length - 1" aria-label="Descer linha"
                              @click="moveRow(index, 1)" />
                            <UButton icon="i-lucide-x" color="error" variant="ghost" size="xs"
                              aria-label="Remover linha" @click="removeRow(index)" />
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div class="scripts-page__editor-footer mt-3 flex flex-wrap items-center gap-2">
                  <UButton icon="i-lucide-plus" color="primary" variant="soft" size="sm" label="Linha"
                    @click="addRow" />

                  <UBadge color="neutral" variant="soft" class="scripts-page__save-state">
                    {{ activeScriptSaving ? 'Salvando...' : 'Salvo automaticamente' }}
                  </UBadge>
                </div>

                <div class="scripts-page__notes mt-4 space-y-1">
                  <p class="scripts-page__notes-label">Observacoes do documento</p>
                  <textarea v-model="draft.notes" rows="4" class="scripts-page__paper-notes-input w-full"
                    placeholder="Contexto geral, briefing, restricoes e observacoes..." @input="scheduleAutosave" />
                </div>
              </template>
            </div>
          </section>
        </UDashboardPanel>
      </UDashboardGroup>
    </div>
  </section>

  <UModal v-model:open="pdfModalOpen" title="Preview PDF do roteiro"
    description="Geracao via endpoint BFF com logs de debug no console e no Network." :ui="{ content: 'max-w-6xl' }">
    <template #body>
      <div class="scripts-page__pdf-modal space-y-3">
        <div
          class="scripts-page__pdf-debug rounded-[var(--radius-sm)] border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-3 text-xs">
          <p class="scripts-page__pdf-debug-title mb-1 font-semibold text-[rgb(var(--text))]">Debug da geracao</p>
          <p class="text-[rgb(var(--muted))]">
            Status: <span class="font-medium text-[rgb(var(--text))]">{{ pdfDebugState.status }}</span>
            | HTTP: <span class="font-medium text-[rgb(var(--text))]">{{ pdfDebugState.httpStatus || '-' }}</span>
            | Request ID: <span class="font-medium text-[rgb(var(--text))]">{{ pdfDebugState.requestId || '-' }}</span>
            | Server ms: <span class="font-medium text-[rgb(var(--text))]">{{ pdfDebugState.serverMs || '-' }}</span>
            | Client ms: <span class="font-medium text-[rgb(var(--text))]">{{ pdfDebugState.elapsedMs || '-' }}</span>
            | Bytes: <span class="font-medium text-[rgb(var(--text))]">{{ pdfDebugState.bytes || '-' }}</span>
          </p>
          <p v-if="pdfDebugState.message" class="mt-1 text-[rgb(var(--muted))]">{{ pdfDebugState.message }}</p>
        </div>

        <UAlert v-if="pdfErrorMessage" color="error" variant="soft" icon="i-lucide-alert-triangle"
          :description="pdfErrorMessage" />

        <div class="scripts-page__pdf-frame-wrap">
          <div v-if="pdfGenerating" class="scripts-page__pdf-loading">
            <UIcon name="i-lucide-loader-circle" class="h-5 w-5 animate-spin" />
            <p>Gerando PDF...</p>
          </div>

          <iframe v-else-if="pdfPreviewUrl" ref="pdfIframeEl" :src="pdfPreviewUrl" class="scripts-page__pdf-iframe"
            title="Preview PDF" />

          <div v-else class="scripts-page__pdf-empty">
            <p>Nenhum PDF disponivel. Clique em "Regerar PDF".</p>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="scripts-page__pdf-footer flex w-full items-center justify-end gap-2">
        <UButton label="Fechar" color="neutral" variant="ghost" @click="pdfModalOpen = false" />
        <UButton label="Regerar PDF" icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="pdfGenerating"
          :disabled="pdfGenerating || !selectedScriptId" @click="generatePdfPreview" />
        <UButton label="Baixar" icon="i-lucide-download" color="primary" variant="soft"
          :disabled="!pdfPreviewUrl || pdfGenerating" @click="downloadPdfPreview" />
        <UButton label="Imprimir" icon="i-lucide-printer" color="primary" :disabled="!pdfPreviewUrl || pdfGenerating"
          @click="printPdfPreview" />
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.scripts-page__layout {
  min-height: 0;
}


.scripts-page__dashboard-group {
  position: static !important;
  inset: auto !important;
  display: flex;
  align-items: stretch;
  width: 100%;
  min-height: 680px;
  gap: 12px;
  overflow: visible;
}

.scripts-page__dashboard-panel {
  min-width: 0;
  min-height: 50svh !important;
  height: auto;
}

.scripts-page__dashboard-panel-body {
  min-height: 0;
  overflow: visible;
}

.scripts-page__sidebar {
  min-height: 0;
  height: auto;
}

.scripts-page__sidebar-root {
  height: 100%;
}

.scripts-page__sidebar-body {
  min-height: 0;
  overflow-y: auto;
}

.scripts-page__sidebar-list {
  display: flex;
  flex-direction: column;
}

.scripts-page__sidebar-delete--collapsed {
  opacity: 0.72;
}

.scripts-page__sidebar-item-badge {
  max-width: 100%;
}

.scripts-page__sidebar-preview-grid {
  border: 1px solid rgb(var(--border));
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.scripts-page__sidebar-preview-grid--collapsed {
  zoom: 0.86;
}

.scripts-page__sidebar-preview-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  border-bottom: 1px solid rgb(var(--border));
  background: rgb(var(--surface-2));
}

.scripts-page__sidebar-preview-head span {
  padding: 4px 6px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgb(var(--muted));
}

.scripts-page__sidebar-preview-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.scripts-page__sidebar-preview-cell {
  margin: 0;
  min-height: 36px;
  padding: 6px;
  font-size: 11px;
  line-height: 1.25;
  color: rgb(var(--muted));
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.scripts-page__sidebar-preview-cell:first-child {
  border-right: 1px solid rgb(var(--border));
}

.scripts-page__editor {
  background: transparent;
  min-width: 0;
  height: auto;
  overflow: visible;
}

.scripts-page__paper {
  width: min(100%, 1040px);
  min-height: 640px;
  margin: 0 auto;
  padding: 26px 30px;
  border: 1px solid #d2cbba;
  border-radius: 14px;
  background: linear-gradient(180deg, #f9f6ee 0%, #f3efe4 100%);
  color: #111111;
  font-family: "Courier New", "Liberation Mono", Menlo, Consolas, monospace;
  box-shadow: 0 24px 45px rgba(0, 0, 0, 0.24);
}

.scripts-page__paper-muted {
  color: #5f5f5f;
}

.scripts-page__paper-title-input {
  width: 100%;
  border: none;
  border-bottom: 2px solid #b9b09c;
  border-radius: 0;
  background: transparent;
  color: #111111;
  font-family: inherit;
  font-size: 2rem;
  line-height: 1.1;
  letter-spacing: 0.03em;
  font-weight: 700;
  padding: 2px 0 7px;
  outline: none;
}

.scripts-page__paper-title-input::placeholder {
  color: #7d7462;
}

.scripts-page__paper-title-input:focus {
  border-color: #6e6352;
}

.scripts-page__rows-wrap {
  overflow-x: auto;
}

.scripts-page__rows-table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
  table-layout: fixed;
}

.scripts-page__rows-head {
  border-bottom: 1px solid #b8ae99;
}

.scripts-page__rows-head-cell {
  text-align: left;
  padding: 8px 10px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #4e4638;
}

.scripts-page__rows-head-cell--audio {
  border-right: 1px solid #c7beab;
}

.scripts-page__rows-head-cell--actions {
  width: 124px;
  text-align: right;
}

.scripts-page__row {
  border-bottom: 1px solid #c7beab;
}

.scripts-page__cell {
  vertical-align: top;
  padding: 8px 10px;
}

.scripts-page__cell--audio {
  border-right: 1px solid #c7beab;
}

.scripts-page__paper-cell-input {
  width: 100%;
  min-height: 140px;
  resize: vertical;
  border: none;
  border-radius: 0;
  background: transparent;
  color: #1b1b1b;
  font-family: inherit;
  font-size: 1rem;
  line-height: 1.52;
  padding: 0;
  outline: none;
}

.scripts-page__paper-cell-input::placeholder {
  color: #8f8674;
}

.scripts-page__row-actions {
  width: 124px;
  width:  90px;
  vertical-align: top;
  padding: 8px 0;
}

.scripts-page__row-actions-buttons {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
  padding-right: 8px;
}

.scripts-page__notes-label {
  margin: 0;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 600;
  color: #4e4638;
}

.scripts-page__paper-notes-input {
  width: 100%;
  min-height: 130px;
  border: 1px dashed #bdb39d;
  border-radius: 8px;
  background: rgba(245, 239, 225, 0.7);
  color: #151515;
  font-family: inherit;
  font-size: 0.96rem;
  line-height: 1.5;
  padding: 10px 12px;
  outline: none;
}

.scripts-page__paper-notes-input::placeholder {
  color: #877f70;
}

.scripts-page__paper-notes-input:focus {
  border-color: #7b6f59;
}

.scripts-page__editor :deep([data-slot="base"]) {
  font-family: "Inter", "Segoe UI", sans-serif;
}

.scripts-page__editor :deep(.scripts-page__editor-client [data-slot="base"]) {

  color: #1a1a1a;
}

.scripts-page__editor :deep(.scripts-page__editor-status .omni-select-menu-input__base) {

  color: #1a1a1a;
}

.scripts-page__editor-status-badge {
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.scripts-page__pdf-frame-wrap {
  width: 100%;
  min-height: 64vh;
  border: 1px solid rgb(var(--border));
  border-radius: var(--radius-md);
  background: rgb(var(--surface));
  overflow: hidden;
}

.scripts-page__pdf-iframe {
  width: 100%;
  min-height: 64vh;
  border: none;
  display: block;
}

.scripts-page__pdf-loading,
.scripts-page__pdf-empty {
  min-height: 64vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: rgb(var(--muted));
  font-size: 13px;
}

@media (max-width: 900px) {
  .scripts-page__paper {
    padding: 18px 16px;
    border-radius: 12px;
  }

  .scripts-page__paper-title-input {
    font-size: 1.5rem;
  }

  .scripts-page__row-actions {
    width: 108px;
  }
}
</style>
