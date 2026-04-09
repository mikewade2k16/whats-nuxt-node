<script setup lang="ts">
import { ref } from 'vue'
import AppSelectField from '~/components/ui/AppSelectField.vue'
import SettingsConsultantManager from '~/components/fila-atendimento/SettingsConsultantManager.vue'
import SettingsOperationTemplateManager from '~/components/fila-atendimento/SettingsOperationTemplateManager.vue'
import SettingsOptionManager from '~/components/fila-atendimento/SettingsOptionManager.vue'
import SettingsProductManager from '~/components/fila-atendimento/SettingsProductManager.vue'
import SettingsTabs from '~/components/fila-atendimento/SettingsTabs.vue'
import type {
  FilaAtendimentoConsultantProfilePayload,
  FilaAtendimentoModalConfig,
  FilaAtendimentoOperationState,
  FilaAtendimentoSettingsAppSettings,
  FilaAtendimentoSettingsOptionGroup,
  FilaAtendimentoSettingsProductItem
} from '~/types/fila-atendimento'

const tabs = [
  { id: 'operacao', label: 'Operacao', icon: 'tune' },
  { id: 'modal', label: 'Modal', icon: 'edit_note' },
  { id: 'produtos', label: 'Produtos', icon: 'inventory_2' },
  { id: 'consultores', label: 'Consultores', icon: 'group' },
  { id: 'motivos', label: 'Motivos', icon: 'fact_check' },
  { id: 'motivos-perda', label: 'Perdas', icon: 'trending_down' },
  { id: 'motivos-fora-da-vez', label: 'Fora da vez', icon: 'bolt' },
  { id: 'origens', label: 'Origens', icon: 'share_location' },
  { id: 'profissoes', label: 'Profissoes', icon: 'badge' },
  { id: 'alertas', label: 'Alertas', icon: 'notifications_active' }
]

const fieldSelectionOptions = [
  { value: 'single', label: 'Escolha unica' },
  { value: 'multiple', label: 'Multiplas escolhas' }
]

const fieldDetailModeOptions = [
  { value: 'off', label: 'Sem descricao' },
  { value: 'shared', label: 'Uma descricao para a selecao' },
  { value: 'per-item', label: 'Uma descricao por opcao' }
]

defineProps<{
  state: FilaAtendimentoOperationState
  canManage: boolean
  canManageConsultants: boolean
  busy: boolean
}>()

const emit = defineEmits<{
  'update-operation': [patch: Partial<FilaAtendimentoSettingsAppSettings>]
  'apply-template': [templateId: string]
  'update-modal-config': [patch: Partial<FilaAtendimentoModalConfig>]
  'add-option': [group: FilaAtendimentoSettingsOptionGroup, label: string]
  'update-option': [group: FilaAtendimentoSettingsOptionGroup, optionId: string, label: string]
  'remove-option': [group: FilaAtendimentoSettingsOptionGroup, optionId: string]
  'add-product': [payload: { name: string; category: string; basePrice: number; code: string }]
  'update-product': [productId: string, payload: Partial<FilaAtendimentoSettingsProductItem>]
  'remove-product': [productId: string]
  'add-consultant': [payload: Partial<FilaAtendimentoConsultantProfilePayload>]
  'update-consultant': [consultantId: string, payload: Partial<FilaAtendimentoConsultantProfilePayload>]
  'archive-consultant': [consultantId: string]
}>()

const activeTab = ref('operacao')

function updateNumericSetting(settingId: keyof FilaAtendimentoSettingsAppSettings, value: unknown) {
  emit('update-operation', { [settingId]: Number(value) || 0 } as Partial<FilaAtendimentoSettingsAppSettings>)
}

function updateBooleanSetting(settingId: keyof FilaAtendimentoSettingsAppSettings, value: unknown) {
  emit('update-operation', { [settingId]: Boolean(value) } as Partial<FilaAtendimentoSettingsAppSettings>)
}

function updateModalConfigValue(configKey: keyof FilaAtendimentoModalConfig, value: unknown) {
  emit('update-modal-config', { [configKey]: value } as Partial<FilaAtendimentoModalConfig>)
}
</script>

<template>
  <section class="admin-panel" data-testid="settings-panel">
    <header class="admin-panel__header">
      <h2 class="admin-panel__title">Configuracoes</h2>
    </header>

    <SettingsTabs :tabs="tabs" :active-tab="activeTab" @update:active-tab="activeTab = $event" />

    <div v-if="activeTab === 'operacao'">
      <SettingsOperationTemplateManager
        :templates="state.operationTemplates || []"
        :selected-operation-template-id="state.selectedOperationTemplateId"
        :disabled="!canManage || busy"
        @apply="emit('apply-template', $event)"
      />

      <div class="settings-grid" style="margin-top: 16px;">
        <article class="settings-card">
          <header class="settings-card__header">
            <h3 class="settings-card__title">Limites e timings</h3>
          </header>
          <label class="settings-field"><span>Atendimentos simultaneos</span><input :value="Number(state.settings.maxConcurrentServices || 10)" type="number" min="1" max="100" :disabled="!canManage || busy" @change="updateNumericSetting('maxConcurrentServices', ($event.target as HTMLInputElement).value)"></label>
          <label class="settings-field"><span>Fechamento rapido (min)</span><input :value="Number(state.settings.timingFastCloseMinutes || 5)" type="number" min="1" max="120" :disabled="!canManage || busy" @change="updateNumericSetting('timingFastCloseMinutes', ($event.target as HTMLInputElement).value)"></label>
          <label class="settings-field"><span>Atendimento demorado (min)</span><input :value="Number(state.settings.timingLongServiceMinutes || 25)" type="number" min="1" max="240" :disabled="!canManage || busy" @change="updateNumericSetting('timingLongServiceMinutes', ($event.target as HTMLInputElement).value)"></label>
          <label class="settings-field"><span>Venda baixa (R$)</span><input :value="Number(state.settings.timingLowSaleAmount || 1200)" type="number" min="1" step="1" :disabled="!canManage || busy" @change="updateNumericSetting('timingLowSaleAmount', ($event.target as HTMLInputElement).value)"></label>
          <label class="settings-toggle"><input :checked="Boolean(state.settings.testModeEnabled)" type="checkbox" :disabled="!canManage || busy" @change="updateBooleanSetting('testModeEnabled', ($event.target as HTMLInputElement).checked)"><span>Modo teste</span></label>
          <label class="settings-toggle"><input :checked="Boolean(state.settings.autoFillFinishModal)" type="checkbox" :disabled="!canManage || busy" @change="updateBooleanSetting('autoFillFinishModal', ($event.target as HTMLInputElement).checked)"><span>Preencher modal automaticamente</span></label>
        </article>
      </div>
    </div>

    <div v-if="activeTab === 'modal'" class="settings-grid">
      <article class="settings-card">
        <header class="settings-card__header"><h3 class="settings-card__title">Textos</h3></header>
        <label class="settings-field"><span>Titulo do modal</span><input :value="state.modalConfig.title" type="text" :disabled="!canManage || busy" @change="updateModalConfigValue('title', ($event.target as HTMLInputElement).value)"></label>
        <label class="settings-field"><span>Label da secao de cliente</span><input :value="state.modalConfig.customerSectionLabel" type="text" :disabled="!canManage || busy" @change="updateModalConfigValue('customerSectionLabel', ($event.target as HTMLInputElement).value)"></label>
        <label class="settings-field"><span>Label observacoes</span><input :value="state.modalConfig.notesLabel" type="text" :disabled="!canManage || busy" @change="updateModalConfigValue('notesLabel', ($event.target as HTMLInputElement).value)"></label>
        <label class="settings-field"><span>Placeholder observacoes</span><input :value="state.modalConfig.notesPlaceholder" type="text" :disabled="!canManage || busy" @change="updateModalConfigValue('notesPlaceholder', ($event.target as HTMLInputElement).value)"></label>
        <label class="settings-field"><span>Label motivo fora da vez</span><input :value="state.modalConfig.queueJumpReasonLabel" type="text" :disabled="!canManage || busy" @change="updateModalConfigValue('queueJumpReasonLabel', ($event.target as HTMLInputElement).value)"></label>
        <label class="settings-field"><span>Placeholder busca motivo fora da vez</span><input :value="state.modalConfig.queueJumpReasonPlaceholder" type="text" :disabled="!canManage || busy" @change="updateModalConfigValue('queueJumpReasonPlaceholder', ($event.target as HTMLInputElement).value)"></label>
        <label class="settings-field"><span>Label motivo da perda</span><input :value="state.modalConfig.lossReasonLabel" type="text" :disabled="!canManage || busy" @change="updateModalConfigValue('lossReasonLabel', ($event.target as HTMLInputElement).value)"></label>
        <label class="settings-field"><span>Placeholder busca motivo da perda</span><input :value="state.modalConfig.lossReasonPlaceholder" type="text" :disabled="!canManage || busy" @change="updateModalConfigValue('lossReasonPlaceholder', ($event.target as HTMLInputElement).value)"></label>
        <label class="settings-field"><span>Label produto visto</span><input :value="state.modalConfig.productSeenLabel" type="text" :disabled="!canManage || busy" @change="updateModalConfigValue('productSeenLabel', ($event.target as HTMLInputElement).value)"></label>
        <label class="settings-field"><span>Placeholder produto visto</span><input :value="state.modalConfig.productSeenPlaceholder" type="text" :disabled="!canManage || busy" @change="updateModalConfigValue('productSeenPlaceholder', ($event.target as HTMLInputElement).value)"></label>
        <label class="settings-field"><span>Label produto fechado</span><input :value="state.modalConfig.productClosedLabel" type="text" :disabled="!canManage || busy" @change="updateModalConfigValue('productClosedLabel', ($event.target as HTMLInputElement).value)"></label>
        <label class="settings-field"><span>Placeholder produto fechado</span><input :value="state.modalConfig.productClosedPlaceholder" type="text" :disabled="!canManage || busy" @change="updateModalConfigValue('productClosedPlaceholder', ($event.target as HTMLInputElement).value)"></label>
      </article>

      <article class="settings-card">
        <header class="settings-card__header"><h3 class="settings-card__title">Campos e validacoes</h3></header>
        <label class="settings-toggle"><input :checked="Boolean(state.modalConfig.showEmailField)" type="checkbox" :disabled="!canManage || busy" @change="updateModalConfigValue('showEmailField', ($event.target as HTMLInputElement).checked)"><span>Mostrar email</span></label>
        <label class="settings-toggle"><input :checked="Boolean(state.modalConfig.showProfessionField)" type="checkbox" :disabled="!canManage || busy" @change="updateModalConfigValue('showProfessionField', ($event.target as HTMLInputElement).checked)"><span>Mostrar profissao</span></label>
        <label class="settings-toggle"><input :checked="Boolean(state.modalConfig.showNotesField)" type="checkbox" :disabled="!canManage || busy" @change="updateModalConfigValue('showNotesField', ($event.target as HTMLInputElement).checked)"><span>Mostrar observacoes</span></label>
        <label class="settings-toggle"><input :checked="Boolean(state.modalConfig.requireProduct)" type="checkbox" :disabled="!canManage || busy" @change="updateModalConfigValue('requireProduct', ($event.target as HTMLInputElement).checked)"><span>Exigir produto</span></label>
        <label class="settings-toggle"><input :checked="Boolean(state.modalConfig.requireVisitReason)" type="checkbox" :disabled="!canManage || busy" @change="updateModalConfigValue('requireVisitReason', ($event.target as HTMLInputElement).checked)"><span>Exigir motivo da visita</span></label>
        <label class="settings-toggle"><input :checked="Boolean(state.modalConfig.requireCustomerSource)" type="checkbox" :disabled="!canManage || busy" @change="updateModalConfigValue('requireCustomerSource', ($event.target as HTMLInputElement).checked)"><span>Exigir origem do cliente</span></label>
        <label class="settings-toggle"><input :checked="Boolean(state.modalConfig.requireCustomerNamePhone)" type="checkbox" :disabled="!canManage || busy" @change="updateModalConfigValue('requireCustomerNamePhone', ($event.target as HTMLInputElement).checked)"><span>Exigir nome e telefone</span></label>
      </article>
    </div>

    <div v-if="activeTab === 'produtos'">
      <SettingsProductManager
        :products="state.productCatalog || []"
        :disabled="!canManage || busy"
        @add="emit('add-product', $event)"
        @update="(productId, payload) => emit('update-product', productId, payload)"
        @remove="emit('remove-product', $event)"
      />
    </div>

    <div v-if="activeTab === 'consultores'">
      <SettingsConsultantManager
        :consultants="state.roster || []"
        :disabled="!canManageConsultants || busy"
        @add="emit('add-consultant', $event)"
        @update="(consultantId, payload) => emit('update-consultant', consultantId, payload)"
        @archive="emit('archive-consultant', $event)"
      />
    </div>

    <div v-if="activeTab === 'motivos'" class="settings-grid">
      <article class="settings-card">
        <header class="settings-card__header">
          <h3 class="settings-card__title">Comportamento do campo</h3>
          <p class="settings-card__text">Defina aqui como o campo aparece no modal antes de cadastrar as opcoes.</p>
        </header>
        <AppSelectField class="settings-field" label="Selecao" :model-value="state.modalConfig.visitReasonSelectionMode || 'multiple'" :options="fieldSelectionOptions" :disabled="!canManage || busy" @update:model-value="updateModalConfigValue('visitReasonSelectionMode', $event)" />
        <AppSelectField class="settings-field" label="Descricao" :model-value="state.modalConfig.visitReasonDetailMode || 'shared'" :options="fieldDetailModeOptions" :disabled="!canManage || busy" @update:model-value="updateModalConfigValue('visitReasonDetailMode', $event)" />
      </article>

      <SettingsOptionManager
        title="Motivo da visita"
        description="Opcoes exibidas no modal de fechamento."
        :items="state.visitReasonOptions || []"
        add-placeholder="Adicionar nova opcao"
        testid="settings-motivos"
        :disabled="!canManage || busy"
        @add="emit('add-option', 'visit-reasons', $event)"
        @update="(optionId, label) => emit('update-option', 'visit-reasons', optionId, label)"
        @remove="emit('remove-option', 'visit-reasons', $event)"
      />
    </div>

    <div v-if="activeTab === 'motivos-fora-da-vez'">
      <SettingsOptionManager
        title="Motivo fora da vez"
        description="Opcoes obrigatorias exibidas quando o atendimento for encerrado fora da vez."
        :items="state.queueJumpReasonOptions || []"
        add-placeholder="Adicionar novo motivo fora da vez"
        testid="settings-fora-da-vez"
        :disabled="!canManage || busy"
        @add="emit('add-option', 'queue-jump-reasons', $event)"
        @update="(optionId, label) => emit('update-option', 'queue-jump-reasons', optionId, label)"
        @remove="emit('remove-option', 'queue-jump-reasons', $event)"
      />
    </div>

    <div v-if="activeTab === 'motivos-perda'" class="settings-grid">
      <article class="settings-card">
        <header class="settings-card__header">
          <h3 class="settings-card__title">Comportamento do campo</h3>
          <p class="settings-card__text">Defina aqui como o campo aparece quando o atendimento termina sem venda.</p>
        </header>
        <AppSelectField class="settings-field" label="Selecao" :model-value="state.modalConfig.lossReasonSelectionMode || 'single'" :options="fieldSelectionOptions" :disabled="!canManage || busy" @update:model-value="updateModalConfigValue('lossReasonSelectionMode', $event)" />
        <AppSelectField class="settings-field" label="Descricao" :model-value="state.modalConfig.lossReasonDetailMode || 'off'" :options="fieldDetailModeOptions" :disabled="!canManage || busy" @update:model-value="updateModalConfigValue('lossReasonDetailMode', $event)" />
      </article>

      <SettingsOptionManager
        title="Motivo da perda"
        description="Opcoes exibidas quando o atendimento termina sem venda."
        :items="state.lossReasonOptions || []"
        add-placeholder="Adicionar novo motivo da perda"
        testid="settings-motivos-perda"
        :disabled="!canManage || busy"
        @add="emit('add-option', 'loss-reasons', $event)"
        @update="(optionId, label) => emit('update-option', 'loss-reasons', optionId, label)"
        @remove="emit('remove-option', 'loss-reasons', $event)"
      />
    </div>

    <div v-if="activeTab === 'origens'" class="settings-grid">
      <article class="settings-card">
        <header class="settings-card__header">
          <h3 class="settings-card__title">Comportamento do campo</h3>
          <p class="settings-card__text">Defina aqui como o campo aparece no modal antes de cadastrar as opcoes.</p>
        </header>
        <AppSelectField class="settings-field" label="Selecao" :model-value="state.modalConfig.customerSourceSelectionMode || 'single'" :options="fieldSelectionOptions" :disabled="!canManage || busy" @update:model-value="updateModalConfigValue('customerSourceSelectionMode', $event)" />
        <AppSelectField class="settings-field" label="Descricao" :model-value="state.modalConfig.customerSourceDetailMode || 'shared'" :options="fieldDetailModeOptions" :disabled="!canManage || busy" @update:model-value="updateModalConfigValue('customerSourceDetailMode', $event)" />
      </article>

      <SettingsOptionManager
        title="Origem do cliente"
        description="Opcoes exibidas no modal de fechamento."
        :items="state.customerSourceOptions || []"
        add-placeholder="Adicionar nova opcao"
        testid="settings-origens"
        :disabled="!canManage || busy"
        @add="emit('add-option', 'customer-sources', $event)"
        @update="(optionId, label) => emit('update-option', 'customer-sources', optionId, label)"
        @remove="emit('remove-option', 'customer-sources', $event)"
      />
    </div>

    <div v-if="activeTab === 'profissoes'">
      <SettingsOptionManager
        title="Profissoes"
        description="Lista usada no modal. Se nao existir, tambem pode cadastrar na hora no fechamento."
        :items="state.professionOptions || []"
        add-placeholder="Adicionar nova profissao"
        testid="settings-profissoes"
        :disabled="!canManage || busy"
        @add="emit('add-option', 'professions', $event)"
        @update="(optionId, label) => emit('update-option', 'professions', optionId, label)"
        @remove="emit('remove-option', 'professions', $event)"
      />
    </div>

    <div v-if="activeTab === 'alertas'" class="settings-grid">
      <article class="settings-card">
        <header class="settings-card__header">
          <h3 class="settings-card__title">Limites de desempenho</h3>
          <p class="settings-card__text">
            Consultores que ficarem abaixo (ou acima) desses limites no mes atual aparecem como alertas em /ranking.
            Deixe em 0 para desativar.
          </p>
        </header>
        <label class="settings-field"><span>Conversao minima (%)</span><input :value="Number(state.settings.alertMinConversionRate || 0)" type="number" min="0" max="100" step="1" :disabled="!canManage || busy" @change="updateNumericSetting('alertMinConversionRate', ($event.target as HTMLInputElement).value)"></label>
        <label class="settings-field"><span>Fora da vez maximo (%)</span><input :value="Number(state.settings.alertMaxQueueJumpRate || 0)" type="number" min="0" max="100" step="1" :disabled="!canManage || busy" @change="updateNumericSetting('alertMaxQueueJumpRate', ($event.target as HTMLInputElement).value)"></label>
        <label class="settings-field"><span>P.A. minimo</span><input :value="Number(state.settings.alertMinPaScore || 0)" type="number" min="0" step="0.1" :disabled="!canManage || busy" @change="updateNumericSetting('alertMinPaScore', ($event.target as HTMLInputElement).value)"></label>
        <label class="settings-field"><span>Ticket medio minimo (R$)</span><input :value="Number(state.settings.alertMinTicketAverage || 0)" type="number" min="0" step="100" :disabled="!canManage || busy" @change="updateNumericSetting('alertMinTicketAverage', ($event.target as HTMLInputElement).value)"></label>
      </article>
    </div>
  </section>
</template>