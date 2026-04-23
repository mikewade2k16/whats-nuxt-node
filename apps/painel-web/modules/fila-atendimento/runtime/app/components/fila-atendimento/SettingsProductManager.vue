<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import type { FilaAtendimentoSettingsProductItem } from '~/types/fila-atendimento'

const props = defineProps<{
  products: FilaAtendimentoSettingsProductItem[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  add: [payload: { name: string; category: string; basePrice: number; code: string }]
  update: [productId: string, payload: { name: string; category: string; basePrice: number; code: string }]
  remove: [productId: string]
}>()

const drafts = ref<Record<string, { name: string; code: string; category: string; basePrice: number }>>({})
const newProduct = reactive({
  name: '',
  code: '',
  category: '',
  basePrice: ''
})
const addError = ref('')

watch(
  () => props.products,
  (products) => {
    drafts.value = Object.fromEntries((products || []).map((product) => [
      product.id,
      {
        name: product.name,
        code: product.code || '',
        category: product.category || '',
        basePrice: Number(product.basePrice || 0)
      }
    ]))
  },
  { immediate: true, deep: true }
)

function normalize(value: string) {
  return String(value || '').trim().toLowerCase()
}

function isDuplicateName(name: string, excludeId = '') {
  const normalized = normalize(name)
  if (!normalized) {
    return false
  }

  return (props.products || []).some((product) => product.id !== excludeId && normalize(product.name) === normalized)
}

function submitAdd() {
  const trimmed = newProduct.name.trim()
  if (!trimmed || props.disabled) {
    return
  }

  if (isDuplicateName(trimmed)) {
    addError.value = 'Ja existe um produto com esse nome.'
    return
  }

  addError.value = ''
  emit('add', {
    name: trimmed,
    code: String(newProduct.code || ''),
    category: String(newProduct.category || ''),
    basePrice: Number(newProduct.basePrice || 0) || 0
  })
  newProduct.name = ''
  newProduct.code = ''
  newProduct.category = ''
  newProduct.basePrice = ''
}
</script>

<template>
  <article class="settings-card">
    <header class="settings-card__header">
      <h3 class="settings-card__title">Catalogo de produtos</h3>
      <p class="settings-card__text">Usado no search do modal. Depois voce pode trocar por API sem mudar o fluxo do fechamento.</p>
    </header>

    <div class="product-head">
      <span>Produto</span>
      <span>Codigo</span>
      <span>Categoria</span>
      <span>Preco base</span>
    </div>

    <div class="product-list">
      <span v-if="!products.length" class="insight-empty">Sem produtos no catalogo.</span>
      <div v-for="product in products" :key="product.id" class="product-row">
        <input v-if="drafts[product.id]" v-model="drafts[product.id].name" class="product-row__input" type="text" :disabled="disabled" @change="emit('update', product.id, drafts[product.id])">
        <input v-if="drafts[product.id]" v-model="drafts[product.id].code" class="product-row__input" type="text" :disabled="disabled" @change="emit('update', product.id, drafts[product.id])">
        <input v-if="drafts[product.id]" v-model="drafts[product.id].category" class="product-row__input" type="text" :disabled="disabled" @change="emit('update', product.id, drafts[product.id])">
        <input v-if="drafts[product.id]" v-model="drafts[product.id].basePrice" class="product-row__input" type="number" min="0" step="0.01" :disabled="disabled" @change="emit('update', product.id, drafts[product.id])">
        <button class="product-row__remove" type="button" :disabled="disabled" @click="emit('remove', product.id)">Excluir</button>
      </div>
    </div>

    <form class="product-add" @submit.prevent="submitAdd">
      <input v-model="newProduct.name" class="product-add__input" type="text" placeholder="Nome do produto" :disabled="disabled" @input="addError = ''">
      <input v-model="newProduct.code" class="product-add__input" type="text" placeholder="Codigo do produto" :disabled="disabled">
      <input v-model="newProduct.category" class="product-add__input" type="text" placeholder="Categoria" :disabled="disabled">
      <input v-model="newProduct.basePrice" class="product-add__input" type="number" min="0" step="0.01" placeholder="Preco base" :disabled="disabled">
      <button class="product-add__button" type="submit" :disabled="disabled">Adicionar produto</button>
    </form>
    <span v-if="addError" class="option-add__error">{{ addError }}</span>
  </article>
</template>