<script setup lang="ts">
import OmniCollectionFilters from '~/components/omni/filters/OmniCollectionFilters.vue'
import OmniDataTable from '~/components/omni/table/OmniDataTable.vue'
import {
  QA_EFFORT_OPTIONS,
  QA_PRIORITY_OPTIONS,
  QA_SOURCE_OPTIONS,
  QA_STATUS_OPTIONS,
  type QaFieldKey,
  type QaFeatureItem
} from '~/types/qa'
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
  items,
  capabilities,
  blockOptions,
  sprintOptions,
  squadOptions,
  loading,
  creating,
  deletingId,
  errorMessage,
  savingMap,
  fetchQaItems,
  updateField,
  saveNotes,
  createQaItem,
  deleteQaItem
} = useQaManager()

const selectedIds = ref<Array<string | number>>([])
const focusCell = ref<OmniFocusCell | null>(null)

const noteModalOpen = ref(false)
const noteDraft = ref('')
const noteRowId = ref<number | null>(null)
const noteFeatureName = ref('')

const filtersState = ref<Record<string, unknown>>({
  query: '',
  blockFilter: '',
  sprintFilter: '',
  squadFilter: '',
  statusFilter: '',
  priorityFilter: '',
  sourceFilter: ''
})

const statusMap = computed<Map<string, string>>(
  () => new Map(QA_STATUS_OPTIONS.map(item => [String(item.value), item.label]))
)
const priorityMap = computed<Map<string, string>>(
  () => new Map(QA_PRIORITY_OPTIONS.map(item => [String(item.value), item.label]))
)
const sourceMap = computed<Map<string, string>>(
  () => new Map(QA_SOURCE_OPTIONS.map(item => [String(item.value), item.label]))
)

const blockSelectOptions = computed(() => blockOptions.value.map(value => ({ label: value, value })))
const sprintSelectOptions = computed(() => sprintOptions.value.map(value => ({ label: value, value })))
const squadSelectOptions = computed(() => squadOptions.value.map(value => ({ label: value, value })))

const filterDefinitions = computed<OmniFilterDefinition[]>(() => [
  {
    key: 'query',
    label: 'Buscar',
    type: 'text',
    placeholder: 'Pesquisar por feature, bloco, squad, owner ou pagina...',
    mode: 'columns',
    columns: ['block', 'sprint', 'squad', 'feature', 'owner', 'targetPage', 'notes', 'effort']
  },
  {
    key: 'blockFilter',
    label: 'Bloco',
    type: 'select',
    placeholder: 'Bloco',
    options: blockSelectOptions.value,
    accessor: row => row.block
  },
  {
    key: 'sprintFilter',
    label: 'Sprint',
    type: 'select',
    placeholder: 'Sprint',
    options: sprintSelectOptions.value,
    accessor: row => row.sprint
  },
  {
    key: 'squadFilter',
    label: 'Squad',
    type: 'select',
    placeholder: 'Squad',
    options: squadSelectOptions.value,
    accessor: row => row.squad
  },
  {
    key: 'statusFilter',
    label: 'Status',
    type: 'select',
    placeholder: 'Status',
    options: QA_STATUS_OPTIONS,
    accessor: row => row.status
  },
  {
    key: 'priorityFilter',
    label: 'Prioridade',
    type: 'select',
    placeholder: 'Prioridade',
    options: QA_PRIORITY_OPTIONS,
    accessor: row => row.priority
  },
  {
    key: 'sourceFilter',
    label: 'Origem',
    type: 'select',
    placeholder: 'Origem',
    options: QA_SOURCE_OPTIONS,
    accessor: row => row.source
  }
])

const allTableColumns = computed<OmniTableColumn[]>(() => [
  { key: 'id', label: 'ID', type: 'number', editable: false, minWidth: 80 },
  {
    key: 'block',
    label: 'Bloco',
    type: 'select',
    editable: true,
    immediate: true,
    minWidth: 220,
    options: blockSelectOptions.value,
    creatable: true,
    placeholder: 'Selecione ou crie bloco'
  },
  {
    key: 'sprint',
    label: 'Sprint',
    type: 'select',
    editable: true,
    immediate: true,
    minWidth: 140,
    options: sprintSelectOptions.value,
    creatable: true,
    placeholder: 'Selecione ou crie sprint'
  },
  {
    key: 'squad',
    label: 'Squad',
    type: 'select',
    editable: true,
    immediate: true,
    minWidth: 140,
    options: squadSelectOptions.value,
    creatable: true,
    placeholder: 'Selecione ou crie squad'
  },
  { key: 'feature', label: 'Funcionalidade', type: 'text', editable: true, minWidth: 320, focusOnCreate: true },
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    editable: true,
    immediate: true,
    minWidth: 160,
    options: QA_STATUS_OPTIONS,
    formatter: value => statusMap.value.get(String(value ?? '')) || String(value ?? '-')
  },
  {
    key: 'priority',
    label: 'Prioridade',
    type: 'select',
    editable: true,
    immediate: true,
    minWidth: 130,
    options: QA_PRIORITY_OPTIONS,
    formatter: value => priorityMap.value.get(String(value ?? '')) || String(value ?? '-')
  },
  {
    key: 'source',
    label: 'Origem',
    type: 'select',
    editable: true,
    immediate: true,
    minWidth: 190,
    options: QA_SOURCE_OPTIONS,
    formatter: value => sourceMap.value.get(String(value ?? '')) || String(value ?? '-')
  },
  { key: 'owner', label: 'Responsavel', type: 'text', editable: true, minWidth: 130 },
  { key: 'targetPage', label: 'Pagina alvo', type: 'text', editable: true, minWidth: 190 },
  {
    key: 'effort',
    label: 'Esforco',
    type: 'select',
    editable: true,
    immediate: true,
    minWidth: 110,
    maxWidth: 120,
    align: 'center',
    options: QA_EFFORT_OPTIONS
  },
  { key: 'notes', label: 'Notas QA', type: 'custom', editable: false, minWidth: 220 },
  { key: 'updatedAt', label: 'Atualizado', type: 'text', editable: false, minWidth: 120 },
  { key: 'actions', label: 'Opcoes', type: 'custom', minWidth: 130, align: 'center' }
])

const columnExcludeKeys = ['actions']
const alwaysVisibleColumnKeys = new Set(['actions'])
const { visibleColumnKeys, tableColumns } = useOmniVisibleColumns({
  preferenceKey: 'admin.manage.qa',
  allColumns: allTableColumns,
  columnExcludeKeys,
  alwaysVisibleColumnKeys
})

const filteredRows = computed(() => {
  const rows = items.value as unknown as Array<Record<string, unknown>>
  return applyOmniFilters(rows, filtersState.value, filterDefinitions.value)
})

const totalCount = computed(() => items.value.length)
const doneCount = computed(() => items.value.filter(item => item.status === 'done').length)
const progressCount = computed(() => items.value.filter(item => item.status === 'in_progress').length)
const blockedCount = computed(() => items.value.filter(item => item.status === 'blocked').length)
const todoCount = computed(() => items.value.filter(item => item.status === 'todo').length)

const blockSummary = computed(() => {
  const map = new Map<string, { total: number, done: number }>()

  items.value.forEach((item) => {
    const current = map.get(item.block) ?? { total: 0, done: 0 }
    current.total += 1
    if (item.status === 'done') current.done += 1
    map.set(item.block, current)
  })

  return [...map.entries()]
    .map(([block, values]) => ({
      block,
      total: values.total,
      done: values.done
    }))
    .sort((a, b) => a.block.localeCompare(b.block, 'pt-BR'))
})

const updatableFields = new Set<QaFieldKey>([
  'block',
  'sprint',
  'squad',
  'feature',
  'status',
  'priority',
  'source',
  'owner',
  'targetPage',
  'effort',
  'notes'
])

function toQaItem(row: Record<string, unknown>) {
  return row as unknown as QaFeatureItem
}

function rowIdValue(row: Record<string, unknown>) {
  const raw = Number(row.id)
  return Number.isFinite(raw) ? raw : 0
}

function notesPreview(value: unknown) {
  const text = String(value ?? '').trim()
  if (!text) return 'Adicionar notas'
  if (text.length <= 80) return text
  return `${text.slice(0, 80)}...`
}

function onCellUpdate(payload: OmniTableCellUpdate) {
  const id = Number(payload.rowId)
  if (!Number.isFinite(id) || id <= 0) return

  const field = String(payload.key) as QaFieldKey
  if (!updatableFields.has(field)) return

  updateField(id, field, payload.value, {
    immediate: payload.immediate
  })
}

function openNotesModal(row: Record<string, unknown>) {
  const target = toQaItem(row)
  noteRowId.value = target.id
  noteFeatureName.value = target.feature
  noteDraft.value = target.notes
  noteModalOpen.value = true
}

function onSaveNotes() {
  const id = Number(noteRowId.value ?? 0)
  if (!Number.isFinite(id) || id <= 0) return

  saveNotes(id, noteDraft.value)
  noteModalOpen.value = false
}

async function onCreateItem() {
  const createdId = await createQaItem({
    feature: 'Nova funcionalidade',
    block: blockOptions.value[0] || 'Novo bloco',
    sprint: sprintOptions.value[0] || 'Backlog',
    squad: squadOptions.value[0] || 'Time'
  })

  if (!createdId) return

  focusCell.value = {
    rowId: createdId,
    columnKey: 'feature',
    token: Date.now()
  }
}

async function onDeleteItem(id: number) {
  if (!Number.isFinite(id) || id <= 0) return

  if (import.meta.client) {
    const confirmed = window.confirm('Remover este item do backlog QA?')
    if (!confirmed) return
  }

  await deleteQaItem(id)
}

function toggleDone(row: Record<string, unknown>) {
  const item = toQaItem(row)
  const nextStatus = item.status === 'done' ? 'todo' : 'done'
  updateField(item.id, 'status', nextStatus, { immediate: true })
}

function onResetFilters() {
  filtersState.value = {
    query: '',
    blockFilter: '',
    sprintFilter: '',
    squadFilter: '',
    statusFilter: '',
    priorityFilter: '',
    sourceFilter: ''
  }
}

onMounted(() => {
  void fetchQaItems()
})
</script>

<template>
  <section class="space-y-4">
    <AdminPageHeader
      eyebrow="Manage"
      title="QA Roadmap"
      description="Backlog central de QA e produto por bloco de funcionalidade para priorizacao do sistema."
    />

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      icon="i-lucide-alert-triangle"
      title="Erro"
      :description="errorMessage"
    />

    <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
      <UCard class="border border-[rgb(var(--border))]">
        <p class="text-xs uppercase text-[rgb(var(--muted))]">Total</p>
        <p class="text-lg font-semibold">{{ totalCount }}</p>
      </UCard>

      <UCard class="border border-[rgb(var(--border))]">
        <p class="text-xs uppercase text-[rgb(var(--muted))]">To do</p>
        <p class="text-lg font-semibold">{{ todoCount }}</p>
      </UCard>

      <UCard class="border border-[rgb(var(--border))]">
        <p class="text-xs uppercase text-[rgb(var(--muted))]">In progress</p>
        <p class="text-lg font-semibold">{{ progressCount }}</p>
      </UCard>

      <UCard class="border border-[rgb(var(--border))]">
        <p class="text-xs uppercase text-[rgb(var(--muted))]">Blocked</p>
        <p class="text-lg font-semibold">{{ blockedCount }}</p>
      </UCard>

      <UCard class="border border-[rgb(var(--border))]">
        <p class="text-xs uppercase text-[rgb(var(--muted))]">Done</p>
        <p class="text-lg font-semibold">{{ doneCount }}</p>
      </UCard>
    </div>

    <OmniCollectionFilters
      v-model="filtersState"
      :filters="filterDefinitions"
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
          label="Novo item QA"
          color="primary"
          :loading="creating"
          :disabled="creating"
          @click="onCreateItem"
        />
      </template>
    </OmniCollectionFilters>

    <OmniDataTable
      v-model="selectedIds"
      :rows="filteredRows"
      :columns="tableColumns"
      row-key="id"
      :loading="loading"
      :focus-cell="focusCell"
      empty-text="Nenhum item encontrado com os filtros atuais."
      @update:cell="onCellUpdate"
    >
      <template #cell-notes="{ row }">
        <button
          type="button"
          class="max-w-full text-left text-xs text-[rgb(var(--text))] underline-offset-2 hover:underline"
          :title="String(row.notes || '')"
          @click="openNotesModal(row)"
        >
          <span class="line-clamp-2 break-words">{{ notesPreview(row.notes) }}</span>
        </button>
      </template>

      <template #cell-actions="{ row }">
        <div class="flex items-center justify-end gap-1">
          <UButton
            :icon="String(row.status) === 'done' ? 'i-lucide-rotate-ccw' : 'i-lucide-check-check'"
            color="success"
            variant="ghost"
            size="sm"
            :aria-label="String(row.status) === 'done' ? 'Reabrir item' : 'Marcar como done'"
            @click="toggleDone(row)"
          />

          <UPopover :content="{ align: 'end', side: 'bottom' }">
            <UButton icon="i-lucide-info" color="neutral" variant="ghost" size="sm" aria-label="Info" />
            <template #content>
              <div class="w-[330px] space-y-1 p-3 text-xs">
                <p><strong>ID:</strong> {{ row.id }}</p>
                <p><strong>Bloco:</strong> {{ row.block }}</p>
                <p><strong>Sprint:</strong> {{ row.sprint }}</p>
                <p><strong>Squad:</strong> {{ row.squad }}</p>
                <p><strong>Feature:</strong> {{ row.feature }}</p>
                <p><strong>Status:</strong> {{ statusMap.get(String(row.status)) || row.status }}</p>
                <p><strong>Prioridade:</strong> {{ priorityMap.get(String(row.priority)) || row.priority }}</p>
                <p><strong>Origem:</strong> {{ sourceMap.get(String(row.source)) || row.source }}</p>
                <p><strong>Responsavel:</strong> {{ row.owner || '-' }}</p>
                <p><strong>Pagina:</strong> {{ row.targetPage || '-' }}</p>
                <p><strong>Esforco:</strong> {{ row.effort || '-' }}</p>
                <p><strong>Atualizado:</strong> {{ row.updatedAt || '-' }}</p>
                <p><strong>Notas:</strong> {{ row.notes || '-' }}</p>
              </div>
            </template>
          </UPopover>

          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            size="sm"
            aria-label="Excluir"
            :loading="deletingId === rowIdValue(row) || Boolean(savingMap[`${rowIdValue(row)}:delete`])"
            @click="onDeleteItem(rowIdValue(row))"
          />
        </div>
      </template>
    </OmniDataTable>

    <section class="space-y-3">
      <h2 class="text-lg font-semibold">Cobertura por bloco</h2>

      <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <UCard
          v-for="summary in blockSummary"
          :key="summary.block"
          class="border border-[rgb(var(--border))]"
        >
          <p class="text-sm font-semibold">{{ summary.block }}</p>
          <p class="text-xs text-[rgb(var(--muted))]">{{ summary.done }} / {{ summary.total }} concluidas</p>
        </UCard>
      </div>
    </section>

    <section class="space-y-3">
      <h2 class="text-lg font-semibold">Mapa de funcionalidades sugeridas</h2>

      <div class="grid gap-3 lg:grid-cols-2">
        <UCard
          v-for="block in capabilities"
          :key="block.title"
          class="border border-[rgb(var(--border))]"
        >
          <template #header>
            <div class="space-y-1">
              <h3 class="text-base font-semibold">{{ block.title }}</h3>
              <p class="text-xs text-[rgb(var(--muted))]">{{ block.objective }}</p>
            </div>
          </template>

          <ul class="space-y-1 text-sm text-[rgb(var(--text))]">
            <li v-for="item in block.items" :key="item" class="list-disc pl-1">
              {{ item }}
            </li>
          </ul>
        </UCard>
      </div>
    </section>

    <UModal
      v-model:open="noteModalOpen"
      title="Notas QA"
      :description="noteFeatureName || 'Editar observacoes do item'"
      :ui="{ content: 'max-w-2xl' }"
    >
      <template #body>
        <UTextarea
          v-model="noteDraft"
          :rows="8"
          class="w-full"
          placeholder="Registre observacoes, riscos, criterio de aceite e dependencias..."
        />
      </template>

      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton label="Cancelar" color="neutral" variant="ghost" @click="noteModalOpen = false" />
          <UButton
            label="Salvar notas"
            color="primary"
            :loading="Boolean(noteRowId && savingMap[`${noteRowId}:notes`])"
            @click="onSaveNotes"
          />
        </div>
      </template>
    </UModal>
  </section>
</template>
