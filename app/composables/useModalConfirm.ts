import ConfirmModal from '../components/ConfirmModal.vue'

type ConfirmColor = 'primary' | 'neutral' | 'success' | 'info' | 'warning' | 'error'

type ConfirmOptions = {
  title?: string
  description?: string
  confirmButtonText?: string
  cancelButtonText?: string
  confirmLabel?: string
  cancelLabel?: string
  type?: string
  color?: ConfirmColor
  icon?: string
  showClose?: boolean
  showclose?: boolean
  dismissible?: boolean
  inputPattern?: RegExp
  inputRequiredText?: string
  inputPlaceholder?: string
  inputErrorMessage?: string
}

function normalizeColor(type?: string, color?: ConfirmColor): ConfirmColor {
  if (color) return color
  if (type === 'success') return 'success'
  if (type === 'info') return 'info'
  if (type === 'warning') return 'warning'
  if (type === 'error' || type === 'danger' || type === 'erroring') return 'error'
  return 'primary'
}

function normalizeOptions(titleOrOptions?: string | ConfirmOptions, options?: ConfirmOptions) {
  if (typeof titleOrOptions === 'object' && titleOrOptions !== null) {
    return titleOrOptions
  }
  return { ...(options || {}), title: titleOrOptions || options?.title }
}

export function useModalConfirm() {
  const overlay = useOverlay()

  function confirm(message: unknown, titleOrOptions?: string | ConfirmOptions, options?: ConfirmOptions) {
    const opts = normalizeOptions(titleOrOptions, options)
    const modal = overlay.create(ConfirmModal, { destroyOnClose: true })

    return modal
      .open({
        title: opts.title || '系统提示',
        description: opts.description,
        message: String(message ?? ''),
        confirmLabel: opts.confirmLabel || opts.confirmButtonText || '确定',
        cancelLabel: opts.cancelLabel || opts.cancelButtonText || '取消',
        color: normalizeColor(opts.type, opts.color),
        icon: opts.icon,
        showClose: opts.showClose ?? opts.showclose ?? true,
        dismissible: opts.dismissible ?? true,
        inputPattern: opts.inputPattern,
        inputRequiredText: opts.inputRequiredText,
        inputPlaceholder: opts.inputPlaceholder,
        inputErrorMessage: opts.inputErrorMessage,
      })
      .then((value) => {
        if (value === true) return 'confirm'
        throw new Error('cancel')
      })
  }

  return { confirm }
}
