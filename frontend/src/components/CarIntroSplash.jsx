import React, { useState, useEffect } from 'react'
import f1CarImg from '../assets/f1_intro_car.jpg'

/**
 * CarIntroSplash — 1-Second High-Tech F1 Race Car Intro Overlay
 *
 * Displays an ultra-detailed futuristic Formula 1 car speeding down Monza
 * for 1.2 seconds before smoothly fading out into the live command dashboard.
 */
export default function CarIntroSplash({ onComplete, durationMs = 1200 }) {
  const [isFading, setIsFading] = useState(false)

  useEffect(() => {
    // Start fade-out 300ms before completion
    const fadeTimer = setTimeout(() => {
      setIsFading(true)
    }, Math.max(200, durationMs - 300))

    // Completely finish and unmount after durationMs
    const exitTimer = setTimeout(() => {
      if (onComplete) onComplete()
    }, durationMs)

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(exitTimer)
    }
  }, [durationMs, onComplete])

  return (
    <div
      className={`f1-intro-splash-overlay ${isFading ? 'fade-out' : ''}`}
      onClick={() => onComplete && onComplete()}
      title="Click anywhere to skip intro"
    >
      <div className="intro-car-bg-wrap">
        <img
          src={f1CarImg}
          alt="Apex Pulse Formula 1 Car"
          className="intro-car-img"
        />
        <div className="intro-gradient-vignette" />
        <div className="intro-laser-scanline" />
      </div>

      <div className="intro-hud-container">
        <div className="intro-brand-box">
          <div className="intro-badge">
            <span className="live-dot" />
            <span>PIT WALL TELEMETRY INITIALIZING · SECU BOOT</span>
          </div>
          <h1 className="intro-title">APEX PULSE</h1>
          <div className="intro-subtitle">FIA FORMULA 1 WORLD CHAMPIONSHIP · RACE STRATEGY COMMAND</div>
        </div>

        <div className="intro-telemetry-status">
          <div className="intro-loading-bar-wrap">
            <div className="intro-loading-bar-fill" style={{ animationDuration: `${durationMs}ms` }} />
          </div>
          <div className="intro-status-meta">
            <span className="meta-left">AUTODROMO NAZIONALE MONZA · CAN-BUS 20Hz ENCRYPTED LINK</span>
            <span className="meta-right">SECU ONLINE</span>
          </div>
        </div>
      </div>
    </div>
  )
}
