<script setup lang="ts">
import OmniDataTable from '~/components/omni/table/OmniDataTable.vue'
import OmniSelectMenuInput from '~/components/inputs/OmniSelectMenuInput.vue'
import type { OmniSelectOption, OmniTableCellUpdate, OmniTableColumn } from '~/types/omni/collection'
import type { TaskItem, TaskPriority, TaskProjectItem } from '~/types/tasks'

definePageMeta({ layout: 'admin' })

const ORDER_STEP = 10
const PRIORITY_OPTIONS: OmniSelectOption[] = [
  { label: 'Baixa', value: 'baixa' },
  { label: 'Media', value: 'media' },
  { label: 'Alta', value: 'alta' }
]
const DEFAULT_FILTERS = { search: '', responsible: '', clientId: '', type: '', hideArchived: true }

const filterSwitchDefs = [
  { key: 'search', label: 'Busca' },
  { key: 'responsible', label: 'Responsavel' },
  { key: 'client', label: 'Cliente' },
  { key: 'type', label: 'Tipo' },
  { key: 'hideArchived', label: 'Ocultar arquivadas' }
] as const

const cardFieldSwitchDefs = [
  { key: 'responsible', label: 'Responsavel' },
  { key: 'client', label: 'Cliente' },
  { key: 'type', label: 'Tipo' },
  { key: 'dueDate', label: 'Entrega' },
  { key: 'priority', label: 'Prioridade' }
] as const

const sessionSimulation = useSessionSimulationStore()
const tasksWorkspace = useTasksWorkspace()

const viewMode = ref<'board' | 'table'>('board')
const draggingTaskId = ref('')
const filters = reactive({ ...DEFAULT_FILTERS })
const tableSelectedRows = ref<Array<string | number>>([])

const projectSettingsOpen = ref(false)
const taskEditorOpen = ref(false)
const settingsSaving = ref(false)
const taskSaving = ref(false)

const projectSettingsDraft = reactive<{
  name: string
  statuses: string[]
  responsibles: string[]
  types: string[]
  filters: TaskProjectItem['filters']
  cardFields: TaskProjectItem['cardFields']
}>({
  name: '', statuses: [], responsibles: [], types: [],
  filters: { search: true, responsible: true, client: true, type: true, hideArchived: true },
  cardFields: { responsible: true, client: true, type: true, dueDate: true, priority: true }
})

const taskDraft = reactive({
  id: '', title: '', description: '', status: '', responsible: '', clientId: 0, clientName: '', type: '',
  priority: 'media' as TaskPriority, dueDate: '', archived: false
})

function normalizeText(value: unknown, max = 240) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max) }
function normalizeKey(value: unknown) {
  return normalizeText(value, 120).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}
function toNumberId(value: unknown) { const n = Number.parseInt(String(value ?? '').trim(), 10); return Number.isFinite(n) && n > 0 ? n : 0 }
function dateLabel(value: unknown) {
  const iso = normalizeText(value, 24)
  if (!iso) return '-'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR')
}
function priorityLabel(value: TaskPriority) { return value === 'alta' ? 'Alta' : value === 'baixa' ? 'Baixa' : 'Media' }
function priorityColor(value: TaskPriority): 'error' | 'warning' | 'neutral' { return value === 'alta' ? 'error' : value === 'media' ? 'warning' : 'neutral' }
function clientLabel(clientId: number) { return sessionSimulation.clientOptions.find(c => c.value === clientId)?.label || `Cliente #${clientId}` }
function taskSort(a: TaskItem, b: TaskItem) { const d = Number(a.order || 0) - Number(b.order || 0); return d !== 0 ? d : a.createdAt.localeCompare(b.createdAt) }
function renumber(projectId: string, status: string) {
  tasksWorkspace.tasks.value
    .filter(t => t.projectId === projectId && normalizeKey(t.status) === normalizeKey(status))
    .sort(taskSort)
    .forEach((t, i) => { t.order = (i + 1) * ORDER_STEP; t.updatedAt = new Date().toISOString() })
}
function moveTask(taskId: string, targetStatus: string, targetIndex?: number) {
  const project = activeProject.value
  if (!project) return
  const moving = tasksWorkspace.tasks.value.find(t => t.id === taskId && t.projectId === project.id)
  if (!moving) return
  const sourceStatus = moving.status
  const sameStatus = normalizeKey(sourceStatus) === normalizeKey(targetStatus)
  const list = tasksWorkspace.tasks.value
    .filter(t => t.projectId === project.id && normalizeKey(t.status) === normalizeKey(targetStatus) && t.id !== moving.id)
    .sort(taskSort)
  const at = Number.isFinite(Number(targetIndex)) ? Math.max(0, Math.min(Number(targetIndex), list.length)) : list.length
  list.splice(at, 0, moving)
  list.forEach((t, i) => { t.status = targetStatus; t.order = (i + 1) * ORDER_STEP; t.updatedAt = new Date().toISOString() })
  if (!sameStatus) renumber(project.id, sourceStatus)
}

const viewerUserType = computed<'admin' | 'client'>(() => sessionSimulation.userType === 'client' ? 'client' : 'admin')
const activeProject = computed(() => tasksWorkspace.projects.value.find(p => p.id === tasksWorkspace.activeProjectId.value) ?? null)
const projectOptions = computed(() => tasksWorkspace.projects.value.map(p => ({ label: p.name, value: p.id })))
const clientOptions = computed(() => sessionSimulation.clientOptions.map(c => ({ label: c.label, value: c.value })))

function uniqueValues(list: string[]) {
  const seen = new Set<string>()
  return list.filter((v) => { const k = normalizeKey(v); if (!k || seen.has(k)) return false; seen.add(k); return true })
}

const statuses = computed(() => uniqueValues((activeProject.value?.statuses || []).map(v => normalizeText(v, 120)).filter(Boolean)))
const statusOptions = computed<OmniSelectOption[]>(() => statuses.value.map(v => ({ label: v, value: v })))
const responsibleOptions = computed<OmniSelectOption[]>(() => {
  const project = activeProject.value
  if (!project) return []
  const values = uniqueValues([...project.responsibles, ...tasksWorkspace.tasks.value.filter(t => t.projectId === project.id).map(t => t.responsible)])
  return values.map(v => ({ label: v, value: v }))
})
const typeOptions = computed<OmniSelectOption[]>(() => {
  const project = activeProject.value
  if (!project) return []
  const values = uniqueValues([...project.types, ...tasksWorkspace.tasks.value.filter(t => t.projectId === project.id).map(t => t.type)])
  return values.map(v => ({ label: v, value: v }))
})

const projectModel = computed({
  get: () => activeProject.value?.id ?? '',
  set: (value: string | number | null) => { const id = normalizeText(value, 120); if (id) tasksWorkspace.setActiveProject(id) }
})

const projectTasks = computed(() => {
  const project = activeProject.value
  if (!project) return []
  return tasksWorkspace.tasks.value.filter((t) => t.projectId === project.id && (viewerUserType.value === 'admin' || t.clientId === sessionSimulation.clientId))
})

const filteredTasks = computed(() => {
  const project = activeProject.value
  if (!project) return []
  const search = normalizeText(filters.search, 180).toLowerCase()
  const fResponsible = normalizeText(filters.responsible, 120)
  const fType = normalizeText(filters.type, 120)
  const fClient = toNumberId(filters.clientId)
  return projectTasks.value
    .filter((t) => {
      if (project.filters.hideArchived && filters.hideArchived && t.archived) return false
      if (project.filters.search && search) {
        const hay = [t.title, t.description, t.responsible, t.clientName, t.type, t.status].join(' ').toLowerCase()
        if (!hay.includes(search)) return false
      }
      if (project.filters.responsible && fResponsible && normalizeKey(t.responsible) !== normalizeKey(fResponsible)) return false
      if (project.filters.type && fType && normalizeKey(t.type) !== normalizeKey(fType)) return false
      if (viewerUserType.value === 'admin' && project.filters.client && fClient > 0 && t.clientId !== fClient) return false
      return true
    })
    .sort(taskSort)
})

const boardColumns = computed(() => statuses.value.map((status) => ({ status, tasks: filteredTasks.value.filter(t => normalizeKey(t.status) === normalizeKey(status)).sort(taskSort) })))
const tableRows = computed(() => filteredTasks.value.map(t => ({ ...t, clientId: t.clientId })))
const projectCount = computed(() => tasksWorkspace.projects.value.length)

const tableColumns = computed<OmniTableColumn[]>(() => ([
  { key: 'title', label: 'Titulo', type: 'text', editable: true, minWidth: 220, focusOnCreate: true },
  { key: 'status', label: 'Status', type: 'select', editable: true, minWidth: 180, options: statusOptions.value },
  { key: 'responsible', label: 'Responsavel', type: 'select', editable: true, minWidth: 170, options: responsibleOptions.value, creatable: true },
  { key: 'clientId', label: 'Cliente', type: 'select', editable: true, minWidth: 170, adminOnly: true, options: clientOptions.value },
  { key: 'type', label: 'Tipo', type: 'select', editable: true, minWidth: 150, options: typeOptions.value, creatable: true },
  { key: 'priority', label: 'Prioridade', type: 'select', editable: true, minWidth: 130, options: PRIORITY_OPTIONS },
  { key: 'dueDate', label: 'Entrega', type: 'text', editable: true, minWidth: 130, formatter: v => dateLabel(v) },
  { key: 'archived', label: 'Arquivada', type: 'switch', editable: true, minWidth: 120, align: 'center', switchOnValue: true, switchOffValue: false },
  {
    key: 'actions', label: 'Acoes', minWidth: 120, align: 'right', actions: [
      { id: 'edit', icon: 'i-lucide-pencil', label: 'Editar', color: 'neutral', variant: 'ghost' },
      { id: 'archive', icon: 'i-lucide-archive', label: 'Arquivar', color: 'warning', variant: 'ghost' },
      { id: 'delete', icon: 'i-lucide-trash-2', label: 'Excluir', color: 'error', variant: 'ghost' }
    ]
  }
]))

function hydrateProjectDraft(project: TaskProjectItem | null) {
  if (!project) {
    projectSettingsDraft.name = ''
    projectSettingsDraft.statuses = []
    projectSettingsDraft.responsibles = []
    projectSettingsDraft.types = []
    return
  }
  projectSettingsDraft.name = project.name
  projectSettingsDraft.statuses = [...project.statuses]
  projectSettingsDraft.responsibles = [...project.responsibles]
  projectSettingsDraft.types = [...project.types]
  projectSettingsDraft.filters = { ...project.filters }
  projectSettingsDraft.cardFields = { ...project.cardFields }
}

function resetTaskDraft() {
  taskDraft.id = ''
  taskDraft.title = ''
  taskDraft.description = ''
  taskDraft.status = statuses.value[0] || ''
  taskDraft.responsible = ''
  taskDraft.clientId = viewerUserType.value === 'client' ? sessionSimulation.clientId : (toNumberId(filters.clientId) || sessionSimulation.clientId)
  taskDraft.clientName = clientLabel(taskDraft.clientId)
  taskDraft.type = ''
  taskDraft.priority = 'media'
  taskDraft.dueDate = ''
  taskDraft.archived = false
}

function openTaskEditor(task?: TaskItem | null) {
  if (!task) { resetTaskDraft(); taskEditorOpen.value = true; return }
  taskDraft.id = task.id
  taskDraft.title = task.title
  taskDraft.description = task.description
  taskDraft.status = task.status
  taskDraft.responsible = task.responsible
  taskDraft.clientId = task.clientId
  taskDraft.clientName = task.clientName
  taskDraft.type = task.type
  taskDraft.priority = task.priority
  taskDraft.dueDate = task.dueDate
  taskDraft.archived = task.archived
  taskEditorOpen.value = true
}

function closeTaskEditor() { taskEditorOpen.value = false; resetTaskDraft() }

function upsertProjectListsFromTask() {
  const project = activeProject.value
  if (!project) return
  const responsible = normalizeText(taskDraft.responsible, 120)
  const type = normalizeText(taskDraft.type, 120)
  const nextResponsibles = [...project.responsibles]
  const nextTypes = [...project.types]
  if (responsible && !nextResponsibles.some(v => normalizeKey(v) === normalizeKey(responsible))) nextResponsibles.push(responsible)
  if (type && !nextTypes.some(v => normalizeKey(v) === normalizeKey(type))) nextTypes.push(type)
  tasksWorkspace.saveProjectSettings(project.id, { responsibles: nextResponsibles, types: nextTypes })
}

async function saveTask() {
  const project = activeProject.value
  if (!project) return
  const title = normalizeText(taskDraft.title, 220)
  if (!title) return
  taskSaving.value = true
  const clientId = viewerUserType.value === 'client' ? sessionSimulation.clientId : Math.max(1, toNumberId(taskDraft.clientId) || sessionSimulation.clientId)
  const payload = {
    title,
    description: normalizeText(taskDraft.description, 5000),
    status: normalizeText(taskDraft.status, 120) || project.statuses[0] || 'Raw',
    responsible: normalizeText(taskDraft.responsible, 120),
    clientId,
    clientName: clientLabel(clientId),
    type: normalizeText(taskDraft.type, 120),
    priority: taskDraft.priority,
    dueDate: normalizeText(taskDraft.dueDate, 30),
    archived: Boolean(taskDraft.archived)
  }
  if (!taskDraft.id) {
    const created = tasksWorkspace.createTask({ projectId: project.id, ...payload })
    if (created) taskDraft.id = created.id
  } else {
    tasksWorkspace.updateTask(taskDraft.id, payload)
  }
  upsertProjectListsFromTask()
  taskSaving.value = false
  taskEditorOpen.value = false
}

function onCreateProject(option: OmniSelectOption) {
  const name = normalizeText(option.label || option.value, 140)
  if (!name) return
  const created = tasksWorkspace.createProject(name)
  if (created) hydrateProjectDraft(created)
  Object.assign(filters, DEFAULT_FILTERS)
}

function saveProjectSettings() {
  const project = activeProject.value
  if (!project) return
  settingsSaving.value = true
  const updated = tasksWorkspace.saveProjectSettings(project.id, {
    name: normalizeText(projectSettingsDraft.name, 140) || project.name,
    statuses: [...projectSettingsDraft.statuses],
    responsibles: [...projectSettingsDraft.responsibles],
    types: [...projectSettingsDraft.types],
    filters: { ...projectSettingsDraft.filters },
    cardFields: { ...projectSettingsDraft.cardFields }
  })
  if (updated) {
    hydrateProjectDraft(updated)
    if (!updated.filters.search) filters.search = ''
    if (!updated.filters.responsible) filters.responsible = ''
    if (!updated.filters.type) filters.type = ''
    if (!updated.filters.client) filters.clientId = ''
  }
  settingsSaving.value = false
  projectSettingsOpen.value = false
}

function deleteProject() {
  const project = activeProject.value
  if (!project || tasksWorkspace.projects.value.length <= 1) return
  if (import.meta.client && !window.confirm(`Excluir o projeto "${project.name}"?`)) return
  if (tasksWorkspace.deleteProject(project.id)) {
    projectSettingsOpen.value = false
    tableSelectedRows.value = []
    closeTaskEditor()
  }
}

function clearFilters() { Object.assign(filters, DEFAULT_FILTERS) }
function toggleArchive(task: TaskItem) { tasksWorkspace.toggleArchiveTask(task.id) }
function deleteTask(task: TaskItem) {
  if (import.meta.client && !window.confirm(`Excluir task "${task.title}"?`)) return
  tasksWorkspace.removeTask(task.id)
  if (taskEditorOpen.value && taskDraft.id === task.id) closeTaskEditor()
}

function onDragStart(task: TaskItem, event: DragEvent) {
  draggingTaskId.value = task.id
  event.dataTransfer?.setData('text/plain', task.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}
function onDragEnd() { draggingTaskId.value = '' }
function onDropColumn(status: string) { if (draggingTaskId.value) moveTask(draggingTaskId.value, status); draggingTaskId.value = '' }
function onDropCard(status: string, index: number) { if (draggingTaskId.value) moveTask(draggingTaskId.value, status, index); draggingTaskId.value = '' }

function onTableCellUpdate(payload: OmniTableCellUpdate) {
  const id = normalizeText(payload.rowId, 120)
  const key = normalizeText(payload.key, 120)
  if (!id || !key) return
  if (key === 'clientId') {
    const clientId = toNumberId(payload.value)
    if (clientId) tasksWorkspace.updateTask(id, { clientId, clientName: clientLabel(clientId) })
    return
  }
  if (key === 'priority') {
    const p = normalizeKey(payload.value)
    const priority: TaskPriority = p === 'alta' || p === 'media' || p === 'baixa' ? p : 'media'
    tasksWorkspace.updateTask(id, { priority })
    return
  }
  if (key === 'archived') { tasksWorkspace.updateTask(id, { archived: Boolean(payload.value) }); return }
  if (key === 'status') { const status = normalizeText(payload.value, 120); if (status) tasksWorkspace.updateTask(id, { status }); return }
  if (key === 'responsible') {
    const responsible = normalizeText(payload.value, 120)
    tasksWorkspace.updateTask(id, { responsible })
    const project = activeProject.value
    if (project && responsible && !project.responsibles.some(v => normalizeKey(v) === normalizeKey(responsible))) {
      tasksWorkspace.saveProjectSettings(project.id, { responsibles: [...project.responsibles, responsible] })
    }
    return
  }
  if (key === 'type') {
    const type = normalizeText(payload.value, 120)
    tasksWorkspace.updateTask(id, { type })
    const project = activeProject.value
    if (project && type && !project.types.some(v => normalizeKey(v) === normalizeKey(type))) {
      tasksWorkspace.saveProjectSettings(project.id, { types: [...project.types, type] })
    }
    return
  }
  if (key === 'title') { const title = normalizeText(payload.value, 220); if (title) tasksWorkspace.updateTask(id, { title }); return }
  if (key === 'dueDate') { tasksWorkspace.updateTask(id, { dueDate: normalizeText(payload.value, 24) }) }
}

function onTableRowAction(payload: { action: string, row: Record<string, unknown> }) {
  const id = normalizeText(payload.row.id, 120)
  const task = tasksWorkspace.tasks.value.find(t => t.id === id)
  if (!task) return
  if (payload.action === 'edit') { openTaskEditor(task); return }
  if (payload.action === 'archive') { toggleArchive(task); return }
  if (payload.action === 'delete') deleteTask(task)
}

function syncClientFilter() {
  const project = activeProject.value
  if (!project) return
  if (viewerUserType.value === 'client' || !project.filters.client) filters.clientId = ''
}

watch(() => tasksWorkspace.activeProjectId.value, () => {
  hydrateProjectDraft(activeProject.value)
  syncClientFilter()
  tableSelectedRows.value = []
  if (taskEditorOpen.value && taskDraft.id && !tasksWorkspace.tasks.value.some(t => t.id === taskDraft.id)) closeTaskEditor()
}, { immediate: true })

watch(() => viewerUserType.value, () => { syncClientFilter() }, { immediate: true })

onMounted(async () => {
  sessionSimulation.initialize()
  tasksWorkspace.initialize()
  if (sessionSimulation.isAdmin) await sessionSimulation.refreshClientOptions()
  if (!activeProject.value && tasksWorkspace.projects.value.length > 0) tasksWorkspace.setActiveProject(tasksWorkspace.projects.value[0]!.id)
  hydrateProjectDraft(activeProject.value)
})
</script>

<template>
  <section class="tasks-page space-y-4">
    <AdminPageHeader eyebrow="Tasks" title="Workspace de Tasks" description="Kanban front-first notion-like com projetos configuraveis." />

    <div class="tasks-page__toolbar rounded-[var(--radius-md)] border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-3">
      <div class="tasks-page__toolbar-row tasks-page__toolbar-row--top flex flex-wrap items-center gap-2">
        <div class="tasks-page__project-select min-w-[260px] flex-1">
          <OmniSelectMenuInput
            v-model="projectModel"
            :items="projectOptions"
            placeholder="Selecionar projeto"
            :creatable="{ when: 'always', position: 'bottom' }"
            :searchable="true"
            :full-content-width="true"
            item-display-mode="text"
            color="neutral"
            variant="outline"
            :highlight="false"
            :badge-mode="false"
            option-edit-mode="none"
            @create="onCreateProject"
          />
        </div>

        <div class="tasks-page__toolbar-actions flex items-center gap-2">
          <UButton icon="i-lucide-plus" label="Nova task" color="primary" variant="soft" size="sm" @click="openTaskEditor()" />
          <UButton icon="i-lucide-settings-2" label="Configurar projeto" color="neutral" variant="soft" size="sm" :disabled="!activeProject" @click="projectSettingsOpen = true" />
          <UButton icon="i-lucide-rotate-ccw" label="Limpar filtros" color="neutral" variant="ghost" size="sm" @click="clearFilters" />
        </div>
      </div>

      <div v-if="activeProject" class="tasks-page__toolbar-row tasks-page__toolbar-row--filters mt-3 flex flex-wrap items-center gap-2">
        <div v-if="activeProject.filters.search" class="tasks-page__filter-field tasks-page__filter-field--search min-w-[260px] flex-1">
          <UInput v-model="filters.search" class="tasks-page__filter-input tasks-page__filter-input--search" placeholder="Buscar por titulo, descricao e tags..." icon="i-lucide-search" />
        </div>

        <div v-if="activeProject.filters.responsible" class="tasks-page__filter-field w-[220px]">
          <OmniSelectMenuInput v-model="filters.responsible" :items="responsibleOptions" placeholder="Responsavel" :searchable="true" :full-content-width="true" item-display-mode="text" color="neutral" variant="none" :highlight="false" :badge-mode="true" clear option-edit-mode="color" />
        </div>

        <div v-if="viewerUserType === 'admin' && activeProject.filters.client" class="tasks-page__filter-field w-[220px]">
          <OmniSelectMenuInput v-model="filters.clientId" :items="clientOptions" placeholder="Cliente" :searchable="true" :full-content-width="true" item-display-mode="text" color="neutral" variant="none" :highlight="false" :badge-mode="true" clear option-edit-mode="color" />
        </div>

        <div v-if="activeProject.filters.type" class="tasks-page__filter-field w-[220px]">
          <OmniSelectMenuInput v-model="filters.type" :items="typeOptions" placeholder="Tipo" :searchable="true" :full-content-width="true" item-display-mode="text" color="neutral" variant="none" :highlight="false" :badge-mode="true" clear option-edit-mode="color" />
        </div>

        <div v-if="activeProject.filters.hideArchived" class="tasks-page__filter-field tasks-page__filter-field--archived flex h-9 items-center gap-2 rounded-[var(--radius-sm)] border border-[rgb(var(--border))] px-3">
          <USwitch v-model="filters.hideArchived" class="tasks-page__filter-switch" />
          <span class="tasks-page__filter-switch-label text-xs">Ocultar arquivadas</span>
        </div>
      </div>

      <div v-if="activeProject" class="tasks-page__toolbar-row tasks-page__toolbar-row--meta mt-3 flex flex-wrap items-center justify-between gap-2">
        <div class="tasks-page__meta-badges flex flex-wrap items-center gap-2">
          <UBadge color="neutral" variant="soft">Projeto: {{ activeProject.name }}</UBadge>
          <UBadge color="neutral" variant="soft">Total: {{ projectTasks.length }}</UBadge>
          <UBadge color="primary" variant="soft">Filtradas: {{ filteredTasks.length }}</UBadge>
          <UBadge color="warning" variant="soft">Arquivadas: {{ projectTasks.filter(t => t.archived).length }}</UBadge>
        </div>

        <div class="tasks-page__view-mode flex items-center gap-1 rounded-[var(--radius-sm)] border border-[rgb(var(--border))] p-1">
          <UButton icon="i-lucide-kanban" label="Board" :color="viewMode === 'board' ? 'primary' : 'neutral'" :variant="viewMode === 'board' ? 'soft' : 'ghost'" size="xs" @click="viewMode = 'board'" />
          <UButton icon="i-lucide-table" label="Tabela" :color="viewMode === 'table' ? 'primary' : 'neutral'" :variant="viewMode === 'table' ? 'soft' : 'ghost'" size="xs" @click="viewMode = 'table'" />
        </div>
      </div>
    </div>

    <UAlert v-if="!activeProject" class="tasks-page__empty-project" color="warning" variant="soft" icon="i-lucide-folder-open" title="Sem projeto ativo" description="Crie ou selecione um projeto para comecar." />

    <div v-else-if="viewMode === 'board'" class="tasks-page__board-wrap overflow-x-auto">
      <div class="tasks-page__board min-w-[1200px] gap-3">
        <section
          v-for="column in boardColumns"
          :key="column.status"
          class="tasks-page__board-column rounded-[var(--radius-md)] border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))]"
          @dragover.prevent
          @drop.prevent="onDropColumn(column.status)"
        >
          <header class="tasks-page__board-column-head flex items-center justify-between border-b border-[rgb(var(--border))] px-3 py-2">
            <p class="tasks-page__board-column-title text-sm font-semibold">{{ column.status }}</p>
            <UBadge color="neutral" variant="soft" size="xs">{{ column.tasks.length }}</UBadge>
          </header>

          <div class="tasks-page__board-column-body space-y-2 p-2">
            <article
              v-for="(task, index) in column.tasks"
              :key="task.id"
              class="tasks-page__board-card cursor-pointer rounded-[var(--radius-sm)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 transition-colors hover:border-primary"
              draggable="true"
              @dragstart="onDragStart(task, $event)"
              @dragend="onDragEnd"
              @dragover.prevent
              @drop.prevent="onDropCard(column.status, index)"
              @click="openTaskEditor(task)"
            >
              <div class="tasks-page__board-card-head mb-2 flex items-start justify-between gap-2">
                <p class="tasks-page__board-card-title line-clamp-2 text-sm font-semibold">{{ task.title }}</p>
                <div class="tasks-page__board-card-actions flex items-center gap-1" @click.stop>
                  <UButton icon="i-lucide-archive" color="warning" variant="ghost" size="xs" :title="task.archived ? 'Desarquivar' : 'Arquivar'" @click="toggleArchive(task)" />
                  <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" title="Excluir" @click="deleteTask(task)" />
                </div>
              </div>

              <p v-if="task.description" class="tasks-page__board-card-description line-clamp-2 text-xs text-[rgb(var(--muted))]">{{ task.description }}</p>

              <div class="tasks-page__board-card-badges mt-2 flex flex-wrap items-center gap-1">
                <UBadge v-if="activeProject.cardFields.responsible && task.responsible" color="neutral" variant="soft" size="xs">{{ task.responsible }}</UBadge>
                <UBadge v-if="activeProject.cardFields.client" color="neutral" variant="soft" size="xs">{{ task.clientName }}</UBadge>
                <UBadge v-if="activeProject.cardFields.type && task.type" color="info" variant="soft" size="xs">{{ task.type }}</UBadge>
                <UBadge v-if="activeProject.cardFields.priority" :color="priorityColor(task.priority)" variant="soft" size="xs">{{ priorityLabel(task.priority) }}</UBadge>
              </div>

              <div v-if="activeProject.cardFields.dueDate" class="tasks-page__board-card-date mt-2 flex items-center gap-1 text-xs text-[rgb(var(--muted))]">
                <UIcon name="i-lucide-calendar-days" class="h-3.5 w-3.5" />
                <span>{{ dateLabel(task.dueDate) }}</span>
              </div>
            </article>

            <UAlert v-if="column.tasks.length === 0" class="tasks-page__board-empty" color="neutral" variant="soft" icon="i-lucide-inbox" title="Sem tasks" description="Arraste cards para esta coluna." />
          </div>
        </section>
      </div>
    </div>

    <div v-else class="tasks-page__table-wrap">
      <OmniDataTable
        v-model="tableSelectedRows"
        class="tasks-page__table"
        :rows="tableRows"
        :columns="tableColumns"
        row-key="id"
        :viewer-user-type="viewerUserType"
        :loading="false"
        empty-text="Nenhuma task encontrada para os filtros atuais."
        @update:cell="onTableCellUpdate"
        @row-action="onTableRowAction"
      />
    </div>

    <USlideover v-model:open="projectSettingsOpen" title="Configurar projeto" description="Defina status, filtros e campos do card." :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <div class="tasks-page__settings space-y-4">
          <div class="tasks-page__settings-field space-y-1">
            <p class="tasks-page__settings-label text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Nome do projeto</p>
            <UInput v-model="projectSettingsDraft.name" class="tasks-page__settings-input" placeholder="Nome do projeto" />
          </div>

          <div class="tasks-page__settings-field space-y-1">
            <p class="tasks-page__settings-label text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Status do board</p>
            <OmniSelectMenuInput v-model="projectSettingsDraft.statuses" :items="statusOptions" placeholder="Criar ou selecionar status" :multiple="true" :creatable="{ when: 'always', position: 'bottom' }" :searchable="true" :full-content-width="true" item-display-mode="text" color="neutral" variant="none" :highlight="false" :badge-mode="true" clear option-edit-mode="full" />
          </div>

          <div class="tasks-page__settings-grid grid gap-4 md:grid-cols-2">
            <div class="tasks-page__settings-field space-y-1">
              <p class="tasks-page__settings-label text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Responsaveis</p>
              <OmniSelectMenuInput v-model="projectSettingsDraft.responsibles" :items="responsibleOptions" placeholder="Adicionar responsavel" :multiple="true" :creatable="{ when: 'always', position: 'bottom' }" :searchable="true" :full-content-width="true" item-display-mode="text" color="neutral" variant="none" :highlight="false" :badge-mode="true" clear option-edit-mode="full" />
            </div>

            <div class="tasks-page__settings-field space-y-1">
              <p class="tasks-page__settings-label text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Tipos</p>
              <OmniSelectMenuInput v-model="projectSettingsDraft.types" :items="typeOptions" placeholder="Adicionar tipo" :multiple="true" :creatable="{ when: 'always', position: 'bottom' }" :searchable="true" :full-content-width="true" item-display-mode="text" color="neutral" variant="none" :highlight="false" :badge-mode="true" clear option-edit-mode="full" />
            </div>
          </div>

          <div class="tasks-page__settings-group rounded-[var(--radius-sm)] border border-[rgb(var(--border))] p-3">
            <p class="tasks-page__settings-group-title mb-2 text-sm font-semibold">Filtros ativos</p>
            <div class="tasks-page__settings-switch-grid grid gap-2 sm:grid-cols-2">
              <label
                v-for="item in filterSwitchDefs"
                :key="item.key"
                class="tasks-page__settings-switch-row flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[rgb(var(--border))] px-3 py-2"
              >
                <span class="text-sm">{{ item.label }}</span>
                <USwitch
                  v-model="projectSettingsDraft.filters[item.key as keyof TaskProjectItem['filters']]"
                  :disabled="item.key === 'client' && viewerUserType === 'client'"
                />
              </label>
            </div>
          </div>

          <div class="tasks-page__settings-group rounded-[var(--radius-sm)] border border-[rgb(var(--border))] p-3">
            <p class="tasks-page__settings-group-title mb-2 text-sm font-semibold">Campos do card</p>
            <div class="tasks-page__settings-switch-grid grid gap-2 sm:grid-cols-2">
              <label
                v-for="item in cardFieldSwitchDefs"
                :key="item.key"
                class="tasks-page__settings-switch-row flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[rgb(var(--border))] px-3 py-2"
              >
                <span class="text-sm">{{ item.label }}</span>
                <USwitch
                  v-model="projectSettingsDraft.cardFields[item.key as keyof TaskProjectItem['cardFields']]"
                  :disabled="item.key === 'client' && viewerUserType === 'client'"
                />
              </label>
            </div>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="tasks-page__settings-footer flex w-full items-center justify-between gap-2">
          <UButton icon="i-lucide-trash-2" label="Excluir projeto" color="error" variant="ghost" :disabled="projectCount <= 1" @click="deleteProject" />
          <div class="tasks-page__settings-footer-actions flex items-center gap-2">
            <UButton label="Cancelar" color="neutral" variant="ghost" @click="projectSettingsOpen = false" />
            <UButton label="Salvar" color="primary" :loading="settingsSaving" @click="saveProjectSettings" />
          </div>
        </div>
      </template>
    </USlideover>

    <USlideover v-model:open="taskEditorOpen" title="Editar task" description="Edicao rapida da task selecionada." :ui="{ content: 'max-w-xl' }" @update:open="(open) => { if (!open) closeTaskEditor() }">
      <template #body>
        <div class="tasks-page__task-editor space-y-3">
          <div class="tasks-page__task-field space-y-1">
            <p class="tasks-page__task-label text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Titulo</p>
            <UInput v-model="taskDraft.title" class="tasks-page__task-input" placeholder="Titulo da task" />
          </div>

          <div class="tasks-page__task-field space-y-1">
            <p class="tasks-page__task-label text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Descricao</p>
            <UTextarea v-model="taskDraft.description" class="tasks-page__task-textarea" :rows="4" placeholder="Descricao da task" />
          </div>

          <div class="tasks-page__task-grid grid gap-3 sm:grid-cols-2">
            <div class="tasks-page__task-field space-y-1">
              <p class="tasks-page__task-label text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Status</p>
              <OmniSelectMenuInput v-model="taskDraft.status" :items="statusOptions" placeholder="Status" :searchable="true" :full-content-width="true" item-display-mode="text" color="neutral" variant="none" :highlight="false" :badge-mode="true" clear option-edit-mode="color" />
            </div>
            <div class="tasks-page__task-field space-y-1">
              <p class="tasks-page__task-label text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Prioridade</p>
              <OmniSelectMenuInput v-model="taskDraft.priority" :items="PRIORITY_OPTIONS" placeholder="Prioridade" :searchable="false" :full-content-width="true" item-display-mode="text" color="neutral" variant="none" :highlight="false" :badge-mode="true" clear option-edit-mode="color" />
            </div>
            <div class="tasks-page__task-field space-y-1">
              <p class="tasks-page__task-label text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Responsavel</p>
              <OmniSelectMenuInput v-model="taskDraft.responsible" :items="responsibleOptions" placeholder="Responsavel" :creatable="{ when: 'always', position: 'bottom' }" :searchable="true" :full-content-width="true" item-display-mode="text" color="neutral" variant="none" :highlight="false" :badge-mode="true" clear option-edit-mode="full" />
            </div>
            <div class="tasks-page__task-field space-y-1">
              <p class="tasks-page__task-label text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Tipo</p>
              <OmniSelectMenuInput v-model="taskDraft.type" :items="typeOptions" placeholder="Tipo" :creatable="{ when: 'always', position: 'bottom' }" :searchable="true" :full-content-width="true" item-display-mode="text" color="neutral" variant="none" :highlight="false" :badge-mode="true" clear option-edit-mode="full" />
            </div>
            <div v-if="viewerUserType === 'admin'" class="tasks-page__task-field space-y-1">
              <p class="tasks-page__task-label text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Cliente</p>
              <OmniSelectMenuInput v-model="taskDraft.clientId" :items="clientOptions" placeholder="Cliente" :searchable="true" :full-content-width="true" item-display-mode="text" color="neutral" variant="none" :highlight="false" :badge-mode="true" clear option-edit-mode="color" />
            </div>
            <div class="tasks-page__task-field space-y-1">
              <p class="tasks-page__task-label text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Entrega</p>
              <UInput v-model="taskDraft.dueDate" class="tasks-page__task-input" type="date" />
            </div>
          </div>

          <label class="tasks-page__task-archived flex items-center justify-between rounded-[var(--radius-sm)] border border-[rgb(var(--border))] px-3 py-2">
            <span class="text-sm">Task arquivada</span>
            <USwitch v-model="taskDraft.archived" />
          </label>
        </div>
      </template>

      <template #footer>
        <div class="tasks-page__task-footer flex w-full items-center justify-end gap-2">
          <UButton label="Cancelar" color="neutral" variant="ghost" @click="closeTaskEditor" />
          <UButton label="Salvar task" color="primary" :loading="taskSaving" @click="saveTask" />
        </div>
      </template>
    </USlideover>
  </section>
</template>

<style scoped>
.tasks-page__board { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(300px, 1fr); align-items: start; }
.tasks-page__board-column { min-height: 440px; }
.tasks-page__board-column-body { min-height: 390px; }
.tasks-page__board-card { box-shadow: var(--shadow-xs); }
.tasks-page__board-card-title { color: rgb(var(--text)); }
.tasks-page__board-card-description { white-space: pre-wrap; }
.tasks-page__settings-switch-row, .tasks-page__task-archived { background: rgb(var(--surface)); }
</style>
