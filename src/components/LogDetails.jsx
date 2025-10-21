import React, { useState } from 'react'
import './LogDetails.css'

const LogDetails = ({ log, searchQuery = '' }) => {
  const [copied, setCopied] = useState(false)

  if (!log) {
    return (
      <div className="log-details empty">
        <div className="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <h3>No log selected</h3>
          <p>Click on a log in the timeline to view details</p>
        </div>
      </div>
    )
  }

  const formatTimestamp = (timestamp) => {
    // Just return the timestamp as-is (it's already in the format we want)
    // e.g. "2025-10-15T07:33:22.667" or "2025-10-15T07:28:13.209195172+00:00"
    return timestamp
  }

  const handleCopy = () => {
    const logCopy = { ...log }
    delete logCopy._path
    delete logCopy._timestamp

    navigator.clipboard.writeText(JSON.stringify(logCopy, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Parse search query to extract all search terms (handles AND/OR and parentheses)
  const getSearchTerms = (query) => {
    if (!query.trim()) return []

    const terms = []
    // Extract quoted phrases
    const quotedPhrases = query.match(/"([^"]+)"/g) || []
    quotedPhrases.forEach(phrase => {
      terms.push(phrase.replace(/"/g, '').toLowerCase())
    })

    // Remove quoted phrases and parentheses, split by AND/OR to get individual terms
    let remaining = query
    quotedPhrases.forEach(phrase => {
      remaining = remaining.replace(phrase, '')
    })

    // Remove parentheses and operators, get remaining words
    const words = remaining.replace(/[()]/g, ' ').split(/\s+/i)
    words.forEach(word => {
      const cleaned = word.trim().toLowerCase()
      if (cleaned && cleaned !== 'and' && cleaned !== 'or' && !terms.includes(cleaned)) {
        terms.push(cleaned)
      }
    })

    return terms.filter(t => t.length > 0)
  }

  // Highlight search matches in text
  const highlightText = (text) => {
    if (!searchQuery.trim() || typeof text !== 'string') {
      return text
    }

    const terms = getSearchTerms(searchQuery)
    if (terms.length === 0) return text

    const lowerText = text.toLowerCase()

    // Find all match positions for all terms
    const matches = []
    terms.forEach(term => {
      let index = 0
      while ((index = lowerText.indexOf(term, index)) !== -1) {
        matches.push({ start: index, end: index + term.length })
        index++
      }
    })

    if (matches.length === 0) return text

    // Sort matches by start position
    matches.sort((a, b) => a.start - b.start)

    // Merge overlapping matches
    const merged = []
    matches.forEach(match => {
      if (merged.length === 0) {
        merged.push(match)
      } else {
        const last = merged[merged.length - 1]
        if (match.start <= last.end) {
          // Overlapping - extend the last match
          last.end = Math.max(last.end, match.end)
        } else {
          merged.push(match)
        }
      }
    })

    // Build highlighted text
    const parts = []
    let currentIndex = 0

    merged.forEach((match, idx) => {
      // Add text before match
      if (match.start > currentIndex) {
        parts.push(text.substring(currentIndex, match.start))
      }

      // Add highlighted match
      parts.push(
        <mark key={`match-${idx}`} className="search-highlight">
          {text.substring(match.start, match.end)}
        </mark>
      )

      currentIndex = match.end
    })

    // Add remaining text
    if (currentIndex < text.length) {
      parts.push(text.substring(currentIndex))
    }

    return <>{parts}</>
  }

  // Helper function to check if a string is valid JSON
  const isValidJSON = (str) => {
    if (typeof str !== 'string') return false
    const trimmed = str.trim()
    if (!((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']')))) {
      return false
    }
    try {
      JSON.parse(trimmed)
      return true
    } catch (e) {
      return false
    }
  }

  // Remove JSON/Array strings from raw message for cleaner display
  const stripJSONFromMessage = (message) => {
    if (!message) return message

    let result = message
    let changed = true

    // Keep removing JSON until no more found (handles nested structures)
    while (changed) {
      const before = result
      // Remove JSON objects
      result = result.replace(/\{(?:[^{}]|(?:\{[^{}]*\}))*\}/g, '[JSON]')
      // Remove arrays
      result = result.replace(/\[(?:[^\[\]]|(?:\[[^\[\]]*\]))*\]/g, '[ARRAY]')
      changed = (before !== result && result.includes('{')) || (before !== result && result.includes('['))
    }

    // Clean up multiple consecutive [JSON] or [ARRAY] markers
    result = result.replace(/(\[JSON\]\s*)+/g, '[JSON] ')
    result = result.replace(/(\[ARRAY\]\s*)+/g, '[ARRAY] ')

    return result
  }

  // Helper function to recursively parse stringified JSON
  const deepParseJSON = (value) => {
    if (value === null || value === undefined) {
      return value
    }

    // If it's a string, try to parse it as JSON
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          const parsed = JSON.parse(trimmed)
          // Recursively parse the result
          return deepParseJSON(parsed)
        } catch (e) {
          // Not valid JSON, return as-is
          return value
        }
      }
      return value
    }

    // If it's an array, recursively parse each element
    if (Array.isArray(value)) {
      return value.map(item => deepParseJSON(item))
    }

    // If it's an object, recursively parse each property
    if (typeof value === 'object') {
      const result = {}
      for (const key in value) {
        if (value.hasOwnProperty(key)) {
          result[key] = deepParseJSON(value[key])
        }
      }
      return result
    }

    return value
  }

  const renderValue = (value, depth = 0) => {
    const indent = '  '.repeat(depth)
    const nextIndent = '  '.repeat(depth + 1)

    if (value === null) return <span className="null">null</span>
    if (value === undefined) return <span className="undefined">undefined</span>
    if (typeof value === 'boolean') return <span className="boolean">{value.toString()}</span>
    if (typeof value === 'number') return <span className="number">{value}</span>
    if (typeof value === 'string') {
      // Check if it's a URL
      if (value.startsWith('http://') || value.startsWith('https://')) {
        return <a href={value} target="_blank" rel="noopener noreferrer" className="link">{highlightText(value)}</a>
      }

      return <span className="string">"{highlightText(value)}"</span>
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return <span className="array">[]</span>

      return (
        <>
          <span className="bracket">[</span>
          {'\n'}
          {value.map((item, index) => (
            <React.Fragment key={index}>
              {nextIndent}
              {renderValue(item, depth + 1)}
              {index < value.length - 1 && <span>,</span>}
              {'\n'}
            </React.Fragment>
          ))}
          {indent}
          <span className="bracket">]</span>
        </>
      )
    }

    if (typeof value === 'object') {
      const keys = Object.keys(value)
      if (keys.length === 0) return <span className="object">{'{}'}</span>

      return (
        <>
          <span className="bracket">{'{'}</span>
          {'\n'}
          {keys.map((key, index) => (
            <React.Fragment key={key}>
              {nextIndent}
              <span className="key">"{highlightText(key)}"</span>
              <span className="colon">: </span>
              {renderValue(value[key], depth + 1)}
              {index < keys.length - 1 && <span>,</span>}
              {'\n'}
            </React.Fragment>
          ))}
          {indent}
          <span className="bracket">{'}'}</span>
        </>
      )
    }

    return <span>{String(value)}</span>
  }

  // Render value with JSON formatting for objects
  const renderSummaryValue = (value) => {
    if (typeof value === 'object' && value !== null) {
      return (
        <pre className="summary-json">
          {renderValue(value)}
        </pre>
      )
    }
    return <span className="summary-value">{value}</span>
  }

  // Render parsed log summary
  const renderSummary = () => {
    if (!log.tag) return null

    return (
      <div className="log-summary">
        <div className="summary-row">
          <span className="summary-label">Service:</span>
          <span className="summary-value">{highlightText(log.service || 'N/A')}</span>
        </div>
        <div className="summary-row">
          <span className="summary-label">Level:</span>
          <span className={`summary-value level-${(log.level || 'info').toLowerCase()}`}>{highlightText(log.level || 'N/A')}</span>
        </div>
        <div className="summary-row">
          <span className="summary-label">Type:</span>
          <span className="summary-value">{highlightText(log.type || 'N/A')}</span>
        </div>
        <div className="summary-row">
          <span className="summary-label">Tag:</span>
          <span className="summary-value">{highlightText(log.tag)}</span>
        </div>

        {/* specific fields */}
        {log.requestId && (
          <div className="summary-row">
            <span className="summary-label">Request ID:</span>
            <span className="summary-value mono">{highlightText(log.requestId)}</span>
          </div>
        )}

        {/* specific fields */}
        {log.sessionId && (
          <div className="summary-row">
            <span className="summary-label">Session ID:</span>
            <span className="summary-value mono">{highlightText(log.sessionId)}</span>
          </div>
        )}
        {log.deviceId && (
          <div className="summary-row">
            <span className="summary-label">Device ID:</span>
            <span className="summary-value mono">{highlightText(log.deviceId)}</span>
          </div>
        )}
        {log.cartId && (
          <div className="summary-row">
            <span className="summary-label">Cart ID:</span>
            <span className="summary-value mono">{highlightText(log.cartId)}</span>
          </div>
        )}
        {log.url && (
          <div className="summary-row">
            <span className="summary-label">URL:</span>
            <span className="summary-value">{highlightText(log.url)}</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="log-details">
      <div className="log-details-header">
        <button className="copy-btn" onClick={handleCopy}>
          {copied ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M20 6L9 17l-5-5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Copy JSON
            </>
          )}
        </button>
      </div>

      {renderSummary()}

      <div className="log-content">
        {log._rawMessage && (
          <>
            <h3 className="section-title">Raw Message</h3>
            <pre className="raw-message">
              {highlightText(stripJSONFromMessage(log._rawMessage))}
            </pre>
          </>
        )}

        {log.data && isValidJSON(log.data) && (
          <>
            <h3 className="section-title">Parsed Data (JSON)</h3>
            <pre className="json-viewer">
              {renderValue(deepParseJSON(log.data))}
            </pre>
          </>
        )}

        {log._podName && (
          <>
            <h3 className="section-title">Metadata</h3>
            <div className="metadata-fields">
              <div className="metadata-row">
                <span className="metadata-label">Pod Name:</span>
                <span className="metadata-value">{highlightText(log._podName)}</span>
              </div>
              {log._kibanaTimestamp && (
                <div className="metadata-row">
                  <span className="metadata-label">Kibana Timestamp:</span>
                  <span className="metadata-value">{highlightText(log._kibanaTimestamp)}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default LogDetails
