<script setup lang="ts">
defineProps<{
  tabs: Array<{ id: string; label: string; icon: string }>
  activeTab: string
}>()

defineEmits<{
  'update:active-tab': [tabId: string]
}>()
</script>

<template>
  <nav class="settings-tabs">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      :data-testid="`settings-tab-${tab.id}`"
      :class="['settings-tabs__btn', { 'is-active': activeTab === tab.id }]"
      @click="$emit('update:active-tab', tab.id)"
    >
      <AppMaterialIcon :name="tab.icon" />
      <span>{{ tab.label }}</span>
    </button>
  </nav>
</template>