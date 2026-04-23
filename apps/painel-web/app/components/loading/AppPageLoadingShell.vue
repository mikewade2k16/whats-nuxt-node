<script setup lang="ts">
withDefaults(defineProps<{
  title?: string;
  description?: string;
}>(), {
  title: "Carregando painel",
  description: "Preparando módulos, sessões e contexto visual."
});
</script>

<template>
  <div class="page-loading-shell" role="status" aria-live="polite" :aria-label="title">
    <section class="page-loading-shell__hero">
      <div class="page-loading-shell__copy">
        <USkeleton class="h-6 w-44" />
        <USkeleton class="h-4 w-72 max-w-full" />
      </div>
      <div class="page-loading-shell__chips">
        <USkeleton class="h-9 w-40" />
        <USkeleton class="h-9 w-28" />
      </div>
    </section>

    <section class="page-loading-shell__grid">
      <div class="page-loading-shell__card page-loading-shell__card--sidebar">
        <USkeleton class="h-10 w-full" />
        <USkeleton class="h-10 w-full" />
        <USkeleton class="h-10 w-full" />
        <USkeleton class="h-28 w-full" />
      </div>

      <div class="page-loading-shell__card page-loading-shell__card--content">
        <USkeleton class="h-8 w-52" />
        <USkeleton class="h-52 w-full" />
        <USkeleton class="h-10 w-full" />
      </div>
    </section>

    <p class="page-loading-shell__label">{{ description }}</p>
  </div>
</template>

<style scoped>
.page-loading-shell {
  display: grid;
  gap: 1rem;
  padding: 1rem 0.75rem;
}

.page-loading-shell__hero,
.page-loading-shell__card {
  border: 1px solid rgb(var(--border));
  border-radius: var(--radius-lg);
  background: rgb(var(--surface));
}

.page-loading-shell__hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  flex-wrap: wrap;
}

.page-loading-shell__copy,
.page-loading-shell__chips,
.page-loading-shell__card {
  display: grid;
  gap: 0.75rem;
}

.page-loading-shell__chips {
  grid-auto-flow: column;
}

.page-loading-shell__grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(18rem, 22rem) minmax(0, 1fr);
}

.page-loading-shell__card {
  padding: 1rem;
}

.page-loading-shell__label {
  margin: 0;
  font-size: 0.85rem;
  color: rgb(var(--muted));
}

@media (max-width: 960px) {
  .page-loading-shell__grid {
    grid-template-columns: 1fr;
  }

  .page-loading-shell__chips {
    grid-auto-flow: row;
    width: 100%;
  }
}
</style>
