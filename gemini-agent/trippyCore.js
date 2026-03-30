/**
 * trippyCore.js — SHARED "BACKEND BRAINS" FOR TRIPPY
 *
 * Why this file exists:
 * - The Gemini model + system instructions should live in ONE place.
 * - The CLI (`agent.js`) and the HTTP API (`backend/server.js`) both import from here.
 * - That way you never duplicate the prompt or risk the terminal and website behaving differently.
 */

// ChatGoogle is LangChain's wrapper around Google's Gemini API (sends HTTP requests to Google under the hood).
import { ChatGoogle } from "@langchain/google";
// LangChain uses typed message objects so the model knows what is system vs user vs assistant text.
import {
  SystemMessage, // Instructions that define how Trippy should behave (not shown as "user" chat).
  HumanMessage, // What the end user typed.
  AIMessage, // What the model (Gemini) already replied earlier in the conversation.
} from "@langchain/core/messages";

/**
 * SYSTEM PROMPT:
 * This string is sent ONCE as a special "system" message.
 * It does not appear as a normal chat bubble; it steers the model's personality and rules.
 */
export const TRIPPY_SYSTEM_PROMPT = `
[ROLE]
You are Trippy, an elite, world-class travel curator and advisor. You possess the infectious energy
of a seasoned explorer, the deep knowledge of a local historian, and the calming presence of a
luxury concierge. You don't just "book trips"—you craft bespoke experiences based on the user's
soul, budget, and logistical needs.

[PERSONA & TONE]
Vibe: Enthusiastic and fun, yet grounded and organized.
Communication: Use vibrant, evocative language (e.g., "hidden gems," "breathtaking vistas," "seamless transitions").
Stance: You are a collaborative partner. If a user's request is logistically impossible or out of
budget, gently guide them toward a "smarter" alternative without losing your excitement.

[OPERATIONAL WORKFLOW]
Intake & Discovery: If the user provides vague input, ask targeted, friendly questions to fill the gaps regarding:
  - Party size (adults/children/pets)
  - Destination/Vibe
  - Dates/Duration
  - Budget (Economy $, Mid-range $$, Luxury $$$)
  - Transport method
  - "Must-have" amenities

Research & API Integration: When utilizing research tools or the Google Places API, apply the following filters:
  - Social Proof: Prioritize locations with a 4.2+ star rating and at least 100 reviews.
    Highlight those with near-perfect ratings but fewer reviews as "Local Secrets."
  - Recency: Never suggest businesses marked as "Temporarily Closed."
  - Radius Logic: If the user is walking/using transit, keep suggestions within a 3-mile radius.
    If they have a car, expand to 15+ miles for better value.
  - Synthesis: Cross-reference all data with the user's specific constraints
    (e.g., don't suggest a steakhouse to a vegan, or a rooftop bar for a family with toddlers).

[RESPONSE STRUCTURE]
Every itinerary or recommendation must follow this format:
  - The Vibe Check: A one-sentence opening on why this selection fits the user's personality.
  - The Recommendation: [Name of Place/Activity] ⭐ [Rating].
  - The "Atlas Tip": A specific, helpful detail found in reviews or local lore
    (e.g., "The north entrance has shorter lines at 10 AM!").
  - Logistics & Price: Include a "Getting Around" section and clear price brackets ($, $$, $$$).

[CONSTRAINTS & GUARDRAILS]
  - Seasonality: Do not suggest seasonal activities that are closed during the user's travel dates
    (e.g., no skiing in July).
  - Budget Integrity: Strictly adhere to the user's budget. If a destination is naturally expensive
    (e.g., Iceland or NYC), provide "smart-spend" tips to keep them within their limit.
  - Accuracy: If you are unsure about a specific detail, use your search tool to verify rather than hallucinating.

[INITIAL GREETING]
"Aloha! I'm Trippy, your personal travel curator. I'm already dreaming about your next getaway!
To help me build the ultimate itinerary for you, tell me: where are we dreaming of going, and
what's the one thing you can't travel without?"
`;

/**
 * Returns the starting message list: only the system prompt.
 * Both the CLI and API build conversation history on top of this.
 */
export function initialMessageHistory() {
  // new SystemMessage(...) wraps the prompt in LangChain's expected format for Gemini.
  return [new SystemMessage(TRIPPY_SYSTEM_PROMPT)];
}

/**
 * Builds the LangChain ChatGoogle client.
 *
 * @param {object} [options]
 * @param {boolean} [options.streaming=true] If true, `.stream()` yields chunks; if false, `.invoke()` returns one full reply.
 *
 * process.env.GEMINI_API_KEY is set by dotenv from your `.env` file before this runs.
 */
export function createTrippyLlm(options = {}) {
  // Read the secret API key from environment variables (never commit real keys to git).
  const key = process.env.GEMINI_API_KEY;
  // Fail fast with a clear error if the server/CLI was started without configuring the key.
  if (!key?.trim()) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  // streaming !== false means: default is streaming ON unless you pass { streaming: false }.
  const streaming = options.streaming !== false;

  // This object knows how to call Google's Gemini API using your key.
  return new ChatGoogle({
    apiKey: key,
    model: "gemini-3-flash-preview", // Gemini model id on Google's side.
    streaming, // Tells LangChain whether responses should be streamed token-by-token or buffered.
    maxOutputTokens: 8192, // Hard cap on how long one reply may be (model-dependent).
  });
}

/**
 * Converts simple JSON chat objects from the frontend into LangChain messages.
 *
 * Example clientMessages:
 *   [
 *     { role: "user", content: "Hello" },
 *     { role: "assistant", content: "Hi! Where to?" },
 *     { role: "user", content: "Chicago" }
 *   ]
 *
 * The API sends this array over HTTP; we translate it so Gemini understands roles.
 */
export function toLangChainMessages(clientMessages) {
  // Always start with system instructions, then append the user-visible conversation.
  const history = initialMessageHistory();

  // Walk each message from the client and map roles to LangChain classes.
  for (const m of clientMessages) {
    if (m.role === "user") {
      history.push(new HumanMessage(m.content));
    } else if (m.role === "assistant") {
      // Past assistant replies are included so Gemini has conversation context ("memory").
      history.push(new AIMessage(m.content));
    }
    // Any other role could be ignored or validated earlier in the API layer.
  }

  return history;
}

/**
 * LangChain streaming sometimes gives `chunk.content` as a string OR as an array of parts.
 * This helper always turns a stream chunk into a plain string for printing/SSE.
 */
export function chunkText(chunk) {
  // If content is an array of parts (multipart responses), extract `.text` from each and join.
  if (Array.isArray(chunk.content)) {
    return chunk.content.map((part) => part.text ?? "").join("");
  }
  // If it's already a string, use it; if missing, use empty string.
  return chunk.content ?? "";
}
