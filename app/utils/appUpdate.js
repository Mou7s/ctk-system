export function createAppUpdateMonitor({ currentVersion, fetchVersion, onUpdate, now = Date.now }) {
  let inFlight = false
  let lastCheck = -Infinity
  let stopped = false
  let available = false
  return {
    stop() { stopped = true },
    async check() {
      if (stopped || available || inFlight || !currentVersion || currentVersion === 'development' || now() - lastCheck < 30_000) return
      inFlight = true
      lastCheck = now()
      try {
        const response = await fetchVersion()
        const version = response?.version
        if (!stopped && typeof version === 'string' && version && version !== 'development' && version !== currentVersion) {
          available = true
          onUpdate(version)
        }
      } catch { /* A temporary deployment/network failure must not interrupt business work. */ }
      finally { inFlight = false }
    },
  }
}

// Conservative guard: an open editable dialog may contain a grid whose edits
// never produce a normal form input event. Do not infer that it is safe to discard.
export function hasOpenEditor(doc = document) {
  return [...doc.querySelectorAll('[role="dialog"], dialog[open]')].some(dialog => {
    if (dialog.closest('[hidden], [aria-hidden="true"], [data-state="closed"]')) return false
    for (let parent = dialog; parent; parent = parent.parentElement) {
      if (doc.defaultView?.getComputedStyle(parent).display === 'none') return false
    }
    return Boolean(dialog.querySelector('input:not([readonly]):not([disabled]):not([type="hidden"]), textarea:not([readonly]):not([disabled]), select:not([disabled]), [contenteditable="true"], revo-grid'))
  })
}

export function loadAppUpdate({ doc = document, confirm = message => window.confirm(message), reload = () => window.location.reload() } = {}) {
  if (hasOpenEditor(doc) && !confirm('当前有编辑窗口打开，重新加载可能丢失尚未保存的内容。请先保存；仍要重新加载吗？')) return false
  reload()
  return true
}
