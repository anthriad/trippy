import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ChatPanel from '../components/ChatPanel.jsx'
import ItineraryPanel from '../components/ItineraryPanel.jsx'
import { fetchApiHealth, streamChat, tryExtractItineraryJson } from '../api/trippyApi.js'
import {
  buildChatRequestMessages,
  subscribeToTripUpdates,
} from '../api/tripBackendClient.js'
import { useTripsStore } from '../state/tripsContext.js'

const STALE_SYNC_MS = 15000

function coerceChatMessage(m) {
  if (!m) return null
  const role = m.role === 'user' ? 'user' : 'assistant'
  return {
    id: m.id || crypto.randomUUID(),
    role,
    content: m.content ?? m.text ?? m.message ?? m.body ?? '',
    timestamp: m.timestamp || new Date().toISOString(),
  }
}

function applyBackendEventToTrip(trip, event) {
  // We support multiple possible backend shapes by treating common fields
  // (itinerary/meta/chatMessages/chatMessage) as replacements/patches.
  const patch = {}

  if (event?.itinerary) patch.itinerary = event.itinerary
  if (event?.meta) patch.meta = event.meta

  const chatMessages =
    Array.isArray(event?.chatMessages) ? event.chatMessages : null

  if (chatMessages) {
    patch.chatMessages = chatMessages.map(coerceChatMessage).filter(Boolean)
  } else if (event?.message) {
    const msg = coerceChatMessage(event.message)
    if (msg) {
      const existing = Array.isArray(trip?.chatMessages)
        ? trip.chatMessages
        : []
      const idx = msg.id
        ? existing.findIndex((m) => m.id === msg.id)
        : -1

      patch.chatMessages =
        idx >= 0
          ? existing.map((m) => (m.id === msg.id ? msg : m))
          : [...existing, msg]
    }
  }

  return patch
}

export default function TripResultsPage() {
  const { tripId } = useParams()
  const navigate = useNavigate()
  const { getTripById, updateTrip } = useTripsStore()

  const trip = getTripById(tripId)
  const tripRef = useRef(trip)
  const [localStatusText, setLocalStatusText] = useState('')
  const [chatConfigWarning, setChatConfigWarning] = useState('')

  useEffect(() => {
    tripRef.current = trip
  }, [trip])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const h = await fetchApiHealth()
      if (cancelled) return
      if (!h.up) {
        setChatConfigWarning(
          'Trippy API is offline. From the repo root run `npm run dev` (web + API) or keep `npm run api` running in a second terminal while you use `npm run dev` in web/.',
        )
        return
      }
      if (!h.geminiConfigured) {
        setChatConfigWarning(
          'Set GEMINI_API_KEY in backend/.env (Google AI Studio), save, restart `npm run api`, then refresh this page.',
        )
        return
      }
      setChatConfigWarning('')
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const headerSummary = useMemo(() => {
    if (!trip) return ''
    const dates =
      trip.startDate && trip.endDate ? `${trip.startDate} -> ${trip.endDate}` : ''
    return [trip.location, dates].filter(Boolean).join(' · ')
  }, [trip])

  const itineraryDatesSummary = useMemo(() => {
    if (!trip) return ''
    const start = trip.startDate || trip?.payload?.dates?.start
    const end = trip.endDate || trip?.payload?.dates?.end
    if (!start || !end) return ''
    return `${start} → ${end}`
  }, [trip])

  const displayItinerary = trip?.itinerary ?? null
  const isSkeletonDraft = false

  useEffect(() => {
    if (!trip) return

    const status = trip?.sync?.status || 'idle'
    if (status === 'syncing') {
      const startedAt = trip?.sync?.startedAt
        ? new Date(trip.sync.startedAt).getTime()
        : 0
      const isStale = !startedAt || Date.now() - startedAt > STALE_SYNC_MS

      // If a previous request was interrupted (refresh/navigation), recover instead
      // of leaving the trip permanently stuck in "Plan being generated...".
      if (!isStale) return
    }
    if (status === 'complete') return
    if (status === 'error') {
      // allow resync on explicit user request; not automatic
      return
    }

    let cancelled = false
    const controller = new AbortController()

    updateTrip(tripId, {
      sync: {
        status: 'syncing',
        startedAt: new Date().toISOString(),
        error: null,
      },
    })
    setLocalStatusText('Plan being generated…')

    subscribeToTripUpdates({
      tripId,
      payload: trip.payload,
      tripSnapshot: trip,
      signal: controller.signal,
      onStatus: (s) => {
        if (cancelled) return
        if (s?.status === 'complete') {
          setLocalStatusText('')
          updateTrip(tripId, {
            sync: {
              ...(tripRef.current?.sync || {}),
              status: 'complete',
              finishedAt: new Date().toISOString(),
              error: null,
            },
          })
        }
        if (s?.status === 'error') {
          setLocalStatusText(s?.error || 'Backend error')
          updateTrip(tripId, {
            sync: {
              ...(tripRef.current?.sync || {}),
              status: 'error',
              error: s?.error || 'Backend error',
            },
          })
        }
      },
      onError: (e) => {
        if (cancelled) return
        setLocalStatusText(e?.message || 'Backend error')
      },
      onEvent: (evt) => {
        if (cancelled) return
        const patch = applyBackendEventToTrip(tripRef.current, evt)
        if (Object.keys(patch).length > 0) {
          updateTrip(tripId, {
            ...patch,
            sync: { ...(tripRef.current?.sync || {}), status: 'syncing' },
          })
        }
      },
    })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [tripId, trip?.payload, trip?.sync?.status, updateTrip])

  async function handleSend(text) {
    if (!trip) return

    const userMsg = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }
    const assistantId = crypto.randomUUID()
    const assistantTimestamp = new Date().toISOString()
    const assistantPlaceholder = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: assistantTimestamp,
      isStreaming: true,
    }

    const prior = trip.chatMessages || []
    updateTrip(tripId, {
      chatMessages: [...prior, userMsg, assistantPlaceholder],
      sync: { ...trip.sync, status: 'syncing' },
    })

    setLocalStatusText('Updating…')
    try {
      const wireMessages = buildChatRequestMessages(prior, text)
      let fullText = ''
      let lastUiFlush = 0

      await streamChat(wireMessages, {
        onTextChunk: (t) => {
          fullText += t
          const now = Date.now()
          // Throttle UI updates so we don't spam React with tiny chunks.
          if (now - lastUiFlush < 60) return
          lastUiFlush = now

          const current = tripRef.current
          const existing = Array.isArray(current?.chatMessages)
            ? current.chatMessages
            : []
          updateTrip(tripId, {
            chatMessages: existing.map((m) =>
              m?.id === assistantId
                ? { ...m, content: fullText, isStreaming: true }
                : m,
            ),
          })
        },
      })

      const itineraryPatch = tryExtractItineraryJson(fullText)
      const current = tripRef.current
      const existing = Array.isArray(current?.chatMessages)
        ? current.chatMessages
        : []
      updateTrip(tripId, {
        chatMessages: existing.map((m) =>
          m?.id === assistantId
            ? { ...m, content: fullText, isStreaming: false }
            : m,
        ),
        ...(itineraryPatch ? { itinerary: itineraryPatch } : {}),
        sync: {
          ...(current?.sync || {}),
          status: 'complete',
          error: null,
          finishedAt: new Date().toISOString(),
        },
      })
      setLocalStatusText('')
    } catch (e) {
      setLocalStatusText(e?.message || 'Backend error')
      updateTrip(tripId, {
        sync: {
          ...trip.sync,
          status: 'error',
          error: e?.message || 'Backend error',
        },
      })
    }
  }

  if (!trip) {
    return (
      <div className="trip-results-page trip-results-page-empty">
        <div className="trip-results-empty-state">
          Trip not found. Return to the planner and create it again.
        </div>
        <div className="trip-results-back-row">
          <Link className="trip-results-back-link" to="/">
            Back to planner
          </Link>
        </div>
      </div>
    )
  }

  const syncStatus = trip?.sync?.status
  // Block input while the trip is syncing (initial plan generation or a message in flight).
  const shouldDisableChat = syncStatus === 'syncing'
  return (
    <div className="trip-results-page">
      <div className="trip-results-topbar">
        <div className="trip-results-topbar-left">
          <button
            type="button"
            className="trip-results-back-btn"
            onClick={() => navigate('/')}
          >
            Back
          </button>
          <div className="trip-results-trip-summary">{headerSummary}</div>
        </div>

        <div className="trip-results-topbar-right">
          <div className="trip-results-sync-status">
            {localStatusText || (syncStatus === 'complete' ? 'Ready' : '…')}
          </div>
        </div>
      </div>

      <div className="trip-results-grid">
        <aside className="trip-results-left">
          <ChatPanel
            messages={trip.chatMessages || []}
            onSend={handleSend}
            disabled={shouldDisableChat}
            configWarning={chatConfigWarning || undefined}
            statusText={localStatusText || undefined}
            title="Trippy"
            tagline="AI travel agent"
            emptyHint="Chat with Trippy about this saved trip — refine stops, pacing, budget, or vibe. The itinerary on the right updates when Trippy returns a structured plan."
          />
        </aside>

        <main className="trip-results-right">
          <ItineraryPanel
            itinerary={displayItinerary}
            isSkeletonDraft={isSkeletonDraft}
            meta={trip.meta}
            destinationLabel={trip.location || 'Saved trip'}
            datesSummary={itineraryDatesSummary}
          />
        </main>
      </div>
    </div>
  )
}

