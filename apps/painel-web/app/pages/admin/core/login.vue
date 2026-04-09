<script setup lang="ts">
definePageMeta({
  layout: false
});

await navigateTo("/admin/login", { replace: true, redirectCode: 301 });
</script>

<template>
  <div />
</template>
