// 常用拼音首字母提取算法
// 利用 GB2312 边界与常用汉字拼音首字母映射
const FIRST_LETTER_BOUNDARIES = [
  { letter: 'a', char: '阿' },
  { letter: 'b', char: '芭' },
  { letter: 'c', char: '擦' },
  { letter: 'd', char: '搭' },
  { letter: 'e', char: '蛾' },
  { letter: 'f', char: '发' },
  { letter: 'g', char: '噶' },
  { letter: 'h', char: '哈' },
  { letter: 'j', char: '击' },
  { letter: 'k', char: '喀' },
  { letter: 'l', char: '垃' },
  { letter: 'm', char: '妈' },
  { letter: 'n', char: '拿' },
  { letter: 'o', char: '哦' },
  { letter: 'p', char: '啪' },
  { letter: 'q', char: '期' },
  { letter: 'r', char: '然' },
  { letter: 's', char: '撒' },
  { letter: 't', char: '塌' },
  { letter: 'w', char: '挖' },
  { letter: 'x', char: '昔' },
  { letter: 'y', char: '压' },
  { letter: 'z', char: '匝' },
]

// 姓氏多音字或特例补充
const SPECIAL_CHARS = {
  '重': 'z',
  '曾': 'z',
  '单': 's',
  '朴': 'p',
  '区': 'o',
  '解': 'x',
  '查': 'z',
  '折': 'z',
  '乐': 'y',
  '贾': 'j',
  '盖': 'g',
}

/**
 * 提取中文姓名的拼音首字母（如 "连钦武" -> "lqw"）
 * @param {string} name 姓名
 * @param {string} [useridFallback=''] 拼音 userid 备选
 * @returns {string} 小写拼音首字母
 */
export function getChineseInitials(name, useridFallback = '') {
  const trimmedName = String(name || '').trim()
  if (!trimmedName) {
    const caps = (useridFallback.match(/[A-Z]/g) || []).join('').toLowerCase()
    return caps || useridFallback.slice(0, 3).toLowerCase()
  }

  let initials = ''
  for (const ch of trimmedName) {
    if (SPECIAL_CHARS[ch]) {
      initials += SPECIAL_CHARS[ch]
      continue
    }
    if (/[a-zA-Z]/.test(ch)) {
      initials += ch.toLowerCase()
      continue
    }
    let found = ''
    for (let i = FIRST_LETTER_BOUNDARIES.length - 1; i >= 0; i--) {
      const boundary = FIRST_LETTER_BOUNDARIES[i]
      if (ch.localeCompare(boundary.char, 'zh-Hans-CN') >= 0) {
        found = boundary.letter
        break
      }
    }
    initials += found || ''
  }

  if (!initials && useridFallback) {
    const caps = (useridFallback.match(/[A-Z]/g) || []).join('').toLowerCase()
    initials = caps || useridFallback.toLowerCase()
  }

  return initials
}

/**
 * 生成统一规则密码：123 + 拼音首字母（例如 连钦武 -> 123lqw）
 * @param {string} name 姓名
 * @param {string} [userid=''] 拼音 userid
 * @returns {string} 统一规则密码
 */
export function generateRulePassword(name, userid = '') {
  const initials = getChineseInitials(name, userid)
  return `123${initials}`
}

const WEAK_DIGIT_PASSWORDS = new Set([
  '000000',
  '111111',
  '222222',
  '333333',
  '444444',
  '555555',
  '666666',
  '777777',
  '888888',
  '999999',
  '123456',
  '234567',
  '345678',
  '456789',
  '654321',
  '987654',
  '876543',
  '765432',
  '123123',
  '112233',
])

/**
 * 生成无规律的随机纯数字密码（默认 6 位，首位非 0 以防扫码或机台截断前导零，并排除连号/重复弱密码）
 * @param {number} [length=6] 密码位数
 * @param {() => number} [randomFn=Math.random] 随机数函数
 * @returns {string} 随机纯数字密码
 */
export function generateRandomDigitPassword(length = 6, randomFn = Math.random) {
  const safeLength = Math.max(4, Math.min(16, Math.floor(length)))
  for (let attempt = 0; attempt < 20; attempt++) {
    let digits = ''
    for (let i = 0; i < safeLength; i++) {
      const min = i === 0 ? 1 : 0
      const max = 9
      const d = Math.floor(randomFn() * (max - min + 1)) + min
      digits += String(d)
    }
    if (!WEAK_DIGIT_PASSWORDS.has(digits) && !/^(\d)\1+$/.test(digits)) {
      return digits
    }
  }
  return '583920'.slice(0, safeLength).padEnd(safeLength, '7')
}
