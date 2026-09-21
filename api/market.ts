const upstreams = {
  binanceFutures: 'https://fapi.binance.com',
  binanceSpot: 'https://api.binance.com',
  mexc: 'https://api.mexc.com',
} as const

const allowedPath = (path: string, provider: string) => {
  if (provider === 'mexc') return /^\/api\/v3\/(ticker\/24hr|klines)(\?|$)/.test(path)
  return /^\/(fapi\/v1|api\/v3)\/(ticker\/24hr|klines|premiumIndex)(\?|$)/.test(path)
}

export default async function handler(request: Request) {
  const url = new URL(request.url)
  const provider = url.searchParams.get('provider') || 'binanceFutures'
  const path = url.searchParams.get('path') || ''
  const target = upstreams[provider as keyof typeof upstreams]

  if (!target || !allowedPath(path, provider)) {
    return Response.json({ error: 'Unsupported market request' }, { status: 400 })
  }

  try {
    const upstream = await fetch(`${target}${path}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(9000),
    })
    const body = await upstream.text()
    return new Response(body, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'application/json',
        'cache-control': 'public, max-age=5, s-maxage=5',
        'access-control-allow-origin': '*',
      },
    })
  } catch {
    return Response.json({ error: 'Market provider unavailable' }, { status: 502 })
  }
}
