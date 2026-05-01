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

  const backendEnvPath = path.resolve(process.cwd(), '..', 'backend', '.env')
  const fromBackend = readPlacesKeyFromDotenvFile(backendEnvPath)
  if (fromBackend) return fromBackend

  return ''
}

function resolveApiProxyTarget() {
  const backendEnvPath = path.resolve(process.cwd(), '..', 'backend', '.env')
  const raw = fs.existsSync(backendEnvPath)
    ? fs.readFileSync(backendEnvPath, 'utf8')
    : ''
  const m = raw.match(/^\s*PORT\s*=\s*(\d+)/m)
  const port = m?.[1] ? Number(m[1]) : 3001
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
