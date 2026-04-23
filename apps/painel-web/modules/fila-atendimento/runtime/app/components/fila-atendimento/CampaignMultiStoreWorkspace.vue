<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FilaAtendimentoCampaign, FilaAtendimentoWorkspaceBundle } from '~/types/fila-atendimento'
import { formatCurrencyBRL } from '~/utils/fila-atendimento/metrics'
import { deriveCampaignStatus } from '~/utils/fila-atendimento/campaigns'

const props = defineProps<{
  bundles: FilaAtendimentoWorkspaceBundle[]
  pending?: boolean
  errorMessage?: string
  scopeLabel?: string
}>()

const typeFilter = ref<'todas' | 'interna' | 'comercial'>('todas')
const selectedStoreId = ref('')

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

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function buildCampaignStats(campaignId: string, history: Array<Record<string, unknown>>) {
  return history.reduce((accumulator, entry) => {
    const matches = Array.isArray(entry.campaignMatches) ? entry.campaignMatches : []
    for (const match of matches) {
      if (normalizeText((match as { campaignId?: unknown }).campaignId) !== campaignId) {
        continue
      }

      accumulator.hits += 1
      accumulator.bonus += Number((match as { bonusValue?: unknown }).bonusValue || 0)
    }

    return accumulator
  }, { hits: 0, bonus: 0 })
}

const storeOptions = computed(() => props.bundles.map((bundle) => ({
  value: bundle.storeId,
  label: bundle.storeName || bundle.storeCode || bundle.storeId
})))

const campaignItems = computed(() => props.bundles.flatMap((bundle) => {
  const campaigns = bundle.settings?.campaigns || []
  const history = (bundle.reportResults || []) as Array<Record<string, unknown>>

  return campaigns.map((campaign) => {
    const stats = buildCampaignStats(normalizeText(campaign.id), history)
    return {
      key: `${bundle.storeId}:${normalizeText(campaign.id) || normalizeText(campaign.name)}`,
      campaign,
      stats,
      storeId: bundle.storeId,
      storeName: bundle.storeName,
      storeCode: bundle.storeCode
    }
  })
}))

const filteredCampaigns = computed(() => campaignItems.value.filter((item) => {
  if (selectedStoreId.value && item.storeId !== selectedStoreId.value) {
    return false
  }

  if (typeFilter.value !== 'todas' && item.campaign.campaignType !== typeFilter.value) {
    return false
  }

  return true
}))

const totalBonus = computed(() => filteredCampaigns.value.reduce((sum, item) => sum + Number(item.stats.bonus || 0), 0))
const totalHits = computed(() => filteredCampaigns.value.reduce((sum, item) => sum + Number(item.stats.hits || 0), 0))
const activeCampaignCount = computed(() => filteredCampaigns.value.filter((item) => item.campaign.isActive).length)

function campaignStatus(campaign: FilaAtendimentoCampaign) {
  return deriveCampaignStatus(campaign)
}

function listText(values: string[]) {
  return values.length ? values.join(', ') : 'Sem filtro'
}

function periodText(campaign: FilaAtendimentoCampaign) {
  if (!campaign.startsAt && !campaign.endsAt) {
    return 'Sem periodo definido'
  }

  return `${campaign.startsAt || 'sem inicio'} ate ${campaign.endsAt || 'sem fim'}`
}
</script>

<template>
  <section class="admin-panel" data-testid="campaigns-multistore-panel">
    <header class="admin-panel__header">
      <h2 class="admin-panel__title">Campanhas consolidadas</h2>
      <p class="admin-panel__text">Leitura multi-loja das campanhas do módulo com filtro interno por loja.</p>
      <p class="settings-card__text">{{ scopeLabel || 'Todas as lojas' }}</p>
    </header>

    <article class="insight-card">
      <p class="settings-card__text">No modo multi-loja esta tela fica em leitura consolidada. Para criar, editar ou remover campanhas, selecione uma loja específica no topo.</p>
    </article>

    <article v-if="errorMessage" class="insight-card">
      <p class="settings-card__text">{{ errorMessage }}</p>
    </article>

    <article v-else-if="pending && !campaignItems.length" class="insight-card">
      <p class="settings-card__text">Carregando campanhas consolidadas...</p>
    </article>

    <div v-else class="space-y-4">
      <div class="toolbar-card campaign-toolbar">
        <label class="toolbar-card__field">
          <span class="module-shell__label">Loja</span>
          <select v-model="selectedStoreId" class="module-shell__input">
            <option value="">Todas as lojas</option>
            <option v-for="option in storeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>
      </div>

      <section class="metric-grid" data-testid="campaigns-summary">
        <article class="metric-card"><span class="metric-card__label">Campanhas visíveis</span><strong class="metric-card__value">{{ filteredCampaigns.length }}</strong></article>
        <article class="metric-card"><span class="metric-card__label">Campanhas ativas</span><strong class="metric-card__value">{{ activeCampaignCount }}</strong></article>
        <article class="metric-card"><span class="metric-card__label">Aplicações no histórico</span><strong class="metric-card__value">{{ totalHits }}</strong></article>
        <article class="metric-card"><span class="metric-card__label">Bônus acumulado</span><strong class="metric-card__value">{{ formatCurrencyBRL(totalBonus) }}</strong></article>
      </section>

      <div class="module-tabbar">
        <button class="module-tabbar__item" :class="{ 'module-tabbar__item--active': typeFilter === 'todas' }" type="button" @click="typeFilter = 'todas'">Todas</button>
        <button class="module-tabbar__item" :class="{ 'module-tabbar__item--active': typeFilter === 'interna' }" type="button" @click="typeFilter = 'interna'">Internas</button>
        <button class="module-tabbar__item" :class="{ 'module-tabbar__item--active': typeFilter === 'comercial' }" type="button" @click="typeFilter = 'comercial'">Comerciais</button>
      </div>

      <div class="settings-grid campaign-list">
        <article v-if="!filteredCampaigns.length" class="settings-card">
          <p class="settings-card__text">Nenhuma campanha encontrada no recorte atual.</p>
        </article>

        <article v-for="item in filteredCampaigns" :key="item.key" class="settings-card campaign-card">
          <header class="settings-card__header">
            <div class="campaign-card__title-row">
              <h3 class="settings-card__title">{{ item.campaign.name || 'Campanha sem nome' }}</h3>
              <span :class="['campaign-status', STATUS_CLASS[campaignStatus(item.campaign)]]">{{ STATUS_LABEL[campaignStatus(item.campaign)] }}</span>
              <span class="insight-tag">{{ item.campaign.campaignType === 'comercial' ? 'Comercial' : 'Interna' }}</span>
              <span class="queue-card__store-badge">{{ item.storeName || item.storeCode || item.storeId }}</span>
            </div>
            <p class="settings-card__text">{{ item.campaign.description || 'Sem descrição.' }}</p>
          </header>

          <div class="chip-list">
            <span class="insight-tag">Aplicações: <strong>{{ item.stats.hits }}</strong></span>
            <span class="insight-tag">Bônus total: <strong>{{ formatCurrencyBRL(item.stats.bonus) }}</strong></span>
            <span class="insight-tag">Período: <strong>{{ periodText(item.campaign) }}</strong></span>
          </div>

          <div class="campaign-grid">
            <div class="settings-field"><span>Desfecho alvo</span><strong>{{ item.campaign.targetOutcome || 'qualquer' }}</strong></div>
            <div class="settings-field"><span>Cliente recorrente</span><strong>{{ item.campaign.existingCustomerFilter || 'all' }}</strong></div>
            <div class="settings-field"><span>Venda mínima</span><strong>{{ formatCurrencyBRL(item.campaign.minSaleAmount || 0) }}</strong></div>
            <div class="settings-field"><span>Duração máxima</span><strong>{{ Number(item.campaign.maxServiceMinutes || 0) }} min</strong></div>
            <div class="settings-field"><span>Bônus fixo</span><strong>{{ formatCurrencyBRL(item.campaign.bonusFixed || 0) }}</strong></div>
            <div class="settings-field"><span>Bônus percentual</span><strong>{{ Number(item.campaign.bonusRate || 0).toFixed(3) }}</strong></div>
          </div>

          <div class="campaign-grid campaign-grid--options">
            <div class="settings-field">
              <span>Produtos alvo</span>
              <p class="settings-card__text">{{ listText(item.campaign.productCodes || []) }}</p>
            </div>
            <div class="settings-field">
              <span>Origens alvo</span>
              <p class="settings-card__text">{{ listText(item.campaign.sourceIds || []) }}</p>
            </div>
            <div class="settings-field">
              <span>Motivos alvo</span>
              <p class="settings-card__text">{{ listText(item.campaign.reasonIds || []) }}</p>
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.campaign-toolbar {
  grid-template-columns: minmax(0, 18rem);
}

@media (max-width: 860px) {
  .campaign-toolbar {
    grid-template-columns: 1fr;
  }
}
</style>