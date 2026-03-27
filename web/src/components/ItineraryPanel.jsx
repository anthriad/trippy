function renderItinerary(itinerary) {
  if (!itinerary) return null

  // Common shape: { days: [{ date, label, items: [{ time, title, description, location }] }] }
  if (Array.isArray(itinerary.days)) {
    return (
      <div className="trip-results-itinerary-days">
        {itinerary.days.map((day, idx) => {
          const dateLabel =
            day?.label || day?.date || day?.dayLabel || `Day ${idx + 1}`

          const items = Array.isArray(day?.items) ? day.items : []
          return (
            <div key={day?.date || day?.label || idx} className="trip-results-day">
              <h3 className="trip-results-day-title">{dateLabel}</h3>
              {items.length === 0 ? (
                <div className="trip-results-day-empty">No items yet.</div>
              ) : null}
              <div className="trip-results-day-items">
                {items.map((it, itIdx) => (
                  <div key={it?.id || itIdx} className="trip-results-day-item">
                    <div className="trip-results-day-item-top">
                      {it?.time ? (
                        <span className="trip-results-day-item-time">
                          {it.time}
                        </span>
                      ) : null}
                      <strong className="trip-results-day-item-title">
                        {it?.title || it?.name || 'Stop'}
                      </strong>
                    </div>
                    {it?.description ? (
                      <div className="trip-results-day-item-desc">
                        {it.description}
                      </div>
                    ) : null}
                    {it?.location ? (
                      <div className="trip-results-day-item-location">
                        {it.location}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <pre className="trip-results-pre">
      {JSON.stringify(itinerary, null, 2)}
    </pre>
  )
}

export default function ItineraryPanel({ itinerary, meta }) {
  return (
    <div className="trip-results-itinerary-panel">
      <div className="trip-results-itinerary-header">
        <div>
          <strong className="trip-results-section-title">Itinerary</strong>
        </div>
      </div>

      {!itinerary ? (
        <div className="trip-results-itinerary-empty">
          Initial itinerary will appear when the backend finishes the search.
        </div>
      ) : null}

      {itinerary ? renderItinerary(itinerary) : null}

      {meta ? (
        <div className="trip-results-meta">
          <h3 className="trip-results-section-subtitle">Other info</h3>
          <pre className="trip-results-pre">
            {JSON.stringify(meta, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  )
}

