import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

function readPlacesKeyFromDotenvFile(filePath) {
  if (!fs.existsSync(filePath)) return ''
  const raw = fs.readFileSync(filePath, 'utf8')
  const m = raw.match(
    /^\s*(?:VITE_)?GOOGLE_PLACES_API_KEY\s*=\s*(\S+)/m,
  )
  return m?.[1]?.trim() ?? ''
}

function resolveGooglePlacesApiKey(mode) {
  const env = loadEnv(mode, process.cwd(), '')
  if (env.VITE_GOOGLE_PLACES_API_KEY?.trim()) {
    return env.VITE_GOOGLE_PLACES_API_KEY.trim()
  }
  const legacyPath = path.resolve(process.cwd(), 'Google_Places_API_Key.env')
  const fromLegacy = readPlacesKeyFromDotenvFile(legacyPath)
  if (fromLegacy) return fromLegacy

  // Same repo: `npm run dev` runs with cwd = web/, but Places key may live in backend/.env
  // next to GEMINI_API_KEY (common during local dev).
  const backendEnvPath = path.resolve(process.cwd(), '..', 'backend', '.env')
  const fromBackend = readPlacesKeyFromDotenvFile(backendEnvPath)
  if (fromBackend) return fromBackend

  return ''
}

/**
 * Vite config — dev server + React + Google Places key injection.
 *
 * proxy: Requests to /api/* go to the Express API. PORT comes from backend/.env
 * (defaults in server.js are 3001 if unset; this repo often uses 3000).
 */
function resolveApiProxyTarget() {
  const backendEnvPath = path.resolve(process.cwd(), '..', 'backend', '.env')
  const raw = fs.existsSync(backendEnvPath)
    ? fs.readFileSync(backendEnvPath, 'utf8')
    : ''
  const m = raw.match(/^\s*PORT\s*=\s*(\d+)/m)
  const port = m?.[1] ? Number(m[1]) : 3001
  // 127.0.0.1 avoids some Windows setups where "localhost" resolves differently from bind.
  return `http://127.0.0.1:${Number.isFinite(port) && port > 0 ? port : 3001}`
}

export default defineConfig(({ mode }) => {
  const googlePlacesKey = resolveGooglePlacesApiKey(mode)
  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_GOOGLE_PLACES_API_KEY':
        JSON.stringify(googlePlacesKey),
    },
    server: {
      proxy: {
        '/api': {
          target: resolveApiProxyTarget(),
          changeOrigin: true,
        },
      },
    },
  }
})
