import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { io } from 'socket.io-client';
import './EngageModal.css';

const EngageModal = ({ isOpen, onClose, lead, initialTab = 'messages' }) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [inputText, setInputText] = useState('');
  const [localHistory, setLocalHistory] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [isCalling, setIsCalling] = useState(false);

  // ✅ New Dial Pad States
  const [dialPadNumber, setDialPadNumber] = useState('');
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [systemUsers, setSystemUsers] = useState([]);

  const dialKeys = [
    { num: '1', letters: '' }, { num: '2', letters: 'ABC' }, { num: '3', letters: 'DEF' },
    { num: '4', letters: 'GHI' }, { num: '5', letters: 'JKL' }, { num: '6', letters: 'MNO' },
    { num: '7', letters: 'PQRS' }, { num: '8', letters: 'TUV' }, { num: '9', letters: 'WXYZ' },
    { num: '*', letters: '' }, { num: '0', letters: '+' }, { num: '#', letters: '' }
  ];

  // Fetch users for the Dial Pad dropdown
  const fetchSystemUsers = async () => {
    try {
      const response = await fetch('${API_BASE_URL}/users/system-users'); 
      const data = await response.json();
      if (data.success && data.users) {
        setSystemUsers(data.users);
      }
    } catch (error) {
      console.error("Failed to fetch system users", error);
    }
  };

  useEffect(() => {
    if (!lead) return; 

    const socket = io('https://developer.globallimos.com');

    socket.on('new_incoming_message', (newMsg) => {
      console.log("Live message received!", newMsg);

      if (newMsg.customerPhone === lead.id) {
        setLocalHistory((prevHistory) => [...prevHistory, newMsg]);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [lead?.id]); 

  useEffect(() => {
    if (lead) {
      setLocalHistory(lead.fullHistory || []);
      setActiveTab(initialTab);
    }
  }, [lead, isOpen, initialTab]);

  useEffect(() => {
    if (isOpen) {
      fetchSystemUsers(); // Load the users when modal opens
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
    } else {
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    }
    return () => {
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    };
  }, [isOpen]);

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
      const response = await fetch('${API_BASE_URL}/twilio/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: lead.id,
          message: messageToSend
        })
      });
      if (!response.ok) throw new Error("Failed to send");
    } catch (error) {
      console.error("Send error:", error);
      alert("Failed to send message. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  // ✅ Updated handleCallNow to support dynamic numbers from Dial Pad
  const handleCallNow = async (numberToCall) => {
    try {
      setIsCalling(true);
      
      const finalNumberToCall = numberToCall || lead.id;

      const response = await fetch('${API_BASE_URL}/twilio/call', {
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
      { bg: '#22c55e', color: '#ffffff' }, 
      { bg: '#3b82f6', color: '#ffffff' }, 
      { bg: '#a855f7', color: '#ffffff' }, 
      { bg: '#f97316', color: '#ffffff' }  
    ];
    return colors[index % colors.length];
  };

  const filteredUsers = systemUsers.filter(u => 
    u.name?.toLowerCase().includes(userSearchTerm?.toLowerCase() || '') ||
    u.phone?.includes(userSearchTerm || '')
  );

  if (!isOpen || !lead) return null;

  return createPortal(
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,                           
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 999999,
        padding: '16px',
        boxSizing: 'border-box',
        WebkitOverflowScrolling: 'touch',   
      }}
    >
      {/* Dynamic Embedded Styles for Dial Pad */}
      <style>{`
        .modern-input-box { width: 100%; padding: 12px; background-color: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 14px; outline: none; transition: border 0.2s; box-sizing: border-box; }
        .modern-input-box:focus { border-color: #3b82f6; background-color: #fff; }
        .btn-call-green { width: 100%; background-color: #059669; color: white; padding: 12px; border: none; border-radius: 6px; font-size: 14px; font-weight: bold; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 8px; transition: background 0.2s; margin-top: 20px;}
        .btn-call-green:hover { background-color: #047857; }
        .btn-call-green:disabled { background-color: #6ee7b7; cursor: not-allowed; }
        
        .dial-pad-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; max-width: 220px; margin: 24px auto; }
        .dial-key { width: 60px; height: 60px; border-radius: 50%; background: #ffffff; border: 1px solid #e5e7eb; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .dial-key:hover { background: #f3f4f6; border-color: #d1d5db; }
        .dial-key .num { font-size: 20px; font-weight: 500; color: #111827; line-height: 1; }
        .dial-key .letters { font-size: 10px; color: #6b7280; font-weight: 600; margin-top: 2px; }
        
        .user-dropdown-menu { position: absolute; top: 100%; left: 0; width: 100%; background: white; border: 1px solid #e5e7eb; border-radius: 6px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); z-index: 50; max-height: 200px; overflow-y: auto; margin-top: 4px; }
        .user-dropdown-item { display: flex; align-items: center; padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f3f4f6; transition: background 0.1s; }
        .user-dropdown-item:hover { background: #f9fafb; }
        .direct-call-btn { background: #10b981; color: white; border: none; border-radius: 50%; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 10px; opacity: 0; transition: opacity 0.2s; }
        .user-dropdown-item:hover .direct-call-btn { opacity: 1; }
        .direct-call-btn:hover { background: #059669; }
      `}</style>

      <div
        className="modal-container"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '550px',
          height: '85vh',                   
          maxHeight: '85dvh',               
          flexShrink: 0,                   
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#fff',
          borderRadius: '12px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >

        {/* TOP SECTION (Does not shrink) */}
        <div style={{ flexShrink: 0 }}>
          <div className="modal-header">
            <h2>Reply / Engage Lead</h2>
            <button className="close-btn" onClick={onClose}>✕</button>
          </div>

          <div className="modal-profile">
            <div className="profile-avatar">{lead.user?.initials || 'U'}</div>
            <div className="profile-info">
              <div className="profile-name-row">
                <h3>{lead.user?.name}</h3>
                <span className="profile-phone">📞 {lead.id}</span>
              </div>
              <div className="profile-email">{lead.user?.email}</div>
            </div>
          </div>

          <div className="context-bar">
            <div className="context-text">🏷️ {lead.lead?.description || 'Direct SMS Conversation'}</div>
            <div className="context-date">{lead.lead?.date} <span>⌄</span></div>
          </div>

          <div className="accordion-toggle">
            Lead Details <span>⌄</span>
          </div>

          {/* ✅ UPDATED TABS TO INCLUDE DIAL PAD */}
          <div className="modal-tabs">
            <button
              className={`tab ${activeTab === 'messages' ? 'active' : ''}`}
              onClick={() => setActiveTab('messages')}
            >
              Messages
            </button>
            <button
              className={`tab ${activeTab === 'calls' ? 'active' : ''}`}
              onClick={() => setActiveTab('calls')}
            >
              Calls
            </button>
            <button
              className={`tab ${activeTab === 'dialpad' ? 'active' : ''}`}
              onClick={() => setActiveTab('dialpad')}
            >
              Dial pad
            </button>
          </div>
        </div>

        {/* MIDDLE SECTION (Scrolls internally) */}

        {/* MESSAGES TAB */}
        {activeTab === 'messages' && (
          <div className="tab-content-messages" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div className="messages-scroll-area" style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              {localHistory?.map((msg, idx) => (
                <div
                  key={idx}
                  className={`modal-msg-wrapper ${msg.direction}`}
                  style={{ maxWidth: '85%', wordBreak: 'break-word', marginBottom: '12px' }}
                >
                  <div className={`modal-msg-bubble ${msg.direction}`}>
                    {msg.text}
                  </div>
                  <div className="modal-msg-time">
                    {msg.time} {msg.direction === 'outgoing' && <span className="read-receipt">✓✓</span>}
                  </div>
                </div>
              ))}
            </div>

            <div className="message-input-area" style={{ padding: '12px 16px', borderTop: '1px solid #eaecef', display: 'flex', gap: '8px', flexShrink: 0 }}>
              <button className="attach-btn">📎</button>
              <input
                type="text"
                placeholder="Type your message..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                disabled={isSending}
                style={{ flex: 1, minWidth: 0 }}
              />
              <button
                className="send-btn"
                onClick={handleSendMessage}
                disabled={isSending || !inputText.trim()}
              >
                Send
              </button>
            </div>
          </div>
        )}

        {/* CALLS TAB */}
        {activeTab === 'calls' && (
          <div className="tab-content-calls" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              padding: '12px 16px',
              borderBottom: '1px solid #eaecef',
              backgroundColor: '#f8fafc',
              flexShrink: 0
            }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                Recent Calls
              </span>
              <button 
                onClick={() => handleCallNow(lead.id)}
                disabled={isCalling}
                style={{
                  backgroundColor: '#059669',
                  color: 'white',
                  padding: '6px 14px',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: isCalling ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  opacity: isCalling ? 0.7 : 1,
                  transition: 'background-color 0.2s'
                }}
              >
                {isCalling ? '⏳ Dialing...' : '📞 Call Now'}
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              {lead.calls && lead.calls.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {lead.calls.map((call, idx) => (
                    <div key={idx} style={{ 
                      backgroundColor: '#ffffff', 
                      borderRadius: '8px', 
                      padding: '12px', 
                      border: '1px solid #eaecef',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ color: '#2d3748', fontSize: '13.5px', fontWeight: '600' }}>
                          {call.date}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ 
                            color: call.direction === 'inbound' ? '#047857' : '#2b6cb0', 
                            backgroundColor: call.direction === 'inbound' ? '#d1fae5' : '#ebf8ff',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: '500'
                          }}>
                            {call.direction === 'inbound' ? '↙ Inbound' : '↗ Outbound'}
                          </span>
                          <span style={{ color: '#4a5568', fontSize: '13px', fontWeight: '500' }}>
                            ⏱ {call.duration}
                          </span>
                        </div>
                      </div>

                      <div style={{ width: '100%', marginTop: '4px' }}>
                        {call.recordingUrl ? (
                          <audio controls preload="none" style={{ height: '35px', width: '100%', outline: 'none' }}>
                            <source src={call.recordingUrl} type="audio/mpeg" />
                            Your browser does not support audio.
                          </audio>
                        ) : (
                          <span style={{ color: '#a0aec0', fontSize: '12px', fontStyle: 'italic' }}>
                            No recording available
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#718096' }}>
                  No call history found for this number.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ✅ NEW: DIAL PAD TAB */}
        {activeTab === 'dialpad' && (
          <div className="tab-content-dialpad" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: '20px', overflowY: 'auto' }}>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', color: '#4b5563', fontWeight: '600', marginBottom: '8px', display: 'block' }}>Outgoing call from</label>
              <select className="modern-input-box">
                <option>+1 (415) 518-9121</option>
              </select>
            </div>

            {/* Search & AutoComplete */}
            <div style={{ position: 'relative', marginBottom: '8px' }}>
              <input
                type="text"
                placeholder="🔍 Search user to dial"
                className="modern-input-box"
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
                  {filteredUsers.length === 0 ? (
                    <div className="user-dropdown-item" style={{ color: '#6b7280', justifyContent: 'center' }}>
                      No users found
                    </div>
                  ) : (
                    filteredUsers.map((u, i) => {
                      const colors = getUserColor(i);
                      return (
                        <div key={u.id || i} className="user-dropdown-item" onClick={() => {
                          setDialPadNumber(u.phone);
                          setUserSearchTerm(u.name);
                          setShowUserDropdown(false);
                        }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: colors.bg, color: colors.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold', marginRight: '12px' }}>
                            {getUserInitials(u.name)}
                          </div>
                          <div style={{ flex: 1, fontSize: '14px', color: '#111827', fontWeight: '500' }}>{u.name}</div>
                          <div style={{ fontSize: '13px', color: '#6b7280', marginRight: '10px' }}>{u.phone}</div>
                          
                          <button 
                            className="direct-call-btn"
                            onClick={(e) => {
                              e.stopPropagation(); 
                              handleCallNow(u.phone);
                              setShowUserDropdown(false);
                            }}
                            title="Call Instantly"
                          >
                            📞
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Dial Grid */}
            <div className="dial-pad-grid">
              {dialKeys.map((key, i) => (
                <div className="dial-key" key={i} onClick={() => setDialPadNumber(prev => prev + key.num)}>
                  <span className="num">{key.num}</span>
                  <span className="letters">{key.letters}</span>
                </div>
              ))}
            </div>

            <button
              className="btn-call-green"
              onClick={() => handleCallNow(dialPadNumber)}
              disabled={isCalling || !dialPadNumber}
            >
              {isCalling ? '📞 Dialing...' : '📞 Call Now'}
            </button>

          </div>
        )}

      </div>
    </div>,
    document.body
  );
};

export default EngageModal;