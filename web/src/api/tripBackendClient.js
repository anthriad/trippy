/**
 * tripBackendClient.js — trip results page ↔ Trippy API glue.
 *
 * The trip planner UI (`TripResultsPage`) was written against a generic “job + polling”
 * backend. The real stack has a simpler REST surface (see trippyApi.js). This module
 * adapts those two worlds:
 *
 *   • subscribeToTripUpdates — one-shot “initial plan” call to POST /api/chat when the
 *     user opens a new trip, then marks sync complete (no polling).
 *   • sendChatMessage — turns the visible chat history into wire messages and POSTs
 *     /api/chat for the assistant reply.
 *
 * Both paths require `npm run api` (Express) and GEMINI_API_KEY in backend/.env.
 */

import {
  buildInitialTripUserMessage,
  checkApiHealth,
  sendChat,
  streamChat,
  toWireMessages,
  tryExtractItineraryJson,
} from './trippyApi.js'

/**
 * Runs once when a trip is opened: hit Gemini with the planner payload so the chat
 * sidebar gets an opening message and the itinerary panel may receive structured days.
 *
 * If the API is down, surfaces a clear error. If the user already has an assistant
 * message (e.g. returned from a previous visit), we skip duplicate work.
 *
 * @param {object} args
 * @param {string} args.tripId
 * @param {object} args.payload — `trip.payload` from the planner
 * @param {{ chatMessages?: unknown[] } | null | undefined} args.tripSnapshot — current trip row
 * @param {(evt: object) => void} [args.onEvent] — patch-shaped object for `applyBackendEventToTrip`
 * @param {(s: { status: string; error?: string }) => void} [args.onStatus]
 * @param {(e: Error) => void} [args.onError]
 * @param {AbortSignal} [args.signal]
 */
export async function subscribeToTripUpdates({
  tripId: _tripId,
  payload,
  tripSnapshot,
  onEvent,
  onStatus,
  onError,
  signal,
}) {
  void _tripId

  const healthy = await checkApiHealth()
  if (!healthy) {
    const err = new Error(
      'Trippy API is offline. From the repo root run `npm run api`, then refresh (Vite proxies /api to the API).',
    )
    onError?.(err)
    onStatus?.({ status: 'error', error: err.message })
    return
  }

  const msgs = tripSnapshot?.chatMessages
  if (Array.isArray(msgs) && msgs.some((m) => m?.role === 'assistant')) {
    onStatus?.({ status: 'complete' })
    return
  }

  onStatus?.({ status: 'syncing' })

  try {
    const seededMessages = toWireMessages(msgs)
    const requestMessages =
      seededMessages.length > 0
        ? seededMessages
        : [{ role: 'user', content: buildInitialTripUserMessage(payload) }]
    const assistantId = crypto.randomUUID()
    const timestamp = new Date().toISOString()
    let fullText = ''

    // Create a placeholder assistant message immediately so the UI can “type”.
    onEvent?.({
      message: {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp,
        isStreaming: true,
      },
    })

    await streamChat(requestMessages, {
      signal,
      onTextChunk: (t) => {
        fullText += t
        onEvent?.({
          message: {
            id: assistantId,
            role: 'assistant',
            content: fullText,
            timestamp,
            isStreaming: true,
          },
        })
      },
      onComplete: () => {
        const itinerary = tryExtractItineraryJson(fullText)
        /** @type {Record<string, unknown>} */
        const evt = {
          message: {
            id: assistantId,
            role: 'assistant',
            content: fullText,
            timestamp,
          },
        }
        if (itinerary) evt.itinerary = itinerary
        onEvent?.(evt)
      },
    })

    onStatus?.({ status: 'complete' })
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    onError?.(err)
    onStatus?.({ status: 'error', error: err.message })
  }
}

/**
 * Sends the full conversation (including the latest user turn) to POST /api/chat.
 *
 * @param {object} args
 * @param {Array<{ role?: string; content?: unknown }>} args.messages — wire-ready history,
 *   **must** end with `{ role: 'user', content: '...' }` (already normalized strings).
 * @param {AbortSignal} [args.signal]
 * @returns {Promise<{ role: string; content: string }>}
 */
export async function sendChatMessage({ messages, signal }) {
  return sendChat(messages, { signal })
}

/**
 * Convenience: build the message array the backend expects from UI chat state + new text.
 *
 * @param {Array<{ role?: string; content?: unknown }>} priorChatMessages
 * @param {string} userText
 * @returns {{ role: 'user' | 'assistant'; content: string }[]}
 */
export function buildChatRequestMessages(priorChatMessages, userText) {
  return [...toWireMessages(priorChatMessages), { role: 'user', content: userText }]
}
