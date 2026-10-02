export type Candle = { open: number; high: number; low: number; close: number }
export type MarketSnapshot = { price: number; change: number; high: number; low: number; volume: number; funding?: number; source?: string }
export type ExchangeSnapshot = { snapshot: MarketSnapshot; candles: Candle[]; candleSource: string; candleInterval: string }

const binanceBase = (marketType: string) => marketType === 'Futures' ? '/api/binance-futures' : '/api/binance-spot'

const mexcBase = (marketType: string, path: string, query: string) => import.meta.env.DEV
  ? `${marketType === 'Futures' ? '/api/mexc-futures' : '/api/mexc'}${path}?${query}`
  : `/api/mexc?market=${marketType === 'Futures' ? 'futures' : 'spot'}&path=${encodeURIComponent(path)}&${query}`

const mexcSymbol = (symbol: string, marketType: string) => marketType === 'Futures' ? `${symbol.slice(0, -4)}_USDT` : symbol

const mexcFuturesInterval = (interval: string) => ({ '1m': 'Min1', '5m': 'Min5', '15m': 'Min15', '30m': 'Min30', '1h': 'Min60', '2h': 'Min120', '4h': 'Hour4', '8h': 'Hour8', '12h': 'Hour12', '1d': 'Day1' }[interval] || interval)
const bybitBase = '/api/bybit'
const okxBase = '/api/okx'
const coinGeckoBase = '/api/coingecko/api/v3'
const bybitCategory = (marketType: string) => marketType === 'Futures' ? 'linear' : 'spot'
const bybitInterval = (interval: string) => ({ '1d': 'D', '12h': '720', '8h': '480', '6h': '360', '4h': '240', '2h': '120', '1h': '60', '30m': '30', '15m': '15', '5m': '5', '3m': '3', '1m': '1' }[interval] || interval)
const okxInstrument = (symbol: string, marketType: string) => marketType === 'Futures' ? `${symbol.slice(0, -4)}-USDT-SWAP` : `${symbol.slice(0, -4)}-USDT`
const okxBar = (interval: string) => ({ '1d': '1Dutc', '12h': '12H', '8h': '8H', '6h': '6H', '4h': '4H', '2h': '2H', '1h': '1H', '30m': '30m', '15m': '15m', '5m': '5m', '3m': '3m', '1m': '1m' }[interval] || interval)

const asNumber = (value: unknown) => Number(value ?? 0)
const fetchCandlesOrEmpty = (exchange: string, marketType: string, symbol: string, interval: string, limit: number) =>
  fetchExchangeCandles(exchange, marketType, symbol, interval, limit).catch(() => [])
const fetchFundingOrEmpty = async (url: string) => {
  try {
    const response = await fetch(url)
    return response.ok ? response : null
  } catch {
    return null
  }
}

const parseMexcCandles = (payload: any): Candle[] => {
  const data = payload?.data ?? payload
  if (Array.isArray(data)) return data.map((candle: any[]) => ({ open: asNumber(candle[1]), high: asNumber(candle[2]), low: asNumber(candle[3]), close: asNumber(candle[4]) }))
  if (!data?.open) return []
  return data.open.map((open: number, index: number) => ({ open: asNumber(open), high: asNumber(data.high[index]), low: asNumber(data.low[index]), close: asNumber(data.close[index]) }))
}

const parseBybitCandles = (payload: any): Candle[] => (payload?.result?.list || []).reverse().map((candle: string[]) => ({ open: asNumber(candle[1]), high: asNumber(candle[2]), low: asNumber(candle[3]), close: asNumber(candle[4]) }))
const parseOkxCandles = (payload: any): Candle[] => (payload?.data || []).reverse().map((candle: string[]) => ({ open: asNumber(candle[1]), high: asNumber(candle[2]), low: asNumber(candle[3]), close: asNumber(candle[4]) }))

const coinGeckoIds: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binancecoin', XRP: 'ripple', ADA: 'cardano',
  DOGE: 'dogecoin', TRX: 'tron', TON: 'the-open-network', AVAX: 'avalanche-2', LINK: 'chainlink',
  DOT: 'polkadot', BCH: 'bitcoin-cash', LTC: 'litecoin', SUI: 'sui', APT: 'aptos', NEAR: 'near',
  UNI: 'uniswap', ETC: 'ethereum-classic', FIL: 'filecoin', ARB: 'arbitrum', OP: 'optimism',
}

async function fetchCoinGeckoSnapshot(symbol: string): Promise<ExchangeSnapshot> {
  const asset = symbol.replace(/USDT$|USD$|USDC$/, '')
  const coinId = coinGeckoIds[asset]
  if (!coinId) throw new Error(`No public fallback mapping for ${asset}`)
  const marketPath = `/coins/${coinId}/market_chart?vs_currency=usd&days=1`
  const candlesPath = `/coins/${coinId}/ohlc?vs_currency=usd&days=1`
  const fetchJson = async (path: string) => {
    for (const url of [`${coinGeckoBase}${path}`, `https://api.coingecko.com/api/v3${path}`]) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
        if (response.ok) return response.json()
      } catch {
        // Try the other route; browser and proxy reachability can differ by network.
      }
    }
    throw new Error('CoinGecko fallback unavailable')
  }
  const [payload, ohlcPayload] = await Promise.all([fetchJson(marketPath), fetchJson(candlesPath)])
  const prices = (payload?.prices || []).filter((point: unknown[]) => Array.isArray(point) && Number.isFinite(Number(point[1]))) as [number, number][]
  const candles = (ohlcPayload || []).map((candle: number[]) => ({ open: asNumber(candle[1]), high: asNumber(candle[2]), low: asNumber(candle[3]), close: asNumber(candle[4]) }))
  if (prices.length < 2 || !candles.length) throw new Error('CoinGecko OHLC data unavailable')
  const values = prices.map((point) => Number(point[1]))
  const volume = Number(payload?.total_volumes?.at(-1)?.[1] || 0)
  return {
    snapshot: {
      price: values.at(-1)!,
      change: (values.at(-1)! - values[0]) / values[0] * 100,
      high: Math.max(...values),
      low: Math.min(...values),
      volume,
      source: 'CoinGecko spot',
    },
    candles,
    candleSource: 'CoinGecko spot',
    candleInterval: '30m',
  }
}

export async function fetchExchangeCandles(exchange: string, marketType: string, symbol: string, interval: string, limit: number): Promise<Candle[]> {
  if (exchange === 'MEXC') {
    const apiInterval = marketType === 'Futures' ? mexcFuturesInterval(interval) : interval
    const response = await fetch(mexcBase(marketType, marketType === 'Futures' ? `/api/v1/contract/kline/${mexcSymbol(symbol, marketType)}` : '/api/v3/klines', marketType === 'Futures' ? `interval=${apiInterval}&limit=${limit}` : `symbol=${symbol}&interval=${interval}&limit=${limit}`))
    if (!response.ok) throw new Error('MEXC candle request failed')
    return parseMexcCandles(await response.json())
  }

  if (exchange === 'Bybit') {
    const response = await fetch(`${bybitBase}/v5/market/kline?category=${bybitCategory(marketType)}&symbol=${symbol}&interval=${bybitInterval(interval)}&limit=${limit}`)
    if (!response.ok) throw new Error('Bybit candle request failed')
    return parseBybitCandles(await response.json())
  }

  if (exchange === 'OKX') {
    const response = await fetch(`${okxBase}/api/v5/market/candles?instId=${okxInstrument(symbol, marketType)}&bar=${okxBar(interval)}&limit=${limit}`)
    if (!response.ok) throw new Error('OKX candle request failed')
    return parseOkxCandles(await response.json())
  }

  const response = await fetch(`${binanceBase(marketType)}${marketType === 'Futures' ? '/fapi/v1/klines' : '/api/v3/klines'}?symbol=${symbol}&interval=${interval}&limit=${limit}`)
  if (!response.ok) throw new Error('Binance candle request failed')
  return (await response.json()).map((candle: string[]) => ({ open: asNumber(candle[1]), high: asNumber(candle[2]), low: asNumber(candle[3]), close: asNumber(candle[4]) }))
}

async function fetchProviderSnapshot(exchange: string, marketType: string, symbol: string, interval: string): Promise<ExchangeSnapshot> {
  if (exchange === 'MEXC') {
    const apiSymbol = mexcSymbol(symbol, marketType)
    const tickerResponse = await fetch(mexcBase(marketType, marketType === 'Futures' ? '/api/v1/contract/ticker' : '/api/v3/ticker/24hr', `symbol=${apiSymbol}`))
    const candlePromise = fetchCandlesOrEmpty(exchange, marketType, symbol, interval, 48)
    if (!tickerResponse.ok) throw new Error('MEXC ticker request failed')
    const tickerPayload = await tickerResponse.json()
    const ticker = tickerPayload?.data ?? tickerPayload
    const fundingPromise = marketType === 'Futures' ? fetchFundingOrEmpty(mexcBase(marketType, `/api/v1/contract/funding_rate/${apiSymbol}`, '')) : Promise.resolve(null)
    const [candles, fundingResponse] = await Promise.all([candlePromise, fundingPromise])
    const fundingPayload = fundingResponse && fundingResponse.ok ? await fundingResponse.json() : null
    const funding = fundingPayload?.data?.fundingRate ?? fundingPayload?.fundingRate
    return { snapshot: { price: asNumber(ticker.lastPrice), change: asNumber(ticker.priceChangePercent ?? ticker.riseFallRate) * (ticker.riseFallRate === undefined ? 1 : 100), high: asNumber(ticker.highPrice ?? ticker.high24Price ?? ticker.higher24Price), low: asNumber(ticker.lowPrice ?? ticker.lower24Price), volume: asNumber(ticker.quoteVolume ?? ticker.amount24 ?? ticker.volume24), funding: funding === undefined ? undefined : asNumber(funding) * 100 }, candles, candleSource: exchange, candleInterval: interval }
  }

  if (exchange === 'Bybit') {
    const category = bybitCategory(marketType)
    const tickerResponse = await fetch(`${bybitBase}/v5/market/tickers?category=${category}&symbol=${symbol}`)
    if (!tickerResponse.ok) throw new Error('Bybit ticker request failed')
    const ticker = (await tickerResponse.json())?.result?.list?.[0]
    if (!ticker) throw new Error('Bybit ticker data unavailable')
    const [candles, fundingResponse] = await Promise.all([fetchCandlesOrEmpty(exchange, marketType, symbol, interval, 48), marketType === 'Futures' ? fetchFundingOrEmpty(`${bybitBase}/v5/market/funding/history?category=${category}&symbol=${symbol}&limit=1`) : Promise.resolve(null)])
    const funding = fundingResponse && fundingResponse.ok ? (await fundingResponse.json())?.result?.list?.[0]?.fundingRate : undefined
    return { snapshot: { price: asNumber(ticker.lastPrice), change: asNumber(ticker.price24hPcnt) * 100, high: asNumber(ticker.highPrice24h), low: asNumber(ticker.lowPrice24h), volume: asNumber(ticker.turnover24h), funding: funding === undefined ? undefined : asNumber(funding) * 100 }, candles, candleSource: exchange, candleInterval: interval }
  }

  if (exchange === 'OKX') {
    const instId = okxInstrument(symbol, marketType)
    const tickerResponse = await fetch(`${okxBase}/api/v5/market/ticker?instId=${instId}`)
    if (!tickerResponse.ok) throw new Error('OKX ticker request failed')
    const ticker = (await tickerResponse.json())?.data?.[0]
    if (!ticker) throw new Error('OKX ticker data unavailable')
    const [candles, fundingResponse] = await Promise.all([fetchCandlesOrEmpty(exchange, marketType, symbol, interval, 48), marketType === 'Futures' ? fetchFundingOrEmpty(`${okxBase}/api/v5/public/funding-rate?instId=${instId}`) : Promise.resolve(null)])
    const funding = fundingResponse && fundingResponse.ok ? (await fundingResponse.json())?.data?.[0]?.fundingRate : undefined
    return { snapshot: { price: asNumber(ticker.last), change: asNumber(ticker.sodUtc8) ? (asNumber(ticker.last) - asNumber(ticker.sodUtc8)) / asNumber(ticker.sodUtc8) * 100 : 0, high: asNumber(ticker.high24h), low: asNumber(ticker.low24h), volume: asNumber(ticker.volCcy24h), funding: funding === undefined ? undefined : asNumber(funding) * 100 }, candles, candleSource: exchange, candleInterval: interval }
  }

  const base = binanceBase(marketType)
  const tickerPath = marketType === 'Futures' ? '/fapi/v1/ticker/24hr' : '/api/v3/ticker/24hr'
  const tickerResponse = await fetch(`${base}${tickerPath}?symbol=${symbol}`)
  const candlePromise = fetchCandlesOrEmpty(exchange, marketType, symbol, interval, 48)
  const fundingPromise = marketType === 'Futures' ? fetchFundingOrEmpty(`${base}/fapi/v1/premiumIndex?symbol=${symbol}`) : Promise.resolve(null)
  if (!tickerResponse.ok) throw new Error('Binance ticker request failed')
  const [ticker, candles, fundingResponse] = await Promise.all([tickerResponse.json(), candlePromise, fundingPromise])
  const funding = fundingResponse && fundingResponse.ok ? asNumber((await fundingResponse.json()).lastFundingRate) * 100 : undefined
  return { snapshot: { price: asNumber(ticker.lastPrice), change: asNumber(ticker.priceChangePercent), high: asNumber(ticker.highPrice), low: asNumber(ticker.lowPrice), volume: asNumber(ticker.quoteVolume), funding }, candles, candleSource: exchange, candleInterval: interval }
}

export async function fetchExchangeSnapshot(exchange: string, marketType: string, symbol: string, interval = '5m'): Promise<ExchangeSnapshot> {
  try {
    const result = await fetchProviderSnapshot(exchange, marketType, symbol, interval)
    if (result.candles.length) return { ...result, snapshot: { ...result.snapshot, source: `${exchange} ${marketType}` } }
  } catch {
    // Continue through providers with candle data if the selected venue is unavailable.
  }
  for (const fallback of [['Binance', 'Spot'], ['MEXC', marketType]] as const) {
    if (fallback[0] === exchange && fallback[1] === marketType) continue
    try {
      const result = await fetchProviderSnapshot(fallback[0], fallback[1], symbol, interval)
      if (result.candles.length) return { ...result, snapshot: { ...result.snapshot, source: `${fallback[0]} ${fallback[1]} fallback` } }
    } catch {
      // Continue to the next independent provider.
    }
  }
  return fetchCoinGeckoSnapshot(symbol)
}