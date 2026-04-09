<script setup lang="ts">
import {
  UAlert,
  UBadge,
  UButton,
  UCard,
  UFormField,
  UInput,
  UModal,
  USelect
} from "#components";
import { computed, onBeforeUnmount, watch } from "vue";
import { useOmnichannelWhatsAppSession } from "~/composables/omnichannel/useOmnichannelWhatsAppSession";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (event: "update:open", value: boolean): void;
}>();

const {
  activate,
  canManageChannel,
  connectionAlertColor,
  connectionAlertDescription,
  connectionAlertTitle,
  connectionBadgeColor,
  connectionStateLabel,
  deactivate,
  disconnectSession,
  disconnecting,
  displayName,
  errorMessage,
  fetchingQr,
  generateQrCode,
  generatingQr,
  infoMessage,
  instanceItems,
  isCreatingNewInstance,
  loadingInstances,
  persistDisplayName,
  qrImageSrc,
  qrUnavailableMessage,
  savingDisplayName,
  selectInstance,
  selectedInstance,
  selectedInstanceKey
} = useOmnichannelWhatsAppSession();

const openModel = computed({
  get: () => props.open,
  set: (value: boolean) => emit("update:open", value)
});

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      await activate();
      return;
    }

    deactivate();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  deactivate();
});

async function handleClose() {
  openModel.value = false;
}

function normalizeSelectionValue(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.value === "string") {
      return record.value.trim();
    }
  }

  return "";
}

async function handleSelectionChange(value: unknown) {
  await selectInstance(normalizeSelectionValue(value));
}

async function handleDisplayNameBlur() {
  await persistDisplayName();
}
</script>

<template>
  <UModal
    v-model:open="openModel"
    title="Conexao WhatsApp"
    description="Gere o QR Code, acompanhe o status da sessao e desconecte quando precisar."
    :ui="{ content: 'max-w-3xl' }"
  >
    <template #body>
      <template v-if="!canManageChannel">
        <UAlert
          color="warning"
          variant="soft"
          title="Acesso restrito"
          description="Somente administradores podem gerenciar a conexao WhatsApp deste cliente."
        />
      </template>

      <div v-else class="whatsapp-session-modal">
        <div class="whatsapp-session-modal__status-card">
          <p class="whatsapp-session-modal__eyebrow">Canal principal do inbox</p>
          <div class="whatsapp-session-modal__status">
            <UBadge :color="connectionBadgeColor" variant="soft" size="sm">
              {{ connectionStateLabel }}
            </UBadge>
            <span class="whatsapp-session-modal__status-text">
              {{ selectedInstance?.displayName || selectedInstance?.phoneNumber || "Nova conexao" }}
            </span>
          </div>
        </div>

        <UAlert
          v-if="errorMessage"
          color="error"
          variant="soft"
          :title="errorMessage"
        />

        <UAlert
          v-if="infoMessage"
          color="success"
          variant="soft"
          :title="infoMessage"
        />

        <div class="whatsapp-session-modal__grid">
          <UCard class="whatsapp-session-modal__form-card">
            <div class="whatsapp-session-modal__form">
              <UFormField label="Conexao" name="instanceId">
                <USelect
                  :model-value="selectedInstanceKey"
                  :items="instanceItems"
                  value-key="value"
                  @update:model-value="handleSelectionChange"
                />
              </UFormField>

              <UFormField
                label="Nome visual"
                name="displayName"
                :help="
                  selectedInstance
                    ? 'Este nome aparece no painel e atualiza automaticamente ao sair do campo.'
                    : 'Opcional. Se vazio, usamos o nome do cliente como apelido da conexao.'
                "
              >
                <UInput
                  v-model="displayName"
                  placeholder="WhatsApp comercial"
                  :loading="savingDisplayName"
                  @blur="handleDisplayNameBlur"
                />
              </UFormField>

              <p class="whatsapp-session-modal__helper">
                O identificador tecnico da instancia e gerado automaticamente pelo shell e nao precisa aparecer para o cliente.
              </p>

              <UAlert
                :color="connectionAlertColor"
                variant="soft"
                :title="connectionAlertTitle"
                :description="connectionAlertDescription"
              />
            </div>
          </UCard>

          <UCard class="whatsapp-session-modal__qr-card">
            <div class="whatsapp-session-modal__qr-body">
              <template v-if="qrImageSrc">
                <img
                  :src="qrImageSrc"
                  alt="QR Code do WhatsApp"
                  class="whatsapp-session-modal__qr-image"
                >
                <p class="whatsapp-session-modal__qr-caption">
                  O QR atualiza sozinho quando expira enquanto este modal estiver aberto.
                </p>
              </template>

              <div v-else class="whatsapp-session-modal__qr-empty">
                <p class="whatsapp-session-modal__qr-placeholder">
                  {{ generatingQr || fetchingQr || loadingInstances ? "Preparando QR Code..." : qrUnavailableMessage }}
                </p>
                <p class="whatsapp-session-modal__qr-caption">
                  {{ isCreatingNewInstance ? "Crie a conexao principal do cliente com um clique." : "Se a sessao estiver offline, gere um novo QR Code." }}
                </p>
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="whatsapp-session-modal__footer">
        <UButton
          color="neutral"
          variant="ghost"
          @click="handleClose"
        >
          Fechar
        </UButton>
        <UButton
          v-if="canManageChannel"
          color="neutral"
          variant="outline"
          :loading="disconnecting"
          :disabled="disconnecting || !selectedInstance"
          @click="disconnectSession()"
        >
          Desconectar sessao
        </UButton>
        <UButton
          v-if="canManageChannel"
          color="primary"
          :loading="generatingQr"
          :disabled="generatingQr || fetchingQr || loadingInstances"
          @click="generateQrCode()"
        >
          Gerar QR Code
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.whatsapp-session-modal {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.whatsapp-session-modal__status-card {
  display: grid;
  gap: 0.35rem;
}

.whatsapp-session-modal__eyebrow {
  margin: 0 0 0.35rem;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
}

.whatsapp-session-modal__status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.whatsapp-session-modal__status-text {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--ui-text-highlighted);
}

.whatsapp-session-modal__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
  gap: 1rem;
}

.whatsapp-session-modal__form-card,
.whatsapp-session-modal__qr-card {
  min-height: 100%;
}

.whatsapp-session-modal__form,
.whatsapp-session-modal__qr-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.whatsapp-session-modal__helper {
  margin: -0.25rem 0 0;
  font-size: 0.8rem;
  color: var(--ui-text-muted);
}

.whatsapp-session-modal__qr-body {
  align-items: center;
  justify-content: center;
  min-height: 100%;
  text-align: center;
}

.whatsapp-session-modal__qr-image {
  width: min(100%, 280px);
  border-radius: 1rem;
  border: 1px solid var(--ui-border);
  background: #fff;
  padding: 0.75rem;
}

.whatsapp-session-modal__qr-empty {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.whatsapp-session-modal__qr-placeholder {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--ui-text-highlighted);
}

.whatsapp-session-modal__qr-caption {
  margin: 0;
  font-size: 0.85rem;
  color: var(--ui-text-muted);
}

.whatsapp-session-modal__footer {
  display: flex;
  width: 100%;
  justify-content: flex-end;
  gap: 0.5rem;
  flex-wrap: wrap;
}

@media (max-width: 900px) {
  .whatsapp-session-modal__grid {
    grid-template-columns: 1fr;
  }

  .whatsapp-session-modal__footer {
    width: 100%;
    flex-direction: column-reverse;
  }
}
</style>
