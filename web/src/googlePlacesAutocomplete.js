let loaderPromise = null

/**
 * Loads the Maps JS API once (Places is loaded via importLibrary('places')).
 * @param {string} apiKey
 */
export function ensureMapsLoaded(apiKey) {
  if (!apiKey?.trim()) {
    return Promise.reject(new Error('Missing Google Maps API key'))
  }
  if (!loaderPromise) {
    loaderPromise = new Promise((resolve, reject) => {
      if (window.google?.maps?.importLibrary) {
        resolve(window.google.maps)
        return
      }

      const scriptId = 'google-maps-js-sdk'
      const existing = document.getElementById(scriptId)
      if (existing) {
        existing.addEventListener('load', () => resolve(window.google.maps), {
          once: true,
        })
        existing.addEventListener(
          'error',
          () => reject(new Error('Failed loading Google Maps script')),
          { once: true },
        )
        return
      }

      const callbackName = '__trippyGoogleMapsInit'
      window[callbackName] = () => {
        delete window[callbackName]
        resolve(window.google.maps)
      }

      const s = document.createElement('script')
      s.id = scriptId
      s.async = true
      s.defer = true
      s.src =
        'https://maps.googleapis.com/maps/api/js?' +
        new URLSearchParams({
          key: apiKey.trim(),
          v: 'weekly',
          libraries: 'places',
          // loading=async is Google's recommended way to load the JS API.
          // It also reduces the chance of race conditions around importLibrary.
          loading: 'async',
          callback: callbackName,
        }).toString()
      s.onerror = () => reject(new Error('Failed loading Google Maps script'))
      document.head.appendChild(s)
    })
  }
  return loaderPromise
}

/** @param {'city' | 'landmark'} kind */
export function primaryTypesForDestinationKind(kind) {
  if (kind === 'landmark') {
    return ['tourist_attraction', 'museum', 'park', 'point_of_interest']
  }
  return ['locality', 'administrative_area_level_1']
}

/**
 * @param {string} input
 * @param {'city' | 'landmark'} kind
 * @param {unknown} sessionToken  AutocompleteSessionToken from Maps JS Places library
 */
export async function fetchPlaceSuggestions(input, kind, sessionToken) {
  const apiKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY
  if (!apiKey?.trim()) {
    console.warn('Trippy: set VITE_GOOGLE_PLACES_API_KEY or Google_Places_API_Key.env')
    return []
  }

  const q = input.trim()
  if (!q || q.length < 2) return []

  await ensureMapsLoaded(apiKey)
  // We prefer the new Places AutocompleteSuggestion API when available.
  // Some Maps JS versions / accounts may not expose it; in that case we fall back
  // to the classic AutocompleteService so the UX still works.
  const placesLib = await google.maps.importLibrary('places')
  const AutocompleteSuggestion = placesLib?.AutocompleteSuggestion

  if (
    AutocompleteSuggestion &&
    typeof AutocompleteSuggestion.fetchAutocompleteSuggestions === 'function'
  ) {
    const request = {
      input: q,
      sessionToken,
      includedPrimaryTypes: primaryTypesForDestinationKind(kind),
      language: typeof navigator !== 'undefined' ? navigator.language : 'en',
    }

    const { suggestions } =
      await AutocompleteSuggestion.fetchAutocompleteSuggestions(request)

    const out = []
    for (const s of suggestions || []) {
      const pp = s.placePrediction
      if (!pp) continue
      const text =
        typeof pp.text?.toString === 'function'
          ? pp.text.toString()
          : String(pp.text ?? '')
      if (!text) continue
      out.push({ text, placeId: pp.placeId ?? '' })
    }
    return out
  }

  // Fallback (classic Places AutocompleteService).
  // Docs: https://developers.google.com/maps/documentation/javascript/place-autocomplete
  const service = new google.maps.places.AutocompleteService()
  const types = primaryTypesForDestinationKind(kind)
  const type =
    types.includes('locality')
      ? '(cities)'
      : undefined

  const lang =
    typeof navigator !== 'undefined' && navigator.language
      ? navigator.language
      : 'en'

  return new Promise((resolve) => {
    service.getPlacePredictions(
      {
        input: q,
        sessionToken: sessionToken || undefined,
        types: type ? [type] : undefined,
        language: lang,
      },
      (predictions, status) => {
        // If the API key is invalid / billing disabled / Places API disabled,
        // status will not be OK and predictions will be null/empty.
        if (status && status !== google.maps.places.PlacesServiceStatus.OK) {
          console.error('Trippy autocomplete status:', status)
        }
        const out = []
        for (const p of predictions || []) {
          const text = p?.description || ''
          if (!text) continue
          out.push({ text, placeId: p.place_id || '' })
        }
        resolve(out)
      },
    )
  })
}
