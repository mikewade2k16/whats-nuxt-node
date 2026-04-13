<script setup lang="ts">
import type {
  IndicatorsEvidencePolicy,
  IndicatorsInputType,
  IndicatorsProfileItemConfig,
  IndicatorsProfileIndicatorConfig,
  IndicatorsScopeMode,
  IndicatorsSourceKind,
  IndicatorsValueType
} from '~/types/indicators-management'

type IndicatorField = 'name' | 'weight' | 'scopeMode' | 'sourceKind' | 'valueType' | 'evidencePolicy' | 'enabled' | 'supportsStoreBreakdown'
type ItemField = 'label' | 'inputType' | 'evidencePolicy' | 'required' | 'weight'

const props = defineProps<{
  indicators: IndicatorsProfileIndicatorConfig[]
}>()

const emit = defineEmits<{
  'update-indicator-field': [indicatorId: string, field: IndicatorField, value: string | number | boolean]
  'update-item-field': [indicatorId: string, itemId: string, field: ItemField, value: string | number | boolean]
  'add-item': [indicatorId: string]
  'rebalance-items': [indicatorId: string]
  'remove-indicator': [indicatorId: string]
  'remove-item': [indicatorId: string, itemId: string]
}>()

const scopeItems = [
  { label: 'Cliente global', value: 'client_global' },
  { label: 'Por loja', value: 'per_store' }
] satisfies Array<{ label: string, value: IndicatorsScopeMode }>

const sourceItems = [
  { label: 'Manual', value: 'manual' },
  { label: 'Provider', value: 'provider' },
  { label: 'Hibrido', value: 'hybrid' }
] satisfies Array<{ label: string, value: IndicatorsSourceKind }>

const indicatorEvidenceItems = [
  { label: 'Nenhuma', value: 'none' },
  { label: 'Opcional', value: 'optional' },
  { label: 'Obrigatoria', value: 'required' }
] satisfies Array<{ label: string, value: IndicatorsEvidencePolicy }>

const itemEvidenceItems = [
  { label: 'Herdar indicador', value: 'inherit' },
  ...indicatorEvidenceItems
] satisfies Array<{ label: string, value: IndicatorsEvidencePolicy }>

const valueTypeItems = [
  { label: 'Score', value: 'score' },
  { label: 'Percentual', value: 'percent' },
  { label: 'Moeda', value: 'currency' },
  { label: 'Contagem', value: 'count' },
  { label: 'Booleano', value: 'boolean' },
  { label: 'Composto', value: 'composite' }
] satisfies Array<{ label: string, value: IndicatorsValueType }>

const inputTypeItems = [
  { label: 'Booleano', value: 'boolean' },
  { label: 'Score', value: 'score' },
  { label: 'Percentual', value: 'percent' },
  { label: 'Moeda', value: 'currency' },
  { label: 'Contagem', value: 'count' },
  { label: 'Texto', value: 'text' },
  { label: 'Imagem', value: 'image' },
  { label: 'Imagem obrigatoria', value: 'image_required' },
  { label: 'Select', value: 'select' },
  { label: 'Provider metric', value: 'provider_metric' }
] satisfies Array<{ label: string, value: IndicatorsInputType }>

function onNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function badgeColor(sourceKind: IndicatorsSourceKind) {
  if (sourceKind === 'provider') return 'primary'
  if (sourceKind === 'hybrid') return 'warning'
  return 'neutral'
}

function progressColor(value: number) {
  if (value > 100.05) return 'error'
  return value === 100 ? 'success' : 'warning'
}

function optionLabel<T extends string>(items: Array<{ label: string, value: T }>, value: T) {
  return items.find(item => item.value === value)?.label ?? value
}

function itemWeightTotal(indicator: IndicatorsProfileIndicatorConfig) {
  return Number(indicator.items.reduce((accumulator, item) => accumulator + item.weight, 0).toFixed(2))
}

function remainingItemWeight(indicator: IndicatorsProfileIndicatorConfig) {
  return Number((100 - itemWeightTotal(indicator)).toFixed(2))
}

function hasUniformWeights(indicator: IndicatorsProfileIndicatorConfig) {
  if (indicator.items.length <= 1) {
    return true
  }

  const firstWeight = Number((indicator.items[0]?.weight ?? 0).toFixed(2))
  return indicator.items.every(item => Math.abs(Number(item.weight.toFixed(2)) - firstWeight) <= 0.05)
}

function indicatorSummary(indicator: IndicatorsProfileIndicatorConfig) {
  return [
    indicator.enabled ? 'Ativo' : 'Inativo',
    optionLabel(scopeItems, indicator.scopeMode),
    `Peso ${indicator.weight}%`
  ].join(' • ')
}

function itemSummary(item: IndicatorsProfileItemConfig) {
  return [
    optionLabel(inputTypeItems, item.inputType),
    optionLabel(itemEvidenceItems, item.evidencePolicy)
  ].join(' • ')
}
</script>

<template>
  <div class="indicators-profile-editor">
    <UCollapsible
      v-for="indicator in props.indicators"
      :key="indicator.id"
      class="indicators-profile-editor__card"
      :default-open="false"
    >
      <template #default="{ open }">
        <div class="indicators-profile-editor__trigger">
          <div class="indicators-profile-editor__trigger-main">
            <div class="indicators-profile-editor__eyebrow-row">
              <p class="indicators-profile-editor__eyebrow">{{ indicator.categoryLabel }}</p>
              <UBadge :color="badgeColor(indicator.sourceKind)" variant="soft">
                {{ optionLabel(sourceItems, indicator.sourceKind) }}
              </UBadge>
              <UBadge :color="progressColor(itemWeightTotal(indicator))" variant="soft">
                Itens {{ itemWeightTotal(indicator) }}%
              </UBadge>
            </div>

            <UInput
              :model-value="indicator.name"
              class="indicators-profile-editor__title-input"
              @click.stop
              @pointerdown.stop
              @update:model-value="emit('update-indicator-field', indicator.id, 'name', String($event ?? ''))"
            />

            <p class="indicators-profile-editor__summary">{{ indicatorSummary(indicator) }}</p>
          </div>

          <div class="indicators-profile-editor__trigger-side">
            <div class="indicators-profile-editor__quick" @click.stop @pointerdown.stop>
              <div class="indicators-profile-editor__field indicators-profile-editor__field--compact">
                <span class="indicators-profile-editor__label">Peso</span>
                <UInput
                  :model-value="indicator.weight"
                  type="number"
                  @update:model-value="emit('update-indicator-field', indicator.id, 'weight', onNumber($event))"
                />
              </div>

              <label class="indicators-profile-editor__switch">
                <USwitch
                  :model-value="indicator.enabled"
                  @update:model-value="emit('update-indicator-field', indicator.id, 'enabled', Boolean($event))"
                />
                <span>Ativo</span>
              </label>

              <label class="indicators-profile-editor__switch">
                <USwitch
                  :model-value="indicator.supportsStoreBreakdown"
                  @update:model-value="emit('update-indicator-field', indicator.id, 'supportsStoreBreakdown', Boolean($event))"
                />
                <span>Loja</span>
              </label>

              <UButton
                size="sm"
                color="error"
                variant="ghost"
                icon="i-lucide-trash-2"
                @click="emit('remove-indicator', indicator.id)"
              >
                Excluir
              </UButton>
            </div>

            <UIcon :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="indicators-profile-editor__chevron" />
          </div>
        </div>
      </template>

      <template #content>
        <div class="indicators-profile-editor__content">
          <p class="indicators-profile-editor__description">{{ indicator.description }}</p>

          <UAlert
            v-if="itemWeightTotal(indicator) !== 100"
            color="warning"
            variant="soft"
            icon="i-lucide-scale"
            title="Peso interno ainda nao fecha em 100%"
            :description="`Os itens de ${indicator.name} somam ${itemWeightTotal(indicator)}%. Ajuste os pesos sem ultrapassar 100%.`"
          />

          <div class="indicators-profile-editor__meta-grid">
            <div class="indicators-profile-editor__field">
              <span class="indicators-profile-editor__label">Escopo</span>
              <USelect
                :model-value="indicator.scopeMode"
                :items="scopeItems"
                @update:model-value="emit('update-indicator-field', indicator.id, 'scopeMode', String($event ?? 'client_global'))"
              />
            </div>

            <div class="indicators-profile-editor__field">
              <span class="indicators-profile-editor__label">Origem</span>
              <USelect
                :model-value="indicator.sourceKind"
                :items="sourceItems"
                @update:model-value="emit('update-indicator-field', indicator.id, 'sourceKind', String($event ?? 'manual'))"
              />
            </div>

            <div class="indicators-profile-editor__field">
              <span class="indicators-profile-editor__label">Tipo de valor</span>
              <USelect
                :model-value="indicator.valueType"
                :items="valueTypeItems"
                @update:model-value="emit('update-indicator-field', indicator.id, 'valueType', String($event ?? 'score'))"
              />
            </div>

            <div class="indicators-profile-editor__field indicators-profile-editor__field--wide">
              <span class="indicators-profile-editor__label">Politica de evidencia</span>
              <USelect
                :model-value="indicator.evidencePolicy"
                :items="indicatorEvidenceItems"
                @update:model-value="emit('update-indicator-field', indicator.id, 'evidencePolicy', String($event ?? 'optional'))"
              />
            </div>
          </div>

          <div v-if="indicator.tags.length" class="indicators-profile-editor__tags">
            <UBadge
              v-for="tag in indicator.tags"
              :key="`${indicator.id}-${tag}`"
              color="neutral"
              variant="soft"
            >
              {{ tag }}
            </UBadge>
          </div>

          <div class="indicators-profile-editor__items">
            <div class="indicators-profile-editor__items-header">
              <div class="indicators-profile-editor__items-copy-wrap">
                <p class="indicators-profile-editor__items-title">Itens internos</p>
                <span class="indicators-profile-editor__items-copy">Abra cada item so quando precisar ajustar input ou evidencia.</span>
              </div>

              <div class="indicators-profile-editor__items-actions">
                <UBadge :color="progressColor(itemWeightTotal(indicator))" variant="soft">
                  {{ itemWeightTotal(indicator) }}%
                </UBadge>
                <UBadge v-if="itemWeightTotal(indicator) !== 100" color="warning" variant="soft">
                  {{ remainingItemWeight(indicator) > 0 ? `Faltam ${remainingItemWeight(indicator)}%` : `Excede ${Math.abs(remainingItemWeight(indicator))}%` }}
                </UBadge>
                <UButton
                  v-if="indicator.items.length > 1 && !hasUniformWeights(indicator)"
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-equal"
                  @click="emit('rebalance-items', indicator.id)"
                >
                  Dividir 100%
                </UButton>
                <UButton
                  size="sm"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-plus"
                  @click="emit('add-item', indicator.id)"
                >
                  Adicionar item
                </UButton>
              </div>
            </div>

            <div class="indicators-profile-editor__items-list">
              <UCollapsible
                v-for="item in indicator.items"
                :key="item.id"
                class="indicators-profile-editor__item-card"
                :default-open="false"
              >
                <template #default="{ open: itemOpen }">
                  <div class="indicators-profile-editor__item-trigger">
                    <div class="indicators-profile-editor__item-main">
                      <UInput
                        :model-value="item.label"
                        @click.stop
                        @pointerdown.stop
                        @update:model-value="emit('update-item-field', indicator.id, item.id, 'label', String($event ?? ''))"
                      />

                      <p class="indicators-profile-editor__item-summary">{{ itemSummary(item) }}</p>
                    </div>

                    <div class="indicators-profile-editor__item-side">
                      <div class="indicators-profile-editor__item-actions" @click.stop @pointerdown.stop>
                        <div class="indicators-profile-editor__field indicators-profile-editor__field--compact">
                          <span class="indicators-profile-editor__label">Peso</span>
                          <UInput
                            :model-value="item.weight"
                            type="number"
                            @update:model-value="emit('update-item-field', indicator.id, item.id, 'weight', onNumber($event))"
                          />
                        </div>

                        <label class="indicators-profile-editor__switch indicators-profile-editor__switch--item">
                          <USwitch
                            :model-value="item.required"
                            @update:model-value="emit('update-item-field', indicator.id, item.id, 'required', Boolean($event))"
                          />
                          <span>Obrigatorio</span>
                        </label>

                        <UButton
                          size="sm"
                          color="error"
                          variant="ghost"
                          icon="i-lucide-trash-2"
                          @click="emit('remove-item', indicator.id, item.id)"
                        >
                          Excluir
                        </UButton>
                      </div>

                      <UIcon :name="itemOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="indicators-profile-editor__chevron indicators-profile-editor__chevron--item" />
                    </div>
                  </div>
                </template>

                <template #content>
                  <div class="indicators-profile-editor__item-content">
                    <div class="indicators-profile-editor__item-grid">
                      <div class="indicators-profile-editor__field">
                        <span class="indicators-profile-editor__label">Input</span>
                        <USelect
                          :model-value="item.inputType"
                          :items="inputTypeItems"
                          @update:model-value="emit('update-item-field', indicator.id, item.id, 'inputType', String($event ?? 'text'))"
                        />
                      </div>

                      <div class="indicators-profile-editor__field">
                        <span class="indicators-profile-editor__label">Evidencia</span>
                        <USelect
                          :model-value="item.evidencePolicy"
                          :items="itemEvidenceItems"
                          @update:model-value="emit('update-item-field', indicator.id, item.id, 'evidencePolicy', String($event ?? 'inherit'))"
                        />
                      </div>
                    </div>
                  </div>
                </template>
              </UCollapsible>
            </div>
          </div>
        </div>
      </template>
    </UCollapsible>
  </div>
</template>

<style scoped>
.indicators-profile-editor {
  display: grid;
  gap: 1rem;
}

.indicators-profile-editor__card {
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.03);
  overflow: hidden;
}

.indicators-profile-editor__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
}

.indicators-profile-editor__trigger-main {
  display: grid;
  gap: 0.45rem;
  min-width: 0;
  flex: 1;
}

.indicators-profile-editor__trigger-side {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.indicators-profile-editor__eyebrow-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  align-items: center;
}

.indicators-profile-editor__eyebrow {
  margin: 0;
  font-size: 0.74rem;
  color: rgb(var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.indicators-profile-editor__title-input {
  max-width: 34rem;
}

.indicators-profile-editor__summary,
.indicators-profile-editor__description,
.indicators-profile-editor__item-summary {
  margin: 0;
  color: rgb(var(--muted));
}

.indicators-profile-editor__quick,
.indicators-profile-editor__item-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  justify-content: flex-end;
  gap: 0.65rem;
}

.indicators-profile-editor__chevron {
  flex-shrink: 0;
  color: rgb(var(--muted));
}

.indicators-profile-editor__chevron--item {
  align-self: center;
}

.indicators-profile-editor__switch {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.84rem;
}

.indicators-profile-editor__content {
  display: grid;
  gap: 1rem;
  padding: 0 1rem 1rem;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
}

.indicators-profile-editor__meta-grid {
  display: grid;
  gap: 0.8rem;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.indicators-profile-editor__field {
  display: grid;
  gap: 0.35rem;
}

.indicators-profile-editor__field--compact {
  min-width: 5.5rem;
}

.indicators-profile-editor__field--wide {
  grid-column: span 2;
}

.indicators-profile-editor__label {
  font-size: 0.72rem;
  color: rgb(var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.indicators-profile-editor__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.indicators-profile-editor__items {
  display: grid;
  gap: 0.85rem;
}

.indicators-profile-editor__items-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.indicators-profile-editor__items-title {
  margin: 0;
  font-weight: 600;
}

.indicators-profile-editor__items-copy-wrap {
  display: grid;
  gap: 0.2rem;
}

.indicators-profile-editor__items-copy {
  color: rgb(var(--muted));
  font-size: 0.84rem;
}

.indicators-profile-editor__items-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem;
}

.indicators-profile-editor__items-list {
  display: grid;
  gap: 0.8rem;
}

.indicators-profile-editor__item-card {
  display: grid;
  padding: 0.9rem;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 0.9rem;
  background: rgba(15, 23, 42, 0.12);
}

.indicators-profile-editor__item-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
}

.indicators-profile-editor__item-main {
  display: grid;
  gap: 0.35rem;
  min-width: 0;
  flex: 1;
}

.indicators-profile-editor__item-side {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.indicators-profile-editor__item-content {
  padding-top: 0.85rem;
}

.indicators-profile-editor__item-grid {
  display: grid;
  gap: 0.8rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.indicators-profile-editor__switch--item {
  align-self: center;
}

@media (max-width: 1180px) {
  .indicators-profile-editor__meta-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 780px) {
  .indicators-profile-editor__trigger,
  .indicators-profile-editor__item-trigger,
  .indicators-profile-editor__items-header {
    flex-direction: column;
    align-items: stretch;
  }

  .indicators-profile-editor__meta-grid,
  .indicators-profile-editor__item-grid {
    grid-template-columns: 1fr;
  }

  .indicators-profile-editor__field--wide {
    grid-column: span 1;
  }

  .indicators-profile-editor__trigger-side,
  .indicators-profile-editor__item-side {
    width: 100%;
    justify-content: space-between;
  }

  .indicators-profile-editor__quick,
  .indicators-profile-editor__item-actions {
    justify-content: flex-start;
  }
}
</style>