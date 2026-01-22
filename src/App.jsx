import React, { useState, useRef, useEffect, useCallback } from 'react'
import './App.css'
import Timeline from './components/Timeline'
import LogDetails from './components/LogDetails'
import FileUpload from './components/FileUpload'
import Footer from './components/Footer'

function App() {
  const [allLogs, setAllLogs] = useState([]) // All logs from file
  const [logs, setLogs] = useState([]) // Filtered logs
  const [selectedLog, setSelectedLog] = useState(null)
  const [fileName, setFileName] = useState(null)
  const [timeFilter, setTimeFilter] = useState({ start: '', end: '' })
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [searchMatches, setSearchMatches] = useState([]) // Indices of matching logs
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1) // Current position in matches
  const [showOnlyMatches, setShowOnlyMatches] = useState(false) // Toggle between show all vs show only matches
  const [showMatchInput, setShowMatchInput] = useState(false) // Show input to manually enter match number
  const timelineRef = useRef(null)
  const matchInputRef = useRef(null)
  const [showHelp, setShowHelp] = useState(false)

  const parseMessageTimestamp = (message) => {
    const aliceMatch = message.match(/^\d+:\|(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+)[+-]\d{2}:\d{2}\|/)
    if (aliceMatch) {
      // Return timestamp WITHOUT timezone
      return aliceMatch[1]
    }

    const bobMatch = message.match(/at (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+)/)
    if (bobMatch) {
      // Return as-is with space replaced by 'T' for valid ISO format
      return bobMatch[1].replace(' ', 'T')
    }

    return null
  }

  const parseLogMessage = (message) => {
    const aliceMatch = message.match(/^(\d+):\|[^|]+\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]*)\|([^|]*)\|([^|]+)\|([^|]+)\|([^|]+)\|(.+)$/)
    if (aliceMatch) {
      const [_, lineNum, deviceId, sessionId, service, url, cartId, source, level, type, tagAndData] = aliceMatch

      // Split tag and data
      const colonIndex = tagAndData.indexOf(':')
      const tag = colonIndex > 0 ? tagAndData.substring(0, colonIndex) : tagAndData
      const data = colonIndex > 0 ? tagAndData.substring(colonIndex + 1) : null

      return {
        lineNum,
        deviceId,
        sessionId,
        service,
        url,
        cartId,
        source,
        level,
        type,
        tag,
        data,
        format: 'NIMBLE'
      }
    }

    const parts = message.split(' | ')
    if (parts.length < 10) return null

    const lineNum = parts[0]
    const requestId = parts[1]
    const traceId = parts[2]
    const spanId = parts[3]
    const url = parts[4]
    const podName = parts[5]
    const service = parts[6]
    const level = parts[7]
    const type = parts[8]
    const tag = parts[9]

    // Everything after tag contains data and timestamp
    const remainder = parts.slice(10).join(' | ')
    const atIndex = remainder.lastIndexOf(' at ')
    const data = atIndex > 0 ? remainder.substring(0, atIndex).trim() : remainder

    return {
      lineNum,
      requestId,
      traceId,
      spanId,
      url,
      podName,
      service,
      level,
      type,
      tag,
      data,
      format: 'VAYU'
    }
  }

  const parseLogs = async (jsonData) => {
    try {
      setIsLoading(true)
      setLoadingProgress(10)

      const parsed = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData
      setLoadingProgress(30)

      const logEntries = []

      // Check if this is Elasticsearch/Kibana format
      if (parsed.rawResponse && parsed.rawResponse.hits && parsed.rawResponse.hits.hits) {
        const hits = parsed.rawResponse.hits.hits
        console.log(`Total logs in file: ${hits.length}`)

        let skippedNoSource = 0
        let skippedNoTimestamp = 0
        const batchSize = 500

        // Process in batches to avoid blocking UI
        for (let i = 0; i < hits.length; i += batchSize) {
          const batch = hits.slice(i, i + batchSize)

          batch.forEach((hit, batchIndex) => {
            const index = i + batchIndex
            const source = hit._source
            if (!source || !source.message) {
              skippedNoSource++
              return
            }

            // Extract timestamp from message, fallback to Kibana timestamp
            let timestamp = parseMessageTimestamp(source.message)
            if (!timestamp && source.timestamp) {
              timestamp = source.timestamp
            }
            if (!timestamp) {
              skippedNoTimestamp++
              return
            }

            // Parse the pipe-delimited message
            const parsed = parseLogMessage(source.message)

            logEntries.push({
              _index: index,
              _id: hit._id,
              _timestamp: timestamp,
              _rawMessage: source.message,
              _podName: source.pod_name,
              _kibanaTimestamp: source.timestamp,
              ...parsed,
              _fullSource: source
            })
          })

          // Update progress
          setLoadingProgress(30 + (i / hits.length) * 40)

          // Yield to browser for UI updates
          await new Promise(resolve => setTimeout(resolve, 0))
        }

        console.log(`Skipped ${skippedNoSource} logs with no source/message`)
        console.log(`Skipped ${skippedNoTimestamp} logs with no timestamp`)
      } else {
        // Fallback to old parsing logic for other formats
        const extractLogs = (obj, path = '') => {
          if (!obj || typeof obj !== 'object') return

          if (obj.timestamp || obj.time || obj.date) {
            logEntries.push({
              ...obj,
              _path: path,
              _timestamp: obj.timestamp || obj.time || obj.date
            })
          }

          Object.keys(obj).forEach(key => {
            const value = obj[key]
            if (typeof value === 'object' && value !== null) {
              extractLogs(value, path ? `${path}.${key}` : key)
            }
          })
        }

        extractLogs(parsed)
      }

      // Sort by timestamp with special handling for alice logs
      setLoadingProgress(70)

      // Debug: Check some sample timestamps
      const aliceSample = logEntries.find(log => log.format === 'alice')
      const bobSample = logEntries.find(log => log.format === 'bob')
      if (aliceSample && bobSample) {
        console.log('alice timestamp:', aliceSample._timestamp, '→', new Date(aliceSample._timestamp).getTime())
        console.log('bob timestamp:', bobSample._timestamp, '→', new Date(bobSample._timestamp).getTime())
      }

      logEntries.sort((a, b) => {
        const timeA = new Date(a._timestamp).getTime()
        const timeB = new Date(b._timestamp).getTime()

        // If times are equal up to milliseconds (3 decimal places)
        if (timeA === timeB) {
          const isaliceA = a.format === 'alice'
          const isaliceB = b.format === 'alice'

          if (isaliceA && !isaliceB) return -1
          if (!isaliceA && isaliceB) return 1
        }

        return timeA - timeB
      })

      setLoadingProgress(90)
      setAllLogs(logEntries)
      setLogs(logEntries)
      console.log(`Parsed ${logEntries.length} logs`)
      setLoadingProgress(100)

      // Hide loading after a brief moment
      setTimeout(() => setIsLoading(false), 500)
    } catch (error) {
      console.error('Error parsing logs:', error)
      alert('Error parsing JSON file. Please check the format.')
      setIsLoading(false)
    }
  }

  const handleFileUpload = (file) => {
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      parseLogs(e.target.result)
    }
    reader.readAsText(file)
  }

  const applyFilters = (logsToFilter = allLogs) => {
    let filtered = logsToFilter

    // Apply time filter
    if (timeFilter.start || timeFilter.end) {
      filtered = filtered.filter(log => {
        const logTime = new Date(log._timestamp).getTime()

        if (timeFilter.start && timeFilter.end) {
          const startTime = new Date(timeFilter.start).getTime()
          const endTime = new Date(timeFilter.end).getTime()
          return logTime >= startTime && logTime <= endTime
        }

        if (timeFilter.start) {
          const startTime = new Date(timeFilter.start).getTime()
          return logTime >= startTime
        }

        if (timeFilter.end) {
          const endTime = new Date(timeFilter.end).getTime()
          return logTime <= endTime
        }

        return true
      })
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(log => {
        const logString = JSON.stringify(log).toLowerCase()
        return logString.includes(query)
      })
    }

    setLogs(filtered)
    console.log(`Filtered to ${filtered.length} logs (from ${allLogs.length})`)
  }

  const handleTimeFilter = () => {
    applyFilters()
  }

  const handleSearch = (e) => {
    const query = e.target.value
    setSearchQuery(query)
  }

  // Parse and evaluate complex search queries with parentheses
  const evaluateSearchQuery = (query, logString) => {
    if (!query.trim()) return false

    // Replace quoted phrases with placeholders
    const quotedPhrases = []
    let workingQuery = query.replace(/"([^"]+)"/g, (match, phrase) => {
      quotedPhrases.push(phrase)
      return `__PHRASE_${quotedPhrases.length - 1}__`
    })

    // Tokenize the query
    const tokens = []
    let current = ''

    for (let i = 0; i < workingQuery.length; i++) {
      const char = workingQuery[i]

      if (char === '(' || char === ')') {
        if (current.trim()) {
          tokens.push(current.trim())
          current = ''
        }
        tokens.push(char)
      } else if (char === ' ' || char === '\t') {
        if (current.trim()) {
          tokens.push(current.trim())
          current = ''
        }
      } else {
        current += char
      }
    }
    if (current.trim()) {
      tokens.push(current.trim())
    }

    // Replace phrase placeholders back
    const finalTokens = tokens.map(token => {
      if (token.startsWith('__PHRASE_')) {
        const index = parseInt(token.match(/__PHRASE_(\d+)__/)[1])
        return quotedPhrases[index].toLowerCase()
      }
      return token
    })

    // Evaluate the expression recursively
    const evaluate = (tokens, startIdx = 0) => {
      let result = null
      let operator = null
      let i = startIdx

      while (i < tokens.length) {
        const token = tokens[i]

        if (token === '(') {
          // Find matching closing parenthesis
          let depth = 1
          let j = i + 1
          while (j < tokens.length && depth > 0) {
            if (tokens[j] === '(') depth++
            if (tokens[j] === ')') depth--
            j++
          }

          // Evaluate the parenthesized expression
          const subResult = evaluate(tokens.slice(i + 1, j - 1), 0)

          if (result === null) {
            result = subResult
          } else if (operator === 'AND') {
            result = result && subResult
            operator = null
          } else if (operator === 'OR') {
            result = result || subResult
            operator = null
          }

          i = j
        } else if (token === ')') {
          // This shouldn't happen in well-formed queries
          i++
        } else if (token.toUpperCase() === 'AND') {
          operator = 'AND'
          i++
        } else if (token.toUpperCase() === 'OR') {
          operator = 'OR'
          i++
        } else {
          // It's a search term
          const termMatch = logString.includes(token.toLowerCase())

          if (result === null) {
            result = termMatch
          } else if (operator === 'AND') {
            result = result && termMatch
            operator = null
          } else if (operator === 'OR') {
            result = result || termMatch
            operator = null
          } else {
            // No operator means AND by default
            result = result && termMatch
          }

          i++
        }
      }

      return result !== null ? result : false
    }

    return evaluate(finalTokens)
  }

  // Extract all search terms for highlighting (flattens complex queries)
  const extractSearchTerms = (query) => {
    const terms = []
    const quotedPhrases = query.match(/"([^"]+)"/g) || []

    quotedPhrases.forEach(phrase => {
      terms.push(phrase.replace(/"/g, '').toLowerCase())
    })

    let remaining = query
    quotedPhrases.forEach(phrase => {
      remaining = remaining.replace(phrase, '')
    })

    // Remove operators and parentheses, get remaining words
    const words = remaining.replace(/[()]/g, ' ').split(/\s+/i)
    words.forEach(word => {
      const cleaned = word.trim().toLowerCase()
      if (cleaned && cleaned !== 'and' && cleaned !== 'or' && !terms.includes(cleaned)) {
        terms.push(cleaned)
      }
    })

    return terms.filter(t => t.length > 0)
  }

  const handleSearchSubmit = () => {
    if (!searchQuery.trim()) {
      setSearchMatches([])
      setCurrentMatchIndex(-1)
      applyFilters()
      return
    }

    // Find all matching log indices using complex query evaluation
    const matches = []
    allLogs.forEach((log, index) => {
      const logString = JSON.stringify(log).toLowerCase()
      if (evaluateSearchQuery(searchQuery, logString)) {
        matches.push(index)
      }
    })

    setSearchMatches(matches)
    setCurrentMatchIndex(matches.length > 0 ? 0 : -1)

    // Show all logs or only matches based on toggle
    if (showOnlyMatches) {
      const matchedLogs = matches.map(index => allLogs[index])
      setLogs(matchedLogs)
    } else {
      setLogs(allLogs)
    }

    // Select and scroll to first match
    if (matches.length > 0) {
      setSelectedLog(allLogs[matches[0]])
      // Notify Timeline to scroll to this log
      if (timelineRef.current) {
        timelineRef.current.scrollToLog(showOnlyMatches ? 0 : matches[0])
      }
    }

    console.log(`Found ${matches.length} matches for "${searchQuery}"`)
  }

  const handleNextMatch = useCallback(() => {
    if (searchMatches.length === 0) return

    const nextIndex = (currentMatchIndex + 1) % searchMatches.length
    setCurrentMatchIndex(nextIndex)

    const logIndex = searchMatches[nextIndex]
    setSelectedLog(allLogs[logIndex])

    if (timelineRef.current) {
      // In "show only matches" mode, scroll to the index in filtered logs
      // In "show all" mode, scroll to the original index in all logs
      timelineRef.current.scrollToLog(showOnlyMatches ? nextIndex : logIndex)
    }
  }, [searchMatches, currentMatchIndex, allLogs, showOnlyMatches])

  const handlePreviousMatch = useCallback(() => {
    if (searchMatches.length === 0) return

    const prevIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length
    setCurrentMatchIndex(prevIndex)

    const logIndex = searchMatches[prevIndex]
    setSelectedLog(allLogs[logIndex])

    if (timelineRef.current) {
      // In "show only matches" mode, scroll to the index in filtered logs
      // In "show all" mode, scroll to the original index in all logs
      timelineRef.current.scrollToLog(showOnlyMatches ? prevIndex : logIndex)
    }
  }, [searchMatches, currentMatchIndex, allLogs, showOnlyMatches])

  const handleToggleShowMode = () => {
    const newMode = !showOnlyMatches
    setShowOnlyMatches(newMode)

    // Re-apply the search with new mode
    if (searchMatches.length > 0) {
      if (newMode) {
        // Switch to "show only matches"
        const matchedLogs = searchMatches.map(index => allLogs[index])
        setLogs(matchedLogs)
      } else {
        // Switch to "show all"
        setLogs(allLogs)
      }

      // Scroll to current match
      if (timelineRef.current && currentMatchIndex >= 0) {
        const logIndex = searchMatches[currentMatchIndex]
        timelineRef.current.scrollToLog(newMode ? currentMatchIndex : logIndex)
      }
    }
  }

  const handleGoToMatch = (matchNumber) => {
    if (searchMatches.length === 0) return

    const index = matchNumber - 1 // Convert 1-based to 0-based
    if (index < 0 || index >= searchMatches.length) return

    setCurrentMatchIndex(index)
    const logIndex = searchMatches[index]
    setSelectedLog(allLogs[logIndex])

    if (timelineRef.current) {
      timelineRef.current.scrollToLog(showOnlyMatches ? index : logIndex)
    }
  }

  const handleResetFilter = () => {
    setTimeFilter({ start: '', end: '' })
    setSearchQuery('')
    setSearchMatches([])
    setCurrentMatchIndex(-1)
    setLogs(allLogs)
  }

  const handleExportLogs = () => {
    const dataStr = JSON.stringify(logs, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `logs-export-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Keyboard shortcuts - defined after the handler functions
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger shortcuts if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return
      }

      // ESC - Clear selection or close help
      if (e.key === 'Escape') {
        if (showHelp) {
          setShowHelp(false)
        } else if (selectedLog) {
          setSelectedLog(null)
        }
        return
      }

      // ? - Show help
      if (e.key === '?' && !showHelp) {
        e.preventDefault()
        setShowHelp(true)
        return
      }

      // Arrow keys for search navigation
      if (searchMatches.length > 0) {
        if (e.key === 'ArrowRight' || e.key === 'n') {
          e.preventDefault()
          handleNextMatch()
        } else if (e.key === 'ArrowLeft' || e.key === 'p') {
          e.preventDefault()
          handlePreviousMatch()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedLog, showHelp, searchMatches.length, currentMatchIndex, handleNextMatch, handlePreviousMatch])

  return (
    <div className="app">
      {/* Help Modal */}
      {showHelp && (
        <div className="modal-overlay" onClick={() => setShowHelp(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Keyboard Shortcuts & Help</h2>
              <button className="modal-close" onClick={() => setShowHelp(false)} aria-label="Close help">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M18 6L6 18M6 6l12 12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="help-section">
                <h3>Keyboard Shortcuts</h3>
                <div className="shortcut-list">
                  <div className="shortcut-item">
                    <kbd>?</kbd>
                    <span>Show this help dialog</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>ESC</kbd>
                    <span>Close dialog or clear selection</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>→</kbd> or <kbd>n</kbd>
                    <span>Next search match</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>←</kbd> or <kbd>p</kbd>
                    <span>Previous search match</span>
                  </div>
                </div>
              </div>

              <div className="help-section">
                <h3>Search Tips</h3>
                <ul>
                  <li>Use <code>AND</code> for matching all terms</li>
                  <li>Use <code>OR</code> for matching any term</li>
                  <li>Use quotes for exact phrases: <code>"error message"</code></li>
                  <li>Use parentheses for complex queries: <code>(error OR warn) AND payment</code></li>
                </ul>
              </div>

              <div className="help-section">
                <h3>Features</h3>
                <ul>
                  <li>Drag the timeline to scroll horizontally</li>
                  <li>Click any log box to view details</li>
                  <li>Use time filters to narrow down logs</li>
                  <li>Export filtered logs to JSON</li>
                  <li>Toggle between showing all logs or only matches</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-content">
            <div className="loading-spinner"></div>
            <h2>Loading logs...</h2>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${loadingProgress}%` }}></div>
            </div>
            <p>{Math.round(loadingProgress)}%</p>
          </div>
        </div>
      )}

      <header className="app-header">
        <div className="header-left">
          <h1>Log Viewer - Timeline</h1>
          {fileName && <span className="file-name" role="status" aria-live="polite">File: {fileName}</span>}
        </div>

        <div className="header-actions">
          <button 
            className="help-btn" 
            onClick={() => setShowHelp(true)} 
            title="Keyboard shortcuts (Press ?)"
            aria-label="Show help and keyboard shortcuts"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <circle cx="12" cy="12" r="10" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {allLogs.length > 0 && (
            <button 
              className="export-btn" 
              onClick={handleExportLogs}
              title="Export filtered logs to JSON"
              aria-label={`Export ${logs.length} logs to JSON`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Export ({logs.length})
            </button>
          )}
        </div>

        {allLogs.length > 0 && (
          <div className="filters-container">
            <div className="search-filter">
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearch}
                onKeyPress={(e) => e.key === 'Enter' && handleSearchSubmit()}
                placeholder='Search: (alice AND nav) OR (bob AND "verifyPayment") OR createpayment'
                className="search-input"
              />
              <button onClick={handleSearchSubmit} className="search-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle cx="11" cy="11" r="8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="m21 21-4.35-4.35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Search
              </button>

              {searchMatches.length > 0 && (
                <>
                  <div className="search-navigation">
                    <span className="match-count">
                      {showMatchInput ? (
                        <input
                          ref={matchInputRef}
                          type="number"
                          min="1"
                          max={searchMatches.length}
                          defaultValue={currentMatchIndex + 1}
                          className="match-number-input"
                          autoFocus
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              const value = parseInt(e.target.value)
                              if (!isNaN(value)) {
                                handleGoToMatch(value)
                              }
                              setShowMatchInput(false)
                            }
                          }}
                          onBlur={() => setShowMatchInput(false)}
                        />
                      ) : (
                        <span
                          className="match-number"
                          onDoubleClick={() => setShowMatchInput(true)}
                          title="Double-click to enter match number"
                        >
                          {currentMatchIndex + 1}
                        </span>
                      )}
                      {' '}of {searchMatches.length}
                    </span>
                    <button onClick={handlePreviousMatch} className="nav-btn" title="Previous match (◀)">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M15 18l-6-6 6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    <button onClick={handleNextMatch} className="nav-btn" title="Next match (▶)">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M9 18l6-6-6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>

                  <button
                    onClick={handleToggleShowMode}
                    className={`toggle-mode-btn ${showOnlyMatches ? 'active' : ''}`}
                    title={showOnlyMatches ? 'Show all logs' : 'Show only matches'}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      {showOnlyMatches ? (
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 100 6 3 3 0 000-6z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      ) : (
                        <path d="M3 6h18 M3 12h18 M3 18h18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      )}
                    </svg>
                    {showOnlyMatches ? 'Show All' : 'Only Matches'}
                  </button>
                </>
              )}
            </div>

            <div className="time-filter">
              <label>Time:</label>
              <input
                type="datetime-local"
                step="0.001"
                value={timeFilter.start}
                onChange={(e) => setTimeFilter({ ...timeFilter, start: e.target.value })}
                placeholder="Start time"
              />
              <span>to</span>
              <input
                type="datetime-local"
                step="0.001"
                value={timeFilter.end}
                onChange={(e) => setTimeFilter({ ...timeFilter, end: e.target.value })}
                placeholder="End time"
              />
              <button onClick={handleTimeFilter} className="filter-btn">Apply</button>
              <button onClick={handleResetFilter} className="reset-btn">Reset All</button>
              <span className="filter-count">
                {logs.length !== allLogs.length && `${logs.length} of ${allLogs.length} logs`}
              </span>
            </div>
          </div>
        )}
      </header>

      {logs.length === 0 && allLogs.length === 0 ? (
        <>
          <FileUpload onFileUpload={handleFileUpload} />
          <Footer logCount={0} />
        </>
      ) : logs.length === 0 && allLogs.length > 0 ? (
        <>
          <div className="app-content">
            <div className="no-results">
              <h2>No logs found in this time range</h2>
              <p>Try adjusting your time filter</p>
              <button onClick={handleResetFilter} className="reset-btn-large">Reset Filter</button>
            </div>
          </div>
          <Footer logCount={allLogs.length} />
        </>
      ) : (
        <>
          <div className="app-content">
            <Timeline
              ref={timelineRef}
              logs={logs}
              selectedLog={selectedLog}
              onSelectLog={setSelectedLog}
              searchMatches={searchMatches}
              currentMatchIndex={currentMatchIndex}
            />
            <LogDetails log={selectedLog} searchQuery={searchQuery} />
          </div>
          <Footer logCount={allLogs.length} />
        </>
      )}
    </div>
  )
}

export default App
