import { createHmac, timingSafeEqual } from 'node:crypto'

export interface NitroJwtClaims {
  login_user_key: string
  iat: number
  exp: number
  /** 数据域：'demo' 表示演示账号令牌（读写演示库）。缺省 = 生产。 */
  scope?: string
}

export interface VerifyNitroTokenOptions {
  allowExpired?: boolean
}

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function decode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function signature(input: string, secret: string): string {
  return createHmac('sha512', secret).update(input).digest('base64url')
}

export function signNitroToken(tokenId: string, secret: string, expireMinutes: number, scope?: string): string {
  if (!secret) {
    throw new Error('Missing Nitro auth token secret')
  }

  const now = Math.floor(Date.now() / 1000)
  const claims: NitroJwtClaims = {
    login_user_key: tokenId,
    iat: now,
    exp: now + Math.max(60, expireMinutes * 60),
    ...(scope ? { scope } : {}),
  }
  const header = encode(JSON.stringify({ alg: 'HS512', typ: 'JWT' }))
  const payload = encode(JSON.stringify(claims))
  return `${header}.${payload}.${signature(`${header}.${payload}`, secret)}`
}

export function verifyNitroToken(token: string, secret: string, options: VerifyNitroTokenOptions = {}): NitroJwtClaims | null {
  if (!token || !secret) {
    return null
  }

  const parts = token.split('.')
  if (parts.length !== 3) {
    return null
  }
  const headerPart = parts[0]!
  const payloadPart = parts[1]!
  const signaturePart = parts[2]!

  try {
    const expected = Buffer.from(signature(`${headerPart}.${payloadPart}`, secret))
    const received = Buffer.from(signaturePart)
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      return null
    }

    const header = JSON.parse(decode(headerPart)) as { alg?: string }
    const claims = JSON.parse(decode(payloadPart)) as NitroJwtClaims
    if (header.alg !== 'HS512' || !claims.login_user_key || !claims.exp) {
      return null
    }
    if (!options.allowExpired && claims.exp <= Math.floor(Date.now() / 1000)) {
      return null
    }
    return claims
  } catch {
    return null
  }
}
