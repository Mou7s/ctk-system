/**
 * Format a numeric value for display (trim trailing zeros).
 * @param {number|string|null|undefined} value
 * @returns {string}
 */
export function formatNumber(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return '';
  }
  return Number.isInteger(number) ? String(number) : number.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}