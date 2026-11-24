import COUNTRY_ENGLISH_NAMES from './quotationCountryNames.json'

// 报价单明细的下拉选项与合规校验（2026-09-16 用户口径）：
// 国家 / 客户性质 / 单位是选项列；国家允许中文规范名或模板中的完整双语标签，
// 双语标签会在解析时还原为中文规范名，表里没有的值不允许进系统（空值放行）。
//
// 服务端同一份规则在 server/utils/quotation-options.ts，
// app/__tests__/quotation-options.spec.js 会对拍两边的清单与判定结果。
export const DEFAULT_QUOTATION_UNIT = 'kpcs'
/** 历史单位清单：模板已取消单位列，仅用于兼容旧数据展示 */
export const QUOTATION_UNIT_OPTIONS = ['pcs', 'kpcs']

// 2026-09-17 用户口径：EMS 与品牌商是两个不同性质，必须分成两项，不再合并成「EMS/品牌商」
// 2026-11-03 新增「代理商」
export const QUOTATION_CUSTOMER_STYLE_OPTIONS = ['分销商', '代理商', '终端', 'EMS', '品牌商', '其他']

const COUNTRY_GROUPS = {
  亚洲: ['中国', '中国香港', '中国台湾', '日本', '韩国', '印度', '印度尼西亚', '马来西亚', '新加坡', '泰国', '越南', '菲律宾', '柬埔寨', '缅甸', '老挝', '文莱', '孟加拉国', '巴基斯坦', '斯里兰卡', '尼泊尔', '马尔代夫', '蒙古', '哈萨克斯坦', '乌兹别克斯坦', '吉尔吉斯斯坦', '塔吉克斯坦', '土库曼斯坦', '阿富汗', '伊朗', '伊拉克', '叙利亚', '黎巴嫩', '约旦', '以色列', '巴勒斯坦', '沙特阿拉伯', '阿联酋', '卡塔尔', '巴林', '科威特', '阿曼', '也门', '亚美尼亚', '阿塞拜疆', '格鲁吉亚', '土耳其', '塞浦路斯'],
  欧洲: ['德国', '法国', '英国', '意大利', '西班牙', '葡萄牙', '荷兰', '比利时', '卢森堡', '瑞士', '奥地利', '波兰', '捷克', '斯洛伐克', '匈牙利', '罗马尼亚', '保加利亚', '希腊', '克罗地亚', '斯洛文尼亚', '塞尔维亚', '波黑', '黑山', '北马其顿', '阿尔巴尼亚', '俄罗斯', '乌克兰', '白俄罗斯', '立陶宛', '拉脱维亚', '爱沙尼亚', '芬兰', '瑞典', '挪威', '丹麦', '冰岛', '爱尔兰', '马耳他', '摩尔多瓦', '摩纳哥', '列支敦士登', '安道尔', '圣马力诺'],
  美洲: ['美国', '加拿大', '墨西哥', '巴西', '阿根廷', '智利', '秘鲁', '哥伦比亚', '委内瑞拉', '厄瓜多尔', '玻利维亚', '巴拉圭', '乌拉圭', '圭亚那', '苏里南', '巴拿马', '哥斯达黎加', '危地马拉', '洪都拉斯', '萨尔瓦多', '尼加拉瓜', '伯利兹', '古巴', '多米尼加', '海地', '牙买加', '特立尼达和多巴哥', '巴哈马', '巴巴多斯', '波多黎各'],
  非洲: ['埃及', '南非', '尼日利亚', '肯尼亚', '埃塞俄比亚', '坦桑尼亚', '乌干达', '卢旺达', '加纳', '科特迪瓦', '塞内加尔', '喀麦隆', '摩洛哥', '阿尔及利亚', '突尼斯', '利比亚', '苏丹', '南苏丹', '赞比亚', '津巴布韦', '莫桑比克', '安哥拉', '纳米比亚', '博茨瓦纳', '马达加斯加', '毛里求斯', '刚果（金）', '刚果（布）', '加蓬', '贝宁', '多哥', '布基纳法索', '马里', '尼日尔', '乍得', '索马里', '吉布提', '厄立特里亚', '塞拉利昂', '利比里亚', '几内亚', '冈比亚', '毛里塔尼亚', '中非', '赤道几内亚', '马拉维', '莱索托', '斯威士兰', '塞舌尔', '佛得角'],
  大洋洲: ['澳大利亚', '新西兰', '巴布亚新几内亚', '斐济', '所罗门群岛', '瓦努阿图', '萨摩亚', '汤加'],
}

/** 扁平的国家/地区清单（大洲顺序，供下拉与校验使用） */
export const QUOTATION_COUNTRY_OPTIONS = Object.values(COUNTRY_GROUPS).flat()

/** 网页与外贸模板显示中英双语；value 保持中文规范值以兼容历史数据和入库口径。 */
export const QUOTATION_COUNTRY_MENU_OPTIONS = QUOTATION_COUNTRY_OPTIONS.map((value) => ({
  value,
  label: `${value} / ${COUNTRY_ENGLISH_NAMES[value] || value}`,
}))

const COUNTRY_BILINGUAL_LABELS = new Map(
  QUOTATION_COUNTRY_MENU_OPTIONS.map(({ value, label }) => [label.toLowerCase(), value]),
)

/** 常用物料封装清单（供下拉建议与快速选择） */
export const QUOTATION_PACKAGE_OPTIONS = [
  'SOD-123FL',
  'SOD-323',
  'SOD-523',
  'SMA',
  'SMB',
  'SMC',
  'SMAF',
  'SMBF',
  'TO-252',
  'TO-277',
  'TO-220',
  'SOT-23',
  'SOT-23-3L',
  'SOT-23-5L',
  'SOT-23-6L',
  'SOT-89',
  'PDFN3.3x3.3',
  'PDFN5x6',
  'DFN1006',
  'LL-34',
  'LL-41',
  'DO-214AC',
  'DO-214AA',
  'DO-214AB',
]

export const QUOTATION_OPTION_RULES = [
  { key: 'country', label: '国家', options: QUOTATION_COUNTRY_OPTIONS },
  { key: 'customerStyle', label: '客户性质', options: QUOTATION_CUSTOMER_STYLE_OPTIONS },
]

export function quotationOptionRule(key) {
  return QUOTATION_OPTION_RULES.find((rule) => rule.key === key) || null
}

/** 单个值是否合规：非选项列一律放行，空值放行；比对忽略大小写（Excel 里常打成 KPCS） */
export function isQuotationOptionValue(key, value) {
  const rule = quotationOptionRule(key)
  if (!rule) return true
  const text = String(value ?? '').trim()
  if (!text) return true
  const normalizedText = text.toLowerCase()
  return rule.options.some((option) => option.toLowerCase() === normalizedText)
    || (key === 'country' && COUNTRY_BILINGUAL_LABELS.has(normalizedText))
}

/** 国家双语标签转中文规范值；其他枚举规范大小写（KPCS → kpcs），未知值由校验层拦下。 */
export function normalizeQuotationOptionValue(key, value) {
  const rule = quotationOptionRule(key)
  if (!rule) return value
  const text = String(value ?? '').trim()
  if (!text) return value ?? ''
  const normalizedText = text.toLowerCase()
  const canonicalValue = rule.options.find((option) => option.toLowerCase() === normalizedText)
  if (canonicalValue) return canonicalValue
  if (key === 'country') return COUNTRY_BILINGUAL_LABELS.get(normalizedText) ?? value
  return value
}

/** 逐行找出不合规的单元格，返回可直接显示的片段，如 "第3行国家「印度X」" */
export function quotationOptionViolations(rows) {
  const found = []
  ;(Array.isArray(rows) ? rows : []).forEach((row, index) => {
    const rowLabel = String(row?.rowLabel || `第${index + 1}行`)
    for (const rule of QUOTATION_OPTION_RULES) {
      const text = String(row?.[rule.key] ?? '').trim()
      if (!text || isQuotationOptionValue(rule.key, text)) continue
      found.push(`${rowLabel}${rule.label}「${text}」`)
    }
  })
  return found
}

/** 把违规项拼成一句给用户看的话（最多列 3 处） */
export function formatQuotationOptionViolations(violations) {
  const list = Array.isArray(violations) ? violations.filter(Boolean) : []
  if (!list.length) return ''
  const shown = list.slice(0, 3).join('、')
  const more = list.length > 3 ? ` 等 ${list.length} 处` : ''
  return `${shown}${more}不在下拉选项内（国家/客户性质/单位必须与表格一致），已取消本次操作`
}

/** RevoGrid 下拉编辑器要的 { label, value } 结构 */
export function quotationSelectSource(options) {
  return (Array.isArray(options) ? options : []).map((item) => ({ label: item, value: item }))
}

export const QUOTATION_COUNTRY_SOURCE = quotationSelectSource(QUOTATION_COUNTRY_OPTIONS)
export const QUOTATION_CUSTOMER_STYLE_SOURCE = quotationSelectSource(QUOTATION_CUSTOMER_STYLE_OPTIONS)
export const QUOTATION_UNIT_SOURCE = quotationSelectSource(QUOTATION_UNIT_OPTIONS)
