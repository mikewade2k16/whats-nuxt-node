<script setup lang="ts">
import type {
	AdminActiveSessionDeviceData,
	AdminActiveSessionUserData,
	AdminSessionConfigData,
	AdminSessionRevocationData
} from '~/types/admin-session'
import { canManageAdminSessions } from '~/utils/admin-session'

definePageMeta({
  layout: 'admin'
})

const { bffFetch } = useBffFetch()
const { coreUser, tenantSlug, sessionExpiresAt, invalidateSession } = useAdminSession()

const tabs = [
	{ id: 'login', label: 'Login', icon: 'i-lucide-shield-user' }
] as const

type SettingsTabId = typeof tabs[number]['id']

const activeTab = ref<SettingsTabId>('login')
const canManageGlobalSession = computed(() => Boolean(coreUser.value?.isPlatformAdmin))
const canManageScopedSessions = computed(() => canManageAdminSessions(coreUser.value))
const loading = ref(false)
const loadingSessions = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const config = ref<AdminSessionConfigData | null>(null)
const activeSessions = ref<AdminActiveSessionUserData[]>([])
const searchTerm = ref('')
const revokingUserId = ref('')
const revokingSessionId = ref('')
const form = reactive({
  ttlMinutes: 720
})

const presetHours = [4, 8, 12, 24]
const managedScopeLabel = computed(() => normalizeText(coreUser.value?.clientName) || normalizeText(tenantSlug.value) || 'tenant atual')
const pageDescription = computed(() => canManageGlobalSession.value
  ? 'Controle a expiracao da sessao administrativa, acompanhe quem esta logado e force logout imediato a partir do core.'
  : `Acompanhe e revogue as sessoes administrativas ativas do tenant ${managedScopeLabel.value} sem depender de uma camada paralela de login.`
)
const sessionInventoryTitle = computed(() => canManageGlobalSession.value
  ? 'Usuarios atualmente logados'
  : 'Usuarios logados neste tenant'
)
const sessionInventoryDescription = computed(() => canManageGlobalSession.value
  ? 'Use essa lista para identificar acessos simultaneos e deslogar usuarios ou dispositivos na hora.'
  : `Use essa lista para identificar acessos simultaneos e deslogar usuarios ou dispositivos do tenant ${managedScopeLabel.value}.`
)
const sessionSearchPlaceholder = computed(() => canManageGlobalSession.value
  ? 'Buscar por nome, email, tenant ou IP'
  : 'Buscar por nome, email ou IP'
)

const activeSessionLabel = computed(() => formatDurationLabel(form.ttlMinutes))
const mySessionExpiresAtLabel = computed(() => formatDateLabel(sessionExpiresAt.value))
const updatedAtLabel = computed(() => {
  const raw = String(config.value?.updatedAt || '').trim()
  if (!raw) {
    return 'Ainda nao configurado.'
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    return raw
  }

  return parsed.toLocaleString('pt-BR')
})
const totalActiveUsers = computed(() => activeSessions.value.length)
const totalActiveDevices = computed(() => activeSessions.value.reduce((total, entry) => total + entry.sessionCount, 0))
const multiDeviceUsers = computed(() => activeSessions.value.filter((entry) => entry.multipleDevices).length)
const filteredSessionUsers = computed(() => {
  const term = normalizeText(searchTerm.value).toLowerCase()
  if (!term) {
    return activeSessions.value
  }

  return activeSessions.value.filter((entry) => {
    const indexedValues = [
      entry.name,
      entry.email,
      ...entry.activeSessions.flatMap((session) => [
        session.tenantName,
        session.tenantSlug,
        session.ip,
        session.userAgent,
        session.deviceName
      ])
    ]

    return indexedValues.some((value) => normalizeText(value).toLowerCase().includes(term))
  })
})

function normalizeMinutes(value: unknown) {
  const numeric = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0
  }

  return numeric
}

function formatDurationLabel(totalMinutes: number) {
  const normalized = normalizeMinutes(totalMinutes)
  if (normalized <= 0) {
    return 'Nao definido'
  }

  if (normalized % 60 === 0) {
    const hours = normalized / 60
    return hours === 1 ? '1 hora' : `${hours} horas`
  }

  const hours = Math.floor(normalized / 60)
  const minutes = normalized % 60
  if (hours <= 0) {
    return minutes === 1 ? '1 minuto' : `${minutes} minutos`
  }

  return `${hours}h ${minutes}min`
}

function formatDateLabel(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) {
    return 'Nao informado'
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    return raw
  }

  return parsed.toLocaleString('pt-BR')
}

function describeSessionIdentity(session: AdminActiveSessionDeviceData) {
  return normalizeText(session.deviceName)
    || normalizeText(session.userAgent)
    || normalizeText(session.ip)
    || 'Sessao sem identificacao'
}

function describeTenantScope(session: AdminActiveSessionDeviceData) {
  return normalizeText(session.tenantName)
    || normalizeText(session.tenantSlug)
    || normalizeText(session.tenantId)
    || 'Plataforma'
}

function describeSessionCount(entry: AdminActiveSessionUserData) {
  if (entry.sessionCount === 1) {
    return '1 dispositivo conectado'
  }

  return `${entry.sessionCount} dispositivos conectados`
}

function applyConfig(next: AdminSessionConfigData) {
  config.value = next
  form.ttlMinutes = next.ttlMinutes
}

function applyActiveSessions(next: AdminActiveSessionUserData[]) {
  activeSessions.value = Array.isArray(next) ? next : []
}

async function requestConfig() {
  const response = await bffFetch<{ status: 'success', data: AdminSessionConfigData }>('/api/admin/auth-config')
  return response.data
}

async function requestActiveSessions() {
  const response = await bffFetch<{ status: 'success', data: AdminActiveSessionUserData[] }>('/api/admin/auth-sessions')
  return response.data || []
}

async function loadPage() {
  if (!canManageScopedSessions.value) {
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    if (canManageGlobalSession.value) {
      applyConfig(await requestConfig())
    }
    applyActiveSessions(await requestActiveSessions())
  } catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'Nao foi possivel carregar as configuracoes de login.'
  } finally {
    loading.value = false
  }
}

async function loadActiveSessions(options: { silent?: boolean } = {}) {
  if (!canManageScopedSessions.value) {
    return
  }

  if (!options.silent) {
    loadingSessions.value = true
  }

  try {
    applyActiveSessions(await requestActiveSessions())
  } catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'Nao foi possivel carregar as sessoes ativas.'
  } finally {
    if (!options.silent) {
      loadingSessions.value = false
    }
  }
}

async function saveConfig() {
  if (!canManageGlobalSession.value || !config.value) {
    return
  }

  saving.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const response = await bffFetch<{ status: 'success', data: AdminSessionConfigData }>('/api/admin/auth-config', {
      method: 'PUT',
      body: {
        ttlMinutes: normalizeMinutes(form.ttlMinutes)
      }
    })

    applyConfig(response.data)
    successMessage.value = 'Politica global de sessao atualizada. Novos logins ja usarao esse prazo.'
  } catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'Nao foi possivel salvar a politica global de sessao.'
  } finally {
    saving.value = false
  }
}

async function handleRevocationResult(result: AdminSessionRevocationData, successText: string) {
  errorMessage.value = ''
  successMessage.value = successText
  await loadActiveSessions({ silent: true })

  if (result.revokedCurrentSession) {
    await invalidateSession({ redirectToLogin: true })
  }
}

async function revokeUserSessions(entry: AdminActiveSessionUserData) {
  if (!canManageScopedSessions.value || revokingUserId.value || revokingSessionId.value) {
    return
  }

  const confirmed = globalThis.confirm(
    `Deslogar ${entry.name} agora? Todas as ${entry.sessionCount} sessoes ativas desse usuario serao encerradas.`
  )
  if (!confirmed) {
    return
  }

  revokingUserId.value = entry.userId
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const response = await bffFetch<{ status: 'success', data: AdminSessionRevocationData }>('/api/admin/auth-sessions/revoke-user', {
      method: 'POST',
      body: {
        userId: entry.userId
      }
    })

    await handleRevocationResult(
      response.data,
      `${entry.name} foi deslogado com sucesso em ${response.data.revokedCount} sessao(oes).`
    )
  } catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'Nao foi possivel deslogar esse usuario.'
  } finally {
    revokingUserId.value = ''
  }
}

async function revokeSingleSession(entry: AdminActiveSessionUserData, session: AdminActiveSessionDeviceData) {
  if (!canManageScopedSessions.value || revokingUserId.value || revokingSessionId.value) {
    return
  }

  const confirmed = globalThis.confirm(
    `Deslogar agora a sessao ${describeSessionIdentity(session)} de ${entry.name}?`
  )
  if (!confirmed) {
    return
  }

  revokingSessionId.value = session.id
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const response = await bffFetch<{ status: 'success', data: AdminSessionRevocationData }>(`/api/admin/auth-sessions/${encodeURIComponent(session.id)}`, {
      method: 'DELETE'
    })

    await handleRevocationResult(
      response.data,
      `Sessao ${describeSessionIdentity(session)} de ${entry.name} foi encerrada.`
    )
  } catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'Nao foi possivel deslogar essa sessao.'
  } finally {
    revokingSessionId.value = ''
  }
}

function applyPreset(hours: number) {
  form.ttlMinutes = hours * 60
  successMessage.value = ''
}

onMounted(() => {
  void loadPage()
})
</script>

<template>
  <section class="space-y-5">
    <AdminPageHeader
      eyebrow="Configuracoes"
      title="Login"
      :description="pageDescription"
    />

    <UAlert
    v-if="!canManageScopedSessions"
      color="warning"
      variant="soft"
      icon="i-lucide-lock"
      title="Acesso restrito"
    description="Somente root admin ou admin do tenant pode gerenciar sessoes ativas do painel. A politica global continua restrita ao root admin."
    />

    <template v-else>
      <UAlert
        v-if="!canManageGlobalSession"
        color="neutral"
        variant="soft"
        icon="i-lucide-building-2"
        title="Escopo atual"
        :description="`Voce esta gerenciando somente as sessoes do tenant ${managedScopeLabel}. A politica global de expiracao continua centralizada no root admin.`"
      />

      <UCard>
        <template #header>
          <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="space-y-1">
          <p class="text-xs font-semibold uppercase tracking-[0.12em] text-[rgb(var(--muted))]">Auth centralizado</p>
          <h2 class="text-lg font-semibold">Painel administrativo</h2>
          <p class="text-sm text-[rgb(var(--muted))]">Login, expiracao e revogacao sao controlados exclusivamente pelo core Go. O painel apenas consome esse contrato.</p>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton
            v-for="tab in tabs"
            :key="tab.id"
            :color="activeTab === tab.id ? 'primary' : 'neutral'"
            :variant="activeTab === tab.id ? 'solid' : 'soft'"
            @click="activeTab = tab.id"
          >
            <UIcon :name="tab.icon" class="size-4" />
            <span>{{ tab.label }}</span>
          </UButton>
        </div>
      </div>
        </template>

        <div v-if="loading" class="space-y-4">
        <USkeleton class="h-24 w-full" />
        <USkeleton class="h-48 w-full" />
        <USkeleton class="h-48 w-full" />
      </div>

			<div v-else-if="activeTab === 'login'" class="space-y-5">
        <UAlert
          color="neutral"
          variant="soft"
          icon="i-lucide-shield-check"
			title="Como essa regra funciona"
			:description="canManageGlobalSession ? 'A politica global vale para os proximos logins. Sessoes ja emitidas continuam validas ate expirar ou serem revogadas.' : 'A lista abaixo respeita o tenant da sessao autenticada. Root admin continua com visao global e politica centralizada.'"
        />

        <div class="grid gap-3 md:grid-cols-4">
          <article class="rounded-[var(--radius-md)] border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-4">
				<p class="text-xs font-semibold uppercase tracking-[0.12em] text-[rgb(var(--muted))]">{{ canManageGlobalSession ? 'Politica atual' : 'Escopo atual' }}</p>
				<strong class="mt-2 block text-xl">{{ canManageGlobalSession ? activeSessionLabel : managedScopeLabel }}</strong>
          </article>

          <article class="rounded-[var(--radius-md)] border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-4">
            <p class="text-xs font-semibold uppercase tracking-[0.12em] text-[rgb(var(--muted))]">Minha sessao</p>
            <strong class="mt-2 block text-sm">{{ mySessionExpiresAtLabel }}</strong>
          </article>

          <article class="rounded-[var(--radius-md)] border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-4">
            <p class="text-xs font-semibold uppercase tracking-[0.12em] text-[rgb(var(--muted))]">Usuarios logados</p>
            <strong class="mt-2 block text-xl">{{ totalActiveUsers }}</strong>
          </article>

          <article class="rounded-[var(--radius-md)] border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-4">
            <p class="text-xs font-semibold uppercase tracking-[0.12em] text-[rgb(var(--muted))]">Multiplos dispositivos</p>
            <strong class="mt-2 block text-xl">{{ multiDeviceUsers }}</strong>
          </article>
        </div>

        <UCard v-if="canManageGlobalSession && config">
          <template #header>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="space-y-1">
                <p class="text-xs font-semibold uppercase tracking-[0.12em] text-[rgb(var(--muted))]">Politica global</p>
                <h3 class="text-lg font-semibold">Tempo maximo da sessao</h3>
                <p class="text-sm text-[rgb(var(--muted))]">Defina por quanto tempo uma sessao administrativa permanece valida apos o login.</p>
              </div>

              <UBadge color="neutral" variant="soft">
                Atual: {{ activeSessionLabel }}
              </UBadge>
            </div>
          </template>

          <div class="space-y-5">
            <div class="grid gap-3 md:grid-cols-3">
              <article class="rounded-[var(--radius-md)] border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-4">
                <p class="text-xs font-semibold uppercase tracking-[0.12em] text-[rgb(var(--muted))]">Faixa permitida</p>
                <strong class="mt-2 block text-xl">{{ formatDurationLabel(config.minTTLMinutes) }} - {{ formatDurationLabel(config.maxTTLMinutes) }}</strong>
              </article>

              <article class="rounded-[var(--radius-md)] border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-4">
                <p class="text-xs font-semibold uppercase tracking-[0.12em] text-[rgb(var(--muted))]">Ultima atualizacao</p>
                <strong class="mt-2 block text-base">{{ updatedAtLabel }}</strong>
              </article>

              <article class="rounded-[var(--radius-md)] border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-4">
                <p class="text-xs font-semibold uppercase tracking-[0.12em] text-[rgb(var(--muted))]">Sessoes ativas</p>
                <strong class="mt-2 block text-xl">{{ totalActiveDevices }}</strong>
              </article>
            </div>

            <div class="space-y-2">
              <p class="text-sm font-medium">Presets rapidos</p>
              <div class="flex flex-wrap gap-2">
                <UButton
                  v-for="hours in presetHours"
                  :key="hours"
                  color="neutral"
                  variant="soft"
                  @click="applyPreset(hours)"
                >
                  {{ hours }}h
                </UButton>
              </div>
            </div>

            <div class="grid gap-4 md:grid-cols-[minmax(0,280px)_1fr]">
              <UFormField label="Tempo maximo da sessao" help="Informe o valor em minutos.">
                <UInput v-model="form.ttlMinutes" type="number" min="30" step="30" />
              </UFormField>

              <div class="rounded-[var(--radius-md)] border border-dashed border-[rgb(var(--border))] p-4 text-sm text-[rgb(var(--muted))]">
                <p><strong class="text-[rgb(var(--text))]">Resumo:</strong> quando o prazo vencer ou o core revogar a sessao, o painel sai automaticamente e volta para o login.</p>
                <p class="mt-2">Valor atual do formulario: <strong class="text-[rgb(var(--text))]">{{ activeSessionLabel }}</strong>.</p>
              </div>
            </div>

            <div class="flex justify-end">
              <UButton color="primary" :loading="saving" @click="saveConfig">
                Salvar politica de sessao
              </UButton>
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="space-y-1">
                <p class="text-xs font-semibold uppercase tracking-[0.12em] text-[rgb(var(--muted))]">Sessoes ativas</p>
    				<h3 class="text-lg font-semibold">{{ sessionInventoryTitle }}</h3>
    				<p class="text-sm text-[rgb(var(--muted))]">{{ sessionInventoryDescription }}</p>
              </div>

              <div class="flex flex-wrap gap-2">
    				<UInput v-model="searchTerm" :placeholder="sessionSearchPlaceholder" class="min-w-[18rem]" />
                <UButton color="neutral" variant="soft" :loading="loadingSessions" @click="loadActiveSessions()">
                  Atualizar
                </UButton>
              </div>
            </div>
          </template>

          <div v-if="loadingSessions" class="space-y-3">
            <USkeleton class="h-24 w-full" />
            <USkeleton class="h-24 w-full" />
          </div>

          <div v-else-if="filteredSessionUsers.length === 0" class="space-y-3">
            <UAlert
              color="neutral"
              variant="soft"
              icon="i-lucide-monitor-off"
              title="Nenhuma sessao encontrada"
              :description="searchTerm ? 'Nenhum usuario ativo corresponde ao filtro atual.' : 'Nao ha sessoes administrativas ativas neste momento.'"
            />
          </div>

          <div v-else class="space-y-4">
            <article
              v-for="entry in filteredSessionUsers"
              :key="entry.userId"
              class="rounded-[var(--radius-md)] border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-4"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="space-y-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <h4 class="text-base font-semibold">{{ entry.name }}</h4>
                    <UBadge v-if="entry.isPlatformAdmin" color="primary" variant="soft">Root admin</UBadge>
                    <UBadge v-if="entry.multipleDevices" color="warning" variant="soft">{{ describeSessionCount(entry) }}</UBadge>
                    <UBadge v-if="entry.hasCurrentSession" color="success" variant="soft">Sessao atual incluida</UBadge>
                  </div>
                  <p class="text-sm text-[rgb(var(--muted))]">{{ entry.email }}</p>
                  <p class="text-xs text-[rgb(var(--muted))]">Ultima atividade: {{ formatDateLabel(entry.lastSeenAt) }} • Expira em: {{ formatDateLabel(entry.expiresAt) }}</p>
                </div>

                <UButton
                  color="error"
                  variant="soft"
                  :loading="revokingUserId === entry.userId"
                  :disabled="Boolean(revokingSessionId)"
                  @click="revokeUserSessions(entry)"
                >
                  Deslogar usuario
                </UButton>
              </div>

              <div class="mt-4 grid gap-3">
                <div
                  v-for="session in entry.activeSessions"
                  :key="session.id"
                  class="rounded-[var(--radius-sm)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3"
                >
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="space-y-2">
                      <div class="flex flex-wrap items-center gap-2">
                        <strong>{{ describeSessionIdentity(session) }}</strong>
                        <UBadge v-if="session.current" color="success" variant="soft">Atual</UBadge>
                      </div>
                      <p class="text-sm text-[rgb(var(--muted))]">Tenant: {{ describeTenantScope(session) }}</p>
                      <p class="text-xs text-[rgb(var(--muted))]">IP: {{ session.ip || 'Nao informado' }} • Criada em: {{ formatDateLabel(session.createdAt) }}</p>
                      <p class="text-xs text-[rgb(var(--muted))]">Ultima atividade: {{ formatDateLabel(session.lastSeenAt) }} • Expira em: {{ formatDateLabel(session.expiresAt) }}</p>
                    </div>

                    <UButton
                      color="error"
                      variant="ghost"
                      :loading="revokingSessionId === session.id"
                      :disabled="Boolean(revokingUserId)"
                      @click="revokeSingleSession(entry, session)"
                    >
                      Deslogar dispositivo
                    </UButton>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </UCard>

        <UAlert
          v-if="errorMessage"
          color="error"
          variant="soft"
          icon="i-lucide-alert-triangle"
          title="Falha na gestao de login"
          :description="errorMessage"
        />

        <UAlert
          v-if="successMessage"
          color="success"
          variant="soft"
          icon="i-lucide-check-circle-2"
          title="Login atualizado"
          :description="successMessage"
        />
      </div>
      </UCard>
    </template>
  </section>
</template>