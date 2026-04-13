<script setup lang="ts">
import { useIndicatorsWorkspaceLive } from '~/composables/useIndicatorsWorkspaceLive'

definePageMeta({
  layout: 'admin'
})

const sessionSimulation = useSessionSimulationStore()
const { coreUser, isAuthenticated } = useAdminSession()

const accessContext = computed(() => ({
  isAuthenticated: Boolean(isAuthenticated.value),
  isRootUser: Boolean(coreUser.value?.isPlatformAdmin),
  profileUserType: sessionSimulation.profileUserType,
  profileUserLevel: sessionSimulation.profileUserLevel,
  sessionUserType: sessionSimulation.userType,
  sessionUserLevel: sessionSimulation.userLevel,
  preferences: sessionSimulation.profilePreferences,
  hasModule: (moduleCode: string) => sessionSimulation.hasModule(moduleCode)
}))

const canAccessGovernance = computed(() => evaluateAdminRouteAccess('/admin/manage/indicadores', accessContext.value).allowed)

const {
  loading,
  errorMessage,
  summary,
  actorName,
  clientLabel,
  draftStart,
  draftEnd,
  appliedStart,
  appliedEnd,
  appliedRangeLabel,
  evaluationsOpen,
  evaluationModalOpen,
  evaluations,
  totalEvaluationCount,
  hasResults,
  dashboard,
  indicatorSections,
  rangePresets,
  unitOptions,
  indicatorOptions,
  toggleEvaluations,
  applyFilters,
  applyPreset,
  openEvaluationForm,
  deleteEvaluation,
  exportEvaluations,
  createEvaluation
} = useIndicatorsWorkspaceLive()
</script>

<template>
  <section class="indicators-page space-y-4">
    <AdminPageHeader
      eyebrow="Modulo"
      title="Indicadores"
      description="Auditoria operacional e comercial por unidade, com dashboard consolidado, avaliacoes persistidas no core e leitura realtime do modulo hospedado em Go."
    />

    <div class="indicators-page__cta-strip">
      <NuxtLink to="/admin/indicadores/configuracoes" class="indicators-page__cta-card">
        <div>
          <p class="indicators-page__cta-eyebrow">Core</p>
          <strong class="indicators-page__cta-title">Abrir configuracoes do perfil</strong>
          <p class="indicators-page__cta-copy">Editar pesos, campos, evidence policy, overrides por loja e bindings diretamente no backend real.</p>
        </div>
        <UIcon name="i-lucide-arrow-right" class="indicators-page__cta-icon" />
      </NuxtLink>

      <NuxtLink v-if="canAccessGovernance" to="/admin/manage/indicadores" class="indicators-page__cta-card indicators-page__cta-card--secondary">
        <div>
          <p class="indicators-page__cta-eyebrow">Root</p>
          <strong class="indicators-page__cta-title">Abrir governanca global</strong>
          <p class="indicators-page__cta-copy">Templates, versionamento, publicacao de draft e preview de providers do modulo.</p>
        </div>
        <UIcon name="i-lucide-arrow-right" class="indicators-page__cta-icon" />
      </NuxtLink>
    </div>

    <IndicatorsWorkspaceNav :summary="summary" :can-access-governance="canAccessGovernance" />

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
      title="Falha ao carregar parte do workspace"
      :description="errorMessage"
    />

    <IndicatorsToolbar
      :applied-range-label="appliedRangeLabel"
      :draft-start="draftStart"
      :draft-end="draftEnd"
      :range-presets="rangePresets"
      :actor-name="actorName"
      :client-label="clientLabel"
      :evaluation-count="totalEvaluationCount"
      :evaluations-open="evaluationsOpen"
      @update:draft-start="draftStart = $event"
      @update:draft-end="draftEnd = $event"
      @apply="applyFilters"
      @toggle-evaluations="toggleEvaluations"
      @open-evaluation="openEvaluationForm"
      @select-preset="applyPreset"
    />

    <UAlert
      v-if="loading"
      color="neutral"
      variant="soft"
      icon="i-lucide-loader-circle"
      title="Sincronizando modulo"
      description="Atualizando dashboard, avaliacoes e secoes do perfil ativo."
    />

    <IndicatorsEvaluationTable
      v-if="evaluationsOpen"
      :rows="evaluations"
      :unit-options="unitOptions"
      @delete="deleteEvaluation"
      @export="exportEvaluations"
    />

    <template v-if="hasResults">
      <IndicatorsDashboardPanel :dashboard="dashboard" />

      <section class="indicators-page__content space-y-4">
        <div class="indicators-page__section-header">
          <div>
            <p class="indicators-page__section-eyebrow">Indicadores</p>
            <h2 class="indicators-page__section-title">Blocos por indicador</h2>
          </div>

          <UBadge color="neutral" variant="soft">
            {{ clientLabel }} | {{ appliedRangeLabel }}
          </UBadge>
        </div>

        <IndicatorsIndicatorSection
          v-for="section in indicatorSections"
          :key="section.code"
          :section="section"
        />
      </section>
    </template>

    <UAlert
      v-else
      color="warning"
      variant="soft"
      icon="i-lucide-shield-alert"
      title="Nenhuma avaliacao encontrada para este periodo"
      :description="`O recorte atual (${appliedRangeLabel}) nao possui avaliacoes sobrepostas para montar dashboard e cards.`"
    />

    <IndicatorsEvaluationModal
      v-model:open="evaluationModalOpen"
      :actor-name="actorName"
      :unit-options="unitOptions"
      :indicator-options="indicatorOptions"
      :default-start="appliedStart"
      :default-end="appliedEnd"
      @submit="createEvaluation"
    />

    <AppDialogHost />
    <AppToastStack />
  </section>
</template>

<style scoped>
.indicators-page {
  position: relative;
  display: grid;
}

.indicators-page::before {
  content: '';
  position: absolute;
  inset: -2rem 0 auto;
  height: 16rem;
  background:
    radial-gradient(circle at top left, rgba(15, 118, 110, 0.12), transparent 46%),
    radial-gradient(circle at top right, rgba(180, 83, 9, 0.1), transparent 42%);
  pointer-events: none;
}

.indicators-page > * {
  position: relative;
}

.indicators-page__content {
  display: grid;
}

.indicators-page__cta-strip {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
}

.indicators-page__cta-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.1rem;
  border: 1px solid rgba(15, 118, 110, 0.24);
  border-radius: 1rem;
  background:
    linear-gradient(135deg, rgba(15, 118, 110, 0.14), rgba(15, 23, 42, 0.08)),
    rgba(255, 255, 255, 0.03);
  color: inherit;
  text-decoration: none;
  transition: transform 0.18s ease, border-color 0.18s ease;
}

.indicators-page__cta-card:hover {
  transform: translateY(-1px);
  border-color: rgba(15, 118, 110, 0.42);
}

.indicators-page__cta-card--secondary {
  border-color: rgba(180, 83, 9, 0.24);
  background:
    linear-gradient(135deg, rgba(180, 83, 9, 0.14), rgba(15, 23, 42, 0.08)),
    rgba(255, 255, 255, 0.03);
}

.indicators-page__cta-card--secondary:hover {
  border-color: rgba(180, 83, 9, 0.42);
}

.indicators-page__cta-eyebrow {
  margin: 0 0 0.35rem;
  font-size: 0.72rem;
  color: rgb(var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.indicators-page__cta-title {
  display: block;
  font-size: 1rem;
}

.indicators-page__cta-copy {
  margin: 0.35rem 0 0;
  color: rgb(var(--muted));
}

.indicators-page__cta-icon {
  font-size: 1.2rem;
  flex-shrink: 0;
}

.indicators-page__section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.1rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.03);
}

.indicators-page__section-eyebrow {
  margin: 0 0 0.35rem;
  font-size: 0.74rem;
  color: rgb(var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.indicators-page__section-title {
  margin: 0;
  font-size: 1.05rem;
}

@media (max-width: 720px) {
  .indicators-page__section-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>