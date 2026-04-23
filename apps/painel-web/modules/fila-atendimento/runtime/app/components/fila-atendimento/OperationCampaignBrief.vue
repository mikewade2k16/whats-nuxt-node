<script setup lang="ts">
import { computed } from 'vue'
import type { FilaAtendimentoCampaign } from '~/types/fila-atendimento'
import { deriveCampaignStatus } from '~/utils/fila-atendimento/campaigns'

const props = withDefaults(defineProps<{
  state: {
    campaigns?: FilaAtendimentoCampaign[]
  }
  actionTo?: string
  compact?: boolean
}>(), {
  compact: false
})

function formatPeriodLabel(startsAt: unknown, endsAt: unknown) {
  if (startsAt && endsAt) {
    return `${startsAt} ate ${endsAt}`
  }

  if (startsAt) {
    return `A partir de ${startsAt}`
  }

  if (endsAt) {
    return `Ate ${endsAt}`
  }

  return ''
}

const activeCommercialCampaigns = computed(() =>
  (props.state.campaigns || [])
    .filter((campaign) => (campaign.campaignType || 'interna') === 'comercial')
    .filter((campaign) => deriveCampaignStatus(campaign) === 'ativa')
    .map((campaign) => ({
      ...campaign,
      periodLabel: formatPeriodLabel(campaign.startsAt, campaign.endsAt)
    }))
)

const primaryCampaign = computed(() => activeCommercialCampaigns.value[0] || null)
const headline = computed(() => {
  const activeCount = activeCommercialCampaigns.value.length

  if (!activeCount) {
    return ''
  }

  if (props.compact) {
    if (activeCount === 1) {
      return primaryCampaign.value?.name || 'Campanha comercial'
    }

    return `${activeCount} campanhas ativas`
  }

  if (activeCount === 1) {
    return `Campanha ativa: ${primaryCampaign.value?.name || 'Campanha comercial'}`
  }

  return `${activeCount} campanhas comerciais ativas`
})

const subline = computed(() => {
  if (!primaryCampaign.value) {
    return ''
  }

  if (props.compact) {
    return activeCommercialCampaigns.value.length === 1 ? primaryCampaign.value.periodLabel : ''
  }

  if (activeCommercialCampaigns.value.length === 1 && primaryCampaign.value.periodLabel) {
    return primaryCampaign.value.periodLabel
  }

  return 'Abra os detalhes para consultar regras, produtos e metas.'
})
</script>

<template>
  <section
    v-if="activeCommercialCampaigns.length"
    class="operation-campaign-brief"
    :class="{ 'operation-campaign-brief--compact': compact }"
    data-testid="operation-campaign-brief"
  >
    <div class="operation-campaign-brief__accent" aria-hidden="true"></div>
    <div class="operation-campaign-brief__content">
      <span v-if="compact" class="operation-campaign-brief__eyebrow">Campanha</span>
      <strong class="operation-campaign-brief__headline">{{ headline }}</strong>
      <span v-if="subline" class="operation-campaign-brief__subline">{{ subline }}</span>
    </div>
    <NuxtLink v-if="actionTo" :to="actionTo" class="operation-campaign-brief__action">
      Ver campanha
    </NuxtLink>
  </section>
</template>

<style scoped>
.operation-campaign-brief {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.9rem;
  padding: 0.9rem 1rem;
  border-radius: 1rem;
  background: linear-gradient(135deg, rgba(234, 179, 8, 0.12) 0%, rgba(245, 158, 11, 0.08) 100%);
  border: 1px solid rgba(245, 158, 11, 0.24);
}

.operation-campaign-brief__accent {
  width: 0.45rem;
  height: 2.8rem;
  border-radius: 999px;
  background: linear-gradient(180deg, #fbbf24 0%, #f97316 100%);
}

.operation-campaign-brief__content {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
}

.operation-campaign-brief__eyebrow {
  display: inline-flex;
  align-items: center;
  min-height: 1.1rem;
  width: fit-content;
  padding: 0 0.45rem;
  border-radius: 999px;
  background: rgba(251, 191, 36, 0.16);
  color: #fde68a;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.operation-campaign-brief__headline {
  font-size: 0.9rem;
}

.operation-campaign-brief__subline {
  font-size: 0.78rem;
  color: rgba(255, 248, 235, 0.78);
}

.operation-campaign-brief__action {
  color: #fde68a;
  font-size: 0.78rem;
  font-weight: 700;
  text-decoration: none;
}

.operation-campaign-brief--compact {
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.45rem;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  min-width: 0;
}

.operation-campaign-brief--compact .operation-campaign-brief__accent {
  width: 0.3rem;
  height: 1.8rem;
}

.operation-campaign-brief--compact .operation-campaign-brief__content {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.3rem 0.45rem;
}

.operation-campaign-brief--compact .operation-campaign-brief__headline {
  min-width: 0;
  font-size: 0.82rem;
  line-height: 1.2;
}

.operation-campaign-brief--compact .operation-campaign-brief__subline {
  font-size: 0.7rem;
  color: rgba(255, 248, 235, 0.68);
}

.operation-campaign-brief--compact .operation-campaign-brief__action {
  justify-self: end;
  font-size: 0.72rem;
}

@media (max-width: 720px) {
  .operation-campaign-brief {
    grid-template-columns: 1fr;
  }

  .operation-campaign-brief--compact {
    grid-template-columns: auto minmax(0, 1fr);
  }
}
</style>