/**
 * config.js — Production & Development Configuration for APEX PULSE
 *
 * Centralizes all backend API, WebSocket, and WebRTC signaling endpoints.
 * Automatically adapts between local development (Vite proxy / localhost:8000)
 * and production cloud deployments (Vercel / Netlify / Render / Railway / Docker).
 */

// 1. Base Backend HTTP/HTTPS URL
export const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

/**
 * Resolves a full API URL given a relative or absolute path.
 *
 * Example:
 *   getApiUrl('/api/drivers') -> 'https://api.domain.com/api/drivers' (in prod)
 *                             -> '/api/drivers' (in dev with Vite proxy)
 */
export function getApiUrl(endpoint = '') {
  if (!endpoint) return API_BASE_URL || ''
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint
  }
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  return API_BASE_URL ? `${API_BASE_URL}${cleanEndpoint}` : cleanEndpoint
}

/**
 * Resolves the real-time telemetry and signaling WebSocket URL.
 *
 * Priority:
 * 1. Explicit VITE_WS_URL environment variable
 * 2. Derived from VITE_API_URL (http -> ws, https -> wss) + '/ws'
 * 3. Browser window origin (with wss/ws auto-detection)
 * 4. Localhost fallback (ws://localhost:8000/ws)
 */
export function getWsUrl() {
  // 1. Explicit WS URL
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL
  }

  // 2. Derive from API Base URL if configured
  if (API_BASE_URL) {
    try {
      const url = new URL(API_BASE_URL)
      const wsProto = url.protocol === 'https:' ? 'wss:' : 'ws:'
      return `${wsProto}//${url.host}/ws`
    } catch (e) {
      const isHttps = API_BASE_URL.startsWith('https://')
      const cleanHost = API_BASE_URL.replace(/^https?:\/\//i, '')
      return `${isHttps ? 'wss:' : 'ws:'}//${cleanHost}/ws`
    }
  }

  // 3. Current browser window location
  if (typeof window !== 'undefined' && window.location) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.host}/ws`
  }

  // 4. Default development fallback
  return 'ws://localhost:8000/ws'
}

/**
 * Resolves WebRTC ICE servers (STUN / TURN) with production fallback.
 *
 * Can be customized via:
 * - VITE_STUN_SERVER (defaults to Google Public STUN)
 * - VITE_TURN_SERVER, VITE_TURN_USERNAME, VITE_TURN_PASSWORD (for cross-network NAT traversal)
 */
export function getIceServers() {
  const stunUrl = import.meta.env.VITE_STUN_SERVER || 'stun:stun.l.google.com:19302'
  const servers = [
    { urls: stunUrl },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]

  if (import.meta.env.VITE_TURN_SERVER) {
    const turnConfig = {
      urls: import.meta.env.VITE_TURN_SERVER,
    }
    if (import.meta.env.VITE_TURN_USERNAME) {
      turnConfig.username = import.meta.env.VITE_TURN_USERNAME
    }
    if (import.meta.env.VITE_TURN_PASSWORD) {
      turnConfig.credential = import.meta.env.VITE_TURN_PASSWORD
    }
    servers.push(turnConfig)
  }

  return { iceServers: servers }
}
