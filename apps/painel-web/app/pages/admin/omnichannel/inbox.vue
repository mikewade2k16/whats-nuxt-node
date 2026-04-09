<script setup lang="ts">
import { defineAsyncComponent } from "vue";
import OmnichannelInboxLoading from "~/components/omnichannel/OmnichannelInboxLoading.vue";

const AsyncOmnichannelInboxModule = defineAsyncComponent({
  loader: () => import("~/components/omnichannel/OmnichannelInboxModule.vue"),
  loadingComponent: OmnichannelInboxLoading,
  delay: 120,
  suspensible: false,
  timeout: 20_000
});

definePageMeta({
  layout: "admin"
});
</script>

<template>
  <section class="omnichannel-inbox-page">
    <ClientOnly>
      <AsyncOmnichannelInboxModule />
      <template #fallback>
        <OmnichannelInboxLoading />
      </template>
    </ClientOnly>
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
