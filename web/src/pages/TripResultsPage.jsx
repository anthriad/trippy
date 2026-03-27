import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ChatPanel from '../components/ChatPanel.jsx'
import ItineraryPanel from '../components/ItineraryPanel.jsx'
import { sendChatMessage, subscribeToTripUpdates } from '../api/tripBackendClient.js'
import { useTripsStore } from '../state/tripsContext.js'

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

  useEffect(() => {
    tripRef.current = trip
  }, [trip])

  const headerSummary = useMemo(() => {
    if (!trip) return ''
    const dates =
      trip.startDate && trip.endDate ? `${trip.startDate} -> ${trip.endDate}` : ''
    return [trip.location, dates].filter(Boolean).join(' · ')
  }, [trip])

  useEffect(() => {
    if (!trip) return

    const status = trip?.sync?.status || 'idle'
    if (status === 'syncing') return
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

    subscribeToTripUpdates({
      tripId,
      payload: trip.payload,
      signal: controller.signal,
      onStatus: (s) => {
        if (cancelled) return
        if (s?.status === 'complete') setLocalStatusText('')
        if (s?.status === 'error')
          setLocalStatusText(s?.error || 'Backend error')
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

    updateTrip(tripId, {
      chatMessages: [...(trip.chatMessages || []), userMsg],
      sync: { ...trip.sync, status: 'syncing' },
    })

    setLocalStatusText('Updating…')
    try {
      await sendChatMessage({
        tripId,
        message: text,
      })
      // Assistant response is expected to come back via subscribe updates.
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
  const shouldDisableChat =
    syncStatus === 'syncing' && (trip?.chatMessages?.length || 0) === 0
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
            statusText={localStatusText || undefined}
          />
        </aside>

        <main className="trip-results-right">
          <ItineraryPanel itinerary={trip.itinerary} meta={trip.meta} />
        </main>
      </div>
    </div>
  )
}

