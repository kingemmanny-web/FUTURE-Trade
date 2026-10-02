export type Candle = { open: number; high: number; low: number; close: number }
export type MarketSnapshot = { price: number; change: number; high: number; low: number; volume: number; funding?: number }

const binanceBase = (marketType: string) => marketType === 'Futures' ? '/api/binance-futures' : '/api/binance-spot'

const mexcBase = (marketType: string, path: string, query: string) => import.meta.env.DEV
  ? `${marketType === 'Futures' ? '/api/mexc-futures' : '/api/mexc'}${path}?${query}`
  : `/api/mexc?market=${marketType === 'Futures' ? 'futures' : 'spot'}&path=${encodeURIComponent(path)}&${query}`

const mexcSymbol = (symbol: string, marketType: string) => marketType === 'Futures' ? `${symbol.slice(0, -4)}_USDT` : symbol

const mexcFuturesInterval = (interval: string) => ({ '1m': 'Min1', '5m': 'Min5', '15m': 'Min15', '30m': 'Min30', '1h': 'Min60', '2h': 'Min120', '4h': 'Hour4', '8h': 'Hour8', '12h': 'Hour12', '1d': 'Day1' }[interval] || interval)
const bybitBase = '/api/bybit'
const okxBase = '/api/okx'
const bybitCategory = (marketType: string) => marketType === 'Futures' ? 'linear' : 'spot'
const bybitInterval = (interval: string) => ({ '1d': 'D', '12h': '720', '8h': '480', '6h': '360', '4h': '240', '2h': '120', '1h': '60', '30m': '30', '15m': '15', '5m': '5', '3m': '3', '1m': '1' }[interval] || interval)
const okxInstrument = (symbol: string, marketType: string) => marketType === 'Futures' ? `${symbol.slice(0, -4)}-USDT-SWAP` : `${symbol.slice(0, -4)}-USDT`
const okxBar = (interval: string) => ({ '1d': '1Dutc', '12h': '12H', '8h': '8H', '6h': '6H', '4h': '4H', '2h': '2H', '1h': '1H', '30m': '30m', '15m': '15m', '5m': '5m', '3m': '3m', '1m': '1m' }[interval] || interval)

const asNumber = (value: unknown) => Number(value ?? 0)

const parseMexcCandles = (payload: any): Candle[] => {
  const data = payload?.data ?? payload
  if (Array.isArray(data)) return data.map((candle: any[]) => ({ open: asNumber(candle[1]), high: asNumber(candle[2]), low: asNumber(candle[3]), close: asNumber(candle[4]) }))
  if (!data?.open) return []
  return data.open.map((open: number, index: number) => ({ open: asNumber(open), high: asNumber(data.high[index]), low: asNumber(data.low[index]), close: asNumber(data.close[index]) }))
}

const parseBybitCandles = (payload: any): Candle[] => (payload?.result?.list || []).reverse().map((candle: string[]) => ({ open: asNumber(candle[1]), high: asNumber(candle[2]), low: asNumber(candle[3]), close: asNumber(candle[4]) }))
const parseOkxCandles = (payload: any): Candle[] => (payload?.data || []).reverse().map((candle: string[]) => ({ open: asNumber(candle[1]), high: asNumber(candle[2]), low: asNumber(candle[3]), close: asNumber(candle[4]) }))

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

export async function fetchExchangeSnapshot(exchange: string, marketType: string, symbol: string): Promise<{ snapshot: MarketSnapshot; candles: Candle[] }> {
  if (exchange === 'MEXC') {
    const apiSymbol = mexcSymbol(symbol, marketType)
    const tickerResponse = await fetch(mexcBase(marketType, marketType === 'Futures' ? '/api/v1/contract/ticker' : '/api/v3/ticker/24hr', `symbol=${apiSymbol}`))
    const candlePromise = fetchExchangeCandles(exchange, marketType, symbol, '5m', 48)
    if (!tickerResponse.ok) throw new Error('MEXC ticker request failed')
    const tickerPayload = await tickerResponse.json()
    const ticker = tickerPayload?.data ?? tickerPayload
    const fundingPromise = marketType === 'Futures' ? fetch(mexcBase(marketType, `/api/v1/contract/funding_rate/${apiSymbol}`, '')) : Promise.resolve(null)
    const [candles, fundingResponse] = await Promise.all([candlePromise, fundingPromise])
    const fundingPayload = fundingResponse && fundingResponse.ok ? await fundingResponse.json() : null
    const funding = fundingPayload?.data?.fundingRate ?? fundingPayload?.fundingRate
    return { snapshot: { price: asNumber(ticker.lastPrice), change: asNumber(ticker.priceChangePercent ?? ticker.riseFallRate) * (ticker.riseFallRate === undefined ? 1 : 100), high: asNumber(ticker.highPrice ?? ticker.higher24Price), low: asNumber(ticker.lowPrice ?? ticker.lower24Price), volume: asNumber(ticker.quoteVolume ?? ticker.amount24 ?? ticker.volume24), funding: funding === undefined ? undefined : asNumber(funding) * 100 }, candles }
  }

  if (exchange === 'Bybit') {
    const category = bybitCategory(marketType)
    const tickerResponse = await fetch(`${bybitBase}/v5/market/tickers?category=${category}&symbol=${symbol}`)
    if (!tickerResponse.ok) throw new Error('Bybit ticker request failed')
    const ticker = (await tickerResponse.json())?.result?.list?.[0]
    if (!ticker) throw new Error('Bybit ticker data unavailable')
    const [candles, fundingResponse] = await Promise.all([fetchExchangeCandles(exchange, marketType, symbol, '5m', 48), marketType === 'Futures' ? fetch(`${bybitBase}/v5/market/funding/history?category=${category}&symbol=${symbol}&limit=1`) : Promise.resolve(null)])
    const funding = fundingResponse && fundingResponse.ok ? (await fundingResponse.json())?.result?.list?.[0]?.fundingRate : undefined
    return { snapshot: { price: asNumber(ticker.lastPrice), change: asNumber(ticker.price24hPcnt) * 100, high: asNumber(ticker.highPrice24h), low: asNumber(ticker.lowPrice24h), volume: asNumber(ticker.turnover24h), funding: funding === undefined ? undefined : asNumber(funding) * 100 }, candles }
  }

  if (exchange === 'OKX') {
    const instId = okxInstrument(symbol, marketType)
    const tickerResponse = await fetch(`${okxBase}/api/v5/market/ticker?instId=${instId}`)
    if (!tickerResponse.ok) throw new Error('OKX ticker request failed')
    const ticker = (await tickerResponse.json())?.data?.[0]
    if (!ticker) throw new Error('OKX ticker data unavailable')
    const [candles, fundingResponse] = await Promise.all([fetchExchangeCandles(exchange, marketType, symbol, '5m', 48), marketType === 'Futures' ? fetch(`${okxBase}/api/v5/public/funding-rate?instId=${instId}`) : Promise.resolve(null)])
    const funding = fundingResponse && fundingResponse.ok ? (await fundingResponse.json())?.data?.[0]?.fundingRate : undefined
    return { snapshot: { price: asNumber(ticker.last), change: asNumber(ticker.sodUtc8) ? (asNumber(ticker.last) - asNumber(ticker.sodUtc8)) / asNumber(ticker.sodUtc8) * 100 : 0, high: asNumber(ticker.high24h), low: asNumber(ticker.low24h), volume: asNumber(ticker.volCcy24h), funding: funding === undefined ? undefined : asNumber(funding) * 100 }, candles }
  }

  const base = binanceBase(marketType)
  const tickerPath = marketType === 'Futures' ? '/fapi/v1/ticker/24hr' : '/api/v3/ticker/24hr'
  const tickerResponse = await fetch(`${base}${tickerPath}?symbol=${symbol}`)
  const candlePromise = fetchExchangeCandles(exchange, marketType, symbol, '5m', 48)
  const fundingPromise = marketType === 'Futures' ? fetch(`${base}/fapi/v1/premiumIndex?symbol=${symbol}`) : Promise.resolve(null)
  if (!tickerResponse.ok) throw new Error('Binance ticker request failed')
  const [ticker, candles, fundingResponse] = await Promise.all([tickerResponse.json(), candlePromise, fundingPromise])
  const funding = fundingResponse && fundingResponse.ok ? asNumber((await fundingResponse.json()).lastFundingRate) * 100 : undefined
  return { snapshot: { price: asNumber(ticker.lastPrice), change: asNumber(ticker.priceChangePercent), high: asNumber(ticker.highPrice), low: asNumber(ticker.lowPrice), volume: asNumber(ticker.quoteVolume), funding }, candles }
}