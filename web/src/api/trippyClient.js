/**
 * trippyClient.js — all HTTP calls from React → Express → Gemini.
 *
 * During development (`npm run dev`), Vite proxies "/api" to the backend (see vite.config.js),
 * so we use relative URLs like "/api/chat". The browser sees same-origin requests.
 *
 * In production you would set import.meta.env.VITE_API_URL to your deployed API origin
 * and prefix paths, e.g. `${API_URL}/api/chat`.
 */

/** Base URL for API calls: empty string = same origin (works with Vite proxy). */
const API_BASE = import.meta.env.VITE_API_URL ?? "";

/**
 * POST /api/chat — one full assistant reply (non-streaming).
 *
 * @param {{ role: "user" | "assistant"; content: string }[]} messages
 *        Conversation in order. Last item must be role "user" (required by backend).
 * @returns {Promise<string>} Assistant message text.
 */
export async function sendChat(messages) {
  // fetch returns a Promise; await waits for the HTTP round trip.
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    // JSON request body; Express parses this with express.json().
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });

  // res.ok is false for status codes outside 200–299 (e.g. 400, 500).
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `API error ${res.status}`);
  }

  const data = await res.json();
  // Matches backend shape: { message: { role: "assistant", content: "..." } }
  return data.message.content;
}

/**
 * GET /api/health — cheap check that the API process is running.
 * @returns {Promise<boolean>}
 */
export async function checkApiHealth() {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    if (!res.ok) return false;
    const data = await res.json();
    return data.ok === true;
  } catch {
    // Network failure (API not started, wrong port, etc.)
    return false;
  }
}
