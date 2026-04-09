import { FastifyInstance } from 'fastify'
import { execSync } from 'child_process'
import os from 'os'

const EXEC_TIMEOUT_MS = 8000

interface ContainerStats {
  name: string
  status: string
  cpuPercent: string
  memoryUsage: string
  memoryLimit: string
  uptime?: string
  healthStatus?: string
}

interface SystemStats {
  totalMemory: number
  availableMemory: number
  memoryPercent: number
  cpuCount: number
  platform: string
  uptime: number
}

function normalizeContainerName(containerName: string): string {
  const value = containerName.trim()
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new Error('Nome de container invalido')
  }
  return value
}

/**
 * Extrai stats de um container usando docker stats
 */
function getContainerStats(): ContainerStats[] {
  try {
    const statusOutput = execSync(
      'docker ps --format "{{.Names}},{{.Status}}" 2>/dev/null',
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: EXEC_TIMEOUT_MS }
    )

    const statusByName = new Map<string, string>()
    for (const line of statusOutput.trim().split('\n')) {
      if (!line.trim()) continue
      const [name, ...statusParts] = line.split(',')
      if (!name || statusParts.length === 0) continue
      statusByName.set(name.trim(), statusParts.join(',').trim())
    }

    // docker stats does not expose status; merge with docker ps output above.
    const output = execSync(
      'docker stats --no-stream --format "{{.Container}},{{.Name}},{{.CPUPerc}},{{.MemUsage}}" 2>/dev/null',
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: EXEC_TIMEOUT_MS }
    )

    const lines = output.trim().split('\n')
    const stats: ContainerStats[] = []

    for (const line of lines) {
      if (!line.trim()) continue

      const parts = line.split(',')
      if (parts.length < 4) continue

      const [containerId, name, cpu, memoryUsage] = parts
      const normalizedName = name.trim()
      const status = statusByName.get(normalizedName) ?? 'unknown'

      stats.push({
        name: normalizedName || containerId.substring(0, 12),
        status: status.trim(),
        cpuPercent: cpu.trim(),
        memoryUsage: memoryUsage.trim(),
        memoryLimit: '',
        healthStatus: status.includes('healthy')
          ? 'healthy'
          : status.includes('unhealthy')
            ? 'unhealthy'
            : 'unknown'
      })
    }

    return stats
  } catch (error) {
    console.error('Erro ao obter stats:', error)
    return []
  }
}

/**
 * Obtém informações de saúde de um container específico
 */
function getContainerHealth(containerName: string): string {
  try {
    const safeContainerName = normalizeContainerName(containerName)
    const output = execSync(
      `docker inspect ${safeContainerName} --format='{{.State.Status}}'`,
      { encoding: 'utf-8', timeout: EXEC_TIMEOUT_MS }
    )
    return output.trim()
  } catch {
    return 'unknown'
  }
}

/**
 * Reinicia um container
 */
function restartContainer(containerName: string): boolean {
  try {
    const safeContainerName = normalizeContainerName(containerName)
    execSync(`docker restart ${safeContainerName}`, { encoding: 'utf-8', timeout: EXEC_TIMEOUT_MS })
    console.log(`Container '${containerName}' reiniciado com sucesso`)
    return true
  } catch (error) {
    console.error(`Erro ao reiniciar container: ${error}`)
    return false
  }
}

/**
 * Para um container
 */
function stopContainer(containerName: string): boolean {
  try {
    const safeContainerName = normalizeContainerName(containerName)
    execSync(`docker stop ${safeContainerName}`, { encoding: 'utf-8', timeout: EXEC_TIMEOUT_MS })
    console.log(`Container '${containerName}' parado com sucesso`)
    return true
  } catch (error) {
    console.error(`Erro ao parar container: ${error}`)
    return false
  }
}

/**
 * Inicia um container
 */
function startContainer(containerName: string): boolean {
  try {
    const safeContainerName = normalizeContainerName(containerName)
    execSync(`docker start ${safeContainerName}`, { encoding: 'utf-8', timeout: EXEC_TIMEOUT_MS })
    console.log(`Container '${containerName}' iniciado com sucesso`)
    return true
  } catch (error) {
    console.error(`Erro ao iniciar container: ${error}`)
    return false
  }
}

/**
 * Obtém estatísticas do sistema
 */
function getSystemStats(): SystemStats {
  const totalMemory = os.totalmem()
  const freeMemory = os.freemem()
  const availableMemory = freeMemory
  const memoryPercent = ((totalMemory - freeMemory) / totalMemory) * 100

  return {
    totalMemory,
    availableMemory,
    memoryPercent: Math.round(memoryPercent * 100) / 100,
    cpuCount: os.cpus().length,
    platform: os.platform(),
    uptime: os.uptime()
  }
}

/**
 * Obtém logs de um container
 */
function getContainerLogs(
  containerName: string,
  tail: number = 50
): string[] {
  try {
    const safeContainerName = normalizeContainerName(containerName)
    const output = execSync(
      `docker logs --tail ${tail} ${safeContainerName} 2>&1`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: EXEC_TIMEOUT_MS }
    )
    return output.split('\n').filter(line => line.trim())
  } catch (error) {
    return [`Erro ao obter logs: ${error}`]
  }
}

export async function registerAdminRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/admin/containers
   * Retorna lista de containers com stats
   */
  fastify.get<{
    Reply: {
      containers: ContainerStats[]
      system: SystemStats
      timestamp: string
    } | {
      error: string
      message: string
    }
  }>('/api/admin/containers', async (request, reply) => {
    try {
      const containers = getContainerStats()
      const system = getSystemStats()

      return reply.code(200).send({
        containers,
        system,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      return reply.code(500).send({
        error: 'Erro ao obter informações de containers',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  /**
   * GET /api/admin/container/:name/stats
   * Retorna stats detalhadas de um container específico
   */
  fastify.get<{
    Params: { name: string }
    Reply: ContainerStats | { error: string, message?: string }
  }>('/api/admin/container/:name/stats', async (request, reply) => {
    try {
      const { name } = request.params
      const stats = getContainerStats()
      const containerStats = stats.find(s =>
        s.name.toLowerCase().includes(name.toLowerCase())
      )

      if (!containerStats) {
        return reply.code(404).send({
          error: `Container '${name}' não encontrado`
        })
      }

      return reply.code(200).send(containerStats)
    } catch (error) {
      return reply.code(500).send({
        error: 'Erro ao obter stats do container',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  /**
   * GET /api/admin/container/:name/logs
   * Retorna últimos logs de um container
   */
  fastify.get<{
    Params: { name: string }
    Querystring: { tail?: string }
    Reply: { logs: string[] } | { error: string, message?: string }
  }>('/api/admin/container/:name/logs', async (request, reply) => {
    try {
      const { name } = request.params
      const { tail = '50' } = request.query

      const logs = getContainerLogs(name, parseInt(tail) || 50)

      return reply.code(200).send({ logs })
    } catch (error) {
      return reply.code(500).send({
        error: 'Erro ao obter logs do container',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  /**
   * POST /api/admin/container/:name/restart
   * Reinicia um container
   */
  fastify.post<{
    Params: { name: string }
    Reply: { success: boolean; message: string }
  }>('/api/admin/container/:name/restart', async (request, reply) => {
    try {
      const { name } = request.params
      const success = restartContainer(name)

      return reply.code(success ? 200 : 500).send({
        success,
        message: success
          ? `Container '${name}' reiniciado com sucesso`
          : `Erro ao reiniciar container '${name}'`
      })
    } catch (error) {
      return reply.code(500).send({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  /**
   * POST /api/admin/container/:name/stop
   * Para um container
   */
  fastify.post<{
    Params: { name: string }
    Reply: { success: boolean; message: string }
  }>('/api/admin/container/:name/stop', async (request, reply) => {
    try {
      const { name } = request.params
      const success = stopContainer(name)

      return reply.code(success ? 200 : 500).send({
        success,
        message: success
          ? `Container '${name}' parado com sucesso`
          : `Erro ao parar container '${name}'`
      })
    } catch (error) {
      return reply.code(500).send({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  /**
   * POST /api/admin/container/:name/start
   * Inicia um container
   */
  fastify.post<{
    Params: { name: string }
    Reply: { success: boolean; message: string }
  }>('/api/admin/container/:name/start', async (request, reply) => {
    try {
      const { name } = request.params
      const success = startContainer(name)

      return reply.code(success ? 200 : 500).send({
        success,
        message: success
          ? `Container '${name}' iniciado com sucesso`
          : `Erro ao iniciar container '${name}'`
      })
    } catch (error) {
      return reply.code(500).send({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  /**
   * GET /api/admin/system
   * Retorna informações do sistema
   */
  fastify.get<{
    Reply: SystemStats | { error: string, message: string }
  }>('/api/admin/system', async (request, reply) => {
    try {
      const system = getSystemStats()
      return reply.code(200).send(system)
    } catch (error) {
      return reply.code(500).send({
        error: 'Erro ao obter informações do sistema',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })
}
