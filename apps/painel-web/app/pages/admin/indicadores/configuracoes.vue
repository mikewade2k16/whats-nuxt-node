<script setup lang="ts">
import type {
  IndicatorsEvidencePolicy,
  IndicatorsInputType,
  IndicatorsScopeMode,
  IndicatorsSourceKind,
  IndicatorsValueType
} from '~/types/indicators-management'

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
  saving,
  errorMessage,
  summary,
  indicators,
  stores,
  targetSets,
  providers,
  categories,
  configSnapshot,
  weightStatus,
  updateIndicatorField,
  updateItemField,
  addIndicatorItem,
  removeIndicator,
  removeIndicatorItem,
  rebalanceIndicatorItems,
  updateStoreField,
  updateStoreRuleField,
  saveDraft,
  reloadConfiguration
} = useIndicatorsConfiguration()

const selectedCategory = ref('all')
const selectedScope = ref<'all' | IndicatorsScopeMode>('all')
const providerOnly = ref(false)
const selectedStoreId = ref(stores.value[0]?.id ?? '')

const scopeItems = [
  { label: 'Todos os escopos', value: 'all' },
  { label: 'Cliente global', value: 'client_global' },
  { label: 'Por loja', value: 'per_store' }
] satisfies Array<{ label: string, value: 'all' | IndicatorsScopeMode }>

const visibleIndicators = computed(() => {
  return indicators.value.filter((indicator) => {
    if (selectedCategory.value !== 'all' && indicator.categoryCode !== selectedCategory.value) {
      return false
    }

    if (selectedScope.value !== 'all' && indicator.scopeMode !== selectedScope.value) {
      return false
    }

    if (providerOnly.value && indicator.sourceKind === 'manual') {
      return false
    }

    return true
  })
})

const categoryItems = computed(() => {
  return [{ label: 'Todas as categorias', value: 'all' }, ...categories.value]
})

const weightMismatch = computed(() => configSnapshot.value.enabledWeight !== 100)
const saveBlocked = computed(() => weightStatus.value.hasBlockingIssues)

watch(
  stores,
  (items) => {
    if (!selectedStoreId.value || !items.some(store => store.id === selectedStoreId.value)) {
      selectedStoreId.value = items[0]?.id || ''
    }
  },
  { immediate: true }
)

function updateIndicator(
  indicatorId: string,
  field: 'name' | 'weight' | 'scopeMode' | 'sourceKind' | 'valueType' | 'evidencePolicy' | 'enabled' | 'supportsStoreBreakdown',
  value: string | number | boolean
) {
  updateIndicatorField(indicatorId, field, value)
}

function updateItem(
  indicatorId: string,
  itemId: string,
  field: 'label' | 'inputType' | 'evidencePolicy' | 'required' | 'weight',
  value: string | number | boolean
) {
  updateItemField(indicatorId, itemId, field, value)
}
</script>

<template>
  <section class="indicators-config-page space-y-4">
    <AdminPageHeader
      eyebrow="Indicadores"
      title="Configuracoes do Perfil"
      description="Perfil ativo do cliente hospedado no core: pesos, campos, evidence policy, overrides por loja e leitura de providers em tempo real."
    />

    <IndicatorsWorkspaceNav :summary="summary" :can-access-governance="canAccessGovernance" />

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
      title="Falha ao carregar configuracoes"
      :description="errorMessage"
    />

    <IndicatorsConfigSummary :snapshot="configSnapshot" />

    <UAlert
      v-if="weightMismatch"
      color="warning"
      variant="soft"
      icon="i-lucide-scale"
      title="Peso total ainda nao fecha em 100%"
      :description="`O perfil ativo esta com ${configSnapshot.enabledWeight}% nos indicadores habilitados. O total nao pode passar de 100% e precisa fechar exatamente em 100% antes de virar contrato.`"
    />

    <UAlert
      v-if="weightStatus.blockingItemTotals.length"
      color="warning"
      variant="soft"
      icon="i-lucide-list-checks"
      title="Existem indicadores com pesos internos pendentes"
      :description="`${weightStatus.blockingItemTotals.length} indicador(es) habilitado(s) ainda nao fecham 100% nos itens internos. Ajuste no detalhe ou use a sugestao de dividir 100% igualmente.`"
    />

    <UCard class="indicators-config-page__filters">
      <div class="indicators-config-page__filters-grid">
        <div class="indicators-config-page__field">
          <span class="indicators-config-page__label">Categoria</span>
          <USelect v-model="selectedCategory" :items="categoryItems" />
        </div>

        <div class="indicators-config-page__field">
          <span class="indicators-config-page__label">Escopo</span>
          <USelect v-model="selectedScope" :items="scopeItems" />
        </div>

        <label class="indicators-config-page__switch">
          <USwitch v-model="providerOnly" />
          <span>Mostrar so indicadores ligados a provider</span>
        </label>

        <div class="indicators-config-page__actions">
          <UButton :loading="loading" color="neutral" variant="soft" icon="i-lucide-refresh-cw" @click="reloadConfiguration">
            Recarregar dados
          </UButton>
          <UButton :loading="saving" :disabled="saveBlocked || saving" color="primary" icon="i-lucide-save" @click="saveDraft">
            Salvar perfil
          </UButton>
        </div>
      </div>
    </UCard>

    <UCard class="indicators-config-page__editor-shell" :ui="{ body: 'indicators-config-page__editor-body' }">
      <template #header>
        <div class="indicators-config-page__section-head">
          <div>
            <p class="indicators-config-page__eyebrow">Perfil ativo</p>
            <h2 class="indicators-config-page__title">Catalogo de indicadores configuraveis</h2>
            <p class="indicators-config-page__copy">Cada indicador abre sob demanda. Deixe o header enxuto e use o detalhamento so quando precisar.</p>
          </div>

          <UBadge :color="weightMismatch ? 'warning' : 'success'" variant="soft">
            {{ visibleIndicators.length }} visiveis • {{ configSnapshot.enabledWeight }}%
          </UBadge>
        </div>
      </template>

      <IndicatorsProfileEditor
        :indicators="visibleIndicators"
        @update-indicator-field="updateIndicator"
        @update-item-field="updateItem"
        @add-item="addIndicatorItem"
        @rebalance-items="rebalanceIndicatorItems"
        @remove-indicator="removeIndicator"
        @remove-item="removeIndicatorItem"
      />
    </UCard>

    <div class="indicators-config-page__bottom-grid">
      <UCard class="indicators-config-page__store-shell" :ui="{ body: 'indicators-config-page__store-body' }">
        <template #header>
          <div class="indicators-config-page__section-head">
            <div>
              <p class="indicators-config-page__eyebrow">Overrides</p>
              <h2 class="indicators-config-page__title">Quebra por loja e target sets</h2>
              <p class="indicators-config-page__copy">O cliente decide o que herda do perfil ativo e o que vira regra local persistida.</p>
            </div>
          </div>
        </template>

        <IndicatorsStoreOverridePanel
          v-model:selected-store-id="selectedStoreId"
          :stores="stores"
          :target-sets="targetSets"
          @update-store-field="updateStoreField"
          @update-store-rule-field="updateStoreRuleField"
        />
      </UCard>

      <IndicatorsProviderHealthGrid
        :providers="providers"
        title="Bindings e health check"
        description="Estado atual dos providers usados pelo cliente para leituras derivadas do modulo."
      />
    </div>

    <AppToastStack />
  </section>
</template>

<style scoped>
.indicators-config-page {
  position: relative;
  display: grid;
}

.indicators-config-page::before {
  content: '';
  position: absolute;
  inset: -2rem 0 auto;
  height: 18rem;
  background:
    radial-gradient(circle at top left, rgba(15, 118, 110, 0.12), transparent 44%),
    radial-gradient(circle at top right, rgba(180, 83, 9, 0.08), transparent 40%);
  pointer-events: none;
}

.indicators-config-page > * {
  position: relative;
}

.indicators-config-page__filters,
.indicators-config-page__editor-shell,
.indicators-config-page__store-shell {
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(255, 255, 255, 0.03);
}

.indicators-config-page__filters-grid {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: end;
}

.indicators-config-page__field {
  display: grid;
  gap: 0.35rem;
}

.indicators-config-page__label,
.indicators-config-page__eyebrow {
  font-size: 0.72rem;
  color: rgb(var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.indicators-config-page__switch {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding-bottom: 0.35rem;
}

.indicators-config-page__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.65rem;
}

.indicators-config-page__editor-body,
.indicators-config-page__store-body {
  display: grid;
  gap: 1rem;
}

.indicators-config-page__section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.indicators-config-page__title {
  margin: 0.3rem 0 0;
  font-size: 1.05rem;
}

.indicators-config-page__copy {
  margin: 0.35rem 0 0;
  color: rgb(var(--muted));
}

.indicators-config-page__bottom-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1.05fr) minmax(20rem, 0.95fr);
}

@media (max-width: 1100px) {
  .indicators-config-page__filters-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .indicators-config-page__bottom-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .indicators-config-page__filters-grid {
    grid-template-columns: 1fr;
  }

  .indicators-config-page__section-head {
    flex-direction: column;
  }

  .indicators-config-page__actions {
    justify-content: flex-start;
  }
}
</style>