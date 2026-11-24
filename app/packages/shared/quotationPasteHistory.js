function cloneSnapshot(snapshot) {
  return snapshot == null ? null : JSON.parse(JSON.stringify(snapshot))
}

function snapshotKey(snapshot) {
  return JSON.stringify(snapshot)
}

export function createQuotationPasteHistory(limit = 50) {
  const undoStack = []
  const redoStack = []

  return {
    record(snapshot) {
      const cloned = cloneSnapshot(snapshot)
      if (!cloned) return
      if (undoStack.length && snapshotKey(undoStack[undoStack.length - 1]) === snapshotKey(cloned)) return
      undoStack.push(cloned)
      if (undoStack.length > limit) undoStack.shift()
      redoStack.length = 0
    },

    undo(currentSnapshot) {
      if (!undoStack.length) return null
      const previous = undoStack.pop()
      const current = cloneSnapshot(currentSnapshot)
      if (current) redoStack.push(current)
      return cloneSnapshot(previous)
    },

    redo(currentSnapshot) {
      if (!redoStack.length) return null
      const next = redoStack.pop()
      const current = cloneSnapshot(currentSnapshot)
      if (current) undoStack.push(current)
      return cloneSnapshot(next)
    },

    clear() {
      undoStack.length = 0
      redoStack.length = 0
    },
  }
}
