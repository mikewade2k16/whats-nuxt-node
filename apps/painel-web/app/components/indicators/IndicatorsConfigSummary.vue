<script setup lang="ts">
import type { IndicatorsConfigSnapshot } from '~/types/indicators-management'

defineProps<{
  snapshot: IndicatorsConfigSnapshot
}>()
</script>

<template>
  <div class="indicators-config-summary">
    <article class="indicators-config-summary__card">
      <p class="indicators-config-summary__label">Indicadores ativos</p>
      <strong class="indicators-config-summary__value">{{ snapshot.enabledIndicators }}</strong>
      <span class="indicators-config-summary__helper">Catalogo real do perfil em edicao</span>
    </article>

    <article class="indicators-config-summary__card">
      <p class="indicators-config-summary__label">Peso habilitado</p>
      <strong class="indicators-config-summary__value">{{ snapshot.enabledWeight }}%</strong>
      <span class="indicators-config-summary__helper">Deve fechar em 100% antes do backend</span>
    </article>

    <article class="indicators-config-summary__card">
      <p class="indicators-config-summary__label">Overrides por loja</p>
      <strong class="indicators-config-summary__value">{{ snapshot.customStores }}</strong>
      <span class="indicators-config-summary__helper">Lojas com regra alem do perfil base</span>
    </article>

    <article class="indicators-config-summary__card">
      <p class="indicators-config-summary__label">Bindings provider</p>
      <strong class="indicators-config-summary__value">{{ snapshot.providerBindings }}</strong>
      <span class="indicators-config-summary__helper">Indicadores puxando dados de outros modulos</span>
    </article>

    <article class="indicators-config-summary__card">
      <p class="indicators-config-summary__label">Evidencia obrigatoria</p>
      <strong class="indicators-config-summary__value">{{ snapshot.requiredEvidence }}</strong>
      <span class="indicators-config-summary__helper">Indicadores que ja nascem com foto obrigatoria</span>
    </article>
  </div>
</template>

<style scoped>
.indicators-config-summary {
  display: grid;
  gap: 0.9rem;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
}

.indicators-config-summary__card {
  display: grid;
  gap: 0.3rem;
  padding: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.03);
}

.indicators-config-summary__label {
  margin: 0;
  font-size: 0.72rem;
  color: rgb(var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.indicators-config-summary__value {
  font-size: 1.35rem;
}

.indicators-config-summary__helper {
  color: rgb(var(--muted));
  font-size: 0.82rem;
}
</style>