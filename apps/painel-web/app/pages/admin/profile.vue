<script setup lang="ts">
definePageMeta({
  layout: 'admin'
})

import {
  buildProfileUpdateRequest,
  resolveProfileRequestErrorMessage,
  validateProfileFormInput
} from '~/utils/admin-profile-form'

interface AdminProfileData {
  id: number
  coreUserId: string
  level: string
  clientId: number | null
  name: string
  nick: string
  email: string
  phone: string
  status: string
  profileImage: string
  userType: string
  isPlatformAdmin: boolean
  tenantId?: string
}

const { bffFetch } = useBffFetch()
const { coreToken, coreUser, sessionExpiresAt, setSession, tenantSlug } = useAdminSession()

const loadingProfile = ref(false)
const saving = ref(false)
const feedbackMessage = ref('')
const feedbackColor = ref<'success' | 'warning' | 'error'>('success')
const lastSavedAt = ref('')

const profile = ref<AdminProfileData | null>(null)
const original = ref<AdminProfileData | null>(null)

const form = reactive({
  nick: '',
  name: '',
  email: '',
  phone: '',
  profileImage: '',
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const canEdit = computed(() => Boolean(profile.value))
const tenantLabel = computed(() => String(coreUser.value?.clientName ?? tenantSlug.value ?? '').trim() || 'tenant-nao-identificado')

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function applyProfileToForm(data: AdminProfileData) {
  form.nick = normalizeText(data.nick)
  form.name = normalizeText(data.name)
  form.email = normalizeText(data.email)
  form.phone = normalizeText(data.phone)
  form.profileImage = normalizeText(data.profileImage)
  form.currentPassword = ''
  form.newPassword = ''
  form.confirmPassword = ''
}

function validateProfileForm() {
  const validationMessage = validateProfileFormInput(original.value, form)
  if (!validationMessage) {
    return true
  }

  feedbackColor.value = 'error'
  feedbackMessage.value = validationMessage
  return false
}

function syncSessionStores(data: AdminProfileData) {
  if (coreUser.value && coreToken.value) {
    setSession({
      token: coreToken.value,
      coreAccessToken: coreToken.value,
      coreUser: {
        ...coreUser.value,
        name: data.name,
        email: data.email,
        nick: data.nick,
        profileImage: data.profileImage
      },
      expiresAt: sessionExpiresAt.value
    })
  }
}

async function loadProfile() {
  loadingProfile.value = true
  feedbackMessage.value = ''
  try {
    const response = await bffFetch<{ status: 'success', data: AdminProfileData }>('/api/admin/profile')
    profile.value = response.data
    original.value = JSON.parse(JSON.stringify(response.data)) as AdminProfileData
    applyProfileToForm(response.data)
    syncSessionStores(response.data)
  } catch (error: unknown) {
    feedbackColor.value = 'error'
    feedbackMessage.value = resolveProfileRequestErrorMessage(error, 'Falha ao carregar perfil.')
  } finally {
    loadingProfile.value = false
  }
}

async function saveProfile() {
  if (!canEdit.value) return
  if (!validateProfileForm()) return

  const payload = buildProfileUpdateRequest(original.value, form)
  if (Object.keys(payload).length < 1) {
    feedbackColor.value = 'warning'
    feedbackMessage.value = 'Nenhuma alteracao pendente para salvar.'
    return
  }

  saving.value = true
  feedbackMessage.value = ''

  try {
    const response = await bffFetch<{ status: 'success', data: AdminProfileData }>('/api/admin/profile', {
      method: 'PATCH',
      body: payload
    })

    profile.value = response.data
    original.value = JSON.parse(JSON.stringify(response.data)) as AdminProfileData
    applyProfileToForm(response.data)
    syncSessionStores(response.data)

    lastSavedAt.value = new Date().toISOString()
    feedbackColor.value = 'success'
    feedbackMessage.value = 'Perfil atualizado no banco com sucesso.'
  } catch (error: unknown) {
    feedbackColor.value = 'error'
    feedbackMessage.value = resolveProfileRequestErrorMessage(error, 'Falha ao salvar perfil.')
  } finally {
    saving.value = false
  }
}

function restoreFromOriginal() {
  if (!original.value) return
  applyProfileToForm(original.value)
  feedbackMessage.value = ''
}

onMounted(() => {
  void loadProfile()
})
</script>

<template>
  <section class="profile space-y-4">
    <AdminPageHeader
      eyebrow="Perfil"
      title="Minha conta"
      description="Perfil conectado ao backend atual (core)."
    />

    <UCard>
      <template #header>
        <div class="space-y-1">
          <p class="text-xs uppercase tracking-[0.12em] text-[rgb(var(--muted))]">
            Sessao ativa
          </p>
          <h2 class="text-lg font-semibold">
            {{ form.nick || form.name || 'Usuario' }}
          </h2>
          <p class="text-sm text-[rgb(var(--muted))]">
            Cliente: {{ tenantLabel }}
          </p>
        </div>
      </template>

      <div v-if="loadingProfile" class="py-4">
        <USkeleton class="h-6 w-48" />
      </div>

      <form v-else class="grid gap-4 md:grid-cols-2" @submit.prevent="saveProfile">
        <UFormField label="Nick">
          <UInput v-model="form.nick" :disabled="!canEdit" placeholder="Seu nick de exibicao" />
        </UFormField>

        <UFormField label="Nome">
          <UInput v-model="form.name" :disabled="!canEdit" placeholder="Nome completo" />
        </UFormField>

        <UFormField label="Email">
          <UInput v-model="form.email" :disabled="!canEdit" type="email" placeholder="usuario@cliente.com" />
        </UFormField>

        <UFormField label="Telefone">
          <UInput v-model="form.phone" :disabled="!canEdit" placeholder="(00) 00000-0000" />
        </UFormField>

        <UFormField label="Imagem de perfil (URL)" class="md:col-span-2">
          <UInput v-model="form.profileImage" :disabled="!canEdit" placeholder="https://..." />
        </UFormField>

        <UFormField label="Senha atual">
          <UInput v-model="form.currentPassword" :disabled="!canEdit" type="password" placeholder="Senha atual" />
        </UFormField>

        <UFormField label="Nova senha">
          <UInput v-model="form.newPassword" :disabled="!canEdit" type="password" placeholder="Nova senha" />
        </UFormField>

        <UFormField label="Confirmar nova senha" class="md:col-span-2">
          <UInput
            v-model="form.confirmPassword"
            :disabled="!canEdit"
            type="password"
            placeholder="Repita a nova senha"
          />
        </UFormField>

        <div class="md:col-span-2 flex flex-wrap items-center gap-3">
          <UButton type="submit" :loading="saving" :disabled="!canEdit">
            Salvar
          </UButton>

          <UButton type="button" color="neutral" variant="soft" :disabled="saving || !canEdit" @click="restoreFromOriginal">
            Restaurar
          </UButton>

          <p v-if="lastSavedAt" class="text-xs text-[rgb(var(--muted))]">
            Ultima atualizacao: {{ new Date(lastSavedAt).toLocaleString('pt-BR') }}
          </p>
        </div>
      </form>
    </UCard>

    <UAlert
      v-if="feedbackMessage"
      :color="feedbackColor"
      variant="soft"
      :title="feedbackMessage"
    />
  </section>
</template>
