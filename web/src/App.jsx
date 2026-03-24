import { useEffect, useMemo, useRef, useState } from 'react'
import { filterDestinationOptions } from './destinationOptions.js'
import './App.css'

/** Replace with your real budget explanation when ready. */
const BUDGET_DETAILS_PLACEHOLDER =
  'More information about how this budget is used will appear here.'

/** Default until the user explicitly chooses Landmark. */
const DESTINATION_KIND_DEFAULT = 'city'

function normalizeDestinationKind(value) {
  return value === 'landmark' ? 'landmark' : 'city'
}

const initialForm = {
  location: '',
  destinationKind: DESTINATION_KIND_DEFAULT,
  startDate: '',
  endDate: '',
  dateLenient: false,
  price: '',
}

function App() {
  const [form, setForm] = useState(initialForm)
  const [trips, setTrips] = useState([])
  const [formError, setFormError] = useState('')
  const [budgetMenuOpen, setBudgetMenuOpen] = useState(false)
  const budgetMenuRef = useRef(null)

  const [destinationFocused, setDestinationFocused] = useState(false)
  const [destinationListDismissed, setDestinationListDismissed] =
    useState(false)
  const [destinationActiveIndex, setDestinationActiveIndex] = useState(0)
  const destinationComboboxRef = useRef(null)
  const locationInputRef = useRef(null)

  const destinationKind = normalizeDestinationKind(form.destinationKind)

  const destinationMatches = useMemo(
    () =>
      destinationKind === 'city'
        ? filterDestinationOptions(form.location, 15)
        : [],
    [form.location, destinationKind],
  )

  const destinationQueryTrimmed = form.location.trim()
  const showDestinationList =
    destinationFocused &&
    !destinationListDismissed &&
    destinationQueryTrimmed.length > 0 &&
    destinationMatches.length > 0 &&
    !(
      destinationMatches.length === 1 &&
      destinationMatches[0] === destinationQueryTrimmed
    )

  const hasDestination = form.location.trim().length > 0
  const hasDates = hasDestination && Boolean(form.startDate && form.endDate)
  const hasPrice = hasDates && form.price !== ''
  const showSaveStep = hasPrice

  useEffect(() => {
    setDestinationActiveIndex(0)
  }, [destinationMatches])

  useEffect(() => {
    if (!showDestinationList) return
    function handlePointerDown(e) {
      if (
        destinationComboboxRef.current &&
        !destinationComboboxRef.current.contains(e.target)
      ) {
        setDestinationFocused(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [showDestinationList])

  useEffect(() => {
    if (!budgetMenuOpen) return
    function handlePointerDown(e) {
      if (
        budgetMenuRef.current &&
        !budgetMenuRef.current.contains(e.target)
      ) {
        setBudgetMenuOpen(false)
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') setBudgetMenuOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [budgetMenuOpen])

  useEffect(() => {
    if (!hasDates && budgetMenuOpen) setBudgetMenuOpen(false)
  }, [hasDates, budgetMenuOpen])

  useEffect(() => {
    // Keep the step-by-step flow: if destination is cleared, reset the rest.
    if (hasDestination) return
    if (
      form.startDate ||
      form.endDate ||
      form.price ||
      form.dateLenient !== false
    ) {
      setForm((prev) => ({
        ...prev,
        startDate: '',
        endDate: '',
        dateLenient: false,
        price: '',
      }))
    }
  }, [hasDestination])

  useEffect(() => {
    // If dates are incomplete, the budget step should not be shown.
    if (hasDates) return
    if (form.price !== '') setForm((prev) => ({ ...prev, price: '' }))
  }, [hasDates, form.price])

  function updateField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }))
    if (name === 'location' || name === 'destinationKind')
      setDestinationListDismissed(false)
    setFormError('')
  }

  function pickDestination(value) {
    setDestinationListDismissed(true)
    setForm((prev) => ({ ...prev, location: value }))
    setFormError('')
    locationInputRef.current?.focus()
  }

  function onDestinationKeyDown(e) {
    if (!showDestinationList) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setDestinationActiveIndex((i) =>
        Math.min(i + 1, destinationMatches.length - 1),
      )
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setDestinationActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const choice = destinationMatches[destinationActiveIndex]
      if (choice) pickDestination(choice)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setDestinationFocused(false)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!showSaveStep) return
    const location = form.location.trim()
    if (!location || !form.startDate || !form.endDate || form.price === '') {
      setFormError('Please fill in every field.')
      return
    }
    if (form.endDate < form.startDate) {
      setFormError('End date must be on or after the start date.')
      return
    }
    const priceNum = Number(form.price)
    if (Number.isNaN(priceNum) || priceNum < 0) {
      setFormError('Enter a valid price (zero or greater).')
      return
    }

    const trip = {
      id: crypto.randomUUID(),
      location,
      destinationKind: normalizeDestinationKind(form.destinationKind),
      startDate: form.startDate,
      endDate: form.endDate,
      dateLenient: form.dateLenient,
      price: priceNum,
    }
    setTrips((prev) => [trip, ...prev])
    setForm(initialForm)
    setFormError('')
    setDestinationListDismissed(false)
  }

  return (
    <div className="trip-app">
      <header className="trip-header">
        <h1>Trippy</h1>
        <p className="trip-tagline">
          Save trips you want: where you’re going, when, and your target
          budget.
        </p>
      </header>

      <section className="trip-form-section" aria-labelledby="trip-form-title">
        <h2 id="trip-form-title" className="trip-form-heading">
          Help me plan my trip
        </h2>
        <div className="trip-panel">
          <form className="trip-form" onSubmit={handleSubmit} noValidate>
          <div
            className="trip-field trip-dest-combobox"
            ref={destinationComboboxRef}
          >
            <div className="trip-dest-header-row">
              <label className="trip-dest-label" htmlFor="location">
                Destination
              </label>
              <div
                className="trip-dest-kind-toggle"
                role="group"
                aria-label="Destination type"
              >
                <button
                  type="button"
                  className="trip-dest-kind-btn"
                  aria-pressed={destinationKind === 'city'}
                  onClick={() =>
                    updateField('destinationKind', DESTINATION_KIND_DEFAULT)
                  }
                >
                  City
                </button>
                <button
                  type="button"
                  className="trip-dest-kind-btn"
                  aria-pressed={destinationKind === 'landmark'}
                  onClick={() => updateField('destinationKind', 'landmark')}
                >
                  Landmark
                </button>
              </div>
            </div>
            <div className="trip-dest-input-wrap">
              <input
                ref={locationInputRef}
                id="location"
                name="location"
                type="text"
                autoComplete="off"
                placeholder={
                  destinationKind === 'city'
                    ? 'e.g. Lisbon, Portugal'
                    : 'e.g. Eiffel Tower, Paris'
                }
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={showDestinationList}
                aria-controls="destination-listbox"
                aria-activedescendant={
                  showDestinationList
                    ? `destination-opt-${destinationActiveIndex}`
                    : undefined
                }
                value={form.location}
                onChange={(e) => updateField('location', e.target.value)}
                onFocus={() => setDestinationFocused(true)}
                onBlur={() => setDestinationFocused(false)}
                onKeyDown={onDestinationKeyDown}
              />
              {showDestinationList ? (
                <ul
                  id="destination-listbox"
                  className="trip-dest-list"
                  role="listbox"
                >
                  {destinationMatches.map((dest, index) => (
                    <li key={dest} role="presentation">
                      <button
                        type="button"
                        id={`destination-opt-${index}`}
                        role="option"
                        aria-selected={index === destinationActiveIndex}
                        className={
                          index === destinationActiveIndex
                            ? 'trip-dest-option trip-dest-option-active'
                            : 'trip-dest-option'
                        }
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickDestination(dest)}
                      >
                        {dest}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          {hasDestination ? (
            <>
              <div className="trip-row">
                <div className="trip-field">
                  <label htmlFor="startDate">Start date</label>
                  <input
                    id="startDate"
                    name="startDate"
                    type="date"
                    value={form.startDate}
                    onChange={(e) => updateField('startDate', e.target.value)}
                  />
                </div>
                <div className="trip-field">
                  <label htmlFor="endDate">End date</label>
                  <input
                    id="endDate"
                    name="endDate"
                    type="date"
                    value={form.endDate}
                    onChange={(e) => updateField('endDate', e.target.value)}
                  />
                </div>
              </div>

              <div className="trip-check">
                <input
                  id="dateLenient"
                  name="dateLenient"
                  type="checkbox"
                  checked={form.dateLenient}
                  onChange={(e) => updateField('dateLenient', e.target.checked)}
                />
                <label htmlFor="dateLenient">I’m flexible with these dates</label>
              </div>
            </>
          ) : null}

          {hasDates ? (
            <div className="trip-budget-row">
              <div className="trip-field trip-budget-field">
                <label htmlFor="price">Trip price (budget)</label>
                <input
                  id="price"
                  name="price"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.price}
                  onChange={(e) => updateField('price', e.target.value)}
                />
              </div>
              <div className="trip-budget-settings" ref={budgetMenuRef}>
                <button
                  type="button"
                  className={
                    budgetMenuOpen
                      ? 'trip-gear-btn trip-gear-btn-active'
                      : 'trip-gear-btn'
                  }
                  aria-expanded={budgetMenuOpen}
                  aria-haspopup="dialog"
                  {...(budgetMenuOpen ? { 'aria-controls': 'budget-gear-menu' } : {})}
                  onClick={() => setBudgetMenuOpen((open) => !open)}
                >
                  <GearIcon />
                  <span className="trip-sr-only">Budget options</span>
                </button>
                {budgetMenuOpen ? (
                  <div
                    id="budget-gear-menu"
                    className="trip-gear-menu"
                    role="dialog"
                    aria-modal="false"
                    aria-labelledby="budget-gear-menu-title"
                  >
                    <h3
                      id="budget-gear-menu-title"
                      className="trip-gear-menu-title"
                    >
                      About your budget
                    </h3>
                    <p className="trip-gear-menu-body">
                      {BUDGET_DETAILS_PLACEHOLDER}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {hasPrice && formError ? (
            <p className="trip-form-error" role="alert">
              {formError}
            </p>
          ) : null}

          {showSaveStep ? (
            <button type="submit" className="trip-submit">
              Save trip
            </button>
          ) : null}
        </form>
        </div>
      </section>

      {trips.length > 0 ? (
        <section className="trip-list-section" aria-labelledby="saved-trips">
          <h2 id="saved-trips">Saved trips</h2>
          <ul className="trip-list">
            {trips.map((trip) => (
              <li key={trip.id} className="trip-card">
                <div className="trip-card-main">
                  <strong className="trip-card-place">{trip.location}</strong>
                  <span className="trip-card-kind">
                    {trip.destinationKind === 'landmark' ? 'Landmark' : 'City'}
                  </span>
                  <span className="trip-card-dates">
                    {formatDateRange(trip.startDate, trip.endDate)}
                    {trip.dateLenient ? (
                      <span className="trip-card-lenient"> · Flexible</span>
                    ) : (
                      <span className="trip-card-fixed"> · Fixed dates</span>
                    )}
                  </span>
                </div>
                <span className="trip-card-price">
                  {formatMoney(trip.price)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function GearIcon() {
  return (
    <svg
      className="trip-gear-icon"
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
    </svg>
  )
}

function formatDateRange(start, end) {
  const opts = { month: 'short', day: 'numeric', year: 'numeric' }
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}`
}

function formatMoney(amount) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

export default App
