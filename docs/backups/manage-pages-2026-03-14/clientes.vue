<script setup lang="ts">
import ClientsContactPopover from '~/components/manager/clients/ClientsContactPopover.vue'
import ClientsStoresPopover from '~/components/manager/clients/ClientsStoresPopover.vue'
import ClientsWebhookPopover from '~/components/manager/clients/ClientsWebhookPopover.vue'
import OmniCollectionFilters from '~/components/omni/filters/OmniCollectionFilters.vue'
import OmniDataTable from '~/components/omni/table/OmniDataTable.vue'
import OmniMinimalPopover from '~/components/omni/overlay/OmniMinimalPopover.vue'
import type { ClientFieldKey, ClientItem, ClientStoreCharge } from '~/types/clients'
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
  clients,
  loading,
  creating,
  deletingId,
  errorMessage,
  savingMap,
  fetchClients,
  updateField,
  saveContactAndLogo,
  saveWebhookEnabled,
  rotateWebhookKey,
  saveStores,
  createClient,
  deleteClient
} = useClientsManager()
const sessionSimulation = useSessionSimulationStore()

const selectedIds = ref<Array<string | number>>([])
const focusCell = ref<OmniFocusCell | null>(null)
const canCreateClient = computed(() => sessionSimulation.isAdmin)
const canDeleteClient = computed(() => sessionSimulation.isAdmin)

const filtersState = ref<Record<string, unknown>>({
  query: '',
  statusFilter: '',
  billingModeFilter: ''
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
    key: 'billingModeFilter',
    label: 'Modo cobranca',
    type: 'select',
    placeholder: 'Modo cobranca',
    options: [
      { label: 'Unico', value: 'single' },
      { label: 'Por loja', value: 'per_store' }
    ],
    accessor: row => row.billingMode
  }
])

const allTableColumns = computed<OmniTableColumn[]>(() => [
  {
    key: 'name',
    label: 'Nome',
    type: 'text',
    editable: true,
    minWidth: 220,
    focusOnCreate: true
  },
  {
    key: 'status',
    label: 'Ativo',
    type: 'switch',
    editable: true,
    switchOnValue: 'active',
    switchOffValue: 'inactive',
    minWidth: 110
  },
  {
    key: 'userCount',
    label: 'Qtd usuarios',
    type: 'number',
    editable: true,
    minWidth: 140
  },
  {
    key: 'userNicks',
    label: 'Nicks usuarios',
    type: 'text',
    editable: true,
    minWidth: 220
  },
  {
    key: 'projectCount',
    label: 'Qtd projetos',
    type: 'number',
    editable: true,
    minWidth: 140
  },
  {
    key: 'projectSegments',
    label: 'Segmentos',
    type: 'text',
    editable: true,
    minWidth: 220
  },
  {
    key: 'billingMode',
    label: 'Modo cobranca',
    type: 'select',
    editable: true,
    minWidth: 180,
    immediate: true,
    options: [
      { label: 'Unico', value: 'single' },
      { label: 'Por loja', value: 'per_store' }
    ]
  },
  {
    key: 'monthlyPaymentAmount',
    label: 'Valor mensal',
    type: 'money',
    editable: true,
    minWidth: 170
  },
  {
    key: 'paymentDueDay',
    label: 'Dia pagamento',
    type: 'number',
    editable: true,
    minWidth: 130
  },
  {
    key: 'actions',
    label: 'Opcoes',
    type: 'custom',
    minWidth: 220,
    align: 'center'
  }
])

const columnExcludeKeys = ['actions']
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
  const rows = clients.value as unknown as Array<Record<string, unknown>>
  return applyOmniFilters(rows, filtersState.value, filterDefinitions.value)
})

const updatableFields = new Set<ClientFieldKey>([
  'name',
  'status',
  'userCount',
  'userNicks',
  'projectCount',
  'projectSegments',
  'billingMode',
  'monthlyPaymentAmount',
  'paymentDueDay',
  'logo',
  'webhookEnabled',
  'contactPhone',
  'contactSite',
  'contactAddress'
])

function toClient(row: Record<string, unknown>) {
  return row as unknown as ClientItem
}

function rowIdValue(row: Record<string, unknown>) {
  const raw = row.id
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

function onCellUpdate(payload: OmniTableCellUpdate) {
  const field = String(payload.key) as ClientFieldKey
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

async function onCreateClient() {
  if (!canCreateClient.value) {
    return
  }

  const createdId = await createClient()
  if (!createdId) {
    return
  }

  focusCell.value = {
    rowId: createdId,
    columnKey: 'name',
    token: Date.now()
  }
}

function onResetFilters() {
  filtersState.value = {
    query: '',
    statusFilter: '',
    billingModeFilter: ''
  }
}

async function onDeleteClient(id: number) {
  if (!canDeleteClient.value) {
    return
  }

  if (import.meta.client) {
    const confirmed = window.confirm('Excluir este cliente? Esta acao nao pode ser desfeita.')
    if (!confirmed) {
      return
    }
  }

  await deleteClient(id)
}

onMounted(() => {
  void fetchClients()
})
</script>

<template>
  <section class="space-y-4">
    <AdminPageHeader
      eyebrow="Manager"
      title="Clientes"
      description="Tabela generica reutilizavel com filtros desacoplados, selecao em massa e CRUD em modo teste."
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
          icon="i-lucide-plus"
          label="Novo cliente"
          color="primary"
          :loading="creating"
          :disabled="creating || !canCreateClient"
          @click="onCreateClient"
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
      empty-text="Nenhum cliente encontrado com os filtros atuais."
      @update:cell="onCellUpdate"
    >
      <template #cell-actions="{ row }">
        <div class="flex items-center justify-end gap-1">
          <ClientsContactPopover
            :client="toClient(row)"
            :busy="Boolean(savingMap[`${rowIdValue(row)}:logo`]) || Boolean(savingMap[`${rowIdValue(row)}:contactPhone`]) || Boolean(savingMap[`${rowIdValue(row)}:contactSite`]) || Boolean(savingMap[`${rowIdValue(row)}:contactAddress`])"
            @save="saveContactAndLogo(rowIdValue(row), $event)"
          />

          <ClientsWebhookPopover
            :client="toClient(row)"
            :busy="Boolean(savingMap[`${rowIdValue(row)}:webhookEnabled`])"
            @toggle-enabled="saveWebhookEnabled(rowIdValue(row), $event)"
            @rotate-key="rotateWebhookKey(rowIdValue(row))"
          />

          <ClientsStoresPopover
            v-if="toClient(row).billingMode === 'per_store'"
            :stores="toClient(row).stores"
            :busy="Boolean(savingMap[`${rowIdValue(row)}:stores`])"
            @save="saveStores(rowIdValue(row), $event as ClientStoreCharge[])"
          />

          <OmniMinimalPopover title="Informacoes do cliente" width-class="w-[280px] max-w-[90vw]">
            <template #trigger>
              <UButton icon="i-lucide-info" color="neutral" variant="ghost" size="sm" aria-label="Info" />
            </template>

            <div class="manage-clients__info-popover space-y-1 text-xs">
              <p><strong>ID:</strong> {{ toClient(row).id }}</p>
              <p><strong>Nome:</strong> {{ toClient(row).name }}</p>
              <p><strong>Status:</strong> {{ toClient(row).status }}</p>
              <p><strong>Webhook:</strong> {{ toClient(row).webhookEnabled ? 'Ligado' : 'Desligado' }}</p>
              <p><strong>Chave:</strong> {{ toClient(row).webhookKey || '-' }}</p>
              <p><strong>Telefone:</strong> {{ toClient(row).contactPhone || '-' }}</p>
              <p><strong>Site:</strong> {{ toClient(row).contactSite || '-' }}</p>
              <p><strong>Endereco:</strong> {{ toClient(row).contactAddress || '-' }}</p>
            </div>
          </OmniMinimalPopover>

          <UButton
            v-if="canDeleteClient"
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            size="sm"
            aria-label="Excluir"
            :loading="deletingId === rowIdValue(row)"
            @click="onDeleteClient(rowIdValue(row))"
          />
        </div>
      </template>
    </OmniDataTable>
  </section>
</template>
