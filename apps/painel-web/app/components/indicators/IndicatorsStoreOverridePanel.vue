<script setup lang="ts">
import type {
  IndicatorsScopeMode,
  IndicatorsStoreOverride,
  IndicatorsStoreOverrideStatus,
  IndicatorsTargetSetSummary
} from '~/types/indicators-management'

const props = defineProps<{
  stores: IndicatorsStoreOverride[]
  selectedStoreId: string
  targetSets: IndicatorsTargetSetSummary[]
}>()

const emit = defineEmits<{
  'update:selected-store-id': [value: string]
  'update-store-field': [storeId: string, field: 'scopeMode' | 'status' | 'note', value: string]
  'update-store-rule-field': [storeId: string, ruleId: string, field: 'enabled' | 'weight' | 'note', value: string | number | boolean | null]
}>()

const scopeItems = [
  { label: 'Cliente global', value: 'client_global' },
  { label: 'Por loja', value: 'per_store' }
] satisfies Array<{ label: string, value: IndicatorsScopeMode }>

const statusItems = [
  { label: 'Herdando perfil', value: 'inherit' },
  { label: 'Custom local', value: 'custom' },
  { label: 'Pausado', value: 'paused' }
] satisfies Array<{ label: string, value: IndicatorsStoreOverrideStatus }>

const selectedStore = computed(() => props.stores.find(store => store.id === props.selectedStoreId) ?? props.stores[0] ?? null)
const customStoreCount = computed(() => props.stores.filter(store => store.status === 'custom').length)
const selectedStoreChanges = computed(() => selectedStore.value?.overrides.filter(rule => rule.changed).length ?? 0)

function statusColor(status: IndicatorsStoreOverrideStatus) {
  if (status === 'custom') return 'warning'
  if (status === 'paused') return 'error'
  return 'success'
}

function targetColor(status: IndicatorsTargetSetSummary['items'][number]['status']) {
  if (status === 'on_track') return 'success'
  if (status === 'risk') return 'warning'
  return 'error'
}

function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
</script>

<template>
  <div class="indicators-store-override-panel">
    <UCollapsible :default-open="false" class="indicators-store-override-panel__collapsible">
      <template #default="{ open }">
        <div class="indicators-store-override-panel__summary">
          <div>
            <p class="indicators-store-override-panel__eyebrow">Overrides por loja</p>
            <h3 class="indicators-store-override-panel__title">{{ selectedStore?.unitName || 'Selecione uma loja' }}</h3>
            <p class="indicators-store-override-panel__copy">
              {{ customStoreCount }} lojas com regra local • {{ selectedStoreChanges }} ajustes na loja ativa
            </p>
          </div>

          <div class="indicators-store-override-panel__summary-side">
            <UBadge color="neutral" variant="soft">{{ props.stores.length }} lojas</UBadge>
            <UBadge v-if="selectedStore" :color="statusColor(selectedStore.status)" variant="soft">
              {{ selectedStore.status }}
            </UBadge>
            <UIcon :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="indicators-store-override-panel__chevron" />
          </div>
        </div>
      </template>

      <template #content>
        <div class="indicators-store-override-panel__content">
          <div class="indicators-store-override-panel__list">
            <button
              v-for="store in props.stores"
              :key="store.id"
              type="button"
              class="indicators-store-override-panel__store-pill"
              :class="{ 'is-active': selectedStore?.id === store.id }"
              @click="emit('update:selected-store-id', store.id)"
            >
              <div>
                <strong>{{ store.unitName }}</strong>
                <span>#{{ store.ranking }} | {{ store.score.toFixed(1) }}%</span>
              </div>
              <UBadge :color="statusColor(store.status)" variant="soft">{{ store.status }}</UBadge>
            </button>
          </div>

          <UCard v-if="selectedStore" class="indicators-store-override-panel__detail" :ui="{ body: 'indicators-store-override-panel__detail-body' }">
            <template #header>
              <div class="indicators-store-override-panel__detail-head">
                <div>
                  <p class="indicators-store-override-panel__eyebrow">Loja ativa</p>
                  <h3 class="indicators-store-override-panel__title">{{ selectedStore.unitName }}</h3>
                  <p class="indicators-store-override-panel__copy">Gestor: {{ selectedStore.managerName }}</p>
                </div>
                <UBadge color="neutral" variant="soft">{{ selectedStore.score.toFixed(1) }}%</UBadge>
              </div>
            </template>

            <div class="indicators-store-override-panel__meta-grid">
              <div class="indicators-store-override-panel__field">
                <span class="indicators-store-override-panel__label">Escopo</span>
                <USelect
                  :model-value="selectedStore.scopeMode"
                  :items="scopeItems"
                  @update:model-value="emit('update-store-field', selectedStore.id, 'scopeMode', String($event ?? 'client_global'))"
                />
              </div>

              <div class="indicators-store-override-panel__field">
                <span class="indicators-store-override-panel__label">Status</span>
                <USelect
                  :model-value="selectedStore.status"
                  :items="statusItems"
                  @update:model-value="emit('update-store-field', selectedStore.id, 'status', String($event ?? 'inherit'))"
                />
              </div>
            </div>

            <div class="indicators-store-override-panel__field">
              <span class="indicators-store-override-panel__label">Nota do contexto</span>
              <UTextarea
                :model-value="selectedStore.note"
                :rows="3"
                @update:model-value="emit('update-store-field', selectedStore.id, 'note', String($event ?? ''))"
              />
            </div>

            <div class="indicators-store-override-panel__rules">
              <article
                v-for="rule in selectedStore.overrides"
                :key="rule.id"
                class="indicators-store-override-panel__rule-card"
              >
                <div class="indicators-store-override-panel__rule-head">
                  <div>
                    <strong>{{ rule.label }}</strong>
                    <p>{{ rule.note }}</p>
                  </div>
                  <label class="indicators-store-override-panel__switch">
                    <USwitch
                      :model-value="rule.enabled"
                      @update:model-value="emit('update-store-rule-field', selectedStore.id, rule.id, 'enabled', Boolean($event))"
                    />
                    <span>Ativo</span>
                  </label>
                </div>

                <div class="indicators-store-override-panel__rule-grid">
                  <div class="indicators-store-override-panel__field">
                    <span class="indicators-store-override-panel__label">Peso local</span>
                    <UInput
                      :model-value="rule.weight ?? ''"
                      type="number"
                      @update:model-value="emit('update-store-rule-field', selectedStore.id, rule.id, 'weight', String($event ?? '') === '' ? null : toNumber($event))"
                    />
                  </div>

                  <div class="indicators-store-override-panel__field indicators-store-override-panel__field--wide">
                    <span class="indicators-store-override-panel__label">Observacao</span>
                    <UInput
                      :model-value="rule.note"
                      @update:model-value="emit('update-store-rule-field', selectedStore.id, rule.id, 'note', String($event ?? ''))"
                    />
                  </div>
                </div>
              </article>
            </div>

            <UCollapsible :default-open="false" class="indicators-store-override-panel__targets-collapse">
              <template #default="{ open: targetsOpen }">
                <div class="indicators-store-override-panel__targets-toggle">
                  <div>
                    <p class="indicators-store-override-panel__targets-title">Target sets em preview</p>
                    <span class="indicators-store-override-panel__targets-copy">Abra so quando precisar validar metas e leitura do core.</span>
                  </div>

                  <div class="indicators-store-override-panel__targets-toggle-side">
                    <UBadge color="neutral" variant="soft">{{ props.targetSets.length }} conjuntos</UBadge>
                    <UIcon :name="targetsOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="indicators-store-override-panel__chevron" />
                  </div>
                </div>
              </template>

              <template #content>
                <div class="indicators-store-override-panel__target-cards">
                  <article
                    v-for="target in props.targetSets"
                    :key="target.id"
                    class="indicators-store-override-panel__target-card"
                  >
                    <div class="indicators-store-override-panel__target-header">
                      <strong>{{ target.name }}</strong>
                      <UBadge color="neutral" variant="soft">{{ target.status }}</UBadge>
                    </div>
                    <p class="indicators-store-override-panel__target-period">{{ target.periodLabel }}</p>

                    <div class="indicators-store-override-panel__target-list">
                      <div
                        v-for="item in target.items"
                        :key="item.id"
                        class="indicators-store-override-panel__target-row"
                      >
                        <span>{{ item.label }}</span>
                        <UBadge :color="targetColor(item.status)" variant="soft">
                          {{ item.currentValue }} / {{ item.targetValue }} {{ item.unitLabel }}
                        </UBadge>
                      </div>
                    </div>
                  </article>
                </div>
              </template>
            </UCollapsible>
          </UCard>
        </div>
      </template>
    </UCollapsible>
  </div>
</template>

<style scoped>
.indicators-store-override-panel {
  display: grid;
  gap: 0.85rem;
}

.indicators-store-override-panel__collapsible,
.indicators-store-override-panel__detail {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.03);
}

.indicators-store-override-panel__summary,
.indicators-store-override-panel__targets-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.95rem 1rem;
}

.indicators-store-override-panel__summary-side,
.indicators-store-override-panel__targets-toggle-side {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.indicators-store-override-panel__content {
  display: grid;
  gap: 1rem;
  padding: 0 0 1rem;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
}

.indicators-store-override-panel__chevron {
  color: rgb(var(--muted));
}

.indicators-store-override-panel__list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding: 0 1rem;
}

.indicators-store-override-panel__store-pill {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.9rem;
  min-width: 15rem;
  padding: 0.9rem 1rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.03);
  color: rgb(var(--text));
  text-align: left;
}

.indicators-store-override-panel__store-pill strong,
.indicators-store-override-panel__store-pill span {
  display: block;
}

.indicators-store-override-panel__store-pill span {
  margin-top: 0.15rem;
  color: rgb(var(--muted));
  font-size: 0.8rem;
}

.indicators-store-override-panel__store-pill.is-active {
  border-color: rgba(15, 118, 110, 0.48);
  background: rgba(15, 118, 110, 0.12);
}

.indicators-store-override-panel__detail {
  margin: 0 1rem;
}

.indicators-store-override-panel__detail-body {
  display: grid;
  gap: 1rem;
}

.indicators-store-override-panel__detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.indicators-store-override-panel__eyebrow {
  margin: 0 0 0.35rem;
  font-size: 0.74rem;
  color: rgb(var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.indicators-store-override-panel__title {
  margin: 0;
  font-size: 1.05rem;
}

.indicators-store-override-panel__copy,
.indicators-store-override-panel__target-period,
.indicators-store-override-panel__rule-head p {
  margin: 0.3rem 0 0;
  color: rgb(var(--muted));
}

.indicators-store-override-panel__meta-grid,
.indicators-store-override-panel__rule-grid {
  display: grid;
  gap: 0.8rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.indicators-store-override-panel__field {
  display: grid;
  gap: 0.35rem;
}

.indicators-store-override-panel__field--wide {
  grid-column: span 2;
}

.indicators-store-override-panel__label {
  font-size: 0.72rem;
  color: rgb(var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.indicators-store-override-panel__rules,
.indicators-store-override-panel__target-cards {
  display: grid;
  gap: 0.8rem;
}

.indicators-store-override-panel__rule-card,
.indicators-store-override-panel__target-card {
  display: grid;
  gap: 0.8rem;
  padding: 0.9rem;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 1rem;
  background: rgba(15, 23, 42, 0.12);
}

.indicators-store-override-panel__rule-head,
.indicators-store-override-panel__target-header,
.indicators-store-override-panel__target-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.indicators-store-override-panel__switch {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
}

.indicators-store-override-panel__targets-title {
  margin: 0;
  font-weight: 600;
}

.indicators-store-override-panel__targets-copy {
  color: rgb(var(--muted));
  font-size: 0.84rem;
}

.indicators-store-override-panel__targets-collapse {
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 0.95rem;
  background: rgba(15, 23, 42, 0.08);
}

.indicators-store-override-panel__target-cards {
  padding: 0 1rem 1rem;
}

.indicators-store-override-panel__target-list {
  display: grid;
  gap: 0.55rem;
}

@media (max-width: 860px) {
  .indicators-store-override-panel__summary,
  .indicators-store-override-panel__targets-toggle,
  .indicators-store-override-panel__detail-head,
  .indicators-store-override-panel__target-header,
  .indicators-store-override-panel__target-row,
  .indicators-store-override-panel__rule-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .indicators-store-override-panel__meta-grid,
  .indicators-store-override-panel__rule-grid {
    grid-template-columns: 1fr;
  }

  .indicators-store-override-panel__field--wide {
    grid-column: span 1;
  }
}
</style>