/**
 * App.jsx — main UI.
 *
 * "Saved trips" button:
 * - Toggles a panel where the user sees trips stored in the browser (localStorage).
 * - Those trips are not on the server yet; they are front-end data. We only call the API
 *   when you ask Trippy to comment on them, which demonstrates React → Express → Gemini.
 */

import { useEffect, useState } from "react";
import { sendChat, checkApiHealth } from "./api/trippyClient.js";
import "./App.css";

/** Key used in localStorage to persist "saved trips" between refreshes. */
const STORAGE_KEY = "trippy_saved_trips";

/**
 * Reads JSON array from localStorage, or returns a small default list so the UI is not empty.
 * @returns {{ id: string; title: string; destination: string }[]}
 */
function loadTripsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Demo seed so "Saved trips" has something to show on first visit.
      return [
        {
          id: "1",
          title: "Long weekend",
          destination: "Chicago, IL",
        },
      ];
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/** Writes trips array to localStorage (stringify JSON). */
function saveTripsToStorage(trips) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
}

export default function App() {
  // Whether the Saved trips drawer/panel is visible.
  const [savedTripsOpen, setSavedTripsOpen] = useState(false);
  // List of trips the user has saved (client-side only).
  const [trips, setTrips] = useState(loadTripsFromStorage);
  // True when React has verified the Express server responded at /api/health.
  const [apiOnline, setApiOnline] = useState(false);
  // Trippy reply text after we call the backend from the Saved trips flow.
  const [trippyReply, setTrippyReply] = useState("");
  // Loading flag so the button shows "Thinking…" during the Gemini call.
  const [trippyLoading, setTrippyLoading] = useState(false);
  const [trippyError, setTrippyError] = useState("");

  // Whenever `trips` changes, persist to localStorage.
  useEffect(() => {
    saveTripsToStorage(trips);
  }, [trips]);

  // On mount, ping the API once so we can show a hint if you forgot to run `npm run api`.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await checkApiHealth();
      if (!cancelled) setApiOnline(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Runs when user clicks "Ask Trippy about these trips".
   * Builds one user message, POSTs to /api/chat, displays the assistant string.
   */
  async function askTrippyAboutSavedTrips() {
    setTrippyError("");
    setTrippyReply("");
    setTrippyLoading(true);
    try {
      const summary = trips
        .map((t) => `${t.title} → ${t.destination}`)
        .join("; ");
      const userMessageContent =
        `Here are my saved trips: ${summary}. ` +
        `In one short paragraph, suggest what I should plan next (dates, vibe, or one concrete activity) for the first trip.`;

      // Backend requires messages array ending with role "user".
      const messages = [{ role: "user", content: userMessageContent }];
      const reply = await sendChat(messages);
      setTrippyReply(reply);
    } catch (e) {
      setTrippyError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setTrippyLoading(false);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1 className="logo">Trippy</h1>
        <div className="header-actions">
          <span
            className={`api-pill ${apiOnline ? "api-pill--ok" : "api-pill--off"}`}
            title="Checks GET /api/health on the Express server"
          >
            API {apiOnline ? "online" : "offline"}
          </span>
          {/* Primary navigation control your task mentions: opens Saved trips. */}
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setSavedTripsOpen((open) => !open)}
            aria-expanded={savedTripsOpen}
          >
            Saved trips
          </button>
        </div>
      </header>

      <main className="main">
        <p className="hint">
          Run the backend from the repo root: <code>npm run api</code> (then{" "}
          <code>npm run dev</code> inside <code>web/</code>). Use{" "}
          <strong>Saved trips</strong> to open the panel and talk to Trippy through the API.
        </p>
      </main>

      {/* Panel toggled by "Saved trips" — not a separate route, just conditional UI. */}
      {savedTripsOpen && (
        <aside className="drawer" role="dialog" aria-label="Saved trips">
          <div className="drawer__header">
            <h2>Saved trips</h2>
            <button
              type="button"
              className="btn btn--close"
              onClick={() => setSavedTripsOpen(false)}
            >
              Close
            </button>
          </div>

          <ul className="trip-list">
            {trips.map((t) => (
              <li key={t.id} className="trip-card">
                <strong>{t.title}</strong>
                <span className="trip-card__dest">{t.destination}</span>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="btn btn--primary"
            disabled={trippyLoading || trips.length === 0}
            onClick={askTrippyAboutSavedTrips}
          >
            {trippyLoading ? "Trippy is thinking…" : "Ask Trippy about these trips"}
          </button>

          {trippyError && <p className="error">{trippyError}</p>}
          {trippyReply && (
            <section className="reply">
              <h3>Trippy says</h3>
              <p className="reply__body">{trippyReply}</p>
            </section>
          )}
        </aside>
      )}

      {/* Simple backdrop click-to-close */}
      {savedTripsOpen && (
        <button
          type="button"
          className="backdrop"
          aria-label="Close saved trips"
          onClick={() => setSavedTripsOpen(false)}
        />
      )}
    </div>
  );
}
