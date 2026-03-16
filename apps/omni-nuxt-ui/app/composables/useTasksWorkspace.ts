import type {
  TaskItem,
  TaskPriority,
  TaskProjectCardFieldsConfig,
  TaskProjectFiltersConfig,
  TaskProjectItem,
  TasksWorkspaceState
} from '~/types/tasks'

const STORAGE_KEY = 'omni.admin.tasks.workspace.v1'
const ORDER_STEP = 10

const DEFAULT_PROJECT_FILTERS: TaskProjectFiltersConfig = {
  search: true,
  responsible: true,
  client: true,
  type: true,
  hideArchived: true
}

const DEFAULT_PROJECT_CARD_FIELDS: TaskProjectCardFieldsConfig = {
  responsible: true,
  client: true,
  type: true,
  dueDate: true,
  priority: true
}

const DEFAULT_PROJECT_STATUSES = [
  'Raw',
  'Standby',
  'Running',
  'Aguardando aprovacao',
  'Aprovada',
  'Finalizada',
  'Rotina'
]

function nowIso() {
  return new Date().toISOString()
}

function normalizeText(value: unknown, max = 180) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function normalizeStatusKey(value: unknown) {
  return normalizeText(value, 120)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function dedupeValues(values: string[]) {
  const seen = new Set<string>()
  const output: string[] = []

  values.forEach((value) => {
    const label = normalizeText(value, 120)
    if (!label) return
    const key = normalizeStatusKey(label)
    if (!key || seen.has(key)) return
    seen.add(key)
    output.push(label)
  })

  return output
}

function cloneFiltersConfig(value?: Partial<TaskProjectFiltersConfig>) {
  return {
    ...DEFAULT_PROJECT_FILTERS,
    ...(value || {})
  }
}

function cloneCardFieldsConfig(value?: Partial<TaskProjectCardFieldsConfig>) {
  return {
    ...DEFAULT_PROJECT_CARD_FIELDS,
    ...(value || {})
  }
}

function ensureProject(input: Partial<TaskProjectItem>, index = 0): TaskProjectItem {
  const createdAt = normalizeText(input.createdAt, 40) || nowIso()
  const updatedAt = normalizeText(input.updatedAt, 40) || createdAt
  const statuses = dedupeValues(Array.isArray(input.statuses) ? input.statuses : [])
  const nextStatuses = statuses.length > 0 ? statuses : [...DEFAULT_PROJECT_STATUSES]

  return {
    id: normalizeText(input.id, 80) || makeId(`project-${index + 1}`),
    name: normalizeText(input.name, 140) || `Projeto ${index + 1}`,
    statuses: nextStatuses,
    responsibles: dedupeValues(Array.isArray(input.responsibles) ? input.responsibles : []),
    types: dedupeValues(Array.isArray(input.types) ? input.types : []),
    filters: cloneFiltersConfig(input.filters),
    cardFields: cloneCardFieldsConfig(input.cardFields),
    createdAt,
    updatedAt
  }
}

function parseDate(value: string) {
  const date = new Date(value)
  const timestamp = date.getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function normalizeTaskOrdersForProject(projectId: string, taskList: TaskItem[]) {
  const grouped = new Map<string, TaskItem[]>()

  taskList
    .filter(task => task.projectId === projectId)
    .forEach((task) => {
      const statusKey = normalizeStatusKey(task.status)
      if (!grouped.has(statusKey)) grouped.set(statusKey, [])
      grouped.get(statusKey)!.push(task)
    })

  grouped.forEach((items) => {
    items
      .sort((a, b) => {
        const orderDiff = Number(a.order || 0) - Number(b.order || 0)
        if (orderDiff !== 0) return orderDiff
        return parseDate(a.createdAt) - parseDate(b.createdAt)
      })
      .forEach((item, index) => {
        item.order = (index + 1) * ORDER_STEP
      })
  })
}

function ensureTask(input: Partial<TaskItem>, projectMap: Map<string, TaskProjectItem>, index = 0): TaskItem {
  const project = projectMap.get(normalizeText(input.projectId, 80)) || [...projectMap.values()][0]
  const statuses = project?.statuses || DEFAULT_PROJECT_STATUSES
  const fallbackStatus = statuses[0] || 'Raw'
  const normalizedStatus = normalizeText(input.status, 120)
  const status = statuses.find(item => normalizeStatusKey(item) === normalizeStatusKey(normalizedStatus)) || fallbackStatus
  const priorityRaw = normalizeStatusKey(input.priority)
  const priority: TaskPriority = priorityRaw === 'alta' || priorityRaw === 'media' || priorityRaw === 'baixa'
    ? priorityRaw
    : 'media'
  const createdAt = normalizeText(input.createdAt, 40) || nowIso()
  const updatedAt = normalizeText(input.updatedAt, 40) || createdAt

  return {
    id: normalizeText(input.id, 90) || makeId(`task-${index + 1}`),
    projectId: project?.id || '',
    title: normalizeText(input.title, 220) || 'Nova task',
    description: normalizeText(input.description, 5000),
    status,
    responsible: normalizeText(input.responsible, 120),
    clientId: Number.isFinite(Number(input.clientId)) ? Number(input.clientId) : 106,
    clientName: normalizeText(input.clientName, 140) || `Cliente #${Number(input.clientId || 106)}`,
    type: normalizeText(input.type, 120),
    priority,
    dueDate: normalizeText(input.dueDate, 40),
    archived: Boolean(input.archived),
    order: Number.isFinite(Number(input.order)) ? Number(input.order) : (index + 1) * ORDER_STEP,
    createdAt,
    updatedAt
  }
}

function buildSeedWorkspace(): TasksWorkspaceState {
  const timestamp = nowIso()
  const projectMain: TaskProjectItem = {
    id: 'project-main',
    name: 'Board Principal',
    statuses: [...DEFAULT_PROJECT_STATUSES],
    responsibles: ['Mike', 'Tony', 'Jessica', 'Dr Antonio', 'Juliana Oliveira'],
    types: ['Design', 'Video', 'Social', 'Site', 'Conteudo'],
    filters: cloneFiltersConfig(),
    cardFields: cloneCardFieldsConfig(),
    createdAt: timestamp,
    updatedAt: timestamp
  }

  const projectCampaign: TaskProjectItem = {
    id: 'project-campaign',
    name: 'Campanha Perola',
    statuses: ['Backlog', 'Em progresso', 'Revisao', 'Aprovado', 'Entrega'],
    responsibles: ['Mike', 'Tony', 'Juliana Oliveira'],
    types: ['Campanha', 'Criativo', 'Performance'],
    filters: cloneFiltersConfig(),
    cardFields: cloneCardFieldsConfig(),
    createdAt: timestamp,
    updatedAt: timestamp
  }

  const seedTasks: TaskItem[] = [
    {
      id: makeId('task'),
      projectId: projectMain.id,
      title: 'AM013 - Raphael Ghanem',
      description: '',
      status: 'Raw',
      responsible: 'Tony',
      clientId: 106,
      clientName: 'crow',
      type: 'Social',
      priority: 'media',
      dueDate: '2026-02-28',
      archived: false,
      order: 10,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: makeId('task'),
      projectId: projectMain.id,
      title: 'PJ003 Juliana',
      description: '',
      status: 'Standby',
      responsible: 'Mike',
      clientId: 101,
      clientName: 'Perola',
      type: 'Design',
      priority: 'alta',
      dueDate: '2026-02-27',
      archived: false,
      order: 10,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: makeId('task'),
      projectId: projectMain.id,
      title: 'PJ009 Colaboradores',
      description: '',
      status: 'Running',
      responsible: 'Mike',
      clientId: 101,
      clientName: 'Perola',
      type: 'Video',
      priority: 'media',
      dueDate: '2026-03-03',
      archived: false,
      order: 10,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: makeId('task'),
      projectId: projectMain.id,
      title: 'AT008 - Reels Mounjaro',
      description: '',
      status: 'Aguardando aprovacao',
      responsible: 'Dr Antonio',
      clientId: 104,
      clientName: 'Dr Antonio Tavares',
      type: 'Video',
      priority: 'alta',
      dueDate: '2026-03-04',
      archived: false,
      order: 10,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: makeId('task'),
      projectId: projectMain.id,
      title: 'AT2024 09 11 - Cirurgia',
      description: '',
      status: 'Aprovada',
      responsible: 'Mike',
      clientId: 104,
      clientName: 'Dr Antonio Tavares',
      type: 'Social',
      priority: 'media',
      dueDate: '2026-03-05',
      archived: false,
      order: 10,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: makeId('task'),
      projectId: projectMain.id,
      title: 'EVENTO - Bulova',
      description: '',
      status: 'Finalizada',
      responsible: 'Jessica',
      clientId: 105,
      clientName: 'UNO',
      type: 'Design',
      priority: 'baixa',
      dueDate: '2026-03-06',
      archived: false,
      order: 10,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: makeId('task'),
      projectId: projectCampaign.id,
      title: 'Planejar calendario de midia',
      description: 'Definir sprints e entregas da campanha.',
      status: 'Backlog',
      responsible: 'Tony',
      clientId: 101,
      clientName: 'Perola',
      type: 'Campanha',
      priority: 'media',
      dueDate: '2026-03-10',
      archived: false,
      order: 10,
      createdAt: timestamp,
      updatedAt: timestamp
    }
  ]

  return {
    activeProjectId: projectMain.id,
    projects: [projectMain, projectCampaign],
    tasks: seedTasks
  }
}

export function useTasksWorkspace() {
  const initialized = ref(false)
  const projects = ref<TaskProjectItem[]>([])
  const tasks = ref<TaskItem[]>([])
  const activeProjectId = ref('')

  function persist() {
    if (!import.meta.client || !initialized.value) return

    const payload: TasksWorkspaceState = {
      activeProjectId: activeProjectId.value,
      projects: projects.value,
      tasks: tasks.value
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }

  function hydrate() {
    const seed = buildSeedWorkspace()
    if (!import.meta.client) {
      projects.value = seed.projects
      tasks.value = seed.tasks
      activeProjectId.value = seed.activeProjectId
      return
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        projects.value = seed.projects
        tasks.value = seed.tasks
        activeProjectId.value = seed.activeProjectId
        return
      }

      const parsed = JSON.parse(raw) as Partial<TasksWorkspaceState>
      const parsedProjects = Array.isArray(parsed.projects)
        ? parsed.projects.map((item, index) => ensureProject(item, index))
        : []

      const normalizedProjects = parsedProjects.length > 0 ? parsedProjects : seed.projects
      const projectMap = new Map(normalizedProjects.map(project => [project.id, project] as const))

      const parsedTasks = Array.isArray(parsed.tasks)
        ? parsed.tasks.map((item, index) => ensureTask(item, projectMap, index))
        : []

      projects.value = normalizedProjects
      tasks.value = parsedTasks.length > 0 ? parsedTasks : seed.tasks
      activeProjectId.value = normalizeText(parsed.activeProjectId, 80) || normalizedProjects[0]?.id || seed.activeProjectId
    } catch {
      projects.value = seed.projects
      tasks.value = seed.tasks
      activeProjectId.value = seed.activeProjectId
    }
  }

  function initialize() {
    if (initialized.value) return
    hydrate()
    initialized.value = true
  }

  function setActiveProject(projectId: unknown) {
    const targetId = normalizeText(projectId, 80)
    const found = projects.value.find(project => project.id === targetId)
    if (!found) return
    activeProjectId.value = found.id
    persist()
  }

  function createProject(rawName: unknown) {
    const name = normalizeText(rawName, 140) || `Projeto ${projects.value.length + 1}`
    const timestamp = nowIso()
    const project: TaskProjectItem = {
      id: makeId('project'),
      name,
      statuses: [...DEFAULT_PROJECT_STATUSES],
      responsibles: [],
      types: [],
      filters: cloneFiltersConfig(),
      cardFields: cloneCardFieldsConfig(),
      createdAt: timestamp,
      updatedAt: timestamp
    }

    projects.value = [project, ...projects.value]
    activeProjectId.value = project.id
    persist()
    return project
  }

  function deleteProject(projectId: string) {
    const currentProjects = projects.value
    if (currentProjects.length <= 1) return false

    const targetId = normalizeText(projectId, 80)
    const exists = currentProjects.some(project => project.id === targetId)
    if (!exists) return false

    projects.value = currentProjects.filter(project => project.id !== targetId)
    tasks.value = tasks.value.filter(task => task.projectId !== targetId)

    if (activeProjectId.value === targetId) {
      activeProjectId.value = projects.value[0]?.id || ''
    }

    persist()
    return true
  }

  function saveProjectSettings(
    projectId: string,
    payload: Partial<Pick<TaskProjectItem, 'name' | 'statuses' | 'responsibles' | 'types' | 'filters' | 'cardFields'>>
  ) {
    const targetId = normalizeText(projectId, 80)
    const projectIndex = projects.value.findIndex(project => project.id === targetId)
    if (projectIndex < 0) return null

    const current = projects.value[projectIndex]!
    const previousStatuses = [...current.statuses]
    const nextStatuses = dedupeValues(payload.statuses || current.statuses)
    const safeStatuses = nextStatuses.length > 0 ? nextStatuses : [...DEFAULT_PROJECT_STATUSES]

    const nextProject: TaskProjectItem = {
      ...current,
      name: normalizeText(payload.name, 140) || current.name,
      statuses: safeStatuses,
      responsibles: dedupeValues(payload.responsibles || current.responsibles),
      types: dedupeValues(payload.types || current.types),
      filters: cloneFiltersConfig(payload.filters || current.filters),
      cardFields: cloneCardFieldsConfig(payload.cardFields || current.cardFields),
      updatedAt: nowIso()
    }

    projects.value[projectIndex] = nextProject

    const fallbackStatus = safeStatuses[0] || 'Raw'
    tasks.value = tasks.value.map((task) => {
      if (task.projectId !== targetId) return task

      const currentStatus = normalizeText(task.status, 120)
      const statusExists = safeStatuses.some(item => normalizeStatusKey(item) === normalizeStatusKey(currentStatus))
      if (statusExists) {
        return {
          ...task,
          updatedAt: nowIso()
        }
      }

      const previousIndex = previousStatuses.findIndex(item => normalizeStatusKey(item) === normalizeStatusKey(currentStatus))
      const mapped = previousIndex >= 0 && previousIndex < safeStatuses.length
        ? safeStatuses[previousIndex]!
        : fallbackStatus

      return {
        ...task,
        status: mapped,
        updatedAt: nowIso()
      }
    })

    normalizeTaskOrdersForProject(targetId, tasks.value)
    persist()
    return nextProject
  }

  function nextOrder(projectId: string, status: string) {
    const values = tasks.value
      .filter(task => task.projectId === projectId && normalizeStatusKey(task.status) === normalizeStatusKey(status))
      .map(task => Number(task.order || 0))
      .filter(value => Number.isFinite(value))

    if (values.length === 0) return ORDER_STEP
    return Math.max(...values) + ORDER_STEP
  }

  function createTask(payload: Partial<Omit<TaskItem, 'id' | 'createdAt' | 'updatedAt'>> = {}) {
    const targetProjectId = normalizeText(payload.projectId, 80) || activeProjectId.value || projects.value[0]?.id || ''
    const project = projects.value.find(item => item.id === targetProjectId)
    if (!project) return null

    const fallbackStatus = project.statuses[0] || 'Raw'
    const nextStatus = normalizeText(payload.status, 120) || fallbackStatus
    const status = project.statuses.find(item => normalizeStatusKey(item) === normalizeStatusKey(nextStatus)) || fallbackStatus
    const timestamp = nowIso()

    const task: TaskItem = {
      id: makeId('task'),
      projectId: project.id,
      title: normalizeText(payload.title, 220) || 'Nova task',
      description: normalizeText(payload.description, 5000),
      status,
      responsible: normalizeText(payload.responsible, 120),
      clientId: Number.isFinite(Number(payload.clientId)) ? Number(payload.clientId) : 106,
      clientName: normalizeText(payload.clientName, 140) || `Cliente #${Number(payload.clientId || 106)}`,
      type: normalizeText(payload.type, 120),
      priority: payload.priority || 'media',
      dueDate: normalizeText(payload.dueDate, 40),
      archived: Boolean(payload.archived),
      order: Number.isFinite(Number(payload.order))
        ? Number(payload.order)
        : nextOrder(project.id, status),
      createdAt: timestamp,
      updatedAt: timestamp
    }

    tasks.value = [...tasks.value, task]
    persist()
    return task
  }

  function updateTask(taskId: string, patch: Partial<Omit<TaskItem, 'id' | 'projectId' | 'createdAt'>>) {
    const targetId = normalizeText(taskId, 90)
    const index = tasks.value.findIndex(task => task.id === targetId)
    if (index < 0) return null

    const current = tasks.value[index]!
    const project = projects.value.find(item => item.id === current.projectId)
    const projectStatuses = project?.statuses || DEFAULT_PROJECT_STATUSES
    const fallbackStatus = projectStatuses[0] || 'Raw'
    const nextRawStatus = Object.prototype.hasOwnProperty.call(patch, 'status')
      ? normalizeText(patch.status, 120)
      : current.status
    const nextStatus = projectStatuses.find(item => normalizeStatusKey(item) === normalizeStatusKey(nextRawStatus)) || fallbackStatus
    const statusChanged = normalizeStatusKey(nextStatus) !== normalizeStatusKey(current.status)

    const next: TaskItem = {
      ...current,
      title: Object.prototype.hasOwnProperty.call(patch, 'title')
        ? normalizeText(patch.title, 220) || current.title
        : current.title,
      description: Object.prototype.hasOwnProperty.call(patch, 'description')
        ? normalizeText(patch.description, 5000)
        : current.description,
      status: nextStatus,
      responsible: Object.prototype.hasOwnProperty.call(patch, 'responsible')
        ? normalizeText(patch.responsible, 120)
        : current.responsible,
      clientId: Object.prototype.hasOwnProperty.call(patch, 'clientId')
        ? (Number.isFinite(Number(patch.clientId)) ? Number(patch.clientId) : current.clientId)
        : current.clientId,
      clientName: Object.prototype.hasOwnProperty.call(patch, 'clientName')
        ? normalizeText(patch.clientName, 140) || current.clientName
        : current.clientName,
      type: Object.prototype.hasOwnProperty.call(patch, 'type')
        ? normalizeText(patch.type, 120)
        : current.type,
      dueDate: Object.prototype.hasOwnProperty.call(patch, 'dueDate')
        ? normalizeText(patch.dueDate, 40)
        : current.dueDate,
      priority: Object.prototype.hasOwnProperty.call(patch, 'priority')
        ? (patch.priority === 'alta' || patch.priority === 'media' || patch.priority === 'baixa'
          ? patch.priority
          : current.priority)
        : current.priority,
      archived: Object.prototype.hasOwnProperty.call(patch, 'archived')
        ? Boolean(patch.archived)
        : current.archived,
      order: statusChanged
        ? nextOrder(current.projectId, nextStatus)
        : (Object.prototype.hasOwnProperty.call(patch, 'order') && Number.isFinite(Number(patch.order))
            ? Number(patch.order)
            : current.order),
      updatedAt: nowIso()
    }

    tasks.value[index] = next
    normalizeTaskOrdersForProject(current.projectId, tasks.value)
    persist()
    return next
  }

  function removeTask(taskId: string) {
    const targetId = normalizeText(taskId, 90)
    const before = tasks.value.length
    tasks.value = tasks.value.filter(task => task.id !== targetId)
    if (tasks.value.length === before) return false
    persist()
    return true
  }

  function toggleArchiveTask(taskId: string) {
    const found = tasks.value.find(task => task.id === normalizeText(taskId, 90))
    if (!found) return null
    return updateTask(found.id, { archived: !found.archived })
  }

  function moveTaskToStatus(taskId: string, status: string) {
    return updateTask(taskId, { status })
  }

  watch(
    () => [projects.value, tasks.value, activeProjectId.value],
    () => {
      persist()
    },
    { deep: true }
  )

  return {
    initialized,
    projects,
    tasks,
    activeProjectId,
    initialize,
    setActiveProject,
    createProject,
    deleteProject,
    saveProjectSettings,
    createTask,
    updateTask,
    removeTask,
    toggleArchiveTask,
    moveTaskToStatus
  }
}
