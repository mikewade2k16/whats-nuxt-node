<script setup lang="ts">
import OmniCollectionFilters from '~/components/omni/filters/OmniCollectionFilters.vue'
import OmniDataTable from '~/components/omni/table/OmniDataTable.vue'
import type { CandidateFieldKey, CandidateItem } from '~/types/candidates'
import type {
  OmniFilterDefinition,
  OmniFocusCell,
  OmniTableCellUpdate,
  OmniTableColumn
} from '~/types/omni/collection'

definePageMeta({
  layout: 'admin'
})

const {
  candidates,
  vagaOptions,
  lojaOptions,
  clientIdOptions,
  statusOptions,
  loading,
  creating,
  deletingId,
  errorMessage,
  savingMap,
  fetchCandidates,
  updateField,
  saveComment,
  createCandidate,
  deleteCandidate
} = useCandidatesManager()
const sessionSimulation = useSessionSimulationStore()
const isAdminViewer = computed(() => sessionSimulation.userType === 'admin')

const selectedIds = ref<Array<string | number>>([])
const focusCell = ref<OmniFocusCell | null>(null)

const commentModalOpen = ref(false)
const commentDraft = ref('')
const commentRowId = ref<number | null>(null)
const commentCandidateName = ref('')
const videoModalOpen = ref(false)
const videoModalUrl = ref('')
const videoCandidateName = ref('')
const cvModalOpen = ref(false)
const cvModalUrl = ref('')
const cvCandidateName = ref('')

const filtersState = ref<Record<string, unknown>>({
  query: '',
  vagaFilter: '',
  statusFilter: '',
  lojaFilter: '',
  clientIdFilter: '',
  hasVideoFilter: ''
})

const vagaSelectOptions = computed(() => vagaOptions.value.map(item => ({ label: item, value: item })))
const lojaSelectOptions = computed(() => lojaOptions.value.map(item => ({ label: item, value: item })))
const clientIdToLabelMap = computed(() => {
  const map = new Map<number, string>()
  sessionSimulation.clientOptions.forEach((option) => {
    const id = Number(option.value)
    if (!Number.isFinite(id) || id <= 0) return
    map.set(id, String(option.label ?? '').trim() || `Cliente #${id}`)
  })
  return map
})

function clientLabelById(clientId: unknown) {
  const parsed = Number(clientId)
  if (!Number.isFinite(parsed) || parsed <= 0) return '-'
  return clientIdToLabelMap.value.get(parsed) || `Cliente #${parsed}`
}

const clientIdSelectOptions = computed(() => clientIdOptions.value.map(item => ({ label: clientLabelById(item), value: item })))

const filterDefinitions = computed<OmniFilterDefinition[]>(() => [
  {
    key: 'query',
    label: 'Buscar',
    type: 'text',
    placeholder: 'Pesquisar por nome, email, telefone...',
    mode: 'all'
  },
  {
    key: 'vagaFilter',
    label: 'Vagas',
    type: 'select',
    placeholder: 'Vagas',
    options: vagaSelectOptions.value,
    accessor: row => row.vaga
  },
  {
    key: 'statusFilter',
    label: 'Status',
    type: 'select',
    placeholder: 'Status',
    options: statusOptions,
    accessor: row => row.status
  },
  {
    key: 'lojaFilter',
    label: 'Lojas',
    type: 'select',
    placeholder: 'Lojas',
    options: lojaSelectOptions.value,
    accessor: row => row.loja
  },
  {
    key: 'clientIdFilter',
    label: 'Cliente',
    adminOnly: true,
    type: 'select',
    placeholder: 'Cliente',
    options: clientIdSelectOptions.value,
    accessor: row => row.clientId
  },
  {
    key: 'hasVideoFilter',
    label: 'Video',
    type: 'select',
    placeholder: 'Video',
    options: [
      { label: 'Com video', value: '1' },
      { label: 'Sem video', value: '0' }
    ],
    accessor: row => (row.hasVideo ? '1' : '0')
  }
])

const allTableColumns = computed<OmniTableColumn[]>(() => [
  {
    key: 'clientId',
    label: 'Cliente',
    adminOnly: true,
    type: 'text',
    editable: false,
    minWidth: 130,
    formatter: value => clientLabelById(value)
  },
  {
    key: 'id',
    label: 'ID',
    type: 'number',
    editable: false,
    minWidth: 90
  },
  {
    key: 'nome',
    label: 'Nome',
    type: 'text',
    editable: true,
    minWidth: 200,
    focusOnCreate: true
  },
  {
    key: 'vaga',
    label: 'Vaga',
    type: 'select',
    editable: true,
    immediate: true,
    minWidth: 160,
    options: vagaSelectOptions.value
  },
  {
    key: 'idade',
    label: 'Idade',
    type: 'number',
    editable: false,
    minWidth: 110
  },
  {
    key: 'experiencia',
    label: 'Experiencia',
    type: 'text',
    editable: false,
    minWidth: 200
  },
  {
    key: 'pontos',
    label: 'Pontos',
    type: 'number',
    editable: true,
    minWidth: 120
  },
  {
    key: 'formattedDate',
    label: 'Data cadastro',
    type: 'text',
    editable: false,
    minWidth: 150
  },
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    editable: true,
    immediate: true,
    minWidth: 210,
    options: statusOptions
  },
  {
    key: 'lastActions',
    label: 'Ultimas acoes',
    type: 'text',
    editable: false,
    minWidth: 190
  },
  {
    key: 'loja',
    label: 'Loja',
    type: 'select',
    editable: true,
    immediate: true,
    minWidth: 170,
    options: lojaSelectOptions.value
  },
  {
    key: 'comment',
    label: 'Comentario',
    type: 'custom',
    minWidth: 200
  },
  {
    key: 'actions',
    label: 'Opcoes',
    type: 'custom',
    minWidth: 170,
    align: 'center'
  }
])

const columnExcludeKeys = ['actions']
const alwaysVisibleColumnKeys = new Set(['actions'])
const { visibleColumnKeys, tableColumns } = useOmniVisibleColumns({
  preferenceKey: 'admin.team.candidates',
  allColumns: allTableColumns,
  columnExcludeKeys,
  alwaysVisibleColumnKeys
})

const filteredRows = computed(() => {
  const rows = candidates.value as unknown as Array<Record<string, unknown>>
  return applyOmniFilters(rows, filtersState.value, filterDefinitions.value)
})

const updatableFields = new Set<CandidateFieldKey>([
  'nome',
  'vaga',
  'pontos',
  'status',
  'loja',
  'comment'
])

const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'])
const docExtensions = new Set(['doc', 'docx', 'odt', 'rtf'])

function toCandidate(row: Record<string, unknown>) {
  return row as unknown as CandidateItem
}

function rowIdValue(row: Record<string, unknown>) {
  const raw = row.id
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

function commentPreview(value: string) {
  const text = String(value ?? '').trim()
  if (!text) return 'Adicionar comentario'
  if (text.length <= 74) return text
  return `${text.slice(0, 74)}...`
}

function getFileExtension(url: string) {
  const raw = String(url ?? '').trim()
  if (!raw) return ''

  try {
    const parsed = new URL(raw)
    const path = parsed.pathname || ''
    const index = path.lastIndexOf('.')
    if (index < 0) return ''
    return path.slice(index + 1).toLowerCase()
  } catch {
    const pathOnly = raw.split('#')[0]?.split('?')[0] ?? raw
    const index = pathOnly.lastIndexOf('.')
    if (index < 0) return ''
    return pathOnly.slice(index + 1).toLowerCase()
  }
}

const cvFileExtension = computed(() => getFileExtension(cvModalUrl.value))

const cvKind = computed<'empty' | 'pdf' | 'image' | 'doc' | 'other'>(() => {
  const ext = cvFileExtension.value
  if (!cvModalUrl.value.trim()) return 'empty'
  if (ext === 'pdf') return 'pdf'
  if (imageExtensions.has(ext)) return 'image'
  if (docExtensions.has(ext)) return 'doc'
  return 'other'
})

const cvOfficePreviewUrl = computed(() => {
  if (cvKind.value !== 'doc') return ''
  const source = cvModalUrl.value.trim()
  if (!/^https?:\/\//i.test(source)) return ''
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(source)}`
})

const cvCanPreview = computed(() => {
  if (cvKind.value === 'pdf' || cvKind.value === 'image') return true
  if (cvKind.value === 'doc') return cvOfficePreviewUrl.value !== ''
  return false
})

const cvPreviewUrl = computed(() => {
  if (cvKind.value === 'doc') return cvOfficePreviewUrl.value
  return cvModalUrl.value.trim()
})

function onCellUpdate(payload: OmniTableCellUpdate) {
  const field = String(payload.key) as CandidateFieldKey
  if (!updatableFields.has(field)) {
    return
  }

  const id = Number(payload.rowId)
  if (!Number.isFinite(id) || id <= 0) {
    return
  }

  updateField(id, field, payload.value, {
    immediate: payload.immediate
  })
}

function openCommentModal(row: Record<string, unknown>) {
  const candidate = toCandidate(row)
  commentRowId.value = candidate.id
  commentCandidateName.value = candidate.nome
  commentDraft.value = candidate.comment || ''
  commentModalOpen.value = true
}

async function onSaveComment() {
  const id = Number(commentRowId.value ?? 0)
  if (!Number.isFinite(id) || id <= 0) {
    return
  }

  await saveComment(id, commentDraft.value)
  commentModalOpen.value = false
}

async function onCreateCandidate() {
  const createdId = await createCandidate()
  if (!createdId) {
    return
  }

  focusCell.value = {
    rowId: createdId,
    columnKey: 'nome',
    token: Date.now()
  }
}

function onResetFilters() {
  filtersState.value = {
    query: '',
    vagaFilter: '',
    statusFilter: '',
    lojaFilter: '',
    clientIdFilter: '',
    hasVideoFilter: ''
  }
}

async function onDeleteCandidate(id: number) {
  if (import.meta.client) {
    const confirmed = window.confirm('Excluir este candidato? Esta acao nao pode ser desfeita.')
    if (!confirmed) {
      return
    }
  }

  await deleteCandidate(id)
}

function openInNewTab(url: string) {
  if (!import.meta.client) return
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

function openVideoModal(row: Record<string, unknown>) {
  const candidate = toCandidate(row)
  if (!candidate.videoUrl) return

  videoModalUrl.value = candidate.videoUrl
  videoCandidateName.value = candidate.nome
  videoModalOpen.value = true
}

function openCvModal(row: Record<string, unknown>) {
  const candidate = toCandidate(row)
  if (!candidate.curriculoUrl) return

  cvModalUrl.value = candidate.curriculoUrl
  cvCandidateName.value = candidate.nome
  cvModalOpen.value = true
}

function downloadCv() {
  openInNewTab(cvModalUrl.value)
}

watch(videoModalOpen, (open) => {
  if (open) return
  videoModalUrl.value = ''
  videoCandidateName.value = ''
})

watch(cvModalOpen, (open) => {
  if (open) return
  cvModalUrl.value = ''
  cvCandidateName.value = ''
})

onMounted(() => {
  sessionSimulation.initialize()
  void fetchCandidates()
})
</script>

<template>
  <section class="space-y-4">
    <AdminPageHeader
      eyebrow="Manager"
      title="Candidatos"
      description="Tabela generica com filtros desacoplados, edicao inline e CRUD de teste para integrar com API depois."
    />


    <OmniCollectionFilters v-model="filtersState" :filters="filterDefinitions"
      :viewer-user-type="isAdminViewer ? 'admin' : 'client'" :table-columns="allTableColumns"
      v-model:visible-columns="visibleColumnKeys" :column-exclude-keys="columnExcludeKeys" :loading="loading"
      @reset="onResetFilters">
      <template #actions>
        <UBadge color="neutral" variant="soft">
          Selecionados: {{ selectedIds.length }}
        </UBadge>

        <UButton icon="i-lucide-user-plus" label="Novo candidato" color="primary" :loading="creating"
          :disabled="creating" @click="onCreateCandidate" />
      </template>
    </OmniCollectionFilters>

    <UAlert v-if="errorMessage" color="error" variant="soft" icon="i-lucide-alert-triangle" title="Erro"
      :description="errorMessage" />

    <OmniDataTable v-model="selectedIds" :rows="filteredRows" :columns="tableColumns"
      :viewer-user-type="isAdminViewer ? 'admin' : 'client'" row-key="id" :loading="loading" :focus-cell="focusCell"
      empty-text="Nenhum candidato encontrado com os filtros atuais." @update:cell="onCellUpdate">
      <template #cell-comment="{ row }">
        <button type="button"
          class="max-w-full text-left text-xs text-[rgb(var(--text))] underline-offset-2 hover:underline"
          :title="toCandidate(row).comment || 'Adicionar comentario'" @click="openCommentModal(row)">
          <span class="line-clamp-2 break-words">{{ commentPreview(toCandidate(row).comment) }}</span>
        </button>
      </template>

      <template #cell-actions="{ row }">
        <div class="flex items-center justify-end gap-1">
          <UButton v-if="toCandidate(row).hasVideo" icon="i-lucide-videotape" color="neutral" variant="ghost" size="sm"
            aria-label="Abrir video" @click="openVideoModal(row)" />

          <UButton v-if="toCandidate(row).curriculoUrl" icon="i-lucide-file-text" color="neutral" variant="ghost"
            size="sm" aria-label="Abrir curriculo" @click="openCvModal(row)" />

          <UButton icon="i-lucide-message-square" color="neutral" variant="ghost" size="sm" aria-label="Comentario"
            @click="openCommentModal(row)" />

          <UPopover :content="{ align: 'end', side: 'bottom' }">
            <UButton icon="i-lucide-info" color="neutral" variant="ghost" size="sm" aria-label="Info" />
            <template #content>
              <div class="w-[300px] space-y-1 p-3 text-xs">
                <p><strong>ID:</strong> {{ toCandidate(row).id }}</p>
                <p><strong>Nome:</strong> {{ toCandidate(row).nome }}</p>
                <p><strong>Email:</strong> {{ toCandidate(row).email || '-' }}</p>
                <p><strong>Telefone:</strong> {{ toCandidate(row).telefone || '-' }}</p>
                <p><strong>Vaga:</strong> {{ toCandidate(row).vaga || '-' }}</p>
                <p><strong>Status:</strong> {{ toCandidate(row).statusLabel }}</p>
                <p><strong>Loja:</strong> {{ toCandidate(row).loja || '-' }}</p>
                <p><strong>Pontos:</strong> {{ toCandidate(row).pontos }}</p>
              </div>
            </template>
          </UPopover>

          <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" aria-label="Excluir"
            :loading="deletingId === rowIdValue(row) || Boolean(savingMap[`${rowIdValue(row)}:delete`])"
            @click="onDeleteCandidate(rowIdValue(row))" />
        </div>
      </template>
    </OmniDataTable>

    <UModal v-model:open="videoModalOpen" title="Video do candidato"
      :description="videoCandidateName || 'Visualizacao de video'" :ui="{ content: 'max-w-4xl' }">
      <template #body>
        <div class="w-full">
          <video v-if="videoModalUrl" :src="videoModalUrl" controls
            class="max-h-[70vh] w-full rounded-[var(--radius-md)] bg-black">
            Seu navegador nao suporta reproducao de video.
          </video>
          <p v-else class="text-sm text-[rgb(var(--muted))]">
            Video indisponivel para este candidato.
          </p>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton label="Abrir em nova aba" icon="i-lucide-external-link" color="neutral" variant="soft"
            :disabled="!videoModalUrl" @click="openInNewTab(videoModalUrl)" />
          <UButton label="Fechar" color="neutral" variant="ghost" @click="videoModalOpen = false" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="cvModalOpen" title="Curriculo do candidato"
      :description="cvCandidateName || 'Visualizacao de curriculo'" :ui="{ content: 'max-w-5xl' }">
      <template #body>
        <div class="w-full space-y-3">
          <iframe v-if="cvCanPreview && cvKind !== 'image'" :src="cvPreviewUrl"
            class="h-[70vh] w-full rounded-[var(--radius-md)] border border-[rgb(var(--border))]" />

          <div v-else-if="cvCanPreview && cvKind === 'image'"
            class="flex min-h-[280px] w-full items-center justify-center rounded-[var(--radius-md)] border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-3">
            <img :src="cvModalUrl" alt="Curriculo"
              class="max-h-[68vh] max-w-full rounded-[var(--radius-sm)] object-contain">
          </div>

          <div v-else
            class="rounded-[var(--radius-md)] border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-4 text-sm text-[rgb(var(--muted))]">
            <p class="font-medium text-[rgb(var(--text))]">
              Nao foi possivel abrir este arquivo no navegador.
            </p>
            <p class="mt-1">
              Formato detectado:
              <strong class="text-[rgb(var(--text))]">{{ cvFileExtension || 'desconhecido' }}</strong>
            </p>
            <p class="mt-2">
              Use o botao "Baixar arquivo" para abrir localmente.
            </p>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton label="Baixar arquivo" icon="i-lucide-download" color="primary" variant="soft"
            :disabled="!cvModalUrl" @click="downloadCv" />
          <UButton v-if="cvKind === 'doc' && cvOfficePreviewUrl" label="Abrir preview em nova aba"
            icon="i-lucide-external-link" color="neutral" variant="ghost" @click="openInNewTab(cvOfficePreviewUrl)" />
          <UButton label="Fechar" color="neutral" variant="ghost" @click="cvModalOpen = false" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="commentModalOpen" title="Comentario do candidato"
      :description="commentCandidateName || 'Editar comentario'" :ui="{ content: 'max-w-xl' }">
      <template #body>
        <UTextarea v-model="commentDraft" :rows="7" class="w-full" placeholder="Digite o comentario..." />
      </template>

      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton label="Cancelar" color="neutral" variant="ghost" @click="commentModalOpen = false" />
          <UButton label="Salvar comentario" color="primary"
            :loading="Boolean(commentRowId && savingMap[`${commentRowId}:comment`])" @click="onSaveComment" />
        </div>
      </template>
    </UModal>
  </section>
</template>
