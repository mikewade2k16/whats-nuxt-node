<script setup lang="ts">
import { computed } from 'vue'
import { resolveAppIconName } from '~/utils/app-icons'

const props = withDefaults(defineProps<{
  name?: string | null
  fallback?: string
}>(), {
  name: '',
  fallback: 'i-lucide-circle'
})

const iconName = computed(() => resolveAppIconName(props.name, props.fallback))
</script>

<template>
  <UIcon :name="iconName" class="material-icons-round app-material-icon" aria-hidden="true" />
</template>

<style scoped>
.app-material-icon {
  display: inline-flex;
  width: 1em;
  height: 1em;
  vertical-align: middle;
}
</style>