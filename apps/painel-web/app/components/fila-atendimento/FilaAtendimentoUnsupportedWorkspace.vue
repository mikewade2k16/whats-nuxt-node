<script setup lang="ts">
defineProps<{
  title: string
  message: string
  detail?: string
  actionLabel?: string
  actionTo?: string
}>()
</script>

<template>
  <section class="admin-panel">
    <article class="unsupported-card">
      <p class="unsupported-card__eyebrow">Porte da interface concluido</p>
      <h2 class="admin-panel__title">{{ title }}</h2>
      <p class="admin-panel__text">{{ message }}</p>
      <p v-if="detail" class="settings-card__text">{{ detail }}</p>
      <NuxtLink v-if="actionTo && actionLabel" :to="actionTo" class="unsupported-card__action">
        {{ actionLabel }}
      </NuxtLink>
    </article>
  </section>
</template>