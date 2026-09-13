import React, { useState, useEffect } from 'react'
import { getApiUrl } from '../config.js'

export default function RaceEventTimeline({ timelineEvents }) {
  const [events, setEvents] = useState(timelineEvents || [])
  const [filter, setFilter] = useState('ALL')

  useEffect(() => {
    if (timelineEvents) setEvents(timelineEvents)
  }, [timelineEvents])

  useEffect(() => {
    if (!timelineEvents || timelineEvents.length === 0) {
      fetch(getApiUrl('/api/timeline'))
        .then((r) => r.json())
        .then((data) => {
          if (data.events) setEvents(data.events)
        })
        .catch(() => {})
    }
  }, [])

  const filteredEvents = events.filter((e) => {
    if (filter === 'ALL') return true
    if (filter === 'RADIO') return e.type?.includes('RADIO') || e.type?.includes('CALL') || e.type?.includes('ACK')
    if (filter === 'AI') return e.type?.includes('AI')
    if (filter === 'FLAGS') return e.type?.includes('FLAG')
    if (filter === 'TYRES') return e.type?.includes('TYRE')
    return true
  })

  const getUrgencyBadge = (u) => {
    const s = String(u || '').toUpperCase()
    if (s.includes('CRITICAL')) return { bg: '#ef4444', text: '#fff' }
    if (s.includes('WARN')) return { bg: '#eab308', text: '#000' }
    return { bg: '#0284c7', text: '#fff' }
  }

  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.85)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '8px',
      padding: '12px 14px',
      marginTop: '16px'
    }}>
      {/* Header & Filter Chips */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        paddingBottom: '8px',
        marginBottom: '10px'
      }}>
        <div style={{ fontSize: '11px', fontWeight: '900', letterSpacing: '1px', color: '#94a3b8' }}>
          RACE EVENT TIMELINE & AUDIT LOG
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          {['ALL', 'AI', 'RADIO', 'FLAGS', 'TYRES'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                background: filter === f ? 'rgba(0, 229, 255, 0.2)' : 'rgba(30, 41, 59, 0.6)',
                border: filter === f ? '1px solid #00e5ff' : '1px solid rgba(255, 255, 255, 0.05)',
                color: filter === f ? '#00e5ff' : '#94a3b8',
                borderRadius: '4px',
                padding: '2px 8px',
                fontSize: '9px',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Events List */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        maxHeight: '180px',
        overflowY: 'auto'
      }}>
        {filteredEvents.length === 0 ? (
          <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center', padding: '12px' }}>
            No race events recorded yet.
          </div>
        ) : (
          filteredEvents.map((e) => {
            const badge = getUrgencyBadge(e.urgency)
            return (
              <div
                key={e.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(0, 0, 0, 0.3)',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  fontSize: '11px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    fontFamily: 'monospace',
                    fontSize: '10px',
                    color: '#64748b',
                    minWidth: '55px'
                  }}>
                    {e.time}
                  </span>

                  <span style={{
                    fontSize: '9px',
                    fontWeight: '800',
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#38bdf8',
                    padding: '1px 5px',
                    borderRadius: '3px'
                  }}>
                    L{e.lap || 30}
                  </span>

                  <span style={{
                    fontSize: '9px',
                    fontWeight: '800',
                    background: badge.bg,
                    color: badge.text,
                    padding: '1px 6px',
                    borderRadius: '3px'
                  }}>
                    {e.type}
                  </span>

                  <span style={{ color: '#cbd5e1' }}>
                    {e.description || e.title}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
