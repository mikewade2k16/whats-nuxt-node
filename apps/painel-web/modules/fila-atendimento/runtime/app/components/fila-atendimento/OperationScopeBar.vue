<script setup lang="ts">
import { computed, useSlots } from 'vue'
import AppSelectField from '~/components/ui/AppSelectField.vue'
import type { FilaAtendimentoStoreContext } from '~/types/fila-atendimento'

const props = withDefaults(defineProps<{
  canSeeIntegrated?: boolean
  stores?: FilaAtendimentoStoreContext[]
  modelValue?: string
  selectLabel?: string
}>(), {
  canSeeIntegrated: false,
  stores: () => [],
  modelValue: '',
  selectLabel: 'Loja'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const slots = useSlots()

const storeOptions = computed(() =>
  (Array.isArray(props.stores) ? props.stores : []).map((store) => ({
    value: String(store?.id || '').trim(),
    label: String(store?.name || '').trim()
  }))
)

const scopeOptions = computed(() => {
  if (!props.canSeeIntegrated) {
    return storeOptions.value
  }

  return [
    { value: 'all', label: 'Todas as lojas' },
    ...storeOptions.value
  ]
})

const hasStatus = computed(() => Boolean(slots.status))
const hasBrief = computed(() => Boolean(slots.brief))
const hasActions = computed(() => Boolean(slots.actions))

function handleSelectionChange(value: string) {
  const normalizedValue = String(value || '').trim()
  emit('update:modelValue', normalizedValue)
}
</script>

<template>
  <section class="operation-scope-bar">
    <div v-if="hasStatus" class="operation-scope-bar__status">
      <slot name="status" />
    </div>

    <div v-if="hasBrief" class="operation-scope-bar__brief">
      <slot name="brief" />
    </div>

    <div class="operation-scope-bar__controls">
      <AppSelectField
        class="operation-scope-bar__field"
        :label="selectLabel"
        compact
        :show-leading-icon="false"
        :model-value="modelValue"
        :options="scopeOptions"
        testid="operation-filter-scope-store"
        @update:model-value="handleSelectionChange"
      />
    </div>

    <div v-if="hasActions" class="operation-scope-bar__actions">
      <slot name="actions" />
    </div>
  </section>
</template>

<style scoped>
.operation-scope-bar {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
}

.operation-scope-bar__status {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.operation-scope-bar__brief {
  flex: 1 1 14rem;
  min-width: 0;
}

.operation-scope-bar__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  margin-left: auto;
}

.operation-scope-bar__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.operation-scope-bar__field {
  min-width: 9rem;
}

.operation-scope-bar__field :deep(.app-select-field__label) {
  color: rgba(219, 226, 255, 0.66);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.operation-scope-bar__field :deep(.app-select-field__trigger) {
  min-height: 2.2rem;
  border-color: rgba(99, 115, 170, 0.3);
  background: rgba(12, 18, 34, 0.78);
}

@media (max-width: 900px) {
  .operation-scope-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .operation-scope-bar__status,
  .operation-scope-bar__actions {
    width: 100%;
  }

  .operation-scope-bar__controls {
    justify-content: stretch;
    margin-left: 0;
    width: 100%;
  }

  .operation-scope-bar__field {
    min-width: 0;
    width: 100%;
  }
}
</style>