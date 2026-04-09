interface TrainingQuestionnaireDefinition {
  key: string
  title: string
  questions: string[]
}

interface TrainingItemDefinition {
  key: string
  title: string
  trainingType: 'slides' | 'video'
  moduleLabel: string
  slideCount?: number
  videoUrl?: string
}

interface TrainingSectionDefinition {
  key: string
  title: string
  items: TrainingItemDefinition[]
}

interface TrainingClientCatalogDefinition {
  clientId: number
  clientName: string
  sections: TrainingSectionDefinition[]
}

interface TrainingEvaluationRecord {
  id: number
  clientId: number
  userType: 'admin' | 'client'
  trainingKey: string
  trainingTitle: string
  traineeName: string
  storeName: string
  answers: string[]
  createdAt: string
}

interface TrainingRepositoryState {
  nextEvaluationId: number
  evaluations: TrainingEvaluationRecord[]
}

interface TrainingCatalogAccessOptions {
  viewerClientId?: number
  viewerIsAdmin?: boolean
  targetClientId?: number
}

const globalKey = '__omni_training_repo__'

const STORE_OPTIONS = ['Riomar', 'Jardins', 'Garcia', 'Treze']

const QUESTIONNAIRES: Record<string, TrainingQuestionnaireDefinition> = {
  '1-onboarding-perola': {
    key: '1-onboarding-perola',
    title: '1 - Onboarding Perola',
    questions: [
      '1. Em que ano a Perola foi fundada? E qual o nome do fundador?',
      '2. Em qual cidade foi fundada a Perola e como iniciou a historia da marca?',
      '3. Quais sao nossa missao, visao e valores?',
      '4. Quais sao nossos diferenciais?',
      '5. Quais sao todas as unidades da Perola e onde estao localizadas?',
      '6. Qual a frase que representa a voz da marca?',
      '7. O que e certificado Amagold?',
      '8. Qual o nome da fragrancia presente nas lojas da Perola?'
    ]
  },
  '3-ouro': {
    key: '3-ouro',
    title: '3 - Ouro',
    questions: [
      '1. Como chamamos o ouro encontrado na natureza?',
      '2. Cite quatro simbolismos do ouro.',
      '3. Em latim, como e chamado o ouro?',
      '4. Na tabela periodica qual e o simbolo quimico do ouro?',
      '5. A que temperatura o ouro funde?',
      '6. O ouro pode ser extraido de duas formas na natureza. Quais sao?',
      '7. Alem de adorno pessoal, cite dois exemplos de uso do ouro.',
      '8. Cite cinco propriedades do ouro e comente.',
      '9. Qual elemento quimico reage com o ouro e pode danifica-lo?',
      '10. Cite dois motivos para nao usar ouro 24k na fabricacao de joias.',
      '11. Qual a diferenca de dureza e tenacidade?',
      '12. Qual o grau de dureza Mohs do ouro 24k e do ouro 18k?',
      '13. Qual ouro e mais usado em joalheria? Explique.',
      '14. A cor determina o teor do ouro? Explique.',
      '15. Cite acabamentos usados na fabricacao de pecas em ouro.',
      '16. O ouro 1000 oxida? E o ouro 18k?',
      '17. Joias em ouro 1000 quebram? E em ouro 18k?',
      '18. O que e rodio?'
    ]
  },
  '4-joias-tradicionais': {
    key: '4-joias-tradicionais',
    title: '4 - Joias Tradicionais',
    questions: [
      '1. Explique as caracteristicas da alianca tradicional x anatomica.',
      '2. O que e um anel sete fios e quais caracteristicas?',
      '3. O que diferencia alianca de noivado e alianca de casamento?',
      '4. Cite tres cores de aneis de formatura e cursos.',
      '5. Quais caracteristicas das joias usadas em batismo?',
      '6. O que define um anel solitario e seu significado simbolico?',
      '7. Qual o significado religioso do escapulario?'
    ]
  },
  '5-gemas-naturais': {
    key: '5-gemas-naturais',
    title: '5 - Gemas Naturais',
    questions: [
      '1. Qual a diferenca entre pedras preciosas e gemas?',
      '2. Cite tres exemplos de gemas organicas.',
      '3. Cite tres exemplos de gemas inorganicas.',
      '4. Cite dois meses do ano e suas pedras correspondentes.',
      '5. Quais crencas antigas estavam ligadas as gemas coradas?',
      '6. Quais pedras no Brasil sao destaque mundial?',
      '7. Como inclusoes afetam beleza e valor de uma gema?'
    ]
  },
  '6-perola': {
    key: '6-perola',
    title: '6 - Perola',
    questions: [
      '1. As perolas sao de origem organica ou mineral? Explique.',
      '2. Como ocorre o processo de nascimento de uma perola?',
      '3. Quais os simbolismos da perola?',
      '4. Em quais ocasioes voce indicaria perola ao cliente?',
      '5. O que e efeito oriente?',
      '6. Comente sobre fazendas de perola e perolas cultivadas.',
      '7. Quais cinco caracteristicas avaliam qualidade de uma perola?',
      '8. Fale sobre perola barroca, circle e shell.',
      '9. Quais cuidados o cliente deve ter para nao danificar perolas?',
      '10. Qual e a perola mais valorizada do mundo e por que?'
    ]
  },
  '7-diamantes': {
    key: '7-diamantes',
    title: '7 - Diamantes',
    questions: [
      '1. Que elemento cristalizado forma o diamante?',
      '2. Como o diamante e formado? Explique.',
      '3. Defina os tipos de jazidas de diamante.',
      '4. Quais sao as 4 caracteristicas que definem valor de diamante?',
      '5. Qual a diferenca entre diamante e brilhante?',
      '6. Com incidencia de luz, o que pode ser visto em um diamante?',
      '7. O que sao inclusoes?',
      '8. Quanto pesa em gramas um quilate?',
      '9. Qual unidade usada para pesar gemas?',
      '10. Quantos pontos tem um diamante de meio quilate?',
      '11. Diferenca entre quilate K e quilate ct.'
    ]
  },
  '9-safira': {
    key: '9-safira',
    title: '9 - Safira',
    questions: [
      '1. Qual a familia da safira? Outra gema da mesma familia e dureza Mohs?',
      '2. Qual o significado da palavra safira?',
      '3. Safira e muito usada em quais ocasioes?',
      '4. Cite situacoes para indicar safira pelo poder mistico.',
      '5. Por que safira e tao valiosa? Cite quatro jazidas principais.',
      '6. Quais quatro caracteristicas de uma safira de boa qualidade?',
      '7. Qual a cor da safira?',
      '8. Quais cursos usam safira nos aneis?'
    ]
  },
  '10-rubi': {
    key: '10-rubi',
    title: '10 - Rubi',
    questions: [
      '1. Qual a familia do rubi? Outra gema da mesma familia e dureza Mohs?',
      '2. Qual o significado da palavra rubi?',
      '3. Rubi e muito usado em quais ocasioes?',
      '4. Cite situacoes para indicar rubi pelo poder mistico.',
      '5. Por que rubi e usado em relogios mecanicos?',
      '6. Por que rubi e valioso? Cite quatro jazidas principais.',
      '7. Quais caracteristicas de um rubi de boa qualidade?',
      '8. Por que rubi apresenta tonalidades de vermelho diferentes?'
    ]
  },
  '11-prata': {
    key: '11-prata',
    title: '11 - Prata',
    questions: [
      '1. Qual a medida de pureza da prata 925 e 950?',
      '2. Qual diferenca entre prata 925 e 950?',
      '3. Prata 925 escurece? Qual motivo?',
      '4. Na Perola, e permitido ajuste em prata com rodio?',
      '5. As joias da Perola sao confeccionadas em qual prata?',
      '6. Quais metais comuns utilizados em ligas de prata?',
      '7. Cite tres locais com minas de prata pura.'
    ]
  },
  '12-relogios': {
    key: '12-relogios',
    title: '12 - Relogios',
    questions: [
      '1. Em que ano foi criado o primeiro relogio mecanico?',
      '2. Em que ano foi criado o primeiro relogio de pulso?',
      '3. Antes dos relogios mecanicos, como o homem media horas?',
      '4. O que e um relogio mecanico manual?',
      '5. O que e um relogio mecanico automatico?',
      '6. O que e um relogio a quartzo?',
      '7. Nome da maquina de relogios suicos?',
      '8. Nome da maquina de relogios a quartzo fora da Suica?',
      '9. Tres beneficios de relogio com pulseira e caixa em aco inox.',
      '10. Beneficios de relogio com mica de safira.',
      '11. Diferenca de cronografo e cronometro.',
      '12. Existe relogio a prova dagua?',
      '13. Relogio com alta resistencia pode chegar a quantos metros?',
      '14. Cite tres marcas inovadoras e uma tecnologia de cada.',
      '15. Quantos rubis tem um relogio automatico?',
      '16. Relogio automatico carrega com pulso e batimentos?',
      '17. Simule uma venda de relogio pelos passos de demonstracao.'
    ]
  }
}

const PEROLA_SECTION_DEFINITIONS: TrainingSectionDefinition[] = [
  {
    key: 'relogios',
    title: 'Relogios',
    items: [
      {
        key: 'garmin',
        title: 'Treinamento Garmin',
        moduleLabel: 'Relogios',
        trainingType: 'video',
        videoUrl: '/training/videos/garmin.mp4'
      }
    ]
  },
  {
    key: 'modulo-1',
    title: 'Modulo 1',
    items: [
      { key: '1-onboarding-perola', title: 'Onboarding Perola', moduleLabel: 'Modulo 1', trainingType: 'slides', slideCount: 6 },
      { key: '2-onboarding-comercial', title: 'Onboarding Comercial', moduleLabel: 'Modulo 1', trainingType: 'slides', slideCount: 6 },
      { key: '3-ouro', title: 'Ouro', moduleLabel: 'Modulo 1', trainingType: 'slides', slideCount: 6 },
      { key: '4-joias-tradicionais', title: 'Joias Tradicionais', moduleLabel: 'Modulo 1', trainingType: 'slides', slideCount: 6 }
    ]
  },
  {
    key: 'modulo-2',
    title: 'Modulo 2',
    items: [
      { key: '5-gemas-naturais', title: 'Gemas Naturais', moduleLabel: 'Modulo 2', trainingType: 'slides', slideCount: 6 },
      { key: '6-perola', title: 'Perola', moduleLabel: 'Modulo 2', trainingType: 'slides', slideCount: 6 },
      { key: '7-diamantes', title: 'Diamantes', moduleLabel: 'Modulo 2', trainingType: 'slides', slideCount: 6 }
    ]
  },
  {
    key: 'modulo-3',
    title: 'Modulo 3',
    items: [
      { key: '9-safira', title: 'Safira', moduleLabel: 'Modulo 3', trainingType: 'slides', slideCount: 6 },
      { key: '10-rubi', title: 'Rubi', moduleLabel: 'Modulo 3', trainingType: 'slides', slideCount: 6 },
      { key: '11-prata', title: 'Prata', moduleLabel: 'Modulo 3', trainingType: 'slides', slideCount: 6 },
      { key: '12-relogios', title: 'Relogios', moduleLabel: 'Modulo 3', trainingType: 'slides', slideCount: 6 }
    ]
  }
]

const TRAINING_CLIENT_CATALOGS: TrainingClientCatalogDefinition[] = [
  {
    clientId: 105,
    clientName: 'Perola',
    sections: PEROLA_SECTION_DEFINITIONS
  }
]

function nowIso() {
  return new Date().toISOString()
}

function normalizeText(value: unknown, max = 255) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function normalizeClientId(value: unknown) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0
  }

  return parsed
}

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function createPlaceholderImageDataUrl(title: string, subtitle: string, index: number) {
  const safeTitle = escapeSvgText(title)
  const safeSubtitle = escapeSvgText(subtitle)
  const hueStart = 222 + ((index * 19) % 46)
  const hueEnd = 196 + ((index * 17) % 40)
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hueStart},72%,12%)" />
      <stop offset="100%" stop-color="hsl(${hueEnd},68%,20%)" />
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)" />
  <circle cx="1120" cy="82" r="220" fill="rgba(255,255,255,0.06)" />
  <circle cx="150" cy="610" r="240" fill="rgba(255,255,255,0.05)" />
  <text x="84" y="322" fill="rgba(255,255,255,0.95)" font-family="Arial, sans-serif" font-size="74" font-weight="700">${safeTitle}</text>
  <text x="84" y="392" fill="rgba(255,255,255,0.72)" font-family="Arial, sans-serif" font-size="34" font-weight="500">${safeSubtitle}</text>
</svg>`

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function createSlides(trainingKey: string, trainingTitle: string, count: number) {
  return Array.from({ length: Math.max(1, count) }).map((_, index) => {
    const slideNumber = index + 1
    const caption = `${trainingTitle} - Slide ${slideNumber}`
    return {
      id: `${trainingKey}-slide-${slideNumber}`,
      imageUrl: createPlaceholderImageDataUrl(trainingTitle, `Slide ${slideNumber}`, index + 1),
      caption
    }
  })
}

function resolveQuestionnaire(trainingKey: string) {
  const questionnaire = QUESTIONNAIRES[trainingKey]
  if (!questionnaire) return null

  return {
    key: questionnaire.key,
    title: questionnaire.title,
    questions: [...questionnaire.questions]
  }
}

function toTrainingItem(
  definition: TrainingItemDefinition,
  position: number,
  client: { id: number, name: string }
) {
  const coverImageUrl = createPlaceholderImageDataUrl(definition.title, definition.moduleLabel, position + 1)
  const slides = definition.trainingType === 'slides'
    ? createSlides(definition.key, definition.title, definition.slideCount ?? 4)
    : []

  return {
    id: `${client.id}:${definition.key}`,
    key: definition.key,
    title: definition.title,
    moduleLabel: definition.moduleLabel,
    clientId: client.id,
    clientName: client.name,
    trainingType: definition.trainingType,
    coverImageUrl,
    slides,
    videoUrl: definition.trainingType === 'video' ? String(definition.videoUrl ?? '').trim() : '',
    questionnaire: resolveQuestionnaire(definition.key)
  }
}

function buildSectionsFromClientCatalog(
  catalog: TrainingClientCatalogDefinition,
  clientIndex: number,
  mode: 'single' | 'all'
) {
  return catalog.sections.map((section, sectionIndex) => ({
    key: mode === 'all' ? `${catalog.clientId}:${section.key}` : section.key,
    title: mode === 'all' ? `${catalog.clientName} - ${section.title}` : section.title,
    items: section.items.map((item, itemIndex) => toTrainingItem(
      item,
      (clientIndex * 100) + (sectionIndex * 10) + itemIndex,
      {
        id: catalog.clientId,
        name: catalog.clientName
      }
    ))
  }))
}

function getState(): TrainingRepositoryState {
  const globalRef = globalThis as typeof globalThis & { [globalKey]?: TrainingRepositoryState }
  if (!globalRef[globalKey]) {
    globalRef[globalKey] = {
      nextEvaluationId: 1,
      evaluations: []
    }
  }

  return globalRef[globalKey] as TrainingRepositoryState
}

export function listTrainingCatalog() {
  const sections = TRAINING_CLIENT_CATALOGS.flatMap((catalog, clientIndex) =>
    buildSectionsFromClientCatalog(catalog, clientIndex, 'all')
  )
  const clientOptions = TRAINING_CLIENT_CATALOGS.map(catalog => ({
    value: catalog.clientId,
    label: catalog.clientName
  }))

  return {
    sections,
    storeOptions: [...STORE_OPTIONS],
    clientOptions,
    activeClientId: null
  }
}

export function listTrainingCatalogByAccess(options?: TrainingCatalogAccessOptions) {
  const viewerClientId = normalizeClientId(options?.viewerClientId)
  const viewerIsAdmin = options?.viewerIsAdmin === true
  const targetClientId = normalizeClientId(options?.targetClientId)
  const clientOptions = TRAINING_CLIENT_CATALOGS.map(catalog => ({
    value: catalog.clientId,
    label: catalog.clientName
  }))

  if (!viewerIsAdmin) {
    const ownedCatalog = TRAINING_CLIENT_CATALOGS.find(catalog => catalog.clientId === viewerClientId)
    if (!ownedCatalog) {
      return {
        sections: [],
        storeOptions: [],
        clientOptions,
        activeClientId: viewerClientId > 0 ? viewerClientId : null
      }
    }

    return {
      sections: buildSectionsFromClientCatalog(ownedCatalog, 0, 'single'),
      storeOptions: [...STORE_OPTIONS],
      clientOptions,
      activeClientId: ownedCatalog.clientId
    }
  }

  if (targetClientId > 0) {
    const selectedCatalog = TRAINING_CLIENT_CATALOGS.find(catalog => catalog.clientId === targetClientId)
    if (!selectedCatalog) {
      return {
        sections: [],
        storeOptions: [...STORE_OPTIONS],
        clientOptions,
        activeClientId: targetClientId
      }
    }

    return {
      sections: buildSectionsFromClientCatalog(selectedCatalog, 0, 'single'),
      storeOptions: [...STORE_OPTIONS],
      clientOptions,
      activeClientId: selectedCatalog.clientId
    }
  }

  const allSections = TRAINING_CLIENT_CATALOGS.flatMap((catalog, index) =>
    buildSectionsFromClientCatalog(catalog, index, 'all')
  )

  if (!allSections.length) {
    return {
      sections: [],
      storeOptions: [],
      clientOptions,
      activeClientId: null
    }
  }

  return {
    sections: allSections,
    storeOptions: [...STORE_OPTIONS],
    clientOptions,
    activeClientId: null
  }
}

export function createTrainingEvaluation(input: {
  clientId?: unknown
  userType?: unknown
  trainingKey: unknown
  trainingTitle: unknown
  traineeName: unknown
  storeName: unknown
  answers: unknown
}) {
  const state = getState()

  const record: TrainingEvaluationRecord = {
    id: state.nextEvaluationId,
    clientId: normalizeClientId(input.clientId),
    userType: String(input.userType ?? '').trim().toLowerCase() === 'client' ? 'client' : 'admin',
    trainingKey: normalizeText(input.trainingKey, 80),
    trainingTitle: normalizeText(input.trainingTitle, 160),
    traineeName: normalizeText(input.traineeName, 160),
    storeName: normalizeText(input.storeName, 120),
    answers: Array.isArray(input.answers)
      ? input.answers.map(answer => normalizeText(answer, 2500))
      : [],
    createdAt: nowIso()
  }

  state.nextEvaluationId += 1
  state.evaluations.unshift(record)

  return {
    id: record.id,
    createdAt: record.createdAt
  }
}
