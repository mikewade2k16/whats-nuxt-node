<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { FilaAtendimentoCampaign, FilaAtendimentoOperationState } from '~/types/fila-atendimento'
import { formatCurrencyBRL } from '~/utils/fila-atendimento/metrics'
import { buildCampaignPerformance, deriveCampaignStatus, normalizeCampaign } from '~/utils/fila-atendimento/campaigns'

const props = defineProps<{
  state: FilaAtendimentoOperationState
  canManage: boolean
  busy: boolean
}>()

const emit = defineEmits<{
  'add-campaign': [payload: FilaAtendimentoCampaign]
  'update-campaign': [campaignId: string, payload: FilaAtendimentoCampaign]
  'remove-campaign': [campaignId: string]
}>()

const drafts = ref<Record<string, FilaAtendimentoCampaign>>({})
const newCampaign = reactive<FilaAtendimentoCampaign>(normalizeCampaign({}))
const typeFilter = ref<'todas' | 'interna' | 'comercial'>('todas')

const targetOutcomeOptions = [
  { value: 'compra-reserva', label: 'Compra ou reserva' },
  { value: 'compra', label: 'Compra' },
  { value: 'reserva', label: 'Reserva' },
  { value: 'nao-compra', label: 'Nao compra' },
  { value: 'qualquer', label: 'Qualquer desfecho' }
] as const

const existingCustomerFilterOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'yes', label: 'Somente sim' },
  { value: 'no', label: 'Somente nao' }
] as const

const STATUS_LABEL: Record<string, string> = {
  ativa: 'Em andamento',
  aguardando: 'Aguardando',
  encerrada: 'Encerrada',
  inativa: 'Desativada'
}

const STATUS_CLASS: Record<string, string> = {
  ativa: 'campaign-status--ativa',
  aguardando: 'campaign-status--aguardando',
  encerrada: 'campaign-status--encerrada',
  inativa: 'campaign-status--inativa'
}

const campaignStats = computed(() => {
  const statsByCampaignId = new Map(props.state.campaigns.map((campaign) => [campaign.id, { hits: 0, bonus: 0 }]))

  for (const entry of props.state.serviceHistory) {
    for (const match of Array.isArray(entry.campaignMatches) ? entry.campaignMatches : []) {
      const campaignId = String(match?.campaignId ?? '').trim()
      const current = statsByCampaignId.get(campaignId)
      if (!current) {
        continue
      }

      current.hits += 1
      current.bonus += Number(match?.bonusValue || 0)
    }
  }

  return statsByCampaignId
})

const totalBonus = computed(() =>
  [...campaignStats.value.values()].reduce((sum, item) => sum + Number(item.bonus || 0), 0)
)

const totalHits = computed(() =>
  [...campaignStats.value.values()].reduce((sum, item) => sum + Number(item.hits || 0), 0)
)

const activeCampaignCount = computed(() => props.state.campaigns.filter((campaign) => campaign.isActive).length)

const filteredCampaigns = computed(() => {
  if (typeFilter.value === 'todas') {
    return props.state.campaigns
  }

  return props.state.campaigns.filter((campaign) => campaign.campaignType === typeFilter.value)
})

const performance = computed(() => buildCampaignPerformance(props.state.campaigns, props.state.serviceHistory))

const campaignProductOptions = computed(() =>
  props.state.productCatalog
    .filter((product) => String(product.code || '').trim())
    .map((product) => ({
      value: String(product.code || '').trim().toUpperCase(),
      label: `${product.name} (${String(product.code || '').trim().toUpperCase()})`
    }))
)

watch(
  () => props.state.campaigns,
  (campaigns) => {
    drafts.value = Object.fromEntries(
      campaigns.map((campaign) => [campaign.id, normalizeCampaign(campaign)])
    )
  },
  { immediate: true, deep: true }
)

function updateDraft(campaignId: string, patch: Partial<FilaAtendimentoCampaign>) {
  const current = drafts.value[campaignId]
  if (!current) {
    return
  }

  drafts.value = {
    ...drafts.value,
    [campaignId]: normalizeCampaign({
      ...current,
      ...patch,
      id: campaignId
    })
  }
}

function updateNewCampaign(patch: Partial<FilaAtendimentoCampaign>) {
  Object.assign(newCampaign, normalizeCampaign({
    ...newCampaign,
    ...patch
  }))
}

function toggleDraftListValue(campaignId: string, field: 'productCodes' | 'sourceIds' | 'reasonIds', value: string) {
  const current = drafts.value[campaignId]
  if (!current) {
    return
  }

  const currentValues = current[field]
  updateDraft(campaignId, {
    [field]: currentValues.includes(value)
      ? currentValues.filter((item) => item !== value)
      : [...currentValues, value]
  } as Partial<FilaAtendimentoCampaign>)
}

function toggleNewCampaignListValue(field: 'productCodes' | 'sourceIds' | 'reasonIds', value: string) {
  const currentValues = newCampaign[field]
  updateNewCampaign({
    [field]: currentValues.includes(value)
      ? currentValues.filter((item) => item !== value)
      : [...currentValues, value]
  } as Partial<FilaAtendimentoCampaign>)
}

function saveCampaign(campaignId: string) {
  const current = drafts.value[campaignId]
  if (!current) {
    return
  }

  emit('update-campaign', campaignId, normalizeCampaign(current))
}

function createCampaign() {
  emit('add-campaign', normalizeCampaign(newCampaign))
  Object.assign(newCampaign, normalizeCampaign({}))
}

function removeCampaign(campaignId: string) {
  emit('remove-campaign', campaignId)
}

function statusOf(campaign: FilaAtendimentoCampaign) {
  return deriveCampaignStatus(campaign)
}
</script>

<template>
  <section class="admin-panel" data-testid="campaigns-panel">
    <header class="admin-panel__header">
      <h2 class="admin-panel__title">Campanhas e regras comerciais</h2>
      <p class="admin-panel__text">Regras aplicadas automaticamente no fechamento para auditoria, incentivo e rastreio de vendas.</p>
    </header>

    <section class="metric-grid" data-testid="campaigns-summary">
      <article class="metric-card"><span class="metric-card__label">Campanhas cadastradas</span><strong class="metric-card__value">{{ state.campaigns.length }}</strong></article>
      <article class="metric-card"><span class="metric-card__label">Campanhas ativas</span><strong class="metric-card__value">{{ activeCampaignCount }}</strong></article>
      <article class="metric-card"><span class="metric-card__label">Aplicacoes no historico</span><strong class="metric-card__value">{{ totalHits }}</strong></article>
      <article class="metric-card"><span class="metric-card__label">Bonus acumulado</span><strong class="metric-card__value">{{ formatCurrencyBRL(totalBonus) }}</strong></article>
    </section>

    <div class="module-tabbar">
      <button class="module-tabbar__item" :class="{ 'module-tabbar__item--active': typeFilter === 'todas' }" type="button" @click="typeFilter = 'todas'">Todas</button>
      <button class="module-tabbar__item" :class="{ 'module-tabbar__item--active': typeFilter === 'interna' }" type="button" @click="typeFilter = 'interna'">Internas</button>
      <button class="module-tabbar__item" :class="{ 'module-tabbar__item--active': typeFilter === 'comercial' }" type="button" @click="typeFilter = 'comercial'">Comerciais</button>
    </div>

    <form v-if="canManage" class="settings-card campaign-card" data-testid="campaigns-new-form" @submit.prevent="createCampaign">
      <header class="settings-card__header">
        <h3 class="settings-card__title">Nova campanha</h3>
        <p class="settings-card__text">Configure regras comerciais, produtos-alvo e filtros usados no fechamento hospedado.</p>
      </header>

      <div class="campaign-grid">
        <label class="settings-field"><span>Nome</span><input class="module-shell__input" :value="newCampaign.name" type="text" :disabled="busy" @input="updateNewCampaign({ name: ($event.target as HTMLInputElement).value })"></label>
        <label class="settings-field"><span>Descricao</span><input class="module-shell__input" :value="newCampaign.description" type="text" :disabled="busy" @input="updateNewCampaign({ description: ($event.target as HTMLInputElement).value })"></label>
        <label class="settings-field">
          <span>Tipo</span>
          <select class="module-shell__input" :value="newCampaign.campaignType" :disabled="busy" @change="updateNewCampaign({ campaignType: ($event.target as HTMLSelectElement).value as FilaAtendimentoCampaign['campaignType'] })">
            <option value="interna">Interna</option>
            <option value="comercial">Comercial</option>
          </select>
        </label>
        <label class="settings-field"><span>Inicio</span><input class="module-shell__input" :value="newCampaign.startsAt" type="date" :disabled="busy" @input="updateNewCampaign({ startsAt: ($event.target as HTMLInputElement).value })"></label>
        <label class="settings-field"><span>Fim</span><input class="module-shell__input" :value="newCampaign.endsAt" type="date" :disabled="busy" @input="updateNewCampaign({ endsAt: ($event.target as HTMLInputElement).value })"></label>
        <label class="settings-field">
          <span>Desfecho alvo</span>
          <select class="module-shell__input" :value="newCampaign.targetOutcome" :disabled="busy" @change="updateNewCampaign({ targetOutcome: ($event.target as HTMLSelectElement).value as FilaAtendimentoCampaign['targetOutcome'] })">
            <option v-for="option in targetOutcomeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>
        <label class="settings-field">
          <span>Cliente recorrente</span>
          <select class="module-shell__input" :value="newCampaign.existingCustomerFilter" :disabled="busy" @change="updateNewCampaign({ existingCustomerFilter: ($event.target as HTMLSelectElement).value as FilaAtendimentoCampaign['existingCustomerFilter'] })">
            <option v-for="option in existingCustomerFilterOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>
        <label class="settings-field"><span>Venda minima (R$)</span><input class="module-shell__input" :value="newCampaign.minSaleAmount" type="number" min="0" step="1" :disabled="busy" @input="updateNewCampaign({ minSaleAmount: Number(($event.target as HTMLInputElement).value || 0) })"></label>
        <label class="settings-field"><span>Duracao maxima (min)</span><input class="module-shell__input" :value="newCampaign.maxServiceMinutes" type="number" min="0" step="1" :disabled="busy" @input="updateNewCampaign({ maxServiceMinutes: Number(($event.target as HTMLInputElement).value || 0) })"></label>
        <label class="settings-field"><span>Bonus fixo (R$)</span><input class="module-shell__input" :value="newCampaign.bonusFixed" type="number" min="0" step="0.01" :disabled="busy" @input="updateNewCampaign({ bonusFixed: Number(($event.target as HTMLInputElement).value || 0) })"></label>
        <label class="settings-field"><span>Bonus percentual</span><input class="module-shell__input" :value="newCampaign.bonusRate" type="number" min="0" step="0.001" :disabled="busy" @input="updateNewCampaign({ bonusRate: Number(($event.target as HTMLInputElement).value || 0) })"></label>
      </div>

      <div class="campaign-grid campaign-grid--toggles">
        <label class="settings-toggle"><input :checked="newCampaign.isActive" type="checkbox" :disabled="busy" @change="updateNewCampaign({ isActive: ($event.target as HTMLInputElement).checked })"><span>Campanha ativa</span></label>
        <label class="settings-toggle"><input :checked="newCampaign.queueJumpOnly" type="checkbox" :disabled="busy" @change="updateNewCampaign({ queueJumpOnly: ($event.target as HTMLInputElement).checked })"><span>Somente fora da vez</span></label>
      </div>

      <div class="campaign-grid campaign-grid--options">
        <div class="settings-field">
          <span>Origens alvo</span>
          <div class="campaign-option-list">
            <label v-for="option in state.customerSourceOptions" :key="option.id" class="settings-toggle">
              <input type="checkbox" :checked="newCampaign.sourceIds.includes(option.id)" :disabled="busy" @change="toggleNewCampaignListValue('sourceIds', option.id)">
              <span>{{ option.label }}</span>
            </label>
          </div>
        </div>
        <div class="settings-field">
          <span>Motivos alvo</span>
          <div class="campaign-option-list">
            <label v-for="option in state.visitReasonOptions" :key="option.id" class="settings-toggle">
              <input type="checkbox" :checked="newCampaign.reasonIds.includes(option.id)" :disabled="busy" @change="toggleNewCampaignListValue('reasonIds', option.id)">
              <span>{{ option.label }}</span>
            </label>
          </div>
        </div>
        <div class="settings-field">
          <span>Produtos alvo por codigo</span>
          <p v-if="!campaignProductOptions.length" class="settings-card__text">Cadastre codigos em Configuracoes > Produtos para automatizar por item.</p>
          <div v-else class="campaign-option-list">
            <label v-for="option in campaignProductOptions" :key="option.value" class="settings-toggle">
              <input type="checkbox" :checked="newCampaign.productCodes.includes(option.value)" :disabled="busy" @change="toggleNewCampaignListValue('productCodes', option.value)">
              <span>{{ option.label }}</span>
            </label>
          </div>
        </div>
      </div>

      <div class="toolbar-card__actions">
        <button class="column-action column-action--primary" type="submit" :disabled="busy || !newCampaign.name.trim()">Criar campanha</button>
      </div>
    </form>

    <div class="settings-grid campaign-list" data-testid="campaigns-list">
      <article v-if="!filteredCampaigns.length" class="settings-card">
        <p class="settings-card__text">{{ state.campaigns.length ? 'Nenhuma campanha nessa categoria.' : 'Nenhuma campanha cadastrada.' }}</p>
      </article>

      <form
        v-for="campaign in filteredCampaigns"
        :key="campaign.id"
        class="settings-card campaign-card"
        @submit.prevent="saveCampaign(campaign.id)"
      >
        <header class="settings-card__header">
          <div class="campaign-card__title-row">
            <h3 class="settings-card__title">{{ campaign.name || 'Campanha sem nome' }}</h3>
            <span :class="['campaign-status', STATUS_CLASS[statusOf(campaign)]]">{{ STATUS_LABEL[statusOf(campaign)] }}</span>
            <span class="insight-tag">{{ campaign.campaignType === 'comercial' ? 'Comercial' : 'Interna' }}</span>
          </div>
          <p class="settings-card__text">{{ campaign.description || 'Sem descricao' }}</p>
        </header>

        <div class="chip-list">
          <span class="insight-tag">Aplicacoes: <strong>{{ campaignStats.get(campaign.id)?.hits || 0 }}</strong></span>
          <span class="insight-tag">Bonus total: <strong>{{ formatCurrencyBRL(campaignStats.get(campaign.id)?.bonus || 0) }}</strong></span>
        </div>

        <template v-if="performance.get(campaign.id)?.hasPeriod">
          <div class="campaign-perf">
            <div class="campaign-perf__col campaign-perf__col--hit">
              <span class="campaign-perf__label">Dentro da campanha</span>
              <strong class="campaign-perf__value">{{ performance.get(campaign.id)?.hit.total || 0 }} atend.</strong>
              <span class="campaign-perf__sub">{{ (performance.get(campaign.id)?.hit.conversionRate || 0).toFixed(1) }}% conv. · {{ formatCurrencyBRL(performance.get(campaign.id)?.hit.ticketAverage || 0) }}</span>
            </div>
            <div class="campaign-perf__divider">vs</div>
            <div class="campaign-perf__col">
              <span class="campaign-perf__label">Fora da campanha</span>
              <strong class="campaign-perf__value">{{ performance.get(campaign.id)?.nonHit.total || 0 }} atend.</strong>
              <span class="campaign-perf__sub">{{ (performance.get(campaign.id)?.nonHit.conversionRate || 0).toFixed(1) }}% conv. · {{ formatCurrencyBRL(performance.get(campaign.id)?.nonHit.ticketAverage || 0) }}</span>
            </div>
          </div>
        </template>

        <div class="campaign-grid">
          <label class="settings-field"><span>Nome</span><input class="module-shell__input" :value="drafts[campaign.id]?.name || ''" type="text" :disabled="!canManage || busy" @input="updateDraft(campaign.id, { name: ($event.target as HTMLInputElement).value })"></label>
          <label class="settings-field"><span>Descricao</span><input class="module-shell__input" :value="drafts[campaign.id]?.description || ''" type="text" :disabled="!canManage || busy" @input="updateDraft(campaign.id, { description: ($event.target as HTMLInputElement).value })"></label>
          <label class="settings-field">
            <span>Tipo</span>
            <select class="module-shell__input" :value="drafts[campaign.id]?.campaignType || 'interna'" :disabled="!canManage || busy" @change="updateDraft(campaign.id, { campaignType: ($event.target as HTMLSelectElement).value as FilaAtendimentoCampaign['campaignType'] })">
              <option value="interna">Interna</option>
              <option value="comercial">Comercial</option>
            </select>
          </label>
          <label class="settings-field"><span>Inicio</span><input class="module-shell__input" :value="drafts[campaign.id]?.startsAt || ''" type="date" :disabled="!canManage || busy" @input="updateDraft(campaign.id, { startsAt: ($event.target as HTMLInputElement).value })"></label>
          <label class="settings-field"><span>Fim</span><input class="module-shell__input" :value="drafts[campaign.id]?.endsAt || ''" type="date" :disabled="!canManage || busy" @input="updateDraft(campaign.id, { endsAt: ($event.target as HTMLInputElement).value })"></label>
          <label class="settings-field">
            <span>Desfecho alvo</span>
            <select class="module-shell__input" :value="drafts[campaign.id]?.targetOutcome || 'compra-reserva'" :disabled="!canManage || busy" @change="updateDraft(campaign.id, { targetOutcome: ($event.target as HTMLSelectElement).value as FilaAtendimentoCampaign['targetOutcome'] })">
              <option v-for="option in targetOutcomeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label class="settings-field">
            <span>Cliente recorrente</span>
            <select class="module-shell__input" :value="drafts[campaign.id]?.existingCustomerFilter || 'all'" :disabled="!canManage || busy" @change="updateDraft(campaign.id, { existingCustomerFilter: ($event.target as HTMLSelectElement).value as FilaAtendimentoCampaign['existingCustomerFilter'] })">
              <option v-for="option in existingCustomerFilterOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label class="settings-field"><span>Venda minima (R$)</span><input class="module-shell__input" :value="drafts[campaign.id]?.minSaleAmount || 0" type="number" min="0" step="1" :disabled="!canManage || busy" @input="updateDraft(campaign.id, { minSaleAmount: Number(($event.target as HTMLInputElement).value || 0) })"></label>
          <label class="settings-field"><span>Duracao maxima (min)</span><input class="module-shell__input" :value="drafts[campaign.id]?.maxServiceMinutes || 0" type="number" min="0" step="1" :disabled="!canManage || busy" @input="updateDraft(campaign.id, { maxServiceMinutes: Number(($event.target as HTMLInputElement).value || 0) })"></label>
          <label class="settings-field"><span>Bonus fixo (R$)</span><input class="module-shell__input" :value="drafts[campaign.id]?.bonusFixed || 0" type="number" min="0" step="0.01" :disabled="!canManage || busy" @input="updateDraft(campaign.id, { bonusFixed: Number(($event.target as HTMLInputElement).value || 0) })"></label>
          <label class="settings-field"><span>Bonus percentual</span><input class="module-shell__input" :value="drafts[campaign.id]?.bonusRate || 0" type="number" min="0" step="0.001" :disabled="!canManage || busy" @input="updateDraft(campaign.id, { bonusRate: Number(($event.target as HTMLInputElement).value || 0) })"></label>
        </div>

        <div class="campaign-grid campaign-grid--toggles">
          <label class="settings-toggle"><input type="checkbox" :checked="Boolean(drafts[campaign.id]?.isActive)" :disabled="!canManage || busy" @change="updateDraft(campaign.id, { isActive: ($event.target as HTMLInputElement).checked })"><span>Campanha ativa</span></label>
          <label class="settings-toggle"><input type="checkbox" :checked="Boolean(drafts[campaign.id]?.queueJumpOnly)" :disabled="!canManage || busy" @change="updateDraft(campaign.id, { queueJumpOnly: ($event.target as HTMLInputElement).checked })"><span>Somente fora da vez</span></label>
        </div>

        <div class="campaign-grid campaign-grid--options">
          <div class="settings-field">
            <span>Origens alvo</span>
            <div class="campaign-option-list">
              <label v-for="option in state.customerSourceOptions" :key="option.id" class="settings-toggle">
                <input type="checkbox" :checked="Boolean(drafts[campaign.id]?.sourceIds.includes(option.id))" :disabled="!canManage || busy" @change="toggleDraftListValue(campaign.id, 'sourceIds', option.id)">
                <span>{{ option.label }}</span>
              </label>
            </div>
          </div>
          <div class="settings-field">
            <span>Motivos alvo</span>
            <div class="campaign-option-list">
              <label v-for="option in state.visitReasonOptions" :key="option.id" class="settings-toggle">
                <input type="checkbox" :checked="Boolean(drafts[campaign.id]?.reasonIds.includes(option.id))" :disabled="!canManage || busy" @change="toggleDraftListValue(campaign.id, 'reasonIds', option.id)">
                <span>{{ option.label }}</span>
              </label>
            </div>
          </div>
          <div class="settings-field">
            <span>Produtos alvo por codigo</span>
            <p v-if="!campaignProductOptions.length" class="settings-card__text">Cadastre codigos em Configuracoes > Produtos para automatizar por item.</p>
            <div v-else class="campaign-option-list">
              <label v-for="option in campaignProductOptions" :key="option.value" class="settings-toggle">
                <input type="checkbox" :checked="Boolean(drafts[campaign.id]?.productCodes.includes(option.value))" :disabled="!canManage || busy" @change="toggleDraftListValue(campaign.id, 'productCodes', option.value)">
                <span>{{ option.label }}</span>
              </label>
            </div>
          </div>
        </div>

        <div v-if="canManage" class="toolbar-card__actions">
          <button class="column-action column-action--primary" type="submit" :disabled="busy">Salvar campanha</button>
          <button class="column-action column-action--secondary" type="button" :disabled="busy" @click="removeCampaign(campaign.id)">Excluir campanha</button>
        </div>
      </form>
    </div>
  </section>
</template>