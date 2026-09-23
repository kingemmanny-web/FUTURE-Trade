import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  preview: { host: true },
  server: {
    host: true,
    proxy: {
      '/api/binance-futures': { target: 'https://fapi.binance.com', changeOrigin: true, rewrite: (path) => path.replace(/^\/api\/binance-futures/, '') },
      '/api/binance-spot': { target: 'https://api.binance.com', changeOrigin: true, rewrite: (path) => path.replace(/^\/api\/binance-spot/, '') },
      '/api/mexc-futures': { target: 'https://contract.mexc.com', changeOrigin: true, rewrite: (path) => path.replace(/^\/api\/mexc-futures/, '') },
      '/api/mexc': { target: 'https://api.mexc.com', changeOrigin: true, rewrite: (path) => path.replace(/^\/api\/mexc/, '') },
      '/api/bybit': { target: 'https://api.bybit.com', changeOrigin: true, rewrite: (path) => path.replace(/^\/api\/bybit/, '') },
      '/api/okx': { target: 'https://www.okx.com', changeOrigin: true, rewrite: (path) => path.replace(/^\/api\/okx/, '') },
      '/api/cryptocompare': { target: 'https://min-api.cryptocompare.com', changeOrigin: true, rewrite: (path) => path.replace(/^\/api\/cryptocompare/, '') },
    },
  },
})
