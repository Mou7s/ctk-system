const TOP_PHYSICAL_TIERS = [
  { level: '一等', rank: '第1名', key: '一等' },
  { level: '二等', rank: '第2名', key: '二等' },
  { level: '三等', rank: '第3名', key: '三等' }
]

const PARTICIPATION_TIER = { level: '四等', rank: '第4名起', key: '四等' }

function isEnabledPrize(prize) {
  return prize && prize.status !== '1'
}

function isThankYouPrize(prize) {
  if (!prize) return false
  if (prize.prizeType === '2') return true
  const name = prize.prizeName || ''
  return name.includes('谢谢参与')
}

function isPhysicalPrize(prize) {
  if (!isEnabledPrize(prize) || isThankYouPrize(prize)) {
    return false
  }
  const level = prize.prizeLevel || ''
  return [...TOP_PHYSICAL_TIERS, PARTICIPATION_TIER].some((tier) => level.includes(tier.key))
}

function matchPhysicalTier(prize, tier) {
  const level = prize.prizeLevel || ''
  return level.includes(tier.key)
}

function getEnabledPrizes(prizes) {
  return (prizes || []).filter((prize) => isEnabledPrize(prize) && prize.prizeType !== '1')
}

/**
 * 从活动描述中拆出参与说明与兑奖说明，去掉静态【奖项设置】段落（改由奖池动态生成）。
 */
export function parseActivityDescription(description) {
  if (!description) {
    return { intro: '', redeem: '' }
  }

  const awardIdx = description.indexOf('【奖项设置】')
  const redeemIdx = description.indexOf('【兑奖说明】')

  let intro = description.trim()
  let redeem = ''

  if (awardIdx >= 0 && redeemIdx >= 0 && redeemIdx > awardIdx) {
    intro = description.substring(0, awardIdx).trim()
    redeem = description.substring(redeemIdx).replace(/^【兑奖说明】\s*/, '').trim()
  } else if (awardIdx >= 0) {
    intro = description.substring(0, awardIdx).trim()
  } else if (redeemIdx >= 0) {
    intro = description.substring(0, redeemIdx).trim()
    redeem = description.substring(redeemIdx).replace(/^【兑奖说明】\s*/, '').trim()
  }

  return { intro, redeem }
}

/**
 * 根据奖池配置生成奖项设置文案（不含数量）。
 */
export function buildPrizeSettingsLines(prizes) {
  const validPrizes = getEnabledPrizes(prizes)
  if (validPrizes.length === 0) {
    return ['暂无奖项配置，请联系活动管理员。']
  }

  const lines = []

  TOP_PHYSICAL_TIERS.forEach((tier) => {
    const items = validPrizes.filter((p) => isPhysicalPrize(p) && matchPhysicalTier(p, tier))
    if (items.length === 0) {
      return
    }
    const names = [...new Set(items.map((p) => p.prizeName).filter(Boolean))]
    lines.push(`· ${tier.rank}：${tier.level}实物池随机抽取（${names.join('、')}）`)
  })

  const participationItems = validPrizes.filter(
    (p) => isPhysicalPrize(p) && matchPhysicalTier(p, PARTICIPATION_TIER)
  )
  const participationNames = [...new Set(participationItems.map((p) => p.prizeName).filter(Boolean))]
  if (participationNames.length > 0) {
    lines.push(`· ${PARTICIPATION_TIER.rank}：统一发放（${participationNames.join('、')}）`)
  }

  const hasThankYou = validPrizes.some(isThankYouPrize)
  if (hasThankYou && participationNames.length === 0) {
    lines.push(`· ${PARTICIPATION_TIER.rank}：谢谢参与`)
  }
  if (hasThankYou && participationNames.length > 0) {
    lines.push(`· ${participationNames.join('、')}发完后，或前三名对应等级库存不足时：谢谢参与`)
  } else if (hasThankYou) {
    lines.push('· 前三名对应等级库存不足时：谢谢参与')
  }

  return lines.length > 0 ? lines : ['暂无奖项配置，请联系活动管理员。']
}

export function buildPrizeSettingsText(prizes) {
  return buildPrizeSettingsLines(prizes).join('\n')
}

export function buildPrizeSubtitle(prizes, variant = 'mobile') {
  if (variant === 'screen') {
    return '游戏规则：微信扫码登记参赛 · 疯狂点击手机充能 · 实时竞速抢占领奖台'
  }
  return '现场点击 PK · 疯狂点击屏幕充能 · 实时竞速争夺大奖'
}