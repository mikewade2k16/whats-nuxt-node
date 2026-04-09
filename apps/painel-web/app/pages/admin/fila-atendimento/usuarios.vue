<script setup lang="ts">
import FilaAtendimentoPageShell from '~/components/fila-atendimento/FilaAtendimentoPageShell.vue'
import UsersWorkspace from '~/components/fila-atendimento/UsersWorkspace.vue'

definePageMeta({ layout: 'admin' })
</script>

<template>
  <FilaAtendimentoPageShell workspace-id="usuarios" title="Usuarios" description="Atalho para grants operacionais do modulo, com identidade principal sob controle do shell administrativo.">
    <UsersWorkspace />
  </FilaAtendimentoPageShell>
</template>