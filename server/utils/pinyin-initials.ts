// 常用拼音首字母提取算法
// 利用 GB2312 边界或常用字首字母查找表
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

// 部分多音字或特例补充
const SPECIAL_CHARS: Record<string, string> = {
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

export function getChineseInitials(name: string, useridFallback = ''): string {
  const trimmedName = String(name || '').trim()
  if (!trimmedName) {
    // 从 userid 提取：如 ChenJiaBin -> cjb
    const caps = (useridFallback.match(/[A-Z]/g) || []).join('').toLowerCase()
    return caps || useridFallback.slice(0, 3).toLowerCase()
  }

  let initials = ''
  for (const ch of trimmedName) {
    if (SPECIAL_CHARS[ch]) {
      initials += SPECIAL_CHARS[ch]
      continue
    }
    // 检查英文字母
    if (/[a-zA-Z]/.test(ch)) {
      initials += ch.toLowerCase()
      continue
    }
    // 汉字
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

  // 如果汉字未提取出，回退到 userid
  if (!initials && useridFallback) {
    const caps = (useridFallback.match(/[A-Z]/g) || []).join('').toLowerCase()
    initials = caps || useridFallback.toLowerCase()
  }

  return initials
}

export function generateRulePassword(name: string, userid = ''): string {
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

// 焊线机工卡打印当前仅保留的 7 位指定员工白名单（账号统一输出全小写）
export const WIRE_BOND_ALLOWED_USERS = [
  { userid: 'lianghuaji', name: '梁华吉' },
  { userid: 'liangwenqiang', name: '梁文强' },
  { userid: 'lanwenyou', name: '蓝文有' },
  { userid: 'liaoyalun', name: '廖雅伦' },
  { userid: 'lianqinwu', name: '连钦武' },
  { userid: 'yuanjinping', name: '袁金平' },
  { userid: 'yuanguangsheng', name: '袁光声' },
] as const

export const WIRE_BOND_ALLOWED_USERIDS = WIRE_BOND_ALLOWED_USERS.map((u) => u.userid)

export function generateRandomDigitPassword(length = 6, randomFn: () => number = Math.random): string {
  const safeLength = Math.max(4, Math.min(16, Math.floor(length)))
  for (let attempt = 0; attempt < 20; attempt++) {
    let digits = ''
    for (let i = 0; i < safeLength; i++) {
      // 第一位避免 0 开头，以防部分扫码枪或旧机台将前导 0 截断
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
