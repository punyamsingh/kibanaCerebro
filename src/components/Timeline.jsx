import React, { useRef, useEffect, useState, useMemo, forwardRef, useImperativeHandle } from 'react'
import './Timeline.css'

const Timeline = forwardRef(({ logs, selectedLog, onSelectLog, searchMatches = [], currentMatchIndex = -1, timezone = 'UTC', getDisplayTimestamp }, ref) => {
  const scrollContainerRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 100 })

  // Calculate time range for display purposes only
  const getTimeInfo = () => {
    if (logs.length === 0) return { min: 0, max: 0, range: 0, minDate: null, maxDate: null }

    const times = logs.map(log => new Date(log._timestamp).getTime())
    const min = Math.min(...times)
    const max = Math.max(...times)

    return {
      min,
      max,
      range: max - min || 1,
      minDate: new Date(min),
      maxDate: new Date(max)
    }
  }

  const { min: minTime, max: maxTime, range: timeRange, minDate, maxDate } = getTimeInfo()

  // Calculate track width based on number of UNIQUE timestamps with equal spacing
  const LOG_SPACING = 200 // pixels between each unique timestamp
  const LEFT_PADDING = 200 // padding at the start so first log is visible

  // Create a map of timestamp to position index (unique timestamps only)
  const timestampPositionMap = useMemo(() => {
    const map = new Map()
    let positionIndex = 0
    logs.forEach(log => {
      if (!map.has(log._timestamp)) {
        map.set(log._timestamp, positionIndex)
        positionIndex++
      }
    })
    return map
  }, [logs])

  const uniqueTimestampCount = timestampPositionMap.size
  const trackWidth = Math.max(uniqueTimestampCount * LOG_SPACING + LEFT_PADDING, window.innerWidth * 2)

  // Expose scrollToLog method to parent via ref
  useImperativeHandle(ref, () => ({
    scrollToLog: (logIndex) => {
      if (!scrollContainerRef.current || logIndex < 0 || logIndex >= logs.length) return

      const log = logs[logIndex]
      const positionIndex = timestampPositionMap.get(log._timestamp) || 0
      const pixelPosition = LEFT_PADDING + (positionIndex * LOG_SPACING)

      // Scroll to position (center it in viewport)
      const containerWidth = scrollContainerRef.current.clientWidth
      const scrollPosition = pixelPosition - (containerWidth / 2)

      scrollContainerRef.current.scrollTo({
        left: Math.max(0, scrollPosition),
        behavior: 'smooth'
      })
    }
  }), [logs, timestampPositionMap, LEFT_PADDING, LOG_SPACING])

  // Calculate position for each log based on its timestamp (not index)
  const getLogPosition = (log) => {
    const positionIndex = timestampPositionMap.get(log._timestamp) || 0
    const pixelPosition = LEFT_PADDING + (positionIndex * LOG_SPACING)
    return (pixelPosition / trackWidth) * 100
  }

  // Memoize lane assignments for performance
  const laneAssignments = useMemo(() => {
    if (logs.length === 0) return []

    const laneAssignments = new Array(logs.length).fill(0)
    const minDistance = 140 // Minimum pixels between boxes (box width + small gap)

    logs.forEach((log, index) => {
      const positionIndex = timestampPositionMap.get(log._timestamp) || 0
      const position = positionIndex * LOG_SPACING
      const logTimestamp = log._timestamp

      // Find available lane
      let lane = 0
      let foundLane = false

      while (!foundLane) {
        // Check if this lane is available at this position
        // Check previous logs to see if any are too close in the same lane
        const conflicts = logs.slice(Math.max(0, index - 50), index).filter((otherLog, localIndex) => {
          const otherIndex = Math.max(0, index - 50) + localIndex
          if (laneAssignments[otherIndex] !== lane) return false

          // If timestamps are exactly the same, they should be in different lanes
          if (otherLog._timestamp === logTimestamp) {
            return true // Conflict - same timestamp, must use different lane
          }

          // Otherwise check pixel distance
          const otherPosIndex = timestampPositionMap.get(otherLog._timestamp) || 0
          const otherPosition = otherPosIndex * LOG_SPACING
          return Math.abs(position - otherPosition) < minDistance
        })

        if (conflicts.length === 0) {
          foundLane = true
          laneAssignments[index] = lane
        } else {
          lane++
        }

        // Maximum 5 lanes
        if (lane >= 5) {
          laneAssignments[index] = index % 5
          foundLane = true
        }
      }
    })

    return laneAssignments
  }, [logs, LOG_SPACING, timestampPositionMap])


  // Format timestamp - just extract and show as-is from the ISO format
  const formatTime = (timestamp) => {
    if (!timestamp || typeof timestamp !== 'string') return ''
    // Convert to display timezone if function is provided
    const displayTimestamp = getDisplayTimestamp ? getDisplayTimestamp(timestamp) : timestamp
    // displayTimestamp is like "2025-10-15T07:33:22.667" or "2025-10-15T07:28:13.209195172+00:00"
    // Extract just the time part: HH:MM:SS.mmm
    const timeMatch = displayTimestamp.match(/T(\d{2}:\d{2}:\d{2}\.\d+)/)
    if (timeMatch) {
      return timeMatch[1]
    }
    return displayTimestamp
  }

  const formatDate = (timestamp) => {
    if (!timestamp || typeof timestamp !== 'string') return ''
    // Convert to display timezone if function is provided
    const displayTimestamp = getDisplayTimestamp ? getDisplayTimestamp(timestamp) : timestamp
    // displayTimestamp is like "2025-10-15T07:33:22.667"
    // Extract the date part: YYYY-MM-DD
    const dateMatch = displayTimestamp.match(/^(\d{4}-\d{2}-\d{2})/)
    if (dateMatch) {
      return dateMatch[1]
    }
    return displayTimestamp
  }

  // Get log type/category for color coding
  const getLogType = (log) => {
    // Check level field first (for parsed logs)
    if (log.level) {
      const level = log.level.toLowerCase()
      if (level === 'error') return 'error'
      if (level === 'warn' || level === 'warning') return 'warning'
    }

    // Check type field
    if (log.type) {
      const type = log.type.toLowerCase()
      if (type.includes('error')) return 'error'
    }

    // Check tag and data content
    const logStr = JSON.stringify(log).toLowerCase()
    if (logStr.includes('error') || logStr.includes('fail')) return 'error'
    if (logStr.includes('warn')) return 'warning'
    if (logStr.includes('payment') || logStr.includes('txn') || logStr.includes('euler') || logStr.includes('juspay')) return 'payment'
    if (logStr.includes('cart') || logStr.includes('shipping')) return 'cart'
    if (logStr.includes('gql') || logStr.includes('api') || logStr.includes('dbquery')) return 'api'

    return 'info'
  }

  // Get log label
  const getLogLabel = (log) => {
    // For parsed Elasticsearch logs, use tag field
    if (log.tag) return log.tag
    if (log.action) return log.action
    if (log.type && log.tag) return `${log.type}: ${log.tag}`
    if (log.type) return log.type
    if (log.event) return log.event
    if (log.message) return log.message.substring(0, 30)
    if (log._path) return log._path

    return 'Log'
  }

  // Mouse drag handlers
  const handleMouseDown = (e) => {
    setIsDragging(true)
    setStartX(e.pageX - scrollContainerRef.current.offsetLeft)
    setScrollLeft(scrollContainerRef.current.scrollLeft)
  }

  const handleMouseMove = (e) => {
    if (!isDragging) return
    e.preventDefault()
    const x = e.pageX - scrollContainerRef.current.offsetLeft
    const walk = (x - startX) * 2
    scrollContainerRef.current.scrollLeft = scrollLeft - walk
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleMouseLeave = () => {
    setIsDragging(false)
  }

  // Calculate visible logs based on scroll position (virtual scrolling)
  useEffect(() => {
    const updateVisibleRange = () => {
      if (!scrollContainerRef.current || logs.length === 0) return

      const scrollLeft = scrollContainerRef.current.scrollLeft
      const containerWidth = scrollContainerRef.current.clientWidth

      // Calculate visible area in pixels
      const viewStart = scrollLeft
      const viewEnd = scrollLeft + containerWidth

      // Add buffer (in pixels)
      const bufferPixels = 50 * LOG_SPACING  // 50 logs worth of spacing as buffer
      const bufferedStart = Math.max(0, viewStart - bufferPixels)
      const bufferedEnd = viewEnd + bufferPixels

      // Find which logs fall within this pixel range
      let start = 0
      let end = logs.length

      // Find first visible log
      for (let i = 0; i < logs.length; i++) {
        const positionIndex = timestampPositionMap.get(logs[i]._timestamp) || 0
        const pixelPosition = LEFT_PADDING + (positionIndex * LOG_SPACING)
        if (pixelPosition >= bufferedStart) {
          start = i
          break
        }
      }

      // Find last visible log
      for (let i = logs.length - 1; i >= 0; i--) {
        const positionIndex = timestampPositionMap.get(logs[i]._timestamp) || 0
        const pixelPosition = LEFT_PADDING + (positionIndex * LOG_SPACING)
        if (pixelPosition <= bufferedEnd) {
          end = i + 1
          break
        }
      }

      setVisibleRange({ start, end })
    }

    const container = scrollContainerRef.current
    if (!container) return

    // Update on scroll
    container.addEventListener('scroll', updateVisibleRange)

    // Initial calculation
    updateVisibleRange()

    return () => container.removeEventListener('scroll', updateVisibleRange)
  }, [logs, LOG_SPACING, timestampPositionMap, LEFT_PADDING])

  // Get only visible logs for rendering
  const visibleLogs = useMemo(() => {
    return logs.slice(visibleRange.start, visibleRange.end).map((log, i) => ({
      log,
      originalIndex: visibleRange.start + i
    }))
  }, [logs, visibleRange])

  return (
    <div className="timeline-container">
      <div className="timeline-header">
        <div className="timeline-info">
          <h2>Timeline ({logs.length} logs) - {timezone}</h2>
          {minDate && maxDate && (
            <div className="time-range">
              <span className="time-label">Start:</span>
              <span className="time-value">{formatTime(minDate.toISOString())} {formatDate(minDate.toISOString())}</span>
              <span className="separator">→</span>
              <span className="time-label">End:</span>
              <span className="time-value">{formatTime(maxDate.toISOString())} {formatDate(maxDate.toISOString())}</span>
              <span className="separator">|</span>
              <span className="time-label">Duration:</span>
              <span className="time-value">{((maxTime - minTime) / 1000).toFixed(2)}s</span>
            </div>
          )}
        </div>

        <div className="timeline-controls-top">
          <div className="timeline-legend">
            <span className="legend-item error">Error</span>
            <span className="legend-item warning">Warning</span>
            <span className="legend-item payment">Payment</span>
            <span className="legend-item cart">Cart</span>
            <span className="legend-item api">API</span>
            <span className="legend-item info">Info</span>
          </div>
        </div>
      </div>

      <div
        className={`timeline-scroll ${isDragging ? 'dragging' : ''}`}
        ref={scrollContainerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <div className="timeline-track" style={{ minWidth: `${trackWidth}px` }}>
          <div className="timeline-line" />

          {visibleLogs.map(({ log, originalIndex }) => {
            const position = getLogPosition(log) // Use log object to get position by timestamp
            const type = getLogType(log)
            const label = getLogLabel(log)
            const isSelected = selectedLog === log
            const lane = laneAssignments[originalIndex] || 0
            const topPosition = 50 + (lane * 60) // 60px spacing between lanes

            return (
              <div
                key={log._id || originalIndex}
                className={`timeline-event-box ${type} ${isSelected ? 'selected' : ''}`}
                style={{
                  left: `${position}%`,
                  top: `${topPosition}px`
                }}
                onClick={() => onSelectLog(log)}
                title={`${formatTime(log._timestamp)} - ${label}`}
              >
                <div className="event-box-content">
                  <div className="event-tag">{label}</div>
                  <div className="event-datetime">
                    <span className="event-time-small">{formatTime(log._timestamp)}</span>
                    <span className="event-date-small">{formatDate(log._timestamp)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="timeline-controls">
        <div className="controls-left">
          <span>Drag to scroll or use mouse wheel</span>
        </div>
        <div className="controls-right">
          <span>Equal spacing: {LOG_SPACING}px between logs</span>
        </div>
      </div>
    </div>
  )
})

Timeline.displayName = 'Timeline'

export default Timeline
