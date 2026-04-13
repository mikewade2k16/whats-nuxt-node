<script setup lang="ts">
import type { IndicatorRangePreset } from '~/types/indicators'

const props = defineProps<{
  appliedRangeLabel: string
  draftStart: string
  draftEnd: string
  rangePresets: IndicatorRangePreset[]
  actorName: string
  clientLabel: string
  evaluationCount: number
  evaluationsOpen: boolean
}>()

const emit = defineEmits<{
  'update:draft-start': [value: string]
  'update:draft-end': [value: string]
  apply: []
  'toggle-evaluations': []
  'open-evaluation': []
  'select-preset': [presetId: string]
}>()

const startModel = computed({
  get: () => props.draftStart,
  set: (value: string) => emit('update:draft-start', value)
})

const endModel = computed({
  get: () => props.draftEnd,
  set: (value: string) => emit('update:draft-end', value)
})
</script>

<template>
  <UCard class="indicators-toolbar" :ui="{ body: 'indicators-toolbar__body' }">
    <div class="indicators-toolbar__top">
      <div class="min-w-0 space-y-2">
        <p class="indicators-toolbar__range">{{ appliedRangeLabel }}</p>

        <div class="indicators-toolbar__chips">
          <UBadge color="neutral" variant="soft">Cliente: {{ clientLabel }}</UBadge>
          <UBadge color="neutral" variant="soft">Avaliador: {{ actorName }}</UBadge>
        </div>
      </div>

      <div class="indicators-toolbar__counter">
        <span class="indicators-toolbar__counter-label">Avaliacoes visiveis</span>
        <strong class="indicators-toolbar__counter-value">{{ evaluationCount }}</strong>
      </div>
    </div>

    <div class="indicators-toolbar__actions">
      <UButton
        :icon="evaluationsOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        color="neutral"
        variant="soft"
        @click="emit('toggle-evaluations')"
      >
        Indicadores Cadastrados
      </UButton>

      <div class="indicators-toolbar__date-group">
        <div class="indicators-toolbar__field">
          <span class="indicators-toolbar__field-label">Inicio</span>
          <UInput v-model="startModel" type="date" />
        </div>

        <div class="indicators-toolbar__field">
          <span class="indicators-toolbar__field-label">Fim</span>
          <UInput v-model="endModel" type="date" />
        </div>
      </div>

      <div class="indicators-toolbar__cta-group">
        <UButton icon="i-lucide-filter" color="primary" @click="emit('apply')">
          Aplicar
        </UButton>

        <UButton icon="i-lucide-plus" color="primary" variant="soft" @click="emit('open-evaluation')">
          Avaliar
        </UButton>
      </div>
    </div>

    <div class="indicators-toolbar__presets">
      <button
        v-for="preset in rangePresets"
        :key="preset.id"
        type="button"
        class="indicators-toolbar__preset"
        @click="emit('select-preset', preset.id)"
      >
        {{ preset.label }}
      </button>
    </div>
  </UCard>
</template>

<style scoped>
.indicators-toolbar {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background:
    radial-gradient(circle at top left, rgba(15, 118, 110, 0.16), transparent 38%),
    radial-gradient(circle at top right, rgba(180, 83, 9, 0.15), transparent 34%),
    rgb(var(--surface-2));
}

.indicators-toolbar__body {
  display: grid;
  gap: 1rem;
}

.indicators-toolbar__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.indicators-toolbar__range {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: rgb(var(--text));
}

.indicators-toolbar__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.indicators-toolbar__counter {
  flex-shrink: 0;
  display: grid;
  gap: 0.15rem;
  min-width: 7rem;
  padding: 0.85rem 1rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.04);
}

.indicators-toolbar__counter-label {
  font-size: 0.75rem;
  color: rgb(var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.indicators-toolbar__counter-value {
  font-size: 1.4rem;
  line-height: 1;
}

.indicators-toolbar__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 0.85rem;
}

.indicators-toolbar__date-group {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(2, minmax(11rem, 1fr));
}

.indicators-toolbar__field {
  display: grid;
  gap: 0.35rem;
}

.indicators-toolbar__field-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgb(var(--muted));
}

.indicators-toolbar__cta-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
}

.indicators-toolbar__presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
}

.indicators-toolbar__preset {
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 999px;
  padding: 0.5rem 0.8rem;
  background: rgba(255, 255, 255, 0.04);
  color: rgb(var(--text));
  font-size: 0.84rem;
  transition: border-color 0.18s ease, transform 0.18s ease, background 0.18s ease;
}

.indicators-toolbar__preset:hover {
  border-color: rgba(148, 163, 184, 0.4);
  background: rgba(255, 255, 255, 0.08);
  transform: translateY(-1px);
}

@media (max-width: 960px) {
  .indicators-toolbar__top {
    flex-direction: column;
  }

  .indicators-toolbar__counter {
    width: 100%;
  }
}

@media (max-width: 720px) {
  .indicators-toolbar__date-group {
    grid-template-columns: 1fr;
    width: 100%;
  }

  .indicators-toolbar__actions {
    align-items: stretch;
  }

  .indicators-toolbar__cta-group {
    width: 100%;
  }

  .indicators-toolbar__cta-group :deep(button) {
    flex: 1 1 12rem;
  }
}
</style>