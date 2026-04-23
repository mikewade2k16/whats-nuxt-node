<script setup lang="ts">
import FilaAtendimentoHost from '~/components/fila-atendimento/FilaAtendimentoHost.vue'

definePageMeta({
  layout: 'admin'
})
</script>

<template>
  <div class="space-y-4">
    <div class="rounded-2xl border border-gray-800/80 bg-gray-950/70 p-4">
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Fila de Atendimento</p>
      <h1 class="mt-2 text-2xl font-semibold text-white">Diagnostico do host</h1>
      <p class="mt-2 max-w-3xl text-sm text-gray-400">
        Esta rota preserva o host anterior para smoke tests do bridge, sessao do modulo, contexto e snapshots.
      </p>
    </div>

    <FilaAtendimentoHost />
  </div>
</template>