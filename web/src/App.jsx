import { useEffect, useRef, useState } from 'react'
import { Link, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import {
  ensureMapsLoaded,
  fetchPlaceSuggestions,
} from './googlePlacesAutocomplete.js'
import './App.css'
import { useTripsStore } from './state/tripsContext.js'
import TripResultsPage from './pages/TripResultsPage.jsx'

/** Replace with your real budget explanation when ready. */
const BUDGET_DETAILS_PLACEHOLDER =
  'More information about how this budget is used will appear here.'

/** Default until the user explicitly chooses Landmark. */
const DESTINATION_KIND_DEFAULT = 'city'
const MAX_DESTINATIONS = 10

function normalizeDestinationKind(value) {
  return value === 'landmark' ? 'landmark' : 'city'
}

const initialForm = {
  fromLocation: '',
  location: '',
  extraLocations: [],
  destinationKind: DESTINATION_KIND_DEFAULT,
  startDate: '',
  endDate: '',
  dateLenient: false,
  priceMode: 'perPerson',
  price: '',
}

function TripPlannerPage() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('trippy-theme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  })
  const [form, setForm] = useState(initialForm)
  const navigate = useNavigate()
  const { trips, addTrip } = useTripsStore()
  const [formError, setFormError] = useState('')
  const [budgetMenuOpen, setBudgetMenuOpen] = useState(false)
  const budgetMenuRef = useRef(null)

  const [activeDestinationField, setActiveDestinationField] = useState(null)
  const [destinationListDismissed, setDestinationListDismissed] =
    useState(false)
  const [destinationActiveIndex, setDestinationActiveIndex] = useState(0)
  const fromComboboxRef = useRef(null)
  const destinationComboboxRef = useRef(null)
  const fromInputRef = useRef(null)
  const locationInputRef = useRef(null)
  const placesSessionRef = useRef(null)

  const [destinationSuggestions, setDestinationSuggestions] = useState([])
  const [openDatePicker, setOpenDatePicker] = useState(null)
  const [calendarMonth, setCalendarMonth] = useState(startOfMonth(new Date()))

  const destinationKind = normalizeDestinationKind(form.destinationKind)

  const activeDestinationQuery = getActiveDestinationQuery(
    activeDestinationField,
    form,
  )
  const showDestinationList =
    activeDestinationField &&
    !destinationListDismissed &&
    activeDestinationQuery.length > 0 &&
    destinationSuggestions.length > 0 &&
    !(
      destinationSuggestions.length === 1 &&
      destinationSuggestions[0].text === activeDestinationQuery
    )

  const hasDestination =
    form.fromLocation.trim().length > 0 &&
    form.location.trim().length > 0 &&
    form.extraLocations.every((loc) => loc.trim().length > 0)
  const totalDestinations = 1 + form.extraLocations.length
  const reachedDestinationLimit = totalDestinations >= MAX_DESTINATIONS
  const hasDates = hasDestination && Boolean(form.startDate && form.endDate)
  const hasPrice = hasDates && form.price !== ''
  const showSaveStep = hasPrice

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('trippy-theme', theme)
  }, [theme])

  useEffect(() => {
    placesSessionRef.current = null
  }, [destinationKind])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDestinationActiveIndex(0)
  }, [destinationSuggestions])

  useEffect(() => {
    if (!activeDestinationField) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDestinationSuggestions([])
      return
    }
    const q = activeDestinationQuery
    if (q.length < 2) {
      setDestinationSuggestions([])
      return
    }
    const apiKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY
    if (!apiKey?.trim()) {
      setDestinationSuggestions([])
      return
    }

    let cancelled = false
    const tid = setTimeout(async () => {
      try {
        await ensureMapsLoaded(apiKey)
        if (cancelled) return
        const { AutocompleteSessionToken } =
          await google.maps.importLibrary('places')
        if (!placesSessionRef.current) {
          placesSessionRef.current = new AutocompleteSessionToken()
        }
        const kindForFetch =
          activeDestinationField?.type === 'from' ? 'city' : destinationKind
        const rows = await fetchPlaceSuggestions(
          q,
          kindForFetch,
          placesSessionRef.current,
        )
        if (!cancelled) setDestinationSuggestions(rows)
      } catch (e) {
        if (!cancelled) {
          console.error(e)
          setDestinationSuggestions([])
        }
      }
    }, 320)

    return () => {
      cancelled = true
      clearTimeout(tid)
    }
  }, [activeDestinationQuery, destinationKind, activeDestinationField])

  useEffect(() => {
    if (!showDestinationList) return
    function handlePointerDown(e) {
      if (
        !(
          (fromComboboxRef.current &&
            fromComboboxRef.current.contains(e.target)) ||
          (destinationComboboxRef.current &&
            destinationComboboxRef.current.contains(e.target))
        )
      ) {
        setActiveDestinationField(null)
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
    if (!openDatePicker) return
    function handlePointerDown(e) {
      if (!e.target.closest('.trip-date-picker-wrap')) {
        setOpenDatePicker(null)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [openDatePicker])

  useEffect(() => {
    if (!hasDates && budgetMenuOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBudgetMenuOpen(false)
    }
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm((prev) => ({
        ...prev,
        startDate: '',
        endDate: '',
        dateLenient: false,
        priceMode: 'perPerson',
        price: '',
      }))
    }
  }, [hasDestination])

  useEffect(() => {
    // If dates are incomplete, the budget step should not be shown.
    if (hasDates) return
    if (form.price !== '') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm((prev) => ({ ...prev, price: '' }))
    }
  }, [hasDates, form.price])

  function updateField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }))
    if (name === 'fromLocation' || name === 'location' || name === 'destinationKind')
      setDestinationListDismissed(false)
    if ((name === 'fromLocation' || name === 'location') && !String(value).trim()) {
      placesSessionRef.current = null
    }
    setFormError('')
  }

  function openCalendar(field) {
    const seed = field === 'startDate' ? form.startDate : form.endDate
    setCalendarMonth(startOfMonth(seed ? new Date(seed + 'T12:00:00') : new Date()))
    setOpenDatePicker(field)
  }

  function selectDate(field, isoDate) {
    updateField(field, isoDate)
    setOpenDatePicker(null)
  }

  function addDestinationField() {
    if (reachedDestinationLimit) {
      setFormError(`You can add up to ${MAX_DESTINATIONS} destinations.`)
      return
    }
    setForm((prev) => ({
      ...prev,
      extraLocations: [...prev.extraLocations, ''],
    }))
    setFormError('')
  }

  function updateExtraLocation(index, value) {
    setForm((prev) => {
      const next = [...prev.extraLocations]
      next[index] = value
      return { ...prev, extraLocations: next }
    })
    setDestinationListDismissed(false)
    if (!String(value).trim()) placesSessionRef.current = null
    setFormError('')
  }

  function removeExtraLocation(index) {
    setForm((prev) => ({
      ...prev,
      extraLocations: prev.extraLocations.filter((_, i) => i !== index),
    }))
    if (
      activeDestinationField?.type === 'extra' &&
      activeDestinationField.index === index
    ) {
      setActiveDestinationField(null)
    }
    setFormError('')
  }

  function pickDestination(value, targetField = activeDestinationField) {
    placesSessionRef.current = null
    setDestinationListDismissed(true)
    if (!targetField) return
    setForm((prev) => {
      if (targetField.type === 'from') {
        return { ...prev, fromLocation: value }
      }
      if (targetField.type === 'primary') {
        return { ...prev, location: value }
      }
      const next = [...prev.extraLocations]
      next[targetField.index] = value
      return { ...prev, extraLocations: next }
    })
    setFormError('')
    if (targetField.type === 'from') fromInputRef.current?.focus()
    if (targetField.type === 'primary') locationInputRef.current?.focus()
  }

  function onDestinationKeyDown(e, targetField) {
    if (!showDestinationList) return
    if (!isSameDestinationField(activeDestinationField, targetField)) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setDestinationActiveIndex((i) =>
        Math.min(i + 1, destinationSuggestions.length - 1),
      )
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setDestinationActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const row = destinationSuggestions[destinationActiveIndex]
      if (row) pickDestination(row.text, targetField)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setActiveDestinationField(null)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!showSaveStep) return
    const fromLocation = form.fromLocation.trim()
    const location = form.location.trim()
    const extraLocations = form.extraLocations.map((loc) => loc.trim())
    if (extraLocations.some((loc) => !loc)) {
      setFormError('Please complete each added destination.')
      return
    }
    const allLocations = [location, ...extraLocations]
    if (
      !fromLocation ||
      !location ||
      !form.startDate ||
      !form.endDate ||
      form.price === ''
    ) {
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
    const priceMode = form.priceMode === 'total' ? 'total' : 'perPerson'
    const planVariables = {
      origin: fromLocation,
      destinations: {
        primary: location,
        extras: extraLocations,
        all: allLocations,
        kind: normalizeDestinationKind(form.destinationKind),
      },
      dates: {
        start: form.startDate,
        end: form.endDate,
        isFlexible: form.dateLenient,
      },
      budget: {
        amount: priceNum,
        currency: 'USD',
        mode: priceMode,
      },
      createdAt: new Date().toISOString(),
    }

    const trip = {
      id: crypto.randomUUID(),
      fromLocation,
      location: allLocations.join(' • '),
      locations: allLocations,
      destinationKind: planVariables.destinations.kind,
      startDate: form.startDate,
      endDate: form.endDate,
      dateLenient: form.dateLenient,
      priceMode,
      price: priceNum,
      payload: planVariables,
      sync: {
        status: 'idle',
        startedAt: null,
        finishedAt: null,
        error: null,
      },
      itinerary: null,
      meta: null,
      chatMessages: [],
    }
    console.info('Trip plan payload:', planVariables)
    addTrip(trip)
    navigate(`/trip/${trip.id}`)
    setForm(initialForm)
    setFormError('')
    setDestinationListDismissed(false)
    placesSessionRef.current = null
    setDestinationSuggestions([])
  }

  return (
    <div className="trip-app">
      <section className="trip-form-section" aria-labelledby="trip-form-title">
        <div className="trip-theme-row">
          <span className="trip-theme-label">
            {theme === 'dark' ? 'Dark mode' : 'Light mode'}
          </span>
          <button
            type="button"
            className={theme === 'dark' ? 'trip-theme-toggle on' : 'trip-theme-toggle'}
            role="switch"
            aria-checked={theme === 'dark'}
            aria-label="Toggle light and dark mode"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          >
            <span className="trip-theme-thumb" aria-hidden />
          </button>
        </div>
        <div className="trip-panel">
          <form className="trip-form" onSubmit={handleSubmit} noValidate>
          <div
            className="trip-field trip-dest-combobox"
            ref={fromComboboxRef}
          >
            <div className="trip-dest-header-row">
              <label className="trip-dest-label" htmlFor="fromLocation">
                Leaving from
              </label>
            </div>
            <div className="trip-dest-input-wrap">
              <input
                ref={fromInputRef}
                id="fromLocation"
                name="fromLocation"
                type="text"
                autoComplete="off"
                placeholder="e.g. New York, NY"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={
                  showDestinationList &&
                  isSameDestinationField(activeDestinationField, {
                    type: 'from',
                  })
                }
                aria-controls="destination-listbox-from"
                aria-activedescendant={
                  showDestinationList &&
                  isSameDestinationField(activeDestinationField, {
                    type: 'from',
                  })
                    ? `destination-opt-from-${destinationActiveIndex}`
                    : undefined
                }
                value={form.fromLocation}
                onChange={(e) => updateField('fromLocation', e.target.value)}
                onFocus={() => setActiveDestinationField({ type: 'from' })}
                onKeyDown={(e) => onDestinationKeyDown(e, { type: 'from' })}
              />
              {showDestinationList &&
              isSameDestinationField(activeDestinationField, {
                type: 'from',
              }) ? (
                <ul
                  id="destination-listbox-from"
                  className="trip-dest-list"
                  role="listbox"
                >
                  {destinationSuggestions.map((row, index) => (
                    <li
                      key={row.placeId || `${index}-${row.text}`}
                      role="presentation"
                    >
                      <button
                        type="button"
                        id={`destination-opt-from-${index}`}
                        role="option"
                        aria-selected={index === destinationActiveIndex}
                        className={
                          index === destinationActiveIndex
                            ? 'trip-dest-option trip-dest-option-active'
                            : 'trip-dest-option'
                        }
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickDestination(row.text, { type: 'from' })}
                      >
                        {row.text}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
          <div
            className="trip-field trip-dest-combobox"
            ref={destinationComboboxRef}
          >
            <div className="trip-dest-header-row">
              <label className="trip-dest-label" htmlFor="location">
                Going to
              </label>
              <div className="trip-dest-controls">
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
                <button
                  type="button"
                  className="trip-dest-add-btn"
                  onClick={addDestinationField}
                  aria-label="Add another destination"
                  disabled={reachedDestinationLimit}
                  title={
                    reachedDestinationLimit
                      ? `Maximum ${MAX_DESTINATIONS} destinations reached`
                      : 'Add another destination'
                  }
                >
                  +
                </button>
              </div>
            </div>
            {reachedDestinationLimit ? (
              <p className="trip-limit-note" role="status">
                Maximum of {MAX_DESTINATIONS} destinations reached.
              </p>
            ) : null}
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
                aria-expanded={
                  showDestinationList &&
                  isSameDestinationField(activeDestinationField, {
                    type: 'primary',
                  })
                }
                aria-controls="destination-listbox-primary"
                aria-activedescendant={
                  showDestinationList &&
                  isSameDestinationField(activeDestinationField, {
                    type: 'primary',
                  })
                    ? `destination-opt-primary-${destinationActiveIndex}`
                    : undefined
                }
                value={form.location}
                onChange={(e) => updateField('location', e.target.value)}
                onFocus={() => setActiveDestinationField({ type: 'primary' })}
                onKeyDown={(e) => onDestinationKeyDown(e, { type: 'primary' })}
              />
              {showDestinationList &&
              isSameDestinationField(activeDestinationField, {
                type: 'primary',
              }) ? (
                <ul
                  id="destination-listbox-primary"
                  className="trip-dest-list"
                  role="listbox"
                >
                  {destinationSuggestions.map((row, index) => (
                    <li
                      key={row.placeId || `${index}-${row.text}`}
                      role="presentation"
                    >
                      <button
                        type="button"
                        id={`destination-opt-primary-${index}`}
                        role="option"
                        aria-selected={index === destinationActiveIndex}
                        className={
                          index === destinationActiveIndex
                            ? 'trip-dest-option trip-dest-option-active'
                            : 'trip-dest-option'
                        }
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() =>
                          pickDestination(row.text, { type: 'primary' })
                        }
                      >
                        {row.text}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {form.extraLocations.map((loc, idx) => (
              <div className="trip-extra-destination-row" key={`extra-${idx}`}>
                <div className="trip-extra-destination-input-wrap">
                  <input
                    type="text"
                    className="trip-extra-destination-input"
                    placeholder={
                      destinationKind === 'city'
                        ? 'Add another city...'
                        : 'Add another landmark...'
                    }
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={
                      showDestinationList &&
                      isSameDestinationField(activeDestinationField, {
                        type: 'extra',
                        index: idx,
                      })
                    }
                    aria-controls={`destination-listbox-extra-${idx}`}
                    aria-activedescendant={
                      showDestinationList &&
                      isSameDestinationField(activeDestinationField, {
                        type: 'extra',
                        index: idx,
                      })
                        ? `destination-opt-extra-${idx}-${destinationActiveIndex}`
                        : undefined
                    }
                    value={loc}
                    onChange={(e) => updateExtraLocation(idx, e.target.value)}
                    onFocus={() =>
                      setActiveDestinationField({ type: 'extra', index: idx })
                    }
                    onKeyDown={(e) =>
                      onDestinationKeyDown(e, { type: 'extra', index: idx })
                    }
                  />
                  {showDestinationList &&
                  isSameDestinationField(activeDestinationField, {
                    type: 'extra',
                    index: idx,
                  }) ? (
                    <ul
                      id={`destination-listbox-extra-${idx}`}
                      className="trip-dest-list"
                      role="listbox"
                    >
                      {destinationSuggestions.map((row, index) => (
                        <li
                          key={row.placeId || `extra-${idx}-${index}-${row.text}`}
                          role="presentation"
                        >
                          <button
                            type="button"
                            id={`destination-opt-extra-${idx}-${index}`}
                            role="option"
                            aria-selected={index === destinationActiveIndex}
                            className={
                              index === destinationActiveIndex
                                ? 'trip-dest-option trip-dest-option-active'
                                : 'trip-dest-option'
                            }
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() =>
                              pickDestination(row.text, {
                                type: 'extra',
                                index: idx,
                              })
                            }
                          >
                            {row.text}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="trip-extra-destination-remove"
                  onClick={() => removeExtraLocation(idx)}
                  aria-label="Remove destination"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {hasDestination ? (
            <>
              <div className="trip-row">
                <div className="trip-field">
                  <label htmlFor="startDate">Start date</label>
                  <div className="trip-date-picker-wrap">
                    <button
                      id="startDate"
                      type="button"
                      className="trip-date-trigger"
                      onClick={() => openCalendar('startDate')}
                    >
                      {form.startDate ? formatDisplayDate(form.startDate) : 'Select date'}
                    </button>
                    {openDatePicker === 'startDate' ? (
                      <CalendarPopup
                        value={form.startDate}
                        month={calendarMonth}
                        onMonthChange={setCalendarMonth}
                        onSelect={(iso) => selectDate('startDate', iso)}
                        onClose={() => setOpenDatePicker(null)}
                        maxDate={form.endDate || undefined}
                      />
                    ) : null}
                  </div>
                </div>
                <div className="trip-field">
                  <label htmlFor="endDate">End date</label>
                  <div className="trip-date-picker-wrap">
                    <button
                      id="endDate"
                      type="button"
                      className="trip-date-trigger"
                      onClick={() => openCalendar('endDate')}
                    >
                      {form.endDate ? formatDisplayDate(form.endDate) : 'Select date'}
                    </button>
                    {openDatePicker === 'endDate' ? (
                      <CalendarPopup
                        value={form.endDate}
                        month={calendarMonth}
                        onMonthChange={setCalendarMonth}
                        onSelect={(iso) => selectDate('endDate', iso)}
                        onClose={() => setOpenDatePicker(null)}
                        minDate={form.startDate || undefined}
                      />
                    ) : null}
                  </div>
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
                <label htmlFor="price" className="trip-price-label">
                  Trip price
                  {form.priceMode === 'perPerson' ? (
                    <span className="trip-price-hint"> (per person)</span>
                  ) : null}
                </label>
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
                    aria-label="Budget options"
                  >
                    <div className="trip-price-mode trip-price-mode-in-menu">
                      <span id="price-mode-label">Total trip</span>
                      <button
                        type="button"
                        className={
                          form.priceMode === 'perPerson'
                            ? 'trip-inline-switch trip-inline-switch-on'
                            : 'trip-inline-switch'
                        }
                        role="switch"
                        aria-checked={form.priceMode === 'perPerson'}
                        aria-labelledby="price-mode-label"
                        onClick={() =>
                          updateField(
                            'priceMode',
                            form.priceMode === 'perPerson' ? 'total' : 'perPerson',
                          )
                        }
                      >
                        <span className="trip-inline-switch-thumb" aria-hidden />
                      </button>
                      <span>Per person</span>
                    </div>
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
              Plan trip
            </button>
          ) : null}
        </form>
        </div>
      </section>

      {trips.length > 0 ? (
        <section className="trip-list-section" aria-labelledby="saved-trips">
          <div className="trip-panel trip-panel-saved">
            <h2 id="saved-trips">Saved trips</h2>
            <ul className="trip-list">
              {trips.map((trip) => (
                <li key={trip.id} className="trip-card">
                  <Link to={`/trip/${trip.id}`} className="trip-card-link">
                    <div className="trip-card-main">
                      {trip.fromLocation ? (
                        <span className="trip-card-route">
                          <span className="trip-card-route-label">Leaving from</span>
                          <strong className="trip-card-route-value">
                            {trip.fromLocation}
                          </strong>
                        </span>
                      ) : null}
                      <span className="trip-card-route">
                        <span className="trip-card-route-label">Going to</span>
                        <strong className="trip-card-route-value">
                          {trip.location}
                        </strong>
                      </span>
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
                      <span className="trip-card-price-mode">
                        {trip.priceMode === 'total' ? ' total' : ' / person'}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
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

function CalendarPopup({
  value,
  month,
  onMonthChange,
  onSelect,
  onClose,
  minDate,
  maxDate,
}) {
  const monthStart = startOfMonth(month)
  const days = buildCalendarDays(monthStart)
  const selectedIso = value || ''

  return (
    <div className="trip-calendar-popover" role="dialog" aria-modal="false">
      <div className="trip-calendar-header">
        <button
          type="button"
          className="trip-calendar-nav"
          onClick={() => onMonthChange(addMonths(monthStart, -1))}
          aria-label="Previous month"
        >
          ‹
        </button>
        <strong>{monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
        <button
          type="button"
          className="trip-calendar-nav"
          onClick={() => onMonthChange(addMonths(monthStart, 1))}
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      <div className="trip-calendar-grid trip-calendar-weekdays">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="trip-calendar-grid">
        {days.map((d) => {
          const iso = toIsoDate(d)
          const outOfMonth = d.getMonth() !== monthStart.getMonth()
          const disabled =
            (minDate && iso < minDate) || (maxDate && iso > maxDate)
          return (
            <button
              key={iso}
              type="button"
              className={
                iso === selectedIso
                  ? 'trip-calendar-day trip-calendar-day-selected'
                  : 'trip-calendar-day'
              }
              disabled={disabled}
              data-out={outOfMonth || undefined}
              onClick={() => onSelect(iso)}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>
      <button type="button" className="trip-calendar-close" onClick={onClose}>
        Close
      </button>
    </div>
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

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

function buildCalendarDays(monthStart) {
  const first = new Date(monthStart)
  first.setDate(1 - first.getDay())
  const days = []
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(first)
    d.setDate(first.getDate() + i)
    days.push(d)
  }
  return days
}

function toIsoDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDisplayDate(iso) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function isSameDestinationField(a, b) {
  if (!a || !b) return false
  if (a.type !== b.type) return false
  if (a.type === 'extra') return a.index === b.index
  return true
}

function getActiveDestinationQuery(activeField, form) {
  if (!activeField) return ''
  if (activeField.type === 'from') return form.fromLocation.trim()
  if (activeField.type === 'primary') return form.location.trim()
  return (form.extraLocations[activeField.index] ?? '').trim()
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<TripPlannerPage />} />
      <Route path="/trip/:tripId" element={<TripResultsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
