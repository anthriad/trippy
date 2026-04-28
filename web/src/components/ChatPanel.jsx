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

function renderLineContent(line) {
  const match = line.match(/^([^:]{2,50}):\s*(.+)$/)
  if (!match) return line
  const label = match[1].trim()
  const value = match[2].trim()
  const normalizedLabel = label.toLowerCase()
  const highlightableLabelFragments = [
    'recommendation',
    'restaurant',
    'cafe',
    'spot',
    'tip',
    'price',
    'budget',
    'logistics',
    'getting around',
    'location',
    'area',
  ]
  const shouldHighlightLabel = highlightableLabelFragments.some((fragment) =>
    normalizedLabel.includes(fragment),
  )
  return (
    <>
      <strong className={shouldHighlightLabel ? 'trip-chat-label-hot' : undefined}>
        {label}:
      </strong>{' '}
      {value}
    </>
  )
}

function renderAnimatedEllipsisText(text) {
  const value = String(text ?? '')
  const match = value.match(/^(.*?)(?:\.\.\.|…)$/)
  if (!match) return value
  const base = match[1]
  return (
    <>
      <span>{base}</span>
      <span className="trip-chat-thinking-dots" aria-hidden>
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </span>
    </>
  )
}

function renderContentAsParagraphs(text) {
  if (String(text).trim() === 'Thinking...') {
    return (
      <p className="trip-chat-thinking" key="thinking">
        <span>Thinking</span>
        <span className="trip-chat-thinking-dots" aria-hidden>
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </p>
    )
  }
  const lines = String(text).split('\n')
  return lines.map((line, idx) => {
    const trimmed = line.trim()
    if (!trimmed) return <p key={idx}>{'\u00A0'}</p>

    if (trimmed.startsWith('• ')) {
      const bulletText = trimmed.slice(2).trim()
      return (
        <p key={idx} className="trip-chat-bullet-line">
          <span className="trip-chat-bullet-dot" aria-hidden>
            •
          </span>
          <span>{renderLineContent(bulletText)}</span>
        </p>
      )
    }

    return <p key={idx}>{renderLineContent(trimmed)}</p>
  })
}

function getDisplayContent(message) {
  if (message?.isPlannerSeed) {
    return 'Trip brief sent automatically from your planner choices.'
  }
  if (message?.role === 'assistant' && message?.isStreaming && !message?.content) {
    return 'Thinking...'
  }
  return coerceMessageContent(message?.content)
}

export default function ChatPanel({
  messages,
  onSend,
  disabled,
  statusText,
  headerAction = null,
  /** e.g. missing GEMINI_API_KEY — shown under the tagline */
  configWarning,
  /** Main heading (e.g. "Trippy") */
  title = 'Trippy',
  /** One line under the title, e.g. "AI travel agent" */
  tagline = 'AI travel agent',
  /** Shown when there are no messages yet */
  emptyHint = 'Ask Trippy to refine the plan, swap activities, or explain options for this trip.',
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
          <div className="trip-results-chat-title-row">
            <strong className="trip-results-chat-title">{title}</strong>
            <span className="trip-results-agent-badge" aria-hidden>
              Agent
            </span>
          </div>
          <div className="trip-results-chat-tagline">{tagline}</div>
          {configWarning ? (
            <div className="trip-results-chat-config-warn" role="alert">
              {configWarning}
            </div>
          ) : null}
          {statusText ? (
            <div className="trip-results-chat-subtitle">
              {renderAnimatedEllipsisText(statusText)}
            </div>
          ) : null}
        </div>
        {headerAction ? <div>{headerAction}</div> : null}
      </div>

      <div className="trip-results-chat-messages" ref={listRef} role="log">
        {normalizedMessages.length === 0 ? (
          <div className="trip-results-chat-empty">{emptyHint}</div>
        ) : null}

        {normalizedMessages.map((m) => {
          const role = m?.role === 'user' ? 'user' : 'assistant'
          const content = getDisplayContent(m)
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
          placeholder={
            disabled ? (statusText || 'Waiting for reply…') : 'Message Trippy…'
          }
          disabled={disabled}
        />
        <button className="trip-results-chat-send" type="submit" disabled={disabled}>
          Send
        </button>
      </form>
    </div>
  )
}

