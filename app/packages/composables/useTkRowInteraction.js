/**
 * AGENTS.md list interaction: click select, re-click deselect, dblclick open;
 * ignore selection and 操作 columns.
 * @param {object} options
 * @param {() => import('vue').Ref|undefined} options.getTableRef returns el-table component ref
 * @param {import('vue').Ref<number|null>} options.currentRowId
 * @param {import('vue').Ref<Array>} options.ids
 * @param {import('vue').Ref<boolean>} options.single
 * @param {import('vue').Ref<boolean>} options.multiple
 * @param {(row: object) => void} [options.onRowOpen] dblclick handler after selection
 * @param {() => boolean} [options.isDblClickDisabled]
 * @param {(row: object) => string|number|null|undefined} [options.getRowId] defaults to row.id
 * @param {string[]} [options.ignoreColumnLabels] extra column labels to ignore for row click
 */
export function useTkRowInteraction({
  getTableRef,
  currentRowId,
  ids,
  single,
  multiple,
  onRowOpen,
  isDblClickDisabled,
  getRowId = (row) => row.id,
  ignoreColumnLabels = [],
  data,
}) {
  let lastClickedRow = null;
  function shouldIgnoreColumn(column) {
    return (
      !column
      || column.type === 'selection'
      || column.label === '操作'
      || ignoreColumnLabels.includes(column.label)
    );
  }

  function handleSelectionChange(selection) {
    ids.value = selection.map((item) => getRowId(item));
    currentRowId.value = selection.length === 1 ? getRowId(selection[0]) : null;
    single.value = selection.length !== 1;
    multiple.value = !selection.length;
  }

  function handleRowClick(row, column, event) {
    if (shouldIgnoreColumn(column)) {
      return;
    }
    const table = getTableRef()?.value;
    const rowId = getRowId(row);

    if (event && event.shiftKey && lastClickedRow && data) {
      const listData = typeof data.value !== 'undefined' ? data.value : data;
      if (Array.isArray(listData)) {
        const startIdx = listData.findIndex(item => getRowId(item) === getRowId(lastClickedRow));
        const endIdx = listData.findIndex(item => getRowId(item) === rowId);
        if (startIdx !== -1 && endIdx !== -1) {
          const min = Math.min(startIdx, endIdx);
          const max = Math.max(startIdx, endIdx);
          for (let i = min; i <= max; i++) {
            table?.toggleRowSelection(listData[i], true);
          }
          lastClickedRow = row;
          table?.setCurrentRow(row);
          currentRowId.value = rowId;
          return;
        }
      }
    }

    if (currentRowId.value === rowId) {
      table?.clearSelection();
      table?.setCurrentRow();
      currentRowId.value = null;
      lastClickedRow = null;
      return;
    }
    table?.clearSelection();
    table?.toggleRowSelection(row, true);
    table?.setCurrentRow(row);
    currentRowId.value = rowId;
    lastClickedRow = row;
  }

  function handleRowDblClick(row, column, event) {
    if (shouldIgnoreColumn(column) || isDblClickDisabled?.()) {
      return;
    }
    handleRowClick(row, column, event);
    onRowOpen?.(row);
  }

  return {
    handleSelectionChange,
    handleRowClick,
    handleRowDblClick,
  };
}