import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom'; 
import { io } from 'socket.io-client'; 
import { fetchInboxData, fetchCheckAvailabilityLeads } from '../../services/api';
import TopNav from '../../components/Navigation/TopNav';
import ChatThread from '../../components/Chat/ChatThread';
import LeadSelectionModal from '../../components/Chat/LeadSelectionModal'; 
import ContactInvoicesList from '../../components/Chat/ContactInvoicesList'; 
import '../../styles/App.css'; 
import { API_BASE_URL } from '../../config';
import CrmQuickNav from '../../components/Navigation/CrmQuickNav';

const InboxPage = () => {
  const navigate = useNavigate(); 
  const location = useLocation();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('All');
  
  const [viewMode, setViewMode] = useState('messages');
  const [directionFilter, setDirectionFilter] = useState('all'); 
  
  const [leadToSelect, setLeadToSelect] = useState(null); 
  const [existingLeadData, setExistingLeadData] = useState(null); 

  const [refreshing, setRefreshing] = useState(false);
  const [checkAvailabilityLeads, setCheckAvailabilityLeads] = useState([]);
  const [checkAvailLoading, setCheckAvailLoading] = useState(false);

  // Helper to format a raw date the same way the backend formats thread.lead.date
  const formatLeadDate = (rawDate) =>
    new Date(rawDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Shared loader — used for initial load, the 20s auto-refresh, and the manual refresh button.
  // `showSpinner` is only true for the very first load so background refreshes don't
  // blank out the whole page / reset scroll position.
  const loadData = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    else setRefreshing(true);

    try {
      const data = await fetchInboxData();
      setThreads(data);
    } finally {
      if (showSpinner) setLoading(false);
      else setRefreshing(false);
    }
  };

  // Initial Data Load
  useEffect(() => {
    // If it's the very first load, show the big spinner. Otherwise, do a silent background refresh.
    const isFirstLoad = threads.length === 0;
    loadData(isFirstLoad);
  }, [location.key]);

  // ✅ AUTO-REFRESH: silently reload the inbox every 20 seconds
  useEffect(() => {
    const intervalId = setInterval(() => {
      loadData(false);
    }, 20000);

    return () => clearInterval(intervalId);
  }, []);

  const handleManualRefresh = () => {
    if (refreshing) return; // avoid stacking clicks
    loadData(false);
  };

  // ✅ REAL-TIME LISTENER FOR THE DASHBOARD
  useEffect(() => {
    const socket = io(`${API_BASE_URL}`); 

    socket.on('new_incoming_message', (incomingMsg) => {
      setThreads((currentThreads) => {
        const threadIndex = currentThreads.findIndex(t => t.id === incomingMsg.customerPhone);

        if (threadIndex !== -1) {
          const updatedThreads = [...currentThreads];
          const updatedThread = { ...updatedThreads[threadIndex] };
          
          updatedThread.previewMessages = [...(updatedThread.previewMessages || []), incomingMsg];
          updatedThread.fullHistory = [...(updatedThread.fullHistory || []), incomingMsg];
          updatedThread.lead = { ...updatedThread.lead, date: 'Just now' };
          
          updatedThreads[threadIndex] = updatedThread;
          return updatedThreads;
        } else {
          fetchInboxData().then(data => setThreads(data));
          return currentThreads;
        }
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // ✅ Fetch check availability leads when filter is 'Check Avail'
  useEffect(() => {
    if (activeFilter !== 'Check Avail') return;
    setCheckAvailLoading(true);
    fetchCheckAvailabilityLeads().then(data => {
      setCheckAvailabilityLeads(data);
      setCheckAvailLoading(false);
    });
  }, [activeFilter]);

  // Collect every lead type chosen for this lead across all its preferences/inquiries.
  // Buyer/Seller/Finance tabs filter by these, not by the contact's account role.
  const getThreadLeadTypes = (thread) => {
    const types = new Set();
    (thread.pastInquiries || []).forEach(inq => {
      (inq.leadTypes || []).forEach(t => types.add(t));
    });
    (thread.preferences?.lead_types || []).forEach(t => types.add(t));
    return types;
  };

  const getSortedAndFilteredThreads = () => {
    let filtered = threads.filter(thread => {
      if (activeFilter === 'All') return true;
      if (activeFilter === 'Un-registered') return thread.user.name === 'Un-registered';
      if (activeFilter === 'Vendor') return thread.user.role === activeFilter;

      // Buyer / Seller / Finance: match against the lead types chosen for the lead.
      const leadTypes = getThreadLeadTypes(thread);
      if (leadTypes.size > 0) return leadTypes.has(activeFilter);

      // Fallback for threads with no saved lead types yet.
      return thread.user.role === activeFilter;
    });

    filtered = filtered.filter(thread => {
      if (viewMode === 'messages') {
        return thread.fullHistory && thread.fullHistory.length > 0
          || thread.previewMessages && thread.previewMessages.length > 0;
      } else {
        return thread.calls && thread.calls.length > 0;
      }
    });

    filtered.sort((a, b) => {
      const dateA = new Date(a.latestInteractionDate).getTime() || 0;
      const dateB = new Date(b.latestInteractionDate).getTime() || 0;
      return dateB - dateA;
    });

    return filtered.map(thread => {
      const customerPhone = thread.id;
      const ourNumber = thread.user?.ourNumber;

      if (viewMode === 'messages') {
        let msgs = thread.fullHistory || thread.previewMessages || [];
        if (directionFilter !== 'all') {
          msgs = msgs.filter(msg => msg.direction === directionFilter || msg.type === directionFilter);
        }
        const previewMsgs = msgs.slice(-2);
        const lastShown = previewMsgs[previewMsgs.length - 1];

        // Route reflects who sent the most recent message actually shown in this tab
        const phoneRoute = lastShown
          ? (lastShown.direction === 'outgoing' ? `${ourNumber} -> ${customerPhone}` : `${customerPhone} -> ${ourNumber}`)
          : `${customerPhone} -> ${ourNumber}`;

        return {
          ...thread,
          previewMessages: previewMsgs,
          user: { ...thread.user, phoneRoute },
          lead: {
            ...thread.lead,
            date: lastShown?.rawDate ? formatLeadDate(lastShown.rawDate) : thread.lead.date
          }
        };
      } else {
        let callsToKeep = thread.calls || [];
        if (directionFilter !== 'all') {
          callsToKeep = callsToKeep.filter(call => call.direction === directionFilter || call.type === directionFilter);
        }
        const lastCall = callsToKeep[0]; // calls are sorted newest-first upstream

        // call.direction from Twilio is 'inbound' / 'outbound-api' etc — normalize
        const lastCallIsOutgoing = lastCall?.direction && !lastCall.direction.includes('inbound');
        const phoneRoute = lastCall
          ? (lastCallIsOutgoing ? `${ourNumber} -> ${customerPhone}` : `${customerPhone} -> ${ourNumber}`)
          : `${customerPhone} -> ${ourNumber}`;

        return {
          ...thread,
          calls: callsToKeep,
          user: { ...thread.user, phoneRoute },
          lead: {
            ...thread.lead,
            date: lastCall?.rawDate ? formatLeadDate(lastCall.rawDate) : thread.lead.date
          }
        };
      }
    }).filter(thread => {
      // ✅ RESTORED: drop threads that end up with nothing to show after direction filtering
      if (viewMode === 'messages') return thread.previewMessages && thread.previewMessages.length > 0;
      return thread.calls && thread.calls.length > 0;
    });
  };

  const displayThreads = getSortedAndFilteredThreads();

  const handleCheckAvailAssign = async (lead) => {
    const phone = lead.phone && lead.phone !== 'undefined' ? lead.phone : '';
    const thread = {
      id: phone,
      userId: null,
      user: {
        name: lead.name || 'Unknown',
        email: lead.email || '',
        phone: phone,
        id: null,
        initials: (lead.name || 'U').charAt(0).toUpperCase(),
        role: 'Buyer',
        tag: 'Web Lead'
      },
      lead: {
        date: new Date(lead.created_on).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        description: lead.notes && lead.notes !== 'undefined' && lead.notes !== 'Hello' ? lead.notes : 'Check Availability Lead'
      },
      pastInquiries: [],
      preferences: null,
      isCheckAvailability: true
    };
    if (phone) {
      try {
        const shortPhone = phone.replace(/\D/g, '').slice(-10);
        const resp = await fetch(`${API_BASE_URL}/leads/by-phone/${encodeURIComponent(shortPhone)}`);
        const result = await resp.json();
        if (result.success && result.data) {
          thread.pastInquiries = result.data.inquiries || [];
          thread.user.id = result.data.userId;
          thread.userId = result.data.userId;
          if (result.data.preferences) {
            thread.preferences = result.data.preferences;
            thread.preferences.id = result.data.preferenceId;
          }
        }
      } catch (e) {
        console.log('No existing preferences found for this lead');
      }
    }
    setLeadToSelect(thread);
  };

  const getAcceptanceStyle = (acceptance) => {
    if (acceptance == 1) return { bg: '#dcfce7', color: '#15803d', label: 'Accepted' };
    if (acceptance == 2) return { bg: '#dbeafe', color: '#1d4ed8', label: 'Account Created' };
    return { bg: '#fef3c7', color: '#b45309', label: 'Pending' };
  };

  const getAvatarColor = (char) => {
    const colors = ['#115e59', '#166534', '#0f4c75', '#7c3aed', '#b45309', '#be123c'];
    if (!char) return colors[0];
    return colors[char.charCodeAt(0) % colors.length];
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#f8fafc' }}>
        <svg width="40" height="40" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg" stroke="#2563eb">
          <g fill="none" fillRule="evenodd">
            <g transform="translate(1 1)" strokeWidth="4">
              <circle strokeOpacity=".2" cx="24" cy="24" r="24" />
              <path d="M48 24c0-13.255-10.745-24-24-24">
                <animateTransform attributeName="transform" type="rotate" from="0 24 24" to="360 24 24" dur="1s" repeatCount="indefinite" />
              </path>
            </g>
          </g>
        </svg>
        <span style={{ marginTop: '16px', color: '#64748b', fontSize: '15px', fontWeight: '500' }}>
          Loading live CRM data...
        </span>
      </div>
    );
  }

  return (
    <>
    <CrmQuickNav />
    <div className="page-container">
      <div className="sticky-headers">
        <TopNav activeFilter={activeFilter} setActiveFilter={setActiveFilter} />
        
        {activeFilter !== 'Check Avail' && (
          <div style={{ padding: '12px 24px 14px', backgroundColor: '#ffffff', display: 'flex', justifyContent: 'center' }}>
            <div style={{ display: 'flex', backgroundColor: '#f1f5f9', padding: '4px', borderRadius: '8px', gap: '4px' }}>
              <button
                onClick={() => { setViewMode('messages'); setDirectionFilter('all'); }}
                style={{ padding: '8px 32px', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', backgroundColor: viewMode === 'messages' ? '#ffffff' : 'transparent', color: viewMode === 'messages' ? '#2563eb' : '#64748b', boxShadow: viewMode === 'messages' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}
              >
                Messages
              </button>
              <button
                onClick={() => { setViewMode('calls'); setDirectionFilter('all'); }}
                style={{ padding: '8px 32px', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', backgroundColor: viewMode === 'calls' ? '#ffffff' : 'transparent', color: viewMode === 'calls' ? '#2563eb' : '#64748b', boxShadow: viewMode === 'calls' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}
              >
                Calls
              </button>
            </div>
          </div>
        )}

        <style>{`
          @keyframes inbox-refresh-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>

        {activeFilter !== 'Check Avail' && (
          <div style={{ padding: '0 24px 14px', backgroundColor: '#ffffff', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'center', gap: '8px' }}>
            <button
              onClick={() => setDirectionFilter('all')}
              style={{
                padding: '6px 18px', borderRadius: '20px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s', lineHeight: 1,
                border: directionFilter === 'all' ? '1.5px solid #1e293b' : '1.5px solid #e5e7eb',
                backgroundColor: directionFilter === 'all' ? '#1e293b' : '#ffffff',
                color: directionFilter === 'all' ? '#ffffff' : '#64748b',
              }}
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7h8M5 12h14M8 17h8" />
              </svg>
              All
            </button>
            <button
              onClick={() => setDirectionFilter('incoming')}
              style={{
                padding: '6px 18px', borderRadius: '20px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s', lineHeight: 1,
                border: directionFilter === 'incoming' ? '1.5px solid #16a34a' : '1.5px solid #e5e7eb',
                backgroundColor: '#ffffff',
                color: directionFilter === 'incoming' ? '#16a34a' : '#64748b',
              }}
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 5v14m0 0l-4-4m4 4l4-4" />
              </svg>
              Incoming
            </button>
            <button
              onClick={() => setDirectionFilter('outgoing')}
              style={{
                padding: '6px 18px', borderRadius: '20px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s', lineHeight: 1,
                border: directionFilter === 'outgoing' ? '1.5px solid #2563eb' : '1.5px solid #e5e7eb',
                backgroundColor: '#ffffff',
                color: directionFilter === 'outgoing' ? '#2563eb' : '#64748b',
              }}
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 19V5m0 0l-4 4m4-4l4 4" />
              </svg>
              Outgoing
            </button>
          </div>
        )}
      </div>
      
      <main className="main-content">
        {activeFilter === 'Check Avail' ? (
          <div className="inbox-feed">
            <div style={{
              padding: '16px 24px',
              backgroundColor: '#fff',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{
                borderRadius: '50%',
                background: '#ffe8e8',
                color: '#e60000',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              </span>
              <h2 style={{ fontSize: '16px', fontWeight: '600', margin: 0, color: '#1e293b' }}>
                Check Availability Leads
              </h2>
              <span style={{
                backgroundColor: '#f1f5f9',
                color: '#64748b',
                fontSize: '12px',
                fontWeight: '600',
                padding: '2px 8px',
                borderRadius: '10px'
              }}>
                {checkAvailabilityLeads.length}
              </span>
            </div>
            {checkAvailLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                <svg width="30" height="30" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg" stroke="#2563eb" style={{ display: 'block', margin: '0 auto 12px' }}>
                  <g fill="none" fillRule="evenodd">
                    <g transform="translate(1 1)" strokeWidth="4">
                      <circle strokeOpacity=".2" cx="24" cy="24" r="24" />
                      <path d="M48 24c0-13.255-10.745-24-24-24">
                        <animateTransform attributeName="transform" type="rotate" from="0 24 24" to="360 24 24" dur="1s" repeatCount="indefinite" />
                      </path>
                    </g>
                  </g>
                </svg>
                <span style={{ fontWeight: '500', fontSize: '15px' }}>Loading check availability leads...</span>
              </div>
            ) : checkAvailabilityLeads.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block', margin: '0 auto 12px', opacity: 0.4 }}>
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
                <span style={{ fontWeight: '500', fontSize: '15px' }}>No check availability leads found.</span>
              </div>
            ) : (
              checkAvailabilityLeads.map((lead) => {
                const accStyle = getAcceptanceStyle(lead.acceptance);
                const initials = (lead.name || 'U').charAt(0).toUpperCase();
                const avatarBg = getAvatarColor(initials);
                return (
                  <div key={lead.lead_id} className="thread-card">
                    <div className="thread-header-row">
                      <div className="avatar" style={{ backgroundColor: avatarBg }}>
                        {initials}
                      </div>
                      <div className="user-info">
                        <span className="user-name">{lead.name || 'Unknown'}</span>
                        <span className="user-role">(Buyer)</span>
                        <span className="user-badge">Check Avail</span>
                      </div>
                    </div>

                    <div className="thread-meta-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', padding: '0 18px 10px' }}>
                      <div className="meta-text" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                        <span className="meta-date" style={{ fontWeight: 'bold', whiteSpace: 'nowrap', fontSize: '13px' }}>
                          {new Date(lead.created_on).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <span className="meta-date" style={{ color: '#1e293b', fontSize: '13px', fontWeight: '500' }}>
                          {lead.vehicle}
                        </span>
                      </div>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 10px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600',
                        backgroundColor: accStyle.bg,
                        color: accStyle.color,
                        flexShrink: 0
                      }}>
                        {accStyle.label}
                      </span>
                    </div>

                    <div style={{ padding: '0 18px 12px', display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '12px', color: '#64748b' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <svg width="13" height="13" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" /></svg>
                        {lead.zipcode || 'N/A'}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <svg width="13" height="13" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" /></svg>
                        {lead.category}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <svg width="13" height="13" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-2 .89-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.11-.9-2-2-2z" /></svg>
                        {lead.firstname} {lead.lastname}
                      </span>
                    </div>

                    <div className="thread-tags-row" style={{ padding: '0 18px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', flexWrap: 'wrap' }}>
                        <button
                          className="assign-icon-btn"
                          onClick={() => handleCheckAvailAssign(lead)}
                          title="Assign Lead"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', color: '#64748b', fontSize: '12px', fontWeight: '500' }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
                          Assign Lead
                        </button>
                        <span style={{ color: '#64748b' }}>•</span>
                        <span style={{ color: '#2563eb', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" /></svg>
                          {lead.phone && lead.phone !== 'undefined' ? lead.phone : 'N/A'}
                        </span>
                        <span style={{ color: '#64748b' }}>•</span>
                        <span style={{ color: '#64748b' }}>{lead.email || 'No email'}</span>
                        {lead.last_followup_date && (
                          <>
                            <span style={{ color: '#64748b' }}>•</span>
                            <span style={{ color: '#b45309' }}>Follow-up: {new Date(lead.last_followup_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="thread-tags-row" style={{ padding: '0 18px 6px' }}>
                      <div className="tags-container" style={{ width: '100%' }}>
                        <ContactInvoicesList contact={lead} onViewAll={() => handleCheckAvailAssign(lead)} />
                      </div>
                    </div>

                    <div className="thread-tags-row" style={{ padding: '0 18px 14px', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                        {lead.notes && lead.notes !== 'undefined' && lead.notes !== 'Hello' && (
                          <span style={{ color: '#6b7280', fontStyle: 'italic' }}>
                            "{lead.notes}"
                          </span>
                        )}
                        <a
                          href={`${window.location.origin}/sales/car-detail/${lead.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#2563eb', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px', marginLeft: 'auto' }}
                        >
                          <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z" /></svg>
                          View Listing
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="inbox-feed">
            {displayThreads.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b', fontSize: '14px' }}>
                No {viewMode} match your current filter settings.
              </div>
            ) : (
              displayThreads.map(thread => (
                <ChatThread
                  key={viewMode === 'messages' ? thread.id : `call-${thread.id}`}
                  data={thread}
                  mode={viewMode}
                  onViewClick={(tab) => navigate('/sales/crm/engage', { state: { lead: thread, initialTab: tab } })}
                  onAssignClick={() => setLeadToSelect(thread)}
                />
              ))
            )}
          </div>
        )}
      </main>

      <LeadSelectionModal 
        isOpen={!!leadToSelect}
        onClose={() => setLeadToSelect(null)}
        thread={leadToSelect}
      />

      {activeFilter !== 'Check Avail' && (
        <button
          onClick={handleManualRefresh}
          title="Refresh inbox"
          disabled={refreshing}
          style={{
            position: 'fixed',
            bottom: '28px',
            right: '28px',
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            border: 'none',
            backgroundColor: '#2563eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: refreshing ? 'default' : 'pointer',
            boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
            zIndex: 50,
            transition: 'background-color 0.15s, transform 0.15s',
          }}
          onMouseEnter={(e) => { if (!refreshing) e.currentTarget.style.backgroundColor = '#1d4ed8'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#2563eb'; }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ffffff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              animation: refreshing ? 'inbox-refresh-spin 0.8s linear infinite' : 'none',
            }}
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      )}
      
    </div>
    </>
  );
};

export default InboxPage;