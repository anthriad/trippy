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

function coerceChatMessage(m) {
  if (!m) return null
  const role = m.role === 'user' ? 'user' : 'assistant'
  return {
    id: m.id || crypto.randomUUID(),
    role,
    content: m.content ?? m.text ?? m.message ?? m.body ?? '',
    timestamp: m.timestamp || new Date().toISOString(),
    isStreaming: Boolean(m.isStreaming),
    isPlannerSeed: Boolean(m.isPlannerSeed),
    isInitialPlanMessage: Boolean(m.isInitialPlanMessage),
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

const COUNTRY_TO_CODE = {
  usa: 'US',
  'united states': 'US',
  'united states of america': 'US',
  turkey: 'TR',
  turkiye: 'TR',
  'türkiye': 'TR',
  egypt: 'EG',
  france: 'FR',
  italy: 'IT',
  spain: 'ES',
  greece: 'GR',
  japan: 'JP',
  canada: 'CA',
  mexico: 'MX',
  portugal: 'PT',
  germany: 'DE',
  brazil: 'BR',
  australia: 'AU',
  'new zealand': 'NZ',
  thailand: 'TH',
  indonesia: 'ID',
  india: 'IN',
  'french polynesia': 'PF',
}

function countryCodeToFlagEmoji(code) {
  if (!/^[A-Z]{2}$/.test(code)) return ''
  return String.fromCodePoint(
    ...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  )
}

function getDestinationFlag(location) {
  if (!location) return ''
  const parts = String(location)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return ''
  const countryRaw = parts[parts.length - 1]
  const normalized = countryRaw.toLowerCase()
  const mappedCode =
    COUNTRY_TO_CODE[normalized] ||
    COUNTRY_TO_CODE[normalized.replace(/\./g, '')]
  const code = mappedCode || (/^[A-Za-z]{2}$/.test(countryRaw) ? countryRaw.toUpperCase() : '')
  return code ? countryCodeToFlagEmoji(code) : ''
}

function formatHeaderDate(iso) {
  if (!iso) return ''
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function stripMarkdownFormatting(text) {
  if (typeof text !== 'string') return ''
  return text
    // Remove fenced code blocks entirely.
    .replace(/```[\s\S]*?```/g, '')
    // Remove markdown heading markers.
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    // Remove horizontal rules like --- or ***.
    .replace(/^\s*([-*_])\1{2,}\s*$/gm, '')
    // Normalize markdown list markers into readable bullets.
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/^\s*\d+\.\s+/gm, '• ')
    // Remove bold/italic markdown markers.
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    // Clean extra spaces/newlines.
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function cleanAssistantChatDisplay(content) {
  if (typeof content !== 'string') return ''
  const text = content.trim()
  if (!text) return ''

  const withoutJson = text.replace(/```json[\s\S]*?```/gi, '').trim()
  const hasItineraryJson = /```json[\s\S]*?"days"\s*:\s*\[[\s\S]*?```/i.test(text)
  const hasDayByDayDump =
    /\bday\s*1\b/i.test(withoutJson) &&
    /\bday\s*2\b/i.test(withoutJson) &&
    withoutJson.length > 500

  if (hasItineraryJson || hasDayByDayDump) {
    // Keep the conversational intro, cut off long itinerary dumps.
    const cutoffMarkers = [/^---$/m, /\n#{1,6}\s+\*\*?day\s*1\b/i, /\n\s*\*\s*\*\*day\s*1\b/i]
    let intro = withoutJson
    for (const marker of cutoffMarkers) {
      const match = intro.search(marker)
      if (match > 0) {
        intro = intro.slice(0, match).trim()
        break
      }
    }

    // If still long, keep only first couple sentences.
    if (intro.length > 360) {
      const sentenceChunks = intro.match(/[^.!?]+[.!?]+/g) || []
      if (sentenceChunks.length > 0) {
        intro = sentenceChunks.slice(0, 2).join(' ').trim()
      } else {
        intro = intro.slice(0, 320).trim()
      }
    }

    if (intro) return stripMarkdownFormatting(intro)
    return stripMarkdownFormatting(
      'I updated your itinerary on the right panel. Tell me what else you want changed.',
    )
  }

  return stripMarkdownFormatting(withoutJson || text)
}

export default function TripResultsPage() {
  const { tripId } = useParams()
  const navigate = useNavigate()
  const { getTripById, updateTrip } = useTripsStore()

  const trip = getTripById(tripId)
  const tripRef = useRef(trip)
  const initialSyncInFlightRef = useRef(false)
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
    if (!trip) {
      return {
        location: '',
        startLabel: '',
        endLabel: '',
      }
    }
    const start = trip.startDate || trip?.payload?.dates?.start || ''
    const end = trip.endDate || trip?.payload?.dates?.end || ''
    return {
      location: trip.location || '',
      startLabel: formatHeaderDate(start),
      endLabel: formatHeaderDate(end),
    }
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
  const chatMessagesForDisplay = useMemo(() => {
    const source = Array.isArray(trip?.chatMessages) ? trip.chatMessages : []
    return source.map((m) => {
      if (m?.role !== 'assistant') return m
      if (m?.isInitialPlanMessage) {
        return {
          ...m,
          content:
            "Aloha! I'm Trippy, your personal travel curator. I'm already dreaming about your next getaway! Your itinerary is being generated and will appear on the right panel. Tell me what you'd like to change.",
        }
      }
      return {
        ...m,
        content: cleanAssistantChatDisplay(m?.content),
      }
    })
  }, [trip?.chatMessages])

  useEffect(() => {
    if (!trip) return

    const status = trip?.sync?.status || 'idle'
    if (status === 'complete') return
    if (status === 'error') {
      // allow resync on explicit user request; not automatic
      return
    }
    if (initialSyncInFlightRef.current) return

    let cancelled = false
    const controller = new AbortController()
    initialSyncInFlightRef.current = true

    updateTrip(tripId, {
      sync: {
        status: 'syncing',
        startedAt: new Date().toISOString(),
        error: null,
      },
    })
    setLocalStatusText('Plan being generated…')

    ;(async () => {
      try {
        await subscribeToTripUpdates({
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
            const msg = e?.message || 'Backend error'
            setLocalStatusText(msg)
            updateTrip(tripId, {
              sync: {
                ...(tripRef.current?.sync || {}),
                status: 'error',
                error: msg,
              },
            })
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
      } finally {
        if (!cancelled) initialSyncInFlightRef.current = false
      }
    })()

    return () => {
      cancelled = true
      initialSyncInFlightRef.current = false
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
          <div className="trip-results-trip-summary">
            <span className="trip-results-trip-destination">
              <span className="trip-results-trip-place">{headerSummary.location}</span>
            </span>
            {headerSummary.startLabel && headerSummary.endLabel ? (
              <span className="trip-results-trip-dates-hero">
                <strong>{headerSummary.startLabel}</strong>
                <span className="trip-results-trip-arrow" aria-hidden>
                  ⇢
                </span>
                <strong>{headerSummary.endLabel}</strong>
              </span>
            ) : null}
          </div>
        </div>

        <div className="trip-results-topbar-right" />
      </div>

      <div className="trip-results-grid">
        <aside className="trip-results-left">
          <ChatPanel
            messages={chatMessagesForDisplay}
            onSend={handleSend}
            disabled={shouldDisableChat}
            configWarning={chatConfigWarning || undefined}
            statusText={localStatusText || undefined}
            title="Trippy"
            tagline="AI travel agent"
            emptyHint="Alohaa! I'm Trippy, your AI travel guide."
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

