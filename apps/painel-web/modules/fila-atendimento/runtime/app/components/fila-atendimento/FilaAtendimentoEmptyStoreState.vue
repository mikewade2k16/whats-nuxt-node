<script setup lang="ts">
withDefaults(defineProps<{
  canManageStores?: boolean
  showMultistoreLink?: boolean
  title?: string
}>(), {
  canManageStores: false,
  showMultistoreLink: true,
  title: 'Nenhuma loja ativa foi encontrada'
})
</script>

<template>
  <article class="settings-card fila-empty-store-state">
    <p class="unsupported-card__eyebrow">Onboarding pendente</p>
    <h2 class="admin-panel__title">{{ title }}</h2>
    <p v-if="canManageStores" class="settings-card__text">
      Este tenant entrou no modulo, mas ainda nao possui lojas ativas. Cadastre a primeira loja em Multi-loja para liberar a operacao e os workspaces que dependem de uma loja ativa.
    </p>
    <p v-else class="settings-card__text">
      Este tenant ainda nao possui lojas ativas no modulo. Peca para um proprietario ou admin da plataforma cadastrar a primeira loja antes de continuar.
    </p>

    <div class="fila-empty-store-state__actions">
      <NuxtLink v-if="showMultistoreLink" class="column-action column-action--primary" to="/admin/fila-atendimento/multiloja">
        Abrir Multi-loja
      </NuxtLink>
      <NuxtLink class="column-action" to="/admin/fila-atendimento/diagnostico">
        Abrir diagnostico
      </NuxtLink>
    </div>
  </article>
</template>

<style scoped>
.fila-empty-store-state {
  display: grid;
  gap: 0.75rem;
}

.fila-empty-store-state__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
</style>