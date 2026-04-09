<script setup lang="ts">
import type { ClientStatus } from '~/types/clients'

const props = defineProps<{
  search: string
  status: 'all' | ClientStatus
  loading: boolean
  creating: boolean
  canReset: boolean
}>()

const emit = defineEmits<{
  'update:search': [value: string]
  'update:status': [value: 'all' | ClientStatus]
  'create-client': []
  'reset-filters': []
}>()

const statusItems = [
  { label: 'Status', value: 'all' },
  { label: 'Ativo', value: 'active' },
  { label: 'Inativo', value: 'inactive' }
]

function onStatusChange(value: unknown) {
  const normalized = String(value ?? 'all')
  if (normalized !== 'active' && normalized !== 'inactive') {
    emit('update:status', 'all')
    return
  }

  emit('update:status', normalized)
}
</script>

<template>
  <div class="rounded-[var(--radius-md)] border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-3">
    <div class="flex flex-wrap items-center gap-2">
      <div class="flex min-w-[280px] flex-1 items-center overflow-hidden rounded-[var(--radius-sm)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
        <span class="border-r border-[rgb(var(--border))] px-3 py-2 text-sm text-[rgb(var(--muted))]">Buscar</span>
        <UInput
          :model-value="props.search"
          placeholder="Pesquisar por nome..."
          class="w-full"
          :ui="{ base: 'border-0 bg-transparent focus:ring-0' }"
          @update:model-value="emit('update:search', String($event ?? ''))"
        />
      </div>

      <USelect
        :model-value="props.status"
        :items="statusItems"
        class="w-[180px]"
        @update:model-value="onStatusChange"
      />

      <UButton
        icon="i-lucide-plus"
        label="Novo cliente"
        color="primary"
        :loading="props.creating"
        :disabled="props.creating"
        @click="emit('create-client')"
      />

      <UButton
        icon="i-lucide-rotate-ccw"
        label="Limpar"
        color="neutral"
        variant="ghost"
        :disabled="!props.canReset || props.loading"
        @click="emit('reset-filters')"
      />
    </div>
  </div>
</template>
