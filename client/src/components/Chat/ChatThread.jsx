import React from 'react';
import './ChatThread.css';
import ContactInvoicesList from './ContactInvoicesList';

const getAvatarColor = (initial) => {
  const colors = ['#115e59', '#166534', '#0f4c75'];
  if (!initial) return colors[0];
  return colors[initial.charCodeAt(0) % colors.length];
};

const formatPhoneNumber = (phone) => {
  if (!phone) return phone;
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+1') && cleaned.length === 12) {
    return `+1 ${cleaned.slice(2, 5)}-${cleaned.slice(5, 8)}-${cleaned.slice(8)}`;
  }
  if (cleaned.startsWith('+') && cleaned.length >= 12) {
    const ccLength = cleaned.length - 10; 
    const cc = cleaned.slice(0, ccLength);
    const rest = cleaned.slice(ccLength);
    if (rest.length === 10) {
      return `${cc} ${rest.slice(0, 3)}-${rest.slice(3, 6)}-${rest.slice(6)}`;
    }
  }
  return phone;
};

const formatPhoneRoute = (routeStr) => {
  if (!routeStr) return '';
  if (routeStr.includes('->')) {
    return routeStr.split('->').map(p => formatPhoneNumber(p.trim())).join(' -> ');
  }
  return formatPhoneNumber(routeStr);
};

const CallBubbles = ({ calls }) => {
  const callsToShow = (calls || []).slice(0, 2);

  if (callsToShow.length === 0) {
    return (
      <div className="chat-bubble incoming">
        <span className="chat-text" style={{ fontStyle: 'italic', color: '#9ca3af' }}>No call history available.</span>
      </div>
    );
  }

  return callsToShow.map((call, i) => {
    const isOutgoing = call.type === 'outgoing';
    const isMissed = call.type === 'missed';

    const bubbleClass = isOutgoing ? 'outgoing' : 'incoming';
    const label = isOutgoing ? 'Outgoing Call' : isMissed ? 'Missed Call' : 'Incoming Call';
    const missedStyle = isMissed ? { color: '#dc2626' } : {};

    return (
      <div key={i} className={`chat-bubble ${bubbleClass}`}>
        <span className="chat-text" style={missedStyle}>
          {isOutgoing && <strong>You: </strong>}
          📞 {label}
        </span>
        <span className="chat-time">
          <span style={{ marginRight: '6px', opacity: 0.8 }}>⏱ {call.duration}</span>
          {call.date}
          {isOutgoing && ' ✓✓'}
        </span>
      </div>
    );
  });
};

const ChatThread = ({ data, onViewClick, onAssignClick, mode = 'messages' }) => {
  const isUnregistered = data.user?.name === 'Un-registered';
  const initials = data.user?.initials || 'U';

  return (
    <div className="thread-card">

      <div className="thread-header-row">
        <div className="avatar" style={{ backgroundColor: getAvatarColor(initials) }}>
          {initials}
        </div>
        <div className="user-info">
          <span className="user-name">{data.user?.name || 'Unknown User'}</span>
          <span className="user-role">({data.user?.role || 'Unknown'})</span>
          <span className="user-badge">{data.user?.tag || (isUnregistered ? 'Web Lead' : 'Registered')}</span>
        </div>
      </div>

      <div className="thread-meta-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div className="meta-text" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
          <span className="meta-date" style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>{data.lead?.date || 'May 11, 2026'}</span>
          <span className="meta-route" style={{ color: '#6b7280', fontSize: '13px', whiteSpace: 'normal', wordBreak: 'break-word', display: 'inline-block' }}>
            {formatPhoneRoute(data.user?.phoneRoute || '+19167506452 -> +14156912423')}
          </span>
        </div>

        <div className="meta-actions" style={{ flexShrink: 0, display: 'flex', gap: '4px' }}>
          <button className="icon-btn call-icon" onClick={() => onViewClick('calls')} title="Call User">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" /></svg>
          </button>
          <button className="icon-btn sms-icon" onClick={() => onViewClick('messages')} title="Message User">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM9 11H7V9h2v2zm4 0h-2V9h2v2zm4 0h-2V9h2v2z" /></svg>
          </button>
        </div>
      </div>

      <div className="thread-tags-row">
        <button className="assign-icon-btn" onClick={onAssignClick} title="Assign Lead">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
        </button>

        <div className="tags-container" style={{ width: '100%' }}>
          <ContactInvoicesList contact={{ id: data.id, userId: data.userId || data.user?.id, preferences: data.preferences, pastInquiries: data.pastInquiries, email: data.user?.email, phone: data.user?.phone }} onViewAll={onAssignClick} />
        </div>
      </div>

      <div className="thread-messages-row">
        {mode === 'calls' ? (
          <CallBubbles calls={data.calls} />
        ) : (
          data.previewMessages && data.previewMessages.length > 0 ? (
            [...data.previewMessages].reverse().map((msg, index) => (
              <div key={msg.id || index} className={`chat-bubble ${msg.direction}`}>
                <span className="chat-text">
                  {msg.direction === 'outgoing' && <strong>You: </strong>}
                  {msg.text}
                </span>
                <span className="chat-time">
                  {msg.time} {msg.direction === 'outgoing' && '✓✓'}
                </span>
              </div>
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: '16px', color: '#9ca3af', fontSize: '13px', fontStyle: 'italic' }}>
              No text messages found for this lead.
            </div>
          )
        )}
      </div>

    </div>
  );
};

export default ChatThread;