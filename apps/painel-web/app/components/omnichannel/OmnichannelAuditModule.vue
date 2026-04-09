<script setup lang="ts">
import { UAlert, UBadge, UButton, UCard, USelect } from "#components";
import { computed, onMounted } from "vue";
import ProjectDocsModule from "~/components/docs/ProjectDocsModule.vue";
import { useOmnichannelAudit } from "~/composables/omnichannel/useOmnichannelAudit";

const props = withDefaults(defineProps<{
  showHeader?: boolean;
}>(), {
  showHeader: true
});

const {
  activate,
  canViewAudit,
  errorMessage,
  failureWindowDays,
  failuresDashboard,
  httpEndpointMetrics,
  loadFailuresDashboard,
  loadHttpMetrics,
  loadingFailures,
  loadingHttpMetrics
} = useOmnichannelAudit();

const failureWindowItems = [
  { label: "7 dias", value: 7 },
  { label: "15 dias", value: 15 },
  { label: "30 dias", value: 30 }
];

const topSlowEndpoints = computed(() => httpEndpointMetrics.value?.endpoints.slice(0, 8) ?? []);
const recentFailures = computed(() => failuresDashboard.value?.recentFailures.slice(0, 8) ?? []);

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "--";
  }

  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "0";
  }

  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "0%";
  }

  return `${value.toFixed(1)}%`;
}

onMounted(async () => {
  await activate();
});
</script>

<template>
  <div class="omni-audit">
    <header v-if="props.showHeader" class="omni-audit__header">
      <div>
        <p class="omni-audit__eyebrow">Atendimento online</p>
        <h1 class="omni-audit__title">Auditoria operacional</h1>
        <p class="omni-audit__subtitle">
          Falhas outbound, latencia por endpoint e documentacao do modulo reunidas em um ponto so.
        </p>
      </div>

      <div class="omni-audit__actions">
        <USelect
          v-model="failureWindowDays"
          :items="failureWindowItems"
          value-key="value"
          class="omni-audit__window-select"
          @update:model-value="loadFailuresDashboard({ days: Number($event ?? failureWindowDays) })"
        />
        <UButton
          color="neutral"
          variant="outline"
          :loading="loadingFailures || loadingHttpMetrics"
          @click="activate()"
        >
          Atualizar
        </UButton>
      </div>
    </header>

    <UAlert
      v-if="!canViewAudit"
      color="warning"
      variant="soft"
      title="Acesso restrito"
      description="A auditoria do atendimento fica disponivel apenas para administradores e supervisores."
    />

    <template v-else>
      <UAlert
        v-if="errorMessage"
        color="error"
        variant="soft"
        :title="errorMessage"
      />

      <section class="omni-audit__metrics">
        <UCard class="omni-audit__metric-card">
          <p class="omni-audit__metric-label">Falhas outbound</p>
          <p class="omni-audit__metric-value">{{ formatNumber(failuresDashboard?.failedTotal) }}</p>
          <p class="omni-audit__metric-hint">Janela de {{ failureWindowDays }} dias</p>
        </UCard>

        <UCard class="omni-audit__metric-card">
          <p class="omni-audit__metric-label">Requisicoes</p>
          <p class="omni-audit__metric-value">{{ formatNumber(httpEndpointMetrics?.summary.totalRequests) }}</p>
          <p class="omni-audit__metric-hint">Desde {{ formatDate(httpEndpointMetrics?.startedAt) }}</p>
        </UCard>

        <UCard class="omni-audit__metric-card">
          <p class="omni-audit__metric-label">Erro HTTP</p>
          <p class="omni-audit__metric-value">{{ formatPercent(httpEndpointMetrics?.summary.errorRatePercent) }}</p>
          <p class="omni-audit__metric-hint">
            {{ formatNumber(httpEndpointMetrics?.summary.totalErrors) }} respostas com erro
          </p>
        </UCard>

        <UCard class="omni-audit__metric-card">
          <p class="omni-audit__metric-label">P95 mais alto</p>
          <p class="omni-audit__metric-value">
            {{ topSlowEndpoints[0] ? `${formatNumber(topSlowEndpoints[0].p95Ms)} ms` : "--" }}
          </p>
          <p class="omni-audit__metric-hint">
            {{ topSlowEndpoints[0]?.route || "Nenhum endpoint amostrado ainda" }}
          </p>
        </UCard>
      </section>

      <section class="omni-audit__grid">
        <UCard class="omni-audit__panel">
          <div class="omni-audit__panel-header">
            <div>
              <h2 class="omni-audit__panel-title">Dashboard de falhas outbound</h2>
              <p class="omni-audit__panel-subtitle">Tipos de mensagem com maior incidencia de falha.</p>
            </div>
            <UButton
              size="sm"
              color="neutral"
              variant="ghost"
              :loading="loadingFailures"
              @click="loadFailuresDashboard({ days: failureWindowDays })"
            >
              Recarregar
            </UButton>
          </div>

          <div v-if="loadingFailures && !failuresDashboard" class="omni-audit__empty">
            Carregando falhas do modulo...
          </div>

          <div v-else-if="!failuresDashboard" class="omni-audit__empty">
            Nenhum dado de falha disponivel no momento.
          </div>

          <ul v-else class="omni-audit__stack-list">
            <li v-for="entry in failuresDashboard.failedByType" :key="entry.messageType" class="omni-audit__list-row">
              <div>
                <p class="omni-audit__list-title">{{ entry.messageType }}</p>
                <p class="omni-audit__list-subtitle">
                  {{ formatPercent((entry.total / Math.max(failuresDashboard.failedTotal || 1, 1)) * 100) }} das falhas no periodo
                </p>
              </div>
              <UBadge color="error" variant="soft">{{ formatNumber(entry.total) }}</UBadge>
            </li>
          </ul>
        </UCard>

        <UCard class="omni-audit__panel">
          <div class="omni-audit__panel-header">
            <div>
              <h2 class="omni-audit__panel-title">Latencia e erros por endpoint</h2>
              <p class="omni-audit__panel-subtitle">Endpoints mais lentos e mais propensos a erro.</p>
            </div>
            <UButton
              size="sm"
              color="neutral"
              variant="ghost"
              :loading="loadingHttpMetrics"
              @click="loadHttpMetrics()"
            >
              Recarregar
            </UButton>
          </div>

          <div v-if="loadingHttpMetrics && !httpEndpointMetrics" class="omni-audit__empty">
            Carregando metricas HTTP...
          </div>

          <div v-else-if="topSlowEndpoints.length < 1" class="omni-audit__empty">
            Nenhuma amostra de endpoint registrada ainda.
          </div>

          <ul v-else class="omni-audit__stack-list">
            <li v-for="entry in topSlowEndpoints" :key="entry.key" class="omni-audit__list-row omni-audit__list-row--stretch">
              <div>
                <p class="omni-audit__list-title">{{ entry.method }} {{ entry.route }}</p>
                <p class="omni-audit__list-subtitle">
                  {{ formatNumber(entry.totalRequests) }} req | {{ formatNumber(entry.errors) }} erros | ultimo {{ entry.lastStatusCode }}
                </p>
              </div>
              <div class="omni-audit__endpoint-metrics">
                <UBadge color="warning" variant="soft">P95 {{ formatNumber(entry.p95Ms) }} ms</UBadge>
                <UBadge color="neutral" variant="soft">Erro {{ formatPercent(entry.errorRatePercent) }}</UBadge>
              </div>
            </li>
          </ul>
        </UCard>
      </section>

      <section class="omni-audit__grid">
        <UCard class="omni-audit__panel">
          <h2 class="omni-audit__panel-title">Ultimas falhas</h2>

          <div v-if="recentFailures.length < 1" class="omni-audit__empty">
            Nenhuma falha outbound recente nesta janela.
          </div>

          <ul v-else class="omni-audit__stack-list">
            <li v-for="entry in recentFailures" :key="entry.id" class="omni-audit__list-row omni-audit__list-row--stretch">
              <div>
                <p class="omni-audit__list-title">{{ entry.contactName || entry.externalId }}</p>
                <p class="omni-audit__list-subtitle">{{ entry.content || "[sem conteudo textual]" }}</p>
              </div>
              <div class="omni-audit__failure-meta">
                <UBadge color="error" variant="soft">{{ entry.messageType }}</UBadge>
                <span>{{ formatDate(entry.createdAt) }}</span>
              </div>
            </li>
          </ul>
        </UCard>

        <UCard class="omni-audit__panel">
          <h2 class="omni-audit__panel-title">Leitura rapida do runtime</h2>
          <ul class="omni-audit__quick-list">
            <li>Falhas outbound e latencia ficam consolidadas aqui para revisar saude do modulo antes de producao.</li>
            <li>Documentacao do atendimento fica logo abaixo e deve ser revisada porque ainda tem pontos defasados.</li>
            <li>Se a Evolution sair do ar ou o host nao resolver DNS, o erro volta com mensagem amigavel sem derrubar o painel.</li>
          </ul>
        </UCard>
      </section>

      <section class="omni-audit__docs">
        <ProjectDocsModule
          embedded
          title="Documentacao em revisao"
          subtitle="Checklist tecnico do atendimento centralizado na auditoria para a proxima rodada de revisao."
        />
      </section>
    </template>
  </div>
</template>

<style scoped>
.omni-audit {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.omni-audit__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.omni-audit__eyebrow {
  margin: 0 0 0.35rem;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
}

.omni-audit__title {
  margin: 0;
  font-size: clamp(1.5rem, 2vw, 2rem);
  font-weight: 700;
}

.omni-audit__subtitle {
  margin: 0.4rem 0 0;
  max-width: 60rem;
  color: var(--ui-text-muted);
}

.omni-audit__actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.omni-audit__window-select {
  min-width: 8rem;
}

.omni-audit__metrics,
.omni-audit__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
}

.omni-audit__grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.omni-audit__metric-card,
.omni-audit__panel {
  min-height: 100%;
}

.omni-audit__metric-label,
.omni-audit__metric-hint,
.omni-audit__panel-subtitle,
.omni-audit__list-subtitle {
  margin: 0;
  color: var(--ui-text-muted);
}

.omni-audit__metric-value {
  margin: 0.4rem 0;
  font-size: 1.75rem;
  font-weight: 700;
}

.omni-audit__panel-header,
.omni-audit__list-row,
.omni-audit__failure-meta,
.omni-audit__endpoint-metrics {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.omni-audit__panel-header {
  margin-bottom: 1rem;
  align-items: flex-start;
}

.omni-audit__panel-title,
.omni-audit__list-title {
  margin: 0;
  font-weight: 600;
}

.omni-audit__stack-list,
.omni-audit__quick-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0;
  margin: 0;
  list-style: none;
}

.omni-audit__list-row {
  padding: 0.85rem 0;
  border-top: 1px solid var(--ui-border);
}

.omni-audit__list-row:first-child {
  border-top: 0;
  padding-top: 0;
}

.omni-audit__list-row--stretch {
  align-items: flex-start;
}

.omni-audit__failure-meta,
.omni-audit__endpoint-metrics {
  flex-wrap: wrap;
  justify-content: flex-end;
  font-size: 0.85rem;
  color: var(--ui-text-muted);
}

.omni-audit__empty {
  color: var(--ui-text-muted);
}

.omni-audit__docs {
  margin-top: 0.5rem;
}

@media (max-width: 1100px) {
  .omni-audit__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .omni-audit__header,
  .omni-audit__grid,
  .omni-audit__metrics {
    grid-template-columns: 1fr;
  }

  .omni-audit__header {
    flex-direction: column;
  }
}
</style>
