<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { FilaAtendimentoSettingsProductItem } from '~/types/fila-atendimento'

const props = defineProps<{
  products: FilaAtendimentoSettingsProductItem[]
  disabled: boolean
}>()

const emit = defineEmits<{
  add: [payload: { name: string; category: string; basePrice: number; code: string }]
  update: [productId: string, payload: { name: string; category: string; basePrice: number; code: string }]
  remove: [productId: string]
}>()

const drafts = reactive<Record<string, { name: string; code: string; category: string; basePrice: number }>>({})
const createDraft = reactive({ name: '', code: '', category: '', basePrice: 0 })

watch(
  () => props.products,
  (products) => {
    for (const product of products) {
      drafts[product.id] = {
        name: product.name || '',
        code: product.code || '',
        category: product.category || '',
        basePrice: Number(product.basePrice || 0)
      }
    }
  },
  { immediate: true, deep: true }
)

function handleAdd() {
  if (!String(createDraft.name || '').trim()) {
    return
  }

  emit('add', {
    name: createDraft.name,
    code: createDraft.code,
    category: createDraft.category,
    basePrice: Number(createDraft.basePrice || 0)
  })

  createDraft.name = ''
  createDraft.code = ''
  createDraft.category = ''
  createDraft.basePrice = 0
}
</script>

<template>
  <article class="settings-card">
    <header class="settings-card__header">
      <h3 class="settings-card__title">Produtos</h3>
      <p class="settings-card__text">Catalogo usado no fechamento do atendimento e nos relatorios.</p>
    </header>

    <div class="list-editor">
      <div v-for="product in products" :key="product.id" class="list-editor__product-row">
        <input v-model="drafts[product.id].name" class="module-shell__input" type="text" placeholder="Nome" :disabled="disabled">
        <input v-model="drafts[product.id].code" class="module-shell__input" type="text" placeholder="Codigo" :disabled="disabled">
        <input v-model="drafts[product.id].category" class="module-shell__input" type="text" placeholder="Categoria" :disabled="disabled">
        <input v-model.number="drafts[product.id].basePrice" class="module-shell__input" type="number" min="0" step="1" placeholder="Preco" :disabled="disabled">
        <button class="column-action column-action--secondary" type="button" :disabled="disabled" @click="emit('update', product.id, drafts[product.id])">Salvar</button>
        <button class="column-action column-action--secondary" type="button" :disabled="disabled" @click="emit('remove', product.id)">Remover</button>
      </div>

      <div class="list-editor__product-row">
        <input v-model="createDraft.name" class="module-shell__input" type="text" placeholder="Nome do produto" :disabled="disabled">
        <input v-model="createDraft.code" class="module-shell__input" type="text" placeholder="Codigo" :disabled="disabled">
        <input v-model="createDraft.category" class="module-shell__input" type="text" placeholder="Categoria" :disabled="disabled">
        <input v-model.number="createDraft.basePrice" class="module-shell__input" type="number" min="0" step="1" placeholder="Preco" :disabled="disabled">
        <button class="column-action column-action--primary" type="button" :disabled="disabled || !createDraft.name.trim()" @click="handleAdd">Adicionar</button>
      </div>
    </div>
  </article>
</template>