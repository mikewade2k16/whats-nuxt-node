<script setup lang="ts">
interface AdminPageHeaderProps {
  eyebrow?: string
  title?: string
  description?: string
}

const props = withDefaults(defineProps<AdminPageHeaderProps>(), {
  eyebrow: '',
  title: '',
  description: ''
})

const pageHeaderVisibility = useAdminPageHeaderVisibility()

const hasEyebrow = computed(() => props.eyebrow.trim().length > 0)
const hasTitle = computed(() => props.title.trim().length > 0)
const hasDescription = computed(() => props.description.trim().length > 0)

const showEyebrow = computed(() => pageHeaderVisibility.showEyebrow.value && hasEyebrow.value)
const showTitle = computed(() => pageHeaderVisibility.showTitle.value && hasTitle.value)
const showDescription = computed(() => pageHeaderVisibility.showDescription.value && hasDescription.value)
const showHeader = computed(() => showEyebrow.value || showTitle.value || showDescription.value)
</script>

<template>
  <header v-if="showHeader" class="admin-page-header space-y-1">
    <p v-if="showEyebrow" class="admin-page-header__eyebrow text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
      {{ eyebrow }}
    </p>

    <h1 v-if="showTitle" class="admin-page-header__title text-2xl font-semibold tracking-tight">
      {{ title }}
    </h1>

    <p v-if="showDescription" class="admin-page-header__description text-sm text-[rgb(var(--muted))]">
      {{ description }}
    </p>
  </header>
</template>
