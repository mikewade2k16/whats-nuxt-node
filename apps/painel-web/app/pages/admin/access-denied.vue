<script setup lang="ts">
definePageMeta({
  layout: 'admin'
})

const route = useRoute()
const sessionSimulation = useSessionSimulationStore()

const reason = computed(() => String(route.query.reason ?? '').trim())
const feature = computed(() => String(route.query.feature ?? '').trim())
const fromPath = computed(() => {
  const raw = String(route.query.from ?? '').trim()
  return isSafeAdminRedirectPath(raw) ? raw : '/admin'
})
const message = computed(() => describeAdminAccessReason(reason.value, feature.value))
const currentContextLabel = computed(() => {
  const userType = String(sessionSimulation.effectiveUserType ?? '').trim() || 'admin'
  const userLevel = String(sessionSimulation.effectiveUserLevel ?? '').trim() || 'admin'
  const clientLabel = String(sessionSimulation.activeClientLabel ?? '').trim() || 'Cliente'
  return `${userType} / ${userLevel} / ${clientLabel}`
})

async function goBack() {
  await navigateTo(fromPath.value, { replace: true })
}
</script>

<template>
  <section class="space-y-4">
    <AdminPageHeader
      eyebrow="Acesso"
      :title="message.title"
      :description="message.description"
    />

    <div class="rounded-[var(--radius-md)] border border-[rgb(var(--warning-500))] bg-[rgb(var(--surface-2))] p-5">
      <div class="flex flex-col gap-4">
        <UAlert
          color="warning"
          variant="soft"
          icon="i-lucide-shield-alert"
          :title="message.title"
          :description="message.description"
        />

        <div class="grid gap-3 text-sm text-[rgb(var(--muted))] sm:grid-cols-2">
          <div>
            <p class="font-medium text-[rgb(var(--text))]">Origem</p>
            <p>{{ fromPath }}</p>
          </div>
          <div>
            <p class="font-medium text-[rgb(var(--text))]">Contexto atual</p>
            <p>{{ currentContextLabel }}</p>
          </div>
        </div>

        <div class="flex flex-wrap gap-3">
          <UButton
            color="warning"
            variant="soft"
            icon="i-lucide-arrow-left"
            @click="goBack"
          >
            Tentar voltar
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-house"
            to="/admin"
          >
            Ir para painel
          </UButton>
        </div>
      </div>
    </div>
  </section>
</template>
