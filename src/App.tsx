import { useEffect, useState } from 'react'
import './App.css'
import { useLiveNews } from './news'
import { fetchExchangeSnapshot, type Candle, type MarketSnapshot } from './exchanges'

type News = { tag: string; title: string; time: string; color: 'blue' | 'orange' | 'green' }
type ChartData = { width: number; height: number; x: (index: number) => number; y: (value: number) => number; candleWidth: number; ticks: number[] }

const intervals: Record<string, string> = { '1M': '1m', '3M': '3m', '5M': '5m' }
const hotList = [
  { pair: 'BTC/USDT', change: '+3.42%', volume: '$14.2B' },
  { pair: 'ETH/USDT', change: '+2.18%', volume: '$9.8B' },
  { pair: 'SOL/USDT', change: '+5.27%', volume: '$4.6B' },
  { pair: 'BNB/USDT', change: '+1.66%', volume: '$2.4B' },
  { pair: 'XRP/USDT', change: '+4.03%', volume: '$1.7B' },
  { pair: 'DOGE/USDT', change: '+6.74%', volume: '$1.3B' },
]
const defaultNews: News[] = [
  { tag: 'BUSINESS', title: 'Business and markets headlines are loading', time: 'WAITING', color: 'blue' },
  { tag: 'STOCKS', title: 'Stock-market headlines are loading', time: 'WAITING', color: 'orange' },
  { tag: 'CRYPTO', title: 'Crypto headlines are loading', time: 'WAITING', color: 'green' },
]

function formatPrice(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return '—'
  const absolute = Math.abs(value)
  const digits = absolute >= 100 ? 2 : absolute >= 1 ? 4 : absolute >= 0.01 ? 6 : 10
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: digits })}`
}

function App() {
  const [pair, setPair] = useState('BTC/USDT')
  const [pairInput, setPairInput] = useState('BTC/USDT')
  const [exchange, setExchange] = useState('Binance')
  const [marketType, setMarketType] = useState('Futures')
  const [timeframe, setTimeframe] = useState('5M')
  const [market, setMarket] = useState<MarketSnapshot | null>(null)
  const [candles, setCandles] = useState<Candle[]>([])
  const [candleSource, setCandleSource] = useState('')
  const [candleInterval, setCandleInterval] = useState('')
  const [loading, setLoading] = useState(true)
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('atlas-search-history') || '["BTC/USDT","ETH/USDT","SOL/USDT"]') }
    catch { return ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'] }
  })
  const [news] = useLiveNews(defaultNews)

  useEffect(() => { localStorage.setItem('atlas-search-history', JSON.stringify(searchHistory)) }, [searchHistory])

  useEffect(() => {
    let cancelled = false
    const symbol = pair.toUpperCase().replaceAll('/', '').trim()
    setLoading(true)
    setMarket(null)
    setCandles([])
    setCandleSource('')
    setCandleInterval('')
    const load = async () => {
      try {
        const result = await fetchExchangeSnapshot(exchange, marketType, symbol, intervals[timeframe])
        if (cancelled) return
        setMarket(result.snapshot)
        setCandles(result.candles)
        setCandleSource(result.candleSource)
        setCandleInterval(result.candleInterval)
      } catch {
        if (!cancelled) {
          setMarket(null)
          setCandles([])
          setCandleSource('')
          setCandleInterval('')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const timer = window.setInterval(load, 60000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [exchange, marketType, pair, timeframe])

  const selectPair = (value: string) => {
    const cleaned = value.trim().toUpperCase().replace(/\s+/g, '')
    if (!cleaned) return
    const normalized = cleaned.includes('/') ? cleaned : cleaned.endsWith('USDT') ? `${cleaned.slice(0, -4)}/USDT` : `${cleaned}/USDT`
    setPairInput(normalized)
    setPair(normalized)
    setSearchHistory((current) => [normalized, ...current.filter((item) => item !== normalized)].slice(0, 12))
  }

  const chart: ChartData | null = candles.length ? (() => {
    const width = 920
    const height = 360
    const left = 86
    const right = 16
    const top = 18
    const bottom = 28
    const values = candles.flatMap((candle) => [candle.high, candle.low])
    const max = Math.max(...values)
    const min = Math.min(...values)
    const range = max - min || Math.abs(max) * 0.001 || 1
    const plotWidth = width - left - right
    const plotHeight = height - top - bottom
    return {
      width,
      height,
      x: (index) => left + index * plotWidth / Math.max(candles.length - 1, 1),
      y: (value) => top + (max - value) / range * plotHeight,
      candleWidth: Math.max(2, Math.min(14, plotWidth / candles.length * 0.62)),
      ticks: Array.from({ length: 5 }, (_, index) => max - range * index / 4),
    }
  })() : null

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">◒</span><span>Ghoxt<span className="brand-sub">/ terminal</span></span></div><div className="workspace-label">MARKETS</div><div className="status-line"><span className="live-dot" /> PUBLIC DATA</div></aside>
    <main className="main-content">
      <header className="topbar"><div><span className="eyebrow">MARKET TERMINAL</span><h1>Live market chart</h1></div><span className="demo-pill"><span className="live-dot" /> LIVE FEED</span></header>

      <section className="asset-toolbar panel">
        <div className="asset-search"><label>TRADING PAIR</label><input list="pair-search-history" value={pairInput} aria-label="Trading pair" onChange={(event) => setPairInput(event.target.value.toUpperCase())} onBlur={() => selectPair(pairInput)} onKeyDown={(event) => { if (event.key === 'Enter') selectPair(pairInput) }} /><datalist id="pair-search-history">{searchHistory.map((item) => <option key={item} value={item} />)}</datalist></div>
        <div className="select-wrap"><label>EXCHANGE</label><select value={exchange} onChange={(event) => setExchange(event.target.value)}><option>Binance</option><option>Bybit</option><option>OKX</option><option>MEXC</option></select></div>
        <div className="mode-switch"><button className={marketType === 'Futures' ? 'selected' : ''} onClick={() => setMarketType('Futures')}>Futures</button><button className={marketType === 'Spot' ? 'selected' : ''} onClick={() => setMarketType('Spot')}>Spot</button></div>
        <div className="select-wrap"><label>TIMEFRAME</label><select value={timeframe} onChange={(event) => setTimeframe(event.target.value)}><option>1M</option><option>3M</option><option>5M</option></select></div>
      </section>

      <section className="hotlist-bar panel"><div className="section-heading hotlist-header"><div><span className="section-kicker">BINANCE</span><h2>HOT LIST</h2></div><span className="upload-count">TRENDING · 24H</span></div><div className="hotlist-row">{hotList.map((item) => <button key={item.pair} type="button" className="hotlist-item" onClick={() => selectPair(item.pair)}><strong>{item.pair}</strong><span className="hotlist-change">{item.change}</span><small>{item.volume}</small></button>)}</div></section>

      <section className="market-strip"><div className="market-primary"><div><strong>{pair}</strong><span className="muted">{market?.source || `${exchange} ${marketType}`}</span></div><span className={market ? 'status-badge' : 'status-badge unavailable'}>● {market ? 'LIVE' : loading ? 'LOADING' : 'OFFLINE'}</span></div>{[['LAST PRICE', formatPrice(market?.price)], ['24H HIGH', formatPrice(market?.high)], ['24H LOW', formatPrice(market?.low)], ['24H CHANGE', market ? `${market.change >= 0 ? '+' : ''}${market.change.toFixed(2)}%` : '—'], ['VOLUME', market ? `$${(market.volume / 1e9).toFixed(2)}B` : '—']].map(([label, value]) => <div className="metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>

      <section className="live-chart panel"><div className="chart-header"><div><span className="section-kicker">{pair} · {candleInterval || timeframe} CANDLES</span><h2>{market ? formatPrice(market.price) : loading ? 'Loading market data' : 'No market data'}</h2></div><span className="chart-source">{(candleSource || market?.source || exchange).toUpperCase()}</span></div>
        {chart && candles.length ? <svg className="candlestick-chart" viewBox={`0 0 ${chart.width} ${chart.height}`} preserveAspectRatio="none" role="img" aria-label={`${pair} ${candleInterval || timeframe} candlestick chart`}>
          {chart.ticks.map((tick, index) => <g key={`axis-${index}`}><line className="grid-line" x1="78" x2={chart.width - 8} y1={chart.y(tick)} y2={chart.y(tick)} /><text className="chart-price-label" x="3" y={chart.y(tick) + 4}>{formatPrice(tick)}</text></g>)}
          {candles.map((candle, index) => { const x = chart.x(index); const openY = chart.y(candle.open); const closeY = chart.y(candle.close); const rising = candle.close >= candle.open; return <g key={`${index}-${candle.open}`} className={rising ? 'candle bullish' : 'candle bearish'}><line x1={x} x2={x} y1={chart.y(candle.high)} y2={chart.y(candle.low)} /><rect x={x - chart.candleWidth / 2} y={Math.min(openY, closeY)} width={chart.candleWidth} height={Math.max(2, Math.abs(openY - closeY))} /></g> })}
  </svg> : <div className="chart-empty">{loading ? 'Loading real OHLC candles…' : 'Candlestick data is unavailable for this pair.'}</div>}
        <div className="chart-axis"><span>{candles.length} candles</span><span>{candleInterval || timeframe}</span><span>Source: {candleSource || market?.source || exchange}</span></div>
      </section>

      <section className="panel news-card"><div className="card-title"><span>BREAKING NEWS</span></div><div className="news-subtitle">MAJOR BUSINESS, STOCK &amp; CRYPTO PLATFORMS</div>{news.slice(0, 8).map((item, index) => <article className="news-item" key={`${item.title}-${index}`}><span className={`news-bullet ${item.color}`} /><div><span className="news-meta">{item.tag} · {item.time}</span><strong>{item.title}</strong></div></article>)}</section>
      <footer>Ghoxt TERMINAL <span>•</span> Market data is provided by public exchange feeds and may be delayed.</footer>
    </main>
  </div>
}

export default App
