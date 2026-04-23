import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { coreTokenRef, fetchMock, invalidateSessionMock } = vi.hoisted(() => ({
  coreTokenRef: { value: '' },
  fetchMock: vi.fn(),
  invalidateSessionMock: vi.fn()
}))

mockNuxtImport('useAdminSession', () => {
  return () => ({
    coreToken: coreTokenRef,
    invalidateSession: invalidateSessionMock
  })
})

import { useFilaAtendimentoOperationsStore } from '../../modules/fila-atendimento/runtime/app/stores/fila-atendimento/operations'

describe('useFilaAtendimentoOperationsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    vi.stubGlobal('$fetch', fetchMock)
  })

  it('usa snapshot leve no refresh operacional e preserva o historico local', async () => {
    const store = useFilaAtendimentoOperationsStore()
    store.state = {
      ...store.state,
      activeStoreId: 'store-1',
      serviceHistory: [{ serviceId: 'svc-1', personId: 'consultant-1' }] as any
    }

    fetchMock.mockResolvedValue({
      waitingList: [],
      activeServices: [],
      pausedEmployees: [],
      consultantCurrentStatus: {}
    })

    await store.refreshOperationSnapshot('store-1', { includeHistory: false })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/admin/modules/fila-atendimento/operations-snapshot?storeId=store-1&includeHistory=false&includeActivitySessions=false'
    )
    expect(store.state.serviceHistory).toEqual([{ serviceId: 'svc-1', personId: 'consultant-1' }])
  })

  it('permite refresh completo quando includeHistory nao e desabilitado', async () => {
    const store = useFilaAtendimentoOperationsStore()
    store.state = {
      ...store.state,
      activeStoreId: 'store-1',
      serviceHistory: [{ serviceId: 'svc-antigo' }] as any
    }

    fetchMock.mockResolvedValue({
      waitingList: [],
      activeServices: [],
      pausedEmployees: [],
      consultantCurrentStatus: {},
      serviceHistory: [{ serviceId: 'svc-novo' }]
    })

    await store.refreshOperationSnapshot('store-1')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/admin/modules/fila-atendimento/operations-snapshot?storeId=store-1&includeHistory=true&includeActivitySessions=false'
    )
    expect(store.state.serviceHistory).toEqual([{ serviceId: 'svc-novo' }])
  })

  it('reaproveita slices ja carregados na mesma loja e so recarrega snapshot quando passa a precisar de historico', async () => {
    const store = useFilaAtendimentoOperationsStore()
    store.state = {
      ...store.state,
      activeStoreId: 'store-1'
    }

    fetchMock
      .mockResolvedValueOnce({
        waitingList: [],
        activeServices: [],
        pausedEmployees: [],
        consultantCurrentStatus: {}
      })
      .mockResolvedValueOnce({ consultants: [] })
      .mockResolvedValueOnce({ settings: { testModeEnabled: true } })

    await store.ensureWorkspaceData('store-1', {
      includeSnapshot: true,
      includeConsultants: true,
      includeSettings: true,
      includeHistory: false,
      includeActivitySessions: false
    })

    expect(fetchMock).toHaveBeenCalledTimes(3)

    fetchMock.mockClear()

    await store.ensureWorkspaceData('store-1', {
      includeSnapshot: true,
      includeConsultants: true,
      includeSettings: true,
      includeHistory: false,
      includeActivitySessions: false
    })

    expect(fetchMock).not.toHaveBeenCalled()

    fetchMock.mockResolvedValueOnce({
      waitingList: [],
      activeServices: [],
      pausedEmployees: [],
      consultantCurrentStatus: {},
      serviceHistory: [{ serviceId: 'svc-1' }]
    })

    await store.ensureWorkspaceData('store-1', {
      includeSnapshot: true,
      includeConsultants: true,
      includeSettings: true,
      includeHistory: true,
      includeActivitySessions: false
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/admin/modules/fila-atendimento/operations-snapshot?storeId=store-1&includeHistory=true&includeActivitySessions=false'
    )
    expect(store.state.serviceHistory).toEqual([{ serviceId: 'svc-1' }])
  })

  it('carrega settings sob demanda antes de abrir o modal de fechamento e nao repete o fetch na mesma loja', async () => {
    const store = useFilaAtendimentoOperationsStore()
    store.state = {
      ...store.state,
      activeStoreId: 'store-1'
    }

    fetchMock.mockResolvedValueOnce({
      settings: {
        testModeEnabled: true,
        autoFillFinishModal: true
      },
      modalConfig: {
        title: 'Fechar atendimento'
      },
      visitReasonOptions: [],
      customerSourceOptions: [],
      queueJumpReasonOptions: [],
      lossReasonOptions: [],
      professionOptions: [],
      productCatalog: [],
      campaigns: []
    })

    await store.openFinishModal('consultant-1')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/admin/modules/fila-atendimento/settings?storeId=store-1')
    expect(store.state.finishModalPersonId).toBe('consultant-1')
    expect(store.state.settings.testModeEnabled).toBe(true)
    expect(store.state.settings.autoFillFinishModal).toBe(true)

    fetchMock.mockClear()

    await store.openFinishModal('consultant-2')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(store.state.finishModalPersonId).toBe('consultant-2')
  })

  it('mantem a supressao de refresh realtime durante toda a janela apos mutacao local', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:00:00Z'))

    try {
      const store = useFilaAtendimentoOperationsStore()
      store.state = {
        ...store.state,
        activeStoreId: 'store-1'
      }

      fetchMock.mockResolvedValue({
        ok: true,
        delta: {
          removeWaitingPersonId: 'consultant-1',
          activeService: {
            id: 'consultant-1',
            name: 'Consultor 1',
            role: 'Consultor',
            initials: 'C1',
            color: '#168aad',
            serviceId: 'svc-1',
            serviceStartedAt: 2000,
            queueJoinedAt: 1000,
            queueWaitMs: 1000,
            queuePositionAtStart: 1,
            startMode: 'queue',
            skippedPeople: []
          },
          consultantStatus: {
            personId: 'consultant-1',
            status: {
              status: 'service',
              startedAt: 2000
            }
          }
        }
      })

      await store.startService('consultant-1')

      expect(store.consumeSuppressedRealtimeRefresh('store-1')).toBe(true)
      expect(store.consumeSuppressedRealtimeRefresh('store-1')).toBe(true)

      vi.advanceTimersByTime(1501)

      expect(store.consumeSuppressedRealtimeRefresh('store-1')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('aplica delta local no start sem recarregar snapshot', async () => {
    const store = useFilaAtendimentoOperationsStore()
    store.state = {
      ...store.state,
      activeStoreId: 'store-1',
      waitingList: [{ id: 'consultant-1', name: 'Consultor 1', role: 'Consultor', initials: 'C1', color: '#168aad', queueJoinedAt: 1000 }],
      activeServices: [],
      pausedEmployees: [],
      consultantCurrentStatus: {
        'consultant-1': { status: 'queue', startedAt: 1000 }
      }
    }

    fetchMock.mockResolvedValue({
      ok: true,
      delta: {
        removeWaitingPersonId: 'consultant-1',
        activeService: {
          id: 'consultant-1',
          name: 'Consultor 1',
          role: 'Consultor',
          initials: 'C1',
          color: '#168aad',
          serviceId: 'svc-1',
          serviceStartedAt: 2000,
          queueJoinedAt: 1000,
          queueWaitMs: 1000,
          queuePositionAtStart: 1,
          startMode: 'queue',
          skippedPeople: []
        },
        consultantStatus: {
          personId: 'consultant-1',
          status: {
            status: 'service',
            startedAt: 2000
          }
        }
      }
    })

    const result = await store.startService('consultant-1')

    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/admin/modules/fila-atendimento/operations-start')
    expect(store.state.waitingList).toEqual([])
    expect(store.state.activeServices).toEqual([
      expect.objectContaining({ id: 'consultant-1', serviceId: 'svc-1' })
    ])
    expect(store.state.consultantCurrentStatus['consultant-1']).toEqual({ status: 'service', startedAt: 2000 })
  })

  it('aplica delta local no finish sem recarregar snapshot', async () => {
    const store = useFilaAtendimentoOperationsStore()
    store.state = {
      ...store.state,
      activeStoreId: 'store-1',
      finishModalPersonId: 'consultant-1',
      waitingList: [],
      activeServices: [{
        id: 'consultant-1',
        name: 'Consultor 1',
        role: 'Consultor',
        initials: 'C1',
        color: '#168aad',
        serviceId: 'svc-1',
        serviceStartedAt: 2000,
        queueJoinedAt: 1000,
        queueWaitMs: 1000,
        queuePositionAtStart: 1,
        startMode: 'queue',
        skippedPeople: []
      }],
      pausedEmployees: [],
      consultantCurrentStatus: {
        'consultant-1': { status: 'service', startedAt: 2000 }
      },
      serviceHistory: []
    }

    fetchMock.mockResolvedValue({
      ok: true,
      delta: {
        removeActivePersonId: 'consultant-1',
        waitingEntry: {
          id: 'consultant-1',
          name: 'Consultor 1',
          role: 'Consultor',
          initials: 'C1',
          color: '#168aad',
          queueJoinedAt: 3000
        },
        consultantStatus: {
          personId: 'consultant-1',
          status: {
            status: 'queue',
            startedAt: 3000
          }
        },
        serviceHistoryEntry: {
          serviceId: 'svc-1',
          personId: 'consultant-1',
          personName: 'Consultor 1',
          storeId: 'store-1',
          storeName: 'Loja 1',
          finishedAt: 3000,
          finishOutcome: 'compra',
          saleAmount: 3900,
          productsClosed: [{ name: 'Anel', code: 'ANE-1' }],
          campaignMatches: []
        }
      }
    })

    const result = await store.finishService({ personId: 'consultant-1', outcome: 'compra' })

    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/admin/modules/fila-atendimento/operations-finish')
    expect(store.state.activeServices).toEqual([])
    expect(store.state.waitingList).toEqual([
      expect.objectContaining({ id: 'consultant-1', queueJoinedAt: 3000 })
    ])
    expect(store.state.serviceHistory).toEqual([
      expect.objectContaining({ serviceId: 'svc-1', finishOutcome: 'compra' })
    ])
    expect(store.state.finishModalPersonId).toBe('')
  })
})