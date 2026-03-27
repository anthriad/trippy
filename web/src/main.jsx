import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { TripsProvider } from './state/TripsProvider.jsx'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TripsProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </TripsProvider>
  </StrictMode>,
)
