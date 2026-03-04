<script setup lang="ts">
import { computed } from "vue";
import {
  UAlert,
  UBadge,
  UButton,
  UCard,
  UFormField,
  UInput,
  USelect,
  USeparator
} from "#components";
import { useOmnichannelAdmin } from "~/composables/omnichannel/useOmnichannelAdmin";

const {
  user,
  loading,
  loadingClients,
  savingTenant,
  savingUser,
  savingClient,
  bootstrapping,
  connectingQr,
  connectingPairing,
  disconnectingWhatsApp,
  refreshingStatus,
  fetchingQr,
  loadingFailures,
  validatingEndpoints,
  tenant,
  clients,
  users,
  statusResult,
  bootstrapResult,
  qrResult,
  failuresDashboard,
  endpointValidation,
  infoMessage,
  errorMessage,
  pairingCode,
  failureWindowDays,
  tenantForm,
  tenantFieldErrors,
  clientForm,
  clientFieldErrors,
  userForm,
  userFieldErrors,
  whatsappForm,
  roleItems,
  canManageTenant,
  connectionState,
  connectionStateLabel,
  connectionBadgeColor,
  connectionAlertColor,
  connectionAlertTitle,
  connectionAlertDescription,
  qrImageSrc,
  hasQrCode,
  qrUnavailableMessage,
  saveTenant,
  deletingClientId,
  editingClientId,
  selectedClientId,
  selectedClient,
  deletingUserId,
  editingUserId,
  resetClientForm,
  startEditClient,
  saveClient,
  deleteClient,
  selectClient,
  resetUserForm,
  startEditUser,
  saveUser,
  deleteUser,
  refreshWhatsAppStatus,
  fetchQrCode,
  bootstrapWhatsApp,
  connectWithQr,
  disconnectWhatsAppSession,
  generatePairingCode,
  loadFailuresDashboard,
  validateEvolutionEndpoints
} = useOmnichannelAdmin();

const clientItems = computed(() =>
  clients.value.map((client) => ({
    label: client.name,
    value: client.id
  }))
);

const failureWindowItems = [
  { label: "1 dia", value: 1 },
  { label: "7 dias", value: 7 },
  { label: "15 dias", value: 15 },
  { label: "30 dias", value: 30 }
];

function formatMessageTypeLabel(type: string) {
  if (type === "TEXT") return "Texto";
  if (type === "IMAGE") return "Imagem";
  if (type === "VIDEO") return "Video";
  if (type === "AUDIO") return "Audio";
  if (type === "DOCUMENT") return "Documento";
  return type;
}

function formatEndpointStatusLabel(status: string) {
  if (status === "ok") return "Disponivel";
  if (status === "validation_error") return "Disponivel (validacao)";
  if (status === "missing_route") return "Rota ausente";
  if (status === "auth_error") return "Erro autenticacao";
  if (status === "provider_error") return "Erro provider";
  if (status === "network_error") return "Erro rede";
  return "Erro inesperado";
}

function endpointStatusColor(status: string) {
  if (status === "ok" || status === "validation_error") return "success";
  if (status === "provider_error" || status === "network_error") return "warning";
  return "error";
}
</script>
<template>
  <div class="admin-console">
    <div class="admin-console__header">
      <div class="admin-console__headline">
        <h1 class="admin-console__title">Admin de Operacao</h1>
        <p class="admin-console__subtitle">
          Cliente <strong>{{ user?.tenantSlug }}</strong> | Fluxo de conexao WhatsApp por QR
        </p>
      </div>
      <div class="admin-console__header-actions">
        <UButton to="/docs" color="neutral" variant="ghost">
          Docs
        </UButton>
        <UButton to="/" color="neutral" variant="outline">
          Voltar para Inbox
        </UButton>
      </div>
    </div>

    <UAlert v-if="errorMessage" color="error" variant="soft" :title="errorMessage" />
    <UAlert v-if="infoMessage" color="primary" variant="soft" :title="infoMessage" />
    <UAlert
      v-if="statusResult"
      :color="connectionAlertColor"
      variant="soft"
      :title="connectionAlertTitle"
      :description="connectionAlertDescription"
    />
    <UAlert
      v-if="!canManageTenant"
      color="warning"
      variant="soft"
      title="Modo somente leitura"
      description="Seu perfil pode acompanhar indicadores e status, mas nao pode alterar configuracoes."
    />

    <div v-if="loading" class="admin-console__loading">
      Carregando configuracoes...
    </div>

    <template v-else>
      <UCard>
        <template #header>
          <div class="admin-card__header">
            <h2 class="admin-card__title">Cliente atual</h2>
            <UBadge :color="connectionBadgeColor" variant="soft">
              {{ connectionStateLabel }}
            </UBadge>
          </div>
        </template>

        <form class="tenant-form" @submit.prevent="saveTenant">
          <UFormField label="Nome da empresa">
            <UInput v-model="tenantForm.name" :disabled="!canManageTenant" placeholder="Empresa X" />
            <p v-if="tenantFieldErrors.name" class="admin-field-error">{{ tenantFieldErrors.name }}</p>
          </UFormField>

          <UFormField label="Instancia WhatsApp">
            <UInput v-model="tenantForm.whatsappInstance" :disabled="!canManageTenant" placeholder="demo-instance" />
            <p v-if="tenantFieldErrors.whatsappInstance" class="admin-field-error">{{ tenantFieldErrors.whatsappInstance }}</p>
          </UFormField>

          <UFormField label="Evolution API Key (opcional por tenant)">
            <UInput v-model="tenantForm.evolutionApiKey" :disabled="!canManageTenant" placeholder="apikey-tenant" />
            <p v-if="tenantFieldErrors.evolutionApiKey" class="admin-field-error">{{ tenantFieldErrors.evolutionApiKey }}</p>
          </UFormField>

          <UFormField label="Max canais">
            <UInput v-model.number="tenantForm.maxChannels" :disabled="!canManageTenant" type="number" min="0" max="50" />
            <p v-if="tenantFieldErrors.maxChannels" class="admin-field-error">{{ tenantFieldErrors.maxChannels }}</p>
          </UFormField>

          <UFormField label="Max usuarios">
            <UInput v-model.number="tenantForm.maxUsers" :disabled="!canManageTenant" type="number" min="1" max="500" />
            <p v-if="tenantFieldErrors.maxUsers" class="admin-field-error">{{ tenantFieldErrors.maxUsers }}</p>
          </UFormField>

          <UFormField label="Retencao (dias)">
            <UInput v-model.number="tenantForm.retentionDays" :disabled="!canManageTenant" type="number" min="1" max="3650" />
            <p v-if="tenantFieldErrors.retentionDays" class="admin-field-error">{{ tenantFieldErrors.retentionDays }}</p>
          </UFormField>

          <UFormField label="Limite upload por arquivo (MB)">
            <UInput v-model.number="tenantForm.maxUploadMb" :disabled="!canManageTenant" type="number" min="1" max="2048" />
            <p v-if="tenantFieldErrors.maxUploadMb" class="admin-field-error">{{ tenantFieldErrors.maxUploadMb }}</p>
          </UFormField>

          <div class="tenant-form__footer">
            <p class="tenant-form__hint">
              Uso atual: <strong>{{ tenant?.currentChannels ?? 0 }}</strong>/<strong>{{ tenant?.maxChannels ?? 0 }}</strong> canais,
              <strong>{{ tenant?.currentUsers ?? 0 }}</strong>/<strong>{{ tenant?.maxUsers ?? 0 }}</strong> usuarios.
              Limite de upload: <strong>{{ tenant?.maxUploadMb ?? 500 }}MB</strong> por arquivo.
              <br>
              Webhook: <code>{{ tenant?.webhookUrl }}</code>
            </p>
            <UButton type="submit" :loading="savingTenant" :disabled="!canManageTenant">Salvar cliente</UButton>
          </div>
        </form>
      </UCard>

      <UCard v-if="canManageTenant">
        <template #header>
          <div class="admin-card__header">
            <h2 class="admin-card__title">Clientes</h2>
            <div class="admin-actions-row">
              <UBadge color="neutral" variant="soft">
                {{ clients.length }} clientes
              </UBadge>
              <UButton color="neutral" variant="soft" @click="resetClientForm">
                Novo cliente
              </UButton>
            </div>
          </div>
        </template>

        <form class="tenant-form" @submit.prevent="saveClient">
          <UFormField label="Slug (opcional)">
            <UInput v-model="clientForm.slug" placeholder="cliente-demo" />
            <p v-if="clientFieldErrors.slug" class="admin-field-error">{{ clientFieldErrors.slug }}</p>
          </UFormField>

          <UFormField label="Nome do cliente">
            <UInput v-model="clientForm.name" placeholder="Empresa Demo" />
            <p v-if="clientFieldErrors.name" class="admin-field-error">{{ clientFieldErrors.name }}</p>
          </UFormField>

          <UFormField label="Evolution API Key (opcional)">
            <UInput v-model="clientForm.evolutionApiKey" placeholder="apikey-cliente" />
            <p v-if="clientFieldErrors.evolutionApiKey" class="admin-field-error">{{ clientFieldErrors.evolutionApiKey }}</p>
          </UFormField>

          <UFormField label="Max canais WhatsApp">
            <UInput v-model.number="clientForm.maxChannels" type="number" min="1" max="50" />
            <p v-if="clientFieldErrors.maxChannels" class="admin-field-error">{{ clientFieldErrors.maxChannels }}</p>
          </UFormField>

          <UFormField label="Max usuarios">
            <UInput v-model.number="clientForm.maxUsers" type="number" min="1" max="500" />
            <p v-if="clientFieldErrors.maxUsers" class="admin-field-error">{{ clientFieldErrors.maxUsers }}</p>
          </UFormField>

          <UFormField label="Retencao (dias)">
            <UInput v-model.number="clientForm.retentionDays" type="number" min="1" max="3650" />
            <p v-if="clientFieldErrors.retentionDays" class="admin-field-error">{{ clientFieldErrors.retentionDays }}</p>
          </UFormField>

          <UFormField label="Limite upload por arquivo (MB)">
            <UInput v-model.number="clientForm.maxUploadMb" type="number" min="1" max="2048" />
            <p v-if="clientFieldErrors.maxUploadMb" class="admin-field-error">{{ clientFieldErrors.maxUploadMb }}</p>
          </UFormField>

          <template v-if="!editingClientId">
            <UFormField label="Nome do admin inicial">
              <UInput v-model="clientForm.adminName" placeholder="Admin do cliente" />
              <p v-if="clientFieldErrors.adminName" class="admin-field-error">{{ clientFieldErrors.adminName }}</p>
            </UFormField>

            <UFormField label="Email do admin inicial">
              <UInput v-model="clientForm.adminEmail" type="email" placeholder="admin@cliente.com" />
              <p v-if="clientFieldErrors.adminEmail" class="admin-field-error">{{ clientFieldErrors.adminEmail }}</p>
            </UFormField>

            <UFormField label="Senha do admin inicial">
              <UInput v-model="clientForm.adminPassword" type="password" placeholder="******" />
              <p v-if="clientFieldErrors.adminPassword" class="admin-field-error">{{ clientFieldErrors.adminPassword }}</p>
            </UFormField>
          </template>

          <div class="tenant-form__footer">
            <p class="tenant-form__hint">
              Cada cliente pode ter um ou mais numeros de WhatsApp. Hoje o limite operacional usa
              <strong>maxChannels</strong>; a modelagem de multiplos canais por cliente ainda e o proximo passo no banco.
            </p>
            <div class="admin-actions-row">
              <UButton type="submit" :loading="savingClient">
                {{ editingClientId ? "Salvar cliente" : "Criar cliente" }}
              </UButton>
              <UButton v-if="editingClientId" type="button" color="neutral" variant="soft" @click="resetClientForm">
                Cancelar edicao
              </UButton>
            </div>
          </div>
        </form>

        <div class="users-table-wrap">
          <div v-if="loadingClients" class="admin-console__loading">
            Carregando clientes...
          </div>
          <table v-else class="users-table">
            <thead>
              <tr class="users-table__row users-table__row--head">
                <th class="users-table__cell users-table__cell--head">Cliente</th>
                <th class="users-table__cell users-table__cell--head">Slug</th>
                <th class="users-table__cell users-table__cell--head">Canais</th>
                <th class="users-table__cell users-table__cell--head">Usuarios</th>
                <th class="users-table__cell users-table__cell--head">Acoes</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="client in clients" :key="client.id" class="users-table__row">
                <td class="users-table__cell">{{ client.name }}</td>
                <td class="users-table__cell">{{ client.slug }}</td>
                <td class="users-table__cell">{{ client.currentChannels }}/{{ client.maxChannels }}</td>
                <td class="users-table__cell">{{ client.currentUsers }}/{{ client.maxUsers }}</td>
                <td class="users-table__cell">
                  <div class="admin-actions-row">
                    <UButton color="neutral" variant="soft" @click="selectClient(client.id)">
                      Gerenciar usuarios
                    </UButton>
                    <UButton color="neutral" variant="soft" @click="startEditClient(client)">
                      Editar
                    </UButton>
                    <UButton
                      color="error"
                      variant="soft"
                      :loading="deletingClientId === client.id"
                      @click="deleteClient(client.id)"
                    >
                      Excluir
                    </UButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="admin-card__title">Conexao WhatsApp</h2>
        </template>

        <UAlert
          class="admin-card__status-alert"
          :color="connectionAlertColor"
          variant="soft"
          :title="connectionAlertTitle"
          :description="connectionAlertDescription"
        />

        <div class="admin-grid-two">
          <div class="admin-stack">
            <UAlert
              color="neutral"
              variant="soft"
              title="Fluxo recomendado"
              description="Use Bootstrap uma vez e depois Conectar por QR sempre que precisar."
            />

            <UFormField label="Instance name">
              <UInput v-model="whatsappForm.instanceName" :disabled="!canManageTenant" placeholder="demo-instance" />
            </UFormField>

            <div class="admin-actions-row">
              <UButton :loading="bootstrapping" :disabled="!canManageTenant" @click="bootstrapWhatsApp">
                Bootstrap
              </UButton>
              <UButton :loading="connectingQr" :disabled="!canManageTenant" color="primary" variant="outline" @click="connectWithQr">
                Conectar por QR
              </UButton>
              <UButton
                :loading="disconnectingWhatsApp"
                :disabled="!canManageTenant"
                color="warning"
                variant="soft"
                @click="disconnectWhatsAppSession"
              >
                Desconectar sessao
              </UButton>
              <UButton
                :loading="refreshingStatus"
                color="neutral"
                variant="soft"
                @click="refreshWhatsAppStatus()"
              >
                Atualizar status
              </UButton>
              <UButton
                :loading="fetchingQr"
                color="neutral"
                variant="soft"
                @click="fetchQrCode({ force: true })"
              >
                Atualizar QR
              </UButton>
            </div>

            <USeparator label="Opcional: Pairing Code" />

            <UFormField label="Numero para pairing code (opcional)">
              <UInput v-model="whatsappForm.number" :disabled="!canManageTenant" placeholder="5511999999999" />
            </UFormField>

            <div class="admin-actions-row admin-actions-row--align-center">
              <UButton
                :loading="connectingPairing"
                :disabled="!canManageTenant"
                color="neutral"
                variant="outline"
                @click="generatePairingCode"
              >
                Gerar pairing code
              </UButton>
              <UBadge v-if="pairingCode" color="warning" variant="subtle">
                Codigo: {{ pairingCode }}
              </UBadge>
            </div>
          </div>

          <UCard class="qr-panel">
            <template #header>
              <div class="admin-card__header">
                <h3 class="admin-card__title">QR Code Atual</h3>
                <UBadge color="neutral" variant="soft">
                  {{ qrResult?.source || "pending" }}
                </UBadge>
              </div>
            </template>

            <div class="qr-stage">
              <img
                v-if="qrImageSrc"
                :src="qrImageSrc"
                alt="QR Code WhatsApp"
                class="qr-image"
              />
              <div v-else class="qr-empty">
                {{ qrUnavailableMessage }}
              </div>
            </div>

            <template #footer>
              <p class="qr-hint">
                Estado atual: <strong>{{ connectionStateLabel }}</strong> (<code>{{ connectionState }}</code>).
                <span v-if="hasQrCode">
                  Escaneie o QR no app WhatsApp.
                </span>
                <span v-else>
                  Se estiver <code>open</code>, use <strong>Desconectar sessao</strong> para gerar um novo QR.
                </span>
              </p>
            </template>
          </UCard>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="admin-card__header">
            <h2 class="admin-card__title">Validacao de endpoints Evolution</h2>
            <div class="admin-actions-row admin-actions-row--align-center">
              <UBadge v-if="endpointValidation" color="neutral" variant="soft">
                {{ endpointValidation.summary.available }}/{{ endpointValidation.summary.total }} disponiveis
              </UBadge>
              <UButton
                color="neutral"
                variant="soft"
                :loading="validatingEndpoints"
                @click="validateEvolutionEndpoints()"
              >
                Validar endpoints
              </UButton>
            </div>
          </div>
        </template>

        <div v-if="validatingEndpoints" class="admin-console__loading">
          Validando endpoints da Evolution...
        </div>
        <div v-else-if="!endpointValidation" class="admin-console__loading">
          Nenhuma validacao executada ainda.
        </div>
        <template v-else>
          <p class="tenant-form__hint">
            Base: <code>{{ endpointValidation.baseUrl }}</code> |
            Instancia: <code>{{ endpointValidation.instanceName }}</code> |
            Timeout: <code>{{ endpointValidation.timeoutMs }}ms</code>
            <br>
            Atualizado em {{ new Date(endpointValidation.generatedAt).toLocaleString() }}.
          </p>

          <div class="users-table-wrap">
            <table class="users-table">
              <thead>
                <tr class="users-table__row users-table__row--head">
                  <th class="users-table__cell users-table__cell--head">Endpoint</th>
                  <th class="users-table__cell users-table__cell--head">Path</th>
                  <th class="users-table__cell users-table__cell--head">HTTP</th>
                  <th class="users-table__cell users-table__cell--head">Status</th>
                  <th class="users-table__cell users-table__cell--head">Detalhe</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="entry in endpointValidation.endpoints" :key="entry.key" class="users-table__row">
                  <td class="users-table__cell">{{ entry.label }}</td>
                  <td class="users-table__cell admin-code-cell">
                    <code>{{ entry.pathTemplate }}</code>
                  </td>
                  <td class="users-table__cell">{{ entry.httpStatus ?? "-" }}</td>
                  <td class="users-table__cell">
                    <UBadge :color="endpointStatusColor(entry.status)" variant="soft">
                      {{ formatEndpointStatusLabel(entry.status) }}
                    </UBadge>
                  </td>
                  <td class="users-table__cell admin-message-cell">{{ entry.message }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </UCard>

      <UCard>
        <template #header>
          <div class="admin-card__header">
            <h2 class="admin-card__title">Usuarios do cliente</h2>
            <div class="admin-actions-row admin-actions-row--align-center">
              <USelect
                :model-value="selectedClientId"
                :items="clientItems"
                value-key="value"
                class="failures-window-select"
                :disabled="!canManageTenant || !clientItems.length"
                @update:model-value="value => value && selectClient(String(value))"
              />
              <UBadge color="neutral" variant="soft">
                {{ selectedClient?.name || tenant?.name || "Cliente atual" }}
              </UBadge>
            </div>
          </div>
        </template>

        <form class="users-form" @submit.prevent="saveUser">
          <UFormField label="Nome">
            <UInput v-model="userForm.name" :disabled="!canManageTenant" placeholder="Novo agente" />
            <p v-if="userFieldErrors.name" class="admin-field-error">{{ userFieldErrors.name }}</p>
          </UFormField>

          <UFormField label="Email">
            <UInput v-model="userForm.email" :disabled="!canManageTenant" type="email" placeholder="agente@empresa.com" />
            <p v-if="userFieldErrors.email" class="admin-field-error">{{ userFieldErrors.email }}</p>
          </UFormField>

          <UFormField :label="editingUserId ? 'Nova senha (opcional)' : 'Senha inicial'">
            <UInput
              v-model="userForm.password"
              :disabled="!canManageTenant"
              type="password"
              :placeholder="editingUserId ? 'Deixe vazio para manter' : '******'"
            />
            <p v-if="userFieldErrors.password" class="admin-field-error">{{ userFieldErrors.password }}</p>
          </UFormField>

          <UFormField label="Role">
            <USelect
              v-model="userForm.role"
              :items="roleItems"
              value-key="value"
              :disabled="!canManageTenant"
            />
            <p v-if="userFieldErrors.role" class="admin-field-error">{{ userFieldErrors.role }}</p>
          </UFormField>

          <div class="users-form__footer">
            <div class="admin-actions-row">
              <UButton type="submit" :loading="savingUser" :disabled="!canManageTenant">
                {{ editingUserId ? "Salvar usuario" : "Criar usuario" }}
              </UButton>
              <UButton v-if="editingUserId" type="button" color="neutral" variant="soft" @click="resetUserForm">
                Cancelar edicao
              </UButton>
            </div>
          </div>
        </form>

        <div class="users-table-wrap">
          <table class="users-table">
            <thead>
              <tr class="users-table__row users-table__row--head">
                <th class="users-table__cell users-table__cell--head">Nome</th>
                <th class="users-table__cell users-table__cell--head">Email</th>
                <th class="users-table__cell users-table__cell--head">Role</th>
                <th class="users-table__cell users-table__cell--head">Criado em</th>
                <th class="users-table__cell users-table__cell--head">Acoes</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tenantUser in users" :key="tenantUser.id" class="users-table__row">
                <td class="users-table__cell">{{ tenantUser.name }}</td>
                <td class="users-table__cell">{{ tenantUser.email }}</td>
                <td class="users-table__cell">{{ tenantUser.role }}</td>
                <td class="users-table__cell">{{ new Date(tenantUser.createdAt).toLocaleString() }}</td>
                <td class="users-table__cell">
                  <div class="admin-actions-row">
                    <UButton color="neutral" variant="soft" :disabled="!canManageTenant" @click="startEditUser(tenantUser)">
                      Editar
                    </UButton>
                    <UButton
                      color="error"
                      variant="soft"
                      :disabled="!canManageTenant"
                      :loading="deletingUserId === tenantUser.id"
                      @click="deleteUser(tenantUser.id)"
                    >
                      Excluir
                    </UButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="admin-card__header">
            <h2 class="admin-card__title">Dashboard de falhas outbound</h2>
            <div class="admin-actions-row">
              <USelect
                :model-value="failureWindowDays"
                :items="failureWindowItems"
                value-key="value"
                class="failures-window-select"
                @update:model-value="value => loadFailuresDashboard({ days: Number(value || 7) })"
              />
              <UButton
                color="neutral"
                variant="soft"
                :loading="loadingFailures"
                @click="loadFailuresDashboard()"
              >
                Atualizar
              </UButton>
            </div>
          </div>
        </template>

        <div v-if="loadingFailures" class="admin-console__loading">Carregando dashboard de falhas...</div>
        <div v-else-if="!failuresDashboard" class="admin-console__loading">Sem dados de falha para o periodo selecionado.</div>
        <template v-else>
          <div class="failures-kpis">
            <UCard class="failures-kpi">
              <p class="failures-kpi__label">Falhas totais</p>
              <p class="failures-kpi__value">{{ failuresDashboard.failedTotal }}</p>
              <p class="failures-kpi__hint">Ultimos {{ failuresDashboard.windowDays }} dias</p>
            </UCard>

            <UCard class="failures-kpi">
              <p class="failures-kpi__label">Maior tipo</p>
              <p class="failures-kpi__value">
                {{ failuresDashboard.failedByType[0] ? formatMessageTypeLabel(failuresDashboard.failedByType[0].messageType) : "-" }}
              </p>
              <p class="failures-kpi__hint">
                {{ failuresDashboard.failedByType[0]?.total ?? 0 }} falhas
              </p>
            </UCard>

            <UCard class="failures-kpi">
              <p class="failures-kpi__label">Atualizado em</p>
              <p class="failures-kpi__value failures-kpi__value--small">
                {{ new Date(failuresDashboard.generatedAt).toLocaleString() }}
              </p>
              <p class="failures-kpi__hint">Dados por tenant</p>
            </UCard>
          </div>

          <div class="failures-grid">
            <UCard>
              <template #header>
                <h3 class="admin-card__title">Falhas por tipo</h3>
              </template>
              <ul class="failures-list">
                <li v-for="entry in failuresDashboard.failedByType" :key="entry.messageType" class="failures-list__item">
                  <span>{{ formatMessageTypeLabel(entry.messageType) }}</span>
                  <strong>{{ entry.total }}</strong>
                </li>
                <li v-if="!failuresDashboard.failedByType.length" class="failures-list__item">
                  <span>Sem falhas no periodo</span>
                  <strong>0</strong>
                </li>
              </ul>
            </UCard>

            <UCard>
              <template #header>
                <h3 class="admin-card__title">Serie diaria</h3>
              </template>
              <div class="failures-series">
                <div
                  v-for="entry in failuresDashboard.dailySeries"
                  :key="entry.day"
                  class="failures-series__row"
                >
                  <span>{{ entry.day }}</span>
                  <strong>{{ entry.total }}</strong>
                </div>
              </div>
            </UCard>
          </div>

          <UCard>
            <template #header>
              <h3 class="admin-card__title">Falhas recentes</h3>
            </template>
            <div class="users-table-wrap">
              <table class="users-table">
                <thead>
                  <tr class="users-table__row users-table__row--head">
                    <th class="users-table__cell users-table__cell--head">Data</th>
                    <th class="users-table__cell users-table__cell--head">Tipo</th>
                    <th class="users-table__cell users-table__cell--head">Contato</th>
                    <th class="users-table__cell users-table__cell--head">Mensagem</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="entry in failuresDashboard.recentFailures" :key="entry.id" class="users-table__row">
                    <td class="users-table__cell">{{ new Date(entry.createdAt).toLocaleString() }}</td>
                    <td class="users-table__cell">{{ formatMessageTypeLabel(entry.messageType) }}</td>
                    <td class="users-table__cell">{{ entry.contactName || entry.externalId }}</td>
                    <td class="users-table__cell">{{ entry.content }}</td>
                  </tr>
                  <tr v-if="!failuresDashboard.recentFailures.length" class="users-table__row">
                    <td class="users-table__cell" colspan="4">Sem falhas recentes no periodo selecionado.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </UCard>
        </template>
      </UCard>

      <details class="admin-debug">
        <summary class="admin-debug__summary">Debug tecnico (bootstrap/status/qr)</summary>
        <div class="admin-debug__grid">
          <pre class="admin-debug__code">{{ bootstrapResult ? JSON.stringify(bootstrapResult, null, 2) : "Sem bootstrap ainda." }}</pre>
          <pre class="admin-debug__code">{{ statusResult ? JSON.stringify(statusResult, null, 2) : "Sem status." }}</pre>
          <pre class="admin-debug__code">{{ qrResult ? JSON.stringify(qrResult, null, 2) : "Sem qr." }}</pre>
        </div>
      </details>
    </template>
  </div>
</template>

<style scoped>
.admin-console {
  min-height: 100vh;
  padding: 1rem;
  display: grid;
  align-content: start;
  gap: 1rem;
}

.admin-console__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.admin-console__header-actions {
  display: flex;
  gap: 0.5rem;
}

.admin-console__headline {
  min-width: 0;
}

.admin-console__title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.admin-console__subtitle {
  margin: 0.2rem 0 0;
  color: rgb(var(--muted));
  font-size: 0.9rem;
}

.admin-console__loading {
  color: rgb(var(--muted));
  font-size: 0.9rem;
}

.admin-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.admin-card__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.tenant-form,
.users-form {
  display: grid;
  gap: 0.75rem;
}

.tenant-form {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.users-form {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.tenant-form__footer,
.users-form__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.tenant-form__footer {
  grid-column: 1 / -1;
}

.users-form__footer {
  grid-column: 1 / -1;
  justify-content: flex-end;
}

.tenant-form__hint {
  margin: 0;
  font-size: 0.75rem;
  color: rgb(var(--muted));
}

.admin-field-error {
  margin: 0.35rem 0 0;
  font-size: 0.75rem;
  line-height: 1.35;
  color: rgb(var(--error));
}

.admin-grid-two {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.admin-card__status-alert {
  margin-bottom: 0.75rem;
}

.admin-stack {
  display: grid;
  gap: 0.75rem;
  align-content: start;
}

.admin-actions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.admin-actions-row--align-center {
  align-items: center;
}

.qr-panel {
  min-height: 360px;
}

.qr-stage {
  min-height: 260px;
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
  padding: 1rem;
}

.qr-image {
  width: min(260px, 100%);
  height: auto;
  border-radius: 10px;
  background: #fff;
  padding: 0.5rem;
  border: 1px solid #e2e8f0;
}

.qr-empty {
  text-align: center;
  color: rgb(var(--muted));
  font-size: 0.85rem;
}

.qr-hint {
  margin: 0;
  color: rgb(var(--muted));
  font-size: 0.75rem;
}

.users-table-wrap {
  margin-top: 1rem;
  overflow-x: auto;
}

.users-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.users-table__row {
  border-bottom: 1px solid rgb(var(--border));
}

.users-table__row--head {
  color: rgb(var(--muted));
}

.users-table__cell {
  padding: 0.5rem;
  text-align: left;
}

.users-table__cell--head {
  font-weight: 600;
}

.admin-code-cell {
  white-space: nowrap;
  font-size: 0.78rem;
}

.admin-message-cell {
  max-width: 28rem;
  white-space: normal;
  word-break: break-word;
}

.failures-window-select {
  min-width: 7.5rem;
}

.failures-kpis {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.failures-kpi {
  min-height: 7.5rem;
}

.failures-kpi__label,
.failures-kpi__hint {
  margin: 0;
  color: rgb(var(--muted));
  font-size: 0.75rem;
}

.failures-kpi__value {
  margin: 0.25rem 0;
  font-size: 1.35rem;
  font-weight: 700;
}

.failures-kpi__value--small {
  font-size: 0.95rem;
}

.failures-grid {
  margin-top: 0.75rem;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.failures-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.5rem;
}

.failures-list__item,
.failures-series__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem;
  border-radius: var(--radius-xs);
  background: rgba(var(--surface-inverted), 0.04);
}

.failures-series {
  display: grid;
  gap: 0.35rem;
  max-height: 14rem;
  overflow-y: auto;
}

.admin-debug {
  border: 1px solid rgb(var(--border));
  border-radius: var(--radius-sm);
  background: rgb(var(--surface));
  padding: 0.75rem;
}

.admin-debug__summary {
  cursor: pointer;
  font-weight: 600;
}

.admin-debug__grid {
  margin-top: 0.75rem;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.admin-debug__code {
  margin: 0;
  max-height: 20rem;
  overflow: auto;
  border-radius: var(--radius-xs);
  background: #0f172a;
  color: #e2e8f0;
  padding: 0.75rem;
  font-size: 0.75rem;
}

@media (max-width: 1024px) {
  .admin-grid-two {
    grid-template-columns: 1fr;
  }

  .failures-kpis,
  .failures-grid {
    grid-template-columns: 1fr;
  }

  .admin-debug__grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .tenant-form,
  .users-form {
    grid-template-columns: 1fr;
  }

  .admin-console__header {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>

