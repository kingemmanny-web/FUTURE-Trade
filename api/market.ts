const upstreams = {
  binanceFutures: 'https://fapi.binance.com',
  binanceSpot: 'https://api.binance.com',
  mexc: 'https://api.mexc.com',
} as const

const allowedPath = (path: string, provider: string) => {
  if (provider === 'mexc') return /^\/api\/v3\/(ticker\/24hr|klines)(\?|$)/.test(path)
  return /^\/(fapi\/v1|api\/v3)\/(ticker\/24hr|klines|premiumIndex)(\?|$)/.test(path)
}

type VercelRequest = { query: Record<string, string | string[] | undefined> }
type VercelResponse = { status: (code: number) => VercelResponse; setHeader: (name: string, value: string) => VercelResponse; send: (body: string) => void }

export default async function handler(request: VercelRequest, response: VercelResponse) {
  const provider = typeof request.query.provider === 'string' ? request.query.provider : 'binanceFutures'
  const path = typeof request.query.path === 'string' ? request.query.path : ''
  const target = upstreams[provider as keyof typeof upstreams]

  if (!target || !allowedPath(path, provider)) {
    return response.status(400).setHeader('content-type', 'application/json').send(JSON.stringify({ error: 'Unsupported market request' }))
  }

  try {
    const upstream = await fetch(`${target}${path}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(9000),
    })
    const body = await upstream.text()
    return response.status(upstream.status).setHeader('content-type', upstream.headers.get('content-type') || 'application/json').setHeader('cache-control', 'public, max-age=5, s-maxage=5').setHeader('access-control-allow-origin', '*').send(body)
  } catch {
    return response.status(502).setHeader('content-type', 'application/json').send(JSON.stringify({ error: 'Market provider unavailable' }))
  }
}
