/**
 * Code 128 条形码矢量 SVG 生成器
 * 支持 Code 128 Auto (自动在 Code B 与 Code C 之间切换，数字串自动双位压缩以减小条码物理宽度)
 */

// Code 128 基础 107 种条/空模式表 (0 - 106)
// 每个字符串代表 6 个交替的条和空宽度 (条, 空, 条, 空, 条, 空)，停止符 106 为 7 位
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', // 0-9
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', // 10-19
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', // 20-29
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 30-39
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', // 40-49
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', // 50-59
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', // 60-69
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 70-79
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', // 80-89
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', // 90-99
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112' // 100-106 (106 is STOP)
]

const START_B = 104
const START_C = 105
const CODE_B = 100
const CODE_C = 99
const STOP = 106

/**
 * 编码给定的字符串为 Code 128 模式数组
 * @param {string} text 待编码文本
 * @returns {number[]} 符号编号数组 (含起始符、数据符、校验符、终止符)
 */
export function encodeCode128(text) {
  const str = String(text || '').trim()
  if (!str) return []

  // 判断是否全数字且长度 >= 4，若是优先使用 Code C（每两位数字压缩为一个符号）
  const isPureDigits = /^\d+$/.test(str)
  const symbols = []

  let currentMode = ''
  let i = 0

  if (isPureDigits && str.length >= 2) {
    currentMode = 'C'
    symbols.push(START_C)
  } else {
    currentMode = 'B'
    symbols.push(START_B)
  }

  while (i < str.length) {
    if (currentMode === 'C') {
      // 检查后续是否还有至少 2 位数字
      if (i + 1 < str.length && /^\d{2}$/.test(str.slice(i, i + 2))) {
        const pair = parseInt(str.slice(i, i + 2), 10)
        symbols.push(pair)
        i += 2
      } else {
        // 切换到 Code B
        currentMode = 'B'
        symbols.push(CODE_B)
        const charCode = str.charCodeAt(i)
        symbols.push(charCode - 32)
        i += 1
      }
    } else {
      // 当前是 Code B
      // 如果遇到连续 4 位或更多数字，切换到 Code C 压缩
      const remaining = str.slice(i)
      const digitMatch = remaining.match(/^(\d{4,})/)
      if (digitMatch && (digitMatch[1].length % 2 === 0 || digitMatch[1].length >= 4)) {
        currentMode = 'C'
        symbols.push(CODE_C)
        continue
      }
      const charCode = str.charCodeAt(i)
      if (charCode < 32 || charCode > 126) {
        throw new Error(`Code 128 不支持字符: ${str[i]} (code: ${charCode})`)
      }
      symbols.push(charCode - 32)
      i += 1
    }
  }

  // 计算校验和 Checksum: (Start + sum(Symbol[i] * i)) % 103
  let checksum = symbols[0]
  for (let idx = 1; idx < symbols.length; idx++) {
    checksum += symbols[idx] * idx
  }
  symbols.push(checksum % 103)

  // 终止符
  symbols.push(STOP)

  return symbols
}

/**
 * 将 Code 128 模式数组转换为模块条序列 (1 为黑条，0 为空白)
 * @param {number[]} symbols
 * @returns {string} 由 '1' 和 '0' 组成的二进制字符串
 */
export function symbolsToModules(symbols) {
  let modules = ''
  for (const sym of symbols) {
    const pattern = PATTERNS[sym]
    if (!pattern) continue
    let isBar = true
    for (const widthStr of pattern) {
      const width = parseInt(widthStr, 10)
      modules += (isBar ? '1' : '0').repeat(width)
      isBar = !isBar
    }
  }
  return modules
}

/**
 * 生成 Code 128 的矢量 SVG 字符串
 * @param {string} text 待编码字符串
 * @param {object} options 配置选项
 * @param {number} [options.height=40] 条码高度 (单位 px 或相对单位)
 * @param {number} [options.moduleWidth=2] 单个最小条宽
 * @param {number} [options.quietZone=10] 左右两侧静区宽度 (模块数)
 * @param {string} [options.barColor='#000000'] 条码颜色
 * @param {string} [options.bgColor='transparent'] 背景颜色
 * @param {boolean} [options.showText=false] 是否在下方绘制文本
 * @param {number} [options.fontSize=12] 文本大小
 * @returns {string} SVG XML 字符串
 */
export function generateCode128Svg(text, options = {}) {
  const {
    height = 40,
    moduleWidth = 2,
    quietZone = 10,
    barColor = '#000000',
    bgColor = 'transparent',
    showText = false,
    fontSize = 12,
  } = options

  const symbols = encodeCode128(text)
  if (!symbols.length) return ''

  const modules = symbolsToModules(symbols)
  const totalBarModules = modules.length
  const totalModules = totalBarModules + quietZone * 2
  const svgWidth = totalModules * moduleWidth
  const textHeight = showText ? fontSize + 4 : 0
  const svgHeight = height + textHeight

  // 构建条形码的所有矩形
  const rects = []
  let barStart = -1

  for (let i = 0; i < modules.length; i++) {
    if (modules[i] === '1') {
      if (barStart === -1) barStart = i
    } else {
      if (barStart !== -1) {
        const barModules = i - barStart
        rects.push(`<rect x="${(quietZone + barStart) * moduleWidth}" y="0" width="${barModules * moduleWidth}" height="${height}" fill="${barColor}" />`)
        barStart = -1
      }
    }
  }
  if (barStart !== -1) {
    const barModules = modules.length - barStart
    rects.push(`<rect x="${(quietZone + barStart) * moduleWidth}" y="0" width="${barModules * moduleWidth}" height="${height}" fill="${barColor}" />`)
  }

  const textNode = showText
    ? `<text x="${svgWidth / 2}" y="${height + fontSize}" text-anchor="middle" font-family="monospace, monospace" font-size="${fontSize}" fill="${barColor}">${text}</text>`
    : ''

  const bgRect = bgColor !== 'transparent'
    ? `<rect width="${svgWidth}" height="${svgHeight}" fill="${bgColor}" />`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%" height="100%">${bgRect}${rects.join('')}${textNode}</svg>`
}
