import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useLocation, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config';
import CrmQuickNav from '../../components/Navigation/CrmQuickNav';

const EngagePage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  const lead = location.state?.lead;
  const initialTab = location.state?.initialTab || 'messages';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [inputText, setInputText] = useState('');
  const [localHistory, setLocalHistory] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [isCalling, setIsCalling] = useState(false);

  const [dialPadNumber, setDialPadNumber] = useState('');
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [systemUsers, setSystemUsers] = useState([]);

  const messagesEndRef = useRef(null);
  const prevHistoryLength = useRef(0);

  const dialKeys = [
    { num: '1', letters: '' }, { num: '2', letters: 'ABC' }, { num: '3', letters: 'DEF' },
    { num: '4', letters: 'GHI' }, { num: '5', letters: 'JKL' }, { num: '6', letters: 'MNO' },
    { num: '7', letters: 'PQRS' }, { num: '8', letters: 'TUV' }, { num: '9', letters: 'WXYZ' },
    { num: '*', letters: '' }, { num: '0', letters: '+' }, { num: '#', letters: '' }
  ];

  const fetchSystemUsers = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/users/system-users`); 
      const data = await response.json();
      if (data.success && data.users) {
        setSystemUsers(data.users);
      }
    } catch (error) {
      console.error("Failed to fetch system users", error);
    }
  };

  useEffect(() => {
    fetchSystemUsers();
  }, []);

  useEffect(() => {
    if (!lead) return; 
    
    // Connect socket
    const socket = io(`${API_BASE_URL}`);
    
    socket.on('new_incoming_message', (newMsg) => {
      // ✅ FIX: Clean both numbers to ensure they match perfectly (strip spaces/dashes)
      const cleanIncomingPhone = (newMsg.customerPhone || '').replace(/\D/g, '');
      const cleanLeadPhone = (lead.id || '').replace(/\D/g, '');
      
      // ✅ FIX: Allow the match if the last 10 digits match
      if (cleanIncomingPhone.slice(-10) === cleanLeadPhone.slice(-10)) {
        
        // Formulate the message object to exactly match what the chat bubble expects
        const formattedMsg = {
          id: newMsg.id || Date.now(),
          direction: 'incoming',
          text: newMsg.text,
          time: newMsg.time
        };
        
        setLocalHistory((prevHistory) => [...prevHistory, formattedMsg]);
      }
    });
    
    return () => socket.disconnect();
  }, [lead?.id]); 

  useEffect(() => {
    if (!lead) return;
    let cancelled = false;
    setLocalHistory(lead.fullHistory || []);
    setActiveTab(initialTab);

    // Load COMPLETE history (incoming + outgoing) for this exact thread on demand.
    // The inbox list no longer ships full history for every thread — that shipped
    // ALL messages for EVERY thread on refresh and exhausted browser resources.
    const phone = lead.id || lead.phone;
    if (phone) {
      fetch(`${API_BASE_URL}/twilio/thread-history?phone=${encodeURIComponent(phone)}`)
        .then(r => r.json())
        .then(data => {
          if (!cancelled && data.success) setLocalHistory(data.messages || []);
        })
        .catch(() => {});
    }

    return () => { cancelled = true; };
  }, [lead, initialTab]);

  const scrollToBottom = (isSmooth = false) => {
    messagesEndRef.current?.scrollIntoView({ behavior: isSmooth ? "smooth" : "auto" });
  };

  useEffect(() => {
    if (activeTab === 'messages') {
      const isNewMessage = localHistory.length === prevHistoryLength.current + 1;
      scrollToBottom(isNewMessage);
    }
    prevHistoryLength.current = localHistory.length;
  }, [localHistory, activeTab]);

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;
    const messageToSend = inputText;
    setInputText('');

    const optimisticMsg = {
      id: Date.now(),
      direction: 'outgoing',
      text: messageToSend,
      time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    };
    setLocalHistory((prev) => [...prev, optimisticMsg]);

    try {
      setIsSending(true);
      const response = await fetch(`${API_BASE_URL}/twilio/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: lead.id, message: messageToSend })
      });
      if (!response.ok) throw new Error("Failed to send");
    } catch (error) {
      console.error("Send error:", error);
      alert("Failed to send message. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const handleCallNow = async (numberToCall) => {
    try {
      setIsCalling(true);
      const finalNumberToCall = numberToCall || lead.id;
      const response = await fetch(`${API_BASE_URL}/twilio/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadPhone: finalNumberToCall }) 
      });

      if (!response.ok) throw new Error("Call failed");
      
      alert(`📞 Ringing your phone now! Please pick up to connect to ${finalNumberToCall}.`);
      setDialPadNumber('');
      setUserSearchTerm('');
    } catch (error) {
      console.error("Call error:", error);
      alert("❌ Failed to initiate the call. Check console for details.");
    } finally {
      setTimeout(() => setIsCalling(false), 3000); 
    }
  };

  const getUserInitials = (name) => {
    if (!name) return 'U';
    const parts = name.split(' ');
    return parts.length > 1 ? parts[0][0] + (parts[1] ? parts[1][0] : '') : parts[0][0];
  };

  const getUserColor = (index) => {
    const colors = [
      { bg: '#22c55e', color: '#ffffff' }, { bg: '#3b82f6', color: '#ffffff' }, 
      { bg: '#a855f7', color: '#ffffff' }, { bg: '#f97316', color: '#ffffff' }  
    ];
    return colors[index % colors.length];
  };

  const filteredUsers = systemUsers.filter(u => 
    u.name?.toLowerCase().includes(userSearchTerm?.toLowerCase() || '') ||
    u.phone?.includes(userSearchTerm || '')
  );

  if (!lead) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', fontFamily: 'sans-serif' }}>
        <h2 style={{ color: '#111827', marginBottom: '16px' }}>No lead selected.</h2>
        <button onClick={() => navigate('/sales/crm')} style={{ padding: '10px 20px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '15px', fontWeight: 'bold' }}>
          ← Return to Inbox
        </button>
      </div>
    );
  }

  return (
    <>
    <CrmQuickNav />
    <div className="engage-page-container">
      <style>{`
        .engage-page-container { 
          display: flex; 
          flex-direction: column; 
          height: 100vh; 
          height: 100dvh; 
          width: 100vw;
          max-width: 100%;
          background-color: #f8fafc; 
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
          overflow-x: hidden; 
        }

        .page-header-wrapper { background-color: #ffffff; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; display: flex; flex-direction: column; }
        
        .page-header-top { display: flex; align-items: center; padding: 20px 24px 12px 24px; gap: 16px; }
        
        .back-btn { background: transparent; border: none; color: #2563eb; font-size: 15px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px; padding: 0; transition: color 0.2s;}
        .back-btn:hover { color: #1d4ed8; text-decoration: underline; }
        
        .header-title { margin: 0; font-size: 18px; font-weight: 700; color: #111827; flex: 1; }
        
        .profile-banner { display: flex; align-items: center; padding: 12px 24px 24px 24px; gap: 16px; }
        .profile-avatar { width: 48px; height: 48px; border-radius: 50%; background: #1e40af; color: white; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: bold; flex-shrink: 0; }
        .profile-info { flex: 1; min-width: 0; }
        .profile-name { font-size: 18px; font-weight: 700; color: #111827; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;}
        .profile-phone { font-size: 14px; color: #059669; font-weight: 600; }
        .profile-email { font-size: 14px; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        
        .page-tabs { display: flex; padding: 0 24px; border-top: 1px solid #f3f4f6; background: #ffffff; overflow-x: auto; scrollbar-width: none; }
        .page-tabs::-webkit-scrollbar { display: none; }
        
        .tab { padding: 10px 20px; border: none; background: transparent; font-size: 14px; font-weight: 600; color: #6b7280; cursor: pointer; border-bottom: 3px solid transparent; white-space: nowrap; transition: all 0.2s; }
        .tab:hover { color: #111827; }
        .tab.active { color: #2563eb; border-bottom-color: #2563eb; }
        
        .page-content-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; background-color: #f8fafc; width: 100%; max-width: 100%; }
        
        .messages-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
        
        .msg-wrapper { max-width: 85%; display: flex; flex-direction: column; }
        .msg-wrapper.outgoing { align-self: flex-end; align-items: flex-end; }
        .msg-wrapper.incoming { align-self: flex-start; align-items: flex-start; }
        
        .msg-bubble { padding: 12px 16px; font-size: 15px; line-height: 1.45; word-wrap: break-word; overflow-wrap: break-word; word-break: break-word; hyphens: auto; }
        .msg-bubble.outgoing { background-color: #166534; color: white; border-radius: 18px 18px 4px 18px; box-shadow: 0 1px 2px rgba(22, 101, 52, 0.2); }
        .msg-bubble.incoming { background-color: #ffffff; color: #111827; border: 1px solid #e5e7eb; border-radius: 18px 18px 18px 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        
        .msg-time { font-size: 11px; color: #6b7280; margin-top: 4px; display: flex; align-items: center; gap: 4px; padding: 0 4px; }
        .msg-time.outgoing { color: #059669; }
        
        .input-bar { background: #ffffff; padding: 12px 24px; border-top: 1px solid #e5e7eb; display: flex; gap: 12px; align-items: center; flex-shrink: 0; padding-bottom: max(12px, env(safe-area-inset-bottom)); width: 100%; box-sizing: border-box; }
        .chat-input { flex: 1; padding: 14px 16px; border: 1px solid #d1d5db; border-radius: 20px; font-size: 15px; outline: none; transition: border 0.2s; min-width: 0; }
        .chat-input:focus { border-color: #3b82f6; }
        .send-btn { background: #2563eb; color: white; border: none; border-radius: 20px; padding: 12px 20px; font-weight: 600; font-size: 15px; cursor: pointer; transition: background 0.2s; white-space: nowrap; flex-shrink: 0; }
        .send-btn:hover:not(:disabled) { background: #1d4ed8; }
        .send-btn:disabled { background: #9ca3af; cursor: not-allowed; }
        
        .modern-input-box { width: 100%; padding: 14px; background-color: #ffffff; border: 1px solid #d1d5db; border-radius: 8px; font-size: 15px; outline: none; transition: border 0.2s; box-sizing: border-box; }
        .modern-input-box:focus { border-color: #3b82f6; }
        .btn-call-green { width: 100%; background-color: #059669; color: white; padding: 16px; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 8px; transition: background 0.2s; margin-top: 24px;}
        .btn-call-green:hover:not(:disabled) { background-color: #047857; }
        .btn-call-green:disabled { background-color: #6ee7b7; cursor: not-allowed; }
        
        .dial-pad-wrapper { position: relative; width: fit-content; margin: 32px auto 16px auto; display: flex; justify-content: center; }
        .dial-pad-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 0; }
        .dial-key { width: 68px; height: 68px; border-radius: 50%; background: #ffffff; border: 1px solid #e5e7eb; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        .dial-key:hover { background: #f3f4f6; transform: scale(1.05); }
        .dial-key .num { font-size: 26px; font-weight: 500; color: #111827; line-height: 1; }
        .dial-key .letters { font-size: 11px; color: #6b7280; font-weight: 600; margin-top: 2px; }
        
        .backspace-container { position: absolute; right: -75px; bottom: 0; height: 68px; display: flex; align-items: center; justify-content: center; }
        .dial-backspace-btn { background: transparent; border: none; cursor: pointer; color: #6b7280; display: flex; align-items: center; justify-content: center; width: 60px; height: 60px; transition: color 0.2s, transform 0.1s; }
        .dial-backspace-btn:hover { color: #111827; }
        .dial-backspace-btn:active { transform: scale(0.9); }

        .user-dropdown-menu { position: absolute; top: 100%; left: 0; width: 100%; background: white; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); z-index: 50; max-height: 200px; overflow-y: auto; margin-top: 4px; }
        .user-dropdown-item { display: flex; align-items: center; padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f3f4f6; transition: background 0.1s; }
        .user-dropdown-item:hover { background: #f9fafb; }
        .direct-call-btn { background: #10b981; color: white; border: none; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 14px; opacity: 0; transition: opacity 0.2s; }
        .user-dropdown-item:hover .direct-call-btn { opacity: 1; }
        .direct-call-btn:hover { background: #059669; }

        @media (max-width: 768px) { 
          .page-header-top { padding: 16px 16px 8px 16px; } 
          .profile-banner { padding: 8px 16px 20px 16px; }
          .page-tabs { padding: 0 16px; } 
          .messages-scroll { padding: 16px; } 
          .msg-wrapper { max-width: 92%; } 
          .input-bar { padding: 10px 16px; } 
          
          .dial-pad-wrapper { margin: 24px auto 16px auto; }
          .dial-pad-grid { gap: 12px; } 
          .dial-key { width: 60px; height: 60px; } 
          .backspace-container { right: -55px; height: 60px; }
          .dial-backspace-btn { width: 44px; height: 60px; }
        }
      `}</style>

      <div className="page-header-wrapper">
        <div className="page-header-top">
          <button className="back-btn" onClick={() => navigate('/sales/crm')}>← Back</button>
          <h2 className="header-title">Engage Lead</h2>
        </div>
        <div className="profile-banner">
          <div className="profile-avatar">{lead.user?.initials || 'U'}</div>
          <div className="profile-info">
            <div className="profile-name">
              {lead.user?.name}
              <span className="profile-phone">📞 {lead.id}</span>
            </div>
            <div className="profile-email">{lead.user?.email || 'No email provided'}</div>
          </div>
        </div>
        <div className="page-tabs">
          <button className={`tab ${activeTab === 'messages' ? 'active' : ''}`} onClick={() => setActiveTab('messages')}>Messages</button>
          <button className={`tab ${activeTab === 'calls' ? 'active' : ''}`} onClick={() => setActiveTab('calls')}>Calls</button>
          <button className={`tab ${activeTab === 'dialpad' ? 'active' : ''}`} onClick={() => setActiveTab('dialpad')}>Dial pad</button>
        </div>
      </div>

      <div className="page-content-area">
        {activeTab === 'messages' && (
          <>
            <div className="messages-scroll">
              {localHistory?.map((msg, idx) => (
                <div key={idx} className={`msg-wrapper ${msg.direction}`}>
                  <div className={`msg-bubble ${msg.direction}`}>{msg.text}</div>
                  <div className={`msg-time ${msg.direction}`}>{msg.time} {msg.direction === 'outgoing' && <span>✓✓</span>}</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="input-bar">
              <input type="text" className="chat-input" placeholder="Type your message..." value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} disabled={isSending} />
              <button className="send-btn" onClick={handleSendMessage} disabled={isSending || !inputText.trim()}>{isSending ? 'Sending...' : 'Send'}</button>
            </div>
          </>
        )}

        {activeTab === 'calls' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#ffffff', flexShrink: 0 }}>
              <span style={{ fontSize: '15px', fontWeight: '600', color: '#111827' }}>Recent Calls</span>
              <button onClick={() => handleCallNow(lead.id)} disabled={isCalling} style={{ backgroundColor: '#059669', color: 'white', padding: '8px 16px', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: isCalling ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isCalling ? '⏳ Dialing...' : '📞 Call Now'}
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              {lead.calls && lead.calls.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {lead.calls.map((call, idx) => (
                    <div key={idx} style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '16px', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ color: '#111827', fontSize: '14px', fontWeight: '600' }}>{call.date}</div>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <span style={{ color: call.direction === 'inbound' ? '#047857' : '#2563eb', backgroundColor: call.direction === 'inbound' ? '#d1fae5' : '#dbeafe', padding: '4px 10px', borderRadius: '12px', fontSize: '13px', fontWeight: '600' }}>{call.direction === 'inbound' ? '↙ Inbound' : '↗ Outbound'}</span>
                          <span style={{ color: '#6b7280', fontSize: '14px', fontWeight: '500' }}>⏱ {call.duration}</span>
                        </div>
                      </div>
                      <div style={{ width: '100%', marginTop: '8px' }}>
                        {call.recordingUrl ? <audio controls preload="none" style={{ height: '40px', width: '100%', outline: 'none' }}><source src={call.recordingUrl} type="audio/mpeg" /></audio> : <span style={{ color: '#9ca3af', fontSize: '13px', fontStyle: 'italic' }}>No recording available</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280', fontSize: '15px' }}>No call history found for this number.</div>}
            </div>
          </div>
        )}

        {activeTab === 'dialpad' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '100%', maxWidth: '400px' }}>
              <div style={{ marginBottom: '24px' }}>
                <label style={{ fontSize: '14px', color: '#4b5563', fontWeight: '600', marginBottom: '8px', display: 'block' }}>Outgoing call from</label>
                <select className="modern-input-box"><option>+1 (323) 990-7701</option></select>
              </div>
              
              <div style={{ position: 'relative', marginBottom: '16px' }}>
                <input 
                  type="text" 
                  placeholder="🔍 Search user or type number" 
                  className="modern-input-box" 
                  style={{ textAlign: 'center', fontSize: '16px', fontWeight: '600', letterSpacing: '0.5px' }} 
                  value={userSearchTerm || dialPadNumber} 
                  onChange={(e) => { 
                    setUserSearchTerm(e.target.value); 
                    setDialPadNumber(e.target.value); 
                  }} 
                  onFocus={() => setShowUserDropdown(true)} 
                  onBlur={() => setTimeout(() => setShowUserDropdown(false), 200)} 
                />

                {showUserDropdown && (
                  <div className="user-dropdown-menu">
                    {filteredUsers.length === 0 ? <div className="user-dropdown-item" style={{ color: '#6b7280', justifyContent: 'center' }}>No users found</div> : filteredUsers.map((u, i) => {
                      const colors = getUserColor(i);
                      return (
                        <div key={u.id || i} className="user-dropdown-item" onClick={() => { setDialPadNumber(u.phone); setUserSearchTerm(u.phone); setShowUserDropdown(false); }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: colors.bg, color: colors.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 'bold', marginRight: '12px' }}>{getUserInitials(u.name)}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '14px', color: '#111827', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</div>
                            <div style={{ fontSize: '13px', color: '#6b7280' }}>{u.phone}</div>
                          </div>
                          <button className="direct-call-btn" onClick={(e) => { e.stopPropagation(); handleCallNow(u.phone); setShowUserDropdown(false); }}>📞</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="dial-pad-wrapper">
                <div className="dial-pad-grid">
                  {dialKeys.map((key, i) => (
                    <div className="dial-key" key={i} onClick={() => {
                      const currentVal = userSearchTerm || dialPadNumber;
                      const newVal = currentVal + key.num;
                      setUserSearchTerm(newVal);
                      setDialPadNumber(newVal);
                    }}>
                      <span className="num">{key.num}</span><span className="letters">{key.letters}</span>
                    </div>
                  ))}
                </div>
                
                <div className="backspace-container" style={{ visibility: (userSearchTerm || dialPadNumber) ? 'visible' : 'hidden' }}>
                  <button
                    className="dial-backspace-btn"
                    title="Backspace"
                    onClick={() => {
                      const currentVal = userSearchTerm || dialPadNumber;
                      const newVal = currentVal.slice(0, -1);
                      setUserSearchTerm(newVal);
                      setDialPadNumber(newVal);
                    }}
                  >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path>
                      <line x1="18" y1="9" x2="12" y2="15"></line>
                      <line x1="12" y1="9" x2="18" y2="15"></line>
                    </svg>
                  </button>
                </div>
              </div>

              <button className="btn-call-green" onClick={() => handleCallNow(dialPadNumber)} disabled={isCalling || !dialPadNumber}>{isCalling ? '📞 Dialing...' : '📞 Call Now'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
};

export default EngagePage;