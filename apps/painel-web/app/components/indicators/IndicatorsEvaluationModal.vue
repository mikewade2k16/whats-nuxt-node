<script setup lang="ts">
import type {
  IndicatorCode,
  IndicatorEvaluationDraftPayload,
  IndicatorSelectionOption,
  IndicatorUnitOption
} from '~/types/indicators'

interface ToggleFieldState {
  ok: boolean
  evidenceName: string
  evidencePreviewUrl: string
}

type Indicator1FieldKey = 'coffeeRestock' | 'foodDisplay' | 'packaging' | 'mezzanine'
type Indicator4FieldKey = 'windowStandard' | 'storeGifts' | 'dressCode'

interface EvaluationFormState {
  evaluatorName: string
  unitId: string
  periodStart: string
  periodEnd: string
  selectedIndicators: IndicatorCode[]
  indicator1: Record<Indicator1FieldKey, ToggleFieldState>
  indicator2: {
    highestValue: number
    lowestValue: number
    stiAverage: number
    leadershipDevelopment: number
    survey360: number
  }
  indicator3: {
    serviceNpsRaw: number
  }
  indicator4: {
    postSaleReturn: number
  } & Record<Indicator4FieldKey, ToggleFieldState>
  indicator5: {
    revenueReal: number
    avgTicketReal: number
    discountReal: number
  }
}

const props = defineProps<{
  open: boolean
  actorName: string
  unitOptions: IndicatorUnitOption[]
  indicatorOptions: IndicatorSelectionOption[]
  defaultStart: string
  defaultEnd: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  submit: [payload: IndicatorEvaluationDraftPayload]
}>()

const indicator1Fields: Array<{ key: Indicator1FieldKey, label: string }> = [
  { key: 'coffeeRestock', label: 'Reposicao de cafe' },
  { key: 'foodDisplay', label: 'Bolo / bebidas / comidas' },
  { key: 'packaging', label: 'Embalagens certas' },
  { key: 'mezzanine', label: 'Mezanino organizado' }
]

const indicator4Fields: Array<{ key: Indicator4FieldKey, label: string }> = [
  { key: 'windowStandard', label: 'Vitrines e TVs no padrao' },
  { key: 'storeGifts', label: 'Mimos disponiveis' },
  { key: 'dressCode', label: 'Dress code' }
]

function buildToggleField(ok = true): ToggleFieldState {
  return {
    ok,
    evidenceName: '',
    evidencePreviewUrl: ''
  }
}

function buildInitialState(): EvaluationFormState {
  const defaultUnit = props.unitOptions[0] ?? null

  return {
    evaluatorName: props.actorName || 'Nao identificado',
    unitId: defaultUnit?.id ?? '',
    periodStart: props.defaultStart,
    periodEnd: props.defaultEnd,
    selectedIndicators: [],
    indicator1: {
      coffeeRestock: buildToggleField(),
      foodDisplay: buildToggleField(),
      packaging: buildToggleField(),
      mezzanine: buildToggleField()
    },
    indicator2: {
      highestValue: 92,
      lowestValue: 74,
      stiAverage: defaultUnit?.teamSnapshot.stiAverage ?? 8.5,
      leadershipDevelopment: 8.8,
      survey360: defaultUnit?.teamSnapshot.survey360 ?? 8.2
    },
    indicator3: {
      serviceNpsRaw: 4.4
    },
    indicator4: {
      postSaleReturn: defaultUnit?.targetSnapshot.returnTarget ?? 10,
      windowStandard: buildToggleField(),
      storeGifts: buildToggleField(),
      dressCode: buildToggleField()
    },
    indicator5: {
      revenueReal: defaultUnit?.targetSnapshot.revenueTarget ?? 100,
      avgTicketReal: defaultUnit?.targetSnapshot.avgTicketTarget ?? 1800,
      discountReal: defaultUnit?.targetSnapshot.discountTarget ?? 10
    }
  }
}

const form = reactive<EvaluationFormState>(buildInitialState())
const errorMessage = ref('')

const openModel = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value)
})

const unitSelectItems = computed(() => {
  return props.unitOptions.map((unit) => ({ label: unit.label, value: unit.id }))
})

const selectedUnit = computed(() => {
  return props.unitOptions.find((unit) => unit.id === form.unitId) ?? props.unitOptions[0] ?? null
})

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function revokePreview(url: string) {
  if (import.meta.client && url.startsWith('blob:')) {
    window.URL.revokeObjectURL(url)
  }
}

function resolveToggleField(section: 'indicator1', key: Indicator1FieldKey): ToggleFieldState
function resolveToggleField(section: 'indicator4', key: Indicator4FieldKey): ToggleFieldState
function resolveToggleField(section: 'indicator1' | 'indicator4', key: Indicator1FieldKey | Indicator4FieldKey) {
  return section === 'indicator1'
    ? form.indicator1[key as Indicator1FieldKey]
    : form.indicator4[key as Indicator4FieldKey]
}

function revokeAllEvidencePreviews() {
  Object.values(form.indicator1).forEach((field) => revokePreview(field.evidencePreviewUrl))
  indicator4Fields.forEach((field) => revokePreview(form.indicator4[field.key].evidencePreviewUrl))
}

function resetForm() {
  revokeAllEvidencePreviews()
  errorMessage.value = ''
  Object.assign(form, buildInitialState())
}

function syncUnitSnapshots() {
  const unit = selectedUnit.value
  if (!unit) return

  form.indicator2.stiAverage = unit.teamSnapshot.stiAverage
  form.indicator2.survey360 = unit.teamSnapshot.survey360
  form.indicator4.postSaleReturn = unit.targetSnapshot.returnTarget
  form.indicator5.revenueReal = unit.targetSnapshot.revenueTarget
  form.indicator5.avgTicketReal = unit.targetSnapshot.avgTicketTarget
  form.indicator5.discountReal = unit.targetSnapshot.discountTarget
}

function toggleIndicator(code: IndicatorCode) {
  if (form.selectedIndicators.includes(code)) {
    form.selectedIndicators = form.selectedIndicators.filter((entry) => entry !== code)
    return
  }

  form.selectedIndicators = [...form.selectedIndicators, code]
}

function isIndicatorSelected(code: IndicatorCode) {
  return form.selectedIndicators.includes(code)
}

function clearEvidence(section: 'indicator1' | 'indicator4', key: Indicator1FieldKey | Indicator4FieldKey) {
  const field = resolveToggleField(section as 'indicator1' & 'indicator4', key as never)
  revokePreview(field.evidencePreviewUrl)
  field.evidenceName = ''
  field.evidencePreviewUrl = ''
}

function onEvidenceChange(section: 'indicator1' | 'indicator4', key: Indicator1FieldKey | Indicator4FieldKey, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  const field = resolveToggleField(section as 'indicator1' & 'indicator4', key as never)

  revokePreview(field.evidencePreviewUrl)

  if (!file) {
    field.evidenceName = ''
    field.evidencePreviewUrl = ''
    return
  }

  field.evidenceName = file.name
  field.evidencePreviewUrl = import.meta.client && file.type.startsWith('image/')
    ? window.URL.createObjectURL(file)
    : ''
}

function submitForm() {
  errorMessage.value = ''

  if (!form.unitId) {
    errorMessage.value = 'Selecione a loja para criar a avaliacao.'
    return
  }

  if (!form.periodStart || !form.periodEnd) {
    errorMessage.value = 'Informe o periodo completo da avaliacao.'
    return
  }

  if (form.periodEnd < form.periodStart) {
    errorMessage.value = 'A data final nao pode ser menor do que a data inicial.'
    return
  }

  if (form.selectedIndicators.length === 0) {
    errorMessage.value = 'Selecione pelo menos um indicador para avaliar.'
    return
  }

  const unit = selectedUnit.value
  if (!unit) {
    errorMessage.value = 'Nao foi possivel resolver a unidade selecionada.'
    return
  }

  emit('submit', {
    evaluatorName: form.evaluatorName,
    unitId: unit.id,
    unitName: unit.label,
    periodStart: form.periodStart,
    periodEnd: form.periodEnd,
    indicatorCodes: [...form.selectedIndicators]
  })

  emit('update:open', false)
  resetForm()
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      resetForm()
    }
  }
)

watch(
  () => props.actorName,
  (nextActor) => {
    if (!props.open) {
      form.evaluatorName = nextActor || 'Nao identificado'
    }
  }
)

watch(
  () => form.unitId,
  () => {
    syncUnitSnapshots()
  }
)

onBeforeUnmount(() => {
  revokeAllEvidencePreviews()
})
</script>

<template>
  <UModal
    v-model:open="openModel"
    title="Avaliar indicadores"
    description="Replica o fluxo do modal legado com selecao parcial de indicadores, periodo e evidencias locais no front."
    :ui="{ content: 'max-w-6xl' }"
  >
    <template #body>
      <div class="indicator-evaluation-modal">
        <UAlert
          v-if="errorMessage"
          color="error"
          variant="soft"
          icon="i-lucide-alert-triangle"
          title="Formulario incompleto"
          :description="errorMessage"
        />

        <div class="indicator-evaluation-modal__grid indicator-evaluation-modal__grid--header">
          <div class="indicator-evaluation-modal__field">
            <span class="indicator-evaluation-modal__label">Avaliador</span>
            <UInput :model-value="form.evaluatorName" disabled />
          </div>

          <div class="indicator-evaluation-modal__field">
            <span class="indicator-evaluation-modal__label">Loja</span>
            <USelect v-model="form.unitId" :items="unitSelectItems" />
          </div>

          <div class="indicator-evaluation-modal__field">
            <span class="indicator-evaluation-modal__label">Periodo inicio</span>
            <UInput v-model="form.periodStart" type="date" />
          </div>

          <div class="indicator-evaluation-modal__field">
            <span class="indicator-evaluation-modal__label">Periodo fim</span>
            <UInput v-model="form.periodEnd" type="date" />
          </div>
        </div>

        <div v-if="selectedUnit" class="indicator-evaluation-modal__snapshot-strip">
          <UBadge color="neutral" variant="soft">STI: {{ selectedUnit.teamSnapshot.stiAverage.toFixed(1) }}</UBadge>
          <UBadge color="neutral" variant="soft">Pesquisa 360: {{ selectedUnit.teamSnapshot.survey360.toFixed(1) }}</UBadge>
          <UBadge color="neutral" variant="soft">Meta pos-venda: {{ selectedUnit.targetSnapshot.returnTarget }}%</UBadge>
          <UBadge color="neutral" variant="soft">Meta ticket: R$ {{ selectedUnit.targetSnapshot.avgTicketTarget.toFixed(0) }}</UBadge>
        </div>

        <section class="indicator-evaluation-modal__block">
          <div class="indicator-evaluation-modal__block-header">
            <p class="indicator-evaluation-modal__block-title">Selecione os indicadores a avaliar</p>
            <span class="indicator-evaluation-modal__block-copy">Os blocos abaixo aparecem somente quando selecionados.</span>
          </div>

          <div class="indicator-evaluation-modal__selector">
            <button
              v-for="indicator in indicatorOptions"
              :key="indicator.code"
              type="button"
              class="indicator-evaluation-modal__selector-pill"
              :class="{ 'is-active': isIndicatorSelected(indicator.code) }"
              @click="toggleIndicator(indicator.code)"
            >
              <span>{{ indicator.label }}</span>
              <strong>{{ indicator.weight }}%</strong>
            </button>
          </div>
        </section>

        <section v-if="isIndicatorSelected('indicator_1')" class="indicator-evaluation-modal__block">
          <div class="indicator-evaluation-modal__block-header">
            <p class="indicator-evaluation-modal__block-title">1. Ambiente Aconchegante (15%)</p>
            <span class="indicator-evaluation-modal__block-copy">Quando o item falhar, anexe a evidencia visual no proprio card.</span>
          </div>

          <div class="indicator-evaluation-modal__toggle-grid">
            <article v-for="field in indicator1Fields" :key="field.key" class="indicator-evaluation-modal__toggle-card">
              <div class="indicator-evaluation-modal__toggle-head">
                <div>
                  <p class="indicator-evaluation-modal__toggle-title">{{ field.label }}</p>
                  <p class="indicator-evaluation-modal__toggle-copy">Marque como nao conforme para anexar imagem.</p>
                </div>
                <USwitch v-model="form.indicator1[field.key].ok" />
              </div>

              <div v-if="!form.indicator1[field.key].ok" class="indicator-evaluation-modal__evidence-box">
                <label class="indicator-evaluation-modal__upload-button">
                  <input type="file" class="sr-only" accept="image/*" @change="onEvidenceChange('indicator1', field.key, $event)">
                  <span>Selecionar evidencia</span>
                </label>

                <div v-if="form.indicator1[field.key].evidencePreviewUrl" class="indicator-evaluation-modal__preview-frame">
                  <img :src="form.indicator1[field.key].evidencePreviewUrl" :alt="field.label" class="indicator-evaluation-modal__preview-image">
                </div>

                <p v-else-if="form.indicator1[field.key].evidenceName" class="indicator-evaluation-modal__preview-name">
                  {{ form.indicator1[field.key].evidenceName }}
                </p>

                <UButton
                  v-if="form.indicator1[field.key].evidenceName"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-x"
                  @click="clearEvidence('indicator1', field.key)"
                >
                  Limpar
                </UButton>
              </div>
            </article>
          </div>
        </section>

        <section v-if="isIndicatorSelected('indicator_2')" class="indicator-evaluation-modal__block">
          <div class="indicator-evaluation-modal__block-header">
            <p class="indicator-evaluation-modal__block-title">2. Time de Especialistas (25%)</p>
            <span class="indicator-evaluation-modal__block-copy">STI e Pesquisa 360 entram como snapshot do contexto atual da unidade.</span>
          </div>

          <div class="indicator-evaluation-modal__grid indicator-evaluation-modal__grid--numbers">
            <div class="indicator-evaluation-modal__field">
              <span class="indicator-evaluation-modal__label">Maior valor do time</span>
              <UInput
                :model-value="form.indicator2.highestValue"
                type="number"
                @update:model-value="form.indicator2.highestValue = toNumber($event, form.indicator2.highestValue)"
              />
            </div>

            <div class="indicator-evaluation-modal__field">
              <span class="indicator-evaluation-modal__label">Menor valor do time</span>
              <UInput
                :model-value="form.indicator2.lowestValue"
                type="number"
                @update:model-value="form.indicator2.lowestValue = toNumber($event, form.indicator2.lowestValue)"
              />
            </div>

            <div class="indicator-evaluation-modal__field">
              <span class="indicator-evaluation-modal__label">Media provas STI</span>
              <UInput :model-value="form.indicator2.stiAverage.toFixed(1)" disabled />
            </div>

            <div class="indicator-evaluation-modal__field">
              <span class="indicator-evaluation-modal__label">Desenv. lideres</span>
              <UInput
                :model-value="form.indicator2.leadershipDevelopment"
                type="number"
                @update:model-value="form.indicator2.leadershipDevelopment = toNumber($event, form.indicator2.leadershipDevelopment)"
              />
            </div>

            <div class="indicator-evaluation-modal__field indicator-evaluation-modal__field--full">
              <span class="indicator-evaluation-modal__label">Pesquisa 360 (NPS)</span>
              <UInput :model-value="form.indicator2.survey360.toFixed(1)" disabled />
            </div>
          </div>
        </section>

        <section v-if="isIndicatorSelected('indicator_3')" class="indicator-evaluation-modal__block">
          <div class="indicator-evaluation-modal__block-header">
            <p class="indicator-evaluation-modal__block-title">3. Qualidade de Produtos e Servicos (10%)</p>
            <span class="indicator-evaluation-modal__block-copy">No novo front o NPS bruto e o percentual ficam separados na leitura final.</span>
          </div>

          <div class="indicator-evaluation-modal__grid indicator-evaluation-modal__grid--single">
            <div class="indicator-evaluation-modal__field indicator-evaluation-modal__field--full">
              <span class="indicator-evaluation-modal__label">NPS ligado a servico (0 a 5)</span>
              <UInput
                :model-value="form.indicator3.serviceNpsRaw"
                type="number"
                @update:model-value="form.indicator3.serviceNpsRaw = toNumber($event, form.indicator3.serviceNpsRaw)"
              />
            </div>
          </div>
        </section>

        <section v-if="isIndicatorSelected('indicator_4')" class="indicator-evaluation-modal__block">
          <div class="indicator-evaluation-modal__block-header">
            <p class="indicator-evaluation-modal__block-title">4. Posicionamento e Branding (15%)</p>
            <span class="indicator-evaluation-modal__block-copy">Retorno de pos-venda e evidencias visuais seguem o desenho original do modal.</span>
          </div>

          <div class="indicator-evaluation-modal__grid indicator-evaluation-modal__grid--single">
            <div class="indicator-evaluation-modal__field indicator-evaluation-modal__field--full">
              <span class="indicator-evaluation-modal__label">Retorno do pos-venda (%)</span>
              <UInput
                :model-value="form.indicator4.postSaleReturn"
                type="number"
                @update:model-value="form.indicator4.postSaleReturn = toNumber($event, form.indicator4.postSaleReturn)"
              />
            </div>
          </div>

          <div class="indicator-evaluation-modal__toggle-grid">
            <article v-for="field in indicator4Fields" :key="field.key" class="indicator-evaluation-modal__toggle-card">
              <div class="indicator-evaluation-modal__toggle-head">
                <div>
                  <p class="indicator-evaluation-modal__toggle-title">{{ field.label }}</p>
                  <p class="indicator-evaluation-modal__toggle-copy">Quando falhar, anexe a imagem comprobataria.</p>
                </div>
                <USwitch v-model="form.indicator4[field.key].ok" />
              </div>

              <div v-if="!form.indicator4[field.key].ok" class="indicator-evaluation-modal__evidence-box">
                <label class="indicator-evaluation-modal__upload-button">
                  <input type="file" class="sr-only" accept="image/*" @change="onEvidenceChange('indicator4', field.key, $event)">
                  <span>Selecionar evidencia</span>
                </label>

                <div v-if="form.indicator4[field.key].evidencePreviewUrl" class="indicator-evaluation-modal__preview-frame">
                  <img :src="form.indicator4[field.key].evidencePreviewUrl" :alt="field.label" class="indicator-evaluation-modal__preview-image">
                </div>

                <p v-else-if="form.indicator4[field.key].evidenceName" class="indicator-evaluation-modal__preview-name">
                  {{ form.indicator4[field.key].evidenceName }}
                </p>

                <UButton
                  v-if="form.indicator4[field.key].evidenceName"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-x"
                  @click="clearEvidence('indicator4', field.key)"
                >
                  Limpar
                </UButton>
              </div>
            </article>
          </div>
        </section>

        <section v-if="isIndicatorSelected('indicator_5')" class="indicator-evaluation-modal__block">
          <div class="indicator-evaluation-modal__block-header">
            <p class="indicator-evaluation-modal__block-title">5. Indicadores de Resultado (35%)</p>
            <span class="indicator-evaluation-modal__block-copy">Meta batida, ticket medio e desconto partem das metas vigentes da unidade.</span>
          </div>

          <div class="indicator-evaluation-modal__grid indicator-evaluation-modal__grid--numbers">
            <div class="indicator-evaluation-modal__field">
              <span class="indicator-evaluation-modal__label">Meta mensal (%)</span>
              <UInput
                :model-value="form.indicator5.revenueReal"
                type="number"
                @update:model-value="form.indicator5.revenueReal = toNumber($event, form.indicator5.revenueReal)"
              />
            </div>

            <div class="indicator-evaluation-modal__field">
              <span class="indicator-evaluation-modal__label">Ticket medio (R$)</span>
              <UInput
                :model-value="form.indicator5.avgTicketReal"
                type="number"
                @update:model-value="form.indicator5.avgTicketReal = toNumber($event, form.indicator5.avgTicketReal)"
              />
            </div>

            <div class="indicator-evaluation-modal__field">
              <span class="indicator-evaluation-modal__label">Desconto medio (%)</span>
              <UInput
                :model-value="form.indicator5.discountReal"
                type="number"
                @update:model-value="form.indicator5.discountReal = toNumber($event, form.indicator5.discountReal)"
              />
            </div>
          </div>
        </section>
      </div>
    </template>

    <template #footer>
      <div class="indicator-evaluation-modal__footer">
        <UButton color="neutral" variant="ghost" @click="openModel = false">
          Cancelar
        </UButton>

        <UButton icon="i-lucide-save" color="primary" @click="submitForm">
          Salvar avaliacao
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.indicator-evaluation-modal {
  display: grid;
  gap: 1rem;
}

.indicator-evaluation-modal__grid {
  display: grid;
  gap: 0.9rem;
}

.indicator-evaluation-modal__grid--header {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.indicator-evaluation-modal__grid--numbers {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.indicator-evaluation-modal__grid--single {
  grid-template-columns: 1fr;
}

.indicator-evaluation-modal__field {
  display: grid;
  gap: 0.35rem;
}

.indicator-evaluation-modal__field--full {
  grid-column: 1 / -1;
}

.indicator-evaluation-modal__label {
  font-size: 0.74rem;
  color: rgb(var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.indicator-evaluation-modal__snapshot-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.9rem 1rem;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.03);
}

.indicator-evaluation-modal__block {
  display: grid;
  gap: 0.9rem;
  padding: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 1rem;
  background: rgba(15, 23, 42, 0.12);
}

.indicator-evaluation-modal__block-header {
  display: grid;
  gap: 0.2rem;
}

.indicator-evaluation-modal__block-title {
  margin: 0;
  font-weight: 600;
}

.indicator-evaluation-modal__block-copy {
  color: rgb(var(--muted));
  font-size: 0.84rem;
}

.indicator-evaluation-modal__selector {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
}

.indicator-evaluation-modal__selector-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.7rem 0.9rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.03);
  color: rgb(var(--text));
  transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
}

.indicator-evaluation-modal__selector-pill.is-active {
  border-color: rgba(15, 118, 110, 0.5);
  background: rgba(15, 118, 110, 0.12);
}

.indicator-evaluation-modal__selector-pill:hover {
  transform: translateY(-1px);
}

.indicator-evaluation-modal__toggle-grid {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.indicator-evaluation-modal__toggle-card {
  display: grid;
  gap: 0.85rem;
  padding: 0.95rem;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.03);
}

.indicator-evaluation-modal__toggle-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.indicator-evaluation-modal__toggle-title {
  margin: 0;
  font-weight: 600;
}

.indicator-evaluation-modal__toggle-copy {
  margin: 0.3rem 0 0;
  color: rgb(var(--muted));
  font-size: 0.82rem;
}

.indicator-evaluation-modal__evidence-box {
  display: grid;
  gap: 0.75rem;
}

.indicator-evaluation-modal__upload-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  padding: 0.55rem 0.8rem;
  border: 1px dashed rgba(148, 163, 184, 0.28);
  border-radius: 0.8rem;
  cursor: pointer;
}

.indicator-evaluation-modal__preview-frame {
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 0.9rem;
  min-height: 9rem;
}

.indicator-evaluation-modal__preview-image {
  width: 100%;
  height: 10rem;
  object-fit: cover;
}

.indicator-evaluation-modal__preview-name {
  margin: 0;
  color: rgb(var(--muted));
  font-size: 0.82rem;
}

.indicator-evaluation-modal__footer {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: flex-end;
  gap: 0.65rem;
}

@media (max-width: 980px) {
  .indicator-evaluation-modal__grid--header,
  .indicator-evaluation-modal__grid--numbers,
  .indicator-evaluation-modal__toggle-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 680px) {
  .indicator-evaluation-modal__grid--header,
  .indicator-evaluation-modal__grid--numbers,
  .indicator-evaluation-modal__toggle-grid {
    grid-template-columns: 1fr;
  }

  .indicator-evaluation-modal__toggle-head {
    flex-direction: column;
  }

  .indicator-evaluation-modal__footer {
    flex-direction: column-reverse;
    align-items: stretch;
  }
}
</style>