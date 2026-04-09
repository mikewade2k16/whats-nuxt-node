<script setup lang="ts">
import OmniCollectionFilters from '~/components/omni/filters/OmniCollectionFilters.vue'
import type { TrainingItem } from '~/types/training'
import type { OmniFilterDefinition } from '~/types/omni/collection'

definePageMeta({
  layout: 'admin'
})

const sessionSimulation = useSessionSimulationStore()

const {
  sections,
  storeOptions,
  clientOptions,
  selectedClientId,
  loading,
  submitting,
  errorMessage,
  submitErrorMessage,
  submitSuccessMessage,
  fetchCatalog,
  setSelectedClientId,
  submitEvaluation,
  clearSubmitFeedback
} = useTrainingManager()

const trainingModalOpen = ref(false)
const evaluationModalOpen = ref(false)
const trainingVideoError = ref(false)
const activeSlideIndex = ref(0)

const activeTrainingItem = ref<TrainingItem | null>(null)
const activeEvaluationItem = ref<TrainingItem | null>(null)

const evaluationForm = reactive({
  traineeName: '',
  storeName: '',
  answers: [] as string[]
})

const activeSlides = computed(() => activeTrainingItem.value?.slides ?? [])

const activeSlide = computed(() => {
  if (!activeSlides.value.length) return null
  const maxIndex = Math.max(activeSlides.value.length - 1, 0)
  const safeIndex = Math.min(Math.max(activeSlideIndex.value, 0), maxIndex)
  return activeSlides.value[safeIndex] ?? null
})

const activeQuestionnaire = computed(() => activeEvaluationItem.value?.questionnaire ?? null)

const storeSelectOptions = computed(() => storeOptions.value.map(store => ({
  label: store,
  value: store
})))

const trainingClientFilterOptions = computed(() => ([
  { label: 'Todos os clientes', value: '' },
  ...clientOptions.value.map(option => ({
    label: option.label,
    value: option.value
  }))
]))
const viewerUserType = computed<'admin' | 'client'>(() => {
  return sessionSimulation.userType === 'client' ? 'client' : 'admin'
})
const filtersState = ref<Record<string, unknown>>({
  clientFilter: ''
})
const filterDefinitions = computed<OmniFilterDefinition[]>(() => [
  {
    key: 'clientFilter',
    label: 'Cliente',
    adminOnly: true,
    type: 'select',
    placeholder: 'Cliente',
    options: trainingClientFilterOptions.value
  }
])

const canSubmitEvaluation = computed(() => {
  const questionnaire = activeQuestionnaire.value
  if (!questionnaire) return false

  const hasName = evaluationForm.traineeName.trim().length > 0
  const hasStore = evaluationForm.storeName.trim().length > 0
  const answers = questionnaire.questions.map((_, index) => String(evaluationForm.answers[index] ?? '').trim())
  const allAnswered = answers.length === questionnaire.questions.length && answers.every(answer => answer.length > 0)

  return hasName && hasStore && allAnswered
})

function openTrainingModal(item: TrainingItem) {
  activeTrainingItem.value = item
  activeSlideIndex.value = 0
  trainingVideoError.value = false
  trainingModalOpen.value = true
}

function nextSlide() {
  const maxIndex = activeSlides.value.length - 1
  if (maxIndex <= 0) return
  activeSlideIndex.value = Math.min(activeSlideIndex.value + 1, maxIndex)
}

function previousSlide() {
  if (!activeSlides.value.length) return
  activeSlideIndex.value = Math.max(activeSlideIndex.value - 1, 0)
}

function goToSlide(index: number) {
  const maxIndex = activeSlides.value.length - 1
  if (maxIndex < 0) return
  activeSlideIndex.value = Math.min(Math.max(index, 0), maxIndex)
}

function resetEvaluationForm() {
  evaluationForm.traineeName = ''
  evaluationForm.storeName = ''
  evaluationForm.answers = []
}

function openEvaluationModal(item: TrainingItem) {
  if (!item.questionnaire) return

  activeEvaluationItem.value = item
  evaluationForm.answers = item.questionnaire.questions.map(() => '')
  clearSubmitFeedback()
  evaluationModalOpen.value = true
}

function setAnswer(index: number, value: string) {
  evaluationForm.answers[index] = value
}

async function onSubmitEvaluation() {
  const questionnaire = activeQuestionnaire.value
  const item = activeEvaluationItem.value
  if (!questionnaire || !item) return
  if (!canSubmitEvaluation.value) return

  const result = await submitEvaluation({
    trainingKey: questionnaire.key,
    trainingTitle: item.title,
    clientId: item.clientId,
    traineeName: evaluationForm.traineeName,
    storeName: evaluationForm.storeName,
    answers: questionnaire.questions.map((_, index) => String(evaluationForm.answers[index] ?? '').trim())
  })

  if (result) {
    resetEvaluationForm()
    setTimeout(() => {
      evaluationModalOpen.value = false
      activeEvaluationItem.value = null
      clearSubmitFeedback()
    }, 900)
  }
}

watch(trainingModalOpen, (open) => {
  if (open) return
  activeTrainingItem.value = null
  activeSlideIndex.value = 0
  trainingVideoError.value = false
})

watch(evaluationModalOpen, (open) => {
  if (open) return
  activeEvaluationItem.value = null
  resetEvaluationForm()
  clearSubmitFeedback()
})

watch(
  () => filtersState.value.clientFilter,
  (value) => {
    if (!sessionSimulation.isAdmin) return
    setSelectedClientId(value)
  }
)

watch(
  () => sessionSimulation.userType,
  (next) => {
    if (next === 'admin') return
    filtersState.value = {
      ...filtersState.value,
      clientFilter: ''
    }
  }
)

onMounted(() => {
  void fetchCatalog()
})
</script>

<template>
  <section class="training-page space-y-4">
    <AdminPageHeader
      class="training-page__header"
      eyebrow="Team"
      title="Treinamento"
      description="Biblioteca de treinamento em modo teste com visualizador de conteudo e avaliacao por modulo."
    />

    <OmniCollectionFilters
      v-if="sessionSimulation.isAdmin"
      v-model="filtersState"
      :filters="filterDefinitions"
      :viewer-user-type="viewerUserType"
      :show-column-filter="false"
      :show-reset="false"
      :loading="loading"
    />

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      icon="i-lucide-alert-triangle"
      title="Erro"
      :description="errorMessage"
    />

    <div v-if="loading && sections.length === 0" class="training-page__loading grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <USkeleton
        v-for="placeholderIndex in 8"
        :key="`training-skeleton-${placeholderIndex}`"
        class="h-[270px] rounded-[var(--radius-md)]"
      />
    </div>

    <UAlert
      v-if="!loading && sections.length === 0"
      color="warning"
      variant="soft"
      icon="i-lucide-shield-alert"
      title="Treinamento indisponivel"
      :description="sessionSimulation.isAdmin
        ? 'Nenhum treinamento foi liberado para o filtro de cliente selecionado.'
        : 'Nenhum treinamento foi liberado para o cliente selecionado no momento.'"
    />

    <section
      v-for="section in sections"
      :key="section.key"
      class="training-page__module space-y-3"
    >
      <h2 class="training-page__module-title text-lg font-semibold text-[rgb(var(--text))]">
        {{ section.title }}
      </h2>

      <div class="training-page__grid grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <UCard
          v-for="item in section.items"
          :key="item.id"
          class="training-page__card h-full border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))]"
          :ui="{ body: 'training-page__card-body p-3 flex flex-col gap-3' }"
        >
          <template #header>
            <div class="training-page__cover-wrapper overflow-hidden rounded-[var(--radius-sm)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
              <img
                :src="item.coverImageUrl"
                :alt="item.title"
                class="training-page__cover-image h-[170px] w-full object-cover"
                loading="lazy"
              >
            </div>
          </template>

          <div class="training-page__card-content flex min-h-[86px] flex-col gap-2">
            <p class="training-page__module-badge text-[11px] uppercase tracking-wide text-[rgb(var(--muted))]">
              {{ item.moduleLabel }}
            </p>
            <p
              v-if="sessionSimulation.isAdmin && selectedClientId === null"
              class="training-page__client-badge text-[11px] uppercase tracking-wide text-[rgb(var(--muted))]"
            >
              Cliente: {{ item.clientName }}
            </p>
            <h3 class="training-page__card-title text-sm font-semibold text-[rgb(var(--text))]">
              {{ item.title }}
            </h3>
          </div>

          <div class="training-page__card-actions flex flex-wrap items-center gap-2">
            <UButton
              icon="i-lucide-play-circle"
              label="Ver treinamento"
              color="primary"
              size="sm"
              @click="openTrainingModal(item)"
            />

            <UButton
              v-if="item.questionnaire"
              icon="i-lucide-clipboard-check"
              label="Fazer avaliacao"
              color="neutral"
              variant="soft"
              size="sm"
              @click="openEvaluationModal(item)"
            />
          </div>
        </UCard>
      </div>
    </section>
  </section>

  <UModal
    v-model:open="trainingModalOpen"
    :title="activeTrainingItem?.title || 'Treinamento'"
    :description="activeTrainingItem?.moduleLabel || 'Conteudo do treinamento'"
    :ui="{ content: 'max-w-6xl' }"
  >
    <template #body>
      <div v-if="activeTrainingItem" class="training-page__training-modal-body space-y-3">
        <div v-if="activeTrainingItem.trainingType === 'slides'" class="training-page__slides space-y-3">
          <div class="training-page__slide-frame flex min-h-[360px] items-center justify-center rounded-[var(--radius-md)] border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-2">
            <img
              v-if="activeSlide"
              :src="activeSlide.imageUrl"
              :alt="activeSlide.caption"
              class="training-page__slide-image max-h-[72vh] max-w-full rounded-[var(--radius-sm)] object-contain"
            >
          </div>

          <div class="training-page__slide-toolbar flex items-center justify-between gap-2">
            <UButton
              icon="i-lucide-chevron-left"
              label="Anterior"
              color="neutral"
              variant="soft"
              :disabled="activeSlideIndex <= 0"
              @click="previousSlide"
            />

            <p class="text-xs text-[rgb(var(--muted))]">
              Slide {{ activeSlideIndex + 1 }} de {{ activeSlides.length }}
            </p>

            <UButton
              icon="i-lucide-chevron-right"
              trailing
              label="Proximo"
              color="neutral"
              variant="soft"
              :disabled="activeSlideIndex >= activeSlides.length - 1"
              @click="nextSlide"
            />
          </div>

          <div class="training-page__slide-dots flex flex-wrap justify-center gap-1">
            <button
              v-for="(slide, index) in activeSlides"
              :key="slide.id"
              type="button"
              class="training-page__slide-dot h-2.5 w-2.5 rounded-full transition-colors"
              :class="index === activeSlideIndex ? 'bg-primary' : 'bg-[rgb(var(--border))]'"
              :aria-label="`Ir para slide ${index + 1}`"
              @click="goToSlide(index)"
            />
          </div>
        </div>

        <div v-else class="training-page__video-view space-y-3">
          <div class="training-page__video-frame rounded-[var(--radius-md)] border border-[rgb(var(--border))] bg-black p-2">
            <video
              v-if="activeTrainingItem.videoUrl && !trainingVideoError"
              controls
              class="h-auto max-h-[72vh] w-full rounded-[var(--radius-sm)]"
              @error="trainingVideoError = true"
            >
              <source :src="activeTrainingItem.videoUrl" type="video/mp4">
              Seu navegador nao suporta reproducao de video.
            </video>

            <div
              v-else
              class="training-page__video-fallback flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-dashed border-[rgb(var(--border))] p-4 text-center text-sm text-[rgb(var(--muted))]"
            >
              <p class="font-semibold text-[rgb(var(--text))]">Video indisponivel no ambiente atual.</p>
              <p>
                Para reproduzir localmente, adicione o arquivo em:
                <code class="rounded bg-[rgb(var(--surface))] px-1.5 py-0.5">public/training/videos/garmin.mp4</code>
              </p>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="training-page__training-modal-footer flex w-full items-center justify-end gap-2">
        <UButton label="Fechar" color="neutral" variant="ghost" @click="trainingModalOpen = false" />
      </div>
    </template>
  </UModal>

  <UModal
    v-model:open="evaluationModalOpen"
    :title="activeEvaluationItem?.title || 'Avaliacao'"
    :description="activeQuestionnaire?.title || 'Responda todas as perguntas'"
    :ui="{ content: 'max-w-4xl' }"
  >
    <template #body>
      <div class="training-page__evaluation-modal-body space-y-4">
        <div class="grid gap-3 md:grid-cols-2">
          <div class="space-y-1">
            <p class="text-xs font-medium text-[rgb(var(--muted))]">Nome completo</p>
            <UInput
              v-model="evaluationForm.traineeName"
              placeholder="Digite seu nome completo"
              @update:model-value="clearSubmitFeedback"
            />
          </div>

          <div class="space-y-1">
            <p class="text-xs font-medium text-[rgb(var(--muted))]">Selecione sua loja</p>
            <USelect
              v-model="evaluationForm.storeName"
              :items="storeSelectOptions"
              placeholder="Selecione a loja"
              @update:model-value="clearSubmitFeedback"
            />
          </div>
        </div>

        <div v-if="activeQuestionnaire" class="training-page__questions space-y-3">
          <div
            v-for="(question, index) in activeQuestionnaire.questions"
            :key="`${activeQuestionnaire.key}-question-${index}`"
            class="training-page__question-card space-y-1 rounded-[var(--radius-sm)] border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-3"
          >
            <p class="training-page__question-label text-sm font-medium text-[rgb(var(--text))]">
              {{ question }}
            </p>
            <UTextarea
              :model-value="evaluationForm.answers[index] ?? ''"
              :rows="3"
              placeholder="Digite sua resposta..."
              @update:model-value="setAnswer(index, String($event ?? '')); clearSubmitFeedback()"
            />
          </div>
        </div>

        <UAlert
          v-if="submitErrorMessage"
          color="error"
          variant="soft"
          icon="i-lucide-alert-triangle"
          :description="submitErrorMessage"
        />

        <UAlert
          v-if="submitSuccessMessage"
          color="success"
          variant="soft"
          icon="i-lucide-badge-check"
          :description="submitSuccessMessage"
        />
      </div>
    </template>

    <template #footer>
      <div class="training-page__evaluation-modal-footer flex w-full items-center justify-end gap-2">
        <UButton label="Cancelar" color="neutral" variant="ghost" @click="evaluationModalOpen = false" />
        <UButton
          icon="i-lucide-send"
          label="Enviar respostas"
          color="primary"
          :loading="submitting"
          :disabled="!canSubmitEvaluation || submitting"
          @click="onSubmitEvaluation"
        />
      </div>
    </template>
  </UModal>
</template>
