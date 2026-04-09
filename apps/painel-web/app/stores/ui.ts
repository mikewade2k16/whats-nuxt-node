import { ref } from 'vue'
import { defineStore } from 'pinia'

interface UiToast {
  id: string
  type: 'success' | 'error' | 'info'
  title: string
  message: string
}

interface UiDialogState {
  id: string
  kind: 'alert' | 'confirm' | 'prompt'
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  inputLabel: string
  inputPlaceholder: string
  initialValue: string
  required: boolean
}

interface UiDialogOptions {
  title?: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  inputLabel?: string
  inputPlaceholder?: string
  initialValue?: string
  required?: boolean
}

interface UiDialogResult {
  confirmed: boolean
  value: string
}

let toastSequence = 0
let dialogSequence = 0
let dialogResolver: ((value: UiDialogResult) => void) | null = null
const toastTimers = new Map<string, number>()

function normalizeDialogOptions(options: string | UiDialogOptions | undefined, kind: UiDialogState['kind']): Omit<UiDialogState, 'id'> {
  if (typeof options === 'string') {
    return {
      kind,
      title: kind === 'error' ? 'Erro' : 'Aviso',
      message: options,
      confirmLabel: kind === 'confirm' ? 'Confirmar' : 'Fechar',
      cancelLabel: 'Cancelar',
      inputLabel: '',
      inputPlaceholder: '',
      initialValue: '',
      required: false
    }
  }

  return {
    kind,
    title: options?.title || (kind === 'confirm' ? 'Confirmar' : kind === 'prompt' ? 'Informacao' : 'Aviso'),
    message: options?.message || '',
    confirmLabel: options?.confirmLabel || (kind === 'confirm' ? 'Confirmar' : 'Fechar'),
    cancelLabel: options?.cancelLabel || 'Cancelar',
    inputLabel: options?.inputLabel || '',
    inputPlaceholder: options?.inputPlaceholder || '',
    initialValue: String(options?.initialValue || ''),
    required: Boolean(options?.required)
  }
}

export const useUiStore = defineStore('ui', () => {
  const toasts = ref<UiToast[]>([])
  const dialog = ref<UiDialogState | null>(null)

  function clearToastTimer(toastId: string) {
    const currentTimer = toastTimers.get(toastId)

    if (currentTimer && import.meta.client) {
      window.clearTimeout(currentTimer)
    }

    toastTimers.delete(toastId)
  }

  function dismissToast(toastId: string) {
    clearToastTimer(toastId)
    toasts.value = toasts.value.filter((toast) => toast.id !== toastId)
  }

  function notify({ type = 'info', title = '', message = '', duration = 4000 }: { type?: UiToast['type']; title?: string; message?: string; duration?: number }) {
    const toastId = `toast-${++toastSequence}`
    toasts.value = [
      ...toasts.value,
      {
        id: toastId,
        type,
        title,
        message
      }
    ]

    if (import.meta.client && duration > 0) {
      const timerId = window.setTimeout(() => {
        dismissToast(toastId)
      }, duration)
      toastTimers.set(toastId, timerId)
    }

    return toastId
  }

  function openDialog(options: string | UiDialogOptions | undefined, kind: UiDialogState['kind']) {
    if (import.meta.server) {
      return Promise.resolve({ confirmed: false, value: '' })
    }

    if (dialog.value && dialogResolver) {
      dialogResolver({ confirmed: false, value: '' })
      dialogResolver = null
    }

    dialog.value = {
      id: `dialog-${++dialogSequence}`,
      ...normalizeDialogOptions(options, kind)
    }

    return new Promise<UiDialogResult>((resolve) => {
      dialogResolver = resolve
    })
  }

  function resolveDialog(payload: UiDialogResult) {
    const resolver = dialogResolver
    dialogResolver = null
    dialog.value = null

    if (resolver) {
      resolver(payload)
    }
  }

  return {
    toasts,
    dialog,
    notify,
    dismissToast,
    success(message: string, title = 'Sucesso') {
      return notify({ type: 'success', title, message })
    },
    error(message: string, title = 'Erro') {
      return notify({ type: 'error', title, message, duration: 5500 })
    },
    info(message: string, title = 'Informacao') {
      return notify({ type: 'info', title, message })
    },
    alert(options?: string | UiDialogOptions) {
      return openDialog(options, 'alert')
    },
    confirm(options?: string | UiDialogOptions) {
      return openDialog(options, 'confirm')
    },
    prompt(options?: string | UiDialogOptions) {
      return openDialog(options, 'prompt')
    },
    submitDialog(value = '') {
      resolveDialog({ confirmed: true, value })
    },
    cancelDialog() {
      resolveDialog({ confirmed: false, value: '' })
    }
  }
})