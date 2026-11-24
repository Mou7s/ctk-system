const IGNORED_PHRASES = new Set([
  '备货',
  '库存',
  '库存备货',
  '常备库存',
  '客户备库存',
  '库存样单',
  '库存订单',
  '合作客户常规备货',
  '用于价格审核',
  '报备客户列表',
  '出自己品牌',
  '品牌商',
  '终端',
  '分销商',
  '代理商',
  '政府',
  '未知',
  '未告知',
  '未提供',
  '无终端客户',
  '无',
  '待定',
  '客户',
  '其他',
  'EMS',
  'OEM',
  'ODM',
  'NA',
  'N/A',
  'TBD',
  'NONE',
  'NULL',
  'STOCK',
  'WAITING',
  'APPLICAITON',
  'APPLICATION',
])

const GENERIC_ENGLISH_STOPWORDS = new Set([
  // 公司组织形式
  'CO',
  'COMPANY',
  'LTD',
  'LIMITED',
  'PVT',
  'PRIVATE',
  'INC',
  'INCORPORATED',
  'CORP',
  'CORPORATION',
  'LLC',
  'LLP',
  'GMBH',
  'SRO',
  'SA',
  'SL',
  'SP',
  'SPK',
  'ZOO',
  'ZRT',
  'PLC',
  'HOLDING',
  'HOLDINGS',
  'GROUP',
  'ENTERPRISE',
  'ENTERPRISES',
  'INTERNATIONAL',
  'INTL',
  // 行业与业务通用词
  'ELECTRONICS',
  'ELECTRONIC',
  'ELECTRIC',
  'ELECTRICAL',
  'ELETRONICA',
  'ECOMPONENTS',
  'COMPONENTS',
  'COMPONENT',
  'TECHNOLOGY',
  'TECHNOLOGIES',
  'TECH',
  'TECHNICAL',
  'CENTRE',
  'CENTER',
  'SYSTEM',
  'SYSTEMS',
  'SOLUTION',
  'SOLUTIONS',
  'POWER',
  'ENERGY',
  'GREEN',
  'CONVERSION',
  'INDUSTRIES',
  'INDUSTRY',
  'INDUSTRIAL',
  'LIGHT',
  'LIGHTING',
  'CONTROL',
  'CONTROLS',
  'AUTOMATION',
  'MATERIAL',
  'MATERIALS',
  'PRECISION',
  'MOTOR',
  'MOTORS',
  'MOTOCORP',
  'AUTO',
  'AUTOMOTIVE',
  'PRODUCT',
  'PRODUCTS',
  'PLASTIC',
  'ASSEMBLIES',
  'ASSEMBLY',
  'OPTO',
  'WIRELESS',
  'NETWORK',
  'NETWORKED',
  'SERVICES',
  'SERVICE',
  'IMPEX',
  'TRADING',
  'MART',
  'INFOTECH',
  'DEVICES',
  'DEVICE',
  'SEMICONDUCTOR',
  'SEMICONDUCTORS',
  'MICRO',
  'APPLIANCE',
  'APPLIANCES',
  'SMART',
  'INTELLIGENT',
  'MOBILITY',
  'DRIVTRAIN',
  'DRIVETRAIN',
  'SENERGY',
  // 常见国家/城市/地区词
  'INDIA',
  'MUMBAI',
  'FARIDABAD',
  'DELHI',
  'PUNE',
  'BANGALORE',
  'CHENNAI',
  'NOIDA',
  'GURGAON',
  'CHINA',
  'SHENZHEN',
  'KUNSHAN',
  'DONGGUAN',
  'HONGKONG',
  'HK',
  'SZ',
  'CZ',
  'POLSKA',
  'US',
  'USA',
  'ASIA',
  'GLOBAL',
  // 模板/占位词
  'EMS',
  'OEM',
  'ODM',
  'STOCK',
  'NA',
  'TBD',
  'NONE',
])

const GENERIC_CHINESE_SUFFIXES = [
  '股份有限公司',
  '有限责任公司',
  '有限公司',
  '集团',
  '电子科技',
  '未来科技',
  '新能源',
  '光电',
  '电子',
  '科技',
  '电器',
  '电气',
  '照明',
  '实业',
  '工业',
  '国际',
  '贸易',
  '商贸',
  '技术',
  '智能',
  '控股',
  '中国',
  '深圳',
  '东莞',
  '昆山',
  '香港',
  '美国',
  '印度',
]

function isNoiseSentence(segment) {
  if (!segment) return true
  if (IGNORED_PHRASES.has(segment.toUpperCase())) return true
  if (
    /参考价|价格更新|价格审核|历史价格|授权分销商|常规备货|库存样单|客户备库存|常备库存|报备客户/u.test(
      segment,
    )
  ) {
    return true
  }
  if (/^(?:备货|库存|客户|品牌商|终端|分销商|代理商|政府|其他|未告知|未提供|无终端客户|未知)$/u.test(segment)) {
    return true
  }
  return false
}

function cleanSegment(raw) {
  let text = String(raw ?? '').trim()
  if (!text) return ''
  // 去掉括号及其内部说明，如 (P), (I), (Kunshan), （美国）, （无终端客户）
  text = text.replace(/\([^)]*\)|（[^）]*）|\[[^\]]*\]|【[^】]*】/gu, ' ')
  // 去掉末尾常见的 -备货 / -未告知 / -未提供
  text = text.replace(/[-—_]+\s*(?:备货|库存|未告知|未提供|无终端客户|无|未知)\s*$/gu, ' ')
  // 去掉 s.r.o. / sp. z o.o. / sp.k. / s.a. / s.l. / pvt. ltd. 等带点缩写
  text = text
    .replace(/\bsp\.?\s*z\s*o\.?\s*o\.?\b/giu, ' ')
    .replace(/\bsp\.?\s*k\.?\b/giu, ' ')
    .replace(/\bs\.?\s*r\.?\s*o\.?\b/giu, ' ')
    .replace(/\bs\.?\s*a\.?\b/giu, ' ')
    .replace(/\bs\.?\s*l\.?\b/giu, ' ')
    .replace(/\bo\.?\s*s\.?\b/giu, (m) => m.replace(/\./g, ''))
    .replace(/\bm\.?\s*n\.?\b/giu, (m) => m.replace(/[\.\s]/g, ''))
  return text.trim()
}

function stripChineseGeneric(text) {
  let result = text
  let changed = true
  while (changed) {
    changed = false
    for (const word of GENERIC_CHINESE_SUFFIXES) {
      if (result.length > word.length && result.includes(word)) {
        result = result.replaceAll(word, '')
        changed = true
      }
    }
  }
  return result.trim()
}

/**
 * 提取终端客户的归一化特征：
 * - normalizedForms: 剥离公司后缀/标点后的完整词组（用于精确一致比对）
 * - coreTokens: 剥离组织形式与行业通用词后的核心商号词（用于不需要输入全称的智能匹配）
 */
export function extractEndUserMatchProfile(rawValue) {
  const raw = String(rawValue ?? '').trim()
  if (!raw || isNoiseSentence(raw)) {
    return { valid: false, raw, normalizedForms: [], coreTokens: [] }
  }

  // 按 / 、 , ， ; ； 拆分为多个子主体（如 "Eagle Electric/ ELECTROWYNK"）
  const rawSegments = raw
    .split(/[\/\\,，;；|]+/u)
    .map(cleanSegment)
    .filter((seg) => seg && !isNoiseSentence(seg))

  if (!rawSegments.length) {
    return { valid: false, raw, normalizedForms: [], coreTokens: [] }
  }

  const normalizedSet = new Set()
  const tokenSet = new Set()

  for (const segment of rawSegments) {
    const upper = segment.toUpperCase()
    // 提取连续英数字或连续汉字块
    const words = upper.match(/[A-Z0-9]+|[\u4E00-\u9FFF]+/gu) || []
    const nonOrgWords = []

    for (const word of words) {
      if (/^[A-Z0-9]+$/u.test(word)) {
        // 纯数字或单字母忽略
        if (/^\d+$/u.test(word) || word.length < 2) continue
        if (!['CO', 'COMPANY', 'LTD', 'LIMITED', 'PVT', 'PRIVATE', 'INC', 'CORP', 'CORPORATION', 'LLC', 'GMBH', 'SRO', 'SA', 'SL', 'SPK', 'ZRT', 'PLC'].includes(word)) {
          nonOrgWords.push(word)
        }
        if (!GENERIC_ENGLISH_STOPWORDS.has(word) && word.length >= 3) {
          tokenSet.add(word)
        }
      } else if (/^[\u4E00-\u9FFF]+$/u.test(word)) {
        if (isNoiseSentence(word)) continue
        const stripped = stripChineseGeneric(word)
        if (stripped.length >= 2 && !isNoiseSentence(stripped)) {
          nonOrgWords.push(stripped)
          tokenSet.add(stripped)
        }
      }
    }

    if (nonOrgWords.length) {
      const form = nonOrgWords.join(' ')
      if (form.replace(/\s+/g, '').length >= 2 && !isNoiseSentence(form)) {
        normalizedSet.add(form)
      }
    }
  }

  // 如果某段全是行业词（如 "US METAL"、"CHEIL ELECTRIC"），没有提取出非停用词 token，
  // 则使用至少包含 2 个词的 normalizedForm 作为整体 token，避免误报单个通用词，同时支持整词匹配。
  const normalizedForms = Array.from(normalizedSet)
  const coreTokens = Array.from(tokenSet)

  if (!normalizedForms.length && !coreTokens.length) {
    return { valid: false, raw, normalizedForms: [], coreTokens: [] }
  }

  return {
    valid: true,
    raw,
    normalizedForms,
    coreTokens,
  }
}

/**
 * 判断两个终端客户名称是否指向同一终端客户（支持简称、漏写后缀、多主体并列）
 */
export function isQuotationEndUserConflict(inputA, inputB) {
  const profileA = typeof inputA === 'object' && inputA?.normalizedForms ? inputA : extractEndUserMatchProfile(inputA)
  const profileB = typeof inputB === 'object' && inputB?.normalizedForms ? inputB : extractEndUserMatchProfile(inputB)
  if (!profileA.valid || !profileB.valid) return false

  // 1. 剥离组织后缀后的完整词组完全相等（如 "EI EMS INDIA" === "EI EMS INDIA"，或 "US METAL" === "US METAL"）
  for (const formA of profileA.normalizedForms) {
    const compactA = formA.replace(/\s+/g, '')
    for (const formB of profileB.normalizedForms) {
      const compactB = formB.replace(/\s+/g, '')
      if (compactA && compactA === compactB) return true
    }
  }

  // 2. 核心商号词交集命中（如 "VVDN" 命中 "VVDN TECHNOLOGIES PRIVATE LIMITED"）
  for (const tokenA of profileA.coreTokens) {
    for (const tokenB of profileB.coreTokens) {
      if (tokenA === tokenB) return true
      const isChineseA = /^[\u4E00-\u9FFF]+$/u.test(tokenA)
      const isChineseB = /^[\u4E00-\u9FFF]+$/u.test(tokenB)
      if (isChineseA && isChineseB) {
        // 中文核心商号词（>= 2 字）包含关系
        if (tokenA.length >= 2 && tokenB.length >= 2 && (tokenA.includes(tokenB) || tokenB.includes(tokenA))) {
          return true
        }
      } else if (!isChineseA && !isChineseB) {
        // 英文核心词前缀匹配（当输入词长度 >= 4 时，如输入 "SINGOD" 命中 "SINGODIA"，或 "VOLTAIC" 命中 "VOLTAICCABLES"）
        const shorter = tokenA.length <= tokenB.length ? tokenA : tokenB
        const longer = tokenA.length <= tokenB.length ? tokenB : tokenA
        if (shorter.length >= 4 && longer.startsWith(shorter)) {
          return true
        }
      }
    }
  }

  return false
}
