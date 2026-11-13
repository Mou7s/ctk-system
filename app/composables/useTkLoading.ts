import LoadingModal from '../components/LoadingModal.vue'

type LoadingOverlay = ReturnType<ReturnType<typeof useOverlay>['create']>

let activeLoading: LoadingOverlay | null = null

export function useTkLoading() {
  const overlay = useOverlay()

  function start(text = '正在处理，请稍候...') {
    if (activeLoading?.isOpen) {
      activeLoading.patch({ text })
      return activeLoading
    }

    activeLoading = overlay.create(LoadingModal, {
      destroyOnClose: true,
      props: { text },
    })
    activeLoading.open()
    return activeLoading
  }

  function stop() {
    activeLoading?.close()
    activeLoading = null
  }

  async function during<T>(task: Promise<T>, text = '正在处理，请稍候...') {
    start(text)
    try {
      return await task
    } finally {
      stop()
    }
  }

  return { start, stop, during }
}
