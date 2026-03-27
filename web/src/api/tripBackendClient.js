function getBackendBaseUrl() {
  // Expected: e.g. "http://localhost:8000" or "https://api.example.com"
  return import.meta.env.VITE_TRIP_BACKEND_URL?.trim() || ''
}

async function requestJson(url, options) {
  const res = await fetch(url, options)
  const text = await res.text()
  const parsed = text ? JSON.parse(text) : null
  if (!res.ok) {
    const message =
      (parsed && (parsed.error || parsed.message)) || `HTTP ${res.status}`
    throw new Error(message)
  }
  return parsed
}

/**
 * Start a trip search and then receive incremental updates.
 *
 * Backend transport is intentionally left generic:
 * - If `VITE_TRIP_BACKEND_URL` is set, we try polling `/trips/:id/events`.
 * - Otherwise we throw so the UI can show "backend not configured".
 */
export async function subscribeToTripUpdates({
  tripId,
  payload,
  onEvent,
  onStatus,
  onError,
  signal,
}) {
  const baseUrl = getBackendBaseUrl()
  if (!baseUrl) {
    const err = new Error(
      'Backend not configured. Set `VITE_TRIP_BACKEND_URL` to enable syncing.',
    )
    onError?.(err)
    onStatus?.({ status: 'error', error: err.message })
    return
  }

  onStatus?.({ status: 'syncing' })

  // 1) Optionally start the search job (if backend requires an explicit start endpoint)
  //    This is best-effort and won't block polling if it 404s.
  try {
    await requestJson(`${baseUrl}/trips/${tripId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload }),
    })
  } catch {
    // If backend doesn't implement /start, we still try to poll /events.
  }

  // 2) Poll events until backend indicates completion.
  let cursor = null

  while (!signal?.aborted) {
    try {
      const url = `${baseUrl}/trips/${tripId}/events${
        cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
      }`
      const data = await requestJson(url, { method: 'GET' })

      const events = Array.isArray(data?.events) ? data.events : []
      for (const evt of events) onEvent?.(evt)

      const nextCursor = data?.nextCursor ?? null
      cursor = nextCursor

      if (data?.done === true) {
        onStatus?.({ status: 'complete' })
        return
      }

      // If backend doesn't provide done, keep polling.
      await new Promise((r) => setTimeout(r, 1500))
    } catch (e) {
      onError?.(e)
      onStatus?.({ status: 'error', error: e?.message || String(e) })
      return
    }
  }
}

export async function sendChatMessage({ tripId, message, signal }) {
  const baseUrl = getBackendBaseUrl()
  if (!baseUrl) {
    throw new Error(
      'Backend not configured. Set `VITE_TRIP_BACKEND_URL` to send messages.',
    )
  }

  // Backend schema is intentionally generic; adapt to your server later.
  return requestJson(`${baseUrl}/trips/${tripId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
    signal,
  })
}

