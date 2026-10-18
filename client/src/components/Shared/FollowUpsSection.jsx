import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config';

// ─────────────────────────────────────────────────────────────────────────
// FOLLOW-UP TYPES — colors/codes match the reference calendar design
// ─────────────────────────────────────────────────────────────────────────
const FOLLOWUP_TYPES = [
  { id: 'Membership', code: 'M', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  { id: 'Vehicle Listing', code: 'VL', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  { id: 'Renewal', code: 'R', color: '#f97316', bg: '#fff7ed', border: '#fed7aa' },
  { id: 'Advertisement', code: 'AD', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
  { id: 'Follow Up', code: '💬', color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' },
];
const typeMeta = (typeId) => FOLLOWUP_TYPES.find(t => t.id === typeId) || FOLLOWUP_TYPES[4];

const CHANNELS = ['SMS', 'Email', 'Call'];
const channelIcon = (ch) => (ch === 'SMS' ? '💬' : ch === 'Email' ? '✉️' : '📞');

const WEEKDAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ── date helpers ────────────────────────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayKey = dateKey(new Date());

const formatTime = (t) => {
  if (!t) return '';
  const [hStr, m] = t.split(':');
  let h = parseInt(hStr, 10);
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${suffix}`;
};

const formatDateLong = (dStr) => {
  if (!dStr) return '';
  const [y, m, d] = dStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Robustly extract a clean YYYY-MM-DD / HH:MM key from DB values, which the
// mysql2 driver may return as ISO datetime strings (e.g. "2026-09-10T18:30:00.000Z").
const toDateKey = (v) => {
  if (!v) return '';
  const s = String(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : s.slice(0, 10);
};
const toTimeKey = (v) => {
  if (!v) return '09:00';
  const s = String(v);
  const m = s.match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : s.slice(0, 5);
};

const nowTimeKey = () => {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
};

const buildMonthMatrix = (year, month) => {
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = startWeekday - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    cells.push({ dateObj: new Date(year, month - 1, day), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ dateObj: new Date(year, month, d), inMonth: true });
  }
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ dateObj: new Date(year, month + 1, nextDay), inMonth: false });
    nextDay += 1;
  }
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
};

let localIdCounter = -1;
const makeLocalId = () => { localIdCounter -= 1; return localIdCounter; };

const EMPTY_FORM = {
  type: 'Membership',
  date: '',
  time: '09:00',
  channel: 'SMS',
  contactName: '',
  subject: '',
  reminder1Hours: 6,
  reminder2Hours: 1,
  popupNote: '',
};

const REMINDER_HOUR_PRESETS = [1, 2, 3, 6, 12, 24, 48];

// Compute the exact date+time a reminder (N hours before due) will fire and
// render it as a short human-readable string. Returns '' if inputs are missing.
const reminderPreviewText = (date, time, hoursBefore) => {
  if (!date || !time) return '';
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const due = new Date(y, m - 1, d, hh || 0, mm || 0);
  due.setHours(due.getHours() - (hoursBefore || 0));
  return due.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const FollowUpsSection = ({ invoiceId, leadPhone, collapsed, onToggle }) => {
  const navigate = useNavigate();
  const today = new Date();
  const [viewMode, setViewMode] = useState('Month'); // Month | Week | Custom
  const [anchorDate, setAnchorDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [channelFilter, setChannelFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  const [followUps, setFollowUps] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = creating new
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const [dayPopover, setDayPopover] = useState(null); // dateStr or null

  const [toast, setToast] = useState(null); // { type: 'success'|'error', message }
  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();

  // ── normalize a backend row into the shape this UI uses ───────────────
  const normalizeRow = useCallback((row) => ({
    id: row.id,
    type: row.type || 'Follow Up',
    date: toDateKey(row.due_date),
    time: toTimeKey(row.due_time),
    channel: row.channel || 'Call',
    contactName: row.contact_name || row.contactName || row.title || '',
    subject: row.subject || row.notes || '',
    leadPhone: row.lead_phone || leadPhone,
    invoiceId: row.invoice_id || invoiceId,
    status: row.status || 'pending',
    reminder1Hours: row.reminder1Hours ?? row.reminder_1_hours ?? 6,
    reminder2Hours: row.reminder2Hours ?? row.reminder_2_hours ?? 1,
    popupNote: row.popupNote ?? row.popup_note ?? '',
  }), [leadPhone, invoiceId]);

  // ── FETCH FOLLOW-UPS FOR THIS LEAD ─────────────────────────────────────
  const fetchFollowUps = useCallback(async () => {
    // if (!leadPhone && !invoiceId) return;
    // setIsLoading(true);
    // setLoadError(null);
    // try {
    //   let data = null;
    //   if (invoiceId) {
    //     const response = await fetch(`${API_BASE_URL}/followups/by-invoice/${encodeURIComponent(invoiceId)}`);
    //     data = await response.json();
    //   } else if (leadPhone) {
    //     const response = await fetch(`${API_BASE_URL}/followups/by-phone/${encodeURIComponent(leadPhone)}`);
    //     data = await response.json();
    //   }
    //   if (data && data.success && Array.isArray(data.followups)) {
    //     setFollowUps(data.followups.map(normalizeRow));
    //   } else if (Array.isArray(data)) {
    //     setFollowUps(data.map(normalizeRow));
    //   } else {
    //     setFollowUps([]);
    //   }
    // } catch (error) {
    //   console.error('Failed to fetch follow-ups:', error);
    //   setLoadError('Could not load saved follow-ups — showing local data only.');
    // } finally {
    //   setIsLoading(false);
    // }
  }, [leadPhone, invoiceId, normalizeRow]);

  useEffect(() => { fetchFollowUps(); }, [fetchFollowUps]);

  // ── FILTERED DATA ───────────────────────────────────────────────────────
  const filteredFollowUps = useMemo(() => {
    return followUps.filter(f => {
      if (categoryFilter !== 'All' && f.type !== categoryFilter) return false;
      if (channelFilter !== 'All' && f.channel !== channelFilter) return false;
      if (statusFilter !== 'All' && f.status !== statusFilter) return false;
      return true;
    });
  }, [followUps, categoryFilter, channelFilter, statusFilter]);

  const followUpsByDate = useMemo(() => {
    const map = {};
    filteredFollowUps.forEach(f => {
      if (!map[f.date]) map[f.date] = [];
      map[f.date].push(f);
    });
    Object.values(map).forEach(list => list.sort((a, b) => (a.time || '').localeCompare(b.time || '')));
    return map;
  }, [filteredFollowUps]);

  const monthFollowUps = useMemo(() => {
    return filteredFollowUps.filter(f => {
      if (!f.date) return false;
      const [fy, fm] = f.date.split('-').map(Number);
      return fy === year && fm === month + 1;
    });
  }, [filteredFollowUps, year, month]);

  const upcomingFollowUps = useMemo(() => {
    return [...filteredFollowUps]
      .filter(f => f.date >= todayKey)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .slice(0, 12);
  }, [filteredFollowUps]);

  const summaryCounts = useMemo(() => {
    const counts = {};
    FOLLOWUP_TYPES.forEach(t => { counts[t.id] = 0; });
    monthFollowUps.forEach(f => { counts[f.type] = (counts[f.type] || 0) + 1; });
    const total = monthFollowUps.length;
    return { counts, total };
  }, [monthFollowUps]);

  // ── NAVIGATION ───────────────────────────────────────────────────────────
  const goToPrevMonth = () => setAnchorDate(new Date(year, month - 1, 1));
  const goToNextMonth = () => setAnchorDate(new Date(year, month + 1, 1));
  const goToToday = () => setAnchorDate(new Date(today.getFullYear(), today.getMonth(), 1));

  const matrix = useMemo(() => buildMonthMatrix(year, month), [year, month]);

  // ── MODAL HANDLERS ──────────────────────────────────────────────────────
  const openAddModal = (presetDate) => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, date: presetDate || dateKey(new Date()), time: nowTimeKey() });
    setIsModalOpen(true);
    setDayPopover(null);
  };

  const openEditModal = (item) => {
    setEditingId(item.id);
    setForm({
      type: item.type || 'Follow Up',
      date: item.due_date || item.date || '',
      time: item.due_time ? item.due_time.slice(0, 5) : '09:00',
      channel: item.channel || 'Call',
      contactName: item.contact_name || item.title || item.contactName || '',
      subject: item.notes || item.subject || '',
      reminder1Hours: item.reminder1Hours ?? item.reminder_1_hours ?? 6,
      reminder2Hours: item.reminder2Hours ?? item.reminder_2_hours ?? 1,
      popupNote: item.popupNote ?? item.popup_note ?? '',
    });
    setIsModalOpen(true);
    setDayPopover(null);
  };

  const closeModal = () => { setIsModalOpen(false); setEditingId(null); };

  const buildPayload = () => ({
    title: form.contactName.trim(),
    notes: form.subject || '',
    dueDate: form.date,
    dueTime: form.time ? `${form.time}:00` : '09:00:00',
    leadPhone: leadPhone || null,
    invoiceId: invoiceId || null,
    type: form.type,
    channel: form.channel,
    reminder1Hours: form.reminder1Hours ?? 6,
    reminder2Hours: form.reminder2Hours ?? 1,
    popupNote: form.popupNote || '',
  });

  const handleSave = async () => {
    if (!form.date || !form.contactName.trim()) {
      showToast('error', 'Please fill in at least a date and contact name.');
      return;
    }
    setIsSaving(true);
    const payload = buildPayload();

    try {
      if (editingId != null && editingId > 0) {
        // Persisted record — update on the server, then reflect locally.
        // FIX: server followups endpoint not deployed — disabled.
        // const response = await fetch(`${API_BASE_URL}/followups/${editingId}`, {
        //   method: 'PUT',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify(payload),
        // });
        // const data = await response.json().catch(() => ({}));
        const response = { ok: false };
        const data = {};
        if (response.ok && data.success) {
          setFollowUps(prev => prev.map(f => (f.id === editingId ? {
            ...f, ...form, leadPhone, invoiceId, id: editingId,
          } : f)));
          showToast('success', 'Follow-up updated successfully.');
        } else {
          showToast('error', 'Could not save changes to the server.');
        }
      } else if (editingId != null) {
        // Local-only record being edited (never made it to the server yet).
        setFollowUps(prev => prev.map(f => (f.id === editingId ? { ...f, ...form, leadPhone, invoiceId, id: editingId } : f)));
        showToast('success', 'Follow-up updated (not yet saved to server — add a phone/invoice to persist).');
      } else {
        // Creating new — optimistic local id, then try to persist.
        const localId = makeLocalId();
        const localRecord = { ...form, leadPhone, invoiceId, id: localId, status: 'pending' };
        setFollowUps(prev => [...prev, localRecord]);

        // FIX: server followups endpoint not deployed — disabled.
        // const response = await fetch(`${API_BASE_URL}/followups/create`, {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify(payload),
        // });
        // const data = await response.json().catch(() => ({}));
        const response = { ok: false };
        const data = {};
        const serverId = data?.followup?.id || data?.id;
        if (response.ok && data.success && serverId) {
          setFollowUps(prev => prev.map(f => (f.id === localId ? { ...f, id: serverId } : f)));
          showToast('success', 'Follow-up created successfully.');
        } else {
          showToast('error', 'Created locally — could not reach the server to save it.');
        }
      }
      closeModal();
    } catch (error) {
      console.error('Failed to save follow-up:', error);
      showToast('error', 'Created locally — could not reach the server to save it.');
      closeModal();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete this follow-up for ${item.contactName || 'this contact'}?`)) return;
    setFollowUps(prev => prev.filter(f => f.id !== item.id));
    if (item.id > 0) {
      try {
        // FIX: server followups endpoint not deployed — disabled.
        // const response = await fetch(`${API_BASE_URL}/followups/${item.id}`, { method: 'DELETE' });
        // const data = await response.json().catch(() => ({}));
        // showToast(data.success ? 'success' : 'error', data.success ? 'Follow-up deleted.' : 'Could not delete on the server.');
        showToast('success', 'Follow-up removed.');
      } catch (error) {
        console.error('Failed to delete follow-up on server:', error);
        showToast('error', 'Could not reach the server to delete this follow-up.');
      }
    } else {
      showToast('success', 'Follow-up removed.');
    }
  };

  const handleToggleStatus = async (item) => {
    if (!item.id || !(item.id > 0)) {
      showToast('error', 'This follow-up is not saved to the server yet.');
      return;
    }
    const next = item.status === 'done' ? 'pending' : 'done';
    try {
      // FIX: server followups endpoint not deployed — disabled.
      // const response = await fetch(`${API_BASE_URL}/followups/update-status`, {
      //   method: 'PUT',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ id: item.id, status: next }),
      // });
      // const data = await response.json().catch(() => ({}));
      const response = { ok: false };
      const data = {};
      if (response.ok && data.success) {
        setFollowUps(prev => prev.map(f => (f.id === item.id ? { ...f, status: next } : f)));
        showToast('success', next === 'done' ? 'Marked as done.' : 'Marked as pending.');
      } else {
        showToast('error', 'Could not update status on the server.');
      }
    } catch (error) {
      console.error('Failed to toggle status:', error);
      showToast('error', 'Could not reach the server to update status.');
    }
  };

  const openInvoiceFor = (item) => {
    const targetInvoiceId = item.invoiceId != null && item.invoiceId > 0 ? item.invoiceId : (invoiceId != null && invoiceId > 0 ? invoiceId : null);
    if (targetInvoiceId) {
      navigate(`/sales/crm/create-invoice/${targetInvoiceId}`, {
        state: { invoiceIdFromCRM: targetInvoiceId, existingInvoiceNumber: `INV-${targetInvoiceId}` },
      });
    } else {
      showToast('error', 'This follow-up is not linked to an invoice yet.');
    }
  };

  // ── CSV EXPORT ───────────────────────────────────────────────────────────
  const handleExport = () => {
    const rows = [['Date', 'Time', 'Type', 'Channel', 'Contact/Subject']];
    upcomingFollowUps.forEach(f => {
      rows.push([f.date, formatTime(f.time), f.type, f.channel, f.contactName || f.subject || '']);
    });
    const csv = rows.map(r => r.map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `follow-ups-${leadPhone || 'lead'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="crm-panel fu-panel">
      <style>{`
        .fu-toolbar { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .fu-view-toggle { display: flex; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; flex-shrink: 0; }
        .fu-view-toggle button { padding: 8px 14px; border: none; background: #fff; font-size: 13px; font-weight: 600; color: #6b7280; cursor: pointer; }
        .fu-view-toggle button + button { border-left: 1px solid #e5e7eb; }
        .fu-view-toggle button.active { background: #2563eb; color: #fff; }
        .fu-filter-group { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; flex: 1; justify-content: flex-end; }
        .fu-select { padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 13px; background: #fff; color: #374151; outline: none; }
        .fu-add-btn { padding: 8px 14px; border: 1px solid #2563eb; border-radius: 8px; background: #2563eb; color: #fff; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
        .fu-add-btn:hover { background: #1d4ed8; }
        .fu-legend { display: flex; gap: 16px; flex-wrap: wrap; padding: 10px 14px; background: #f9fafb; border: 1px solid #f0f0f0; border-radius: 8px; margin-bottom: 14px; }
        .fu-legend-item { display: flex; align-items: center; font-size: 12px; color: #374151; font-weight: 600; }
        .fu-legend-dot { width: 18px; height: 18px; border-radius: 5px; display: inline-flex; align-items: center; justify-content: center; color: #fff; font-size: 9px; font-weight: 800; margin-right: 6px; flex-shrink: 0; }
        .fu-cal-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .fu-cal-nav-btn { width: 30px; height: 30px; border-radius: 50%; border: 1px solid #e5e7eb; background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #4b5563; font-size: 14px; }
        .fu-cal-nav-btn:hover { background: #f3f4f6; }
        .fu-cal-title { font-size: 16px; font-weight: 800; color: #111827; display: flex; align-items: center; gap: 10px; }
        .fu-today-btn { font-size: 11px; font-weight: 700; color: #2563eb; background: #eff6ff; border: 1px solid #bfdbfe; padding: 3px 9px; border-radius: 20px; cursor: pointer; }
        .fu-cal-wrapper { overflow-x: auto; border: 1px solid #e5e7eb; border-radius: 10px; margin-bottom: 20px; -webkit-overflow-scrolling: touch; }
        .fu-cal-grid { display: grid; grid-template-columns: repeat(7, minmax(102px, 1fr)); min-width: 700px; }
        .fu-cal-head { padding: 9px 6px; text-align: center; font-size: 10px; font-weight: 800; color: #6b7280; background: #f9fafb; border-bottom: 1px solid #e5e7eb; letter-spacing: 0.5px; }
        .fu-cal-cell { min-height: 90px; border-right: 1px solid #f3f4f6; border-bottom: 1px solid #f3f4f6; padding: 6px 6px 8px; cursor: pointer; transition: background .15s; position: relative; }
        .fu-cal-grid > .fu-cal-cell:nth-child(7n) { border-right: none; }
        .fu-cal-cell:hover { background: #f8fafc; }
        .fu-cal-cell.dim { background: #fafafa; }
        .fu-cal-cell.dim .fu-cal-day-num { color: #d1d5db; }
        .fu-cal-day-num { font-size: 13px; font-weight: 700; color: #111827; margin-bottom: 5px; }
        .fu-cal-cell.today { background: #f5f8ff; }
        .fu-cal-cell.today .fu-cal-day-num { color: #fff; background: #2563eb; width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; }
        .fu-chip { display: flex; align-items: center; gap: 4px; font-size: 9.5px; font-weight: 700; padding: 2px 5px 2px 2px; border-radius: 5px; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
        .fu-chip-code { width: 15px; height: 15px; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 7px; font-weight: 800; flex-shrink: 0; }
        .fu-upcoming-header { display: flex; justify-content: space-between; align-items: center; margin: 4px 0 14px; flex-wrap: wrap; gap: 10px; }
        .fu-upcoming-header h4 { margin: 0; font-size: 15px; color: #111827; display: flex; align-items: center; gap: 8px; }
        .fu-count-badge { background: #2563eb; color: #fff; font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 20px; }
        .fu-export-btn { padding: 7px 14px; border: 1px solid #d1d5db; border-radius: 8px; background: #fff; color: #374151; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; }
        .fu-export-btn:hover { background: #f9fafb; }
        .fu-upcoming-list { display: flex; flex-direction: column; border: 1px solid #f0f0f0; border-radius: 10px; overflow: hidden; }
        .fu-upcoming-row { display: grid; grid-template-columns: 110px 130px 90px 1fr 150px; gap: 10px; align-items: center; padding: 12px 14px; border-bottom: 1px solid #f3f4f6; font-size: 13px; background: #fff; }
        .fu-upcoming-row:last-child { border-bottom: none; }
        .fu-upcoming-row:nth-child(even) { background: #fafbfc; }
        .fu-dt-cell { display: flex; align-items: flex-start; gap: 6px; color: #111827; }
        .fu-dt-cell .fu-date { font-weight: 700; font-size: 12.5px; }
        .fu-dt-cell .fu-time { color: #6b7280; font-size: 11.5px; }
        .fu-type-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; padding: 4px 9px; border-radius: 6px; white-space: nowrap; }
        .fu-channel-cell { display: flex; align-items: center; gap: 5px; color: #4b5563; font-size: 12.5px; }
        .fu-contact-cell { min-width: 0; }
        .fu-contact-cell .fu-contact-name { font-weight: 700; color: #111827; font-size: 13px; }
        .fu-contact-cell .fu-contact-sub { color: #6b7280; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .fu-contact-cell .fu-invoice-link { color: #2563eb; font-size: 11px; font-weight: 700; margin-top: 2px; display: flex; align-items: center; gap: 4px; }
        .fu-actions-cell { display: flex; gap: 6px; justify-content: flex-end; }
        .fu-icon-btn { width: 28px; height: 28px; border-radius: 6px; border: 1px solid #e5e7eb; background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px; }
        .fu-icon-btn.edit { color: #2563eb; border-color: #bfdbfe; background: #eff6ff; }
        .fu-icon-btn.delete { color: #ef4444; border-color: #fecaca; background: #fef2f2; }
        .fu-empty-state { text-align: center; padding: 30px 16px; color: #9ca3af; font-size: 13px; }
        .fu-summary-grid { display: grid; grid-template-columns: repeat(4, 1fr) 1.2fr; gap: 10px; margin-top: 20px; }
        .fu-summary-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 10px; text-align: center; background: #fff; }
        .fu-summary-card .fu-summary-label { font-size: 11px; font-weight: 700; color: #6b7280; display: flex; align-items: center; justify-content: center; gap: 5px; margin-bottom: 6px; }
        .fu-summary-card .fu-summary-num { font-size: 22px; font-weight: 800; color: #111827; }
        .fu-summary-card .fu-summary-sub { font-size: 10.5px; color: #9ca3af; margin-top: 2px; }
        .fu-summary-card.total { background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border-color: #bfdbfe; }
        .fu-summary-card.total .fu-summary-num { color: #1e3a8a; }
        .fu-load-error { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; font-size: 12px; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; }
        .fu-modal-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .product-modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; justify-content: center; align-items: center; padding: 20px; }
        .product-modal-content { background: white; width: 100%; max-width: 580px; max-height: 90vh; border-radius: 16px; display: flex; flex-direction: column; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); overflow: hidden; }
        .agreement-field-group { margin-bottom: 12px; }
        .agreement-field-group label { display: block; font-size: 12px; font-weight: 600; color: #6b7280; margin-bottom: 5px; }
        .agreement-field-group input, .agreement-field-group select { width: 100%; padding: 9px 11px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; outline: none; background: #f9fafb; box-sizing: border-box; transition: border 0.2s, background 0.2s; }
        .agreement-field-group input:focus, .agreement-field-group select:focus { border-color: #2563eb; background: #fff; }

        @media (max-width: 760px) {
          .fu-toolbar { flex-direction: column; align-items: stretch; }
          .fu-filter-group { justify-content: stretch; }
          .fu-select { flex: 1; }
          .fu-summary-grid { grid-template-columns: repeat(2, 1fr); }
          .fu-upcoming-row { grid-template-columns: 1fr; row-gap: 6px; }
          .fu-actions-cell { justify-content: flex-start; }
        }
      `}</style>

      <div className="panel-header" onClick={onToggle}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          📅 Follow Ups
          {monthFollowUps.length > 0 && <span className="fu-count-badge">{monthFollowUps.length}</span>}
        </h3>
        <span className="collapse-icon" style={{ transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}>^</span>
      </div>

      <div className="panel-body" style={{ display: collapsed ? 'none' : 'block', padding: '20px' }}>

        {loadError && <div className="fu-load-error">⚠️ {loadError}</div>}

        {toast && (
          <div style={{
            position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
            background: toast.type === 'success' ? '#059669' : '#ef4444', color: '#fff',
            padding: '11px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
            boxShadow: '0 6px 20px rgba(0,0,0,0.18)', maxWidth: '90vw',
          }}>
            {toast.type === 'success' ? '✅ ' : '⚠️ '}{toast.message}
          </div>
        )}

        {/* ── TOOLBAR ── */}
        <div className="fu-toolbar">
          <div className="fu-view-toggle">
            {['Month', 'Week', 'Custom'].map(v => (
              <button key={v} className={viewMode === v ? 'active' : ''} onClick={() => setViewMode(v)}>{v}</button>
            ))}
          </div>
          <div className="fu-filter-group">
            <select className="fu-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="All">All Categories</option>
              {FOLLOWUP_TYPES.map(t => <option key={t.id} value={t.id}>{t.id}</option>)}
            </select>
            <select className="fu-select" value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}>
              <option value="All">All Channels</option>
              {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="fu-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="All">All Status</option>
              <option value="pending">Pending</option>
              <option value="done">Done</option>
            </select>
            <button className="fu-add-btn" onClick={() => openAddModal(dateKey(new Date(year, month, Math.min(today.getDate(), 28))))}>
              + Add Follow Up
            </button>
          </div>
        </div>

        {/* ── LEGEND ── */}
        <div className="fu-legend">
          {FOLLOWUP_TYPES.map(t => (
            <span key={t.id} className="fu-legend-item">
              <span className="fu-legend-dot" style={{ backgroundColor: t.color }}>{t.code === '💬' ? '' : t.code}</span>
              {t.id}
            </span>
          ))}
        </div>

        {/* ── CALENDAR ── */}
        <div className="fu-cal-nav">
          <button className="fu-cal-nav-btn" onClick={goToPrevMonth}>‹</button>
          <div className="fu-cal-title">
            {MONTH_LABELS[month]} {year}
            <button className="fu-today-btn" onClick={goToToday}>Today</button>
          </div>
          <button className="fu-cal-nav-btn" onClick={goToNextMonth}>›</button>
        </div>

        <div className="fu-cal-wrapper">
          <div className="fu-cal-grid">
            {WEEKDAY_LABELS.map(w => <div key={w} className="fu-cal-head">{w}</div>)}
            {matrix.flat().map((cell, idx) => {
              const dStr = dateKey(cell.dateObj);
              const isToday = dStr === todayKey;
              return (
                <div
                  key={idx}
                  className={`fu-cal-cell${!cell.inMonth ? ' dim' : ''}${isToday ? ' today' : ''}`}
                  onClick={() => openAddModal(dStr)}
                  title="Click to add a follow-up on this date"
                >
                  <div className="fu-cal-day-num">{cell.dateObj.getDate()}</div>
                  {(followUpsByDate[dStr] || []).slice(0, 4).map(item => {
                    const meta = typeMeta(item.type);
                    return (
                      <div
                        key={item.id}
                        className="fu-chip"
                        style={{ background: meta.bg, color: meta.color, cursor: item.invoiceId > 0 ? 'pointer' : 'default' }}
                        title={item.invoiceId > 0 ? `${item.type} — ${formatTime(item.time)} — click to open invoice` : `${item.type} — ${formatTime(item.time)}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (item.invoiceId > 0) openInvoiceFor(item);
                        }}
                      >
                        <span className="fu-chip-code" style={{ backgroundColor: meta.color }}>{meta.code === '💬' ? '💬' : meta.code}</span>
                        {meta.id}
                        <span style={{ opacity: 0.85, fontWeight: 600, marginLeft: 'auto' }}>{formatTime(item.time)}</span>
                      </div>
                    );
                  })}
                  {(followUpsByDate[dStr] || []).length > 4 && (
                    <div
                      style={{ fontSize: 10, color: '#6b7280', fontWeight: 700, cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); setDayPopover(dStr); }}
                    >+{(followUpsByDate[dStr] || []).length - 4} more</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── UPCOMING FOLLOW UPS ── */}
        <div className="fu-upcoming-header">
          <h4>Upcoming Follow Ups <span className="fu-count-badge">{upcomingFollowUps.length}</span></h4>
          <button className="fu-export-btn" onClick={handleExport} disabled={upcomingFollowUps.length === 0}>⬇ Export</button>
        </div>

        <div className="fu-upcoming-list">
          {isLoading && <div className="fu-empty-state">Loading follow-ups…</div>}
          {!isLoading && upcomingFollowUps.length === 0 && (
            <div className="fu-empty-state">No upcoming follow-ups yet. Click a date on the calendar or "+ Add Follow Up" to schedule one.</div>
          )}
          {!isLoading && upcomingFollowUps.map(item => {
            const meta = typeMeta(item.type);
            const hasInvoice = item.invoiceId > 0;
            return (
              <div
                key={item.id}
                className="fu-upcoming-row"
                onClick={() => { if (hasInvoice) openInvoiceFor(item); }}
                style={hasInvoice ? { cursor: 'pointer' } : undefined}
                title={hasInvoice ? 'Click to open this follow-up\'s invoice' : undefined}
              >
                <div className="fu-dt-cell">
                  <span>📅</span>
                  <div>
                    <div className="fu-date">{formatDateLong(item.date)}</div>
                    <div className="fu-time">{formatTime(item.time)}</div>
                  </div>all 
                </div>
                <div>
                  <span className="fu-type-badge" style={{ background: meta.bg, color: meta.color }}>
                    {meta.code === '💬' ? '💬' : meta.code} {item.type}
                  </span>
                </div>
                <div className="fu-channel-cell">{channelIcon(item.channel)} {item.channel}</div>
                <div className="fu-contact-cell">
                  <div className="fu-contact-name">{item.contactName || '—'}</div>
                  {item.subject && <div className="fu-contact-sub">{item.subject}</div>}
                  {hasInvoice && <div className="fu-invoice-link">📄 Invoice #{item.invoiceId}</div>}
                </div>
                <div className="fu-actions-cell" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="fu-icon-btn"
                    title={item.status === 'done' ? 'Mark as pending' : 'Mark as done'}
                    onClick={() => handleToggleStatus(item)}
                    style={item.status === 'done'
                      ? { color: '#059669', borderColor: '#a7f3d0', background: '#ecfdf5' }
                      : { color: '#d97706', borderColor: '#fde68a', background: '#fffbeb' }}
                  >
                    {item.status === 'done' ? '✓' : '○'}
                  </button>
                  <button className="fu-icon-btn edit" title="Edit" onClick={() => openEditModal(item)}>✎</button>
                  <button className="fu-icon-btn delete" title="Delete" onClick={() => handleDelete(item)}>🗑</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── SUMMARY ── */}
        <div className="fu-summary-grid">
          {FOLLOWUP_TYPES.filter(t => t.id !== 'Follow Up').map(t => (
            <div key={t.id} className="fu-summary-card">
              <div className="fu-summary-label" style={{ color: t.color }}>
                <span className="fu-legend-dot" style={{ backgroundColor: t.color, width: '14px', height: '14px', fontSize: '7px' }}>{t.code}</span>
                {t.id}
              </div>
              <div className="fu-summary-num">{summaryCounts.counts[t.id] || 0}</div>
              <div className="fu-summary-sub">Follow Ups</div>
            </div>
          ))}
          <div className="fu-summary-card total">
            <div className="fu-summary-label" style={{ color: '#1e3a8a' }}>Total Follow Ups</div>
            <div className="fu-summary-num">{summaryCounts.total}</div>
            <div className="fu-summary-sub">This Month</div>
          </div>
        </div>
      </div>

      {/* ── ADD / EDIT MODAL ── */}
      {isModalOpen && (
        <div className="product-modal-overlay" onClick={closeModal}>
          <div className="product-modal-content" style={{ maxWidth: '460px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#111827' }}>{editingId != null ? 'Edit Follow Up' : 'New Follow Up'}</h3>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#9ca3af' }}>✕</button>
            </div>
            <div style={{ padding: '20px', overflowY: 'auto' }}>
              <div className="agreement-field-group">
                <label>Type</label>
                <select value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))}>
                  {FOLLOWUP_TYPES.map(t => <option key={t.id} value={t.id}>{t.id}</option>)}
                </select>
              </div>
              <div className="fu-modal-form-row">
                <div className="agreement-field-group">
                  <label>Date</label>
                  <input type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div className="agreement-field-group">
                  <label>Time</label>
                  <input type="time" value={form.time} onChange={(e) => setForm(f => ({ ...f, time: e.target.value }))} />
                </div>
              </div>
              <div className="agreement-field-group">
                <label>Channel</label>
                <select value={form.channel} onChange={(e) => setForm(f => ({ ...f, channel: e.target.value }))}>
                  {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="agreement-field-group">
                <label>Contact name</label>
                <input type="text" placeholder="e.g. John Smith" value={form.contactName} onChange={(e) => setForm(f => ({ ...f, contactName: e.target.value }))} />
              </div>
              <div className="agreement-field-group">
                <label>Subject / note</label>
                <input type="text" placeholder="e.g. Listing Renewal – ID #5642" value={form.subject} onChange={(e) => setForm(f => ({ ...f, subject: e.target.value }))} />
              </div>

              {/* ── REMINDERS ── */}
              <div style={{ borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', padding: '14px 0', marginBottom: '14px', background: '#fafbfc', borderRadius: 8 }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#111827', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  ⏰ Reminders
                </div>
                <div style={{ fontSize: '11.5px', color: '#6b7280', marginBottom: 12 }}>
                  Choose how long before the follow-up time each reminder fires, and the message shown.
                </div>

                <div className="fu-modal-form-row" style={{ marginBottom: 10 }}>
                  <div className="agreement-field-group" style={{ marginBottom: 0 }}>
                    <label>Reminder 1 — fires before</label>
                    <select value={form.reminder1Hours} onChange={(e) => setForm(f => ({ ...f, reminder1Hours: Number(e.target.value) }))}>
                      {REMINDER_HOUR_PRESETS.map(h => <option key={h} value={h}>{h} hour{h > 1 ? 's' : ''}</option>)}
                    </select>
                  </div>
                  <div className="agreement-field-group" style={{ marginBottom: 0 }}>
                    <label>Reminder 2 — fires before</label>
                    <select value={form.reminder2Hours} onChange={(e) => setForm(f => ({ ...f, reminder2Hours: Number(e.target.value) }))}>
                      {REMINDER_HOUR_PRESETS.map(h => <option key={h} value={h}>{h} hour{h > 1 ? 's' : ''}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ fontSize: '11px', color: '#2563eb', fontWeight: 700, marginBottom: 10 }}>
                  Reminder 1 at: {reminderPreviewText(form.date, form.time, form.reminder1Hours) || 'set date & time first'}
                  {'  •  '}Reminder 2 at: {reminderPreviewText(form.date, form.time, form.reminder2Hours) || 'set date & time first'}
                </div>

                <div className="agreement-field-group" style={{ marginBottom: 0 }}>
                  <label>Reminder message (shown in the popup)</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Reminder: Follow up re: Vehicle Listing #5642"
                    value={form.popupNote}
                    maxLength={60}
                    onChange={(e) => setForm(f => ({ ...f, popupNote: e.target.value }))}
                    style={{ width: '100%', padding: '9px 11px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#f9fafb', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
                  />
                  <div style={{ fontSize: '10.5px', color: '#9ca3af', marginTop: 3 }}>{form.popupNote.length}/60</div>
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '10px' }}>
              <button onClick={closeModal} style={{ flex: 1, padding: '11px', border: '1px solid #d1d5db', borderRadius: '6px', background: '#fff', color: '#374151', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={isSaving} style={{ flex: 1, padding: '11px', border: 'none', borderRadius: '6px', background: '#2563eb', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: isSaving ? 'not-allowed' : 'pointer', opacity: isSaving ? 0.6 : 1 }}>
                {isSaving ? 'Saving…' : (editingId != null ? 'Save Changes' : 'Add Follow Up')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DAY POPOVER (list of items behind an aggregated chip) ── */}
      {dayPopover && (
        <div className="product-modal-overlay" onClick={() => setDayPopover(null)}>
          <div className="product-modal-content" style={{ maxWidth: '420px', maxHeight: '70vh' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '15px', color: '#111827' }}>{formatDateLong(dayPopover)}</h3>
              <button onClick={() => setDayPopover(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#9ca3af' }}>✕</button>
            </div>
            <div style={{ padding: '12px 16px', overflowY: 'auto' }}>
              {(followUpsByDate[dayPopover] || []).map(item => {
                const meta = typeMeta(item.type);
                const hasInvoice = item.invoiceId > 0;
                return (
                  <div
                    key={item.id}
                    onClick={() => { if (hasInvoice) openInvoiceFor(item); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '8px', border: '1px solid #f3f4f6', marginBottom: '8px', cursor: hasInvoice ? 'pointer' : 'default' }}
                    title={hasInvoice ? 'Click to open this follow-up\'s invoice' : undefined}
                  >
                    <span className="fu-type-badge" style={{ background: meta.bg, color: meta.color }}>{meta.code === '💬' ? '💬' : meta.code} {item.type}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#111827' }}>{item.contactName || item.subject || item.type}</div>
                      <div style={{ fontSize: '11.5px', color: '#6b7280' }}>{formatTime(item.time)} • {item.channel}{hasInvoice ? ` • Invoice #${item.invoiceId}` : ''}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                      <button
                        className="fu-icon-btn"
                        title={item.status === 'done' ? 'Mark as pending' : 'Mark as done'}
                        onClick={() => handleToggleStatus(item)}
                        style={item.status === 'done'
                          ? { color: '#059669', borderColor: '#a7f3d0', background: '#ecfdf5' }
                          : { color: '#d97706', borderColor: '#fde68a', background: '#fffbeb' }}
                      >
                        {item.status === 'done' ? '✓' : '○'}
                      </button>
                      <button className="fu-icon-btn edit" onClick={() => openEditModal(item)}>✎</button>
                      <button className="fu-icon-btn delete" onClick={() => handleDelete(item)}>🗑</button>
                    </div>
                  </div>
                );
              })}
              <button
                className="fu-add-btn"
                style={{ width: '100%', marginTop: '4px' }}
                onClick={() => openAddModal(dayPopover)}
              >
                + Add another follow-up on this date
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FollowUpsSection;