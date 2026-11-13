/**
 * TkUTable 行交互的两个纯函数：不依赖 DOM / TanStack，可直接单测。
 * 放在独立文件里，页面逻辑与回归测试引用同一份实现，避免「双击取哪一行」再长出第二套算法。
 */

/**
 * 双击的第二下 click：这一次交给 dblclick 处理。
 * 不拦掉的话，双击会在选中→取消→再选中之间抖动，
 * selection-change 会先发一个空数组、row-click 会重复触发一次。
 */
export function isRepeatClick(event) {
  return Number(event?.detail) > 1
}

/**
 * 双击定位行。
 * 不能用 DOM 行序号反查行模型：UTable 会给每个「已展开」行额外渲染一个 tr、
 * 虚拟滚动只会渲染可视窗口、body-top 插槽也可能塞进 tr，
 * 三种情况都会让 DOM 序号与行模型错位（部门/菜单管理页双击会打开错行或没反应）。
 * 优先用同一次交互里单击命中的行；只有在没有记录、或记录的行已经不在这个 tr 上时，才退回 DOM 序号。
 */
export function resolveRowFromDoubleClick({ recordedRow, recordedTr, tr, rows, domIndex }) {
  if (recordedRow && (!recordedTr || recordedTr === tr)) return recordedRow
  const list = Array.isArray(rows) ? rows : []
  const index = Number.isInteger(domIndex) && domIndex >= 0 ? domIndex : -1
  return index >= 0 ? list[index] ?? null : null
}
