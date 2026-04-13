<script setup lang="ts">
import type { IndicatorsProviderHealth, IndicatorsProviderStatus } from '~/types/indicators-management'

const props = defineProps<{
  providers: IndicatorsProviderHealth[]
  title?: string
  description?: string
}>()

const onlineCount = computed(() => props.providers.filter(provider => provider.status === 'online').length)
const attentionCount = computed(() => props.providers.filter(provider => provider.status === 'attention').length)

function colorByStatus(status: IndicatorsProviderStatus) {
  if (status === 'online') return 'success'
  if (status === 'attention') return 'warning'
  return 'error'
}
</script>

<template>
  <UCard class="indicators-provider-health" :ui="{ body: 'indicators-provider-health__body' }">
    <template #header>
      <div class="indicators-provider-health__header">
        <div>
          <p class="indicators-provider-health__eyebrow">Providers</p>
          <h3 class="indicators-provider-health__title">{{ props.title || 'Saude dos providers' }}</h3>
          <p class="indicators-provider-health__copy">{{ props.description || 'Leitura mock dos bindings entre indicadores e modulos externos.' }}</p>
        </div>
      </div>
    </template>

    <div class="indicators-provider-health__summary-grid">
      <div class="indicators-provider-health__summary-card">
        <span>Online</span>
        <strong>{{ onlineCount }}/{{ props.providers.length }}</strong>
      </div>
      <div class="indicators-provider-health__summary-card">
        <span>Atencao</span>
        <strong>{{ attentionCount }}</strong>
      </div>
    </div>

    <UCollapsible :default-open="false" class="indicators-provider-health__collapsible">
      <template #default="{ open }">
        <div class="indicators-provider-health__collapsible-trigger">
          <div>
            <p class="indicators-provider-health__trigger-title">Mostrar providers</p>
            <p class="indicators-provider-health__trigger-copy">Abra apenas quando precisar conferir cobertura, binding e observacoes.</p>
          </div>

          <div class="indicators-provider-health__trigger-side">
            <UBadge color="neutral" variant="soft">{{ props.providers.length }} providers</UBadge>
            <UIcon :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="indicators-provider-health__chevron" />
          </div>
        </div>
      </template>

      <template #content>
        <div class="indicators-provider-health__grid">
          <UCollapsible
            v-for="provider in props.providers"
            :key="provider.id"
            :default-open="false"
            class="indicators-provider-health__card"
          >
            <template #default="{ open: providerOpen }">
              <div class="indicators-provider-health__card-head">
                <div>
                  <strong>{{ provider.name }}</strong>
                  <p>{{ provider.sourceModule }}</p>
                </div>

                <div class="indicators-provider-health__card-head-side">
                  <UBadge :color="colorByStatus(provider.status)" variant="soft">{{ provider.status }}</UBadge>
                  <span class="indicators-provider-health__card-meta">{{ provider.freshnessLabel }}</span>
                  <UIcon :name="providerOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="indicators-provider-health__chevron" />
                </div>
              </div>
            </template>

            <template #content>
              <div class="indicators-provider-health__card-content">
                <div class="indicators-provider-health__metrics">
                  <div class="indicators-provider-health__metric">
                    <span>Freshness</span>
                    <strong>{{ provider.freshnessLabel }}</strong>
                  </div>
                  <div class="indicators-provider-health__metric">
                    <span>Cobertura</span>
                    <strong>{{ provider.coverageLabel }}</strong>
                  </div>
                </div>

                <div class="indicators-provider-health__bindings">
                  <UBadge
                    v-for="binding in provider.mappedIndicators"
                    :key="`${provider.id}-${binding}`"
                    color="neutral"
                    variant="soft"
                  >
                    {{ binding }}
                  </UBadge>
                </div>

                <p class="indicators-provider-health__note">{{ provider.note }}</p>
              </div>
            </template>
          </UCollapsible>
        </div>
      </template>
    </UCollapsible>
  </UCard>
</template>

<style scoped>
.indicators-provider-health {
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(255, 255, 255, 0.03);
}

.indicators-provider-health__body {
  display: grid;
  gap: 1rem;
}

.indicators-provider-health__summary-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.indicators-provider-health__summary-card,
.indicators-provider-health__metric {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 0.85rem;
  border-radius: 0.85rem;
  background: rgba(255, 255, 255, 0.03);
}

.indicators-provider-health__summary-card span,
.indicators-provider-health__metric span,
.indicators-provider-health__trigger-copy,
.indicators-provider-health__card-head p,
.indicators-provider-health__note,
.indicators-provider-health__card-meta {
  color: rgb(var(--muted));
  font-size: 0.82rem;
}

.indicators-provider-health__summary-card strong {
  font-size: 1rem;
}

.indicators-provider-health__eyebrow {
  margin: 0 0 0.35rem;
  font-size: 0.74rem;
  color: rgb(var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.indicators-provider-health__title {
  margin: 0;
  font-size: 1.05rem;
}

.indicators-provider-health__copy {
  margin: 0.4rem 0 0;
  color: rgb(var(--muted));
}

.indicators-provider-health__collapsible {
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 1rem;
  background: rgba(15, 23, 42, 0.08);
}

.indicators-provider-health__collapsible-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.95rem 1rem;
}

.indicators-provider-health__trigger-title {
  margin: 0;
  font-weight: 600;
}

.indicators-provider-health__trigger-copy {
  margin: 0.25rem 0 0;
}

.indicators-provider-health__trigger-side,
.indicators-provider-health__card-head-side {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.indicators-provider-health__chevron {
  color: rgb(var(--muted));
}

.indicators-provider-health__grid {
  display: grid;
  gap: 0.85rem;
  padding: 0 1rem 1rem;
}

.indicators-provider-health__card {
  display: grid;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 1rem;
  background: rgba(15, 23, 42, 0.12);
  overflow: hidden;
}

.indicators-provider-health__card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.95rem;
}

.indicators-provider-health__card-head p {
  margin: 0.25rem 0 0;
}

.indicators-provider-health__metrics,
.indicators-provider-health__bindings {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.indicators-provider-health__card-content {
  display: grid;
  gap: 0.8rem;
  padding: 0 0.95rem 0.95rem;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.indicators-provider-health__metric {
  flex: 1 1 14rem;
}

@media (max-width: 720px) {
  .indicators-provider-health__summary-grid,
  .indicators-provider-health__metrics {
    grid-template-columns: 1fr;
  }

  .indicators-provider-health__collapsible-trigger,
  .indicators-provider-health__card-head,
  .indicators-provider-health__metric {
    flex-direction: column;
    align-items: flex-start;
  }

  .indicators-provider-health__trigger-side,
  .indicators-provider-health__card-head-side {
    width: 100%;
    justify-content: space-between;
  }
}
</style>