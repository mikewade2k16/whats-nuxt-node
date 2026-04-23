import { describe, expect, it } from 'vitest'

import { buildFinishModalTestDraft, isFinishModalTestModeEnabled } from '../../modules/fila-atendimento/runtime/app/utils/fila-atendimento/test-mode'

describe('fila-atendimento test mode', () => {
  it('ativa autofill apenas quando modo teste e preenchimento automatico estao ligados', () => {
    expect(isFinishModalTestModeEnabled({ settings: { testModeEnabled: true, autoFillFinishModal: true } } as never)).toBe(true)
    expect(isFinishModalTestModeEnabled({ settings: { testModeEnabled: true, autoFillFinishModal: false } } as never)).toBe(false)
    expect(isFinishModalTestModeEnabled({ settings: { testModeEnabled: false, autoFillFinishModal: true } } as never)).toBe(false)
  })

  it('gera um rascunho valido e preenchido para testes manuais rapidos', () => {
    const draft = buildFinishModalTestDraft({
      settings: {
        testModeEnabled: true,
        autoFillFinishModal: true
      },
      modalConfig: {
        showEmailField: true,
        showProfessionField: true
      },
      productCatalog: [
        { id: 'product-1', name: 'Anel Solitario Ouro 18k', code: 'ANE-OURO-001', basePrice: 3900 }
      ],
      visitReasonOptions: [
        { id: 'pedido-noivado', label: 'Pedido de noivado' }
      ],
      customerSourceOptions: [
        { id: 'trafego-pago', label: 'Trafego pago' }
      ],
      professionOptions: [
        { id: 'arquiteta', label: 'Arquiteta' }
      ],
      lossReasonOptions: [
        { id: 'preco', label: 'Preco' }
      ],
      queueJumpReasonOptions: [
        { id: 'encaixe', label: 'Encaixe' }
      ]
    } as never, { startMode: 'queue-jump' }, () => 0)

    expect(['compra', 'reserva', 'nao-compra']).toContain(draft.outcome)
    expect(draft.customerName.length).toBeGreaterThan(3)
    expect(draft.customerPhone.length).toBeGreaterThanOrEqual(10)
    expect(draft.customerEmail).toContain('@')
    expect(draft.productsSeen).toHaveLength(1)
    expect(draft.productsSeen[0]?.name).toBe('Anel Solitario Ouro 18k')
    expect(draft.visitReasonIds).toEqual(['pedido-noivado'])
    expect(draft.customerSourceIds).toEqual(['trafego-pago'])
    expect(draft.customerProfessionId).toBe('arquiteta')
    expect(draft.queueJumpReasonId).toBe('encaixe')
    expect(draft.notes.length).toBeGreaterThan(5)
  })

  it('usa fallback de nao informado quando faltam opcoes obrigatorias', () => {
    const draft = buildFinishModalTestDraft({
      settings: {
        testModeEnabled: true,
        autoFillFinishModal: true
      },
      modalConfig: {},
      productCatalog: [],
      visitReasonOptions: [],
      customerSourceOptions: [],
      professionOptions: [],
      lossReasonOptions: [],
      queueJumpReasonOptions: []
    } as never, { startMode: 'queue' }, () => 0)

    expect(draft.productsSeen).toHaveLength(1)
    expect(draft.visitReasonNotInformed).toBe(true)
    expect(draft.customerSourceNotInformed).toBe(true)
    expect(draft.lossReasonIds).toEqual([])
    expect(['compra', 'reserva']).toContain(draft.outcome)
  })
})