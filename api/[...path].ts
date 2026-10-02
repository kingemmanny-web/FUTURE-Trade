type VercelRequest = {
  url?: string
  method?: string
}

type VercelResponse = {
  status: (code: number) => VercelResponse
  setHeader: (name: string, value: string) => VercelResponse
  send: (body: string) => void
  end: () => void
}

type Route = { prefix: string; target: string }

const routes: Route[] = [
  { prefix: 'binance-futures', target: 'https://fapi.binance.com' },
  { prefix: 'binance-spot', target: 'https://api.binance.com' },
  { prefix: 'mexc-futures', target: 'https://contract.mexc.com' },
  { prefix: 'mexc', target: 'https://api.mexc.com' },
  { prefix: 'bybit', target: 'https://api.bybit.com' },
  { prefix: 'okx', target: 'https://www.okx.com' },
  { prefix: 'cryptocompare', target: 'https://min-api.cryptocompare.com' },
  { prefix: 'rss2json', target: 'https://api.rss2json.com' },
  { prefix: 'coingecko', target: 'https://api.coingecko.com' },
]

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'GET') {
    response.status(405).setHeader('Allow', 'GET').send('Method not allowed')
    return
  }

  const requestUrl = new URL(request.url || '/api', 'https://vercel.invalid')
  const path = requestUrl.pathname.replace(/^\/api\//, '')
  const route = routes.find((candidate) => path === candidate.prefix || path.startsWith(`${candidate.prefix}/`))
  if (!route) {
    response.status(404).send('Unknown API route')
    return
  }

  const upstreamPath = path.slice(route.prefix.length) || '/'
  const upstreamUrl = `${route.target}${upstreamPath.startsWith('/') ? upstreamPath : `/${upstreamPath}`}${requestUrl.search}`

  try {
    const upstream = await fetch(upstreamUrl, { headers: { Accept: 'application/json' } })
    const body = await upstream.text()
    response.status(upstream.status).setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json').send(body)
  } catch {
    response.status(502).send('Upstream API unavailable')
  }
}
