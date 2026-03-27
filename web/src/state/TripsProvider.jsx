import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
} from 'react'
import { TripsContext } from './tripsContext.js'

const TRIPS_STORAGE_KEY = 'triply-trips-v1'

function safeParse(json, fallback) {
  try {
    return JSON.parse(json)
  } catch {
    return fallback
  }
}

function mergeTrip(existing, patch) {
  const nextSync =
    patch.sync && existing.sync
      ? { ...existing.sync, ...patch.sync }
      : patch.sync ?? existing.sync

  // For itinerary/chat/meta we default to replacement when explicitly provided
  // (backend updates can send partials later if desired).
  return {
    ...existing,
    ...patch,
    sync: nextSync,
    itinerary: patch.itinerary ?? existing.itinerary,
    meta: patch.meta ?? existing.meta,
    chatMessages: patch.chatMessages ?? existing.chatMessages,
  }
}

function tripsReducer(state, action) {
  switch (action.type) {
    case 'ADD_TRIP': {
      const trip = action.trip
      const existing = state.tripsById[trip.id]
      const merged = existing ? mergeTrip(existing, trip) : trip

      const tripIds = existing
        ? state.tripIds
        : [trip.id, ...state.tripIds.filter((id) => id !== trip.id)]

      return {
        ...state,
        tripsById: {
          ...state.tripsById,
          [trip.id]: merged,
        },
        tripIds,
      }
    }
    case 'UPDATE_TRIP': {
      const { tripId, patch } = action
      const existing = state.tripsById[tripId]
      if (!existing) return state
      const merged = mergeTrip(existing, patch)
      return {
        ...state,
        tripsById: {
          ...state.tripsById,
          [tripId]: merged,
        },
      }
    }
    case 'RESET_ALL_TRIPS': {
      return { tripsById: {}, tripIds: [] }
    }
    default:
      return state
  }
}

export function TripsProvider({ children }) {
  const [state, dispatch] = useReducer(tripsReducer, undefined, () => {
    const raw = localStorage.getItem(TRIPS_STORAGE_KEY)
    const parsed = safeParse(raw, null)
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.tripsById &&
      Array.isArray(parsed.tripIds)
    ) {
      return parsed
    }
    return { tripsById: {}, tripIds: [] }
  })

  useEffect(() => {
    // Debounce persistence to reduce main-thread stalls during rapid updates.
    const tid = setTimeout(() => {
      localStorage.setItem(TRIPS_STORAGE_KEY, JSON.stringify(state))
    }, 200)
    return () => clearTimeout(tid)
  }, [state])

  const addTrip = useCallback((trip) => {
    dispatch({ type: 'ADD_TRIP', trip })
  }, [])

  const updateTrip = useCallback((tripId, patch) => {
    dispatch({ type: 'UPDATE_TRIP', tripId, patch })
  }, [])

  const getTripById = useCallback(
    (tripId) => state.tripsById[tripId] ?? null,
    [state.tripsById],
  )

  const value = useMemo(() => {
    const trips = state.tripIds.map((id) => state.tripsById[id]).filter(Boolean)

    return {
      trips,
      tripsById: state.tripsById,
      addTrip,
      updateTrip,
      getTripById,
    }
  }, [state, addTrip, updateTrip, getTripById])

  return <TripsContext.Provider value={value}>{children}</TripsContext.Provider>
}

