<script setup lang="ts">
const props = withDefaults(defineProps<{
  compact?: boolean
  showSummary?: boolean
  showRefresh?: boolean
  title?: string
}>(), {
  compact: false,
  showSummary: true,
  showRefresh: true,
  title: 'Sessao simulada'
})

const sessionSimulation = useSessionSimulationStore()

const roleItems = [
  { label: 'Admin', value: 'admin' },
  { label: 'Client', value: 'client' }
]

const levelItems = [
  { label: 'Admin', value: 'admin' },
  { label: 'Consultor', value: 'consultant' },
  { label: 'Manager', value: 'manager' },
  { label: 'Marketing', value: 'marketing' },
  { label: 'Finance', value: 'finance' },
  { label: 'Viewer', value: 'viewer' }
]

const roleValue = computed({
  get() {
    return sessionSimulation.userType
  },
  set(next) {
    sessionSimulation.setUserType(next)
  }
})

const levelValue = computed({
  get() {
    return sessionSimulation.userLevel
  },
  set(next) {
    sessionSimulation.setUserLevel(next)
  }
})

const clientValue = computed({
  get() {
    return sessionSimulation.clientId
  },
  set(next) {
    sessionSimulation.setClientId(next)
  }
})

const clientItems = computed(() => sessionSimulation.clientOptions.map(option => ({
  label: option.label,
  value: option.value
})))

async function refreshClientOptions() {
  await sessionSimulation.refreshClientOptions({ force: true })
}

onMounted(() => {
  sessionSimulation.initialize()
})
</script>

<template>
  <div class="admin-session-simulation" :class="props.compact ? 'admin-session-simulation--compact' : ''">
    <div class="admin-session-simulation__left">
      <p class="admin-session-simulation__label">{{ props.title }}</p>
      <p v-if="props.showSummary" class="admin-session-simulation__summary">
        {{ sessionSimulation.userType }} / {{ sessionSimulation.userLevel }} / {{ sessionSimulation.activeClientLabel }}
      </p>
    </div>

    <div class="admin-session-simulation__controls">
      <div class="admin-session-simulation__field">
        <label v-if="!props.compact" class="admin-session-simulation__field-label">Tipo</label>
        <USelect v-model="roleValue" :items="roleItems"
          class="admin-session-simulation__select admin-session-simulation__select--role" />
      </div>

      <div class="admin-session-simulation__field">
        <label v-if="!props.compact" class="admin-session-simulation__field-label">Level</label>
        <USelect v-model="levelValue" :items="levelItems"
          class="admin-session-simulation__select admin-session-simulation__select--level" />
      </div>

      <div class="admin-session-simulation__field">
        <label v-if="!props.compact" class="admin-session-simulation__field-label">Cliente</label>
        <USelect v-model="clientValue" :items="clientItems"
          class="admin-session-simulation__select admin-session-simulation__select--client" />
      </div>

      <UButton v-if="props.showRefresh" icon="i-lucide-refresh-cw" color="neutral" variant="soft"
        :loading="sessionSimulation.loadingClientOptions" class="admin-session-simulation__refresh-btn"
        aria-label="Atualizar clientes" @click="refreshClientOptions" />
    </div>
  </div>
</template>

<style scoped>
.admin-session-simulation {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;

  border-radius: var(--radius-md);
  background: rgb(var(--surface-2));
  border: 1px solid rgb(var(--border));
  padding: 10px 12px;
}

.admin-session-simulation__left {
  min-width: 180px;
}

.admin-session-simulation__label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgb(var(--muted));
  margin: 0;
}

.admin-session-simulation__summary {
  font-size: 13px;
  font-weight: 600;
  color: rgb(var(--text));
  margin: 2px 0 0;
}

.admin-session-simulation__controls {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.admin-session-simulation__field {
  min-width: 150px;
}

.admin-session-simulation__field-label {
  display: block;
  font-size: 11px;
  color: rgb(var(--muted));
  margin-bottom: 4px;
}

.admin-session-simulation__select--client {
  min-width: 210px;
}

.admin-session-simulation__select--level {
  min-width: 140px;
}

.admin-session-simulation__refresh-btn {
  align-self: flex-end;
}

.admin-session-simulation--compact {
  align-items: flex-start;
  border-radius: 0;
  border: 0;
  background: transparent;
  padding: 0;
  gap: 8px;
}

.admin-session-simulation--compact .admin-session-simulation__left {
  min-width: 0;
}

.admin-session-simulation--compact .admin-session-simulation__label {
  font-size: 10px;
  letter-spacing: 0.1em;
}

.admin-session-simulation--compact .admin-session-simulation__controls {
  width: 100%;
  align-items: center;
  gap: 8px;
}

.admin-session-simulation--compact .admin-session-simulation__field {
  min-width: 0;
}

.admin-session-simulation--compact .admin-session-simulation__select--role {
  min-width: 116px;
}

.admin-session-simulation--compact .admin-session-simulation__select--level {
  min-width: 126px;
}

.admin-session-simulation--compact .admin-session-simulation__select--client {
  min-width: 172px;
}
</style>
