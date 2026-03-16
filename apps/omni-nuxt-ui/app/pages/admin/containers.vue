<template>
  <div>
    <AdminPageHeader title="Monitoramento de Containers" description="Status e controle dos containers em tempo real" />
    <div class="bg-white rounded-lg shadow mt-6">
      <AdminContainerMonitor />
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin'
})
</script>
