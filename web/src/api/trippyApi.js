/** @typedef {{ role: 'user' | 'assistant'; content: string }} WireMessage */

function apiOrigin() {
  return (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
}

function apiUrl(path) {
  return `${apiOrigin()}${path}`
}

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

export async function checkApiHealth() {
  const h = await fetchApiHealth()
  return h.up
}

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
        }
      }
    }
  } finally {
    reader.releaseLock?.()
  }
  onComplete?.()
}

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

export function tryExtractItineraryJson(assistantText) {
  const re = /```(?:json)?\s*([\s\S]*?)```/gi
  let m
  while ((m = re.exec(assistantText)) !== null) {
    try {
      const obj = JSON.parse(m[1].trim())
      if (obj && typeof obj === 'object' && Array.isArray(obj.days)) return obj
    } catch {
    }
  }
  return null
}
