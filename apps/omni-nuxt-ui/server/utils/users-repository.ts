export type ServerUserLevel = 'admin' | 'manager' | 'marketing' | 'finance'
export type ServerUserStatus = 'active' | 'inactive'
export type ServerUserType = 'client' | 'admin'

export interface ServerUser {
  id: number
  level: ServerUserLevel
  clientId: number | null
  name: string
  nick: string
  email: string
  password: string
  phone: string
  status: ServerUserStatus
  profileImage: string
  lastLogin: string
  createdAt: string
  userType: ServerUserType
  preferences: string
}

export interface UsersListMeta {
  page: number
  limit: number
  total: number
  totalPages: number
  hasMore: boolean
}

export interface UserListOptions {
  page: number
  limit: number
  q?: string
  viewerUserType?: 'admin' | 'client'
  viewerClientId?: number
}

export interface UserCreateInput {
  name?: string
  nick?: string
  email?: string
  password?: string
  phone?: string
  clientId?: number | string | null
  level?: string
  userType?: string
}

export interface UserAccessOptions {
  viewerUserType?: 'admin' | 'client'
  viewerClientId?: number
}

const globalKey = '__omni_users_repo__'

interface RepositoryState {
  users: ServerUser[]
  nextId: number
}

function nowIso() {
  return new Date().toISOString()
}

function normalizeShortText(value: unknown, max = 255) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function normalizeEmail(value: unknown) {
  return normalizeShortText(value, 255).toLowerCase()
}

function normalizeLevel(value: unknown): ServerUserLevel {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'admin' || normalized === 'manager' || normalized === 'marketing' || normalized === 'finance') {
    return normalized
  }

  return 'marketing'
}

function normalizeUserType(value: unknown): ServerUserType {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === 'admin' ? 'admin' : 'client'
}

function normalizeStatus(value: unknown): ServerUserStatus {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === 'active' ? 'active' : 'inactive'
}

function normalizeClientId(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }

  return parsed
}

function normalizeViewerClientId(value: unknown) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0
  }

  return parsed
}

function canAccessUser(user: ServerUser, options?: UserAccessOptions) {
  const viewerType = String(options?.viewerUserType ?? 'admin').trim().toLowerCase()
  if (viewerType !== 'client') {
    return true
  }

  const viewerClientId = normalizeViewerClientId(options?.viewerClientId)
  if (viewerClientId <= 0) {
    return false
  }

  return Number(user.clientId ?? 0) === viewerClientId
}

function toDto(user: ServerUser) {
  return {
    id: user.id,
    level: user.level,
    clientId: user.clientId,
    name: user.name,
    nick: user.nick,
    email: user.email,
    password: '********',
    phone: user.phone,
    status: user.status,
    profileImage: user.profileImage,
    lastLogin: user.lastLogin,
    createdAt: user.createdAt,
    userType: user.userType,
    preferences: user.preferences
  }
}

function seedUsers(): ServerUser[] {
  return [
    {
      id: 42,
      level: 'admin',
      clientId: null,
      name: 'Mike Crow',
      nick: 'mike',
      email: 'mike@crow.com',
      password: 'Admin@123',
      phone: '(85) 99999-1001',
      status: 'active',
      profileImage: '',
      lastLogin: '2026-02-15T01:40:00.000Z',
      createdAt: '2025-10-01T09:00:00.000Z',
      userType: 'admin',
      preferences: '{"theme":"custom","columns":"compact"}'
    },
    {
      id: 43,
      level: 'manager',
      clientId: 105,
      name: 'Jessica Perola',
      nick: 'jessica',
      email: 'jessica@perola.com',
      password: 'Perola@123',
      phone: '(11) 98888-2002',
      status: 'active',
      profileImage: '',
      lastLogin: '2026-02-14T22:17:00.000Z',
      createdAt: '2025-12-10T12:20:00.000Z',
      userType: 'client',
      preferences: '{"notifications":true}'
    },
    {
      id: 44,
      level: 'marketing',
      clientId: 105,
      name: 'Candidato Teste',
      nick: 'cand_teste',
      email: 'candidato.teste@perola.com',
      password: 'Cadastro@123',
      phone: '(11) 97777-3003',
      status: 'inactive',
      profileImage: '',
      lastLogin: '',
      createdAt: '2026-02-15T00:30:00.000Z',
      userType: 'client',
      preferences: ''
    },
    {
      id: 45,
      level: 'finance',
      clientId: 104,
      name: 'Antonio Finance',
      nick: 'antonio_fin',
      email: 'antonio.finance@tavares.com',
      password: 'Finance@123',
      phone: '(85) 96666-4554',
      status: 'active',
      profileImage: '',
      lastLogin: '2026-02-14T18:11:00.000Z',
      createdAt: '2025-11-20T14:50:00.000Z',
      userType: 'client',
      preferences: '{"currency":"BRL"}'
    }
  ]
}

function getState(): RepositoryState {
  const globalRef = globalThis as typeof globalThis & { [globalKey]?: RepositoryState }
  if (!globalRef[globalKey]) {
    const seeded = seedUsers().sort((a, b) => b.id - a.id)
    globalRef[globalKey] = {
      users: seeded,
      nextId: Math.max(...seeded.map(item => item.id)) + 1
    }
  }

  return globalRef[globalKey] as RepositoryState
}

export function listUsers(options: UserListOptions) {
  const state = getState()
  const page = Number.isFinite(options.page) && options.page > 0 ? options.page : 1
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? Math.min(options.limit, 100) : 30
  const q = String(options.q ?? '').trim().toLowerCase()

  const filtered = state.users.filter((user) => {
    if (!canAccessUser(user, options)) {
      return false
    }

    if (!q) {
      return true
    }

    const haystack = [
      user.name,
      user.nick,
      user.email,
      user.phone,
      user.level,
      user.userType,
      user.status,
      String(user.clientId ?? ''),
      user.preferences
    ].join(' ').toLowerCase()

    return haystack.includes(q)
  })

  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * limit
  const items = filtered.slice(start, start + limit).map(toDto)

  return {
    items,
    meta: {
      page: safePage,
      limit,
      total,
      totalPages,
      hasMore: safePage < totalPages
    } satisfies UsersListMeta
  }
}

export function createUser(input: UserCreateInput = {}, options?: UserAccessOptions) {
  const state = getState()
  const id = state.nextId++

  const viewerType = String(options?.viewerUserType ?? 'admin').trim().toLowerCase()
  const viewerClientId = normalizeViewerClientId(options?.viewerClientId)
  const requestedClientId = normalizeClientId(input.clientId)
  const resolvedClientId = viewerType === 'client'
    ? (viewerClientId > 0 ? viewerClientId : null)
    : requestedClientId

  const normalizedLevel = normalizeLevel(input.level)
  const normalizedUserType = normalizeUserType(input.userType)

  const created: ServerUser = {
    id,
    level: viewerType === 'client' && normalizedLevel === 'admin' ? 'marketing' : normalizedLevel,
    clientId: resolvedClientId,
    name: normalizeShortText(input.name, 255) || `Novo usuario ${id}`,
    nick: normalizeShortText(input.nick, 50) || `user_${id}`,
    email: normalizeEmail(input.email) || `novo.${id}@mail.com`,
    password: normalizeShortText(input.password, 255) || 'Senha@123',
    phone: normalizeShortText(input.phone, 20),
    status: 'inactive',
    profileImage: '',
    lastLogin: '',
    createdAt: nowIso(),
    userType: viewerType === 'client' ? 'client' : normalizedUserType,
    preferences: ''
  }

  state.users.unshift(created)
  return toDto(created)
}

export function updateUserField(id: number, field: string, value: unknown, options?: UserAccessOptions) {
  const state = getState()
  const target = state.users.find(user => user.id === id)
  if (!target) {
    return null
  }
  if (!canAccessUser(target, options)) {
    return null
  }

  const viewerType = String(options?.viewerUserType ?? 'admin').trim().toLowerCase()
  const viewerClientId = normalizeViewerClientId(options?.viewerClientId)

  if (field === 'level') {
    const nextLevel = normalizeLevel(value)
    target.level = viewerType === 'client' && nextLevel === 'admin' ? 'marketing' : nextLevel
  }

  if (field === 'clientId') {
    if (viewerType === 'client') {
      target.clientId = viewerClientId > 0 ? viewerClientId : target.clientId
    } else {
      target.clientId = normalizeClientId(value)
    }
  }

  if (field === 'name') {
    target.name = normalizeShortText(value, 255)
  }

  if (field === 'nick') {
    target.nick = normalizeShortText(value, 50)
  }

  if (field === 'email') {
    target.email = normalizeEmail(value)
  }

  if (field === 'password') {
    target.password = normalizeShortText(value, 255)
  }

  if (field === 'phone') {
    target.phone = normalizeShortText(value, 20)
  }

  if (field === 'status') {
    target.status = normalizeStatus(value)
  }

  if (field === 'profileImage') {
    target.profileImage = normalizeShortText(value, 255)
  }

  if (field === 'lastLogin') {
    target.lastLogin = normalizeShortText(value, 40)
  }

  if (field === 'createdAt') {
    target.createdAt = normalizeShortText(value, 40)
  }

  if (field === 'userType') {
    target.userType = viewerType === 'client' ? 'client' : normalizeUserType(value)
  }

  if (field === 'preferences') {
    target.preferences = String(value ?? '').trim().slice(0, 4000)
  }

  return toDto(target)
}

export function approveUserLogin(id: number, options?: UserAccessOptions) {
  const state = getState()
  const target = state.users.find(user => user.id === id)
  if (!target) {
    return null
  }
  if (!canAccessUser(target, options)) {
    return null
  }

  target.status = 'active'
  target.lastLogin = nowIso()
  return toDto(target)
}

export function deleteUserById(id: number, options?: UserAccessOptions) {
  const state = getState()
  const index = state.users.findIndex(user => user.id === id)
  if (index < 0) {
    return false
  }

  const target = state.users[index]
  if (!target) {
    return false
  }
  if (!canAccessUser(target, options)) {
    return false
  }

  state.users.splice(index, 1)
  return true
}

export function listUserLevels() {
  return ['admin', 'manager', 'marketing', 'finance'] as const
}

export function listUserTypes() {
  return ['client', 'admin'] as const
}
