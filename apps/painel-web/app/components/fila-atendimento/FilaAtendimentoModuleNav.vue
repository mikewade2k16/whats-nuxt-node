<script setup lang="ts">
import { computed } from 'vue'
import { getAllowedWorkspaces } from '~/utils/fila-atendimento/permissions'
import { FILA_ATENDIMENTO_WORKSPACES } from '~/utils/fila-atendimento/workspaces'

const props = defineProps<{
  activeWorkspace: string
  role: string
}>()

const visibleWorkspaces = computed(() => {
  const allowed = new Set(getAllowedWorkspaces(props.role))
  return FILA_ATENDIMENTO_WORKSPACES.filter((workspace) => allowed.has(workspace.id))
})
</script>

<template>
  <nav class="fila-module-nav" aria-label="Areas do modulo fila-atendimento">
    <NuxtLink
      v-for="workspace in visibleWorkspaces"
      :key="workspace.id"
      :to="workspace.path"
      class="fila-module-nav__item"
      :class="{ 'fila-module-nav__item--active': workspace.id === activeWorkspace }"
    >
      <span class="material-icons-round fila-module-nav__icon">{{ workspace.icon }}</span>
      <span>{{ workspace.label }}</span>
      <span v-if="!workspace.supported" class="fila-module-nav__badge">backend pendente</span>
    </NuxtLink>
  </nav>
</template>