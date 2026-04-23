<script setup lang="ts">
import {
  evaluateAdminRouteAccess,
  mergeAdminAccessPreferences,
  parseAdminPreferences,
  type AdminFeatureCode,
  type AdminAccessUserType,
  type AdminAccessLevel
} from '~/utils/admin-access'
import type { TenantSettings } from '~/types'
import type { UserItem } from '~/types/users'

definePageMeta({
  layout: 'admin'
})

type ModuleOverrideState = 'default' | 'allow' | 'deny'

interface ManagedModuleDefinition {
  code: string
  label: string
  description: string
  featureCode: AdminFeatureCode
  routePath: string
  hasUserLimit?: boolean
  operationalLabel?: string
}

const MODULE_OVERRIDE_OPTIONS = [
  { label: 'Padrao', value: 'default' },
  { label: 'Permitir', value: 'allow' },
  { label: 'Bloquear', value: 'deny' }
] satisfies Array<{ label: string, value: ModuleOverrideState }>

const MANAGED_MODULES = [
  {
    code: 'atendimento',
    label: 'Atendimento',
    description: 'Controla a entrada no inbox omnichannel e, quando permitido, o acesso operacional do usuario.',
    featureCode: 'omnichannel',
    routePath: '/admin/omnichannel/inbox',
    hasUserLimit: true,
    operationalLabel: 'Operacao atendimento'
  },
  {
    code: 'fila-atendimento',
    label: 'Fila de Atendimento',
    description: 'Libera a area de operacao, ranking e relatorios da fila hospedada no painel.',
    featureCode: 'fila-atendimento',
    routePath: '/admin/fila-atendimento'
  },
  {
    code: 'indicators',
    label: 'Indicadores',
    description: 'Libera dashboards e analises do modulo de indicadores do cliente ativo.',
    featureCode: 'indicators',
    routePath: '/admin/indicadores'
  },
  {
    code: 'finance',
    label: 'Financeiro',
    description: 'Libera o workspace financeiro do cliente ativo dentro do painel.',
    featureCode: 'finance',
    routePath: '/admin/finance'
  }
] satisfies ManagedModuleDefinition[]

const sessionSimulation = useSessionSimulationStore()
const activeClientCoreTenantId = computed(() => String(sessionSimulation.activeClientCoreTenantId || '').trim())

const {
  users,
  loading,
  errorMessage,
  savingMap,
  fetchUsers,
  updateField
} = useUsersManager({
  scopedCoreTenantId: activeClientCoreTenantId
})

const { apiFetch } = useApi()
const { coreUser } = useAdminSession()

const selectedModuleCode = ref('')
const searchTerm = ref('')
const statusFilter = ref<'all' | 'active' | 'inactive'>('all')
const atendimentoCapacity = ref<TenantSettings | null>(null)
const atendimentoCapacityLoading = ref(false)
const atendimentoCapacityError = ref('')
const feedback = ref<{ color: 'success' | 'warning' | 'error' | 'neutral', title: string, description: string } | null>(null)

let atendimentoCapacityRefreshTimer: ReturnType<typeof setTimeout> | null = null

const isRootViewer = computed(() => Boolean(coreUser.value?.isPlatformAdmin) && sessionSimulation.effectiveUserType === 'admin')
const activeModuleCodes = computed(() => [...sessionSimulation.activeClientModuleCodes])
const activeManagedModules = computed(() => MANAGED_MODULES.filter(module => activeModuleCodes.value.includes(module.code)))
const inactiveManagedModules = computed(() => MANAGED_MODULES.filter(module => !activeModuleCodes.value.includes(module.code)))
const unsupportedActiveModules = computed(() => activeModuleCodes.value.filter(
  code => !MANAGED_MODULES.some(module => module.code === code)
))
const activeClientLabel = computed(() => String(sessionSimulation.activeClientLabel || '').trim() || 'Cliente atual')
const selectedModule = computed(() => activeManagedModules.value.find(module => module.code === selectedModuleCode.value) || null)

const filteredUsers = computed(() => {
  const normalizedSearch = String(searchTerm.value || '').trim().toLowerCase()

  return [...users.value]
    .filter((user) => {
      if (statusFilter.value === 'active' && user.status !== 'active') {
        return false
      }

      if (statusFilter.value === 'inactive' && user.status !== 'inactive') {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      const haystack = [
        user.name,
        user.nick,
        user.email,
        user.clientName,
        user.storeName,
        user.registrationNumber
      ].join(' ').toLowerCase()

      return haystack.includes(normalizedSearch)
    })
    .sort((left, right) => {
      const leftName = String(left.nick || left.name || left.email || '').trim().toLowerCase()
      const rightName = String(right.nick || right.name || right.email || '').trim().toLowerCase()
      return leftName.localeCompare(rightName, 'pt-BR')
    })
})

const activeUsersCount = computed(() => filteredUsers.value.filter(user => user.status === 'active').length)
const atendimentoLimit = computed(() => Math.max(0, Number(atendimentoCapacity.value?.maxUsers || 0)))
const atendimentoLocalAssignments = computed(() => filteredUsers.value.filter(user => hasAtendimentoOperationalAccess(user)).length)
const atendimentoSlotsUsed = computed(() => Math.max(
  atendimentoLocalAssignments.value,
  Math.max(0, Number(atendimentoCapacity.value?.currentUsers || 0))
))
const atendimentoAtLimit = computed(() => atendimentoLimit.value > 0 && atendimentoSlotsUsed.value >= atendimentoLimit.value)

watch(activeManagedModules, (modules) => {
  if (modules.some(module => module.code === selectedModuleCode.value)) {
    return
  }

  selectedModuleCode.value = modules[0]?.code || ''
}, { immediate: true })

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function clearFeedback() {
  feedback.value = null
}

function userDisplayName(user: UserItem) {
  return user.nick || user.name || user.email
}

function moduleOverrideState(user: UserItem, featureCode: AdminFeatureCode): ModuleOverrideState {
  const parsed = parseAdminPreferences(user.preferences)
  if (parsed.adminAccess.denyFeatures.includes(featureCode)) {
    return 'deny'
  }
  if (parsed.adminAccess.allowFeatures.includes(featureCode)) {
    return 'allow'
  }
  return 'default'
}

function buildModuleAccessContext(user: UserItem) {
  return {
    isAuthenticated: true,
    isRootUser: Boolean(user.isPlatformAdmin),
    profileUserType: user.userType as AdminAccessUserType,
    profileUserLevel: user.level as AdminAccessLevel,
    sessionUserType: user.userType as AdminAccessUserType,
    sessionUserLevel: user.level as AdminAccessLevel,
    preferences: user.preferences,
    hasModule: (moduleCode: string) => activeModuleCodes.value.includes(String(moduleCode || '').trim().toLowerCase())
  }
}

function hasEffectiveModuleAccess(user: UserItem, module: ManagedModuleDefinition) {
  return evaluateAdminRouteAccess(module.routePath, buildModuleAccessContext(user)).allowed
}

function hasAtendimentoOperationalAccess(user: UserItem) {
  return activeModuleCodes.value.includes('atendimento') && Boolean(user.atendimentoAccess)
}

function capacitySnapshotDescription() {
  if (!selectedModule.value || selectedModule.value.code !== 'atendimento') {
    return 'Este modulo nao usa limite operacional por quantidade de usuarios.'
  }

  if (atendimentoCapacityLoading.value) {
    return 'Consultando a capacidade operacional do modulo de atendimento.'
  }

  if (atendimentoCapacityError.value) {
    return atendimentoCapacityError.value
  }

  if (atendimentoLimit.value <= 0) {
    return 'O modulo nao informou teto de usuarios; o shell mantem apenas a governanca de acesso.'
  }

  return `${atendimentoSlotsUsed.value} em uso de ${atendimentoLimit.value} usuarios permitidos.`
}

function canGrantAtendimentoAccess(user: UserItem) {
  if (!selectedModule.value || selectedModule.value.code !== 'atendimento') {
    return false
  }

  if (!activeModuleCodes.value.includes('atendimento')) {
    return false
  }

  if (hasAtendimentoOperationalAccess(user)) {
    return true
  }

  if (atendimentoCapacityLoading.value || !atendimentoCapacity.value) {
    return false
  }

  if (atendimentoLimit.value <= 0) {
    return true
  }

  return atendimentoSlotsUsed.value < atendimentoLimit.value
}

function canToggleAtendimentoAccess(user: UserItem) {
  if (hasAtendimentoOperationalAccess(user)) {
    return true
  }

  return canGrantAtendimentoAccess(user)
}

function scheduleAtendimentoCapacityRefresh() {
  if (atendimentoCapacityRefreshTimer) {
    clearTimeout(atendimentoCapacityRefreshTimer)
  }

  atendimentoCapacityRefreshTimer = setTimeout(() => {
    atendimentoCapacityRefreshTimer = null
    void refreshAtendimentoCapacity()
  }, 700)
}

function updateModuleOverride(user: UserItem, module: ManagedModuleDefinition, nextState: ModuleOverrideState) {
  const parsed = parseAdminPreferences(user.preferences)
  const nextAllowFeatures = parsed.adminAccess.allowFeatures.filter(code => code !== module.featureCode)
  const nextDenyFeatures = parsed.adminAccess.denyFeatures.filter(code => code !== module.featureCode)

  if (nextState === 'allow') {
    nextAllowFeatures.push(module.featureCode)
  }

  if (nextState === 'deny') {
    nextDenyFeatures.push(module.featureCode)
  }

  const nextPreferences = mergeAdminAccessPreferences(user.preferences, {
    allowFeatures: nextAllowFeatures,
    denyFeatures: nextDenyFeatures
  })

  clearFeedback()
  updateField(user.id, 'preferences', nextPreferences, { immediate: true })
  feedback.value = {
    color: 'success',
    title: 'Override atualizado',
    description: `Regra de acesso do modulo ${module.label} atualizada para ${userDisplayName(user)}.`
  }
}

function updateAtendimentoOperationalAccess(user: UserItem, nextValue: boolean) {
  if (nextValue && !canGrantAtendimentoAccess(user)) {
    feedback.value = {
      color: 'warning',
      title: 'Limite atingido',
      description: atendimentoLimit.value > 0
        ? `O cliente ativo ja usa ${atendimentoSlotsUsed.value}/${atendimentoLimit.value} vagas do modulo atendimento.`
        : 'A capacidade operacional do modulo ainda nao foi carregada; aguarde a sincronizacao antes de liberar mais acessos.'
    }
    return
  }

  clearFeedback()
  updateField(user.id, 'atendimentoAccess', nextValue, { immediate: true })
  scheduleAtendimentoCapacityRefresh()
  feedback.value = {
    color: 'success',
    title: nextValue ? 'Acesso liberado' : 'Acesso removido',
    description: nextValue
      ? `Operacao do atendimento liberada para ${userDisplayName(user)}.`
      : `Operacao do atendimento removida de ${userDisplayName(user)}.`
  }
}

async function refreshAtendimentoCapacity() {
  if (!activeClientCoreTenantId.value || !activeModuleCodes.value.includes('atendimento')) {
    atendimentoCapacity.value = null
    atendimentoCapacityError.value = ''
    atendimentoCapacityLoading.value = false
    return
  }

  atendimentoCapacityLoading.value = true
  atendimentoCapacityError.value = ''

  try {
    atendimentoCapacity.value = await apiFetch<TenantSettings>('/tenant')
  } catch (error) {
    atendimentoCapacity.value = null
    atendimentoCapacityError.value = error instanceof Error
      ? error.message
      : 'Nao foi possivel carregar os limites do modulo atendimento.'
  } finally {
    atendimentoCapacityLoading.value = false
  }
}

onMounted(() => {
  if (activeClientCoreTenantId.value) {
    void fetchUsers(activeClientCoreTenantId.value)
  }

  void refreshAtendimentoCapacity()
})

watch(() => sessionSimulation.requestContextHash, () => {
  clearFeedback()
  void refreshAtendimentoCapacity()
})

onBeforeUnmount(() => {
  if (atendimentoCapacityRefreshTimer) {
    clearTimeout(atendimentoCapacityRefreshTimer)
    atendimentoCapacityRefreshTimer = null
  }
})
</script>

<template>
  <section class="space-y-4">
    <AdminPageHeader
      eyebrow="Manager"
      title="Modulos"
      description="Governanca do cliente ativo: quem entra em cada modulo e como o shell aplica limites operacionais como o de atendimento."
    />

    <div class="modules-page">
      <div class="modules-summary-grid">
        <article class="modules-summary-card">
          <p class="modules-summary-card__eyebrow">Cliente ativo</p>
          <h2 class="modules-summary-card__title">{{ activeClientLabel }}</h2>
          <p class="modules-summary-card__text">
            Tenant: <strong>{{ activeClientCoreTenantId || 'nao definido' }}</strong>
          </p>
        </article>

        <article class="modules-summary-card">
          <p class="modules-summary-card__eyebrow">Modulos ativos</p>
          <h2 class="modules-summary-card__title">{{ activeManagedModules.length }}</h2>
          <p class="modules-summary-card__text">
            {{ activeManagedModules.length > 0 ? activeManagedModules.map(module => module.label).join(', ') : 'Nenhum modulo gerenciavel ativo no shell.' }}
          </p>
        </article>

        <article class="modules-summary-card">
          <p class="modules-summary-card__eyebrow">Usuarios no escopo</p>
          <h2 class="modules-summary-card__title">{{ filteredUsers.length }}</h2>
          <p class="modules-summary-card__text">
            {{ activeUsersCount }} ativo(s) no cliente selecionado.
          </p>
        </article>
      </div>

      <UAlert
        v-if="feedback"
        :color="feedback.color"
        variant="soft"
        :title="feedback.title"
        :description="feedback.description"
      />

      <UAlert
        v-if="errorMessage"
        color="error"
        variant="soft"
        title="Falha ao carregar usuarios"
        :description="errorMessage"
      />

      <UAlert
        v-if="!activeClientCoreTenantId"
        color="warning"
        variant="soft"
        title="Selecione um cliente ativo"
        description="A governanca de modulos depende do cliente atual do shell. Sem tenant selecionado, o painel nao aplica alocacao nem overrides por modulo."
      />

      <UAlert
        v-else-if="activeManagedModules.length === 0"
        color="neutral"
        variant="soft"
        title="Sem modulos gerenciaveis ativos"
        :description="isRootViewer ? 'Ative os modulos desejados no cadastro do cliente e volte para definir os acessos por usuario.' : 'Este cliente ainda nao possui modulos do shell com governanca por usuario nesta pagina.'"
      >
        <template v-if="isRootViewer" #actions>
          <UButton
            to="/admin/manage/clientes"
            icon="i-lucide-users-round"
            label="Abrir clientes"
            color="neutral"
            variant="outline"
          />
        </template>
      </UAlert>

      <template v-else>
        <div class="modules-toolbar">
          <div class="modules-toolbar__filters">
            <UInput
              v-model="searchTerm"
              icon="i-lucide-search"
              placeholder="Buscar usuario por nome, nick ou email"
            />

            <USelect
              v-model="statusFilter"
              :items="[
                { label: 'Todos os status', value: 'all' },
                { label: 'Somente ativos', value: 'active' },
                { label: 'Somente inativos', value: 'inactive' }
              ]"
            />
          </div>

          <div class="modules-chip-list">
            <button
              v-for="module in activeManagedModules"
              :key="module.code"
              type="button"
              class="modules-chip"
              :class="{ 'is-active': selectedModuleCode === module.code }"
              @click="selectedModuleCode = module.code"
            >
              <span>{{ module.label }}</span>
              <UBadge color="success" variant="soft">Ativo</UBadge>
            </button>
          </div>
        </div>

        <section v-if="selectedModule" class="modules-workspace">
          <article class="modules-workspace__header-card">
            <div class="modules-workspace__header-copy">
              <p class="modules-summary-card__eyebrow">Governanca do modulo</p>
              <h2 class="modules-workspace__title">{{ selectedModule.label }}</h2>
              <p class="modules-summary-card__text">{{ selectedModule.description }}</p>
            </div>

            <div class="modules-workspace__header-stats">
              <div class="modules-workspace__stat">
                <span class="modules-workspace__stat-label">Acesso efetivo</span>
                <strong>{{ filteredUsers.filter(user => hasEffectiveModuleAccess(user, selectedModule)).length }}</strong>
              </div>

              <div v-if="selectedModule.code === 'atendimento'" class="modules-workspace__stat">
                <span class="modules-workspace__stat-label">Capacidade</span>
                <strong>{{ atendimentoLimit > 0 ? `${atendimentoSlotsUsed}/${atendimentoLimit}` : 'Ilimitado' }}</strong>
              </div>
            </div>
          </article>

          <UAlert
            v-if="selectedModule.code === 'atendimento'"
            :color="atendimentoCapacityError ? 'warning' : atendimentoAtLimit ? 'warning' : 'neutral'"
            variant="soft"
            title="Restricao operacional do atendimento"
            :description="capacitySnapshotDescription()"
          />

          <div class="modules-table-shell">
            <table class="modules-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Status</th>
                  <th>Papel</th>
                  <th>Acesso ao modulo</th>
                  <th>Efetivo</th>
                  <th v-if="selectedModule.code === 'atendimento'">{{ selectedModule.operationalLabel }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="user in filteredUsers" :key="user.id">
                  <td>
                    <div class="modules-user-cell">
                      <strong>{{ userDisplayName(user) }}</strong>
                      <span>{{ user.email }}</span>
                      <span v-if="user.storeName">{{ user.storeName }}</span>
                    </div>
                  </td>
                  <td>
                    <UBadge :color="user.status === 'active' ? 'success' : 'neutral'" variant="soft">
                      {{ user.status === 'active' ? 'Ativo' : 'Inativo' }}
                    </UBadge>
                  </td>
                  <td>
                    <div class="modules-user-cell modules-user-cell--compact">
                      <strong>{{ user.businessRole }}</strong>
                      <span>Level {{ user.level }}</span>
                    </div>
                  </td>
                  <td>
                    <USelect
                      :model-value="moduleOverrideState(user, selectedModule.featureCode)"
                      :items="MODULE_OVERRIDE_OPTIONS"
                      :disabled="Boolean(savingMap[`${user.id}:preferences`]) || loading"
                      @update:model-value="updateModuleOverride(user, selectedModule, $event as ModuleOverrideState)"
                    />
                  </td>
                  <td>
                    <UBadge :color="hasEffectiveModuleAccess(user, selectedModule) ? 'success' : 'neutral'" variant="soft">
                      {{ hasEffectiveModuleAccess(user, selectedModule) ? 'Liberado' : 'Bloqueado' }}
                    </UBadge>
                  </td>
                  <td v-if="selectedModule.code === 'atendimento'">
                    <div class="modules-switch-cell">
                      <USwitch
                        :model-value="hasAtendimentoOperationalAccess(user)"
                        :disabled="!canToggleAtendimentoAccess(user) || Boolean(savingMap[`${user.id}:atendimentoAccess`])"
                        @update:model-value="updateAtendimentoOperationalAccess(user, Boolean($event))"
                      />
                      <span>
                        {{ hasAtendimentoOperationalAccess(user) ? 'Liberado' : 'Sem acesso' }}
                      </span>
                    </div>
                  </td>
                </tr>
                <tr v-if="filteredUsers.length === 0">
                  <td :colspan="selectedModule.code === 'atendimento' ? 6 : 5" class="modules-table__empty">
                    Nenhum usuario encontrado para o cliente e os filtros atuais.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="modules-footnotes">
          <article v-if="inactiveManagedModules.length > 0" class="modules-summary-card">
            <p class="modules-summary-card__eyebrow">Modulos ainda inativos</p>
            <div class="modules-badge-row">
              <UBadge v-for="module in inactiveManagedModules" :key="module.code" color="neutral" variant="soft">
                {{ module.label }}
              </UBadge>
            </div>
            <p class="modules-summary-card__text">
              A ativacao desses modulos continua no cadastro do cliente. A pagina de modulos passa a governar apenas os acessos por usuario depois da ativacao.
            </p>
          </article>

          <article v-if="unsupportedActiveModules.length > 0" class="modules-summary-card">
            <p class="modules-summary-card__eyebrow">Outros modulos ativos</p>
            <div class="modules-badge-row">
              <UBadge v-for="moduleCode in unsupportedActiveModules" :key="moduleCode" color="neutral" variant="outline">
                {{ moduleCode }}
              </UBadge>
            </div>
            <p class="modules-summary-card__text">
              Esses modulos ainda nao expuseram uma regra de override por usuario no shell. O acesso continua apenas no nivel de ativacao do cliente e da rota publicada por cada modulo.
            </p>
          </article>
        </section>
      </template>
    </div>
  </section>
</template>

<style scoped>
.modules-page {
  display: grid;
  gap: 1rem;
}

.modules-summary-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.modules-summary-card,
.modules-workspace__header-card {
  border: 1px solid rgb(var(--border));
  border-radius: var(--radius-lg);
  background: rgb(var(--surface));
  padding: 1rem;
}

.modules-summary-card__eyebrow {
  margin: 0 0 0.4rem;
  color: rgb(var(--muted));
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.modules-summary-card__title,
.modules-workspace__title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
  color: rgb(var(--text));
}

.modules-summary-card__text {
  margin: 0.5rem 0 0;
  color: rgb(var(--muted));
  line-height: 1.5;
}

.modules-toolbar {
  display: grid;
  gap: 0.9rem;
}

.modules-toolbar__filters {
  display: grid;
  gap: 0.75rem;
}

.modules-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.modules-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  border: 1px solid rgb(var(--border));
  border-radius: 999px;
  background: rgb(var(--surface));
  padding: 0.65rem 0.9rem;
  color: rgb(var(--text));
  font: inherit;
  cursor: pointer;
}

.modules-chip.is-active {
  border-color: rgb(var(--primary));
  background: rgb(var(--surface-2));
}

.modules-workspace {
  display: grid;
  gap: 1rem;
}

.modules-workspace__header-card {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.modules-workspace__header-copy {
  display: grid;
  gap: 0.2rem;
}

.modules-workspace__header-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.modules-workspace__stat {
  min-width: 120px;
  border: 1px solid rgb(var(--border));
  border-radius: var(--radius-md);
  background: rgb(var(--surface-2));
  padding: 0.75rem;
}

.modules-workspace__stat-label {
  display: block;
  margin-bottom: 0.35rem;
  color: rgb(var(--muted));
  font-size: 0.75rem;
}

.modules-table-shell {
  overflow-x: auto;
  border: 1px solid rgb(var(--border));
  border-radius: var(--radius-lg);
  background: rgb(var(--surface));
}

.modules-table {
  width: 100%;
  border-collapse: collapse;
}

.modules-table th,
.modules-table td {
  padding: 0.8rem 0.9rem;
  border-bottom: 1px solid rgb(var(--border));
  text-align: left;
  vertical-align: top;
}

.modules-table th {
  color: rgb(var(--muted));
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.modules-table tbody tr:last-child td {
  border-bottom: none;
}

.modules-user-cell {
  display: grid;
  gap: 0.18rem;
}

.modules-user-cell span {
  color: rgb(var(--muted));
  font-size: 0.85rem;
}

.modules-user-cell--compact strong {
  text-transform: capitalize;
}

.modules-switch-cell {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 140px;
}

.modules-table__empty {
  color: rgb(var(--muted));
  text-align: center;
}

.modules-footnotes {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.modules-badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

@media (min-width: 768px) {
  .modules-toolbar__filters {
    grid-template-columns: minmax(0, 1.7fr) minmax(220px, 0.8fr);
  }
}

@media (max-width: 767px) {
  .modules-workspace__header-card {
    flex-direction: column;
  }
}
</style>