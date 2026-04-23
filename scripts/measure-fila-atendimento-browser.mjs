#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'

const BASE_URL = String(process.env.FILA_BROWSER_BASE_URL ?? 'http://127.0.0.1:3001').replace(/\/+$/, '')
const LOGIN_EMAIL = String(process.env.FILA_BROWSER_EMAIL ?? 'days.matos@gmail.com')
const LOGIN_PASSWORD = String(process.env.FILA_BROWSER_PASSWORD ?? 'Perola@2026!')
const OUTPUT_FILE = resolve(process.cwd(), process.env.FILA_BROWSER_OUTPUT ?? 'docs/metrics/fila-atendimento-browser-latest.json')
const HEADLESS = String(process.env.FILA_BROWSER_HEADLESS ?? 'true') !== 'false'
const CHROME_PATHS = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean)

function sleep(ms) {
  return new Promise(resolveSleep => setTimeout(resolveSleep, ms))
}

function findChrome() {
  const chromePath = CHROME_PATHS.find(candidate => existsSync(candidate))
  if (!chromePath) {
    throw new Error('Chrome/Edge nao encontrado. Defina CHROME_PATH para rodar a medicao de navegador.')
  }
  return chromePath
}

function pickDebugPort() {
  return 42000 + Math.floor(Math.random() * 10000)
}

async function waitForDevTools(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  let lastError = null

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (response.ok) {
        return await response.json()
      }
    } catch (error) {
      lastError = error
    }
    await sleep(150)
  }

  throw new Error(`Chrome DevTools nao respondeu na porta ${port}: ${lastError?.message ?? 'timeout'}`)
}

async function createTarget(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
  if (!response.ok) {
    throw new Error(`Falha ao criar target do Chrome: HTTP ${response.status}`)
  }
  return response.json()
}

class CdpClient {
  constructor(websocketUrl) {
    this.websocketUrl = websocketUrl
    this.websocket = null
    this.nextId = 1
    this.pending = new Map()
    this.handlers = new Map()
  }

  async connect() {
    if (typeof WebSocket === 'undefined') {
      throw new Error('Runtime Node sem WebSocket global. Use Node 22+ para este script.')
    }

    this.websocket = new WebSocket(this.websocketUrl)
    await new Promise((resolveConnect, rejectConnect) => {
      const timeout = setTimeout(() => rejectConnect(new Error('Timeout abrindo WebSocket do CDP.')), 10000)
      this.websocket.addEventListener('open', () => {
        clearTimeout(timeout)
        resolveConnect()
      }, { once: true })
      this.websocket.addEventListener('error', () => {
        clearTimeout(timeout)
        rejectConnect(new Error('Erro abrindo WebSocket do CDP.'))
      }, { once: true })
    })

    this.websocket.addEventListener('message', (message) => {
      const payload = JSON.parse(String(message.data))
      if (payload.id && this.pending.has(payload.id)) {
        const { resolve, reject, timeout } = this.pending.get(payload.id)
        clearTimeout(timeout)
        this.pending.delete(payload.id)
        if (payload.error) {
          reject(new Error(`${payload.error.message} (${payload.error.code})`))
        } else {
          resolve(payload.result ?? {})
        }
        return
      }

      const bucket = this.handlers.get(payload.method)
      if (!bucket) return
      for (const handler of bucket) {
        handler(payload.params ?? {})
      }
    })
  }

  on(method, handler) {
    const bucket = this.handlers.get(method) ?? new Set()
    bucket.add(handler)
    this.handlers.set(method, bucket)
  }

  send(method, params = {}, timeoutMs = 15000) {
    const id = this.nextId++
    const message = JSON.stringify({ id, method, params })
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Timeout CDP em ${method}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timeout })
      this.websocket.send(message)
    })
  }

  close() {
    this.websocket?.close()
  }
}

function jsString(value) {
  return JSON.stringify(String(value))
}

function selectorExpression(selector) {
  return `document.querySelector(${jsString(selector)})`
}

async function evaluate(client, expression, options = {}) {
  const response = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: options.awaitPromise === true,
    returnByValue: true,
    timeout: options.timeoutMs ?? 15000
  }, options.timeoutMs ?? 15000)

  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text || 'Falha ao avaliar expressao no navegador.')
  }

  return response.result?.value
}

async function waitForFunction(client, expression, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15000
  const intervalMs = options.intervalMs ?? 150
  const deadline = Date.now() + timeoutMs
  let lastValue = null

  while (Date.now() < deadline) {
    try {
      lastValue = await evaluate(client, expression, { timeoutMs: Math.min(5000, timeoutMs) })
      if (lastValue) {
        return lastValue
      }
    } catch {
      // A pagina pode estar navegando; a proxima tentativa resolve.
    }
    await sleep(intervalMs)
  }

  throw new Error(`Timeout aguardando condicao no navegador: ${expression.slice(0, 180)} | ultimo=${JSON.stringify(lastValue)}`)
}

async function waitForSelector(client, selector, options = {}) {
  return waitForFunction(client, `Boolean(${selectorExpression(selector)})`, options)
}

async function clickSelector(client, selector) {
  const clicked = await evaluate(client, `(() => {
    const element = ${selectorExpression(selector)}
    if (!element || element.disabled) return false
    element.scrollIntoView({ block: 'center', inline: 'center' })
    element.click()
    return true
  })()`)

  if (!clicked) {
    throw new Error(`Elemento nao clicavel: ${selector}`)
  }
}

async function fillInput(client, selector, value) {
  const filled = await evaluate(client, `(() => {
    const element = ${selectorExpression(selector)}
    if (!element) return false
    element.focus()
    element.value = ${jsString(value)}
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)

  if (!filled) {
    throw new Error(`Input nao encontrado: ${selector}`)
  }
}

async function optionalClick(client, selector) {
  return evaluate(client, `(() => {
    const element = ${selectorExpression(selector)}
    if (!element || element.disabled) return false
    element.scrollIntoView({ block: 'center', inline: 'center' })
    element.click()
    return true
  })()`)
}

async function waitForHydratedLoginForm(client) {
  await waitForFunction(client, `(() => {
    const form = document.querySelector('form.admin-auth-form');
    const submit = document.querySelector('.admin-auth-submit');
    return Boolean(form && submit && !submit.disabled && form._vei?.onSubmit);
  })()`, { timeoutMs: 15000, intervalMs: 100 }).catch(() => sleep(1000))
}

async function waitForNavigationSettled(client) {
  await waitForFunction(client, `document.readyState === 'complete'`, { timeoutMs: 30000 })
  await sleep(350)
}

function summarizeRequests(requests) {
  const completed = requests.filter(item => !item.failed)
  const failed = requests.filter(item => item.failed)
  const byKind = {}
  let encodedBytes = 0

  for (const item of completed) {
    const kind = item.kind || 'other'
    encodedBytes += Number(item.encodedDataLength || 0)
    byKind[kind] = byKind[kind] || { count: 0, encodedBytes: 0 }
    byKind[kind].count += 1
    byKind[kind].encodedBytes += Number(item.encodedDataLength || 0)
  }

  const slowest = [...completed]
    .filter(item => item.durationMs !== null && item.durationMs !== undefined)
    .sort((a, b) => Number(b.durationMs || 0) - Number(a.durationMs || 0))
    .slice(0, 12)
    .map(item => ({
      url: item.url,
      status: item.status,
      type: item.type,
      kind: item.kind,
      durationMs: item.durationMs,
      encodedDataLength: item.encodedDataLength
    }))

  return {
    total: requests.length,
    completed: completed.length,
    failed: failed.length,
    encodedBytes,
    byKind,
    slowest
  }
}

async function runMeasuredAction(label, action) {
  const startedAt = Date.now()
  try {
    const result = await action()
    return {
      label,
      ok: result?.ok !== false,
      durationMs: Date.now() - startedAt,
      ...(result && typeof result === 'object' ? result : {})
    }
  } catch (error) {
    return {
      label,
      ok: false,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

async function main() {
  const chromePath = findChrome()
  const port = pickDebugPort()
  const userDataDir = await mkdtemp(resolve(tmpdir(), 'omni-fila-browser-'))
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-renderer-backgrounding',
    '--disable-dev-shm-usage',
    '--window-size=1440,1000'
  ]

  if (HEADLESS) {
    args.push('--headless=new')
  }

  const chrome = spawn(chromePath, args, {
    stdio: ['ignore', 'ignore', 'pipe']
  })

  const stderr = []
  chrome.stderr.on('data', chunk => {
    stderr.push(String(chunk))
  })

  let client
  const requestsById = new Map()
  const requests = []
  const consoleMessages = []

  try {
    await waitForDevTools(port)
    const target = await createTarget(port)
    client = new CdpClient(target.webSocketDebuggerUrl)
    await client.connect()

    client.on('Runtime.consoleAPICalled', (event) => {
      consoleMessages.push({
        type: event.type,
        text: (event.args || []).map(arg => String(arg.value ?? arg.description ?? '')).join(' '),
        timestamp: Date.now()
      })
    })

    client.on('Network.requestWillBeSent', (event) => {
      requestsById.set(event.requestId, {
        requestId: event.requestId,
        url: event.request?.url || '',
        method: event.request?.method || '',
        type: event.type || '',
        startedAt: event.timestamp,
        status: 0,
        mimeType: '',
        encodedDataLength: 0,
        durationMs: null,
        failed: false,
        kind: 'other'
      })
    })

    client.on('Network.responseReceived', (event) => {
      const item = requestsById.get(event.requestId)
      if (!item) return
      const url = item.url
      item.status = event.response?.status || 0
      item.mimeType = event.response?.mimeType || ''
      if (url.includes('/_nuxt/')) item.kind = 'asset'
      else if (url.includes('/api/admin/modules/fila-atendimento')) item.kind = 'fila-bff'
      else if (url.includes('/api/core-bff') || url.includes('/api/admin/profile')) item.kind = 'shell-bff'
      else if (url.startsWith(BASE_URL)) item.kind = 'document'
    })

    client.on('Network.loadingFinished', (event) => {
      const item = requestsById.get(event.requestId)
      if (!item) return
      item.encodedDataLength = Math.round(Number(event.encodedDataLength || 0))
      item.durationMs = Math.round(Math.max(0, Number(event.timestamp - item.startedAt) * 1000))
      requests.push(item)
      requestsById.delete(event.requestId)
    })

    client.on('Network.loadingFailed', (event) => {
      const item = requestsById.get(event.requestId) || {
        requestId: event.requestId,
        url: '',
        type: event.type || '',
        startedAt: event.timestamp,
        kind: 'other'
      }
      item.failed = true
      item.errorText = event.errorText
      requests.push(item)
      requestsById.delete(event.requestId)
    })

    await client.send('Page.enable')
    await client.send('Runtime.enable')
    await client.send('Network.enable')
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        (() => {
          window.__omniBrowserPerf = {
            startedAt: Date.now(),
            paints: [],
            lcp: null,
            cls: 0,
            longTasks: []
          };
          try {
            new PerformanceObserver((list) => {
              window.__omniBrowserPerf.paints.push(...list.getEntries().map((entry) => ({
                name: entry.name,
                startTime: Math.round(entry.startTime),
                duration: Math.round(entry.duration || 0)
              })));
            }).observe({ type: 'paint', buffered: true });
          } catch {}
          try {
            new PerformanceObserver((list) => {
              const entries = list.getEntries();
              const last = entries[entries.length - 1];
              if (last) {
                window.__omniBrowserPerf.lcp = {
                  startTime: Math.round(last.startTime),
                  size: Math.round(last.size || 0),
                  element: last.element?.tagName || ''
                };
              }
            }).observe({ type: 'largest-contentful-paint', buffered: true });
          } catch {}
          try {
            new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                if (!entry.hadRecentInput) {
                  window.__omniBrowserPerf.cls += Number(entry.value || 0);
                }
              }
            }).observe({ type: 'layout-shift', buffered: true });
          } catch {}
          try {
            new PerformanceObserver((list) => {
              window.__omniBrowserPerf.longTasks.push(...list.getEntries().map((entry) => ({
                startTime: Math.round(entry.startTime),
                duration: Math.round(entry.duration)
              })));
            }).observe({ type: 'longtask', buffered: true });
          } catch {}
        })();
      `
    })

    await client.send('Page.navigate', { url: `${BASE_URL}/admin/login?redirect=/admin/fila-atendimento` })
    await waitForSelector(client, '#admin-login-username', { timeoutMs: 30000 })
    await waitForHydratedLoginForm(client)
    await fillInput(client, '#admin-login-username', LOGIN_EMAIL)
    await fillInput(client, '#admin-login-password', LOGIN_PASSWORD)
    await optionalClick(client, '.admin-auth-checkbox__check:not(:checked)')
    const loginAction = await runMeasuredAction('login', async () => {
      await clickSelector(client, '.admin-auth-submit')
      const uiLogin = await waitForFunction(client, `(() => {
        const token = localStorage.getItem('core:token') || sessionStorage.getItem('core:token');
        if (location.pathname !== '/admin/login' && token) {
          return { ok: true, mode: 'ui', path: location.pathname };
        }
        return false;
      })()`, { timeoutMs: 3000 }).catch(() => null)

      if (uiLogin) {
        return uiLogin
      }

      const beforeFallback = await evaluate(client, `(() => ({
        path: location.pathname,
        error: document.querySelector('.admin-auth-alert--error')?.textContent?.trim() || '',
        loading: document.querySelector('.admin-auth-submit')?.textContent?.trim() || ''
      }))()`)

      const fallback = await evaluate(client, `(async () => {
        const response = await fetch('/api/core-bff/core/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: ${jsString(LOGIN_EMAIL)},
            password: ${jsString(LOGIN_PASSWORD)},
            rememberLogin: true
          })
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.accessToken || !data?.user) {
          return { ok: false, status: response.status, data };
        }
        localStorage.setItem('admin:session:persistence', 'persistent');
        localStorage.setItem('core:token', data.accessToken);
        localStorage.setItem('core:user', JSON.stringify(data.user));
        if (data.expiresAt) {
          localStorage.setItem('core:expires-at', data.expiresAt);
        }
        return {
          ok: true,
          status: response.status,
          userEmail: data.user.email || '',
          expiresAt: data.expiresAt || ''
        };
      })()`, { awaitPromise: true, timeoutMs: 30000 })

      if (!fallback?.ok) {
        throw new Error(`Login pela UI e fallback BFF falharam: ${JSON.stringify({ beforeFallback, fallback })}`)
      }

      await client.send('Page.navigate', { url: `${BASE_URL}/admin/fila-atendimento` })
      await waitForFunction(client, `location.pathname !== '/admin/login' && Boolean(localStorage.getItem('core:token'))`, { timeoutMs: 15000 })
      return { ok: true, mode: 'bff-fallback', beforeFallback, ...fallback, path: await evaluate(client, 'location.pathname') }
    })

    await client.send('Network.clearBrowserCache')
    requests.length = 0
    requestsById.clear()

    const navigateStartedAt = Date.now()
    await client.send('Page.navigate', { url: `${BASE_URL}/admin/fila-atendimento` })
    await waitForNavigationSettled(client)
    const boardReady = await waitForFunction(client, `(() => {
      const board = document.querySelector('[data-testid="operation-board"]');
      if (!board) return false;
      window.__omniFilaBoardReadyAt = window.__omniFilaBoardReadyAt || performance.now();
      return {
        boardReadyAtMs: Math.round(window.__omniFilaBoardReadyAt),
        waitingCount: document.querySelectorAll('[data-testid^="operation-waiting-"]').length,
        serviceCount: document.querySelectorAll('[data-testid^="operation-service-"]').length,
        consultantCount: document.querySelectorAll('[data-testid^="operation-consultant-"]').length,
        text: document.body.innerText.slice(0, 500)
      };
    })()`, { timeoutMs: 45000 })

    const navigationMs = Date.now() - navigateStartedAt

    const actionResults = [loginAction]

    const pauseTarget = await evaluate(client, `(() => {
      const button = [...document.querySelectorAll('button[data-testid^="operation-pause-"]')].find(item => !item.disabled);
      return button?.dataset?.testid?.replace('operation-pause-', '') || '';
    })()`)
    let resumedInitialTarget = ''

    if (pauseTarget) {
      actionResults.push(await runMeasuredAction('ui.pause', async () => {
        await clickSelector(client, `[data-testid="operation-pause-${pauseTarget}"]`)
        await waitForSelector(client, '[data-testid="ui-dialog-input"]', { timeoutMs: 10000 })
        await fillInput(client, '[data-testid="ui-dialog-input"]', `Metrica pausa ${Date.now()}`)
        await clickSelector(client, '[data-testid="ui-dialog-confirm"]')
        await waitForSelector(client, `[data-testid="operation-resume-${pauseTarget}"]`, { timeoutMs: 20000 })
        return { ok: true, personId: pauseTarget }
      }))

      actionResults.push(await runMeasuredAction('ui.resume', async () => {
        await clickSelector(client, `[data-testid="operation-resume-${pauseTarget}"]`)
        await waitForFunction(client, `Boolean(document.querySelector('[data-testid="operation-pause-${pauseTarget}"], [data-testid="operation-add-to-queue-${pauseTarget}"]'))`, { timeoutMs: 20000 })
        return { ok: true, personId: pauseTarget }
      }))
    } else {
      const resumeTarget = await evaluate(client, `(() => {
        const button = [...document.querySelectorAll('button[data-testid^="operation-resume-"]')].find(item => !item.disabled);
        return button?.dataset?.testid?.replace('operation-resume-', '') || '';
      })()`)
      if (resumeTarget) {
        actionResults.push(await runMeasuredAction('ui.resume_initial', async () => {
          await clickSelector(client, `[data-testid="operation-resume-${resumeTarget}"]`)
          await waitForFunction(client, `Boolean(document.querySelector('[data-testid="operation-pause-${resumeTarget}"], [data-testid="operation-add-to-queue-${resumeTarget}"]'))`, { timeoutMs: 20000 })
          resumedInitialTarget = resumeTarget
          return { ok: true, personId: resumeTarget }
        }))
      }
    }

    let queueTarget = await evaluate(client, `(() => {
      const button = [...document.querySelectorAll('button[data-testid^="operation-add-to-queue-"]')].find(item => !item.disabled);
      return button?.dataset?.testid?.replace('operation-add-to-queue-', '') || '';
    })()`)
    if (!queueTarget && resumedInitialTarget) {
      queueTarget = await evaluate(client, `(() => {
        const selector = ${jsString(`[data-testid="operation-add-to-queue-${resumedInitialTarget}"]`)};
        const button = document.querySelector(selector);
        return button && !button.disabled ? ${jsString(resumedInitialTarget)} : '';
      })()`)
    }

    let serviceTarget = ''
    if (queueTarget) {
      actionResults.push(await runMeasuredAction('ui.queue', async () => {
        await clickSelector(client, `[data-testid="operation-add-to-queue-${queueTarget}"]`)
        await waitForSelector(client, `[data-testid="operation-waiting-${queueTarget}"]`, { timeoutMs: 20000 })
        return { ok: true, personId: queueTarget }
      }))

      actionResults.push(await runMeasuredAction('ui.start_specific', async () => {
        const specificSelector = `[data-testid="operation-start-specific-${queueTarget}"]`
        const hasSpecific = await evaluate(client, `Boolean(${selectorExpression(specificSelector)} && !${selectorExpression(specificSelector)}.disabled)`)
        if (hasSpecific) {
          await clickSelector(client, specificSelector)
          serviceTarget = queueTarget
        } else {
          await clickSelector(client, '[data-testid="operation-start-first"]')
          serviceTarget = await waitForFunction(client, `(() => {
            const service = document.querySelector('article[data-testid^="operation-service-"]');
            return service?.dataset?.testid?.replace('operation-service-', '') || '';
          })()`, { timeoutMs: 20000 })
        }
        await waitForSelector(client, `[data-testid="operation-service-${serviceTarget}"]`, { timeoutMs: 20000 })
        return { ok: true, personId: serviceTarget }
      }))
    }

    if (!serviceTarget) {
      const canStartWaiting = await evaluate(client, `(() => {
        const button = document.querySelector('[data-testid="operation-start-first"]');
        return Boolean(button && !button.disabled);
      })()`)
      if (canStartWaiting) {
        actionResults.push(await runMeasuredAction('ui.start_first_existing', async () => {
          await clickSelector(client, '[data-testid="operation-start-first"]')
          serviceTarget = await waitForFunction(client, `(() => {
            const service = document.querySelector('article[data-testid^="operation-service-"]');
            return service?.dataset?.testid?.replace('operation-service-', '') || '';
          })()`, { timeoutMs: 20000 })
          await waitForSelector(client, `[data-testid="operation-service-${serviceTarget}"]`, { timeoutMs: 20000 })
          return { ok: true, personId: serviceTarget }
        }))
      }
    }

    if (!serviceTarget) {
      serviceTarget = await evaluate(client, `(() => {
        const button = [...document.querySelectorAll('button[data-testid^="operation-finish-"]')].find(item => !item.disabled);
        return button?.dataset?.testid?.replace('operation-finish-', '') || '';
      })()`)
    }

    if (serviceTarget) {
      actionResults.push(await runMeasuredAction('ui.finish', async () => {
        await waitForFunction(client, `(() => {
          const button = document.querySelector(${jsString(`[data-testid="operation-finish-${serviceTarget}"]`)});
          return Boolean(button && !button.disabled);
        })()`, { timeoutMs: 10000 })
        await clickSelector(client, `[data-testid="operation-finish-${serviceTarget}"]`)
        await waitForSelector(client, '[data-testid="operation-finish-modal"]', { timeoutMs: 15000 })
        await optionalClick(client, '[data-testid="operation-fill-test-data"]')
        const finishStep = await waitForFunction(client, `(() => {
          const submit = document.querySelector('[data-testid="operation-finish-submit"]');
          if (submit) return 'submit';
          const next = document.querySelector('[data-testid="operation-step-next"]');
          return next && !next.disabled ? 'next' : false;
        })()`, { timeoutMs: 10000 })
        if (finishStep === 'next') {
          await clickSelector(client, '[data-testid="operation-step-next"]')
        }
        await waitForSelector(client, '[data-testid="operation-finish-submit"]', { timeoutMs: 15000 })
        await optionalClick(client, '[data-testid="operation-fill-test-data-step-2"]')
        await waitForFunction(client, `(() => {
          const submit = document.querySelector('[data-testid="operation-finish-submit"]');
          return Boolean(submit && !submit.disabled);
        })()`, { timeoutMs: 10000 })
        await clickSelector(client, '[data-testid="operation-finish-submit"]')
        await waitForFunction(client, `!document.querySelector('[data-testid="operation-finish-modal"]') && !document.querySelector('[data-testid="operation-service-${serviceTarget}"]')`, { timeoutMs: 30000 })
        return { ok: true, personId: serviceTarget }
      }))
    }

    await sleep(1800)

    const realtimeReady = await waitForFunction(client, `document.body.innerText.includes('Realtime conectado')`, { timeoutMs: 15000 }).catch(() => false)
    const realtimeTarget = await evaluate(client, `(() => {
      const button = [...document.querySelectorAll('button[data-testid^="operation-pause-"]')].find(item => !item.disabled);
      return button?.dataset?.testid?.replace('operation-pause-', '') || '';
    })()`)
    const storeId = await evaluate(client, `fetch('/api/admin/modules/fila-atendimento/context')
      .then(response => response.ok ? response.json() : null)
      .then(payload => payload?.context?.activeStoreId || payload?.context?.stores?.[0]?.id || '')
      .catch(() => '')`, { awaitPromise: true, timeoutMs: 10000 })

    if (realtimeReady && realtimeTarget && storeId) {
      actionResults.push(await runMeasuredAction('realtime.external_pause', async () => {
        const response = await evaluate(client, `fetch('/api/admin/modules/fila-atendimento/operations-pause', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ personId: ${jsString(realtimeTarget)}, storeId: ${jsString(storeId)}, reason: 'Metrica realtime externa' })
        }).then(response => ({ ok: response.ok, status: response.status }))`, { awaitPromise: true, timeoutMs: 15000 })
        if (!response?.ok) {
          return { ...response, ok: false, personId: realtimeTarget, storeId, uiUpdated: false }
        }
        const uiUpdated = await waitForSelector(client, `[data-testid="operation-resume-${realtimeTarget}"]`, { timeoutMs: 25000 })
          .then(() => true)
          .catch((error) => ({ error: error instanceof Error ? error.message : String(error) }))
        if (uiUpdated !== true) {
          return { ...response, ok: false, personId: realtimeTarget, storeId, uiUpdated: false, error: uiUpdated.error }
        }
        return { ...response, personId: realtimeTarget, storeId, uiUpdated: true }
      }))

      actionResults.push(await runMeasuredAction('realtime.external_resume', async () => {
        const response = await evaluate(client, `fetch('/api/admin/modules/fila-atendimento/operations-resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ personId: ${jsString(realtimeTarget)}, storeId: ${jsString(storeId)} })
        }).then(response => ({ ok: response.ok, status: response.status }))`, { awaitPromise: true, timeoutMs: 15000 })
        if (!response?.ok) {
          return { ...response, ok: false, personId: realtimeTarget, storeId, uiUpdated: false }
        }
        const uiUpdated = await waitForFunction(client, `Boolean(document.querySelector('[data-testid="operation-pause-${realtimeTarget}"], [data-testid="operation-add-to-queue-${realtimeTarget}"]'))`, { timeoutMs: 25000 })
          .then(() => true)
          .catch((error) => ({ error: error instanceof Error ? error.message : String(error) }))
        if (uiUpdated !== true) {
          return { ...response, ok: false, personId: realtimeTarget, storeId, uiUpdated: false, error: uiUpdated.error }
        }
        return { ...response, personId: realtimeTarget, storeId, uiUpdated: true }
      }))
    } else {
      actionResults.push({
        label: 'realtime.external_mutation',
        ok: false,
        skipped: true,
        reason: realtimeReady ? 'sem alvo/store disponivel' : 'realtime nao conectou dentro do tempo'
      })
    }

    const perf = await evaluate(client, `(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const paints = performance.getEntriesByType('paint').map(entry => ({
        name: entry.name,
        startTime: Math.round(entry.startTime)
      }));
      const resources = performance.getEntriesByType('resource').map(entry => ({
        name: entry.name,
        initiatorType: entry.initiatorType,
        startTime: Math.round(entry.startTime),
        duration: Math.round(entry.duration),
        transferSize: Math.round(entry.transferSize || 0),
        encodedBodySize: Math.round(entry.encodedBodySize || 0),
        decodedBodySize: Math.round(entry.decodedBodySize || 0)
      })).filter(entry => entry.name.includes('/_nuxt/') || entry.name.includes('/api/admin/modules/fila-atendimento') || entry.name.includes('/api/core-bff'));
      return {
        url: location.href,
        navigation: nav ? {
          startTime: Math.round(nav.startTime),
          domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
          loadEventEndMs: Math.round(nav.loadEventEnd),
          responseEndMs: Math.round(nav.responseEnd),
          transferSize: Math.round(nav.transferSize || 0),
          encodedBodySize: Math.round(nav.encodedBodySize || 0),
          decodedBodySize: Math.round(nav.decodedBodySize || 0)
        } : null,
        boardReadyAtMs: Math.round(window.__omniFilaBoardReadyAt || 0),
        browserPerf: window.__omniBrowserPerf,
        paints,
        resources,
        documentText: document.body.innerText.slice(0, 1000)
      };
    })()`, { timeoutMs: 10000 })

    const result = {
      collectedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      loginEmail: LOGIN_EMAIL,
      chromePath,
      headless: HEADLESS,
      page: {
        navigationMs,
        boardReady,
        perf
      },
      network: summarizeRequests(requests),
      actions: actionResults,
      consoleMessages: consoleMessages
        .filter(item => ['error', 'warning'].includes(item.type))
        .slice(-30)
    }

    await evaluate(client, `fetch('/api/admin/modules/fila-atendimento/metrics-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pageKey: 'fila-atendimento.operacao',
        pagePath: '/admin/fila-atendimento',
        eventType: 'browser',
        eventKey: 'fila.operacao.browser.hydration',
        storeId: ${jsString(storeId || '')},
        status: 'ok',
        severity: 'info',
        durationMs: ${Number(perf.boardReadyAtMs || 0)},
        summary: 'Hidratacao da fila medida em Chrome headless.',
        metadata: ${JSON.stringify({
          navigationMs,
          actionCount: actionResults.length,
          network: result.network,
          paints: perf.paints
        })}
      })
    }).then(response => response.ok).catch(() => false)`, { awaitPromise: true, timeoutMs: 10000 }).catch(() => false)

    await mkdir(dirname(OUTPUT_FILE), { recursive: true })
    await writeFile(OUTPUT_FILE, `${JSON.stringify(result, null, 2)}\n`, 'utf8')

    console.log(JSON.stringify({
      outputFile: OUTPUT_FILE,
      boardReadyAtMs: result.page.perf.boardReadyAtMs,
      navigationMs: result.page.navigationMs,
      requests: result.network.total,
      encodedBytes: result.network.encodedBytes,
      actions: result.actions.map(action => ({
        label: action.label,
        ok: action.ok,
        durationMs: action.durationMs,
        skipped: action.skipped || false
      }))
    }, null, 2))
  } finally {
    client?.close()
    chrome.kill()
    await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined)
    if (stderr.length > 0 && process.env.FILA_BROWSER_DEBUG === 'true') {
      console.error(stderr.join(''))
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
