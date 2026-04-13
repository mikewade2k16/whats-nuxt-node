<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { FilaAtendimentoConsultantProfilePayload, FilaAtendimentoOperationState } from '~/types/fila-atendimento'
import { buildConsultantStats, formatCurrencyBRL, formatDurationMinutes, formatPercent } from '~/utils/fila-atendimento/metrics'

const props = defineProps<{
  state: FilaAtendimentoOperationState
  canManage: boolean
  busy: boolean
}>()

const emit = defineEmits<{
  create: [payload: FilaAtendimentoConsultantProfilePayload]
  update: [consultantId: string, payload: FilaAtendimentoConsultantProfilePayload]
  archive: [consultantId: string]
}>()

const selectedConsultantId = ref('')
const simulationAdditionalSales = ref(0)
const createForm = reactive<FilaAtendimentoConsultantProfilePayload>({
  name: '',
  role: 'consultant',
  color: '#168aad',
  monthlyGoal: 0,
  commissionRate: 0,
  conversionGoal: 0,
  avgTicketGoal: 0,
  paGoal: 0
})
const editForm = reactive<FilaAtendimentoConsultantProfilePayload>({
  name: '',
  role: 'consultant',
  color: '#168aad',
  monthlyGoal: 0,
  commissionRate: 0,
  conversionGoal: 0,
  avgTicketGoal: 0,
  paGoal: 0
})

const roster = computed(() => props.state.roster || [])
const selectedConsultant = computed(() =>
  roster.value.find((consultant) => consultant.id === selectedConsultantId.value) || roster.value[0] || null
)
const stats = computed(() => {
  if (!selectedConsultant.value) {
    return null
  }

  return buildConsultantStats({
    history: props.state.serviceHistory,
    consultantId: selectedConsultant.value.id,
    monthlyGoal: selectedConsultant.value.monthlyGoal,
    commissionRate: selectedConsultant.value.commissionRate,
    conversionGoal: selectedConsultant.value.conversionGoal,
    avgTicketGoal: selectedConsultant.value.avgTicketGoal,
    paGoal: selectedConsultant.value.paGoal
  })
})
const goalPercent = computed(() => {
  if (!stats.value?.monthlyGoal) {
    return 0
  }

  return Math.min(100, (stats.value.soldValue / stats.value.monthlyGoal) * 100)
})
const projectedSoldValue = computed(() => (stats.value?.soldValue || 0) + Number(simulationAdditionalSales.value || 0))
const projectedCommission = computed(() => projectedSoldValue.value * Number(selectedConsultant.value?.commissionRate || 0))

watch(
  roster,
  (nextRoster) => {
    if (!selectedConsultantId.value && nextRoster.length) {
      selectedConsultantId.value = nextRoster[0].id
      return
    }

    if (!nextRoster.some((consultant) => consultant.id === selectedConsultantId.value) && nextRoster.length) {
      selectedConsultantId.value = nextRoster[0].id
    }
  },
  { immediate: true }
)

watch(
  selectedConsultant,
  (consultant) => {
    if (!consultant) {
      return
    }

    editForm.name = consultant.name
    editForm.role = consultant.role
    editForm.color = consultant.color
    editForm.monthlyGoal = consultant.monthlyGoal
    editForm.commissionRate = consultant.commissionRate
    editForm.conversionGoal = consultant.conversionGoal
    editForm.avgTicketGoal = consultant.avgTicketGoal
    editForm.paGoal = consultant.paGoal
  },
  { immediate: true }
)

function handleCreate() {
  emit('create', { ...createForm })
  createForm.name = ''
}

function handleUpdate() {
  if (!selectedConsultant.value) {
    return
  }

  emit('update', selectedConsultant.value.id, { ...editForm })
}

function handleArchive() {
  if (!selectedConsultant.value) {
    return
  }

  emit('archive', selectedConsultant.value.id)
}
</script>

<template>
  <section class="admin-panel" data-testid="consultant-panel">
    <header class="admin-panel__header">
      <h2 class="admin-panel__title">Perfil do consultor</h2>
      <p class="admin-panel__text">Meta mensal, desempenho e simulacao de venda do consultor selecionado.</p>
    </header>

    <div v-if="selectedConsultant && stats" class="consultant-layout">
      <article class="settings-card">
        <label class="settings-field">
          <span>Consultor</span>
          <select v-model="selectedConsultantId" class="module-shell__input">
            <option v-for="consultant in roster" :key="consultant.id" :value="consultant.id">{{ consultant.name }}</option>
          </select>
        </label>
      </article>

      <section class="metric-grid">
        <article class="metric-card"><span class="metric-card__label">Vendido no mes</span><strong class="metric-card__value">{{ formatCurrencyBRL(stats.soldValue) }}</strong></article>
        <article class="metric-card"><span class="metric-card__label">Conversao</span><strong class="metric-card__value">{{ formatPercent(stats.conversionRate) }}</strong></article>
        <article class="metric-card"><span class="metric-card__label">Ticket medio</span><strong class="metric-card__value">{{ formatCurrencyBRL(stats.ticketAverage) }}</strong></article>
        <article class="metric-card"><span class="metric-card__label">P.A.</span><strong class="metric-card__value">{{ Number(stats.paScore).toFixed(2) }}</strong></article>
        <article class="metric-card"><span class="metric-card__label">Comissao estimada</span><strong class="metric-card__value">{{ formatCurrencyBRL(stats.estimatedCommission) }}</strong></article>
        <article class="metric-card"><span class="metric-card__label">Tempo medio</span><strong class="metric-card__value">{{ formatDurationMinutes(stats.averageDurationMs) }}</strong></article>
      </section>

      <article class="insight-card insight-card--wide">
        <div class="team-goal-summary__header">
          <span class="metric-card__label">Meta mensal</span>
          <span class="metric-card__text">{{ formatCurrencyBRL(stats.soldValue) }} de {{ formatCurrencyBRL(stats.monthlyGoal) }}</span>
        </div>
        <div class="progress-bar"><span class="progress-bar__fill" :style="{ '--progress': `${goalPercent.toFixed(1)}%` }"></span></div>
        <div class="chip-list">
          <span class="insight-tag">Falta <strong>{{ formatCurrencyBRL(stats.remainingToGoal) }}</strong></span>
          <span class="insight-tag">Meta conversao <strong>{{ formatPercent(stats.conversionGoal) }}</strong></span>
          <span class="insight-tag">Meta ticket <strong>{{ formatCurrencyBRL(stats.avgTicketGoal) }}</strong></span>
          <span class="insight-tag">Meta P.A. <strong>{{ Number(stats.paGoal).toFixed(2) }}</strong></span>
        </div>
      </article>

      <article class="insight-card">
        <h3 class="insight-card__title">Simulador rapido</h3>
        <label class="settings-field">
          <span>Venda adicional simulada</span>
          <input v-model.number="simulationAdditionalSales" class="module-shell__input" type="number" min="0" step="50">
        </label>
        <div class="chip-list">
          <span class="insight-tag">Venda projetada <strong>{{ formatCurrencyBRL(projectedSoldValue) }}</strong></span>
          <span class="insight-tag">Comissao projetada <strong>{{ formatCurrencyBRL(projectedCommission) }}</strong></span>
        </div>
      </article>

      <div v-if="canManage" class="insight-grid insight-grid--two">
        <article class="settings-card">
          <header class="settings-card__header">
            <h3 class="settings-card__title">Atualizar consultor</h3>
            <p class="settings-card__text">Edite metas, cor e papel operacional do consultor selecionado.</p>
          </header>
          <div class="settings-grid settings-grid--compact">
            <label class="settings-field"><span>Nome</span><input v-model="editForm.name" class="module-shell__input" type="text"></label>
            <label class="settings-field"><span>Papel</span><select v-model="editForm.role" class="module-shell__input"><option value="consultant">Consultor</option><option value="manager">Gerente</option><option value="store_terminal">Acesso da loja</option></select></label>
            <label class="settings-field"><span>Cor</span><input v-model="editForm.color" class="module-shell__input" type="color"></label>
            <label class="settings-field"><span>Meta mensal</span><input v-model.number="editForm.monthlyGoal" class="module-shell__input" type="number" min="0"></label>
            <label class="settings-field"><span>Comissao</span><input v-model.number="editForm.commissionRate" class="module-shell__input" type="number" min="0" step="0.01"></label>
            <label class="settings-field"><span>Meta conversao</span><input v-model.number="editForm.conversionGoal" class="module-shell__input" type="number" min="0" step="0.1"></label>
            <label class="settings-field"><span>Meta ticket</span><input v-model.number="editForm.avgTicketGoal" class="module-shell__input" type="number" min="0" step="1"></label>
            <label class="settings-field"><span>Meta P.A.</span><input v-model.number="editForm.paGoal" class="module-shell__input" type="number" min="0" step="0.1"></label>
          </div>
          <div class="finish-form__footer">
            <button class="column-action column-action--secondary" type="button" :disabled="busy" @click="handleArchive">Arquivar</button>
            <button class="column-action column-action--primary" type="button" :disabled="busy" @click="handleUpdate">Salvar alteracoes</button>
          </div>
        </article>

        <article class="settings-card">
          <header class="settings-card__header">
            <h3 class="settings-card__title">Novo consultor</h3>
            <p class="settings-card__text">Cria o consultor no roster operacional da loja ativa.</p>
          </header>
          <div class="settings-grid settings-grid--compact">
            <label class="settings-field"><span>Nome</span><input v-model="createForm.name" class="module-shell__input" type="text"></label>
            <label class="settings-field"><span>Papel</span><select v-model="createForm.role" class="module-shell__input"><option value="consultant">Consultor</option><option value="manager">Gerente</option><option value="store_terminal">Acesso da loja</option></select></label>
            <label class="settings-field"><span>Cor</span><input v-model="createForm.color" class="module-shell__input" type="color"></label>
            <label class="settings-field"><span>Meta mensal</span><input v-model.number="createForm.monthlyGoal" class="module-shell__input" type="number" min="0"></label>
            <label class="settings-field"><span>Comissao</span><input v-model.number="createForm.commissionRate" class="module-shell__input" type="number" min="0" step="0.01"></label>
            <label class="settings-field"><span>Meta conversao</span><input v-model.number="createForm.conversionGoal" class="module-shell__input" type="number" min="0" step="0.1"></label>
            <label class="settings-field"><span>Meta ticket</span><input v-model.number="createForm.avgTicketGoal" class="module-shell__input" type="number" min="0" step="1"></label>
            <label class="settings-field"><span>Meta P.A.</span><input v-model.number="createForm.paGoal" class="module-shell__input" type="number" min="0" step="0.1"></label>
          </div>
          <div class="finish-form__footer">
            <button class="column-action column-action--primary" type="button" :disabled="busy || !createForm.name" @click="handleCreate">Criar consultor</button>
          </div>
        </article>
      </div>
    </div>

    <div v-else class="unsupported-card">
      <h2 class="admin-panel__title">Nenhum consultor disponivel</h2>
      <p class="admin-panel__text">Selecione outra loja ou crie o primeiro consultor pelo painel.</p>
    </div>
  </section>
</template>
