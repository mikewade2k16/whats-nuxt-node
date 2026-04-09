<script setup lang="ts">
import OmniSelectInput from '~/components/inputs/OmniSelectInput.vue'
import OmniSelectMenuInput from '~/components/inputs/OmniSelectMenuInput.vue'
import type { OmniSelectOption } from '~/types/omni/collection'

definePageMeta({
  layout: 'admin'
})

const selectOptions = ref<Array<OmniSelectOption & { avatar?: { src: string, alt: string }, description?: string }>>([
  {
    label: 'Em criacao',
    value: 'em_criacao',
    description: 'Documento em estrutura inicial',
    avatar: { src: 'https://i.pravatar.cc/80?img=1', alt: 'Status' }
  },
  {
    label: 'Roteirizando',
    value: 'roteirizando',
    description: 'Texto em desenvolvimento',
    avatar: { src: 'https://i.pravatar.cc/80?img=2', alt: 'Status' }
  },
  {
    label: 'Em revisao',
    value: 'em_revisao',
    description: 'Aguardando ajustes',
    avatar: { src: 'https://i.pravatar.cc/80?img=3', alt: 'Status' }
  },
  {
    label: 'Aprovado',
    value: 'aprovado',
    description: 'Liberado para etapa seguinte',
    avatar: { src: 'https://i.pravatar.cc/80?img=4', alt: 'Status' }
  },
  {
    label: 'Finalizado',
    value: 'finalizado',
    description: 'Roteiro concluido',
    avatar: { src: 'https://i.pravatar.cc/80?img=5', alt: 'Status' }
  }
])

const playgroundConfig = reactive({
  multiple: true,
  creatable: true,
  searchable: true,
  fullContentWidth: true,
  color: 'neutral' as 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral',
  variant: 'none' as 'outline' | 'soft' | 'subtle' | 'ghost' | 'none',
  highlight: false,
  badgeMode: true,
  showAvatar: false,
  loading: false
})

const oldSelectValue = ref<Array<string | number> | string | number | null>(['roteirizando'])
const newSelectValue = ref<Array<string | number> | string | number | null>(['roteirizando'])

const colorOptions = [
  { label: 'primary', value: 'primary' },
  { label: 'secondary', value: 'secondary' },
  { label: 'success', value: 'success' },
  { label: 'info', value: 'info' },
  { label: 'warning', value: 'warning' },
  { label: 'error', value: 'error' },
  { label: 'neutral', value: 'neutral' }
]

const variantOptions = [
  { label: 'outline', value: 'outline' },
  { label: 'soft', value: 'soft' },
  { label: 'subtle', value: 'subtle' },
  { label: 'ghost', value: 'ghost' },
  { label: 'none', value: 'none' }
]

const componentCatalog = computed(() => [
  {
    name: 'OmniDataTable',
    scope: 'Tabela generica com edicao inline',
    status: 'ativo',
    usage: 'clientes, users, candidatos, produtos, leads, QA'
  },
  {
    name: 'OmniCollectionFilters',
    scope: 'Filtros desacoplados da visualizacao',
    status: 'ativo',
    usage: 'paginas com tabela e listas customizadas'
  },
  {
    name: 'OmniSelectInput',
    scope: 'Select/multiselect estilo Notion (legacy custom)',
    status: 'ativo',
    usage: 'OmniDataTable e comparativo'
  },
  {
    name: 'OmniSelectMenuInput',
    scope: 'Select baseado em Nuxt UI com create/search/multi',
    status: 'novo',
    usage: 'scripts (status) e playground'
  },
  {
    name: 'OmniSwitchInput',
    scope: 'Switch reutilizavel',
    status: 'ativo',
    usage: 'tabela, filtros e formularios'
  },
  {
    name: 'OmniMoneyInput',
    scope: 'Input BRL com formatacao automatica',
    status: 'ativo',
    usage: 'campos monetarios da tabela'
  }
])

function normalizeLabel(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function pushOptionIfMissing(option: OmniSelectOption) {
  const key = normalizeLabel(option.value).toLowerCase()
  if (!key) return

  const alreadyExists = selectOptions.value.some(item => normalizeLabel(item.value).toLowerCase() === key)
  if (alreadyExists) return
  selectOptions.value = [...selectOptions.value, option]
}

function onCreateFromLegacy(option: OmniSelectOption) {
  pushOptionIfMissing({
    label: normalizeLabel(option.label || option.value),
    value: normalizeLabel(option.value)
  })
}

function onCreateFromNuxt(option: OmniSelectOption) {
  pushOptionIfMissing({
    label: normalizeLabel(option.label || option.value),
    value: normalizeLabel(option.value)
  })
}

watch(
  () => playgroundConfig.multiple,
  (multiple) => {
    if (multiple) {
      const oldArray = Array.isArray(oldSelectValue.value) ? oldSelectValue.value : (oldSelectValue.value ? [oldSelectValue.value] : [])
      const newArray = Array.isArray(newSelectValue.value) ? newSelectValue.value : (newSelectValue.value ? [newSelectValue.value] : [])
      oldSelectValue.value = oldArray
      newSelectValue.value = newArray
      return
    }

    const oldSingle = Array.isArray(oldSelectValue.value) ? oldSelectValue.value[0] : oldSelectValue.value
    const newSingle = Array.isArray(newSelectValue.value) ? newSelectValue.value[0] : newSelectValue.value
    oldSelectValue.value = oldSingle ?? null
    newSelectValue.value = newSingle ?? null
  },
  { immediate: true }
)
</script>

<template>
  <section class="components-catalog space-y-5">
    <AdminPageHeader
      class="components-catalog__header"
      eyebrow="Manage"
      title="Catalogo de Componentes"
      description="Playground rapido para comparar componentes ativos, validar comportamento e acelerar reaproveitamento."
    />

    <UCard class="components-catalog__config-card">
      <template #header>
        <div class="components-catalog__config-header flex items-center justify-between gap-2">
          <h2 class="components-catalog__section-title text-sm font-semibold">Config do playground</h2>
          <UBadge color="neutral" variant="soft">Nuxt UI Select Benchmark</UBadge>
        </div>
      </template>

      <div class="components-catalog__config-grid grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label class="components-catalog__config-item flex items-center gap-2">
          <USwitch v-model="playgroundConfig.multiple" />
          <span class="text-sm">Multiple</span>
        </label>
        <label class="components-catalog__config-item flex items-center gap-2">
          <USwitch v-model="playgroundConfig.creatable" />
          <span class="text-sm">Creatable</span>
        </label>
        <label class="components-catalog__config-item flex items-center gap-2">
          <USwitch v-model="playgroundConfig.searchable" />
          <span class="text-sm">Search</span>
        </label>
        <label class="components-catalog__config-item flex items-center gap-2">
          <USwitch v-model="playgroundConfig.fullContentWidth" />
          <span class="text-sm">Full content width</span>
        </label>
        <label class="components-catalog__config-item flex items-center gap-2">
          <USwitch v-model="playgroundConfig.badgeMode" />
          <span class="text-sm">Badge mode</span>
        </label>
        <label class="components-catalog__config-item flex items-center gap-2">
          <USwitch v-model="playgroundConfig.showAvatar" />
          <span class="text-sm">Avatar in items</span>
        </label>
        <label class="components-catalog__config-item flex items-center gap-2">
          <USwitch v-model="playgroundConfig.highlight" />
          <span class="text-sm">Highlight</span>
        </label>
        <label class="components-catalog__config-item flex items-center gap-2">
          <USwitch v-model="playgroundConfig.loading" />
          <span class="text-sm">Loading (API)</span>
        </label>
        <div class="components-catalog__config-item">
          <USelect v-model="playgroundConfig.color" :items="colorOptions" label-key="label" value-key="value" />
        </div>
        <div class="components-catalog__config-item">
          <USelect v-model="playgroundConfig.variant" :items="variantOptions" label-key="label" value-key="value" />
        </div>
      </div>
    </UCard>

    <div class="components-catalog__comparison grid gap-4 xl:grid-cols-2">
      <UCard class="components-catalog__comparison-card">
        <template #header>
          <div class="components-catalog__comparison-head flex items-center justify-between gap-2">
            <h3 class="components-catalog__comparison-title text-sm font-semibold">Select antigo (`OmniSelectInput`)</h3>
            <UBadge color="warning" variant="soft">Legacy</UBadge>
          </div>
        </template>

        <div class="components-catalog__comparison-body space-y-3">
          <OmniSelectInput
            v-model="oldSelectValue"
            :items="selectOptions"
            :multiple="playgroundConfig.multiple"
            :creatable="playgroundConfig.creatable"
            :search-input="playgroundConfig.searchable"
            :overlay-on-open="playgroundConfig.fullContentWidth"
            placeholder="Selecione ou crie status"
            manage-options
            class="components-catalog__legacy-select"
            @create="onCreateFromLegacy"
          />

          <UTextarea
            class="components-catalog__value-output"
            :model-value="JSON.stringify(oldSelectValue, null, 2)"
            :rows="4"
            readonly
          />
        </div>
      </UCard>

      <UCard class="components-catalog__comparison-card">
        <template #header>
          <div class="components-catalog__comparison-head flex items-center justify-between gap-2">
            <h3 class="components-catalog__comparison-title text-sm font-semibold">Select novo (`OmniSelectMenuInput`)</h3>
            <UBadge color="success" variant="soft">Nuxt UI</UBadge>
          </div>
        </template>

        <div class="components-catalog__comparison-body space-y-3">
          <OmniSelectMenuInput
            v-model="newSelectValue"
            :items="selectOptions"
            :multiple="playgroundConfig.multiple"
            :creatable="playgroundConfig.creatable ? { when: 'always', position: 'bottom' } : false"
            :searchable="playgroundConfig.searchable"
            :full-content-width="playgroundConfig.fullContentWidth"
            :color="playgroundConfig.color"
            :variant="playgroundConfig.variant"
            :highlight="playgroundConfig.highlight"
            :loading="playgroundConfig.loading"
            :badge-mode="playgroundConfig.badgeMode"
            :show-avatar="playgroundConfig.showAvatar"
            clear
            placeholder="Selecione ou crie status"
            class="components-catalog__nuxt-select"
            @create="onCreateFromNuxt"
          />

          <UTextarea
            class="components-catalog__value-output"
            :model-value="JSON.stringify(newSelectValue, null, 2)"
            :rows="4"
            readonly
          />
        </div>
      </UCard>
    </div>

    <UCard class="components-catalog__inventory-card">
      <template #header>
        <div class="components-catalog__inventory-head flex items-center justify-between gap-2">
          <h2 class="components-catalog__section-title text-sm font-semibold">Componentes ativos no projeto</h2>
          <UBadge color="neutral" variant="soft">Total: {{ componentCatalog.length }}</UBadge>
        </div>
      </template>

      <div class="components-catalog__inventory-grid grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <article
          v-for="component in componentCatalog"
          :key="component.name"
          class="components-catalog__inventory-item rounded-[var(--radius-sm)] border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-3"
        >
          <div class="components-catalog__inventory-item-head mb-2 flex items-center justify-between gap-2">
            <p class="components-catalog__inventory-item-name text-sm font-semibold text-[rgb(var(--text))]">
              {{ component.name }}
            </p>
            <UBadge :color="component.status === 'novo' ? 'success' : 'neutral'" variant="soft">
              {{ component.status }}
            </UBadge>
          </div>

          <p class="components-catalog__inventory-item-scope text-xs text-[rgb(var(--muted))]">
            {{ component.scope }}
          </p>
          <p class="components-catalog__inventory-item-usage mt-2 text-xs text-[rgb(var(--muted))]">
            Uso atual: {{ component.usage }}
          </p>
        </article>
      </div>
    </UCard>
  </section>
</template>
