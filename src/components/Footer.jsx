import React from 'react'
import './Footer.css'

const Footer = ({ logCount }) => {
  return (
    <footer className="app-footer">
      <div className="footer-content">
        <div className="footer-left">
          <span className="footer-brand">Log Viewer Timeline v1.0.0</span>
          {logCount > 0 && (
            <span className="footer-stats">
              {logCount.toLocaleString()} logs loaded
            </span>
          )}
        </div>
        <div className="footer-right">
          <span className="footer-hint">
            Press <kbd>?</kbd> for keyboard shortcuts
          </span>
        </div>
      </div>
    </footer>
  )
}

export default Footer
