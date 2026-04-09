export type TaskPriority = 'baixa' | 'media' | 'alta'

export interface TaskProjectFiltersConfig {
  search: boolean
  responsible: boolean
  client: boolean
  type: boolean
  hideArchived: boolean
}

export interface TaskProjectCardFieldsConfig {
  responsible: boolean
  client: boolean
  type: boolean
  dueDate: boolean
  priority: boolean
}

export interface TaskProjectItem {
  id: string
  name: string
  statuses: string[]
  responsibles: string[]
  types: string[]
  filters: TaskProjectFiltersConfig
  cardFields: TaskProjectCardFieldsConfig
  createdAt: string
  updatedAt: string
}

export interface TaskItem {
  id: string
  projectId: string
  title: string
  description: string
  status: string
  responsible: string
  clientId: number
  clientName: string
  type: string
  priority: TaskPriority
  dueDate: string
  archived: boolean
  order: number
  createdAt: string
  updatedAt: string
}

export interface TasksWorkspaceState {
  activeProjectId: string
  projects: TaskProjectItem[]
  tasks: TaskItem[]
}
