type FeedbackColor = 'primary' | 'neutral' | 'success' | 'info' | 'warning' | 'error'

type FeedbackConfirmOptions = {
  type?: string
  color?: FeedbackColor
  confirmButtonText?: string
  cancelButtonText?: string
  showClose?: boolean
  showclose?: boolean
  dismissible?: boolean
}

export function nuxtMsg(message: unknown, color: FeedbackColor = 'neutral') {
  const toast = useToast()
  toast.add({ title: String(message ?? ''), color, duration: 4000 })
}

export function nuxtConfirm(content: unknown, title?: string, options: FeedbackConfirmOptions = {}) {
  return useModalConfirm().confirm(String(content ?? title ?? ''), title || '????', options)
}
