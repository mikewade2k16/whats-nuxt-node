#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const UI_BASE_URL = String(process.env.SECURITY_AUDIT_UI_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
const API_BASE_URL = String(process.env.SECURITY_AUDIT_API_BASE_URL ?? 'http://localhost:4000').replace(/\/+$/, '')
const OUTPUT_FILE = process.env.SECURITY_AUDIT_OUTPUT_FILE
  ? resolve(process.cwd(), process.env.SECURITY_AUDIT_OUTPUT_FILE)
  : resolve(process.cwd(), 'docs/metrics/security-access-audit-latest.json')

const ROOT_LOGIN = {
  email: process.env.SECURITY_AUDIT_ROOT_EMAIL ?? 'root@core.local',
  password: process.env.SECURITY_AUDIT_ROOT_PASSWORD ?? '123456'
}

const TENANT_ADMIN_LOGIN = {
  email: process.env.SECURITY_AUDIT_ADMIN_EMAIL ?? 'admin@demo.local',
  password: process.env.SECURITY_AUDIT_ADMIN_PASSWORD ?? '123456'
}

const WEBHOOK_TENANT_SLUG = process.env.SECURITY_AUDIT_WEBHOOK_TENANT ?? 'demo'

const ROOT_ADMIN_HEADERS = {
  userType: 'admin',
  userLevel: 'admin',
  clientId: 1
}

function nowIso() {
  return new Date().toISOString()
}

async function requestJSON(path, options = {}) {
  return requestJSONWithBase(UI_BASE_URL, path, options)
}

async function requestJSONWithBase(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const raw = await response.text()

  let payload = null
  try {
    payload = raw ? JSON.parse(raw) : null
  } catch {
    payload = raw
  }

  return {
    ok: response.ok,
    status: response.status,
    payload
  }
}

async function login(credentials) {
  return requestJSON('/api/bff/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(credentials)
  })
}

function buildHeaders(coreToken, spoof = {}, extraHeaders = {}) {
  const headers = {
    'x-core-token': coreToken,
    ...extraHeaders
  }

  if (spoof.userType) {
    headers['x-user-type'] = String(spoof.userType)
  }
  if (spoof.userLevel) {
    headers['x-user-level'] = String(spoof.userLevel)
  }
  if (spoof.clientId !== undefined && spoof.clientId !== null) {
    headers['x-client-id'] = String(spoof.clientId)
  }

  return headers
}

async function callAdmin(path, coreToken, spoof = {}, options = {}) {
  return requestJSON(path, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...buildHeaders(coreToken, spoof, options.headers ?? {})
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  })
}

async function fetchAdminProfile(coreToken, spoof = {}) {
  return requestJSON('/api/admin/profile', {
    method: 'GET',
    headers: buildHeaders(coreToken, spoof)
  })
}

async function fetchClientsForRoot(rootToken) {
  const response = await callAdmin('/api/admin/clients?page=1&limit=200', rootToken, ROOT_ADMIN_HEADERS)
  if (!response.ok) {
    return []
  }
  return Array.isArray(response.payload?.data) ? response.payload.data : []
}

async function callWebhook(path, options = {}) {
  return requestJSONWithBase(API_BASE_URL, path, {
    method: options.method ?? 'POST',
    headers: {
      'Content-Type': options.contentType ?? 'application/json',
      ...(options.headers ?? {})
    },
    body: options.body !== undefined
      ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body))
      : undefined
  })
}

function hasActiveModule(client, moduleCode) {
  const modules = Array.isArray(client?.modules) ? client.modules : []
  return modules.some((entry) => {
    const code = String(entry?.code ?? '').trim().toLowerCase()
    const status = String(entry?.status ?? '').trim().toLowerCase()
    return code === moduleCode && status === 'active'
  })
}

function evaluateCase(caseDef, response) {
  const statusPassed = response.status === caseDef.expectedStatus
  const assertResult = typeof caseDef.assert === 'function' ? caseDef.assert(response) : true
  const passed = statusPassed && assertResult === true
  return {
    id: caseDef.id,
    description: caseDef.description,
    path: caseDef.path,
    expectedStatus: caseDef.expectedStatus,
    actualStatus: response.status,
    passed,
    response: response.payload,
    assertionError: assertResult === true ? null : (typeof assertResult === 'string' ? assertResult : 'custom assertion failed')
  }
}

function printResult(result) {
  const mark = result.passed ? 'PASS' : 'FAIL'
  process.stdout.write(
    `[${mark}] ${result.id} ${result.description} -> expected ${result.expectedStatus}, got ${result.actualStatus}\n`
  )
}

async function main() {
  const startedAt = nowIso()
  const report = {
    startedAt,
    finishedAt: '',
    baseUrl: UI_BASE_URL,
    logins: {
      root: null,
      tenantAdmin: null
    },
    results: [],
    summary: {
      total: 0,
      passed: 0,
      failed: 0
    }
  }

  const rootLogin = await login(ROOT_LOGIN)
  if (!rootLogin.ok || !rootLogin.payload?.coreAccessToken) {
    report.logins.root = {
      ok: false,
      status: rootLogin.status,
      message: 'Root login failed. Check credentials or running services.'
    }
    report.finishedAt = nowIso()
    await persistReport(report)
    process.stderr.write(`Root login failed (${rootLogin.status}).\n`)
    process.exit(2)
  }
  report.logins.root = { ok: true, status: rootLogin.status }

  const tenantLogin = await login(TENANT_ADMIN_LOGIN)
  if (!tenantLogin.ok || !tenantLogin.payload?.coreAccessToken) {
    report.logins.tenantAdmin = {
      ok: false,
      status: tenantLogin.status,
      message: 'Tenant admin login failed. Some scenarios will be skipped.'
    }
  } else {
    report.logins.tenantAdmin = { ok: true, status: tenantLogin.status }
  }

  const rootToken = String(rootLogin.payload.coreAccessToken)
  const rootProfileResponse = await fetchAdminProfile(rootToken, ROOT_ADMIN_HEADERS)
  const rootProfile = rootProfileResponse.ok ? rootProfileResponse.payload?.data ?? null : null
  const rootClientId = Number.parseInt(String(rootProfile?.clientId ?? ''), 10)
  if (Number.isFinite(rootClientId) && rootClientId > 0) {
    ROOT_ADMIN_HEADERS.clientId = rootClientId
  }

  const tenantToken = tenantLogin.ok && tenantLogin.payload?.coreAccessToken
    ? String(tenantLogin.payload.coreAccessToken)
    : ''
  const rootClients = await fetchClientsForRoot(rootToken)
  const nonFinanceClient = rootClients.find((client) => !hasActiveModule(client, 'finance')) ?? null

  let tenantProfile = null
  let tenantClient = null
  if (tenantToken) {
    const tenantProfileResponse = await fetchAdminProfile(tenantToken)
    tenantProfile = tenantProfileResponse.ok ? tenantProfileResponse.payload?.data ?? null : null
    const tenantClientId = Number.parseInt(String(tenantProfile?.clientId ?? ''), 10)
    tenantClient = rootClients.find((client) => Number(client?.id) === tenantClientId) ?? null
  }

  const cases = []
  const tempState = {
    productId: 0,
    qrCodeId: 0,
    scriptId: 0,
    financeId: ''
  }

  cases.push({
    id: 'SEC-001',
    description: 'Root admin mode can access /api/admin/clients',
    path: '/api/admin/clients?page=1&limit=5',
    expectedStatus: 200,
    run: () => callAdmin('/api/admin/clients?page=1&limit=5', rootToken, {
      ...ROOT_ADMIN_HEADERS
    })
  })

  cases.push({
    id: 'SEC-002',
    description: 'Root in simulated client mode is blocked on root-only /api/admin/clients',
    path: '/api/admin/clients?page=1&limit=5',
    expectedStatus: 403,
    run: () => callAdmin('/api/admin/clients?page=1&limit=5', rootToken, {
      userType: 'client',
      userLevel: 'admin',
      clientId: 1
    })
  })

  cases.push({
    id: 'SEC-003',
    description: 'Root admin mode can access /api/admin/qa',
    path: '/api/admin/qa?page=1&limit=5',
    expectedStatus: 200,
    run: () => callAdmin('/api/admin/qa?page=1&limit=5', rootToken, {
      ...ROOT_ADMIN_HEADERS
    })
  })

  cases.push({
    id: 'SEC-004',
    description: 'Root in simulated client mode is blocked on root-only /api/admin/qa',
    path: '/api/admin/qa?page=1&limit=5',
    expectedStatus: 403,
    run: () => callAdmin('/api/admin/qa?page=1&limit=5', rootToken, {
      userType: 'client',
      userLevel: 'admin',
      clientId: 1
    })
  })

  cases.push({
    id: 'SEC-005',
    description: 'Anonymous request is blocked on /api/admin/clients',
    path: '/api/admin/clients?page=1&limit=5',
    expectedStatus: 403,
    run: () => requestJSON('/api/admin/clients?page=1&limit=5')
  })

  if (tenantToken) {
    cases.push({
      id: 'SEC-006',
      description: 'Tenant admin cannot access root-only /api/admin/clients (no spoof)',
      path: '/api/admin/clients?page=1&limit=5',
      expectedStatus: 403,
      run: () => callAdmin('/api/admin/clients?page=1&limit=5', tenantToken)
    })

    cases.push({
      id: 'SEC-007',
      description: 'Tenant admin cannot bypass /api/admin/clients with spoofed admin headers',
      path: '/api/admin/clients?page=1&limit=5',
      expectedStatus: 403,
      run: () => callAdmin('/api/admin/clients?page=1&limit=5', tenantToken, {
        userType: 'admin',
        userLevel: 'admin',
        clientId: 1
      })
    })

    cases.push({
      id: 'SEC-008',
      description: 'Tenant admin can access allowed scope /api/admin/users',
      path: '/api/admin/users?page=1&limit=5',
      expectedStatus: 200,
      run: () => callAdmin('/api/admin/users?page=1&limit=5', tenantToken)
    })

    cases.push({
      id: 'SEC-009',
      description: 'Tenant admin cannot access root-only /api/admin/qa',
      path: '/api/admin/qa?page=1&limit=5',
      expectedStatus: 403,
      run: () => callAdmin('/api/admin/qa?page=1&limit=5', tenantToken, {
        userType: 'admin',
        userLevel: 'admin',
        clientId: 1
      })
    })
  }

  cases.push({
    id: 'SEC-021',
    description: 'Tenant admin nao pode criar cliente root-only via POST /api/admin/clients',
    path: '/api/admin/clients',
    expectedStatus: tenantToken ? 403 : 0,
    skip: !tenantToken,
    run: () => callAdmin('/api/admin/clients', tenantToken, {}, {
      method: 'POST',
      body: {
        name: `Audit Client ${Date.now()}`,
        slug: `audit-client-${Date.now()}`
      }
    })
  })

  cases.push({
    id: 'SEC-022',
    description: 'Tenant admin nao pode editar cliente root-only via PATCH /api/admin/clients/1',
    path: '/api/admin/clients/1',
    expectedStatus: tenantToken ? 403 : 0,
    skip: !tenantToken,
    run: () => callAdmin('/api/admin/clients/1', tenantToken, {}, {
      method: 'PATCH',
      body: {
        field: 'name',
        value: 'Tentativa indevida'
      }
    })
  })

  cases.push({
    id: 'SEC-023',
    description: 'Tenant admin nao pode excluir cliente root-only via DELETE /api/admin/clients/1',
    path: '/api/admin/clients/1',
    expectedStatus: tenantToken ? 403 : 0,
    skip: !tenantToken,
    run: () => callAdmin('/api/admin/clients/1', tenantToken, {}, {
      method: 'DELETE'
    })
  })

  cases.push({
    id: 'SEC-024',
    description: 'Root admin pode criar produto via POST /api/admin/products',
    path: '/api/admin/products',
    expectedStatus: 201,
    run: async () => {
      const response = await callAdmin('/api/admin/products', rootToken, ROOT_ADMIN_HEADERS, {
        method: 'POST',
        body: {
          name: `Audit Product ${Date.now()}`,
          code: `audit-product-${Date.now()}`,
          clientId: ROOT_ADMIN_HEADERS.clientId,
          clientName: 'Root'
        }
      })
      tempState.productId = Number(response.payload?.data?.id ?? 0)
      return response
    }
  })

  cases.push({
    id: 'SEC-025',
    description: 'Root admin pode editar produto via PATCH /api/admin/products/:id',
    path: '/api/admin/products/:id',
    expectedStatus: 200,
    run: () => callAdmin(`/api/admin/products/${tempState.productId}`, rootToken, ROOT_ADMIN_HEADERS, {
      method: 'PATCH',
      body: {
        field: 'name',
        value: `Audit Product Patched ${Date.now()}`
      }
    })
  })

  cases.push({
    id: 'SEC-026',
    description: 'Root admin pode excluir produto via DELETE /api/admin/products/:id',
    path: '/api/admin/products/:id',
    expectedStatus: 200,
    run: () => callAdmin(`/api/admin/products/${tempState.productId}`, rootToken, ROOT_ADMIN_HEADERS, {
      method: 'DELETE'
    })
  })

  if (tenantToken) {
    cases.push({
      id: 'SEC-027',
      description: 'Tenant admin pode criar QR code no proprio escopo',
      path: '/api/admin/qrcodes',
      expectedStatus: 200,
      run: async () => {
        const response = await callAdmin('/api/admin/qrcodes', tenantToken, {}, {
          method: 'POST',
          body: {
            slug: `audit-qr-${Date.now()}`,
            targetUrl: 'https://example.com/audit',
            fillColor: '#111827',
            backColor: '#ffffff'
          }
        })
        tempState.qrCodeId = Number(response.payload?.data?.id ?? 0)
        return response
      }
    })

    cases.push({
      id: 'SEC-028',
      description: 'Tenant admin pode editar QR code no proprio escopo',
      path: '/api/admin/qrcodes/:id',
      expectedStatus: 200,
      run: () => callAdmin(`/api/admin/qrcodes/${tempState.qrCodeId}`, tenantToken, {}, {
        method: 'PATCH',
        body: {
          targetUrl: 'https://example.com/audit-updated'
        }
      })
    })

    cases.push({
      id: 'SEC-029',
      description: 'Tenant admin pode excluir QR code no proprio escopo',
      path: '/api/admin/qrcodes/:id',
      expectedStatus: 200,
      run: () => callAdmin(`/api/admin/qrcodes/${tempState.qrCodeId}`, tenantToken, {}, {
        method: 'DELETE'
      })
    })

    cases.push({
      id: 'SEC-030',
      description: 'Tenant admin pode criar script no proprio escopo',
      path: '/api/admin/scripts',
      expectedStatus: 200,
      run: async () => {
        const response = await callAdmin('/api/admin/scripts', tenantToken, {}, {
          method: 'POST',
          body: {
            title: `Audit Script ${Date.now()}`,
            notes: 'created by security audit'
          }
        })
        tempState.scriptId = Number(response.payload?.data?.id ?? 0)
        return response
      }
    })

    cases.push({
      id: 'SEC-031',
      description: 'Tenant admin pode editar script no proprio escopo',
      path: '/api/admin/scripts/:id',
      expectedStatus: 200,
      run: () => callAdmin(`/api/admin/scripts/${tempState.scriptId}`, tenantToken, {}, {
        method: 'PATCH',
        body: {
          notes: 'patched by security audit'
        }
      })
    })

    cases.push({
      id: 'SEC-032',
      description: 'Tenant admin pode excluir script no proprio escopo',
      path: '/api/admin/scripts/:id',
      expectedStatus: 200,
      run: () => callAdmin(`/api/admin/scripts/${tempState.scriptId}`, tenantToken, {}, {
        method: 'DELETE'
      })
    })
  }

  if (nonFinanceClient) {
    cases.push({
      id: 'SEC-033',
      description: `Root em sessao simulada do cliente ${String(nonFinanceClient.name ?? nonFinanceClient.id)} sem modulo finance nao pode criar planilha`,
      path: '/api/admin/finances',
      expectedStatus: 403,
      run: () => callAdmin('/api/admin/finances', rootToken, {
        userType: 'client',
        userLevel: 'admin',
        clientId: Number(nonFinanceClient.id)
      }, {
        method: 'POST',
        body: {
          title: `Finance Audit ${Date.now()}`,
          period: '2026-03'
        }
      })
    })
  }

  if (tenantToken) {
    const tenantFinanceEnabled = hasActiveModule(tenantClient, 'finance')
    cases.push({
      id: 'SEC-034',
      description: `Tenant admin ${tenantFinanceEnabled ? 'com' : 'sem'} modulo finance recebe resposta esperada ao criar planilha`,
      path: '/api/admin/finances',
      expectedStatus: tenantFinanceEnabled ? 200 : 403,
      run: async () => {
        const response = await callAdmin('/api/admin/finances', tenantToken, {}, {
          method: 'POST',
          body: {
            title: `Finance Audit ${Date.now()}`,
            period: '2026-03',
            notes: 'created by security audit'
          }
        })
        if (tenantFinanceEnabled) {
          tempState.financeId = String(response.payload?.data?.id ?? '').trim()
        }
        return response
      }
    })

    cases.push({
      id: 'SEC-035',
      description: `Tenant admin ${tenantFinanceEnabled ? 'com' : 'sem'} modulo finance recebe resposta esperada ao editar planilha`,
      path: '/api/admin/finances/:id',
      expectedStatus: tenantFinanceEnabled ? 200 : 403,
      run: () => callAdmin(`/api/admin/finances/${tenantFinanceEnabled ? tempState.financeId : 1}`, tenantToken, {}, {
        method: 'PATCH',
        body: {
          notes: 'patched by security audit'
        }
      })
    })

    cases.push({
      id: 'SEC-036',
      description: `Tenant admin ${tenantFinanceEnabled ? 'com' : 'sem'} modulo finance recebe resposta esperada ao excluir planilha`,
      path: '/api/admin/finances/:id',
      expectedStatus: tenantFinanceEnabled ? 200 : 403,
      run: () => callAdmin(`/api/admin/finances/${tenantFinanceEnabled ? tempState.financeId : 1}`, tenantToken, {}, {
        method: 'DELETE'
      })
    })
  }

  cases.push({
    id: 'SEC-037',
    description: 'Webhook sem token e bloqueado',
    path: `/webhooks/evolution/${WEBHOOK_TENANT_SLUG}`,
    expectedStatus: 401,
    run: () => callWebhook(`/webhooks/evolution/${WEBHOOK_TENANT_SLUG}`, {
      body: {
        event: 'messages.upsert'
      }
    })
  })

  cases.push({
    id: 'SEC-038',
    description: 'Webhook com content-type invalido e bloqueado',
    path: `/webhooks/evolution/${WEBHOOK_TENANT_SLUG}`,
    expectedStatus: 415,
    run: () => callWebhook(`/webhooks/evolution/${WEBHOOK_TENANT_SLUG}`, {
      contentType: 'application/xml',
      headers: {
        'x-webhook-token': String(process.env.EVOLUTION_WEBHOOK_TOKEN ?? 'change-this-webhook-token')
      },
      body: '<xml />'
    })
  })

  cases.push({
    id: 'SEC-039',
    description: 'Webhook valido com token correto e aceito',
    path: `/webhooks/evolution/${WEBHOOK_TENANT_SLUG}`,
    expectedStatus: 202,
    run: () => callWebhook(`/webhooks/evolution/${WEBHOOK_TENANT_SLUG}`, {
      headers: {
        'x-webhook-token': String(process.env.EVOLUTION_WEBHOOK_TOKEN ?? 'change-this-webhook-token')
      },
      body: {
        event: 'QRCODE_UPDATED',
        instance: 'audit-instance',
        qrcode: `audit-qrcode-${Date.now()}`
      }
    }),
    assert: (response) => response.payload?.status === 'ok' || 'valid webhook should be accepted'
  })

  cases.push({
    id: 'SEC-040',
    description: 'Webhook repetido e tratado por idempotencia/replay protection',
    path: `/webhooks/evolution/${WEBHOOK_TENANT_SLUG}`,
    expectedStatus: 202,
    run: async () => {
      const duplicateBody = {
        event: 'QRCODE_UPDATED',
        instance: 'audit-instance',
        qrcode: 'audit-replay-same-payload'
      }
      await callWebhook(`/webhooks/evolution/${WEBHOOK_TENANT_SLUG}`, {
        headers: {
          'x-webhook-token': String(process.env.EVOLUTION_WEBHOOK_TOKEN ?? 'change-this-webhook-token')
        },
        body: duplicateBody
      })
      return callWebhook(`/webhooks/evolution/${WEBHOOK_TENANT_SLUG}`, {
        headers: {
          'x-webhook-token': String(process.env.EVOLUTION_WEBHOOK_TOKEN ?? 'change-this-webhook-token')
        },
        body: duplicateBody
      })
    },
    assert: (response) => response.payload?.reason === 'duplicate_webhook_replay' || 'duplicate webhook should be ignored by idempotency guard'
  })

  const featureCases = [
    {
      id: 'SEC-010',
      description: 'Root admin mode can access /api/admin/products',
      path: '/api/admin/products?page=1&limit=5',
      expectedStatus: 200,
      run: () => callAdmin('/api/admin/products?page=1&limit=5', rootToken, ROOT_ADMIN_HEADERS)
    },
    {
      id: 'SEC-011',
      description: 'Root admin mode can access /api/admin/candidates',
      path: '/api/admin/candidates?page=1&limit=5',
      expectedStatus: 200,
      run: () => callAdmin('/api/admin/candidates?page=1&limit=5', rootToken, ROOT_ADMIN_HEADERS)
    },
    {
      id: 'SEC-012',
      description: 'Root admin mode can access /api/admin/qrcodes',
      path: '/api/admin/qrcodes?page=1&limit=5',
      expectedStatus: 200,
      run: () => callAdmin('/api/admin/qrcodes?page=1&limit=5', rootToken, ROOT_ADMIN_HEADERS)
    },
    {
      id: 'SEC-013',
      description: 'Root admin mode can access /api/admin/scripts',
      path: '/api/admin/scripts?page=1&limit=5',
      expectedStatus: 200,
      run: () => callAdmin('/api/admin/scripts?page=1&limit=5', rootToken, ROOT_ADMIN_HEADERS)
    },
    {
      id: 'SEC-014',
      description: 'Root admin mode can access /api/admin/finance',
      path: '/api/admin/finances?page=1&limit=5',
      expectedStatus: 200,
      run: () => callAdmin('/api/admin/finances?page=1&limit=5', rootToken, ROOT_ADMIN_HEADERS)
    }
  ]

  cases.push(...featureCases)

  if (nonFinanceClient) {
    cases.push({
      id: 'SEC-015',
      description: `Root em sessao simulada do cliente ${String(nonFinanceClient.name ?? nonFinanceClient.id)} sem modulo finance e bloqueado em /api/admin/finances`,
      path: '/api/admin/finances?page=1&limit=5',
      expectedStatus: 403,
      run: () => callAdmin('/api/admin/finances?page=1&limit=5', rootToken, {
        userType: 'client',
        userLevel: 'admin',
        clientId: Number(nonFinanceClient.id)
      })
    })
  }

  if (tenantToken) {
    cases.push({
      id: 'SEC-016',
      description: 'Tenant admin pode acessar /api/admin/products no proprio escopo',
      path: '/api/admin/products?page=1&limit=5',
      expectedStatus: 200,
      run: () => callAdmin('/api/admin/products?page=1&limit=5', tenantToken)
    })
    cases.push({
      id: 'SEC-017',
      description: 'Tenant admin pode acessar /api/admin/candidates no proprio escopo',
      path: '/api/admin/candidates?page=1&limit=5',
      expectedStatus: 200,
      run: () => callAdmin('/api/admin/candidates?page=1&limit=5', tenantToken)
    })
    cases.push({
      id: 'SEC-018',
      description: 'Tenant admin pode acessar /api/admin/qrcodes no proprio escopo',
      path: '/api/admin/qrcodes?page=1&limit=5',
      expectedStatus: 200,
      run: () => callAdmin('/api/admin/qrcodes?page=1&limit=5', tenantToken)
    })
    cases.push({
      id: 'SEC-019',
      description: 'Tenant admin pode acessar /api/admin/scripts no proprio escopo',
      path: '/api/admin/scripts?page=1&limit=5',
      expectedStatus: 200,
      run: () => callAdmin('/api/admin/scripts?page=1&limit=5', tenantToken)
    })

    const tenantFinanceEnabled = hasActiveModule(tenantClient, 'finance')
    cases.push({
      id: 'SEC-020',
      description: `Tenant admin ${tenantFinanceEnabled ? 'com' : 'sem'} modulo finance recebe resposta esperada em /api/admin/finances`,
      path: '/api/admin/finances?page=1&limit=5',
      expectedStatus: tenantFinanceEnabled ? 200 : 403,
      run: () => callAdmin('/api/admin/finances?page=1&limit=5', tenantToken)
    })
  }

  for (const caseDef of cases) {
    if (caseDef.skip) {
      continue
    }
    try {
      const response = await caseDef.run()
      const result = evaluateCase(caseDef, response)
      report.results.push(result)
      printResult(result)
    } catch (error) {
      const result = {
        id: caseDef.id,
        description: caseDef.description,
        path: caseDef.path,
        expectedStatus: caseDef.expectedStatus,
        actualStatus: -1,
        passed: false,
        response: {
          error: error instanceof Error ? error.message : String(error)
        }
      }
      report.results.push(result)
      printResult(result)
    }
  }

  report.summary.total = report.results.length
  report.summary.passed = report.results.filter(item => item.passed).length
  report.summary.failed = report.results.filter(item => !item.passed).length
  report.finishedAt = nowIso()

  await persistReport(report)

  process.stdout.write(
    `\nSecurity access audit finished: ${report.summary.passed}/${report.summary.total} passed. Report: ${OUTPUT_FILE}\n`
  )

  if (report.summary.failed > 0) {
    process.exit(1)
  }
}

async function persistReport(report) {
  await mkdir(dirname(OUTPUT_FILE), { recursive: true })
  await writeFile(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

await main()
