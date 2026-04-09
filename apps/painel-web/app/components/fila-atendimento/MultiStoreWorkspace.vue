<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type {
  FilaAtendimentoManagedStore,
  FilaAtendimentoMultiStoreOverviewResponse,
  FilaAtendimentoOperationState
} from '~/types/fila-atendimento'
import { formatCurrencyBRL, formatPercent } from '~/utils/fila-atendimento/metrics'

interface MultiStoreDraft {
  name: string
  code: string
  city: string
  defaultTemplateId: string
  monthlyGoal: string
  weeklyGoal: string
  avgTicketGoal: string
  conversionGoal: string
  paGoal: string
}

interface MultiStoreCreateDraft extends MultiStoreDraft {
  cloneActiveRoster: boolean
}

const props = defineProps<{
  state: FilaAtendimentoOperationState
  managedStores: FilaAtendimentoManagedStore[]
  overview: FilaAtendimentoMultiStoreOverviewResponse | null
  canManage: boolean
  loading: boolean
  busy: boolean
  ready: boolean
  errorMessage: string
  feedback?: string
}>()

const emit = defineEmits<{
  'activate-store': [storeId: string]
  'create-store': [payload: Record<string, unknown>]
  'update-store': [storeId: string, payload: Record<string, unknown>]
  'archive-store': [storeId: string]
  'restore-store': [storeId: string]
  'delete-store': [store: FilaAtendimentoManagedStore]
}>()

const storeDrafts = ref<Record<string, MultiStoreDraft>>({})
const newStore = reactive<MultiStoreCreateDraft>({
  name: '',
  code: '',
  city: '',
  cloneActiveRoster: true,
  defaultTemplateId: '',
  monthlyGoal: '',
  weeklyGoal: '',
  avgTicketGoal: '',
  conversionGoal: '',
  paGoal: ''
})

const templateOptions = computed(() => [
  { value: '', label: 'Template padrao' },
  ...props.state.operationTemplates.map((template) => ({
    value: String(template.id || '').trim(),
    label: String(template.label || '').trim()
  }))
])

const rows = computed(() => Array.isArray(props.overview?.stores) ? props.overview?.stores || [] : [])
const managedStores = computed(() => Array.isArray(props.managedStores) ? props.managedStores : [])
const activeManagedStores = computed(() => managedStores.value.filter((store) => store.isActive !== false))
const archivedManagedStores = computed(() => managedStores.value.filter((store) => store.isActive === false))
const summary = computed(() => props.overview?.summary || {
  activeStores: activeManagedStores.value.length,
  totalAttendances: 0,
  totalSoldValue: 0,
  totalQueue: 0,
  totalActiveServices: 0,
  averageHealthScore: 0
})

watch(
  () => props.managedStores,
  (stores) => {
    storeDrafts.value = Object.fromEntries(
      (stores || []).map((store) => [
        store.id,
        {
          name: store.name,
          code: store.code || '',
          city: store.city || '',
          defaultTemplateId: store.defaultTemplateId || '',
          monthlyGoal: store.monthlyGoal ? String(store.monthlyGoal) : '',
          weeklyGoal: store.weeklyGoal ? String(store.weeklyGoal) : '',
          avgTicketGoal: store.avgTicketGoal ? String(store.avgTicketGoal) : '',
          conversionGoal: store.conversionGoal ? String(store.conversionGoal) : '',
          paGoal: store.paGoal ? String(store.paGoal) : ''
        }
      ])
    )
  },
  { immediate: true, deep: true }
)

function updateStoreDraft(storeId: string, patch: Partial<MultiStoreDraft>) {
  const current = storeDrafts.value[storeId]
  if (!current) {
    return
  }

  storeDrafts.value = {
    ...storeDrafts.value,
    [storeId]: {
      ...current,
      ...patch
    }
  }
}

function emitUpdateStore(storeId: string) {
  emit('update-store', storeId, { ...storeDrafts.value[storeId] })
}

function emitCreateStore() {
  emit('create-store', { ...newStore })
}
</script>

<template>
  <section class="admin-panel" data-testid="multistore-panel">
    <header class="admin-panel__header">
      <h2 class="admin-panel__title">Visao consolidada multi-loja</h2>
      <p class="admin-panel__text">Comparativo operacional para acompanhar performance, metas e saude das lojas hospedadas no modulo.</p>
    </header>

    <article v-if="feedback" class="insight-card"><p class="settings-card__text">{{ feedback }}</p></article>
    <article v-if="errorMessage" class="settings-card"><p class="settings-card__text">{{ errorMessage }}</p></article>
    <article v-else-if="loading && !ready" class="settings-card"><p class="settings-card__text">Carregando consolidado multiloja...</p></article>

    <section class="metric-grid" data-testid="multistore-summary">
      <article class="metric-card"><span class="metric-card__label">Lojas ativas</span><strong class="metric-card__value">{{ summary.activeStores || 0 }}</strong></article>
      <article class="metric-card"><span class="metric-card__label">Atendimentos consolidados</span><strong class="metric-card__value">{{ summary.totalAttendances || 0 }}</strong></article>
      <article class="metric-card"><span class="metric-card__label">Vendas consolidadas</span><strong class="metric-card__value">{{ formatCurrencyBRL(summary.totalSoldValue || 0) }}</strong></article>
      <article class="metric-card"><span class="metric-card__label">Fila atual total</span><strong class="metric-card__value">{{ summary.totalQueue || 0 }}</strong></article>
      <article class="metric-card"><span class="metric-card__label">Em atendimento agora</span><strong class="metric-card__value">{{ summary.totalActiveServices || 0 }}</strong></article>
      <article class="metric-card"><span class="metric-card__label">Score medio operacional</span><strong class="metric-card__value">{{ Math.round(Number(summary.averageHealthScore || 0)) }}</strong></article>
    </section>

    <article class="insight-card insight-card--wide" data-testid="multistore-comparison-table">
      <h3 class="insight-card__title">Comparativo consolidado por loja</h3>

      <div class="table-wrap">
        <table class="module-table module-table--wide">
          <thead>
            <tr>
              <th>Loja</th>
              <th>Consultores</th>
              <th>Fila</th>
              <th>Ativos</th>
              <th>Atendimentos</th>
              <th>Conversao</th>
              <th>Meta conv.</th>
              <th>Vendas</th>
              <th>Meta mensal</th>
              <th>% meta</th>
              <th>Ticket medio</th>
              <th>Meta ticket</th>
              <th>P.A.</th>
              <th>Meta P.A.</th>
              <th>Score</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!rows.length">
              <td colspan="16">Sem lojas cadastradas.</td>
            </tr>
            <tr v-for="row in rows" :key="row.storeId">
              <td>
                <strong>{{ row.storeName || 'Loja sem nome' }}</strong>
                <p class="metric-card__text">
                  {{ row.storeCode || 'Sem codigo' }}
                  <template v-if="row.storeCity"> • {{ row.storeCity }}</template>
                </p>
              </td>
              <td>{{ row.consultants || 0 }}</td>
              <td>{{ row.queueCount || 0 }}</td>
              <td>{{ row.activeCount || 0 }}</td>
              <td>{{ row.attendances || 0 }}</td>
              <td>{{ formatPercent(row.conversionRate || 0) }}</td>
              <td>{{ row.conversionGoal ? formatPercent(row.conversionGoal) : '-' }}</td>
              <td>{{ formatCurrencyBRL(row.soldValue || 0) }}</td>
              <td>{{ row.monthlyGoal ? formatCurrencyBRL(row.monthlyGoal) : '-' }}</td>
              <td>
                <span v-if="row.monthlyGoal" :class="row.soldValue && row.soldValue >= row.monthlyGoal ? 'multistore-goal--hit' : 'multistore-goal--miss'">
                  {{ formatPercent(row.monthlyGoal ? ((row.soldValue || 0) / row.monthlyGoal) * 100 : 0) }}
                </span>
                <span v-else>-</span>
              </td>
              <td>{{ formatCurrencyBRL(row.ticketAverage || 0) }}</td>
              <td>{{ row.avgTicketGoal ? formatCurrencyBRL(row.avgTicketGoal) : '-' }}</td>
              <td>{{ Number(row.paScore || 0).toFixed(2) }}</td>
              <td>{{ row.paGoal ? Number(row.paGoal).toFixed(2) : '-' }}</td>
              <td>{{ Math.round(Number(row.healthScore || 0)) }}</td>
              <td>
                <span v-if="row.storeId === state.activeStoreId" class="insight-tag">Ativa</span>
                <button v-else class="multistore-inline-button" type="button" :disabled="busy" @click="emit('activate-store', String(row.storeId || ''))">Abrir</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>

    <article class="insight-card insight-card--wide" data-testid="multistore-meeting">
      <div class="alert-list__header">
        <h3 class="insight-card__title">Painel de reuniao gerencial</h3>
        <span class="insight-tag">{{ rows.length }} lojas</span>
      </div>

      <div class="meeting-grid">
        <div v-for="row in rows" :key="`${row.storeId}-meeting`" class="meeting-card">
          <div class="meeting-card__header">
            <h4 class="meeting-card__name">{{ row.storeName || 'Loja sem nome' }}</h4>
            <span class="meeting-card__score">Score {{ Math.round(Number(row.healthScore || 0)) }}</span>
          </div>

          <div class="meeting-goal-list">
            <div class="meeting-goal-row">
              <span class="meeting-goal-row__label">Vendas vs meta mensal</span>
              <div class="meeting-goal-row__bar">
                <div class="meeting-goal-row__track">
                  <div
                    :class="['meeting-goal-row__fill', row.monthlyGoal && (row.soldValue || 0) >= row.monthlyGoal ? 'meeting-goal-row__fill--hit' : 'meeting-goal-row__fill--miss']"
                    :style="{ width: row.monthlyGoal ? `${Math.min(100, ((row.soldValue || 0) / row.monthlyGoal) * 100).toFixed(1)}%` : '0%' }"
                  />
                </div>
                <span :class="['meeting-goal-row__value', row.monthlyGoal && (row.soldValue || 0) >= row.monthlyGoal ? 'meeting-goal-row__value--hit' : 'meeting-goal-row__value--miss']">
                  {{ row.monthlyGoal ? formatPercent(((row.soldValue || 0) / row.monthlyGoal) * 100) : formatCurrencyBRL(row.soldValue || 0) }}
                </span>
              </div>
            </div>

            <div class="meeting-goal-row">
              <span class="meeting-goal-row__label">Conversao vs meta</span>
              <div class="meeting-goal-row__bar">
                <div class="meeting-goal-row__track">
                  <div
                    :class="['meeting-goal-row__fill', row.conversionGoal && (row.conversionRate || 0) >= row.conversionGoal ? 'meeting-goal-row__fill--hit' : 'meeting-goal-row__fill--miss']"
                    :style="{ width: row.conversionGoal ? `${Math.min(100, ((row.conversionRate || 0) / row.conversionGoal) * 100).toFixed(1)}%` : `${Math.min(100, Number(row.conversionRate || 0)).toFixed(1)}%` }"
                  />
                </div>
                <span :class="['meeting-goal-row__value', row.conversionGoal && (row.conversionRate || 0) >= row.conversionGoal ? 'meeting-goal-row__value--hit' : 'meeting-goal-row__value--miss']">
                  {{ formatPercent(row.conversionRate || 0) }}
                </span>
              </div>
            </div>

            <div class="meeting-goal-row">
              <span class="meeting-goal-row__label">Ticket medio vs meta</span>
              <div class="meeting-goal-row__bar">
                <div class="meeting-goal-row__track">
                  <div
                    :class="['meeting-goal-row__fill', row.avgTicketGoal && (row.ticketAverage || 0) >= row.avgTicketGoal ? 'meeting-goal-row__fill--hit' : 'meeting-goal-row__fill--miss']"
                    :style="{ width: row.avgTicketGoal ? `${Math.min(100, ((row.ticketAverage || 0) / row.avgTicketGoal) * 100).toFixed(1)}%` : '0%' }"
                  />
                </div>
                <span :class="['meeting-goal-row__value', row.avgTicketGoal && (row.ticketAverage || 0) >= row.avgTicketGoal ? 'meeting-goal-row__value--hit' : 'meeting-goal-row__value--miss']">
                  {{ formatCurrencyBRL(row.ticketAverage || 0) }}
                </span>
              </div>
            </div>

            <div class="meeting-goal-row">
              <span class="meeting-goal-row__label">P.A. vs meta</span>
              <div class="meeting-goal-row__bar">
                <div class="meeting-goal-row__track">
                  <div
                    :class="['meeting-goal-row__fill', row.paGoal && (row.paScore || 0) >= row.paGoal ? 'meeting-goal-row__fill--hit' : 'meeting-goal-row__fill--miss']"
                    :style="{ width: row.paGoal ? `${Math.min(100, ((row.paScore || 0) / row.paGoal) * 100).toFixed(1)}%` : '0%' }"
                  />
                </div>
                <span :class="['meeting-goal-row__value', row.paGoal && (row.paScore || 0) >= row.paGoal ? 'meeting-goal-row__value--hit' : 'meeting-goal-row__value--miss']">
                  {{ Number(row.paScore || 0).toFixed(2) }}
                </span>
              </div>
            </div>

            <div class="meeting-goal-row">
              <span class="meeting-goal-row__label">Atendimentos</span>
              <div class="meeting-goal-row__bar">
                <div class="meeting-goal-row__track">
                  <div
                    class="meeting-goal-row__fill meeting-goal-row__fill--hit"
                    :style="{ width: summary.totalAttendances ? `${(((row.attendances || 0) / summary.totalAttendances) * 100).toFixed(1)}%` : '0%' }"
                  />
                </div>
                <span class="meeting-goal-row__value meeting-goal-row__value--hit">{{ row.attendances || 0 }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>

    <article v-if="canManage" class="settings-card">
      <header class="settings-card__header">
        <h3 class="settings-card__title">Gestao de lojas</h3>
        <p class="settings-card__text">Identificacao, template operacional e metas por loja hospedada.</p>
      </header>

      <div class="multistore-list">
        <form
          v-for="store in activeManagedStores"
          :key="store.id"
          class="multistore-form"
          @submit.prevent="emitUpdateStore(store.id)"
        >
          <div class="multistore-form__row">
            <label class="multistore-form__field">
              <span class="multistore-form__label">Nome</span>
              <input class="module-shell__input" :value="storeDrafts[store.id]?.name || ''" type="text" :disabled="busy" @input="updateStoreDraft(store.id, { name: ($event.target as HTMLInputElement).value })">
            </label>
            <label class="multistore-form__field">
              <span class="multistore-form__label">Codigo</span>
              <input class="module-shell__input" :value="storeDrafts[store.id]?.code || ''" type="text" :disabled="busy" @input="updateStoreDraft(store.id, { code: ($event.target as HTMLInputElement).value })">
            </label>
            <label class="multistore-form__field">
              <span class="multistore-form__label">Cidade</span>
              <input class="module-shell__input" :value="storeDrafts[store.id]?.city || ''" type="text" :disabled="busy" @input="updateStoreDraft(store.id, { city: ($event.target as HTMLInputElement).value })">
            </label>
            <label class="multistore-form__field">
              <span class="multistore-form__label">Template padrao</span>
              <select class="module-shell__input" :value="storeDrafts[store.id]?.defaultTemplateId || ''" :disabled="busy" @change="updateStoreDraft(store.id, { defaultTemplateId: ($event.target as HTMLSelectElement).value })">
                <option v-for="option in templateOptions" :key="option.value || 'default'" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
          </div>

          <div class="multistore-form__row multistore-form__row--goals">
            <label class="multistore-form__field">
              <span class="multistore-form__label">Meta mensal (R$)</span>
              <input class="module-shell__input" :value="storeDrafts[store.id]?.monthlyGoal || ''" type="number" min="0" step="100" :disabled="busy" @input="updateStoreDraft(store.id, { monthlyGoal: ($event.target as HTMLInputElement).value })">
            </label>
            <label class="multistore-form__field">
              <span class="multistore-form__label">Meta semanal (R$)</span>
              <input class="module-shell__input" :value="storeDrafts[store.id]?.weeklyGoal || ''" type="number" min="0" step="100" :disabled="busy" @input="updateStoreDraft(store.id, { weeklyGoal: ($event.target as HTMLInputElement).value })">
            </label>
            <label class="multistore-form__field">
              <span class="multistore-form__label">Ticket medio alvo (R$)</span>
              <input class="module-shell__input" :value="storeDrafts[store.id]?.avgTicketGoal || ''" type="number" min="0" step="100" :disabled="busy" @input="updateStoreDraft(store.id, { avgTicketGoal: ($event.target as HTMLInputElement).value })">
            </label>
            <label class="multistore-form__field">
              <span class="multistore-form__label">Conversao alvo (%)</span>
              <input class="module-shell__input" :value="storeDrafts[store.id]?.conversionGoal || ''" type="number" min="0" max="100" step="1" :disabled="busy" @input="updateStoreDraft(store.id, { conversionGoal: ($event.target as HTMLInputElement).value })">
            </label>
            <label class="multistore-form__field">
              <span class="multistore-form__label">P.A. alvo</span>
              <input class="module-shell__input" :value="storeDrafts[store.id]?.paGoal || ''" type="number" min="0" step="0.1" :disabled="busy" @input="updateStoreDraft(store.id, { paGoal: ($event.target as HTMLInputElement).value })">
            </label>
          </div>

          <div class="multistore-form__actions">
            <button class="multistore-button multistore-button--primary" type="submit" :disabled="busy">Salvar loja</button>
            <button class="multistore-button multistore-button--secondary" type="button" :disabled="busy" @click="emit('archive-store', store.id)">Arquivar</button>
            <button class="multistore-button multistore-button--danger" type="button" :disabled="busy" @click="emit('delete-store', store)">Excluir</button>
          </div>
        </form>
      </div>

      <div v-if="archivedManagedStores.length" class="multistore-list">
        <article v-for="store in archivedManagedStores" :key="`${store.id}-archived`" class="multistore-archived-row">
          <div>
            <strong>{{ store.name }}</strong>
            <p class="settings-card__text">
              {{ store.code || 'Sem codigo' }}
              <template v-if="store.city"> • {{ store.city }}</template>
            </p>
          </div>
          <div class="multistore-form__actions multistore-form__actions--inline">
            <button class="multistore-button multistore-button--primary" type="button" :disabled="busy" @click="emit('restore-store', store.id)">Restaurar</button>
            <button class="multistore-button multistore-button--danger" type="button" :disabled="busy" @click="emit('delete-store', store)">Excluir</button>
          </div>
        </article>
      </div>

      <form class="multistore-form multistore-form--add" data-testid="multistore-new-form" @submit.prevent="emitCreateStore">
        <div class="multistore-form__row">
          <label class="multistore-form__field">
            <span class="multistore-form__label">Nome da loja</span>
            <input v-model="newStore.name" class="module-shell__input" type="text" placeholder="Nome da loja *" :disabled="busy">
          </label>
          <label class="multistore-form__field">
            <span class="multistore-form__label">Codigo</span>
            <input v-model="newStore.code" class="module-shell__input" type="text" placeholder="Codigo curto" :disabled="busy">
          </label>
          <label class="multistore-form__field">
            <span class="multistore-form__label">Cidade</span>
            <input v-model="newStore.city" class="module-shell__input" type="text" placeholder="Cidade" :disabled="busy">
          </label>
          <label class="multistore-form__field">
            <span class="multistore-form__label">Template padrao</span>
            <select v-model="newStore.defaultTemplateId" class="module-shell__input" :disabled="busy">
              <option v-for="option in templateOptions" :key="`new-${option.value || 'default'}`" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
        </div>

        <div class="multistore-form__row multistore-form__row--goals">
          <label class="multistore-form__field">
            <span class="multistore-form__label">Meta mensal (R$)</span>
            <input v-model="newStore.monthlyGoal" class="module-shell__input" type="number" min="0" step="100" :disabled="busy">
          </label>
          <label class="multistore-form__field">
            <span class="multistore-form__label">Meta semanal (R$)</span>
            <input v-model="newStore.weeklyGoal" class="module-shell__input" type="number" min="0" step="100" :disabled="busy">
          </label>
          <label class="multistore-form__field">
            <span class="multistore-form__label">Ticket medio alvo (R$)</span>
            <input v-model="newStore.avgTicketGoal" class="module-shell__input" type="number" min="0" step="100" :disabled="busy">
          </label>
          <label class="multistore-form__field">
            <span class="multistore-form__label">Conversao alvo (%)</span>
            <input v-model="newStore.conversionGoal" class="module-shell__input" type="number" min="0" max="100" step="1" :disabled="busy">
          </label>
          <label class="multistore-form__field">
            <span class="multistore-form__label">P.A. alvo</span>
            <input v-model="newStore.paGoal" class="module-shell__input" type="number" min="0" step="0.1" :disabled="busy">
          </label>
        </div>

        <div class="multistore-form__actions">
          <label class="settings-toggle">
            <input v-model="newStore.cloneActiveRoster" type="checkbox" :disabled="busy">
            <span>Copiar consultores da loja ativa</span>
          </label>
          <button class="multistore-button multistore-button--primary" type="submit" :disabled="busy || !newStore.name.trim() || !newStore.code.trim()">Adicionar loja</button>
        </div>
      </form>
    </article>
  </section>
</template>