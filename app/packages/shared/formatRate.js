/**
 * Format a decimal rate (0–1) as a percentage string.
 * @param {number|string|null|undefined} value
 * @returns {string}
 */
export function formatDecimalRate(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) {
    return '0.00%';
  }
  return `${(num * 100).toFixed(2)}%`;
}