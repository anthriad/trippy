import { createContext, useContext } from 'react'

export const TripsContext = createContext(null)

export function useTripsStore() {
  const ctx = useContext(TripsContext)
  if (!ctx) throw new Error('useTripsStore must be used inside TripsProvider')
  return ctx
}

