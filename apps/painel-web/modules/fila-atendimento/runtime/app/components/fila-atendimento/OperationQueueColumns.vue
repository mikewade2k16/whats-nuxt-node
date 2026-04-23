<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { FilaAtendimentoActiveService, FilaAtendimentoOperationState, FilaAtendimentoQueueEntry } from '~/types/fila-atendimento'
import OperationActiveServiceCard from '~/components/fila-atendimento/OperationActiveServiceCard.vue'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'
import { useUiStore } from '~/stores/ui'

const props = withDefaults(defineProps<{
  state: FilaAtendimentoOperationState
  readOnly?: boolean
  integratedMode?: boolean
  busy?: boolean
}>(), {
  readOnly: false,
  integratedMode: false,
  busy: false
})

const operationsStore = useFilaAtendimentoOperationsStore()
const ui = useUiStore()
const now = ref(0)
const isClockReady = ref(false)
let timerId: number | null = null

const waitingList = computed(() => props.state.waitingList || [])
const activeServices = computed(() => props.state.activeServices || [])
const maxConcurrentServices = computed(() => props.state.settings?.maxConcurrentServices || 10)
const isLimitReached = computed(() => activeServices.value.length >= maxConcurrentServices.value)

function actionHint(index: number) {
  const skippedCount = index
  return `Passa na frente de ${skippedCount} ${skippedCount === 1 ? 'pessoa' : 'pessoas'}`
}

async function handleStartFirst() {
  const result = await operationsStore.startService()

  if (result?.ok === false) {
    ui.error(result.message || 'Nao foi possivel iniciar o atendimento.')
  }
}

async function handleStartSpecific(personId: string) {
  const result = await operationsStore.startService(personId)

  if (result?.ok === false) {
    ui.error(result.message || 'Nao foi possivel iniciar o atendimento.')
  }
}

async function handleAssignTask(person: FilaAtendimentoQueueEntry) {
  const { confirmed, value } = await ui.prompt({
    title: 'Direcionar para tarefa',
    message: `Registre a tarefa ou reuniao para ${person.name}${person.storeName ? ` em ${person.storeName}` : ''}.`,
    inputLabel: 'Motivo',
    inputPlaceholder: 'Ex.: reuniao, apoio no caixa, estoque, suporte',
    confirmLabel: 'Tirar da fila',
    required: true
  })

  if (!confirmed || !value) {
    return
  }

  const result = await operationsStore.assignTask(person.id, value, props.integratedMode ? person.storeId || '' : '')

  if (result?.ok === false) {
    ui.error(result.message || 'Nao foi possivel tirar da fila.')
    return
  }

  ui.success('Consultor direcionado para tarefa.')
}

function handleFinish(personId: string) {
  void operationsStore.openFinishModal(personId)
}

onMounted(() => {
  now.value = Date.now()
  isClockReady.value = true
  timerId = window.setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (timerId) {
    window.clearInterval(timerId)
  }
})
</script>

<template>
  <div class="operation-queue-columns">
    <div class="queue-grid" data-testid="operation-board">
      <section class="queue-column" data-testid="operation-waiting-column">
        <header class="queue-column__header">Lista da vez</header>
        <div v-if="waitingList.length > 0 && !readOnly && !integratedMode" class="queue-column__action-bar">
          <button
            class="column-action column-action--primary"
            type="button"
            :disabled="isLimitReached || busy"
            data-testid="operation-start-first"
            @click="handleStartFirst"
          >
            {{ busy ? 'Processando...' : isLimitReached ? `Limite de ${maxConcurrentServices} atendimentos ativos` : 'Atender primeiro da fila' }}
          </button>
        </div>

        <div class="queue-column__body queue-column__body--waiting">
          <template v-if="waitingList.length > 0">
            <article
              v-for="(person, index) in waitingList"
              :key="person.id"
              class="queue-card"
              :class="{ 'queue-card--next': index === 0 }"
              :data-testid="`operation-waiting-${person.id}`"
            >
              <span class="queue-card__position">{{ index + 1 }}</span>
              <span class="queue-card__avatar" :style="{ '--avatar-accent': person.color }">
                <img v-if="person.avatarUrl" class="queue-card__avatar-img" :src="person.avatarUrl" :alt="person.name">
                <template v-else>{{ person.initials }}</template>
              </span>
              <span class="queue-card__content">
                <span class="queue-card__headline">
                  <strong class="queue-card__name">{{ person.name }}</strong>
                  <span v-if="integratedMode && person.storeName" class="queue-card__store-badge">{{ person.storeName }}</span>
                </span>
                <span class="queue-card__role">{{ person.role }}</span>
                <span class="queue-card__note">{{ index === 0 ? 'Aguardando' : 'Aguardando na fila' }}</span>
              </span>
              <div class="queue-card__actions">
                <span v-if="(index === 0 && !integratedMode) || readOnly" class="queue-card__badge">{{ index === 0 ? 'Na vez' : 'Na fila' }}</span>
                <template v-else-if="integratedMode">
                  <button
                    class="queue-card__task-btn"
                    type="button"
                    :disabled="busy"
                    :data-testid="`operation-assign-task-${person.id}`"
                    @click="handleAssignTask(person)"
                  >
                    {{ busy ? 'Aguarde' : 'Tirar' }}
                  </button>
                </template>
                <template v-else>
                  <div class="queue-card__action-wrap">
                    <button
                      class="queue-card__action"
                      type="button"
                      title="Atender fora da vez"
                      :disabled="isLimitReached || busy"
                      :data-testid="`operation-start-specific-${person.id}`"
                      @click="handleStartSpecific(person.id)"
                    >
                      <AppMaterialIcon :name="busy ? 'hourglass_top' : 'bolt'" />
                    </button>
                    <span class="queue-card__action-hint">{{ actionHint(index) }}</span>
                  </div>
                </template>
              </div>
            </article>
          </template>

          <div v-else class="queue-empty">
            <span class="queue-empty__icon">!</span>
            <strong class="queue-empty__title">Fila vazia</strong>
            <span class="queue-empty__text">
              {{ readOnly ? 'Acompanhe por aqui quando a operacao da loja iniciar novos atendimentos.' : 'Use a barra abaixo para colocar alguem na fila.' }}
            </span>
          </div>
        </div>
      </section>

      <section class="queue-column" data-testid="operation-service-column">
        <header class="queue-column__header">Em atendimento</header>
        <div class="queue-column__body queue-column__body--service">
          <template v-if="activeServices.length > 0">
            <OperationActiveServiceCard
              v-for="service in activeServices"
              :key="service.serviceId"
              :service="service as FilaAtendimentoActiveService"
              :now="now"
              :clock-ready="isClockReady"
              :read-only="readOnly"
              :integrated-mode="integratedMode"
              :busy="busy"
              @finish="handleFinish"
            />
          </template>

          <div v-else class="queue-empty">
            <span class="queue-empty__icon">...</span>
            <strong class="queue-empty__title">Nenhum atendimento em andamento</strong>
            <span class="queue-empty__text">Quando iniciar um atendimento, o tempo passa a ser contado aqui.</span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
