import { API_BASE, WS_BASE } from '../config';
import React, { useState, useEffect, useRef } from 'react';
import { Users, Mic, MessageSquare, Server, Music, Ticket, Calendar, Search, RefreshCw, ChevronLeft, ChevronRight, Hash } from 'lucide-react';



const CATEGORIES = [
  { id: 'Members', icon: Users, label: 'Members' },
  { id: 'Voice', icon: Mic, label: 'Voice' },
  { id: 'Messages', icon: MessageSquare, label: 'Messages' },
  { id: 'Server', icon: Server, label: 'Server' },
  { id: 'Music', icon: Music, label: 'Music' },
  { id: 'Tickets', icon: Ticket, label: 'Tickets' },
  { id: 'Events', icon: Calendar, label: 'Events' }
];

const TIME_FILTERS = [
  { label: 'All Time', value: 0 },
  { label: 'Today', value: 24 * 60 * 60 * 1000 },
  { label: 'Yesterday', value: 48 * 60 * 60 * 1000 },
  { label: 'Last 7 Days', value: 7 * 24 * 60 * 60 * 1000 }
];

interface PublicEvent {
  id: string;
  category: string;
  text: string;
  timestamp: number;
}

function timeAgo(ms: number) {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

export function PublicDashboard() {
  const [activeCategory, setActiveCategory] = useState('Voice');
  const [activeTimeFilter, setActiveTimeFilter] = useState(0);
  const [page, setPage] = useState(1);
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalEvents, setTotalEvents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  const wsRef = useRef<WebSocket | null>(null);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        category: activeCategory,
        page: page.toString()
      });
      if (activeTimeFilter > 0) {
        query.append('timeFilter', activeTimeFilter.toString());
      }
      const res = await fetch(`${API_BASE}/api/public/events?${query.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events);
        setTotalPages(data.totalPages);
        setTotalEvents(data.total);
        setLastUpdated(Date.now());
      }
    } catch (e) {
      console.error('Failed to fetch public events', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEvents();
  }, [activeCategory, activeTimeFilter, page]);

  useEffect(() => {
    const connectWS = () => {
      const socket = new WebSocket(WS_BASE);
      wsRef.current = socket;


      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'PUBLIC_EVENT') {
            const newEvent: PublicEvent = data.event;
            if (newEvent.category === activeCategory || activeCategory === 'All') {
              // Time filter check
              if (activeTimeFilter > 0 && Date.now() - newEvent.timestamp > activeTimeFilter) return;
              
              setEvents(prev => {
                if (page !== 1) return prev; // Only unshift if on first page
                const updated = [newEvent, ...prev];
                if (updated.length > 10) updated.pop();
                return updated;
              });
              setLastUpdated(Date.now());
            }
          }
        } catch (e) {}
      };

      socket.onclose = () => {
        setTimeout(connectWS, 3000);
      };
    };

    connectWS();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [activeCategory, activeTimeFilter, page]);

  // Fake stats for Messages category to match wireframe
  const renderMessagesStats = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '24px', borderRadius: 'var(--border-radius-lg)', textAlign: 'center' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Messages Today</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: 'var(--accent-primary)' }}>2,481</div>
        </div>
        <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '24px', borderRadius: 'var(--border-radius-lg)', textAlign: 'center' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Most Active Channel</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--color-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Hash size={24} /> general
          </div>
        </div>
        <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '24px', borderRadius: 'var(--border-radius-lg)', textAlign: 'center' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Top Active Time</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: 'var(--color-warning)' }}>8 PM</div>
        </div>
      </div>
      <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', marginTop: '10px' }}>
        Privacy Notice: Message contents, edits, and deletions are never tracked on the public dashboard.
      </p>
    </div>
  );

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: 'var(--bg-primary)', 
      color: 'var(--text-primary)',
      fontFamily: "'Inter', sans-serif"
    }}>
      {/* Banner */}
      <div style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center' }}>
            <div className="brand-badge-icon" style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #ff5e3a 0%, #ff2a6d 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 800,
              fontSize: '14px',
              boxShadow: '0 0 12px rgba(255, 94, 58, 0.4)',
              flexShrink: 0
            }}>RO</div>
            <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px', margin: 0 }}> SERVER ACTIVITY</h1>
          </div>
          <h2 style={{ fontSize: '20px', color: 'var(--accent-primary)', fontWeight: 600 }}>Aura XtremeZ</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <RefreshCw size={12} className={loading ? "spin" : ""} />
            Last Updated {timeAgo(lastUpdated)}
          </p>
        </div>
      </div>

      <div style={{ maxWidth: '1000px', margin: '40px auto', padding: '0 24px', display: 'grid', gridTemplateColumns: '220px 1fr', gap: '40px' }}>
        
        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '8px' }}>Categories</span>
          {CATEGORIES.map(cat => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => { setActiveCategory(cat.id); setPage(1); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                  backgroundColor: isActive ? 'var(--accent-primary)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--text-secondary)',
                  border: 'none', borderRadius: 'var(--border-radius-md)',
                  cursor: 'pointer', fontSize: '14px', fontWeight: 600,
                  transition: 'all 0.2s', textAlign: 'left'
                }}
              >
                <cat.icon size={18} />
                {cat.label}
              </button>
            )
          })}
        </div>

        {/* Main Feed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '20px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              {CATEGORIES.find(c => c.id === activeCategory)?.icon && React.createElement(CATEGORIES.find(c => c.id === activeCategory)!.icon, { size: 24, color: 'var(--accent-primary)' })}
              {activeCategory} Activity
            </h3>
            
            <div style={{ display: 'flex', gap: '8px' }}>
              {TIME_FILTERS.map(tf => (
                <button
                  key={tf.label}
                  onClick={() => { setActiveTimeFilter(tf.value); setPage(1); }}
                  style={{
                    padding: '6px 12px', fontSize: '12px', fontWeight: 600,
                    backgroundColor: activeTimeFilter === tf.value ? 'var(--bg-tertiary)' : 'transparent',
                    color: activeTimeFilter === tf.value ? 'var(--text-primary)' : 'var(--text-muted)',
                    border: '1px solid',
                    borderColor: activeTimeFilter === tf.value ? 'var(--border-color)' : 'transparent',
                    borderRadius: '20px', cursor: 'pointer', transition: 'all 0.2s'
                  }}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-lg)', padding: '24px', minHeight: '400px' }}>
            {activeCategory === 'Messages' ? renderMessagesStats() : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {loading ? (
                   <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading public events...</div>
                ) : events.length === 0 ? (
                  <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <Search size={32} opacity={0.5} />
                    <span>No public events found for this timeframe.</span>
                  </div>
                ) : events.map(ev => (
                  <div key={ev.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--border-radius-md)' }}>
                    <div style={{ fontSize: '14px', color: 'var(--text-primary)' }} dangerouslySetInnerHTML={{ __html: ev.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {timeAgo(ev.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          {activeCategory !== 'Messages' && totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0' }}>
              <button 
                className="btn btn-secondary btn-sm"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronLeft size={16} /> Previous
              </button>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Page {page} of {totalPages} ({totalEvents} total)
              </span>
              <button 
                className="btn btn-secondary btn-sm"
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
            <button className="btn btn-secondary" onClick={fetchEvents}>
              <RefreshCw size={16} /> Refresh Feed
            </button>
            <button className="btn btn-secondary" style={{ marginLeft: '12px' }} onClick={() => window.location.href = '/'}>
              Home
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
