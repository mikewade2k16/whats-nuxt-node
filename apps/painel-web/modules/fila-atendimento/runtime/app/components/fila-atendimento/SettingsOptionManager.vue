<script setup lang="ts">
import { ref, watch } from 'vue'
import type { FilaAtendimentoSettingsOptionItem } from '~/types/fila-atendimento'

const props = defineProps<{
  title: string
  description?: string
  items: FilaAtendimentoSettingsOptionItem[]
  addPlaceholder?: string
  testid?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  add: [label: string]
  update: [optionId: string, label: string]
  remove: [optionId: string]
}>()

const drafts = ref<Record<string, string>>({})
const updateErrors = ref<Record<string, string>>({})
const newLabel = ref('')
const addError = ref('')

watch(
  () => props.items,
  (items) => {
    drafts.value = Object.fromEntries((items || []).map((item) => [item.id, item.label]))
  },
  { immediate: true, deep: true }
)

function normalize(value: string) {
  return String(value || '').trim().toLowerCase()
}

function isDuplicate(label: string, excludeId = '') {
  const normalized = normalize(label)
  if (!normalized) {
    return false
  }

  return (props.items || []).some((item) => item.id !== excludeId && normalize(item.label) === normalized)
}

function submitAdd() {
  const trimmed = newLabel.value.trim()
  if (!trimmed || props.disabled) {
    return
  }

  if (isDuplicate(trimmed)) {
    addError.value = 'Ja existe um registro com esse nome.'
    return
  }

  addError.value = ''
  emit('add', trimmed)
  newLabel.value = ''
}

function submitUpdate(optionId: string) {
  const label = drafts.value[optionId] || ''
  if (props.disabled) {
    return
  }

  if (isDuplicate(label, optionId)) {
    updateErrors.value = { ...updateErrors.value, [optionId]: 'Ja existe um registro com esse nome.' }
    return
  }

  updateErrors.value = { ...updateErrors.value, [optionId]: '' }
  emit('update', optionId, label)
}
</script>

<template>
  <article class="settings-card">
    <header class="settings-card__header">
      <h3 class="settings-card__title">{{ title }}</h3>
      <p class="settings-card__text">{{ description }}</p>
    </header>

    <div class="option-list">
      <span v-if="!items.length" class="insight-empty">Sem opcoes cadastradas.</span>
      <form v-for="item in items" :key="item.id" class="option-row" @submit.prevent="submitUpdate(item.id)">
        <input v-model="drafts[item.id]" class="option-row__input" type="text" :disabled="disabled" @input="updateErrors[item.id] = ''">
        <button class="option-row__save" type="submit" :disabled="disabled">Salvar</button>
        <button class="option-row__remove" type="button" :disabled="disabled" @click="emit('remove', item.id)">Excluir</button>
        <span v-if="updateErrors[item.id]" class="option-row__error">{{ updateErrors[item.id] }}</span>
      </form>
    </div>

    <form class="option-add" @submit.prevent="submitAdd">
      <input v-model="newLabel" class="option-add__input" type="text" :placeholder="addPlaceholder || 'Adicionar nova opcao'" :data-testid="testid ? `${testid}-add-input` : undefined" :disabled="disabled" @input="addError = ''">
      <button class="option-add__button" type="submit" :data-testid="testid ? `${testid}-add-btn` : undefined" :disabled="disabled">Adicionar</button>
    </form>
    <span v-if="addError" class="option-add__error">{{ addError }}</span>
  </article>
</template>