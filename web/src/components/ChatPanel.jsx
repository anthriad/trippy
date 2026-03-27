import { useEffect, useMemo, useRef, useState } from 'react'

function coerceMessageContent(content) {
  if (content == null) return ''
  if (typeof content === 'string') return content
  try {
    return JSON.stringify(content, null, 2)
  } catch {
    return String(content)
  }
}

function renderContentAsParagraphs(text) {
  const lines = String(text).split('\n')
  return lines.map((line, idx) => <p key={idx}>{line || '\u00A0'}</p>)
}

export default function ChatPanel({
  messages,
  onSend,
  disabled,
  statusText,
}) {
  const [draft, setDraft] = useState('')
  const listRef = useRef(null)

  const normalizedMessages = useMemo(() => {
    return Array.isArray(messages) ? messages : []
  }, [messages])

  useEffect(() => {
    // Keep the newest message in view.
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [normalizedMessages.length])

  function submit(e) {
    e?.preventDefault?.()
    const text = draft.trim()
    if (!text || disabled) return
    setDraft('')
    onSend?.(text)
  }

  return (
    <div className="trip-results-chat-panel">
      <div className="trip-results-chat-header">
        <div>
          <strong className="trip-results-chat-title">Chat</strong>
          {statusText ? (
            <div className="trip-results-chat-subtitle">{statusText}</div>
          ) : null}
        </div>
      </div>

      <div className="trip-results-chat-messages" ref={listRef} role="log">
        {normalizedMessages.length === 0 ? (
          <div className="trip-results-chat-empty">
            No messages yet. Ask for updates or edits to your plan.
          </div>
        ) : null}

        {normalizedMessages.map((m) => {
          const role = m?.role === 'user' ? 'user' : 'assistant'
          const content = coerceMessageContent(m?.content)
          return (
            <div
              key={m?.id || `${role}-${m?.timestamp || ''}-${content.slice(0, 12)}`}
              className={
                role === 'user'
                  ? 'trip-chat-bubble trip-chat-bubble-user'
                  : 'trip-chat-bubble trip-chat-bubble-assistant'
              }
            >
              {renderContentAsParagraphs(content)}
            </div>
          )
        })}
      </div>

      <form className="trip-results-chat-input-row" onSubmit={submit}>
        <input
          className="trip-results-chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={disabled ? 'Loading…' : 'Type a message…'}
          disabled={disabled}
        />
        <button className="trip-results-chat-send" type="submit" disabled={disabled}>
          Send
        </button>
      </form>
    </div>
  )
}

