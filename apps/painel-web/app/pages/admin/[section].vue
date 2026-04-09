<script setup lang="ts">
definePageMeta({
  layout: 'admin'
})

const route = useRoute()

const title = computed(() => {
  const value = String(route.params.section || '')
  return value
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
})
</script>

<template>
  <section class="space-y-4">
    <AdminPageHeader
      eyebrow="Admin"
      :title="title"
      description="Pagina de placeholder para validacao do layout e navegacao do cabecalho."
    />

    <div class="rounded-[var(--radius-md)] border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-5">
      <p class="text-sm text-[rgb(var(--muted))]">
        Pagina de placeholder para validacao do layout e navegacao do cabecalho.
      </p>
    </div>
  </section>
</template>
