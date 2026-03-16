<script setup lang="ts">
import OmnichannelInboxModule from "~/components/omnichannel/OmnichannelInboxModule.vue";

definePageMeta({
  layout: "admin"
});
</script>

<template>
  <section class="omnichannel-inbox-page">
    <OmnichannelInboxModule />
  </section>
</template>

<style scoped>
.omnichannel-inbox-page {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: calc(100vh - 6.5rem);
}
</style>
