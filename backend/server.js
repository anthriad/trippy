import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import {
  invokeTrippyWithRetries,
  streamTrippyWithRetries,
  toLangChainMessages,
  chunkText,
} from "../gemini-agent/trippyCore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(String(process.env.GEMINI_API_KEY || "").trim()),
  });
});

function validateChatBody(body) {
  const messages = body?.messages;

  if (!Array.isArray(messages) || messages.length === 0) {
    return "messages must be a non-empty array of { role, content }";
  }

  for (const m of messages) {
    if (m?.role !== "user" && m?.role !== "assistant") {
      return 'each message needs role "user" or "assistant"';
    }
    if (typeof m?.content !== "string") {
      return "each message needs a string content";
    }
  }

  if (messages[messages.length - 1].role !== "user") {
    return "last message must be from the user";
  }

  return null;
}

app.post("/api/chat", async (req, res) => {
  const err = validateChatBody(req.body);
  if (err) {
    res.status(400).json({ error: err });
    return;
  }

  try {
    const lcMessages = toLangChainMessages(req.body.messages);
    const response = await invokeTrippyWithRetries(lcMessages);

    const content =
      typeof response.content === "string"
        ? response.content
        : chunkText(response);

    res.json({ message: { role: "assistant", content } });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: e instanceof Error ? e.message : "Chat failed",
    });
  }
});

app.post("/api/chat/stream", async (req, res) => {
  const err = validateChatBody(req.body);
  if (err) {
    res.status(400).json({ error: err });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  try {
    const lcMessages = toLangChainMessages(req.body.messages);
    await streamTrippyWithRetries(lcMessages, (text) => {
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    });

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "Chat failed";
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`Trippy API http://localhost:${PORT}`);
});
