import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

function resolveGooglePlacesApiKey(mode) {
  const env = loadEnv(mode, process.cwd(), '')
  if (env.VITE_GOOGLE_PLACES_API_KEY?.trim()) {
    return env.VITE_GOOGLE_PLACES_API_KEY.trim()
  }
  const legacyPath = path.resolve(process.cwd(), 'Google_Places_API_Key.env')
  if (fs.existsSync(legacyPath)) {
    const raw = fs.readFileSync(legacyPath, 'utf8')
    const m = raw.match(/^\s*GOOGLE_PLACES_API_KEY\s*=\s*(\S+)/m)
    if (m) return m[1].trim()
  }
  return ''
}

/**
 * Vite config — dev server + React + Google Places key injection.
 *
 * proxy: Requests to /api/* go to the Express API (default http://localhost:3001;
 * override with PORT in backend/.env).
 */
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
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  }
})
