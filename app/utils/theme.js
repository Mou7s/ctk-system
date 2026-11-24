/**
 * 主题色处理 - 将十六进制颜色转换为CSS自定义属性
 */

/**
 * 将十六进制颜色转换为RGB对象
 * @param {string} hex 十六进制颜色值 (如 #409EFF)
 * @returns {{r: number, g: number, b: number}|null}
 */
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null
}

/**
 * 变亮颜色 - 向白色混合
 * @param {string} color 十六进制颜色值
 * @param {number} level 变亮程度 0-1
 * @returns {string} RGB字符串
 */
const getLightColor = (color, level) => {
  const rgb = hexToRgb(color)
  if (!rgb) return color
  const r = Math.min(255, Math.round(rgb.r + (255 - rgb.r) * level))
  const g = Math.min(255, Math.round(rgb.g + (255 - rgb.g) * level))
  const b = Math.min(255, Math.round(rgb.b + (255 - rgb.b) * level))
  return `rgb(${r}, ${g}, ${b})`
}

/**
 * 变暗颜色 - 向黑色混合
 * @param {string} color 十六进制颜色值
 * @param {number} level 变暗程度 0-1
 * @returns {string} RGB字符串
 */
const getDarkColor = (color, level) => {
  const rgb = hexToRgb(color)
  if (!rgb) return color
  const r = Math.round(rgb.r * (1 - level))
  const g = Math.round(rgb.g * (1 - level))
  const b = Math.round(rgb.b * (1 - level))
  return `rgb(${r}, ${g}, ${b})`
}

/**
 * 处理主题样式 - 在 document.documentElement 上设置CSS自定义属性
 * @param {string} theme 十六进制主题色 (如 #409EFF)
 */
const handleThemeStyle = (theme) => {
  if (!theme || typeof document === 'undefined') return
  document.documentElement.style.setProperty('--primary-color', theme)
  document.documentElement.style.setProperty('--primary-color-dark', getDarkColor(theme, 0.3))
  for (let i = 1; i <= 9; i++) {
    document.documentElement.style.setProperty(`--primary-color-light-${i}`, getLightColor(theme, i / 10))
  }
}

export { handleThemeStyle, getLightColor, getDarkColor, hexToRgb }
