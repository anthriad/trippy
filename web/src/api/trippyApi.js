/**
 * trippyApi.js — browser client for the Trippy Express API (backend/server.js).
 *
 * Flow:
 *   React → 5('/api/...') → Express → LangChain ChatGoogle → Gemini
 *
 * Development:
 *   From the repo root run `npm run dev` to start the API and Vite together, or run
 *   `npm run api` in one terminal and `npm run dev` inside web/ in another.
 *   vite.config.js proxies `/api` to the port in backend/.env (default 3001 in server.js).
 *
 * Production:
 *   Set VITE_API_URL to your deployed API origin (no trailing slash), e.g.
 *   https://api.example.com — requests become `${VITE_API_URL}/api/chat`.
 */

/** @typedef {{ role: 'user' | 'assistant'; content: string }} WireMessage */

/**
 * Base URL for API requests.
 * Empty string = same origin as the page (correct when using the Vite proxy
 * or when the static site and API share one host).
 */
function apiOrigin() {
  return (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
}

/**
 * Full URL for an API path. `path` must start with `/`, e.g. `/api/health`.
 */
function apiUrl(path) {
  return `${apiOrigin()}${path}`
}

/**
 * POST with static typing helper: read JSON body and throw on HTTP errors.
 */
async function readJsonResponse(res) {
  const text = await res.text()
  /** @type {unknown} */
  let body = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = null
    }
  }
  if (!res.ok) {
    const fromJson =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : null
    let msg = fromJson
    if (!msg && [502, 503, 504].includes(res.status)) {
      msg =
        'Cannot reach the Trippy API (often the server is not running or the port does not match). ' +
        'From the repo root run `npm run dev` to start the web app and API together, ' +
        'or in one terminal run `npm run api` and in another `npm run dev` inside web/. ' +
        'If you changed PORT in backend/.env, restart the Vite dev server.'
    }
    if (!msg) msg = `HTTP ${res.status}`
    throw new Error(msg)
  }
  return body
}

/**
 * GET /api/health — process up plus whether GEMINI_API_KEY is set (no Gemini call).
 *
 * @returns {Promise<{ up: boolean; geminiConfigured: boolean }>}
 */
export async function fetchApiHealth() {
  try {
    const res = await fetch(apiUrl('/api/health'))
    if (!res.ok) return { up: false, geminiConfigured: false }
    const data = await readJsonResponse(res)
    return {
      up: data?.ok === true,
      geminiConfigured: data?.geminiConfigured === true,
    }
  } catch {
    return { up: false, geminiConfigured: false }
  }
}

/**
 * @returns {Promise<boolean>}
 */
export async function checkApiHealth() {
  const h = await fetchApiHealth()
  return h.up
}

/**
 * POST /api/chat
 * Sends the full conversation as JSON messages; last entry must be role "user".
 * Returns the assistant message object from Express: { role, content }.
 *
 * @param {WireMessage[]} messages
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ role: string; content: string }>}
 */
export async function sendChat(messages, options = {}) {
  const { signal } = options
  const res = await fetch(apiUrl('/api/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  })
  const data = await readJsonResponse(res)
  if (
    !data ||
    typeof data !== 'object' ||
    !data.message ||
    typeof data.message.content !== 'string'
  ) {
    throw new Error('Unexpected response from /api/chat')
  }
  return data.message
}

/**
 * POST /api/chat/stream
 * Server-Sent Events: each line `data: {"text":"..."}` until `data: [DONE]`.
 * Optional `error` field in a data payload is treated as fatal.
 *
 * @param {WireMessage[]} messages
 * @param {{
 *   signal?: AbortSignal
 *   onTextChunk?: (text: string) => void
 *   onComplete?: () => void
 *   onError?: (err: Error) => void
 * }} [handlers]
 */
export async function streamChat(messages, handlers = {}) {
  const { signal, onTextChunk, onComplete, onError } = handlers
  const res = await fetch(apiUrl('/api/chat/stream'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  })

  if (!res.ok) {
    let msg = ''
    try {
      const errBody = await res.json()
      if (errBody?.error) msg = errBody.error
    } catch {
      /* ignore */
    }
    if (!msg && [502, 503, 504].includes(res.status)) {
      msg =
        'Cannot reach the Trippy API. From the repo root run `npm run dev` or run `npm run api` in a second terminal.'
    }
    if (!msg) msg = `HTTP ${res.status}`
    const err = new Error(msg)
    onError?.(err)
    throw err
  }

  const reader = res.body?.getReader()
  if (!reader) {
    const err = new Error('No response body')
    onError?.(err)
    throw err
  }

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6).trim()
        if (raw === '[DONE]') {
          onComplete?.()
          return
        }
        try {
          const data = JSON.parse(raw)
          if (data?.error) {
            const err = new Error(String(data.error))
            onError?.(err)
            return
          }
          if (typeof data?.text === 'string' && data.text) onTextChunk?.(data.text)
        } catch {
          /* skip malformed SSE line */
        }
      }
    }
  } finally {
    reader.releaseLock?.()
  }
  onComplete?.()
}

/**
 * Maps persisted chat bubbles (id, timestamp, …) to the wire format the backend validates.
 *
 * @param {Array<{ role?: string; content?: unknown }> | undefined | null} chatMessages
 * @returns {WireMessage[]}
 */
export function toWireMessages(chatMessages) {
  if (!Array.isArray(chatMessages)) return []
  return chatMessages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({
      role: m.role,
      content:
        typeof m.content === 'string'
          ? m.content
          : m.content == null
            ? ''
            : JSON.stringify(m.content),
    }))
}

/**
 * Turns the planner form (`planVariables` / `trip.payload`) into a clear natural-language
 * brief so Gemini gets destination, dates, flexibility, and budget before the raw JSON.
 *
 * @param {object} tripPayload — shape from App.jsx `planVariables`
 * @returns {string[]}
 */
export function buildPlannerSummaryLines(tripPayload) {
  if (!tripPayload || typeof tripPayload !== 'object') {
    return ['(No planner details were provided.)']
  }

  const lines = []
  const dest = tripPayload.destinations
  const dates = tripPayload.dates
  const budget = tripPayload.budget
  const from =
    typeof tripPayload.travellingFrom === 'string'
      ? tripPayload.travellingFrom.trim()
      : ''

  if (from) {
    lines.push(
      `• Travelling from: ${from}. Use this for realistic flights, time zones, jet lag on day one, and connection context.`,
    )
  }

  if (dest?.all?.length) {
    const kind =
      dest.kind === 'landmark'
        ? 'Landmarks / points of interest'
        : 'Cities / regions'
    lines.push(
      `• Destinations (${kind}): ${dest.all.join(' → ')}.`,
    )
  } else if (dest?.primary) {
    lines.push(`• Primary destination: ${dest.primary}.`)
  }

  if (dates?.start && dates?.end) {
    const flex = dates.isFlexible
      ? 'The traveler is flexible on dates — you may suggest slight shifts if they improve flights, pacing, or value.'
      : 'The traveler wants fixed dates — only plan activities within this window.'
    lines.push(`• Dates: ${dates.start} through ${dates.end}. ${flex}`)
  }

  if (budget && typeof budget.amount === 'number') {
    const mode =
      budget.mode === 'total'
        ? 'total budget for the whole trip'
        : 'budget per person (estimate party size as unknown unless stated)'
    const cur = budget.currency || 'USD'
    lines.push(
      `• Budget: ${cur} ${budget.amount} (${mode}). Stay within or explain tradeoffs clearly.`,
    )
  }

  if (lines.length === 0) {
    lines.push('• (Use the JSON below for any missing fields.)')
  }
  return lines
}

/**
 * First Gemini turn after the user saves the planner ("Plan trip") and lands on the trip page.
 * Combines:
 *   1) A human-readable summary (destination, dates, flexible vs fixed, budget)
 *   2) The full structured JSON from the form (same as before)
 *   3) Instructions to respond as Trippy and return a fenced itinerary JSON when possible
 *
 * `tripBackendClient.subscribeToTripUpdates` sends this as the opening `user` message so
 * the itinerary panel can fill before the user chats further.
 *
 * @param {object} tripPayload — shape from App.jsx `planVariables`
 */
export function buildInitialTripUserMessage(tripPayload) {
  const summaryBlock = buildPlannerSummaryLines(tripPayload).join('\n')

  return [
    'I saved this trip from the Trippy planner. Use EVERY constraint below when you reply.',
    '',
    '--- What I entered (read this first) ---',
    summaryBlock,
    '',
    '--- Full planner data (JSON; same information, machine-readable) ---',
    '```json',
    JSON.stringify(tripPayload, null, 2),
    '```',
    '',
    'Your tasks:',
    '1) Answer as Trippy: short warm greeting, then a practical overview tied to my starting point (if given), destinations, dates, flexibility, and budget.',
    '2) Propose a day-by-day itinerary that respects the budget and date rules above.',
    '3) After your prose, include ONE fenced ```json``` block containing ONLY itinerary data in this exact shape (no extra keys at the top level):',
    '{"days":[{"label":"Day 1 — ...","items":[{"time":"","title":"","description":"","location":""}]}]}',
    'If a structured itinerary is impossible, omit the JSON block and explain briefly in chat only.',
  ].join('\n')
}

/**
 * Looks for ```json ... ``` fences in the model reply and parses the first object with `days[]`.
 * Tries every fence so prose-before-itinerary still works.
 *
 * @param {string} assistantText
 * @returns {{ days: unknown[] } | null}
 */
export function tryExtractItineraryJson(assistantText) {
  const re = /```(?:json)?\s*([\s\S]*?)```/gi
  let m
  while ((m = re.exec(assistantText)) !== null) {
    try {
      const obj = JSON.parse(m[1].trim())
      if (obj && typeof obj === 'object' && Array.isArray(obj.days)) return obj
    } catch {
      /* try next fence */
    }
  }
  return null
}
