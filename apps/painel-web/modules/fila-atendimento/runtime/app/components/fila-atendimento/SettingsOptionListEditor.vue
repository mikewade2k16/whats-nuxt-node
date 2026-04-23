<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import type { FilaAtendimentoSettingsOptionItem } from '~/types/fila-atendimento'

const props = defineProps<{
  title: string
  description: string
  items: FilaAtendimentoSettingsOptionItem[]
  placeholder: string
  disabled: boolean
}>()

const emit = defineEmits<{
  add: [label: string]
  update: [optionId: string, label: string]
  remove: [optionId: string]
}>()

const newLabel = ref('')
const drafts = reactive<Record<string, string>>({})

watch(
  () => props.items,
  (items) => {
    for (const item of items) {
      drafts[item.id] = item.label
    }
  },
  { immediate: true, deep: true }
)

function handleAdd() {
  const label = String(newLabel.value || '').trim()
  if (!label) {
    return
  }

  emit('add', label)
  newLabel.value = ''
}
</script>

<template>
  <article class="settings-card">
    <header class="settings-card__header">
      <h3 class="settings-card__title">{{ title }}</h3>
      <p class="settings-card__text">{{ description }}</p>
    </header>

    <div class="list-editor">
      <div v-for="item in items" :key="item.id" class="list-editor__row">
        <input v-model="drafts[item.id]" class="module-shell__input" type="text" :disabled="disabled">
        <button class="column-action column-action--secondary" type="button" :disabled="disabled" @click="emit('update', item.id, drafts[item.id])">Salvar</button>
        <button class="column-action column-action--secondary" type="button" :disabled="disabled" @click="emit('remove', item.id)">Remover</button>
      </div>

      <div class="list-editor__row">
        <input v-model="newLabel" class="module-shell__input" type="text" :placeholder="placeholder" :disabled="disabled">
        <button class="column-action column-action--primary" type="button" :disabled="disabled || !newLabel.trim()" @click="handleAdd">Adicionar</button>
      </div>
    </div>
  </article>
</template>