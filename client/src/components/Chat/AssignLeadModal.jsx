import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { io } from 'socket.io-client';
import RefineSearchModal from '../Inventory/RefineSearchModal';
import './AssignLeadModal.css';
import { API_BASE_URL } from '../../services/api';

const AssignLeadModal = ({ isOpen, onClose, lead, existingLeadData, onLeadSaved }) => {

  const [activeTab, setActiveTab] = useState('messages');
  const [inputText, setInputText] = useState('');
  const [localHistory, setLocalHistory] = useState([]);
  const [isSending, setIsSending] = useState(false);

  // Form States
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedPhone, setSelectedPhone] = useState('');

  const [isCreating, setIsCreating] = useState(false);
  const [selectedLeadTypes, setSelectedLeadTypes] = useState([]);
  const [selectedListings, setSelectedListings] = useState([]);
  const [selectedMemberships, setSelectedMemberships] = useState([]);
  const [serviceType, setServiceType] = useState('SMS');

  const [serviceSubTab, setServiceSubTab] = useState('Text');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isCalling, setIsCalling] = useState(false);

  // Call Panel States
  const [callTab, setCallTab] = useState('Call');
  const [customPhone, setCustomPhone] = useState('');
  const [dialPadNumber, setDialPadNumber] = useState('');
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  const [contactMode, setContactMode] = useState('existing');
  const [contactSearchTerm, setContactSearchTerm] = useState('');
  const [showContactDropdown, setShowContactDropdown] = useState(false);

  const [systemUsers, setSystemUsers] = useState([]);

  const [availableCallingNumbers, setAvailableCallingNumbers] = useState([]);
  const [selectedCallingNumber, setSelectedCallingNumber] = useState('');

  // Advanced Audio & History States
  const audioRef = useRef(new Audio());
  const [callHistory, setCallHistory] = useState([]);
  const [playingUrl, setPlayingUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [isRefreshingHistory, setIsRefreshingHistory] = useState(false);

  // Ref to the bottom of the chat history div (not the page)
  const messagesEndRef = useRef(null);
  // Ref to the scrollable history container itself
  const historyScrollRef = useRef(null);

  const [vehicleSearchTerm, setVehicleSearchTerm] = useState('');
  const [vehicleResults, setVehicleResults] = useState([]);

  const [selectedVehicles, setSelectedVehicles] = useState([]);
  // const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isRefineModalOpen, setIsRefineModalOpen] = useState(false);

  const [leadStatus, setLeadStatus] = useState('');
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);

  const LEAD_STATUSES = [
    { id: 'Intake', icon: '🔵' },
    { id: 'Qualified', icon: '✅' },
    { id: 'Converted', icon: '⭐' },
    { id: 'Lost', icon: '❌' },
    { id: 'Not Qualified', icon: '➖' }
  ];

  const dialKeys = [
    { num: '1', letters: '' }, { num: '2', letters: 'ABC' }, { num: '3', letters: 'DEF' },
    { num: '4', letters: 'GHI' }, { num: '5', letters: 'JKL' }, { num: '6', letters: 'MNO' },
    { num: '7', letters: 'PQRS' }, { num: '8', letters: 'TUV' }, { num: '9', letters: 'WXYZ' },
    { num: '*', letters: '' }, { num: '0', letters: '+' }, { num: '#', letters: '' }
  ];

  const handleToggle = (item, stateList, setStateFunc) => {
    if (stateList.includes(item)) {
      setStateFunc(stateList.filter(i => i !== item));
    } else {
      setStateFunc([...stateList, item]);
    }
  };

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

  const fetchAssignedVehicles = async (leadId) => {
    try {
      const encodedLeadId = encodeURIComponent(leadId);
      const response = await fetch(`${API_BASE_URL}/leads/${encodedLeadId}/vehicles`);
      const data = await response.json();
      if (data.success) {
        setSelectedVehicles(data.data);
      }
    } catch (error) {
      console.error("Failed to load assigned vehicles", error);
    }
  };

  const autoSaveVehicles = async (vehiclesList) => {
    if (!lead || !lead.id) return;
    try {
      const vehicleIds = vehiclesList.map(car => car.id);
      const encodedLeadId = encodeURIComponent(lead.id);

      await fetch(`${API_BASE_URL}/leads/${encodedLeadId}/vehicles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleIds })
      });
    } catch (error) {
      console.error("Error auto-saving vehicles:", error);
    }
  };

  const fetchCustomNumbers = async (leadId) => {
    try {
      const encodedLeadId = encodeURIComponent(leadId);
      const response = await fetch(`${API_BASE_URL}/leads/${encodedLeadId}/custom-numbers`);
      const data = await response.json();

      let allNumbers = [leadId];
      if (data.success) {
        allNumbers = Array.from(new Set([leadId, ...data.numbers]));
      }

      setAvailableCallingNumbers(allNumbers);
      fetchCallHistory(allNumbers);

    } catch (error) {
      console.error("Failed to load custom numbers", error);
      setAvailableCallingNumbers([leadId]);
      fetchCallHistory([leadId]);
    }
  };

  const loadCallHistory = (currentLead) => {
    if (!currentLead || !currentLead.calls) {
      setCallHistory([]);
      return;
    }

    const formattedCalls = currentLead.calls.map(c => {
      let displayType = 'Call';
      let displayStatus = '';

      if (c.type === 'incoming') {
        displayType = 'Incoming Call';
        displayStatus = c.duration !== '—' ? 'Answered' : 'Missed';
      } else if (c.type === 'outgoing') {
        displayType = 'Outgoing Call';
      } else if (c.type === 'missed') {
        displayType = 'Missed Call';
        displayStatus = 'Missed';
      }

      return {
        id: c.id,
        type: displayType,
        date: c.date,
        number: currentLead.id,
        duration: c.duration !== '—' ? c.duration : '',
        status: displayStatus,
        recordingUrl: c.recordingUrl
      };
    });

    setCallHistory(formattedCalls);
  };

  const fetchCallHistory = async (numbersArray) => {
    if (!numbersArray || numbersArray.length === 0) return;
    setIsRefreshingHistory(true);

    try {
      const response = await fetch('${API_BASE_URL}/twilio/lead-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numbers: numbersArray })
      });
      const data = await response.json();

      if (data.success) {
        setCallHistory(data.history);
      }
    } catch (error) {
      console.error("Failed to fetch custom call history:", error);
    } finally {
      setIsRefreshingHistory(false);
    }
  };

  // REAL-TIME LISTENER
  useEffect(() => {
    if (!isOpen || !lead) return;

    const socket = io('https://developer.globallimos.com');

    socket.on('new_incoming_message', (incomingMsg) => {
      const leadPhoneShort = lead.id ? lead.id.slice(-10) : '';
      const incomingPhoneShort = incomingMsg.customerPhone ? incomingMsg.customerPhone.slice(-10) : '';

      if (leadPhoneShort && incomingPhoneShort === leadPhoneShort) {
        setLocalHistory((prevHistory) => [...prevHistory, incomingMsg]);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [isOpen, lead]);


  useEffect(() => {
    let intervalId;
    if (isOpen && callTab === 'History' && availableCallingNumbers.length > 0) {
      intervalId = setInterval(() => {
        fetchCallHistory(availableCallingNumbers);
      }, 10000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isOpen, callTab, availableCallingNumbers]);

  useEffect(() => {
    const audio = audioRef.current;
    const handleTimeUpdate = () => {
      if (audio.duration) {
        setPlaybackProgress((audio.currentTime / audio.duration) * 100);
      }
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setPlaybackProgress(0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const scrollToBottom = (scrollBehavior = 'smooth') => {
    if (historyScrollRef.current) {
      historyScrollRef.current.scrollTop = historyScrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    if (serviceSubTab === 'History') {
      requestAnimationFrame(() => {
        scrollToBottom('auto');
      });
    }
  }, [serviceSubTab]);

  useEffect(() => {
    scrollToBottom('smooth');
  }, [localHistory]);

  const togglePlay = (url) => {
    if (!url) return;
    const audio = audioRef.current;

    if (playingUrl === url) {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        audio.play();
        setIsPlaying(true);
      }
    } else {
      audio.pause();
      audio.src = url;
      audio.load();
      audio.play();
      setPlayingUrl(url);
      setIsPlaying(true);
      setPlaybackProgress(0);
    }
  };

  const getCallStyle = (type, status) => {
    const lType = (type || '').toLowerCase();
    const lStatus = (status || '').toLowerCase();

    if (lType.includes('missed') || lStatus.includes('missed') || lStatus.includes('no-answer') || lStatus.includes('failed') || lStatus.includes('busy')) {
      return { icon: '❌', color: '#dc2626' };
    }
    if (lType.includes('incoming') || lType.includes('inbound')) {
      return { icon: '↙️', color: '#2563eb' };
    }
    return { icon: '↗️', color: '#16a34a' };
  };

  useEffect(() => {
    if (lead && isOpen) {
      setLocalHistory(lead.fullHistory || []);

      const isReg = lead.user?.name !== "Un-registered";
      setContactMode(isReg ? 'existing' : 'new');

      const nameParts = lead.user?.name?.split(' ') || [];
      const parsedFirst = !isReg ? '' : (nameParts[0] || '');
      const parsedLast = !isReg ? '' : (nameParts.slice(1).join(' ') || '');

      setFirstName(parsedFirst);
      setLastName(parsedLast);
      setEmail(lead.user?.email === "No email provided" ? "" : (lead.user?.email || ''));
      setBusinessName(lead.user?.company || '');
      setInputText('');
      setActiveTab('messages');
      setServiceSubTab('Text');

      if (existingLeadData) {
        setSelectedLeadTypes(existingLeadData.leadTypes || []);
        setSelectedListings(existingLeadData.listings || []);
        setSelectedMemberships(existingLeadData.memberships || []);
        setServiceType(existingLeadData.serviceType || 'SMS');
        setLeadStatus(existingLeadData.status || 'Intake');

        if (lead.id) {
          fetchAssignedVehicles(lead.id);
        }

      } else {
        setSelectedLeadTypes([]);
        setSelectedListings([]);
        setSelectedMemberships([]);
        setServiceType('SMS');
        setLeadStatus('Intake');
        setSelectedVehicles([]);

        if (lead.isCheckAvailability) {
          setSelectedLeadTypes(['Check Availability']);
        }
      }

      setCallTab('Call');
      setCustomPhone('');
      setDialPadNumber('');
      setUserSearchTerm('');
      setContactSearchTerm('');
      setShowContactDropdown(false);

      if (lead.id) {
        setSelectedCallingNumber(lead.id);
        fetchCustomNumbers(lead.id);
      }

      audioRef.current.pause();
      setIsPlaying(false);
      setPlayingUrl(null);
      setPlaybackProgress(0);

      // fetchAssignedVehicles(lead.id);
      fetchSystemUsers();
    }
  }, [lead, isOpen, existingLeadData]);

  useEffect(() => {
    if (isOpen) {
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
      if (scrollY) window.scrollTo(0, parseInt(scrollY || '0') * -1);

      audioRef.current.pause();
      setIsPlaying(false);
      setPlayingUrl(null);
    }
    return () => {
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      if (scrollY) window.scrollTo(0, parseInt(scrollY || '0') * -1);
    }
  }, [isOpen]);

  if (!isOpen || !lead) return null;

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

  const handleCreateAccount = async () => {
    // 1. Basic validation
    if (!firstName || !lastName || !email) {
      alert("⚠️ Please fill in First Name, Last Name, and Email to create an account.");
      return;
    }

    try {
      setIsCreating(true);

      const payload = {
        phone: lead.id, // This is the phone number from the Twilio thread
        firstName: firstName,
        lastName: lastName,
        businessName: businessName,
        email: email,
        selectedVehicles: selectedVehicles, // Passes any selected cars
        agentId: 1 // Replace with actual logged-in user ID if you have it
      };

      // 2. Call your backend route (Make sure this matches your actual routes file!)
      const response = await fetch('${API_BASE_URL}/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to create account");
      }

      alert("✅ Account created successfully!");

      // 3. Trigger the dashboard to refresh and close the modal
      if (onLeadSaved) onLeadSaved();
      onClose();

    } catch (error) {
      console.error("Error creating account:", error);
      alert(`❌ ${error.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateLead = async () => {
    try {
      setIsUpdating(true);

      const payload = {
        phone: lead.id,
        userId: selectedUserId,
        preferenceId: existingLeadData ? existingLeadData.id : null,
        leadTypes: selectedLeadTypes,
        leadStatus: leadStatus,
        listings: selectedListings,
        memberships: selectedMemberships,
        serviceType: serviceType,
        selectedVehicles: selectedVehicles
      };

      const response = await fetch('${API_BASE_URL}/users/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to update preferences");
      }

      alert("✅ Lead preferences updated successfully!");
      if (onLeadSaved) onLeadSaved(); // ✅ Triggers the dashboard refresh
      onClose();
    } catch (error) {
      console.error("Error updating lead:", error);
      alert("❌ Failed to update lead preferences.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCallNow = async (numberToCall) => {
    try {
      setIsCalling(true);

      let finalNumberToCall = numberToCall;
      if (!finalNumberToCall) {
        finalNumberToCall = selectedCallingNumber;
      }

      if (finalNumberToCall && !availableCallingNumbers.includes(finalNumberToCall)) {
        const updatedNumbers = [...availableCallingNumbers, finalNumberToCall];
        setAvailableCallingNumbers(updatedNumbers);

        try {
          const encodedLeadId = encodeURIComponent(lead.id);
          await fetch(`${API_BASE_URL}/leads/${encodedLeadId}/custom-numbers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber: finalNumberToCall })
          });
        } catch (error) {
          console.error("Failed to save custom number to DB", error);
        }
      }

      if (finalNumberToCall) {
        setSelectedCallingNumber(finalNumberToCall);
      }

      const response = await fetch('${API_BASE_URL}/twilio/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadPhone: finalNumberToCall })
      });
      if (!response.ok) throw new Error("Call failed");

      alert(`📞 Ringing your phone now! Please pick up to connect to ${finalNumberToCall}.`);

      setCustomPhone('');
      setDialPadNumber('');
      setUserSearchTerm('');

      setTimeout(() => fetchCallHistory(availableCallingNumbers), 5000);

    } catch (error) {
      console.error("Call error:", error);
      alert("❌ Failed to initiate the call. Check console for details.");
    } finally {
      setTimeout(() => setIsCalling(false), 3000);
    }
  };

  const getDotColor = (svc) => {
    switch (svc) {
      case 'SMS': return '#10b981';
      case 'W-App': return '#10b981';
      case 'RC': return '#f59e0b';
      case 'Apple': return '#3b82f6';
      default: return '#cbd5e1';
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

  const filteredContacts = systemUsers.filter(u =>
    u.name?.toLowerCase().includes(contactSearchTerm?.toLowerCase() || '') ||
    u.email?.toLowerCase().includes(contactSearchTerm?.toLowerCase() || '')
  );

  return (
    <>
      <style>{`
        .call-nav-tabs { display: flex; align-items: center; border-bottom: 1px solid #e5e7eb; padding: 0 16px; margin-bottom: 20px; }
        .call-nav-tab { padding: 12px 16px; font-size: 14px; font-weight: 600; color: #6b7280; cursor: pointer; border-bottom: 2px solid transparent; background: none; border-top: none; border-left: none; border-right: none; }
        .call-nav-tab:hover { color: #111827; }
        .call-nav-tab.active { color: #2563eb; border-bottom: 2px solid #2563eb; }
        .modern-input-box { width: 100%; padding: 12px; background-color: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 14px; outline: none; transition: border 0.2s; }
        .modern-input-box:focus { border-color: #3b82f6; background-color: #fff; }
        .btn-call-green { width: 100%; background-color: #059669; color: white; padding: 12px; border: none; border-radius: 6px; font-size: 14px; font-weight: bold; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 8px; transition: background 0.2s; }
        .btn-call-green:hover { background-color: #047857; }
        .btn-call-green:disabled { background-color: #6ee7b7; cursor: not-allowed; }
        
        .history-row { display: flex; align-items: center; padding: 12px 0; border-bottom: 1px solid #f3f4f6; }
        .history-icon-circle { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; border: 1px solid currentColor; margin-right: 12px; flex-shrink: 0; }
        .status-badge { font-size: 10px; font-weight: bold; color: #059669; border: 1px solid #059669; padding: 2px 6px; border-radius: 4px; margin-left: 8px; }

        .history-play-wrapper { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-left: auto; transition: transform 0.1s; background-color: #e5e7eb; }
        .history-play-wrapper:active { transform: scale(0.95); }
        .history-play-inner { width: 28px; height: 28px; background: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #3b82f6; font-size: 10px; border: 1px solid #e5e7eb; }

        .dial-pad-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; }
        .dial-key { width: 60px; height: 60px; border-radius: 50%; background: #ffffff; border: 1px solid #e5e7eb; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .dial-key:hover { background: #f3f4f6; border-color: #d1d5db; }
        .dial-key .num { font-size: 20px; font-weight: 500; color: #111827; line-height: 1; }
        .dial-key .letters { font-size: 10px; color: #6b7280; font-weight: 600; margin-top: 2px; }
        
        .user-dropdown-menu { position: absolute; top: 100%; left: 0; width: 100%; background: white; border: 1px solid #e5e7eb; border-radius: 6px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); z-index: 50; max-height: 250px; overflow-y: auto; margin-top: 4px; }
        .user-dropdown-item { display: flex; align-items: center; padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f3f4f6; transition: background 0.1s; }
        .user-dropdown-item:hover { background: #f9fafb; }
        .direct-call-btn { background: #10b981; color: white; border: none; border-radius: 50%; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 10px; opacity: 0; transition: opacity 0.2s; }
        .user-dropdown-item:hover .direct-call-btn { opacity: 1; }
        .direct-call-btn:hover { background: #059669; }

        .contact-toggle-row { display: flex; gap: 10px; margin-bottom: 20px; align-items: center; }
        .existing-user-select { flex: 1; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; position: relative; color: #2563eb; font-weight: 500; font-size: 14px; background: white; }
        .add-user-btn { background: white; border: 1px solid #f97316; color: #f97316; border-radius: 6px; padding: 10px 16px; font-size: 14px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s; }
        .add-user-btn:hover { background: #fff7ed; }
        .add-user-btn.active { background: #f97316; color: white; }
        .contact-dropdown-menu { position: absolute; top: 100%; left: 0; width: 100%; background: white; border: 1px solid #e5e7eb; border-radius: 6px; box-shadow: 0 4px 15px rgba(0,0,0,0.15); z-index: 60; margin-top: 5px; max-height: 280px; overflow-y: auto; }
        .contact-search-box { padding: 10px; border-bottom: 1px solid #e5e7eb; position: sticky; top: 0; background: white; z-index: 2; }
        .contact-search-box input { width: 100%; padding: 8px 12px 8px 30px; border: 1px solid #e5e7eb; border-radius: 4px; font-size: 13px; outline: none; }
        .contact-dropdown-item { padding: 12px; display: flex; align-items: center; gap: 12px; cursor: pointer; border-bottom: 1px solid #f3f4f6; }
        .contact-dropdown-item:hover { background-color: #f9fafb; }
        .contact-avatar { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; flex-shrink: 0; }
        .contact-info { display: flex; flex-direction: column; overflow: hidden; }
        .contact-name { font-size: 14px; font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .contact-email { font-size: 12px; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      `}</style>

      {createPortal(
        <div className="modal-backdrop" onClick={onClose}>
          <div className="crm-modal-container" onClick={(e) => e.stopPropagation()}>

            <div className="crm-modal-header">
              <h2>Reply / Engage Lead</h2>
              <div className="header-actions">
                <button className="icon-btn close" onClick={onClose}>✕</button>
              </div>
            </div>

            <div className="crm-grid">
              {/* ================= LEFT COLUMN ================= */}
              <div className="crm-col">
                <div className="crm-panel">
                  <div className="panel-header">
                    <h3>👤 Contact Information</h3>
                    <span className="collapse-icon">^</span>
                  </div>
                  <div className="panel-body">

                    <div className="contact-toggle-row">
                      <div style={{ position: 'relative', flex: 1 }}>
                        <div
                          className="existing-user-select"
                          onClick={() => {
                            setContactMode('existing');
                            setShowContactDropdown(!showContactDropdown);
                          }}
                          style={{ borderColor: contactMode === 'existing' ? '#3b82f6' : '#e5e7eb' }}
                        >
                          Existing User
                          <span style={{ color: '#9ca3af', fontSize: '12px' }}>{showContactDropdown ? '▲' : '▼'}</span>
                        </div>

                        {showContactDropdown && contactMode === 'existing' && (
                          <div className="contact-dropdown-menu">
                            <div className="contact-search-box">
                              <span style={{ position: 'absolute', left: '18px', top: '18px', fontSize: '14px', color: '#9ca3af' }}>🔍</span>
                              <input
                                type="text"
                                placeholder="Search by name..."
                                value={contactSearchTerm}
                                onChange={(e) => setContactSearchTerm(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>

                            {filteredContacts.length === 0 ? (
                              <div style={{ padding: '15px', textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>No users found</div>
                            ) : (
                              filteredContacts.map((u, i) => {
                                const colors = getUserColor(i);
                                return (
                                  <div key={u.id} className="contact-dropdown-item" onClick={() => {
                                    setFirstName(u.name.split(' ')[0] || '');
                                    setLastName(u.name.split(' ').slice(1).join(' ') || '');
                                    setEmail(u.email || '');
                                    setBusinessName(u.company || '');
                                    setSelectedUserId(u.id);
                                    setSelectedPhone(u.phone || '');
                                    setShowContactDropdown(false);
                                  }}>
                                    <div className="contact-avatar" style={{ backgroundColor: colors.bg, color: colors.color }}>
                                      {getUserInitials(u.name)}
                                    </div>
                                    <div className="contact-info">
                                      <span className="contact-name">{u.name}</span>
                                      <span className="contact-email">{u.email || u.phone}</span>
                                    </div>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        )}
                      </div>

                      <button
                        className={`add-user-btn ${contactMode === 'new' ? 'active' : ''}`}
                        onClick={() => {
                          setContactMode('new');
                          setShowContactDropdown(false);
                          setFirstName('');
                          setLastName('');
                          setEmail('');
                          setBusinessName('');
                        }}
                      >
                        <span style={{ fontSize: '18px', lineHeight: 1, marginTop: '-2px' }}>+</span> Add User
                      </button>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>First name</label>
                        <input type="text" placeholder="First name" onChange={(e) => setFirstName(e.target.value)} value={firstName} />
                      </div>
                      <div className="form-group">
                        <label>Last name</label>
                        <input type="text" placeholder="Last name" onChange={(e) => setLastName(e.target.value)} value={lastName} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Business name</label>
                      <input type="text" placeholder="Transportation LLC" onChange={(e) => setBusinessName(e.target.value)} value={businessName} />
                    </div>
                    <div className="form-group">
                      <label>Email</label>
                      <input type="email" placeholder="email@example.com" onChange={(e) => setEmail(e.target.value)} value={email} />
                    </div>

                    <button
                      className="create-account-btn"
                      style={{ backgroundColor: contactMode === 'existing' ? '#2b6cb0' : '#10b981', marginTop: '15px' }}
                      onClick={contactMode === 'existing' ? handleUpdateLead : handleCreateAccount}
                      disabled={isUpdating || isCreating}
                    >
                      {contactMode === 'existing'
                        ? (isUpdating ? 'Updating...' : 'Update Lead Preferences')
                        : (isCreating ? 'Creating...' : 'Create Account')
                      }
                    </button>
                  </div>
                </div>

                <div className="crm-panel" style={{ overflow: 'visible', position: 'relative', zIndex: 10 }}>
                  <div className="panel-header">
                    <h3>🏷️ Lead Type (select one or more)</h3>
                    <span className="collapse-icon">^</span>
                  </div>
                  <div className="panel-body">
                    <div className="checkbox-grid">
                      {['Membership', 'Listing', 'Ads', 'Check Availability', 'Buyer', 'Seller', 'Finance'].map((type) => (
                        <label key={type}><input type="checkbox" checked={selectedLeadTypes.includes(type)} onChange={() => handleToggle(type, selectedLeadTypes, setSelectedLeadTypes)} /> {type}</label>
                      ))}
                    </div>
                    <div style={{ marginTop: '20px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '8px' }}>Lead Status</label>
                      <div className="status-dropdown-container">
                        <div className="status-dropdown-selected" onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}>
                          <span>{leadStatus ? `${LEAD_STATUSES.find(s => s.id === leadStatus)?.icon} ${leadStatus}` : <span style={{ color: '#9ca3af' }}>Select lead status</span>}</span>
                          <span style={{ fontSize: '12px', color: '#6b7280' }}>{isStatusDropdownOpen ? '▲' : '▼'}</span>
                        </div>
                        {isStatusDropdownOpen && (
                          <div className="status-dropdown-menu">
                            {LEAD_STATUSES.map((status) => (
                              <div key={status.id} className="status-option" onClick={() => { setLeadStatus(status.id); setIsStatusDropdownOpen(false); }}>
                                <span>{status.icon}</span> <span>{status.id}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="crm-panel">
                  <div className="panel-header">
                    <h3>🚗 Vehicle</h3>
                    <span className="collapse-icon">^</span>
                  </div>
                  <div className="panel-body">
                    <button onClick={() => setIsRefineModalOpen(true)} style={{ width: '100%', padding: '10px', backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '6px', color: '#4b5563', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                      <span style={{ fontSize: '16px' }}>🔍</span> Search with seller name, year, & make...
                    </button>
                    <div className="selected-vehicles-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {selectedVehicles.map((car) => (
                        <div key={car.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', paddingBottom: '12px', borderBottom: '1px solid #f3f4f6' }}>
                          <button onClick={() => { const updatedList = selectedVehicles.filter(v => v.id !== car.id); setSelectedVehicles(updatedList); autoSaveVehicles(updatedList); }} style={{ background: '#fef2f2', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, marginTop: '2px', fontSize: '12px', fontWeight: 'bold' }} title="Remove Vehicle">✕</button>
                          <div style={{ background: '#16a34a', borderRadius: '4px', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0, marginTop: '3px' }}>✓</div>
                          <div>
                            <div style={{ fontWeight: '700', color: '#111827', fontSize: '14px', marginBottom: '2px' }}>{car.year} {car.make_name} {car.model_name}</div>

                            <div style={{ fontSize: '12px', color: '#6b7280' }}>
                              {car.mileage && !isNaN(Number(car.mileage)) && Number(car.mileage) !== 0
                                ? `${Number(car.mileage).toLocaleString()} miles`
                                : 'N/A miles'} • {car.location || 'Location N/A'} • 200 miles away
                            </div>

                          </div>
                        </div>
                      ))}
                      {selectedVehicles.length === 0 && (<div style={{ fontSize: '13px', color: '#9ca3af', fontStyle: 'italic' }}>No vehicles selected. Click the search bar above to add vehicles.</div>)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', marginTop: '16px' }}>
                      <button className="text-link" onClick={() => window.open('https://developer.globallimos.com/sales/all-listing', '_blank')}>View all vehicles</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* ================= RIGHT COLUMN ================= */}
              <div className="crm-col">

                <div className="crm-panel">
                  <div className="panel-header">
                    <h3>📎 Listings / Memberships</h3>
                    <span className="collapse-icon">^</span>
                  </div>
                  <div className="panel-body">
                    <p className="sub-label">Listings</p>
                    <div className="price-grid">{['$79.99', '$199', '$499'].map((price) => (<label key={price}><input type="checkbox" checked={selectedListings.includes(price)} onChange={() => handleToggle(price, selectedListings, setSelectedListings)} /> {price}</label>))}</div>
                    <p className="sub-label" style={{ marginTop: '10px' }}>Memberships</p>
                    <div className="price-grid">{['$345 / year', '$695 / year', '$1095 / year'].map((mem) => (<label key={mem}><input type="checkbox" checked={selectedMemberships.includes(mem)} onChange={() => handleToggle(mem, selectedMemberships, setSelectedMemberships)} /> {mem}</label>))}</div>
                    <button
                      style={{ width: '100%', marginTop: '15px', backgroundColor: '#2563eb', color: 'white', padding: '8px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                      onClick={() => navigate('/sales/crm/create-invoice', {
                        state: {
                          lead: lead,
                          selectedListings: selectedListings,
                          selectedMemberships: selectedMemberships,
                          leadStatus: leadStatus,
                          prefilledCustomer: {
                            name: `${firstName} ${lastName}`.trim(),
                            email: email,
                            company: businessName,
                            phone: selectedPhone || lead?.id,
                            userId: selectedUserId
                          }
                        }
                      })}
                    >
                      📄 Generate Invoice
                    </button>                  
                    </div>
                </div>

                <div className="crm-panel">
                  <div className="panel-header">
                    <h3>💬 Service Type</h3>
                    <span className="collapse-icon">^</span>
                  </div>
                  <div className="panel-body" style={{ padding: '0' }}>
                    <div style={{ padding: '15px' }}>
                      <div className="service-radio-row">
                        {['SMS', 'RC', 'Apple', 'W-App'].map((svc) => (
                          <label key={svc} className="service-radio-label"><input type="radio" name="svc" checked={serviceType === svc} onChange={() => setServiceType(svc)} /><span className="color-dot" style={{ backgroundColor: getDotColor(svc) }}></span>{svc}</label>
                        ))}
                      </div>
                      <div className="form-group" style={{ marginTop: '15px' }}>
                        <label style={{ fontSize: '13px', color: '#6b7280', fontWeight: '600' }}>Text From</label>
                        <select className="service-select">
                          <option>+1 (323) 990-7701</option>
                        </select>
                      </div>
                    </div>
                    <div className="service-tabs">
                      <button className={serviceSubTab === 'Text' ? 'active' : ''} onClick={() => setServiceSubTab('Text')}>Text</button>
                      <button className={serviceSubTab === 'History' ? 'active' : ''} onClick={() => setServiceSubTab('History')}>History</button>
                    </div>
                    <div style={{ padding: '15px', backgroundColor: '#f8fafc', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px' }}>

                      {/* TEXT TAB */}
                      <div style={{ display: serviceSubTab === 'Text' ? 'block' : 'none' }}>
                        <div className="form-group">
                          <label style={{ fontSize: '13px', color: '#6b7280', fontWeight: '600', marginBottom: '6px' }}>Text Body</label>
                          <textarea className="service-textarea" placeholder="Type your message..." rows="4" value={inputText} onChange={(e) => setInputText(e.target.value)}></textarea>
                        </div>

                        {/* ✅ FIXED: Attach Photos completely removed, Character count right-aligned */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '15px' }}>
                          <span style={{ fontSize: '12px', color: '#9ca3af' }}>{inputText.length} / 1600</span>
                        </div>
                        <button className="service-send-btn" onClick={handleSendMessage} disabled={isSending || !inputText.trim()}>Send ✈</button>
                      </div>

                      {/* HISTORY TAB */}
                      <div
                        className="service-history-area"
                        ref={historyScrollRef}
                        style={{ display: serviceSubTab === 'History' ? 'flex' : 'none', maxHeight: '350px', overflowY: 'auto', paddingRight: '5px' }}
                      >
                        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                          <button className="text-link" style={{ fontSize: '12px' }}>↺ Load older messages</button>
                        </div>

                        {localHistory?.map((msg, idx) => (
                          <div key={idx} className={`chat-bubble-wrapper ${msg.direction}`}>
                            {msg.direction === 'incoming' && <div className="chat-date-header">{msg.time} • Incoming</div>}
                            <div className={`chat-bubble ${msg.direction}`}>{msg.text}</div>
                            {msg.direction === 'outgoing' && <div className="chat-date-header" style={{ textAlign: 'right' }}>{msg.time} • Outgoing</div>}
                          </div>
                        ))}

                        <div ref={messagesEndRef} />
                      </div>

                    </div>
                  </div>
                </div>

                <div className="crm-panel" style={{ padding: 0 }}>
                  <div className="call-nav-tabs" style={{ paddingTop: '10px' }}>
                    <button className={`call-nav-tab ${callTab === 'Call' ? 'active' : ''}`} onClick={() => setCallTab('Call')}>📞 Call</button>
                    <button className={`call-nav-tab ${callTab === 'History' ? 'active' : ''}`} onClick={() => setCallTab('History')}>🕒 History</button>
                    <button className={`call-nav-tab ${callTab === 'Dial pad' ? 'active' : ''}`} onClick={() => setCallTab('Dial pad')}>🎛️ Dial pad</button>
                    <span className="collapse-icon" style={{ marginLeft: 'auto' }}>^</span>
                  </div>

                  <div className="panel-body" style={{ padding: '0 20px 20px 20px' }}>

                    {/* TAB 1: BASIC CALL */}
                    {callTab === 'Call' && (
                      <div className="call-tab-content">
                        <div className="form-group" style={{ marginBottom: '16px' }}>
                          <label style={{ fontSize: '13px', color: '#4b5563', fontWeight: '600', marginBottom: '8px', display: 'block' }}>Outgoing call from</label>
                          <select className="modern-input-box">
                            <option>+1 (323) 990-7701</option>
                          </select>
                        </div>

                        <div className="form-group" style={{ marginBottom: '16px' }}>
                          <label style={{ fontSize: '13px', color: '#4b5563', fontWeight: '600', marginBottom: '8px', display: 'block' }}>Calling number</label>
                          <select
                            className="modern-input-box"
                            value={selectedCallingNumber}
                            onChange={(e) => setSelectedCallingNumber(e.target.value)}
                          >
                            {availableCallingNumbers.map((num, idx) => (
                              <option key={idx} value={num}>{num}</option>
                            ))}
                          </select>
                        </div>

                        <input
                          type="text"
                          placeholder="Put a new no. to call (Optional)"
                          value={customPhone}
                          onChange={(e) => setCustomPhone(e.target.value)}
                          className="modern-input-box"
                          style={{ marginBottom: '24px' }}
                        />

                        <button
                          className="btn-call-green"
                          onClick={() => handleCallNow(customPhone || selectedCallingNumber)}
                          disabled={isCalling}
                        >
                          {isCalling ? '📞 Dialing...' : '📞 Call Now'}
                        </button>
                      </div>
                    )}

                    {/* TAB 2: HISTORY */}
                    {callTab === 'History' && (
                      <div className="call-tab-content">
                        <div className="form-group" style={{ marginBottom: '16px' }}>
                          <label style={{ fontSize: '13px', color: '#4b5563', fontWeight: '600', marginBottom: '8px', display: 'block' }}>View history for</label>
                          <select className="modern-input-box">
                            <option>+1 (323) 990-7701</option>
                          </select>
                        </div>

                        <div className="history-list-container" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                          {callHistory.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280', fontSize: '14px' }}>
                              No recent call history found.
                            </div>
                          ) : (
                            callHistory.map((log, index) => {
                              const style = getCallStyle(log.type, log.status);
                              const isThisTrackPlaying = playingUrl === log.recordingUrl;
                              const progress = isThisTrackPlaying ? playbackProgress : 0;

                              return (
                                <div className="history-row" key={log.id || index}>
                                  <div className="history-icon-circle" style={{ color: style.color }}>
                                    {style.icon}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827', display: 'flex', alignItems: 'center' }}>
                                      {log.type || 'Call'}
                                      {log.status && <span className="status-badge" style={{ borderColor: style.color, color: style.color }}>{log.status}</span>}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {log.date} • {log.number} {log.duration && ` 🕒 ${log.duration}`}
                                    </div>
                                  </div>

                                  <div
                                    className="history-play-wrapper"
                                    style={{
                                      background: isThisTrackPlaying ? `conic-gradient(#3b82f6 ${progress}%, #e5e7eb 0deg)` : '#e5e7eb',
                                      opacity: log.recordingUrl ? 1 : 0.4,
                                      cursor: log.recordingUrl ? 'pointer' : 'not-allowed'
                                    }}
                                    onClick={() => log.recordingUrl && togglePlay(log.recordingUrl)}
                                    title={log.recordingUrl ? (isThisTrackPlaying && isPlaying ? "Pause" : "Play") : "No Recording"}
                                  >
                                    <div className="history-play-inner">
                                      {isThisTrackPlaying && isPlaying ? '⏸' : '▶'}
                                    </div>
                                  </div>

                                </div>
                              );
                            })
                          )}
                        </div>
                        <div style={{ textAlign: 'center', marginTop: '16px' }}>
                          <button
                            className="text-link"
                            onClick={() => fetchCallHistory(availableCallingNumbers)}
                            disabled={isRefreshingHistory}
                            style={{
                              fontSize: '13px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              margin: '0 auto',
                              opacity: isRefreshingHistory ? 0.5 : 1,
                              cursor: isRefreshingHistory ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {isRefreshingHistory ? '⏳ Refreshing...' : '↺ Refresh History'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* TAB 3: DIAL PAD */}
                    {callTab === 'Dial pad' && (
                      <div className="call-tab-content">
                        <div className="form-group" style={{ marginBottom: '16px' }}>
                          <label style={{ fontSize: '13px', color: '#4b5563', fontWeight: '600', marginBottom: '8px', display: 'block' }}>Outgoing call from</label>
                          <select className="modern-input-box">
                            <option>+1 (323) 990-7701</option>
                          </select>
                        </div>

                        {/* Search & AutoComplete */}
                        <div style={{ position: 'relative', marginBottom: '8px' }}>
                          <input
                            type="text"
                            placeholder="🔍 Search user or type number"
                            className="modern-input-box"
                            value={userSearchTerm || dialPadNumber}
                            onChange={(e) => {
                              setUserSearchTerm(e.target.value);
                              setDialPadNumber(e.target.value);
                            }}
                            onFocus={() => setShowUserDropdown(true)}
                            onBlur={() => setTimeout(() => setShowUserDropdown(false), 200)}
                            style={{ background: '#fff', paddingRight: '44px' }}
                          />
                          {(dialPadNumber || userSearchTerm) && (
                            <button
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                const current = dialPadNumber || userSearchTerm;
                                const trimmed = current.slice(0, -1);
                                setDialPadNumber(trimmed);
                                setUserSearchTerm(trimmed);
                              }}
                              style={{
                                position: 'absolute',
                                right: '10px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '18px',
                                color: '#9ca3af',
                                display: 'flex',
                                alignItems: 'center',
                                padding: '4px',
                                lineHeight: 1,
                              }}
                              title="Backspace"
                            >
                              ⌫
                            </button>
                          )}

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
                                      setUserSearchTerm(u.phone);
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

                        {/* Dial Grid Container */}
                        <div style={{ position: 'relative', maxWidth: '220px', margin: '24px auto' }}>
                          <div className="dial-pad-grid" style={{ margin: '0' }}>
                            {dialKeys.map((key, i) => (
                              <div className="dial-key" key={i} onClick={() => {
                                setDialPadNumber(prev => prev + key.num);
                                setUserSearchTerm(prev => prev + key.num);
                              }}>
                                <span className="num">{key.num}</span>
                                <span className="letters">{key.letters}</span>
                              </div>
                            ))}
                          </div>

                          {(dialPadNumber || userSearchTerm) && (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                const current = dialPadNumber || userSearchTerm;
                                const trimmed = current.slice(0, -1);
                                setDialPadNumber(trimmed);
                                setUserSearchTerm(trimmed);
                              }}
                              style={{
                                position: 'absolute',
                                right: '-50px',
                                bottom: '10px',
                                background: 'transparent',
                                border: 'none',
                                fontSize: '24px',
                                cursor: 'pointer',
                                color: '#9ca3af',
                                width: '40px',
                                height: '40px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '50%',
                                transition: 'color 0.2s',
                              }}
                              onMouseOver={(e) => e.currentTarget.style.color = '#ef4444'}
                              onMouseOut={(e) => e.currentTarget.style.color = '#9ca3af'}
                              title="Backspace"
                            >
                              ⌫
                            </button>
                          )}
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
                </div>

              </div>
            </div>

          </div>
        </div>,
        document.getElementById('root') || document.body
      )}

      {/* <CreateInvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        lead={lead}
        selectedListings={selectedListings}
        selectedMemberships={selectedMemberships}
        leadStatus={leadStatus}
        prefilledCustomer={{
          name: `${firstName} ${lastName}`.trim(),
          email: email,
          company: businessName,
          phone: selectedPhone || lead.id,
          userId: selectedUserId 
        }}
      /> */}

      <RefineSearchModal
        isOpen={isRefineModalOpen}
        onClose={() => setIsRefineModalOpen(false)}
        initialSelectedVehicles={selectedVehicles}
        onSelectVehicles={(updatedVehiclesList) => {
          setSelectedVehicles(updatedVehiclesList);
          autoSaveVehicles(updatedVehiclesList);
        }}
      />
    </>
  );
};

export default AssignLeadModal;