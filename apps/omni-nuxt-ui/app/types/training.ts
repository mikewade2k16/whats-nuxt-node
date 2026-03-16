export interface TrainingSlide {
  id: string
  imageUrl: string
  caption: string
}

export interface TrainingQuestionnaire {
  key: string
  title: string
  questions: string[]
}

export interface TrainingItem {
  id: string
  key: string
  title: string
  moduleLabel: string
  clientId: number
  clientName: string
  trainingType: 'slides' | 'video'
  coverImageUrl: string
  slides: TrainingSlide[]
  videoUrl: string
  questionnaire: TrainingQuestionnaire | null
}

export interface TrainingSection {
  key: string
  title: string
  items: TrainingItem[]
}

export interface TrainingClientOption {
  label: string
  value: number
}

export interface TrainingCatalogResponse {
  status: 'success'
  data: {
    sections: TrainingSection[]
    storeOptions: string[]
    clientOptions: TrainingClientOption[]
    activeClientId: number | null
  }
}

export interface SubmitTrainingEvaluationPayload {
  trainingKey: string
  trainingTitle: string
  clientId?: number
  traineeName: string
  storeName: string
  answers: string[]
}

export interface SubmitTrainingEvaluationResponse {
  status: 'success'
  data: {
    id: number
    createdAt: string
  }
}
