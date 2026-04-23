export type UserLevel = 'admin' | 'consultant' | 'manager' | 'marketing' | 'finance' | 'viewer'
export type UserStatus = 'active' | 'inactive'
export type UserType = 'client' | 'admin'
export type UserBusinessRole =
  | 'consultant'
  | 'store_manager'
  | 'marketing'
  | 'finance'
  | 'general_manager'
  | 'owner'
  | 'viewer'
  | 'system_admin'

export type UserFieldKey =
  | 'level'
  | 'coreTenantId'
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
  | 'businessRole'
  | 'storeId'
  | 'registrationNumber'
  | 'preferences'

export interface UserItem {
  id: string
  coreUserId: string
  coreTenantId: string | null
  isPlatformAdmin: boolean
  level: UserLevel
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
  businessRole: UserBusinessRole
  storeId: string | null
  storeName: string
  registrationNumber: string
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
  coreTenantId?: string
  moduleCodes?: string[]
  stores?: Array<{
    id: string
    name: string
  }>
  requireUserStoreLink?: boolean
  requireUserRegistration?: boolean
  storesCount?: number
}
