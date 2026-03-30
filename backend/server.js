/**
 * server.js — HTTP API BETWEEN YOUR FRONTEND AND THE GEMINI AGENT
 *
 * Big picture:
 *   [Browser / React / HTML] --HTTP (JSON)--> [this Express app] --HTTPS--> [Google Gemini API]
 *                                                      |
 *                                              uses trippyCore.js
 *
 * Why Express?
 * - Node's `http` module could work, but Express adds easy routing, JSON body parsing, and CORS.
 *
 * Run from repo root: `npm run api`
 * Default URL: http://localhost:3001 (or whatever PORT is in backend/.env)
 */

// express: web framework; creates an "app" object that handles routes like GET /path and POST /path.
import express from "express";
// cors: Cross-Origin Resource Sharing — browsers block random sites from calling your API unless
// the server sends headers allowing it. cors() adds those headers so your frontend (e.g. Vite on :5173) may call this API.
import cors from "cors";
// dotenv: reads KEY=value lines from backend/.env into process.env (e.g. GEMINI_API_KEY).
import dotenv from "dotenv";
// path: join directory segments in a cross-platform safe way (Windows vs Mac/Linux).
import path from "path";
// ESM in Node has no __dirname by default; we reconstruct the folder this file lives in.
import { fileURLToPath } from "url";

// Everything below uses the SAME prompt + ChatGoogle setup as gemini-agent/agent.js.
import {
  createTrippyLlm, // Factory for the LangChain Gemini client.
  toLangChainMessages, // Turns JSON messages from frontend into LangChain format.
  chunkText, // Extracts text from each streaming chunk.
} from "../gemini-agent/trippyCore.js";

// import.meta.url is a special string like file:///.../backend/server.js
// fileURLToPath converts it to a normal OS path.
const __filename = fileURLToPath(import.meta.url);
// __dirname is the "backend" folder (where server.js sits).
const __dirname = path.dirname(__filename);

// Load env vars from backend/.env (relative to this file, not where you ran `node` from).
dotenv.config({ path: path.join(__dirname, ".env") });

// Create the Express application.
const app = express();
// PORT may be set in backend/.env; if not, fall back to 3001.
const PORT = Number(process.env.PORT) || 3001;

// --- Middleware (runs on many requests before your route handlers) ---

// Allow browsers on other origins (ports/domains) to call this API and read responses.
app.use(cors({ origin: true }));

// Parse JSON bodies on POST requests into req.body (e.g. { messages: [...] }).
// limit prevents huge payloads from eating memory.
app.use(express.json({ limit: "1mb" }));

// --- Routes ---

/**
 * GET /api/health
 * Simple "is the server up?" check. Frontends or load balancers often hit this.
 * No API key needed — does not talk to Gemini.
 */
app.get("/api/health", (_req, res) => {
  // _req: we don't read the request; underscore by convention means "unused".
  // res.json sends JSON with Content-Type: application/json and ends the response.
  res.json({
    ok: true,
    geminiConfigured: Boolean(String(process.env.GEMINI_API_KEY || "").trim()),
  });
});

/**
 * Validates the JSON body for both /api/chat and /api/chat/stream.
 * Returns a string error message or null if OK.
 */
function validateChatBody(body) {
  // Optional chaining: body?.messages is undefined if body is missing.
  const messages = body?.messages;

  if (!Array.isArray(messages) || messages.length === 0) {
    return "messages must be a non-empty array of { role, content }";
  }

  // Ensure every item has allowed role + string content.
  for (const m of messages) {
    if (m?.role !== "user" && m?.role !== "assistant") {
      return 'each message needs role "user" or "assistant"';
    }
    if (typeof m?.content !== "string") {
      return "each message needs a string content";
    }
  }

  // Gemini needs the latest turn to be the user's new question (standard chat pattern).
  if (messages[messages.length - 1].role !== "user") {
    return "last message must be from the user";
  }

  return null;
}

/**
 * POST /api/chat
 * Request body: { "messages": [ { "role": "user", "content": "..." }, ... ] }
 * Response body: { "message": { "role": "assistant", "content": "full reply..." } }
 *
 * This waits for the FULL Gemini reply before sending once — simplest for beginners.
 */
app.post("/api/chat", async (req, res) => {
  // Check user input shape before touching Gemini or spending API quota.
  const err = validateChatBody(req.body);
  if (err) {
    // 400 = "bad request" (client sent wrong data).
    res.status(400).json({ error: err });
    return;
  }

  try {
    // Non-streaming invoke: one round trip, one complete string back.
    const llm = createTrippyLlm({ streaming: false });
    // Convert the wire format to LangChain messages (includes system prompt inside).
    const lcMessages = toLangChainMessages(req.body.messages);
    // invoke runs the model and resolves when the answer is complete.
    const response = await llm.invoke(lcMessages);

    // LangChain may return content as string or structured; normalize to string.
    const content =
      typeof response.content === "string"
        ? response.content
        : chunkText(response);

    // 200 OK with JSON body — frontend will await res.json().
    res.json({ message: { role: "assistant", content } });
  } catch (e) {
    // Log full error on the server for debugging.
    console.error(e);
    // 500 = internal server error (e.g. invalid API key, network, Google outage).
    res.status(500).json({
      error: e instanceof Error ? e.message : "Chat failed",
    });
  }
});

/**
 * POST /api/chat/stream
 * Same body as /api/chat, but response uses Server-Sent Events (SSE).
 *
 * The response is text/event-stream: many small "data: ...\n\n" lines.
 * Frontend can read the stream and update the UI as tokens arrive (ChatGPT-like typing).
 */
app.post("/api/chat/stream", async (req, res) => {
  const err = validateChatBody(req.body);
  if (err) {
    res.status(400).json({ error: err });
    return;
  }

  // SSE headers tell the browser/proxy this is an ongoing stream, not one JSON blob.
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  // Some Express versions expose flushHeaders so headers go out immediately — optional chaining skips if undefined.
  res.flushHeaders?.();

  try {
    const llm = createTrippyLlm({ streaming: true });
    const lcMessages = toLangChainMessages(req.body.messages);
    // stream() returns an async iterable of chunks instead of one final message.
    const stream = await llm.stream(lcMessages);

    for await (const chunk of stream) {
      const text = chunkText(chunk);
      if (text) {
        // SSE format: each event is one or more lines starting with "data: ".
        // JSON.stringify escapes quotes/newlines safely inside one line.
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    // Special sentinel some clients look for to know streaming finished.
    res.write("data: [DONE]\n\n");
    res.end(); // Close the HTTP response (stream complete).
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "Chat failed";
    // Send error as one SSE payload so the client can still parse the stream uniformly.
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    res.end();
  }
});

// Start listening on TCP port PORT; only after this can the frontend connect.
app.listen(PORT, () => {
  console.log(`Trippy API http://localhost:${PORT}`);
});
