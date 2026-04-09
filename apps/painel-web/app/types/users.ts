export type UserLevel = 'admin' | 'manager' | 'marketing' | 'finance' | 'viewer'
export type UserStatus = 'active' | 'inactive'
export type UserType = 'client' | 'admin'

export type UserFieldKey =
  | 'level'
  | 'clientId'
  | 'atendimentoAccess'
  | 'name'
  | 'nick'
  | 'email'
  | 'password'
  | 'phone'
  | 'status'
  | 'profileImage'
  | 'lastLogin'
  | 'createdAt'
  | 'userType'
  | 'preferences'

export interface UserItem {
  id: number
  isPlatformAdmin: boolean
  level: UserLevel
  clientId: number | null
  clientName: string
  name: string
  nick: string
  email: string
  password: string
  phone: string
  status: UserStatus
  profileImage: string
  lastLogin: string
  createdAt: string
  userType: UserType
  preferences: string
  moduleCodes?: string[]
  atendimentoAccess: boolean
}

export interface UsersListMeta {
  page: number
  limit: number
  total: number
  totalPages: number
  hasMore: boolean
}

export interface UsersListResponse {
  status: 'success'
  data: UserItem[]
  meta: UsersListMeta
}

export interface UserMutationResponse {
  status: 'success'
  data: UserItem
}

export interface SimpleSelectOption {
  label: string
  value: number | string
  moduleCodes?: string[]
}
