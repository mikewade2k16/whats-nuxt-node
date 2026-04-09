<script setup lang="ts">
import { UButton, UCard } from "#components";
import { computed, ref } from "vue";
import OmnichannelAuditModule from "~/components/omnichannel/OmnichannelAuditModule.vue";

definePageMeta({
  layout: "admin"
});

type AuditTabId = "omnichannel";

const activeTab = ref<AuditTabId>("omnichannel");

const tabs = [
  {
    id: "omnichannel",
    label: "Omnichannel",
    description: "Falhas outbound, latência, erros por endpoint e documentação operacional."
  }
] satisfies Array<{
  id: AuditTabId;
  label: string;
  description: string;
}>;

const activeTabMeta = computed(() => {
  return tabs.find((entry) => entry.id === activeTab.value) ?? tabs[0];
});
</script>

<template>
  <div class="manage-audit-page">
    <header class="manage-audit-page__header">
      <div>
        <p class="manage-audit-page__eyebrow">Manage</p>
        <h1 class="manage-audit-page__title">Auditoria</h1>
        <p class="manage-audit-page__subtitle">
          Centralizamos aqui as auditorias operacionais do painel. Hoje a trilha ativa é a do Omnichannel.
        </p>
      </div>
    </header>

    <UCard class="manage-audit-page__tabs-card">
      <div class="manage-audit-page__tabs">
        <UButton
          v-for="tab in tabs"
          :key="tab.id"
          :color="activeTab === tab.id ? 'primary' : 'neutral'"
          :variant="activeTab === tab.id ? 'solid' : 'soft'"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </UButton>
      </div>
      <p class="manage-audit-page__tab-description">
        {{ activeTabMeta.description }}
      </p>
    </UCard>

    <section v-if="activeTab === 'omnichannel'">
      <OmnichannelAuditModule :show-header="false" />
    </section>
  </div>
</template>

<style scoped>
.manage-audit-page {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.manage-audit-page__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.manage-audit-page__eyebrow {
  margin: 0 0 0.35rem;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
}

.manage-audit-page__title {
  margin: 0;
  font-size: clamp(1.5rem, 2vw, 2rem);
  font-weight: 700;
}

.manage-audit-page__subtitle,
.manage-audit-page__tab-description {
  margin: 0.4rem 0 0;
  color: var(--ui-text-muted);
}

.manage-audit-page__tabs-card,
.manage-audit-page__tabs {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

@media (max-width: 900px) {
  .manage-audit-page__header {
    flex-direction: column;
  }
}
</style>
