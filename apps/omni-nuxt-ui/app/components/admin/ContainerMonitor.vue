<template>
  <div class="space-y-6 p-6">
    <!-- Header com botão de refresh -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-bold text-gray-900">Status dos Containers</h2>
        <p class="text-sm text-gray-500 mt-1">Informações em tempo real</p>
      </div>
      <button
        @click="refreshStats"
        :disabled="loading"
        class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        🔄 Atualizar
      </button>
    </div>

    <!-- System Stats -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div class="bg-white rounded-lg shadow p-6">
        <div class="text-sm font-medium text-gray-600">CPU Cores</div>
        <div class="text-2xl font-bold text-gray-900 mt-2">{{ system.cpuCount }}</div>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <div class="text-sm font-medium text-gray-600">RAM Total</div>
        <div class="text-2xl font-bold text-gray-900 mt-2">{{ formatBytes(system.totalMemory) }}</div>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <div class="text-sm font-medium text-gray-600">RAM Disponível</div>
        <div class="text-2xl font-bold text-gray-900 mt-2">{{ formatBytes(system.availableMemory) }}</div>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <div class="text-sm font-medium text-gray-600">Uso de RAM</div>
        <div class="text-2xl font-bold" :class="getMemoryColor(system.memoryPercent)">
          {{ system.memoryPercent }}%
        </div>
        <div class="w-full bg-gray-200 rounded-full h-2 mt-2">
          <div
            class="h-2 rounded-full transition-all"
            :class="getMemoryBarColor(system.memoryPercent)"
            :style="{ width: system.memoryPercent + '%' }"
          />
        </div>
      </div>
    </div>

    <!-- Containers Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div
        v-for="container in containers"
        :key="container.name"
        class="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow"
      >
        <!-- Container Header -->
        <div class="bg-gradient-to-r from-blue-50 to-blue-100 p-4 border-b">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div :class="['w-3 h-3 rounded-full', getStatusColor(container.status)]" />
              <div>
                <h3 class="font-semibold text-gray-900">{{ container.name }}</h3>
                <p class="text-xs text-gray-600">{{ container.status }}</p>
              </div>
            </div>
            <div :class="['px-2 py-1 rounded text-xs font-medium', getHealthBadgeClass(container.healthStatus)]">
              {{ container.healthStatus || 'unknown' }}
            </div>
          </div>
        </div>

        <!-- Container Stats -->
        <div class="p-4 space-y-3">
          <!-- CPU -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <span class="text-sm font-medium text-gray-600">CPU</span>
              <span class="text-sm font-bold text-gray-900">{{ container.cpuPercent }}</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div
                class="h-2 rounded-full bg-blue-500 transition-all"
                :style="{ width: parseCpuPercent(container.cpuPercent) + '%' }"
              />
            </div>
          </div>

          <!-- Memory -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <span class="text-sm font-medium text-gray-600">Memória</span>
              <span class="text-sm font-bold text-gray-900">{{ container.memoryUsage }}</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div
                class="h-2 rounded-full bg-green-500 transition-all"
                :style="{ width: parseMemoryPercent(container.memoryUsage) + '%' }"
              />
            </div>
          </div>
        </div>

        <!-- Container Actions -->
        <div class="bg-gray-50 px-4 py-3 border-t grid grid-cols-3 gap-2">
          <button
            @click="restartContainer(container.name)"
            class="px-3 py-1 bg-yellow-500 text-white text-sm rounded hover:bg-yellow-600 disabled:opacity-50"
            :disabled="loading"
          >
            🔄 Restart
          </button>
          <button
            @click="stopContainer(container.name)"
            class="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600 disabled:opacity-50"
            :disabled="loading"
          >
            ⏹️ Stop
          </button>
          <button
            @click="openLogs(container.name)"
            class="px-3 py-1 bg-purple-500 text-white text-sm rounded hover:bg-purple-600"
          >
            📋 Logs
          </button>
        </div>
      </div>
    </div>

    <!-- Logs Modal -->
    <div v-if="showLogsModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-96 overflow-hidden flex flex-col">
        <div class="bg-gradient-to-r from-purple-50 to-purple-100 p-4 border-b flex items-center justify-between">
          <h2 class="font-semibold text-gray-900">Logs - {{ selectedContainer }}</h2>
          <button @click="showLogsModal = false" class="text-gray-600 hover:text-gray-900">✕</button>
        </div>
        <div class="flex-1 overflow-y-auto bg-gray-900 p-4 font-mono text-xs text-gray-100 space-y-1">
          <div v-for="(log, idx) in containerLogs" :key="idx" class="text-gray-400">{{ log }}</div>
          <div v-if="containerLogs.length === 0" class="text-gray-600">Nenhum log disponível</div>
        </div>
        <div class="bg-gray-50 px-4 py-3 border-t">
          <button
            @click="showLogsModal = false"
            class="px-4 py-2 bg-gray-300 text-gray-900 rounded hover:bg-gray-400"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>

    <!-- Loading Indicator -->
    <div v-if="loading" class="fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center z-40">
      <div class="bg-white rounded-lg p-6 shadow-lg">
        <p class="text-gray-700">Carregando informações...</p>
        <div class="mt-4 w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    </div>

    <!-- Refresh Timer -->
    <div class="text-center text-sm text-gray-500">
      ⏱️ Próxima atualização em {{ refreshTimer }}s
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

interface ContainerStats {
  name: string
  status: string
  cpuPercent: string
  memoryUsage: string
  healthStatus: string
}

interface SystemStats {
  totalMemory: number
  availableMemory: number
  memoryPercent: number
  cpuCount: number
  platform: string
  uptime: number
}

const containers = ref<ContainerStats[]>([])
const system = ref<SystemStats>({
  totalMemory: 0,
  availableMemory: 0,
  memoryPercent: 0,
  cpuCount: 0,
  platform: '',
  uptime: 0
})
const loading = ref(false)
const showLogsModal = ref(false)
const selectedContainer = ref('')
const containerLogs = ref<string[]>([])
const refreshTimer = ref(30)
let refreshInterval: NodeJS.Timeout | null = null
let timerInterval: NodeJS.Timeout | null = null
const ADMIN_API_PREFIX = '/api/bff/api/admin'
const REQUEST_TIMEOUT_MS = 10000

async function fetchJsonWithTimeout<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal
    })

    if (!response.ok) {
      throw new Error(`Falha em ${url}: ${response.status}`)
    }

    return await response.json() as T
  } finally {
    clearTimeout(timeout)
  }
}

// Utility Functions
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

const parseCpuPercent = (cpuStr: string): number => {
  const num = parseFloat(cpuStr)
  return Math.min(num, 100)
}

const parseMemoryPercent = (memStr: string): number => {
  // Formato: "256M / 1G"
  const parts = memStr.split(' / ')
  if (parts.length !== 2) return 0

  const used = convertToBytes(parts[0].trim())
  const total = convertToBytes(parts[1].trim())

  return total > 0 ? Math.round((used / total) * 100) : 0
}

const convertToBytes = (str: string): number => {
  const num = parseFloat(str)
  if (str.includes('G')) return num * 1024 * 1024 * 1024
  if (str.includes('M')) return num * 1024 * 1024
  if (str.includes('k')) return num * 1024
  return num
}

const getStatusColor = (status: string): string => {
  if (status.includes('Up')) return 'bg-green-500'
  if (status.includes('Exited')) return 'bg-red-500'
  return 'bg-yellow-500'
}

const getMemoryColor = (percent: number): string => {
  if (percent > 80) return 'text-red-600'
  if (percent > 60) return 'text-yellow-600'
  return 'text-green-600'
}

const getMemoryBarColor = (percent: number): string => {
  if (percent > 80) return 'bg-red-500'
  if (percent > 60) return 'bg-yellow-500'
  return 'bg-green-500'
}

const getHealthBadgeClass = (status?: string): string => {
  if (status === 'healthy')
    return 'bg-green-100 text-green-800'
  if (status === 'unhealthy')
    return 'bg-red-100 text-red-800'
  return 'bg-gray-100 text-gray-800'
}

// API Calls
const refreshStats = async (): Promise<void> => {
  loading.value = true
  try {
    const data = await fetchJsonWithTimeout<{ containers: ContainerStats[]; system: SystemStats }>(
      `${ADMIN_API_PREFIX}/containers`
    )
    containers.value = data.containers
    system.value = data.system
  } catch (error) {
    console.error('Erro ao carregar stats:', error)
  } finally {
    loading.value = false
    refreshTimer.value = 30
  }
}

const restartContainer = async (name: string): Promise<void> => {
  loading.value = true
  try {
    await fetchJsonWithTimeout<{ success: boolean; message: string }>(
      `${ADMIN_API_PREFIX}/container/${name}/restart`,
      { method: 'POST' }
    )
    await new Promise(resolve => setTimeout(resolve, 1000))
    await refreshStats()
  } catch (error) {
    console.error('Erro ao reiniciar container:', error)
  } finally {
    loading.value = false
  }
}

const stopContainer = async (name: string): Promise<void> => {
  loading.value = true
  try {
    await fetchJsonWithTimeout<{ success: boolean; message: string }>(
      `${ADMIN_API_PREFIX}/container/${name}/stop`,
      { method: 'POST' }
    )
    await new Promise(resolve => setTimeout(resolve, 1000))
    await refreshStats()
  } catch (error) {
    console.error('Erro ao parar container:', error)
  } finally {
    loading.value = false
  }
}

const openLogs = async (name: string): Promise<void> => {
  selectedContainer.value = name
  loading.value = true
  try {
    const data = await fetchJsonWithTimeout<{ logs: string[] }>(
      `${ADMIN_API_PREFIX}/container/${name}/logs?tail=100`
    )
    containerLogs.value = data.logs
    showLogsModal.value = true
  } catch (error) {
    console.error('Erro ao carregar logs:', error)
  } finally {
    loading.value = false
  }
}

// Lifecycle
onMounted(() => {
  refreshStats()

  // Refresh stats a cada 30 segundos
  refreshInterval = setInterval(() => {
    refreshStats()
  }, 30000)

  // Decrementa timer
  timerInterval = setInterval(() => {
    refreshTimer.value = Math.max(0, refreshTimer.value - 1)
  }, 1000)
})

onBeforeUnmount(() => {
  if (refreshInterval) clearInterval(refreshInterval)
  if (timerInterval) clearInterval(timerInterval)
})
</script>

<style scoped>
@keyframes spin {
  to {
    transform: rotate(360deg)
  }
}

.animate-spin {
  animation: spin 1s linear infinite
}
</style>
