<script setup lang="ts">
import type { IndicatorsModuleSummary } from '~/types/indicators-management'

const props = defineProps<{
  summary: IndicatorsModuleSummary
  canAccessGovernance?: boolean
}>()

const route = useRoute()

const primaryMetricLabel = computed(() => {
  return route.path.startsWith('/admin/manage/indicadores') ? 'Clientes' : 'Lojas'
})

const items = computed(() => {
  const base = [
    {
      id: 'operacao',
      label: 'Operacao',
      description: 'Workspace diario de auditoria e dashboard.',
      to: '/admin/indicadores'
    },
    {
      id: 'configuracoes',
      label: 'Configuracoes',
      description: 'Perfil ativo do cliente, pesos, campos e overrides.',
      to: '/admin/indicadores/configuracoes'
    }
  ]

  if (props.canAccessGovernance) {
    base.push({
      id: 'governanca',
      label: 'Governanca',
      description: 'Templates globais, defaults e rollout root.',
      to: '/admin/manage/indicadores'
    })
  }

  return base
})

function isActive(to: string) {
  if (to === '/admin/indicadores') {
    return route.path === to
  }

  return route.path === to || route.path.startsWith(`${to}/`)
}
</script>

<template>
  <UCard class="indicators-workspace-nav" :ui="{ body: 'indicators-workspace-nav__body' }">
    <div class="indicators-workspace-nav__top">
      <div>
        <p class="indicators-workspace-nav__eyebrow">Blueprint do modulo</p>
        <h2 class="indicators-workspace-nav__title">{{ summary.activeProfileName }}</h2>
        <p class="indicators-workspace-nav__copy">
          {{ summary.clientLabel }} | {{ summary.templateLabel }} | {{ summary.lastSyncLabel }}
        </p>
      </div>

      <div class="indicators-workspace-nav__badges">
        <UBadge color="neutral" variant="soft">{{ primaryMetricLabel }}: {{ summary.storesConfigured }}</UBadge>
        <UBadge color="neutral" variant="soft">Providers: {{ summary.providerOnlineCount }}/{{ summary.providerTotal }}</UBadge>
        <UBadge :color="summary.pendingChanges > 0 ? 'warning' : 'success'" variant="soft">
          Draft: {{ summary.pendingChanges }} ajuste(s)
        </UBadge>
      </div>
    </div>

    <div class="indicators-workspace-nav__links">
      <NuxtLink
        v-for="item in items"
        :key="item.id"
        :to="item.to"
        class="indicators-workspace-nav__link"
        :class="{ 'is-active': isActive(item.to) }"
      >
        <strong>{{ item.label }}</strong>
        <span>{{ item.description }}</span>
      </NuxtLink>
    </div>
  </UCard>
</template>

<style scoped>
.indicators-workspace-nav {
  border: 1px solid rgba(148, 163, 184, 0.18);
  background:
    radial-gradient(circle at top left, rgba(15, 118, 110, 0.16), transparent 36%),
    radial-gradient(circle at top right, rgba(180, 83, 9, 0.14), transparent 34%),
    rgb(var(--surface-2));
}

.indicators-workspace-nav__body {
  display: grid;
  gap: 1rem;
}

.indicators-workspace-nav__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.indicators-workspace-nav__eyebrow {
  margin: 0 0 0.35rem;
  font-size: 0.74rem;
  color: rgb(var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.indicators-workspace-nav__title {
  margin: 0;
  font-size: 1.1rem;
}

.indicators-workspace-nav__copy {
  margin: 0.45rem 0 0;
  color: rgb(var(--muted));
}

.indicators-workspace-nav__badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}

.indicators-workspace-nav__links {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
}

.indicators-workspace-nav__link {
  display: grid;
  gap: 0.35rem;
  padding: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 1rem;
  color: inherit;
  text-decoration: none;
  background: rgba(255, 255, 255, 0.03);
  transition: border-color 0.18s ease, transform 0.18s ease, background 0.18s ease;
}

.indicators-workspace-nav__link:hover {
  transform: translateY(-1px);
  border-color: rgba(148, 163, 184, 0.32);
}

.indicators-workspace-nav__link strong {
  font-size: 0.95rem;
}

.indicators-workspace-nav__link span {
  color: rgb(var(--muted));
  font-size: 0.84rem;
}

.indicators-workspace-nav__link.is-active {
  border-color: rgba(15, 118, 110, 0.48);
  background: rgba(15, 118, 110, 0.12);
}

@media (max-width: 860px) {
  .indicators-workspace-nav__top {
    flex-direction: column;
  }

  .indicators-workspace-nav__badges {
    justify-content: flex-start;
  }
}
</style>