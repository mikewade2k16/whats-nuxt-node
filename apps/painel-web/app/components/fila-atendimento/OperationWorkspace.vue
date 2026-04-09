<script setup lang="ts">
import { computed } from 'vue'
import type {
  FilaAtendimentoConsultantView,
  FilaAtendimentoOperationOverview,
  FilaAtendimentoOperationOverviewPerson,
  FilaAtendimentoOperationState,
  FilaAtendimentoPausedEmployee,
  FilaAtendimentoStoreContext
} from '~/types/fila-atendimento'
import OperationCampaignBrief from '~/components/fila-atendimento/OperationCampaignBrief.vue'
import OperationConsultantStrip from '~/components/fila-atendimento/OperationConsultantStrip.vue'
import OperationFinishModal from '~/components/fila-atendimento/OperationFinishModal.vue'
import OperationQueueColumns from '~/components/fila-atendimento/OperationQueueColumns.vue'
import OperationScopeBar from '~/components/fila-atendimento/OperationScopeBar.vue'

const props = withDefaults(defineProps<{
  state: FilaAtendimentoOperationState
  overview?: FilaAtendimentoOperationOverview | null
  scopeMode?: string
  canSeeIntegrated?: boolean
  canOperate?: boolean
  stores?: FilaAtendimentoStoreContext[]
  integratedStoreId?: string
}>(), {
  overview: null,
  scopeMode: 'single',
  canSeeIntegrated: false,
  canOperate: false,
  stores: () => [],
  integratedStoreId: ''
})

const emit = defineEmits<{
  'scope-change': [scope: string]
  'active-store-change': [storeId: string]
  'integrated-store-change': [storeId: string]
}>()

const showIntegratedView = computed(() => props.canSeeIntegrated && props.scopeMode === 'all')

function shouldIncludeStore(storeId: string) {
  const filterStoreId = String(props.integratedStoreId || '').trim()
  return !showIntegratedView.value || !filterStoreId || String(storeId || '').trim() === filterStoreId
}

function mapIntegratedWaitingItem(person: FilaAtendimentoOperationOverviewPerson) {
  return {
    id: String(person?.personId || '').trim(),
    storeId: String(person?.storeId || '').trim(),
    storeName: String(person?.storeName || '').trim(),
    storeCode: String(person?.storeCode || '').trim(),
    name: String(person?.name || '').trim(),
    role: String(person?.role || '').trim(),
    initials: String(person?.initials || '').trim(),
    color: String(person?.color || '').trim(),
    monthlyGoal: Math.max(0, Number(person?.monthlyGoal || 0) || 0),
    commissionRate: Math.max(0, Number(person?.commissionRate || 0) || 0),
    queueJoinedAt: Number(person?.queueJoinedAt || 0) || 0
  }
}

function mapIntegratedActiveItem(person: FilaAtendimentoOperationOverviewPerson) {
  return {
    id: String(person?.personId || '').trim(),
    storeId: String(person?.storeId || '').trim(),
    storeName: String(person?.storeName || '').trim(),
    storeCode: String(person?.storeCode || '').trim(),
    name: String(person?.name || '').trim(),
    role: String(person?.role || '').trim(),
    initials: String(person?.initials || '').trim(),
    color: String(person?.color || '').trim(),
    monthlyGoal: Math.max(0, Number(person?.monthlyGoal || 0) || 0),
    commissionRate: Math.max(0, Number(person?.commissionRate || 0) || 0),
    serviceId: String(person?.serviceId || '').trim(),
    serviceStartedAt: Number(person?.serviceStartedAt || 0) || 0,
    queueJoinedAt: Number(person?.queueJoinedAt || 0) || 0,
    queueWaitMs: Number(person?.queueWaitMs || 0) || 0,
    queuePositionAtStart: Math.max(1, Number(person?.queuePosition || 1) || 1),
    startMode: String(person?.startMode || 'queue').trim() || 'queue',
    skippedPeople: []
  }
}

function mapIntegratedPausedItem(person: FilaAtendimentoOperationOverviewPerson): FilaAtendimentoPausedEmployee {
  return {
    personId: String(person?.personId || '').trim(),
    storeId: String(person?.storeId || '').trim(),
    storeName: String(person?.storeName || '').trim(),
    storeCode: String(person?.storeCode || '').trim(),
    reason: String(person?.pauseReason || '').trim(),
    kind: String(person?.pauseKind || 'pause').trim() || 'pause',
    startedAt: Number(person?.statusStartedAt || 0) || 0
  }
}

function upsertRosterPerson(rosterMap: Map<string, FilaAtendimentoConsultantView>, person: FilaAtendimentoOperationOverviewPerson) {
  const id = String(person?.personId || '').trim()
  if (!id) {
    return
  }

  rosterMap.set(id, {
    id,
    storeId: String(person?.storeId || '').trim(),
    storeName: String(person?.storeName || '').trim(),
    storeCode: String(person?.storeCode || '').trim(),
    name: String(person?.name || '').trim(),
    role: String(person?.role || '').trim(),
    initials: String(person?.initials || '').trim(),
    color: String(person?.color || '').trim(),
    monthlyGoal: Math.max(0, Number(person?.monthlyGoal || 0) || 0),
    commissionRate: Math.max(0, Number(person?.commissionRate || 0) || 0),
    conversionGoal: 0,
    avgTicketGoal: 0,
    paGoal: 0,
    active: true,
    access: null
  })
}

const displayState = computed(() => {
  if (!showIntegratedView.value || !props.overview) {
    return props.state
  }

  const waitingSource = (Array.isArray(props.overview.waitingList) ? props.overview.waitingList : []).filter((person) =>
    shouldIncludeStore(person?.storeId || '')
  )
  const activeSource = (Array.isArray(props.overview.activeServices) ? props.overview.activeServices : []).filter((person) =>
    shouldIncludeStore(person?.storeId || '')
  )
  const pausedSource = (Array.isArray(props.overview.pausedEmployees) ? props.overview.pausedEmployees : []).filter((person) =>
    shouldIncludeStore(person?.storeId || '')
  )
  const availableSource = (Array.isArray(props.overview.availableConsultants) ? props.overview.availableConsultants : []).filter((person) =>
    shouldIncludeStore(person?.storeId || '')
  )

  const rosterMap = new Map<string, FilaAtendimentoConsultantView>()
  waitingSource.forEach((person) => upsertRosterPerson(rosterMap, person))
  activeSource.forEach((person) => upsertRosterPerson(rosterMap, person))
  pausedSource.forEach((person) => upsertRosterPerson(rosterMap, person))
  availableSource.forEach((person) => upsertRosterPerson(rosterMap, person))

  const roster = Array.from(rosterMap.values()).sort((left, right) => {
    const leftStore = `${left.storeName}-${left.name}`.toLowerCase()
    const rightStore = `${right.storeName}-${right.name}`.toLowerCase()
    return leftStore.localeCompare(rightStore, 'pt-BR')
  })

  return {
    ...props.state,
    waitingList: waitingSource.map(mapIntegratedWaitingItem),
    activeServices: activeSource.map(mapIntegratedActiveItem),
    pausedEmployees: pausedSource.map(mapIntegratedPausedItem),
    roster
  }
})
</script>

<template>
  <OperationScopeBar
    :can-see-integrated="canSeeIntegrated"
    :scope-mode="scopeMode"
    :stores="stores"
    :active-store-id="state.activeStoreId"
    :integrated-store-id="integratedStoreId"
    @scope-change="emit('scope-change', $event)"
    @active-store-change="emit('active-store-change', $event)"
    @integrated-store-change="emit('integrated-store-change', $event)"
  />

  <OperationCampaignBrief :state="state" />

  <div v-if="!canOperate" class="insight-card">
    <p class="settings-card__text">Este acesso da loja pode acompanhar a lista da vez em tempo real, mas nao altera fila, pausas ou encerramentos.</p>
  </div>

  <OperationQueueColumns
    :state="displayState"
    :read-only="!canOperate"
    :integrated-mode="showIntegratedView"
  />

  <OperationConsultantStrip
    v-if="canOperate"
    :state="displayState"
    :integrated-mode="showIntegratedView"
  />

  <OperationFinishModal :state="state" />
</template>