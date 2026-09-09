import { useEffect, useState } from 'react'

export type NewsItem = { tag: string; title: string; time: string; color: 'blue' | 'orange' | 'green'; link?: string }

type FeedConfig = { source: string; tag: string; color: NewsItem['color']; url: string }

const feeds: FeedConfig[] = [
  { source: 'CoinDesk', tag: 'COINDESK', color: 'blue', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { source: 'CoinMarketCap', tag: 'CMC', color: 'orange', url: 'https://coinmarketcap.com/headlines/news/' },
  { source: 'Decrypt', tag: 'DECRYPT', color: 'green', url: 'https://decrypt.co/feed' },
]

const fallbackNews: NewsItem[] = [
  { tag: 'COINDESK', title: 'Live crypto headlines will appear here as feeds update', time: 'Waiting for feed', color: 'blue' },
  { tag: 'CMC', title: 'CoinMarketCap market stories are loading', time: 'Waiting for feed', color: 'orange' },
  { tag: 'DECRYPT', title: 'Decrypt latest crypto coverage is loading', time: 'Waiting for feed', color: 'green' },
]

const relativeTime = (date: string) => {
  const ageMinutes = Math.max(0, Math.round((Date.now() - Date.parse(date)) / 60000))
  if (!Number.isFinite(ageMinutes) || ageMinutes < 1) return 'JUST NOW'
  if (ageMinutes < 60) return `${ageMinutes}M AGO`
  if (ageMinutes < 1440) return `${Math.round(ageMinutes / 60)}H AGO`
  return `${Math.round(ageMinutes / 1440)}D AGO`
}

export function useLiveNews(initial: NewsItem[] = fallbackNews): [NewsItem[], (items: NewsItem[]) => void] {
  const [news, setNews] = useState(initial)
  useEffect(() => {
    let cancelled = false
    const loadFeeds = async () => {
      const results = await Promise.allSettled(feeds.map(async (feed) => {
        const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`)
        if (!response.ok) throw new Error(`${feed.source} feed unavailable`)
        const payload = await response.json()
        const items = Array.isArray(payload?.items) ? payload.items : []
        return items.slice(0, 8).map((item: { title?: string; pubDate?: string; link?: string }) => ({
          tag: feed.tag,
          title: String(item.title || 'Crypto market update'),
          time: relativeTime(String(item.pubDate || '')),
          color: feed.color,
          link: item.link,
          publishedAt: Date.parse(String(item.pubDate || '')) || 0,
        }))
      }))
      const merged = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []).sort((left, right) => right.publishedAt - left.publishedAt).slice(0, 15).map(({ publishedAt: _publishedAt, ...item }) => item)
      if (!cancelled && merged.length) setNews(merged)
    }
    loadFeeds()
    const timer = window.setInterval(loadFeeds, 30000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [])
  return [news, setNews]
}
