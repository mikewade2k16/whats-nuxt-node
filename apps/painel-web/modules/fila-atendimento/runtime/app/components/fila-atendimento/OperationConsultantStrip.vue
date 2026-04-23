<script setup lang="ts">
import { computed } from 'vue'
import type { FilaAtendimentoConsultantView, FilaAtendimentoOperationState } from '~/types/fila-atendimento'
import { useFilaAtendimentoOperationsStore } from '~/stores/fila-atendimento/operations'
import { useUiStore } from '~/stores/ui'

const props = withDefaults(defineProps<{
  state: FilaAtendimentoOperationState
  integratedMode?: boolean
  busy?: boolean
}>(), {
  integratedMode: false,
  busy: false
})

const operationsStore = useFilaAtendimentoOperationsStore()
const ui = useUiStore()

const employees = computed(() => props.state.roster || [])
const waitingIds = computed(() => new Set((props.state.waitingList || []).map((person) => person.id)))
const activeServiceIds = computed(() => new Set((props.state.activeServices || []).map((service) => service.id)))
const pausedByPersonId = computed(() =>
  new Map((props.state.pausedEmployees || []).map((item) => [item.personId, item]))
)

function statusFor(employeeId: string) {
  if (activeServiceIds.value.has(employeeId)) {
    return 'service'
  }

  if (pausedByPersonId.value.has(employeeId)) {
    return 'paused'
  }

  if (waitingIds.value.has(employeeId)) {
    return 'queue'
  }

  return 'available'
}

function statusLabel(employeeId: string) {
  const status = statusFor(employeeId)
  const pausedItem = pausedByPersonId.value.get(employeeId)

  if (status === 'service') return 'Em atendimento'
  if (status === 'queue') return 'Na fila'
  if (status === 'paused') {
    return String(pausedItem?.kind || '').trim() === 'assignment' ? 'Em tarefa' : 'Pausado'
  }
  return 'Disponivel'
}

async function handleAddToQueue(employee: FilaAtendimentoConsultantView) {
  const result = await operationsStore.addToQueue(employee.id, props.integratedMode ? employee.storeId : '')

  if (result?.ok === false) {
    ui.error(result.message || 'Nao foi possivel colocar o consultor na fila.')
  }
}

async function handlePause(employee: FilaAtendimentoConsultantView) {
  const { confirmed, value } = await ui.prompt({
    title: 'Pausar consultor',
    message: 'Informe o motivo da pausa para registrar no painel.',
    inputLabel: 'Motivo da pausa',
    inputPlaceholder: 'Ex.: almoco, atendimento externo, suporte interno',
    confirmLabel: 'Pausar',
    required: true
  })

  if (!confirmed || !value) {
    return
  }

  const result = await operationsStore.pauseEmployee(employee.id, value, props.integratedMode ? employee.storeId : '')

  if (result?.ok === false) {
    ui.error(result.message || 'Nao foi possivel pausar o consultor.')
    return
  }

  ui.success('Consultor pausado.')
}

async function handleAssignTask(employee: FilaAtendimentoConsultantView) {
  const { confirmed, value } = await ui.prompt({
    title: 'Direcionar para tarefa',
    message: 'Registre a tarefa ou reuniao para tirar este consultor da fila temporariamente.',
    inputLabel: 'Motivo',
    inputPlaceholder: 'Ex.: reuniao, apoio no caixa, estoque, suporte',
    confirmLabel: 'Salvar tarefa',
    required: true
  })

  if (!confirmed || !value) {
    return
  }

  const result = await operationsStore.assignTask(employee.id, value, props.integratedMode ? employee.storeId : '')

  if (result?.ok === false) {
    ui.error(result.message || 'Nao foi possivel direcionar para tarefa.')
    return
  }

  ui.success('Consultor direcionado para tarefa.')
}

async function handleResume(employee: FilaAtendimentoConsultantView) {
  const result = await operationsStore.resumeEmployee(employee.id, props.integratedMode ? employee.storeId : '')

  if (result?.ok === false) {
    ui.error(result.message || 'Nao foi possivel retomar o consultor.')
    return
  }

  ui.success('Consultor retomado.')
}
</script>

<template>
  <footer class="employee-strip" data-testid="operation-consultant-strip" aria-label="Consultores da operacao">
    <div class="employee-strip__list">
      <div
        v-for="employee in employees"
        :key="employee.id"
        class="employee"
        :class="`employee--${statusFor(employee.id)}`"
        :data-testid="`operation-consultant-${employee.id}`"
      >
        <span class="employee__avatar" :style="{ '--avatar-accent': employee.color }">
          <img v-if="employee.avatarUrl" class="employee__avatar-img" :src="employee.avatarUrl" :alt="employee.name">
          <template v-else>{{ employee.initials }}</template>
        </span>

        <div class="employee__info">
          <span class="employee__name">{{ employee.name }}</span>
          <span v-if="integratedMode && employee.storeName" class="employee__store">{{ employee.storeName }}</span>
          <span class="employee__status">{{ statusLabel(employee.id) }}</span>
          <span v-if="pausedByPersonId.get(employee.id)" class="employee__pause-reason">
            {{ pausedByPersonId.get(employee.id)?.reason }}
          </span>
        </div>

        <div v-if="statusFor(employee.id) === 'available'" class="employee__actions">
          <button
            class="employee__action employee__action--primary"
            type="button"
            title="Entrar na fila"
            :disabled="busy"
            :data-testid="`operation-add-to-queue-${employee.id}`"
            @click="handleAddToQueue(employee)"
          >
            <AppMaterialIcon :name="busy ? 'hourglass_top' : 'login'" />
          </button>
          <button
            class="employee__action employee__action--secondary"
            type="button"
            title="Direcionar para tarefa"
            :disabled="busy"
            :data-testid="`operation-assign-task-${employee.id}`"
            @click="handleAssignTask(employee)"
          >
            <AppMaterialIcon :name="busy ? 'hourglass_top' : 'assignment'" />
          </button>
          <button
            class="employee__action employee__action--secondary"
            type="button"
            title="Pausar"
            :disabled="busy"
            :data-testid="`operation-pause-${employee.id}`"
            @click="handlePause(employee)"
          >
            <AppMaterialIcon :name="busy ? 'hourglass_top' : 'pause'" />
          </button>
        </div>

        <div v-else-if="statusFor(employee.id) === 'queue'" class="employee__actions">
          <button
            class="employee__action employee__action--secondary"
            type="button"
            title="Direcionar para tarefa"
            :disabled="busy"
            :data-testid="`operation-assign-task-${employee.id}`"
            @click="handleAssignTask(employee)"
          >
            <AppMaterialIcon :name="busy ? 'hourglass_top' : 'assignment'" />
          </button>
          <button
            class="employee__action employee__action--secondary"
            type="button"
            title="Pausar"
            :disabled="busy"
            :data-testid="`operation-pause-${employee.id}`"
            @click="handlePause(employee)"
          >
            <AppMaterialIcon :name="busy ? 'hourglass_top' : 'pause'" />
          </button>
        </div>

        <div v-else-if="statusFor(employee.id) === 'paused'" class="employee__actions">
          <button
            class="employee__action employee__action--primary"
            type="button"
            title="Retomar"
            :disabled="busy"
            :data-testid="`operation-resume-${employee.id}`"
            @click="handleResume(employee)"
          >
            <AppMaterialIcon :name="busy ? 'hourglass_top' : 'play_arrow'" />
          </button>
        </div>
      </div>
    </div>
  </footer>
</template>
