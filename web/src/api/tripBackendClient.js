import {
  buildInitialTripUserMessage,
  checkApiHealth,
  sendChat,
  streamChat,
  toWireMessages,
  tryExtractItineraryJson,
} from './trippyApi.js'

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

    onEvent?.({
      message: {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp,
        isStreaming: true,
        isInitialPlanMessage: true,
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
            isInitialPlanMessage: true,
          },
        })
      },
      onComplete: () => {
        const itinerary = tryExtractItineraryJson(fullText)
        const evt = {
          message: {
            id: assistantId,
            role: 'assistant',
            content: fullText,
            timestamp,
            isInitialPlanMessage: true,
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

export async function sendChatMessage({ messages, signal }) {
  return sendChat(messages, { signal })
}

export function buildChatRequestMessages(priorChatMessages, userText) {
  return [...toWireMessages(priorChatMessages), { role: 'user', content: userText }]
}
