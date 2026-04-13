<script setup lang="ts">
import type { IndicatorChartDatum } from '~/types/indicators'

const props = withDefaults(defineProps<{
  items: IndicatorChartDatum[]
  max?: number
  valueSuffix?: string
}>(), {
  max: 100,
  valueSuffix: '%'
})

const ceiling = computed(() => {
  return Math.max(props.max, ...props.items.map((item) => item.value), 1)
})

function barHeight(value: number) {
  return `${Math.max((value / ceiling.value) * 100, 12)}%`
}

function formatValue(value: number) {
  const normalized = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)
  return `${normalized}${props.valueSuffix}`
}
</script>

<template>
  <div class="indicators-bar-chart" role="img" aria-label="Grafico de barras dos indicadores por loja">
    <div class="indicators-bar-chart__grid">
      <div
        v-for="item in items"
        :key="item.id"
        class="indicators-bar-chart__item"
      >
        <span class="indicators-bar-chart__value">{{ formatValue(item.value) }}</span>

        <div class="indicators-bar-chart__track">
          <div
            class="indicators-bar-chart__bar"
            :style="{
              height: barHeight(item.value),
              background: `linear-gradient(180deg, ${item.color} 0%, ${item.color} 100%)`
            }"
          />
        </div>

        <p class="indicators-bar-chart__label">{{ item.label }}</p>
        <p v-if="item.helper" class="indicators-bar-chart__helper">{{ item.helper }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.indicators-bar-chart {
  width: 100%;
}

.indicators-bar-chart__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(4.8rem, 1fr));
  gap: 0.9rem;
  align-items: end;
  min-height: 18rem;
}

.indicators-bar-chart__item {
  display: grid;
  gap: 0.55rem;
  justify-items: center;
}

.indicators-bar-chart__value {
  font-size: 0.9rem;
  font-weight: 600;
  color: rgb(var(--text));
}

.indicators-bar-chart__track {
  position: relative;
  display: flex;
  align-items: end;
  justify-content: center;
  width: 100%;
  min-height: 14rem;
  padding: 0.65rem;
  border-radius: 1.1rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, rgba(15, 23, 42, 0.24) 100%),
    rgba(15, 23, 42, 0.28);
  border: 1px solid rgba(148, 163, 184, 0.14);
}

.indicators-bar-chart__bar {
  width: 100%;
  border-radius: 0.9rem 0.9rem 0.35rem 0.35rem;
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.2);
}

.indicators-bar-chart__label {
  margin: 0;
  font-size: 0.84rem;
  font-weight: 600;
  text-align: center;
}

.indicators-bar-chart__helper {
  margin: 0;
  font-size: 0.72rem;
  color: rgb(var(--muted));
  text-align: center;
}
</style>