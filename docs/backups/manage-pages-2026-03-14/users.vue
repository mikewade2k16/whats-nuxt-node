<script setup lang="ts">
import OmniCollectionFilters from '~/components/omni/filters/OmniCollectionFilters.vue'
import OmniDataTable from '~/components/omni/table/OmniDataTable.vue'
import type { UserFieldKey, UserItem } from '~/types/users'
import type {
  OmniFilterDefinition,
  OmniFocusCell,
  OmniTableCellUpdate,
  OmniTableColumn
} from '~/types/omni/collection'

definePageMeta({
  layout: 'admin',
  middleware: ['admin-only-client']
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

const selectedIds = ref<Array<string | number>>([])
const focusCell = ref<OmniFocusCell | null>(null)

const createModalOpen = ref(false)
const createForm = reactive({
  name: '',
  nick: '',
  email: '',
  password: '',
  phone: '',
  clientId: '' as string | number,
  level: 'marketing',
  userType: 'client'
})

const filtersState = ref<Record<string, unknown>>({
  query: '',
  statusFilter: '',
  levelFilter: ''
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
      { label: 'manager', value: 'manager' },
      { label: 'marketing', value: 'marketing' },
      { label: 'finance', value: 'finance' }
    ],
    accessor: row => row.level
  }
])

const clientSelectOptions = computed(() => [
  { label: 'Sem cliente', value: 0 },
  ...clientOptions.value
])

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
    immediate: true,
    minWidth: 130,
    options: [
      { label: 'admin', value: 'admin' },
      { label: 'manager', value: 'manager' },
      { label: 'marketing', value: 'marketing' },
      { label: 'finance', value: 'finance' }
    ]
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
    label: 'Preferences',
    type: 'text',
    editable: true,
    minWidth: 210
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
const visibleColumnKeys = ref<string[]>([])

watch(
  () => allTableColumns.value,
  (columns) => {
    const allowedKeys = columns
      .filter(column => !columnExcludeKeys.includes(column.key))
      .map(column => column.key)

    if (visibleColumnKeys.value.length === 0) {
      visibleColumnKeys.value = [...allowedKeys]
      return
    }

    const sanitized = visibleColumnKeys.value.filter(key => allowedKeys.includes(key))
    visibleColumnKeys.value = sanitized.length > 0 ? sanitized : [...allowedKeys]
  },
  { immediate: true }
)

const tableColumns = computed(() => {
  const visibleSet = new Set(visibleColumnKeys.value)
  return allTableColumns.value.filter(column => alwaysVisibleColumnKeys.has(column.key) || visibleSet.has(column.key))
})

const filteredRows = computed(() => {
  const rows = users.value as unknown as Array<Record<string, unknown>>
  return applyOmniFilters(rows, filtersState.value, filterDefinitions.value)
})

const updatableFields = new Set<UserFieldKey>([
  'level',
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

function resetCreateForm() {
  createForm.name = ''
  createForm.nick = ''
  createForm.email = ''
  createForm.password = ''
  createForm.phone = ''
  createForm.clientId = ''
  createForm.level = 'marketing'
  createForm.userType = 'client'
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
    userType: createForm.userType
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
    levelFilter: ''
  }
}

async function onDeleteUser(id: number) {
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
      v-model="selectedIds"
      :rows="filteredRows"
      :columns="tableColumns"
      row-key="id"
      :loading="loading"
      :focus-cell="focusCell"
      empty-text="Nenhum usuario encontrado com os filtros atuais."
      @update:cell="onCellUpdate"
    >
      <template #cell-actions="{ row }">
        <div class="flex items-center justify-end gap-1">
          <UButton
            v-if="toUser(row).status === 'inactive'"
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
                <p><strong>Name:</strong> {{ toUser(row).name }}</p>
                <p><strong>Nick:</strong> {{ toUser(row).nick }}</p>
                <p><strong>Email:</strong> {{ toUser(row).email }}</p>
                <p><strong>Status:</strong> {{ toUser(row).status }}</p>
                <p><strong>Level:</strong> {{ toUser(row).level }}</p>
                <p><strong>Last login:</strong> {{ toUser(row).lastLogin || '-' }}</p>
                <p><strong>Created at:</strong> {{ toUser(row).createdAt }}</p>
              </div>
            </template>
          </UPopover>

          <UButton
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
              :items="[
                { label: 'admin', value: 'admin' },
                { label: 'manager', value: 'manager' },
                { label: 'marketing', value: 'marketing' },
                { label: 'finance', value: 'finance' }
              ]"
            />
          </div>

          <div class="space-y-1">
            <p class="text-xs text-[rgb(var(--muted))]">User type</p>
            <USelect
              v-model="createForm.userType"
              :items="[
                { label: 'client', value: 'client' },
                { label: 'admin', value: 'admin' }
              ]"
            />
          </div>

          <div class="space-y-1 sm:col-span-2">
            <p class="text-xs text-[rgb(var(--muted))]">Cliente vinculado</p>
            <USelect v-model="createForm.clientId" :items="clientSelectOptions" placeholder="Sem cliente" />
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton label="Cancelar" color="neutral" variant="ghost" @click="createModalOpen = false" />
          <UButton label="Criar usuario" color="primary" :loading="creating" :disabled="creating" @click="submitCreateUser" />
        </div>
      </template>
    </UModal>
  </section>
</template>
