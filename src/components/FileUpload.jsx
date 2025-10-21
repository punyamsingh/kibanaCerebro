import React, { useRef, useState } from 'react'
import './FileUpload.css'

const FileUpload = ({ onFileUpload }) => {
  const fileInputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file && file.type === 'application/json') {
      onFileUpload(file)
    } else {
      alert('Please upload a valid JSON file')
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (file && file.type === 'application/json') {
      onFileUpload(file)
    } else {
      alert('Please upload a valid JSON file')
    }
  }

  const handleClick = () => {
    fileInputRef.current.click()
  }

  return (
    <div className="file-upload-container">
      <div
        className={`upload-area ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>

        <h2>Upload Log File</h2>
        <p>Drag and drop your JSON log file here, or click to browse</p>

        <div className="supported-formats">
          <span>Supported format: JSON (.json)</span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>

      <div className="instructions">
        <h3>How to use:</h3>
        <ol>
          <li>Upload a JSON file containing your logs</li>
          <li>The timeline will automatically arrange logs based on timestamps</li>
          <li>Scroll left/right or drag to navigate through the timeline</li>
          <li>Click on any log marker to view its details</li>
        </ol>

        <div className="example">
          <h4>Expected JSON format:</h4>
          <pre>{`{
  "logs": [
    {
      "timestamp": "2024-01-01T07:26:37.000Z",
      "action": "cart/created",
      "data": { ... }
    },
    ...
  ]
}`}</pre>
          <p className="note">The tool will auto-detect timestamp fields (timestamp, time, date)</p>
        </div>
      </div>
    </div>
  )
}

export default FileUpload
