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
import OperationConsultantStrip from '~/components/fila-atendimento/OperationConsultantStrip.vue'
import OperationFinishModal from '~/components/fila-atendimento/OperationFinishModal.vue'
import OperationQueueColumns from '~/components/fila-atendimento/OperationQueueColumns.vue'

const props = withDefaults(defineProps<{
  state: FilaAtendimentoOperationState
  overview?: FilaAtendimentoOperationOverview | null
  scopeMode?: string
  canSeeIntegrated?: boolean
  canOperate?: boolean
  busy?: boolean
  stores?: FilaAtendimentoStoreContext[]
  integratedStoreId?: string
}>(), {
  overview: null,
  scopeMode: 'single',
  canSeeIntegrated: false,
  canOperate: false,
  busy: false,
  stores: () => [],
  integratedStoreId: ''
})

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
    avatarUrl: String(person?.avatarUrl || '').trim(),
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
    avatarUrl: String(person?.avatarUrl || '').trim(),
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
    avatarUrl: String(person?.avatarUrl || '').trim(),
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
  <div class="operation-workspace">
    <div v-if="!canOperate" class="insight-card operation-workspace__hint">
      <p class="settings-card__text">Este acesso da loja pode acompanhar a lista da vez em tempo real, mas nao altera fila, pausas ou encerramentos.</p>
    </div>

    <OperationQueueColumns
      class="operation-workspace__board"
      :state="displayState"
      :read-only="!canOperate"
      :integrated-mode="showIntegratedView"
      :busy="busy"
    />

    <OperationConsultantStrip
      v-if="canOperate"
      :state="displayState"
      :integrated-mode="showIntegratedView"
      :busy="busy"
    />

    <OperationFinishModal :state="state" :busy="busy" />
  </div>
</template>

<style scoped>
.operation-workspace {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  gap: 0.65rem;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.operation-workspace__hint {
  padding: 0.75rem 0.9rem;
}

:deep(.operation-workspace__board) {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

:deep(.employee-strip) {
  flex: 0 0 auto;
}
</style>
