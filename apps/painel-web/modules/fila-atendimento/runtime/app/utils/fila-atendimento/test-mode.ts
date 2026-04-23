import type {
  FilaAtendimentoActiveService,
  FilaAtendimentoOperationState,
  FilaAtendimentoSettingsOptionItem,
  FilaAtendimentoSettingsProductItem
} from '~/types/fila-atendimento'

type FinishModalProductDraft = {
  id: string
  name: string
  label: string
  price: number
  code: string
  isCustom: boolean
}

export type FinishModalTestDraft = {
  outcome: string
  isWindowService: boolean
  isGift: boolean
  isExistingCustomer: boolean
  productsSeen: FinishModalProductDraft[]
  productsClosed: FinishModalProductDraft[]
  productsSeenNone: boolean
  customerName: string
  customerPhone: string
  customerEmail: string
  customerProfessionId: string
  visitReasonIds: string[]
  visitReasonNotInformed: boolean
  visitReasonDetails: Record<string, string>
  customerSourceIds: string[]
  customerSourceNotInformed: boolean
  customerSourceDetails: Record<string, string>
  queueJumpReasonId: string
  lossReasonIds: string[]
  lossReasonDetails: Record<string, string>
  notes: string
}

const TEST_FIRST_NAMES = ['Ana', 'Bruno', 'Camila', 'Diego', 'Fernanda', 'Guilherme', 'Helena', 'Igor']
const TEST_LAST_NAMES = ['Silva', 'Souza', 'Santos', 'Oliveira', 'Lima', 'Costa', 'Almeida', 'Menezes']
const TEST_EMAIL_DOMAINS = ['teste.local', 'mail.test', 'manual.test']
const TEST_FALLBACK_PRODUCTS = [
  { name: 'Anel Solitario Ouro 18k', code: 'ANE-TEST-001', price: 3900 },
  { name: 'Alianca Classica Ouro', code: 'ALI-TEST-002', price: 2400 },
  { name: 'Brinco Ponto de Luz', code: 'BRI-TEST-003', price: 980 }
]
const TEST_REASON_DETAILS = [
  'Cliente comparando modelos.',
  'Busca por presente especial.',
  'Atendimento rapido de vitrine.',
  'Cliente pediu variacoes de tamanho.'
]
const TEST_SOURCE_DETAILS = [
  'Veio por indicacao familiar.',
  'Chegou por campanha patrocinada.',
  'Entrou apos ver vitrine no corredor.',
  'Retorno de contato anterior.'
]
const TEST_LOSS_DETAILS = [
  'Cliente vai avaliar com outra pessoa.',
  'Valor acima do esperado no momento.',
  'Nao encontrou o modelo desejado.'
]
const TEST_NOTES = [
  'Registro automatico para teste manual.',
  'Cliente reagiu bem ao produto principal.',
  'Preenchimento gerado pelo modo teste.'
]

function pickIndex(length: number, random: () => number) {
  if (length <= 1) {
    return 0
  }

  return Math.min(length - 1, Math.max(0, Math.floor(random() * length)))
}

function pickOne<T>(items: T[], random: () => number): T {
  return items[pickIndex(items.length, random)]
}

function pickBoolean(random: () => number, threshold = 0.5) {
  return random() >= threshold
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function slugify(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
}

function buildCustomerName(random: () => number) {
  return `${pickOne(TEST_FIRST_NAMES, random)} ${pickOne(TEST_LAST_NAMES, random)} ${pickOne(TEST_LAST_NAMES, random)}`
}

function buildCustomerPhone(random: () => number) {
  const dddOptions = ['11', '21', '31', '41', '71', '79']
  const suffix = Array.from({ length: 8 }, () => String(pickIndex(10, random))).join('')
  return `${pickOne(dddOptions, random)}9${suffix}`
}

function buildCustomerEmail(name: string, random: () => number) {
  const domain = pickOne(TEST_EMAIL_DOMAINS, random)
  const suffix = String(100 + pickIndex(900, random))
  return `${slugify(name)}.${suffix}@${domain}`
}

function buildProductDraft(product: Partial<FilaAtendimentoSettingsProductItem>, fallbackIndex: number) {
  const name = normalizeText(product.name) || `Produto teste ${fallbackIndex + 1}`
  const code = normalizeText(product.code).toUpperCase() || `TEST-${fallbackIndex + 1}`
  const price = Math.max(0, Number(product.basePrice ?? 0) || 0)

  return {
    id: normalizeText(product.id) || `test-product-${fallbackIndex + 1}`,
    name,
    label: name,
    price,
    code,
    isCustom: false
  } satisfies FinishModalProductDraft
}

function buildFallbackProduct(random: () => number) {
  const product = pickOne(TEST_FALLBACK_PRODUCTS, random)
  return {
    id: `fallback-${slugify(product.code)}`,
    name: product.name,
    label: product.name,
    price: product.price,
    code: product.code,
    isCustom: true
  } satisfies FinishModalProductDraft
}

function pickProductDraft(state: FilaAtendimentoOperationState, random: () => number) {
  const catalog = Array.isArray(state.productCatalog) ? state.productCatalog : []
  if (catalog.length < 1) {
    return buildFallbackProduct(random)
  }

  return buildProductDraft(pickOne(catalog, random), pickIndex(catalog.length, random))
}

function pickOptionId(options: FilaAtendimentoSettingsOptionItem[], random: () => number) {
  if (!Array.isArray(options) || options.length < 1) {
    return ''
  }

  return normalizeText(pickOne(options, random).id)
}

function buildDetails(ids: string[], detailSamples: string[], random: () => number) {
  return Object.fromEntries(
    ids.map((id) => [id, pickOne(detailSamples, random)])
  )
}

function canUseLossOutcome(state: FilaAtendimentoOperationState) {
  return Array.isArray(state.lossReasonOptions) && state.lossReasonOptions.length > 0
}

export function isFinishModalTestModeEnabled(state: Pick<FilaAtendimentoOperationState, 'settings'> | null | undefined) {
  return Boolean(state?.settings?.testModeEnabled && state?.settings?.autoFillFinishModal)
}

export function buildFinishModalTestDraft(
  state: FilaAtendimentoOperationState,
  service: Pick<FilaAtendimentoActiveService, 'startMode'> | null | undefined,
  random: () => number = Math.random
): FinishModalTestDraft {
  const outcomes = canUseLossOutcome(state)
    ? ['compra', 'reserva', 'nao-compra']
    : ['compra', 'reserva']
  const outcome = pickOne(outcomes, random)
  const closedOutcome = outcome === 'compra' || outcome === 'reserva'
  const customerName = buildCustomerName(random)
  const customerPhone = buildCustomerPhone(random)
  const seenProduct = pickProductDraft(state, random)
  const closedProduct = closedOutcome ? pickProductDraft(state, random) : null
  const visitReasonId = pickOptionId(state.visitReasonOptions || [], random)
  const customerSourceId = pickOptionId(state.customerSourceOptions || [], random)
  const professionId = pickOptionId(state.professionOptions || [], random)
  const lossReasonId = outcome === 'nao-compra' ? pickOptionId(state.lossReasonOptions || [], random) : ''
  const queueJumpReasonId = normalizeText(service?.startMode) === 'queue-jump'
    ? pickOptionId(state.queueJumpReasonOptions || [], random)
    : ''

  const visitReasonIds = visitReasonId ? [visitReasonId] : []
  const customerSourceIds = customerSourceId ? [customerSourceId] : []
  const lossReasonIds = lossReasonId ? [lossReasonId] : []

  return {
    outcome,
    isWindowService: pickBoolean(random, 0.7),
    isGift: closedOutcome ? pickBoolean(random, 0.75) : false,
    isExistingCustomer: pickBoolean(random, 0.45),
    productsSeen: [seenProduct],
    productsClosed: closedOutcome && closedProduct ? [closedProduct] : [],
    productsSeenNone: false,
    customerName,
    customerPhone,
    customerEmail: buildCustomerEmail(customerName, random),
    customerProfessionId: professionId,
    visitReasonIds,
    visitReasonNotInformed: visitReasonIds.length < 1,
    visitReasonDetails: visitReasonIds.length > 0 ? buildDetails(visitReasonIds, TEST_REASON_DETAILS, random) : {},
    customerSourceIds,
    customerSourceNotInformed: customerSourceIds.length < 1,
    customerSourceDetails: customerSourceIds.length > 0 ? buildDetails(customerSourceIds, TEST_SOURCE_DETAILS, random) : {},
    queueJumpReasonId,
    lossReasonIds,
    lossReasonDetails: lossReasonIds.length > 0 ? buildDetails(lossReasonIds, TEST_LOSS_DETAILS, random) : {},
    notes: pickOne(TEST_NOTES, random)
  }
}