<script setup lang="ts">
definePageMeta({
  layout: 'admin'
})

const {
  loading,
  saving,
  errorMessage,
  summary,
  templates,
  selectedTemplateId,
  selectedTemplate,
  governanceStats,
  policies,
  providerRegistry,
  tenantAdoption,
  roadmap,
  updatePolicyState,
  publishDraftVersion,
  duplicateTemplate
} = useIndicatorsGovernance()

const policyStateItems = [
  { label: 'System', value: 'system' },
  { label: 'Recommended', value: 'recommended' },
  { label: 'Custom', value: 'custom' }
]

function rolloutColor(status: string) {
  if (status === 'stable') return 'success'
  if (status === 'rolling') return 'warning'
  return 'neutral'
}

function roadmapColor(stage: string) {
  if (stage === 'now') return 'primary'
  if (stage === 'next') return 'warning'
  return 'neutral'
}
</script>

<template>
  <section class="indicators-governance-page space-y-4">
    <AdminPageHeader
      eyebrow="Manage"
      title="Governanca de Indicadores"
      description="Catalogo global de templates, publicacao de drafts, politicas default e preview de providers do modulo hospedado no core."
    />

    <IndicatorsWorkspaceNav :summary="summary" :can-access-governance="true" />

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
      title="Falha ao carregar governanca"
      :description="errorMessage"
    />

    <UAlert
      v-if="loading"
      color="neutral"
      variant="soft"
      icon="i-lucide-loader-circle"
      title="Sincronizando catalogo"
      description="Atualizando templates, preview de providers e estado atual do modulo."
    />

    <div class="indicators-governance-page__stats">
      <article
        v-for="stat in governanceStats"
        :key="stat.id"
        class="indicators-governance-page__stat-card"
      >
        <div class="indicators-governance-page__stat-head">
          <p class="indicators-governance-page__stat-label">{{ stat.label }}</p>
          <UBadge :color="stat.tone || 'neutral'" variant="soft">{{ stat.value }}</UBadge>
        </div>
        <p v-if="stat.helper" class="indicators-governance-page__stat-helper">{{ stat.helper }}</p>
      </article>
    </div>

    <UCard class="indicators-governance-page__templates-shell" :ui="{ body: 'indicators-governance-page__templates-body' }">
      <template #header>
        <div class="indicators-governance-page__section-head">
          <div>
            <p class="indicators-governance-page__eyebrow">Templates</p>
            <h2 class="indicators-governance-page__title">Catalogo global e versionamento</h2>
            <p class="indicators-governance-page__copy">Aqui fica a governanca do que sera publicado para clientes e do que ainda esta em calibracao.</p>
          </div>
          <UBadge color="neutral" variant="soft">{{ templates.length }} templates</UBadge>
        </div>
      </template>

      <IndicatorsGovernanceTemplates
        v-model:selected-template-id="selectedTemplateId"
        :templates="templates"
        @publish="publishDraftVersion"
        @duplicate="duplicateTemplate"
      />
    </UCard>

    <div class="indicators-governance-page__grid">
      <UCard class="indicators-governance-page__policies-shell" :ui="{ body: 'indicators-governance-page__policies-body' }">
        <template #header>
          <div class="indicators-governance-page__section-head">
            <div>
              <p class="indicators-governance-page__eyebrow">Defaults</p>
              <h2 class="indicators-governance-page__title">Politicas do modulo</h2>
              <p class="indicators-governance-page__copy">Mock do painel onde root decide o que e regra global, recomendacao ou ajuste local.</p>
            </div>
          </div>
        </template>

        <div class="indicators-governance-page__policy-list">
          <article
            v-for="policy in policies"
            :key="policy.id"
            class="indicators-governance-page__policy-card"
          >
            <div class="indicators-governance-page__policy-head">
              <div>
                <strong>{{ policy.title }}</strong>
                <p>{{ policy.description }}</p>
              </div>
              <UBadge color="neutral" variant="soft">{{ policy.affectedArea }}</UBadge>
            </div>

            <div class="indicators-governance-page__policy-grid">
              <div class="indicators-governance-page__field">
                <span class="indicators-governance-page__label">Valor</span>
                <UInput :model-value="policy.value" readonly />
              </div>
              <div class="indicators-governance-page__field">
                <span class="indicators-governance-page__label">Estado</span>
                <USelect
                  :model-value="policy.state"
                  :items="policyStateItems"
                  @update:model-value="updatePolicyState(policy.id, String($event ?? 'recommended') as typeof policy.state)"
                />
              </div>
            </div>
          </article>
        </div>
      </UCard>

      <IndicatorsProviderHealthGrid
        :providers="providerRegistry"
        title="Registry de providers"
        description="Visao root dos adaptadores que vao alimentar indicadores derivados no futuro backend."
      />
    </div>

    <div class="indicators-governance-page__grid">
      <UCard class="indicators-governance-page__rollout-shell" :ui="{ body: 'indicators-governance-page__rollout-body' }">
        <template #header>
          <div class="indicators-governance-page__section-head">
            <div>
              <p class="indicators-governance-page__eyebrow">Rollout</p>
              <h2 class="indicators-governance-page__title">Adoção por cliente</h2>
              <p class="indicators-governance-page__copy">Cliente atualmente em foco para validar escopo, template ativo e cobertura dos providers.</p>
            </div>
          </div>
        </template>

        <div class="indicators-governance-page__rollout-list">
          <article
            v-for="tenant in tenantAdoption"
            :key="tenant.id"
            class="indicators-governance-page__rollout-card"
          >
            <div class="indicators-governance-page__rollout-head">
              <div>
                <strong>{{ tenant.clientLabel }}</strong>
                <p>{{ tenant.activeTemplate }}</p>
              </div>
              <UBadge :color="rolloutColor(tenant.rolloutStatus)" variant="soft">{{ tenant.rolloutStatus }}</UBadge>
            </div>

            <div class="indicators-governance-page__rollout-meta">
              <span>Escopo: {{ tenant.scopeMode }}</span>
              <span>Providers: {{ tenant.providerCoverage }}</span>
              <span>Ultima mudanca: {{ tenant.lastChangeLabel }}</span>
            </div>
          </article>
        </div>
      </UCard>

      <UCard class="indicators-governance-page__roadmap-shell" :ui="{ body: 'indicators-governance-page__roadmap-body' }">
        <template #header>
          <div class="indicators-governance-page__section-head">
            <div>
              <p class="indicators-governance-page__eyebrow">Roadmap</p>
              <h2 class="indicators-governance-page__title">Cortes para fechar antes do Go</h2>
              <p class="indicators-governance-page__copy">Pendencias conhecidas para ampliar a governanca com mais endpoints e exportacoes dedicadas.</p>
            </div>
          </div>
        </template>

        <div class="indicators-governance-page__roadmap-list">
          <article
            v-for="item in roadmap"
            :key="item.id"
            class="indicators-governance-page__roadmap-card"
          >
            <div class="indicators-governance-page__roadmap-head">
              <strong>{{ item.title }}</strong>
              <UBadge :color="roadmapColor(item.stage)" variant="soft">{{ item.stage }}</UBadge>
            </div>
            <p class="indicators-governance-page__roadmap-copy">{{ item.description }}</p>
            <p class="indicators-governance-page__roadmap-owner">Owner: {{ item.owner }}</p>
            <div class="indicators-governance-page__roadmap-deps">
              <UBadge
                v-for="dependency in item.dependencies"
                :key="`${item.id}-${dependency}`"
                color="neutral"
                variant="soft"
              >
                {{ dependency }}
              </UBadge>
            </div>
          </article>
        </div>
      </UCard>
    </div>

    <UAlert
      v-if="selectedTemplate"
      color="neutral"
      variant="soft"
      icon="i-lucide-files"
      :title="`Template em foco: ${selectedTemplate.name}`"
      :description="saving ? 'Persistindo alteracoes do template no backend core.' : 'Este painel ja opera sobre o catalogo real de templates do modulo.'"
    />

    <AppToastStack />
  </section>
</template>

<style scoped>
.indicators-governance-page {
  position: relative;
  display: grid;
}

.indicators-governance-page::before {
  content: '';
  position: absolute;
  inset: -2rem 0 auto;
  height: 18rem;
  background:
    radial-gradient(circle at top left, rgba(180, 83, 9, 0.1), transparent 42%),
    radial-gradient(circle at top right, rgba(15, 118, 110, 0.12), transparent 40%);
  pointer-events: none;
}

.indicators-governance-page > * {
  position: relative;
}

.indicators-governance-page__stats {
  display: grid;
  gap: 0.9rem;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
}

.indicators-governance-page__stat-card,
.indicators-governance-page__templates-shell,
.indicators-governance-page__policies-shell,
.indicators-governance-page__rollout-shell,
.indicators-governance-page__roadmap-shell {
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(255, 255, 255, 0.03);
}

.indicators-governance-page__stat-card {
  display: grid;
  gap: 0.3rem;
  padding: 1rem;
  border-radius: 1rem;
}

.indicators-governance-page__stat-head,
.indicators-governance-page__policy-head,
.indicators-governance-page__rollout-head,
.indicators-governance-page__roadmap-head,
.indicators-governance-page__section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.indicators-governance-page__stat-label,
.indicators-governance-page__eyebrow,
.indicators-governance-page__label {
  margin: 0;
  font-size: 0.72rem;
  color: rgb(var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.indicators-governance-page__stat-helper,
.indicators-governance-page__copy,
.indicators-governance-page__policy-head p,
.indicators-governance-page__rollout-head p,
.indicators-governance-page__roadmap-copy,
.indicators-governance-page__roadmap-owner {
  margin: 0.3rem 0 0;
  color: rgb(var(--muted));
}

.indicators-governance-page__title {
  margin: 0.3rem 0 0;
  font-size: 1.05rem;
}

.indicators-governance-page__templates-body,
.indicators-governance-page__policies-body,
.indicators-governance-page__rollout-body,
.indicators-governance-page__roadmap-body {
  display: grid;
  gap: 1rem;
}

.indicators-governance-page__grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.indicators-governance-page__policy-list,
.indicators-governance-page__rollout-list,
.indicators-governance-page__roadmap-list {
  display: grid;
  gap: 0.85rem;
}

.indicators-governance-page__policy-card,
.indicators-governance-page__rollout-card,
.indicators-governance-page__roadmap-card {
  display: grid;
  gap: 0.8rem;
  padding: 0.95rem;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 1rem;
  background: rgba(15, 23, 42, 0.12);
}

.indicators-governance-page__policy-grid {
  display: grid;
  gap: 0.8rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.indicators-governance-page__field {
  display: grid;
  gap: 0.35rem;
}

.indicators-governance-page__rollout-meta,
.indicators-governance-page__roadmap-deps {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

@media (max-width: 1100px) {
  .indicators-governance-page__grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .indicators-governance-page__section-head,
  .indicators-governance-page__policy-head,
  .indicators-governance-page__rollout-head,
  .indicators-governance-page__roadmap-head,
  .indicators-governance-page__stat-head {
    flex-direction: column;
  }

  .indicators-governance-page__policy-grid {
    grid-template-columns: 1fr;
  }
}
</style>