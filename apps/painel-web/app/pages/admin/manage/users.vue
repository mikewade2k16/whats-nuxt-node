<script setup lang="ts">
import OmniCollectionFilters from '~/components/omni/filters/OmniCollectionFilters.vue'
import OmniDataTable from '~/components/omni/table/OmniDataTable.vue'
import { listAdminFeatures, mergeAdminAccessPreferences, parseAdminPreferences, type AdminFeatureCode } from '~/utils/admin-access'
import type { UserFieldKey, UserItem } from '~/types/users'
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
  users,
  clientOptions,
  loading,
  creating,
  deletingId,
  errorMessage,
  savingMap,
  fetchAll,
  updateField,
  approveLogin,
  createUser,
  deleteUser
} = useUsersManager()
const sessionSimulation = useSessionSimulationStore()
const { user: coreUser } = useCoreAuth()

const selectedIds = ref<Array<string | number>>([])
const focusCell = ref<OmniFocusCell | null>(null)
const permissionDenied = computed(() => errorMessage.value.toLowerCase().includes('nao tem permissao'))
const viewerUserType = computed<'admin' | 'client'>(() => {
  return Boolean(coreUser.value?.isPlatformAdmin) && sessionSimulation.effectiveUserType === 'admin'
    ? 'admin'
    : 'client'
})
const canChooseClient = computed(() => viewerUserType.value === 'admin')
const canEditPlatformUsers = computed(() => sessionSimulation.canSimulate)

type AccessDraftState = 'default' | 'allow' | 'deny'
const ACCESS_DRAFT_STATE_OPTIONS = [
  { label: 'Padrao', value: 'default' },
  { label: 'Allow', value: 'allow' },
  { label: 'Deny', value: 'deny' }
] satisfies Array<{ label: string, value: AccessDraftState }>

const accessModalOpen = ref(false)
const accessDraftUserId = ref<number | null>(null)
const accessDraftUserLabel = ref('')
const accessDraftFeatureStates = reactive<Record<string, AccessDraftState>>({})
const accessFeatures = listAdminFeatures().filter(feature => !['dashboard', 'profile', 'settings'].includes(feature.code))

const createModalOpen = ref(false)
const createForm = reactive({
  name: '',
  nick: '',
  email: '',
  password: '',
  phone: '',
  clientId: '' as string | number,
  level: 'marketing',
  userType: 'client',
  businessRole: 'marketing',
  storeId: 'all',
  registrationNumber: '',
  isPlatformAdmin: false
})

const filtersState = ref<Record<string, unknown>>({
  query: '',
  statusFilter: '',
  levelFilter: '',
  clientFilter: ''
})

const filterDefinitions = computed<OmniFilterDefinition[]>(() => [
  {
    key: 'query',
    label: 'Buscar',
    type: 'text',
    placeholder: 'Pesquisar por texto...',
    mode: 'all'
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
    accessor: row => row.status
  },
  {
    key: 'levelFilter',
    label: 'Level',
    type: 'select',
    placeholder: 'Level',
    options: [
      { label: 'admin', value: 'admin' },
      { label: 'consultant', value: 'consultant' },
      { label: 'manager', value: 'manager' },
      { label: 'marketing', value: 'marketing' },
      { label: 'finance', value: 'finance' },
      { label: 'viewer', value: 'viewer' }
    ],
    accessor: row => row.level
  },
  {
    key: 'clientFilter',
    label: 'Cliente',
    adminOnly: true,
    type: 'select',
    placeholder: 'Cliente',
    options: [
      { label: 'Sem cliente', value: 'none' },
      ...clientOptions.value.map(option => ({
        label: option.label,
        value: String(option.value)
      }))
    ],
    customPredicate: (row, rawValue) => {
      const selected = String(rawValue ?? '').trim()
      if (!selected) {
        return true
      }

      const currentClientId = (row as Record<string, unknown>).clientId
      if (selected === 'none') {
        const parsed = Number(currentClientId ?? 0)
        return !Number.isFinite(parsed) || parsed <= 0
      }

      return String(currentClientId ?? '') === selected
    }
  }
])

const clientSelectOptions = computed(() => [
  { label: 'Sem cliente', value: 0 },
  ...clientOptions.value
])

const clientAssignOptions = computed(() => [
  ...clientOptions.value
])

const BUSINESS_ROLE_OPTIONS = [
  { label: 'Consultor', value: 'consultant' },
  { label: 'Gerente de loja', value: 'store_manager' },
  { label: 'Marketing', value: 'marketing' },
  { label: 'Financeiro', value: 'finance' },
  { label: 'Gerente geral', value: 'general_manager' },
  { label: 'Owner', value: 'owner' },
  { label: 'Visualizador', value: 'viewer' },
  { label: 'Admin do sistema', value: 'system_admin' }
]
const businessRoleSelectOptions = computed(() => {
  if (canChooseClient.value) {
    return BUSINESS_ROLE_OPTIONS
  }

  return BUSINESS_ROLE_OPTIONS.filter(option => option.value !== 'system_admin')
})

function normalizeClientOptionId(value: unknown) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0
  }
  return parsed
}

function normalizeStoreValue(value: unknown) {
  const normalized = String(value ?? '').trim()
  if (!normalized || normalized === '0' || normalized.toLowerCase() === 'all' || normalized.toLowerCase() === 'todas') {
    return null
  }
  return normalized
}

function normalizeBusinessRoleValue(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return BUSINESS_ROLE_OPTIONS.some(option => option.value === normalized) ? normalized : 'marketing'
}

function isStoreScopedRole(value: unknown) {
  const normalized = normalizeBusinessRoleValue(value)
  return normalized === 'consultant' || normalized === 'store_manager'
}

function requiresRegistrationRole(value: unknown) {
  const normalized = normalizeBusinessRoleValue(value)
  return normalized === 'consultant' || normalized === 'store_manager' || normalized === 'general_manager'
}

function businessRoleLabel(value: unknown) {
  const normalized = normalizeBusinessRoleValue(value)
  return BUSINESS_ROLE_OPTIONS.find(option => option.value === normalized)?.label || 'Marketing'
}

function findClientOption(clientId: unknown) {
  const normalizedClientId = normalizeClientOptionId(clientId)
  return clientOptions.value.find(option => normalizeClientOptionId(option.value) === normalizedClientId)
}

function clientRequiresStoreAssignment(clientId: unknown, businessRole: unknown) {
  const clientOption = findClientOption(clientId)
  const storeCount = Math.max(
    Number(clientOption?.storesCount || 0),
    Array.isArray(clientOption?.stores) ? clientOption.stores.length : 0
  )

  return isStoreScopedRole(businessRole)
    && Boolean(clientOption?.requireUserStoreLink ?? true)
    && storeCount > 1
}

function clientRequiresRegistration(clientId: unknown, businessRole: unknown) {
  const clientOption = findClientOption(clientId)
  return requiresRegistrationRole(businessRole) && Boolean(clientOption?.requireUserRegistration ?? true)
}

const allStoreAssignOptions = computed(() => {
  const dedupe = new Set<string>()
  const options = [{ label: 'Todas as lojas', value: 'all' }]

  for (const clientOption of clientOptions.value) {
    const clientLabel = String(clientOption.label ?? '').trim()
    for (const store of clientOption.stores || []) {
      const storeId = String(store.id ?? '').trim()
      if (!storeId || dedupe.has(storeId)) {
        continue
      }

      dedupe.add(storeId)
      options.push({
        label: clientLabel ? `${clientLabel} / ${store.name}` : String(store.name ?? '').trim(),
        value: storeId
      })
    }
  }

  return options
})

const selectedCreateClientOption = computed(() => findClientOption(createForm.clientId))
const createStoreOptions = computed(() => [
  { label: 'Todas as lojas', value: 'all' },
  ...((selectedCreateClientOption.value?.stores || []).map(store => ({
    label: store.name,
    value: store.id
  })))
])
const createStoreRequired = computed(() => {
  if (createForm.isPlatformAdmin) {
    return false
  }
  return clientRequiresStoreAssignment(createForm.clientId, createForm.businessRole)
})
const createRegistrationRequired = computed(() => {
  if (createForm.isPlatformAdmin) {
    return false
  }
  return clientRequiresRegistration(createForm.clientId, createForm.businessRole)
})
const createSubmitDisabled = computed(() => {
  if (creating.value) {
    return true
  }

  if (createStoreRequired.value && !normalizeStoreValue(createForm.storeId)) {
    return true
  }

  if (createRegistrationRequired.value && !String(createForm.registrationNumber ?? '').trim()) {
    return true
  }

  return false
})

function clientLabelForRow(row: Record<string, unknown>) {
  const user = row as UserItem
  const fallbackName = String(user.clientName ?? '').trim()
  if (fallbackName) {
    return fallbackName
  }

  const currentClientId = Number(user.clientId ?? 0)
  if (!Number.isFinite(currentClientId) || currentClientId <= 0) {
    return 'Sem cliente'
  }

  const matched = clientOptions.value.find(option => Number(option.value) === currentClientId)
  return matched?.label || String(currentClientId)
}

function storeLabelForRow(row: Record<string, unknown>) {
  const user = row as UserItem
  const normalizedStoreId = normalizeStoreValue(user.storeId)
  if (!normalizedStoreId) {
    return 'Todas as lojas'
  }

  if (String(user.storeName ?? '').trim()) {
    return String(user.storeName ?? '').trim()
  }

  const matched = (findClientOption(user.clientId)?.stores || []).find(store => store.id === normalizedStoreId)
  return matched?.name || normalizedStoreId
}

function isPlatformAdminRow(row: Record<string, unknown>) {
  return Boolean((row as UserItem).isPlatformAdmin)
}

function hasClientAssignment(row: Record<string, unknown>) {
  const parsedClientId = Number((row as UserItem).clientId ?? 0)
  return Number.isFinite(parsedClientId) && parsedClientId > 0
}

function canEditTenantScopedFields(row: Record<string, unknown>) {
  if (isPlatformAdminRow(row)) {
    return canEditPlatformUsers.value
  }

  return hasClientAssignment(row)
}

function canEditClientAssignment(row: Record<string, unknown>) {
  if (isPlatformAdminRow(row)) {
    return false
  }

  return canChooseClient.value
}

function canEditStatus(row: Record<string, unknown>) {
  if (isPlatformAdminRow(row)) {
    return false
  }

  return hasClientAssignment(row)
}

function canApproveUser(row: Record<string, unknown>) {
  const user = row as UserItem
  if (user.isPlatformAdmin || user.status !== 'inactive') {
    return false
  }

  if (!hasClientAssignment(row)) {
    return false
  }

  if (clientRequiresStoreAssignment(user.clientId, user.businessRole) && !normalizeStoreValue(user.storeId)) {
    return false
  }

  if (clientRequiresRegistration(user.clientId, user.businessRole) && !String(user.registrationNumber ?? '').trim()) {
    return false
  }

  return true
}

function clientHasAtendimentoModule(row: Record<string, unknown>) {
  const user = row as UserItem
  const currentClientId = Number(user.clientId ?? 0)
  if (!Number.isFinite(currentClientId) || currentClientId <= 0) {
    return false
  }

  const matched = clientOptions.value.find(option => Number(option.value) === currentClientId)
  const moduleCodes = Array.isArray((matched as { moduleCodes?: string[] } | undefined)?.moduleCodes)
    ? ((matched as { moduleCodes?: string[] }).moduleCodes || [])
    : []

  return moduleCodes.includes('atendimento')
}

function canEditAtendimentoAccess(row: Record<string, unknown>) {
  if (isPlatformAdminRow(row)) {
    return false
  }

  return canEditTenantScopedFields(row) && clientHasAtendimentoModule(row)
}

function canEditStoreAssignment(row: Record<string, unknown>) {
  if (isPlatformAdminRow(row)) {
    return false
  }

  return canEditTenantScopedFields(row)
}

function canEditRegistrationNumber(row: Record<string, unknown>) {
  if (isPlatformAdminRow(row)) {
    return false
  }

  return canEditTenantScopedFields(row)
}

function accessSummary(row: Record<string, unknown>) {
  const user = row as UserItem
  const parsed = parseAdminPreferences(user.preferences)
  const allowCount = parsed.adminAccess.allowFeatures.length
  const denyCount = parsed.adminAccess.denyFeatures.length
  if (allowCount < 1 && denyCount < 1) {
    return 'Padrao'
  }
  return `Allow ${allowCount} / Deny ${denyCount}`
}

function atendimentoSummary(row: Record<string, unknown>) {
  const user = row as UserItem
  return user.atendimentoAccess ? 'Liberado' : 'Sem acesso'
}

const allTableColumns = computed<OmniTableColumn[]>(() => [
  {
    key: 'id',
    label: 'ID',
    type: 'number',
    editable: false,
    minWidth: 90
  },
  {
    key: 'name',
    label: 'Nome',
    type: 'text',
    editable: true,
    minWidth: 180,
    focusOnCreate: true
  },
  {
    key: 'nick',
    label: 'Nick',
    type: 'text',
    editable: true,
    minWidth: 150
  },
  {
    key: 'email',
    label: 'Email',
    type: 'text',
    editable: true,
    minWidth: 210
  },
  {
    key: 'phone',
    label: 'Phone',
    type: 'text',
    editable: true,
    minWidth: 140
  },
  {
    key: 'status',
    label: 'Status',
    type: 'switch',
    editable: true,
    editableWhen: row => canEditStatus(row),
    immediate: true,
    switchOnValue: 'active',
    switchOffValue: 'inactive',
    minWidth: 110
  },
  {
    key: 'level',
    label: 'Level',
    type: 'select',
    editable: true,
    editableWhen: row => canEditTenantScopedFields(row),
    immediate: true,
    minWidth: 130,
    options: [
      { label: 'admin', value: 'admin' },
      { label: 'consultant', value: 'consultant' },
      { label: 'manager', value: 'manager' },
      { label: 'marketing', value: 'marketing' },
      { label: 'finance', value: 'finance' },
      { label: 'viewer', value: 'viewer' }
    ]
  },
  {
    key: 'businessRole',
    label: 'Papel',
    type: 'select',
    editable: true,
    editableWhen: row => canEditTenantScopedFields(row),
    immediate: true,
    minWidth: 180,
    options: businessRoleSelectOptions.value,
    formatter: (value) => businessRoleLabel(value)
  },
  {
    key: 'clientId',
    label: 'Cliente',
    adminOnly: true,
    type: 'select',
    editable: true,
    editableWhen: row => canEditClientAssignment(row),
    immediate: true,
    minWidth: 170,
    options: clientAssignOptions.value,
    formatter: (_value, row) => clientLabelForRow(row)
  },
  {
    key: 'storeId',
    label: 'Loja',
    type: 'select',
    editable: true,
    editableWhen: row => canEditStoreAssignment(row),
    immediate: true,
    minWidth: 220,
    options: allStoreAssignOptions.value,
    formatter: (_value, row) => storeLabelForRow(row)
  },
  {
    key: 'registrationNumber',
    label: 'Matricula',
    type: 'text',
    editable: true,
    editableWhen: row => canEditRegistrationNumber(row),
    minWidth: 150
  },
  {
    key: 'atendimentoAccess',
    label: 'Atendimento',
    type: 'switch',
    editable: true,
    editableWhen: row => canEditAtendimentoAccess(row),
    immediate: true,
    minWidth: 140,
    formatter: (_value, row) => atendimentoSummary(row)
  },
  {
    key: 'profileImage',
    label: 'Profile image',
    type: 'text',
    editable: true,
    minWidth: 180
  },
  {
    key: 'lastLogin',
    label: 'Last login',
    type: 'text',
    editable: false,
    minWidth: 180
  },
  {
    key: 'createdAt',
    label: 'Created at',
    type: 'text',
    editable: false,
    minWidth: 180
  },
  {
    key: 'preferences',
    label: 'Acessos',
    type: 'text',
    editable: false,
    minWidth: 180,
    formatter: (_value, row) => accessSummary(row)
  },
  {
    key: 'actions',
    label: 'Opcoes',
    type: 'custom',
    minWidth: 180,
    align: 'center'
  }
])

const columnExcludeKeys = ['id', 'actions']
const alwaysVisibleColumnKeys = new Set(['actions'])
const { visibleColumnKeys, tableColumns } = useOmniVisibleColumns({
  preferenceKey: 'admin.manage.users',
  allColumns: allTableColumns,
  columnExcludeKeys,
  alwaysVisibleColumnKeys
})

const filteredRows = computed(() => {
  const rows = users.value as unknown as Array<Record<string, unknown>>
  return applyOmniFilters(rows, filtersState.value, filterDefinitions.value)
})

const tableRows = computed(() => {
  const seen = new Set<number>()
  return filteredRows.value.filter((row) => {
    const parsedId = Number((row as Record<string, unknown>).id)
    if (!Number.isFinite(parsedId) || parsedId <= 0) {
      return false
    }

    if (seen.has(parsedId)) {
      return false
    }

    seen.add(parsedId)
    return true
  })
})

const updatableFields = new Set<UserFieldKey>([
  'clientId',
  'atendimentoAccess',
  'level',
  'businessRole',
  'storeId',
  'registrationNumber',
  'name',
  'nick',
  'email',
  'phone',
  'status',
  'profileImage',
  'lastLogin',
  'createdAt',
  'preferences'
])

const passwordCharsets = {
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  lower: 'abcdefghijkmnopqrstuvwxyz',
  number: '23456789',
  symbol: '!@#$%*-_'
}

function toUser(row: Record<string, unknown>) {
  return row as unknown as UserItem
}

function rowIdValue(row: Record<string, unknown>) {
  const raw = row.id
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

function randomIndex(max: number) {
  if (max <= 0) return 0

  if (import.meta.client && globalThis.crypto?.getRandomValues) {
    const bytes = new Uint32Array(1)
    globalThis.crypto.getRandomValues(bytes)
    const seed = bytes[0] ?? 0
    return seed % max
  }

  return Math.floor(Math.random() * max)
}

function pickRandom(charset: string) {
  return charset[randomIndex(charset.length)] ?? ''
}

function generateRandomPassword(length = 12) {
  const pools = [
    passwordCharsets.upper,
    passwordCharsets.lower,
    passwordCharsets.number,
    passwordCharsets.symbol
  ]

  const required = pools.map(pickRandom)
  const allChars = pools.join('')
  const targetLength = Math.max(length, required.length)
  const output = [...required]

  while (output.length < targetLength) {
    output.push(pickRandom(allChars))
  }

  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1)
    const current = output[index] ?? ''
    output[index] = output[swapIndex] ?? ''
    output[swapIndex] = current
  }

  return output.join('')
}

function fillGeneratedPassword() {
  createForm.password = generateRandomPassword(12)
}

async function copyGeneratedPassword() {
  const value = String(createForm.password ?? '').trim()
  if (!value || !import.meta.client || !navigator.clipboard?.writeText) {
    return
  }

  try {
    await navigator.clipboard.writeText(value)
  } catch {
    // no-op
  }
}

function applyCreateRoleDefaults(role: string) {
  const normalizedRole = normalizeBusinessRoleValue(role)

  switch (normalizedRole) {
    case 'consultant':
      createForm.level = 'consultant'
      createForm.userType = 'client'
      break
    case 'store_manager':
    case 'general_manager':
      createForm.level = 'manager'
      createForm.userType = 'client'
      break
    case 'finance':
      createForm.level = 'finance'
      createForm.userType = 'client'
      break
    case 'owner':
      createForm.level = 'admin'
      createForm.userType = 'admin'
      break
    case 'viewer':
      createForm.level = 'viewer'
      createForm.userType = 'client'
      break
    case 'system_admin':
      createForm.level = 'admin'
      createForm.userType = 'admin'
      createForm.isPlatformAdmin = true
      createForm.clientId = ''
      createForm.storeId = 'all'
      break
    default:
      createForm.level = 'marketing'
      createForm.userType = 'client'
  }
}

function resetCreateForm() {
  createForm.name = ''
  createForm.nick = ''
  createForm.email = ''
  createForm.password = ''
  createForm.phone = ''
  createForm.clientId = canChooseClient.value ? '' : sessionSimulation.clientId
  createForm.level = 'marketing'
  createForm.userType = canChooseClient.value ? 'client' : 'client'
  createForm.businessRole = canChooseClient.value ? 'marketing' : 'marketing'
  createForm.storeId = 'all'
  createForm.registrationNumber = ''
  createForm.isPlatformAdmin = false
}

function resetAccessDraftStates() {
  for (const feature of accessFeatures) {
    accessDraftFeatureStates[feature.code] = 'default'
  }
}

function openAccessModalForRow(row: Record<string, unknown>) {
  const user = toUser(row)
  accessDraftUserId.value = rowIdValue(row)
  accessDraftUserLabel.value = user.nick || user.name || user.email
  resetAccessDraftStates()

  const parsed = parseAdminPreferences(user.preferences)
  parsed.adminAccess.allowFeatures.forEach((featureCode) => {
    accessDraftFeatureStates[featureCode] = 'allow'
  })
  parsed.adminAccess.denyFeatures.forEach((featureCode) => {
    accessDraftFeatureStates[featureCode] = 'deny'
  })

  accessModalOpen.value = true
}

async function saveAccessOverrides() {
  const targetId = Number(accessDraftUserId.value ?? 0)
  if (!Number.isFinite(targetId) || targetId <= 0) {
    accessModalOpen.value = false
    return
  }

  const current = users.value.find(item => item.id === targetId)
  if (!current) {
    accessModalOpen.value = false
    return
  }

  const allowFeatures = accessFeatures
    .filter(feature => accessDraftFeatureStates[feature.code] === 'allow')
    .map(feature => feature.code as AdminFeatureCode)

  const denyFeatures = accessFeatures
    .filter(feature => accessDraftFeatureStates[feature.code] === 'deny')
    .map(feature => feature.code as AdminFeatureCode)

  const nextPreferences = mergeAdminAccessPreferences(current.preferences, {
    allowFeatures,
    denyFeatures
  })

  updateField(targetId, 'preferences', nextPreferences, { immediate: true })
  accessModalOpen.value = false
}

function openCreateModal() {
  resetCreateForm()
  fillGeneratedPassword()
  createModalOpen.value = true
}

async function submitCreateUser() {
  const createdId = await createUser({
    name: createForm.name,
    nick: createForm.nick,
    email: createForm.email,
    password: createForm.password,
    phone: createForm.phone,
    clientId: createForm.clientId === '' ? null : Number(createForm.clientId),
    level: createForm.level,
    userType: createForm.userType,
    businessRole: createForm.businessRole,
    storeId: normalizeStoreValue(createForm.storeId),
    registrationNumber: createForm.registrationNumber,
    isPlatformAdmin: createForm.isPlatformAdmin
  })

  if (!createdId) {
    return
  }

  createModalOpen.value = false

  focusCell.value = {
    rowId: createdId,
    columnKey: 'name',
    token: Date.now()
  }
}

function onCellUpdate(payload: OmniTableCellUpdate) {
  const field = String(payload.key) as UserFieldKey
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

function onResetFilters() {
  filtersState.value = {
    query: '',
    statusFilter: '',
    levelFilter: '',
    clientFilter: ''
  }
}

watch(
  () => createForm.isPlatformAdmin,
  (isPlatformAdmin) => {
    if (isPlatformAdmin) {
      createForm.businessRole = 'system_admin'
      createForm.level = 'admin'
      createForm.userType = 'admin'
      createForm.clientId = ''
      createForm.storeId = 'all'
      return
    }

    if (createForm.businessRole === 'system_admin') {
      createForm.businessRole = canChooseClient.value ? 'owner' : 'marketing'
    }
  }
)

watch(
  () => createForm.businessRole,
  (nextRole) => {
    applyCreateRoleDefaults(nextRole)

    if (!isStoreScopedRole(nextRole)) {
      createForm.storeId = 'all'
    }
  }
)

watch(
  () => createForm.clientId,
  () => {
    const normalizedStoreId = normalizeStoreValue(createForm.storeId)
    const availableStores = selectedCreateClientOption.value?.stores || []
    if (!normalizedStoreId) {
      return
    }

    const stillExists = availableStores.some(store => store.id === normalizedStoreId)
    if (!stillExists) {
      createForm.storeId = 'all'
    }
  }
)

watch(
  () => viewerUserType.value,
  (nextType) => {
    if (nextType === 'client') {
      filtersState.value.clientFilter = ''
    }
  },
  { immediate: true }
)

async function onDeleteUser(id: number) {
  const target = users.value.find(user => user.id === id)
  if (target?.isPlatformAdmin) {
    return
  }

  if (import.meta.client) {
    const confirmed = window.confirm('Excluir este usuario? Esta acao nao pode ser desfeita.')
    if (!confirmed) {
      return
    }
  }

  await deleteUser(id)
}

onMounted(() => {
  void fetchAll()
})
</script>

<template>
  <section class="space-y-4">
    <AdminPageHeader
      eyebrow="Manager"
      title="Users"
      description="Gestao de usuarios com aprovacao de login, nivel, tipo e cliente vinculado em modo teste."
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
          icon="i-lucide-user-plus"
          label="Novo cadastro"
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
      v-if="!permissionDenied"
      v-model="selectedIds"
      :rows="tableRows"
      :columns="tableColumns"
      :viewer-user-type="viewerUserType"
      row-key="id"
      :loading="loading"
      :focus-cell="focusCell"
      empty-text="Nenhum usuario encontrado com os filtros atuais."
      @update:cell="onCellUpdate"
    >
      <template #cell-actions="{ row }">
        <div class="flex items-center justify-end gap-1">
          <UButton
            v-if="canApproveUser(row)"
            icon="i-lucide-check-check"
            color="success"
            variant="ghost"
            size="sm"
            aria-label="Aprovar login"
            :loading="Boolean(savingMap[`${rowIdValue(row)}:approve`])"
            @click="approveLogin(rowIdValue(row))"
          />

          <UPopover :content="{ align: 'end', side: 'bottom' }">
            <UButton icon="i-lucide-info" color="neutral" variant="ghost" size="sm" aria-label="Info" />
            <template #content>
              <div class="w-[290px] space-y-1 p-3 text-xs">
                <p><strong>ID:</strong> {{ toUser(row).id }}</p>
                <p><strong>Nome:</strong> {{ toUser(row).name }}</p>
                <p><strong>Nick:</strong> {{ toUser(row).nick }}</p>
                <p><strong>Email:</strong> {{ toUser(row).email }}</p>
                <p><strong>Status:</strong> {{ toUser(row).status }}</p>
                <p><strong>Level:</strong> {{ toUser(row).level }}</p>
                <p><strong>Papel:</strong> {{ businessRoleLabel(toUser(row).businessRole) }}</p>
                <p><strong>Loja:</strong> {{ storeLabelForRow(row) }}</p>
                <p><strong>Matricula:</strong> {{ toUser(row).registrationNumber || '-' }}</p>
                <p><strong>Platform admin:</strong> {{ toUser(row).isPlatformAdmin ? 'sim' : 'nao' }}</p>
                <p><strong>Cliente:</strong> {{ clientLabelForRow(row) }}</p>
                <p><strong>Atendimento:</strong> {{ toUser(row).atendimentoAccess ? 'liberado' : 'sem acesso' }}</p>
                <p><strong>Acessos:</strong> {{ accessSummary(row) }}</p>
                <p><strong>Last login:</strong> {{ toUser(row).lastLogin || '-' }}</p>
                <p><strong>Created at:</strong> {{ toUser(row).createdAt }}</p>
              </div>
            </template>
          </UPopover>

          <UButton
            icon="i-lucide-shield"
            color="neutral"
            variant="ghost"
            size="sm"
            aria-label="Acessos"
            @click="openAccessModalForRow(row)"
          />

          <UButton
            v-if="!toUser(row).isPlatformAdmin"
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            size="sm"
            aria-label="Excluir"
            :loading="deletingId === rowIdValue(row)"
            @click="onDeleteUser(rowIdValue(row))"
          />
        </div>
      </template>
    </OmniDataTable>

    <UModal v-model:open="createModalOpen" title="Novo cadastro de usuario" description="Fluxo de cadastro para teste." :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="space-y-1">
            <p class="text-xs text-[rgb(var(--muted))]">Nome</p>
            <UInput v-model="createForm.name" placeholder="Nome completo" />
          </div>

          <div class="space-y-1">
            <p class="text-xs text-[rgb(var(--muted))]">Nick</p>
            <UInput v-model="createForm.nick" placeholder="apelido" />
          </div>

          <div class="space-y-1 sm:col-span-2">
            <p class="text-xs text-[rgb(var(--muted))]">Email</p>
            <UInput v-model="createForm.email" placeholder="email@dominio.com" />
          </div>

          <div class="space-y-1">
            <p class="text-xs text-[rgb(var(--muted))]">Senha</p>
            <UInput v-model="createForm.password" type="text" placeholder="Senha inicial" />
            <div class="flex items-center gap-2">
              <UButton
                icon="i-lucide-key-round"
                label="Gerar senha"
                color="neutral"
                variant="soft"
                size="xs"
                @click="fillGeneratedPassword"
              />
              <UButton
                icon="i-lucide-copy"
                label="Copiar"
                color="neutral"
                variant="ghost"
                size="xs"
                :disabled="!createForm.password"
                @click="copyGeneratedPassword"
              />
            </div>
          </div>

          <div class="space-y-1">
            <p class="text-xs text-[rgb(var(--muted))]">Phone</p>
            <UInput v-model="createForm.phone" placeholder="(00) 00000-0000" />
          </div>

          <div class="space-y-1">
            <p class="text-xs text-[rgb(var(--muted))]">Level</p>
            <USelect
              v-model="createForm.level"
              :disabled="createForm.isPlatformAdmin"
              :items="[
                { label: 'admin', value: 'admin' },
                { label: 'consultant', value: 'consultant' },
                { label: 'manager', value: 'manager' },
                { label: 'marketing', value: 'marketing' },
                { label: 'finance', value: 'finance' },
                { label: 'viewer', value: 'viewer' }
              ]"
            />
          </div>

          <div class="space-y-1">
            <p class="text-xs text-[rgb(var(--muted))]">Papel operacional</p>
            <USelect
              v-model="createForm.businessRole"
              :disabled="createForm.isPlatformAdmin"
              :items="businessRoleSelectOptions"
            />
          </div>

          <div v-if="canChooseClient" class="space-y-2 sm:col-span-2">
            <div class="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-2">
              <div class="space-y-1">
                <p class="text-sm font-medium text-[rgb(var(--text))]">Platform admin</p>
                <p class="text-xs text-[rgb(var(--muted))]">Acesso root/global com troca de tenant e permissoes amplas.</p>
              </div>
              <USwitch v-model="createForm.isPlatformAdmin" />
            </div>
          </div>

          <div v-if="canChooseClient" class="space-y-1">
            <p class="text-xs text-[rgb(var(--muted))]">User type</p>
            <USelect
              v-model="createForm.userType"
              :disabled="createForm.isPlatformAdmin || createForm.businessRole === 'owner'"
              :items="[
                { label: 'client', value: 'client' },
                { label: 'admin', value: 'admin' }
              ]"
            />
          </div>

          <div v-if="canChooseClient && !createForm.isPlatformAdmin" class="space-y-1 sm:col-span-2">
            <p class="text-xs text-[rgb(var(--muted))]">Cliente vinculado</p>
            <USelect v-model="createForm.clientId" :items="clientSelectOptions" placeholder="Sem cliente" />
          </div>

          <div v-else-if="canChooseClient" class="space-y-1 sm:col-span-2">
            <p class="text-xs text-[rgb(var(--muted))]">Escopo</p>
            <UInput model-value="Root / Global" disabled />
          </div>

          <div v-else class="space-y-1 sm:col-span-2">
            <p class="text-xs text-[rgb(var(--muted))]">Cliente vinculado</p>
            <UInput :model-value="sessionSimulation.activeClientLabel" disabled />
          </div>

          <div class="space-y-1 sm:col-span-2">
            <p class="text-xs text-[rgb(var(--muted))]">Loja vinculada</p>
            <USelect
              v-model="createForm.storeId"
              :disabled="createForm.isPlatformAdmin || !isStoreScopedRole(createForm.businessRole) || createStoreOptions.length <= 1"
              :items="createStoreOptions"
              placeholder="Todas as lojas"
            />
            <p v-if="createStoreRequired" class="text-xs text-amber-700">
              Este cliente exige loja para consultor e gerente de loja.
            </p>
          </div>

          <div class="space-y-1 sm:col-span-2">
            <p class="text-xs text-[rgb(var(--muted))]">Matricula</p>
            <UInput
              v-model="createForm.registrationNumber"
              :disabled="createForm.isPlatformAdmin"
              placeholder="Codigo interno da pessoa"
            />
            <p v-if="createRegistrationRequired" class="text-xs text-amber-700">
              Este cliente exige matricula para consultor, gerente de loja e gerente geral.
            </p>
          </div>

          <UAlert
            v-if="canChooseClient && !createForm.isPlatformAdmin && !normalizeClientOptionId(createForm.clientId)"
            class="sm:col-span-2"
            color="neutral"
            variant="soft"
            icon="i-lucide-info"
            title="Defina o cliente"
            description="Sem cliente vinculado o cadastro nasce pendente; papel, loja e matricula passam a valer quando o cliente for definido."
          />
        </div>
      </template>

      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton label="Cancelar" color="neutral" variant="ghost" @click="createModalOpen = false" />
          <UButton label="Criar usuario" color="primary" :loading="creating" :disabled="createSubmitDisabled" @click="submitCreateUser" />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="accessModalOpen"
      title="Acesso por usuario"
      :description="`Overrides de paginas/modulos para ${accessDraftUserLabel || 'usuario selecionado'}.`"
      :ui="{ content: 'max-w-3xl' }"
    >
      <template #body>
        <div class="space-y-4">
          <UAlert
            color="neutral"
            variant="soft"
            icon="i-lucide-shield"
            title="Precedencia"
            description="Deny do usuario prevalece sobre allow. O restante continua no padrao por level + modulo."
          />

          <div class="grid gap-3 sm:grid-cols-2">
            <div
              v-for="feature in accessFeatures"
              :key="feature.code"
              class="rounded-[var(--radius-sm)] border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-3"
            >
              <div class="space-y-1">
                <p class="text-sm font-semibold text-[rgb(var(--text))]">{{ feature.label }}</p>
                <p class="text-xs text-[rgb(var(--muted))]">{{ feature.description }}</p>
              </div>

              <div class="mt-3">
                <USelect
                  v-model="accessDraftFeatureStates[feature.code]"
                  :items="ACCESS_DRAFT_STATE_OPTIONS"
                />
              </div>
            </div>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton label="Cancelar" color="neutral" variant="ghost" @click="accessModalOpen = false" />
          <UButton label="Salvar acessos" color="primary" @click="saveAccessOverrides" />
        </div>
      </template>
    </UModal>
  </section>
</template>
