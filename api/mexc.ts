type VercelRequest = {
  url?: string
  method?: string
}

type VercelResponse = {
  status: (code: number) => VercelResponse
  setHeader: (name: string, value: string) => VercelResponse
  send: (body: string) => void
}

const targets: Record<string, string> = {
  spot: 'https://api.mexc.com',
  futures: 'https://contract.mexc.com',
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'GET') {
    response.status(405).setHeader('Allow', 'GET').send('Method not allowed')
    return
  }

  const requestUrl = new URL(request.url || '/api/mexc', 'https://vercel.invalid')
  const market = requestUrl.searchParams.get('market') === 'futures' ? 'futures' : 'spot'
  requestUrl.searchParams.delete('market')
  const upstreamPath = requestUrl.searchParams.get('path') || '/'
  requestUrl.searchParams.delete('path')
  const upstreamUrl = `${targets[market]}${upstreamPath.startsWith('/') ? upstreamPath : `/${upstreamPath}`}${requestUrl.search}`

  try {
    const upstream = await fetch(upstreamUrl, { headers: { Accept: 'application/json' } })
    response.status(upstream.status).setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json').send(await upstream.text())
  } catch {
    response.status(502).send('MEXC API unavailable')
  }
}
