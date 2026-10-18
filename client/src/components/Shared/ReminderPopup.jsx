import React, { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '../../config';

const toISODate = (d) => {
  if (!d) return '';
  if (typeof d === 'string') return d.includes('T') ? d.slice(0, 10) : d.slice(0, 10);
  if (d instanceof Date && !isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  return '';
};
const toTimeStr = (t) => {
  if (!t) return '00:00:00';
  if (typeof t === 'string') return t.length === 5 ? t + ':00' : t;
  if (t instanceof Date && !isNaN(t.getTime())) {
    return `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}:${String(t.getSeconds()).padStart(2,'0')}`;
  }
  return '00:00:00';
};

const ReminderPopup = () => {
  const [dueReminders, setDueReminders] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dismissed, setDismissed] = useState(new Set());
  const intervalRef = useRef(null);

  // NOTE: server-side followups/triggered endpoint is not set up yet — polling disabled.
  const checkReminders = async () => {
    try {
      // const res = await fetch(`${API_BASE_URL}/followups/triggered`);
      // const data = await res.json();
      // if (data.success && data.triggered && data.triggered.length > 0) {
      //   const newOnes = data.triggered.filter(r => !dismissed.has(r.id));
      //   if (newOnes.length > 0) {
      //     setDueReminders(prev => {
      //       const existingIds = new Set(prev.map(r => r.id));
      //       const unique = newOnes.filter(r => !existingIds.has(r.id));
      //       return [...prev, ...unique];
      //     });
      //   }
      // }
    } catch (e) { /* silent */ }
  };

  useEffect(() => {
    // checkReminders();
    // intervalRef.current = setInterval(checkReminders, 15000);
    // return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const visibleReminders = dueReminders.filter(r => !dismissed.has(r.id));
  const current = visibleReminders[currentIndex] || null;

  if (!current) return null;

  const dismiss = async (id) => {
    try {
      // await fetch(`${API_BASE_URL}/followups/triggered/${id}/dismiss`, { method: 'PUT' });
    } catch (e) { /* ignore */ }
    setDismissed(prev => new Set([...prev, id]));
    setCurrentIndex(0);
  };

  const dismissAll = async () => {
    try {
      // await fetch(`${API_BASE_URL}/followups/triggered/all/dismiss`, { method: 'PUT' });
    } catch (e) { /* ignore */ }
    const allIds = visibleReminders.map(r => r.id);
    setDismissed(prev => new Set([...prev, ...allIds]));
    setCurrentIndex(0);
  };

  const goNext = () => {
    setCurrentIndex(prev => (prev + 1) % visibleReminders.length);
  };
  const goPrev = () => {
    setCurrentIndex(prev => (prev - 1 + visibleReminders.length) % visibleReminders.length);
  };

  const ds = toISODate(current.due_date);
  const ts = toTimeStr(current.due_time);
  const dueStr = ds
    ? new Date(`${ds}T${ts}`).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      })
    : 'No date';

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', zIndex: 999999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, maxWidth: 420, width: '100%',
        overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
        animation: 'fu-slide-in 0.3s ease-out',
      }}>
        <style>{`
          @keyframes fu-slide-in {
            from { transform: translateY(-30px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        `}</style>

        <div style={{
          background: '#dc2626',
          padding: '16px 20px', color: '#fff',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>⏰</span>
              <span style={{ fontSize: 17, fontWeight: 800 }}>Follow-up Reminder</span>
            </div>
            {visibleReminders.length > 1 && (
              <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.85 }}>
                {currentIndex + 1} / {visibleReminders.length}
              </span>
            )}
          </div>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', marginBottom: 8 }}>
            {current.title}
          </div>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>
            Due: <strong>{dueStr}</strong>
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6 }}>
            Reminder {current.which_reminder} of 2
          </div>
          {current.lead_phone && (
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>
              {current.lead_phone}
            </div>
          )}
          {current.notes && (
            <div style={{
              fontSize: 13, color: '#374151', marginTop: 10,
              padding: '10px 12px', background: '#f9fafb', borderRadius: 8,
              border: '1px solid #e5e7eb', lineHeight: 1.5,
            }}>{current.notes}</div>
          )}
          {current.popup_note && (
            <div style={{
              fontSize: 13, color: '#7c3aed', marginTop: 8, fontStyle: 'italic',
              padding: '8px 12px', background: '#f5f3ff', borderRadius: 8,
              border: '1px solid #ede9fe',
            }}>{current.popup_note}</div>
          )}
        </div>

        <div style={{ padding: '12px 24px 20px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => dismiss(current.id)} style={{
            flex: 1, minWidth: 100, padding: '11px', border: 'none', borderRadius: 8,
            background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 13,
            cursor: 'pointer',
          }}>Dismiss</button>
          <button onClick={dismissAll} style={{
            flex: 1, minWidth: 100, padding: '11px', border: '1.5px solid #d1d5db',
            borderRadius: 8, background: '#fff', color: '#374151', fontWeight: 600,
            fontSize: 13, cursor: 'pointer',
          }}>Dismiss All</button>
          {visibleReminders.length > 1 && (
            <div style={{ display: 'flex', gap: 6, width: '100%', marginTop: 4 }}>
              <button onClick={goPrev} style={{
                flex: 1, padding: '8px', border: '1.5px solid #e5e7eb', borderRadius: 8,
                background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              }}>Prev</button>
              <button onClick={goNext} style={{
                flex: 1, padding: '8px', border: '1.5px solid #e5e7eb', borderRadius: 8,
                background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              }}>Next</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReminderPopup;
