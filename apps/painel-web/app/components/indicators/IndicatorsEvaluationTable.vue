<script setup lang="ts">
import type {
  IndicatorExportRequest,
  IndicatorEvaluationRecord,
  IndicatorExportFormat,
  IndicatorUnitOption
} from '~/types/indicators'

const props = defineProps<{
  rows: IndicatorEvaluationRecord[]
  unitOptions: IndicatorUnitOption[]
}>()

const emit = defineEmits<{
  delete: [evaluationId: string | number]
  export: [payload: IndicatorExportRequest]
}>()

const selectedUnitId = ref('all')

const unitSelectItems = computed(() => {
  return [
    { label: 'Todas as lojas', value: 'all' },
    ...props.unitOptions.map((unit) => ({ label: unit.label, value: unit.id }))
  ]
})

const visibleRows = computed(() => {
  if (selectedUnitId.value === 'all') return props.rows
  return props.rows.filter((row) => row.unitId === selectedUnitId.value)
})

function formatShortDate(value: string) {
  const raw = String(value ?? '').trim()
  if (!raw) return '--'

  const parsed = new Date(`${raw}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return raw

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(parsed).replace(/\./g, '')
}
</script>

<template>
  <UCard class="indicators-evaluation-table" :ui="{ body: 'indicators-evaluation-table__body' }">
    <template #header>
      <div class="indicators-evaluation-table__header">
        <div>
          <p class="indicators-evaluation-table__eyebrow">Tabela de avaliacoes</p>
          <h2 class="indicators-evaluation-table__title">Indicadores Cadastrados</h2>
        </div>

        <UBadge color="neutral" variant="soft">
          {{ visibleRows.length }} registros
        </UBadge>
      </div>
    </template>

    <div class="indicators-evaluation-table__toolbar">
      <div class="indicators-evaluation-table__filter">
        <span class="indicators-evaluation-table__label">Loja</span>
        <USelect v-model="selectedUnitId" :items="unitSelectItems" />
      </div>

      <div class="indicators-evaluation-table__exports">
        <UButton
          size="xs"
          color="neutral"
          variant="soft"
          icon="i-lucide-file-spreadsheet"
          @click="emit('export', { format: 'csv', unitId: selectedUnitId })"
        >
          CSV
        </UButton>
        <UButton
          size="xs"
          color="neutral"
          variant="soft"
          icon="i-lucide-sheet"
          @click="emit('export', { format: 'xlsx', unitId: selectedUnitId })"
        >
          XLSX
        </UButton>
        <UButton
          size="xs"
          color="neutral"
          variant="soft"
          icon="i-lucide-file-text"
          @click="emit('export', { format: 'pdf', unitId: selectedUnitId })"
        >
          PDF
        </UButton>
      </div>
    </div>

    <div v-if="visibleRows.length > 0" class="indicators-evaluation-table__scroll">
      <table class="indicators-evaluation-table__table">
        <thead>
          <tr>
            <th>Avaliador</th>
            <th>Loja</th>
            <th>Indicadores</th>
            <th>Periodo inicio</th>
            <th>Periodo fim</th>
            <th class="is-actions">Acoes</th>
          </tr>
        </thead>

        <tbody>
          <tr v-for="row in visibleRows" :key="row.id">
            <td>{{ row.evaluatorName }}</td>
            <td>{{ row.unitName }}</td>
            <td>
              <div class="indicators-evaluation-table__badges">
                <UBadge
                  v-for="label in row.indicatorLabels"
                  :key="`${row.id}-${label}`"
                  color="primary"
                  variant="soft"
                >
                  {{ label }}
                </UBadge>
              </div>
            </td>
            <td>{{ formatShortDate(row.periodStart) }}</td>
            <td>{{ formatShortDate(row.periodEnd) }}</td>
            <td class="is-actions">
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                size="sm"
                aria-label="Excluir avaliacao"
                @click="emit('delete', row.id)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="indicators-evaluation-table__empty">
      Nenhuma avaliacao encontrada para o filtro atual.
    </div>
  </UCard>
</template>

<style scoped>
.indicators-evaluation-table {
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgb(var(--surface-2));
}

.indicators-evaluation-table__body {
  display: grid;
  gap: 1rem;
}

.indicators-evaluation-table__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.indicators-evaluation-table__eyebrow {
  margin: 0 0 0.35rem;
  font-size: 0.74rem;
  color: rgb(var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.indicators-evaluation-table__title {
  margin: 0;
  font-size: 1.05rem;
}

.indicators-evaluation-table__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
}

.indicators-evaluation-table__filter {
  display: grid;
  gap: 0.35rem;
  min-width: 16rem;
}

.indicators-evaluation-table__label {
  font-size: 0.72rem;
  color: rgb(var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.indicators-evaluation-table__exports {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.indicators-evaluation-table__scroll {
  overflow-x: auto;
}

.indicators-evaluation-table__table {
  width: 100%;
  min-width: 58rem;
  border-collapse: collapse;
}

.indicators-evaluation-table__table th,
.indicators-evaluation-table__table td {
  padding: 0.9rem 0.85rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  vertical-align: top;
  text-align: left;
}

.indicators-evaluation-table__table th {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgb(var(--muted));
}

.indicators-evaluation-table__table tbody tr:hover {
  background: rgba(255, 255, 255, 0.03);
}

.indicators-evaluation-table__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  max-width: 24rem;
}

.is-actions {
  width: 4.5rem;
  text-align: right;
}

.indicators-evaluation-table__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 9rem;
  border: 1px dashed rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  color: rgb(var(--muted));
  text-align: center;
}

@media (max-width: 720px) {
  .indicators-evaluation-table__filter {
    min-width: 100%;
  }

  .indicators-evaluation-table__exports {
    width: 100%;
  }
}
</style>