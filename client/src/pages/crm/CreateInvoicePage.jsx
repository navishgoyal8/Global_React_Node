import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { API_BASE_URL } from '../../config';
import AddNewCardModal from '../../components/Invoices/AddNewCardModal';
import EditCartModal from '../../components/Invoices/EditCartModal';
import InlineItemPicker from '../../components/Invoices/InlineItemPicker';
import CrmQuickNav from '../../components/Navigation/CrmQuickNav';
import VehicleAgreementCard from '../../components/Invoices/VehicleAgreementCard';
import VehicleConsignmentSummary from '../../components/Invoices/VehicleConsignmentSummary';
import { getConsignments } from '../../components/Invoices/vehicleAgreementUtils';

const AVAILABLE_COLORS = [
  { name: 'white', hex: '#ffffff' },
  { name: 'black', hex: '#000000' },
  { name: 'orange', hex: '#f97316' },
  { name: 'yellow', hex: '#eab308' },
  { name: 'red', hex: '#ef4444' },
  { name: 'blue', hex: '#3b82f6' },
];

const getCurrentDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

// Ads agreement contract terms: Monthly → "N months and then monthly" up to 12.
const CONTRACT_TERM_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const m = i + 1;
  return {
    value: m === 1 ? 'Monthly' : `${m} months and then monthly`,
    label: m === 1 ? 'Monthly' : `${m} months and then monthly`,
  };
});
const CONTRACT_TERM_MONTHS = (term) => {
  const idx = CONTRACT_TERM_OPTIONS.findIndex(o => o.value === term);
  return Math.min(12, Math.max(1, idx + 1));
};

// ad_contracts.term_type, normalised onto the three options the form offers.
// Only 'paid' is implemented so far: the complimentary variants still need
// billing rules (grace period, what is charged after it), so they are marked
// unavailable and cannot be picked. Flip `available` to true once built.
const TERM_TYPE_OPTIONS = [
  { value: 'paid', label: 'Paid', available: true },
  { value: 'complimentary', label: 'Complimentary', available: false },
  { value: 'complimentary_then_pay', label: 'Complimentary & then pay', available: false },
];
const COMPLIMENTARY_TERM_OPTIONS = [1, 2, 3];
const isTermTypeAvailable = (value) =>
  TERM_TYPE_OPTIONS.some(o => o.value === value && o.available);
const normaliseTermType = (raw) => {
  const v = String(raw || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!v) return 'paid';
  if (v.includes('comp')) {
    return /then|and_pay|after|plus/.test(v) ? 'complimentary_then_pay' : 'complimentary';
  }
  return 'paid';
};

// ad_contracts.agreement_terms is free text written by BOTH the CRM and the
// legacy admin panel, and the admin panel also stores values like "paid" that
// are not in CONTRACT_TERM_OPTIONS. The admin form additionally defaults
// agreement_terms to the rolling "Monthly" and keeps the real commitment length
// in paid_term ('4_then_monthly') and upfront_months - so a bare "Monthly" that
// sits next to an explicit month count really means "N months and then
// monthly". Resolve the term and the upfront months together so the two can
// never disagree (a term of 1 month with 4 months billed up front is nonsense).
const resolveAdAgreementTerm = (rawTerm, paidTerm, upfrontMonths, collectionType) => {
  const values = CONTRACT_TERM_OPTIONS.map(o => o.value);
  const raw = String(rawTerm || '').trim();

  // paid_term's N is the CONTRACT DURATION ("6_then_monthly" = 6 months).
  // upfront_months is the CREDIT-CARD CHARGE FREQUENCY. They are independent -
  // a 6-month contract can be billed every 3 months - so they are tracked
  // separately here and neither is ever allowed to stand in for the other.
  const fromPaidTerm = parseInt(String(paidTerm || '').match(/^(\d+)_then/)?.[1], 10);
  const stated = parseInt(upfrontMonths, 10);
  const duration = Number.isInteger(fromPaidTerm) ? fromPaidTerm : 0;
  const frequency = Number.isInteger(stated) ? stated : 0;

  const paidTermRaw = String(paidTerm || '').trim().toLowerCase();
  const paidTermEmpty = paidTermRaw === '';
  const paidTermSaysMonthly = paidTermRaw === 'monthly';

  let term = raw && values.includes(raw) ? raw : '';

  // Recover the real term when agreement_terms is only the rolling "Monthly":
  //  - paid_term says N_then_monthly -> the duration is N
  //  - paid_term absent (legacy admin row) -> the old duration was upfront_months
  //  - paid_term says 'monthly' -> it really IS month-to-month. An
  //    upfront_months of N there is only how often the card is billed, so
  //    promoting would silently rewrite the agent's choice to "N months and
  //    then monthly" every time the invoice is reopened.
  if (term === CONTRACT_TERM_OPTIONS[0].value && !paidTermSaysMonthly) {
    const hint = duration || (paidTermEmpty ? frequency : 0);
    if (hint > 1 && hint <= 12) term = CONTRACT_TERM_OPTIONS[hint - 1].value;
  }
  if (!term) {
    const hint = duration || frequency;
    term = hint >= 1 && hint <= 12
      ? CONTRACT_TERM_OPTIONS[hint - 1].value
      : CONTRACT_TERM_OPTIONS[0].value;
  }

  const contractMonths = CONTRACT_TERM_MONTHS(term);

  // 'at_once' collects the whole contract term immediately; otherwise the
  // credit-card charge frequency decides what falls due up front, capped at the
  // contract's own length.
  const atOnce = String(collectionType || '').toLowerCase() === 'at_once';
  const upfront = Math.min(contractMonths, Math.max(1, atOnce ? contractMonths : (frequency || 1)));

  return { term, contractMonths, upfrontMonths: upfront };
};

// Inverse of the paid_term branch of resolveAdAgreementTerm: maps the form's
// contract term onto the fixed ad_contracts.paid_term shape, where a 1-month
// term is 'monthly' and a 2-12 month commitment is 'N_then_monthly'. Writing the
// exact form the reader parses (/^(\d+)_then/) keeps save and fetch symmetric.
const toAdPaidTerm = (term) => {
  const months = CONTRACT_TERM_MONTHS(term);
  return months <= 1 ? 'monthly' : `${months}_then_monthly`;
};

const getCurrentTime = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};

const SCHEDULE_STAMP_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The send stamp shown on a scheduled-discount row, e.g. "Sep 26, 26 12:48AM".
// It is written pre-formatted into crm_scheduled_messages.discount_details
// .dateLabel so the label round-trips byte for byte: the raw send_date column
// travels as a UTC ISO string and lands a day early once the browser re-reads it
// in its own zone. Only legacy rows without a dateLabel reach the Date branch.
const formatSendStamp = (dateVal, timeVal) => {
  const d = String(dateVal || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  const t = String(timeVal || '').match(/^(\d{1,2}):(\d{2})/);
  if (d) {
    let h = t ? parseInt(t[1], 10) : 0;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    const mi = t ? t[2] : '00';
    return `${SCHEDULE_STAMP_MONTHS[parseInt(d[2], 10) - 1]} ${parseInt(d[3], 10)}, ${d[1].slice(-2)} ${h}:${mi}${ampm}`;
  }
  // Non-ISO input (a "<input type=date>" value, a Date object): parse it.
  const dt = new Date(dateVal);
  if (isNaN(dt.getTime())) return String(dateVal || '');
  let h = dt.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${SCHEDULE_STAMP_MONTHS[dt.getMonth()]} ${dt.getDate()}, ${String(dt.getFullYear()).slice(-2)} ${h}:${mm}${ampm}`;
};

const PACKAGE_TYPES = ['L', 'M', 'A', 'R'];

// Admin-panel / frontend orders store each line's `type` as the numeric
// sale_products.type (1=Listing, 2=Membership, 3=Ads, 5=Seat Covers, 6=Renewal),
// while the CRM stores it as a letter. Normalise to the CRM's letter form so a
// restored invoice (e.g. a Renewal invoice created from the admin panel) shows
// up and re-saves with the right type.
const SALE_TYPE_TO_ITEM_TYPE = { 1: 'L', 2: 'M', 3: 'A', 5: 'P', 6: 'R' };
const normalizeDbCartItem = (item) => {
  if (!item || typeof item !== 'object') return item;
  const rawType = item.type;
  const numericType = typeof rawType === 'number'
    ? rawType
    : (/^\d+$/.test(String(rawType == null ? '' : rawType)) ? parseInt(rawType, 10) : null);
  const type = numericType != null ? (SALE_TYPE_TO_ITEM_TYPE[numericType] || rawType) : rawType;
  const itemId = item.itemId != null ? item.itemId : (item.product_id != null ? item.product_id : item.id);
  return {
    ...item,
    type,
    itemId,
    id: item.id != null ? item.id : (itemId != null ? `sale-${type}-${itemId}` : undefined),
    quantity: item.quantity != null ? item.quantity : (item.qty != null ? item.qty : 1),
    name: item.name || item.display_name || 'Item',
    price: Number(item.price) || 0,
  };
};

// Only ONE package kind (Listing / Membership / Ads / Renewal) is allowed per invoice.
// When a cart has a mix (e.g. restored or pre-filled), keep the kind with the
// most line items so the "dominant" package wins.
const enforceSinglePackageKind = (items) => {
  if (!Array.isArray(items)) return items || [];
  const kindsPresent = PACKAGE_TYPES.filter(t => items.some(i => i && i.type === t));
  if (kindsPresent.length <= 1) return items;
  const dominant = kindsPresent.reduce((a, b) =>
    (items.filter(i => i.type === a).length >= items.filter(i => i.type === b).length) ? a : b
  );
  return items.filter(i => !PACKAGE_TYPES.includes(i.type) || i.type === dominant);
};

// Signature of the discount-eligible package lines in a cart (their itemIds).
// Used to detect when the package set changed so an applied coupon can be
// re-validated against the new package automatically.
const couponSignatureFor = (items) =>
  (items || [])
    .filter(i => i && ['L', 'M', 'A'].includes(i.type))
    .map(i => String(i.itemId))
    .sort()
    .join('|');

// ── Customer-facing "Email the person" payment-link emails (Klaviyo-style) ──
// Direct frontend calls — no backend required. Each product type uses its own
// email-template endpoint on the main site. The secured crmToken is NEVER
// committed here: set VITE_CRM_TOKEN in client/.env.production (and
// client/.env.development for local browser tests). Keep `tokenHeader`
// matching the custom header used in your Postman collection.
const PAY_LINK_EMAIL = {
  baseUrl: 'https://developer.globallimos.com/sales',
  token: import.meta.env.VITE_CRM_TOKEN || '',
  tokenHeader: 'x-crm-token', // change this to match your Postman custom header name
  endpoints: {
    M: '/api/sendMembershipPaymentLinkEmail',
    L: '/api/sendListingPackPaymentLinkEmail',
    A: '/api/sendAdsPaymentLinkEmail'
  },
};

const parseLegacySpecs = (specsStr) => {
  let color = null;
  let pattern = null;
  if (specsStr && specsStr !== '-') {
    const parts = specsStr.split('•');
    parts.forEach(part => {
      if (part.includes('Color:')) {
        const val = part.split('Color:')[1].trim().toLowerCase();
        if (val === '1' || val === 'black') color = 'black';
        else if (val === '2' || val === 'white') color = 'white';
        else if (val === '3' || val === 'orange') color = 'orange';
        else if (val === '4' || val === 'yellow') color = 'yellow';
        else if (val === '5' || val === 'red') color = 'red';
        else if (val === '6' || val === 'blue') color = 'blue';
        else color = val;
      }
      if (part.includes('Pattern:')) {
        const val = part.split('Pattern:')[1].trim().toLowerCase();
        if (val === '1' || val === 'hexagon') pattern = 'Hexagon';
        else if (val === '2' || val === 'diamond') pattern = 'Diamond';
        else if (val === '3' || val === 'chevron') pattern = 'Chevron';
        else if (val === '4' || val === 'leaf') pattern = 'Leaf';
        else if (val === '5' || val === 'custom') pattern = 'Custom';
        else pattern = val.charAt(0).toUpperCase() + val.slice(1);
      }
    });
  }
  return { color, pattern };
};

const ModalField = ({ label, field, type, placeholder, required, value, error, onChange }) => (
  <div style={{ marginBottom: 16 }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
    </label>
    <input
      type={type || 'text'}
      value={value}
      onChange={e => onChange(field, e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', padding: '11px 13px',
        border: `1.5px solid ${error ? '#ef4444' : '#d1d5db'}`,
        borderRadius: 8, fontSize: 14, color: '#111827',
        outline: 'none', boxSizing: 'border-box',
        background: 'white', fontFamily: 'inherit',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onFocus={e => { e.target.style.borderColor = error ? '#ef4444' : '#2563eb'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)'; }}
      onBlur={e => { e.target.style.borderColor = error ? '#ef4444' : '#d1d5db'; e.target.style.boxShadow = 'none'; }}
    />
    {error && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}>⚠ {error}</div>}
  </div>
);

// ── Edit Customer Modal ──────────────────────────────────────────────────────
const EditCustomerModal = ({ customerInfo, onSave, onClose }) => {
  const [form, setForm] = useState({
    name: customerInfo.name || '',
    email: customerInfo.email || '',
    phone: customerInfo.phone || '',
    company: customerInfo.company || '',
  });
  const [errors, setErrors] = useState({});
  const overlayRef = useRef(null);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email';
    if (!form.phone.trim()) e.phone = 'Phone is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => { if (validate()) onSave({ ...customerInfo, ...form }); };
  const handleOverlayClick = (e) => { if (e.target === overlayRef.current) onClose(); };

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleFieldChange = useCallback((field, val) => {
    setForm(f => ({ ...f, [field]: val }));
    setErrors(e => ({ ...e, [field]: '' }));
  }, []);

  const avatarLetter = useMemo(() => customerInfo.name ? customerInfo.name.charAt(0).toUpperCase() : '?', [customerInfo.name]);

  return (
    <div ref={overlayRef} onClick={handleOverlayClick} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)', padding: '16px' }}>
      <div className="edit-modal-card" style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: 480, boxShadow: '0 20px 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, minWidth: 42, background: '#2563eb', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700 }}>{avatarLetter}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>Edit Customer</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>Update contact information</div>
          </div>
          <button onClick={onClose} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, color: '#6b7280', flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ padding: '20px 20px 4px', overflowY: 'auto' }}>
          <ModalField label="Full Name" field="name" placeholder="e.g. John Smith" required value={form.name} error={errors.name} onChange={handleFieldChange} />
          <ModalField label="Email Address" field="email" type="email" placeholder="customer@email.com" required value={form.email} error={errors.email} onChange={handleFieldChange} />
          <ModalField label="Phone Number" field="phone" type="tel" placeholder="+1 (555) 000-0000" required value={form.phone} error={errors.phone} onChange={handleFieldChange} />
          <ModalField label="Company Name" field="company" placeholder="Company (optional)" value={form.company} error={errors.company} onChange={handleFieldChange} />
        </div>
        <div style={{ padding: '12px 20px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'white', border: '1.5px solid #d1d5db', color: '#374151', padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={handleSave} style={{ background: '#2563eb', color: 'white', border: 'none', padding: '10px 24px', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>✓ Save Changes</button>
        </div>
      </div>
    </div>
  );
};

// ── Single editable discount row (flat $ or %, editable value + live amount) ──
const DiscountRow = ({ variant, label, type, value, onTypeChange, onValueChange, amount, onRemove, title, onTitleChange }) => {
  const compact = variant === 'compact';
  const titleEditable = title !== undefined && typeof onTitleChange === 'function';
  return (
    <div
      className={compact ? 'sr' : undefined}
      style={compact
        ? { alignItems: 'center', color: '#dc2626' }
        : { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
    >
      {titleEditable ? (
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={label}
          title="Discount title shown on the checkout"
          style={{
            width: compact ? 74 : 96,
            fontSize: compact ? 12 : 13, fontWeight: 600, color: '#b91c1c', flexShrink: 0,
            border: 'none', borderBottom: '1.5px dashed #fca5a5', background: 'transparent',
            padding: '0 2px', outline: 'none', fontFamily: 'inherit',
            transition: 'border-color 0.15s',
          }}
        />
      ) : (
        <span style={{ fontSize: compact ? 12 : 13, fontWeight: 600, color: '#b91c1c', flexShrink: 0 }}>{label}</span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 4 : 6 }}>
        <div style={{ display: 'inline-flex', borderRadius: compact ? 6 : 8, border: '1.5px solid #fca5a5', overflow: 'hidden', background: '#fff', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => onTypeChange('flat')}
            style={{
              padding: compact ? '3px 8px' : '5px 12px', border: 'none', cursor: 'pointer',
              fontSize: compact ? 10 : 12, fontWeight: 700,
              background: type === 'flat' ? '#dc2626' : 'transparent',
              color: type === 'flat' ? '#fff' : '#b91c1c',
              fontFamily: 'inherit', transition: 'background 0.15s, color 0.15s',
            }}
          >$</button>
          <button
            type="button"
            onClick={() => onTypeChange('percent')}
            style={{
              padding: compact ? '3px 8px' : '5px 12px', border: 'none', borderLeft: '1.5px solid #fca5a5', cursor: 'pointer',
              fontSize: compact ? 10 : 12, fontWeight: 700,
              background: type === 'percent' ? '#dc2626' : 'transparent',
              color: type === 'percent' ? '#fff' : '#b91c1c',
              fontFamily: 'inherit', transition: 'background 0.15s, color 0.15s',
            }}
          >%</button>
        </div>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          {type === 'flat' && <span style={{ position: 'absolute', left: compact ? 6 : 9, fontSize: compact ? 11 : 13, fontWeight: 700, color: '#b91c1c', pointerEvents: 'none' }}>$</span>}
          <input
            type="number"
            min="0"
            max={type === 'percent' ? 100 : undefined}
            step="0.01"
            placeholder={type === 'flat' ? '0.00' : '0'}
            value={value}
            onChange={e => onValueChange(e.target.value)}
            style={{
              width: compact ? 56 : 80,
              textAlign: type === 'percent' ? 'center' : 'right',
              border: '1.5px solid #fca5a5', borderRadius: compact ? 6 : 8,
              padding: type === 'percent'
                ? (compact ? '3px 16px 3px 6px' : '5px 22px 5px 8px')
                : (compact ? '3px 6px 3px 16px' : '5px 8px 5px 20px'),
              fontSize: compact ? 12 : 14, fontWeight: 700, color: '#b91c1c', outline: 'none', background: '#fff',
              fontFamily: 'inherit', transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
            onFocus={e => { e.target.style.borderColor = '#dc2626'; e.target.style.boxShadow = '0 0 0 3px rgba(220,38,38,0.12)'; }}
            onBlur={e => { e.target.style.borderColor = '#fca5a5'; e.target.style.boxShadow = 'none'; }}
          />
          {type === 'percent' && <span style={{ position: 'absolute', right: compact ? 6 : 9, fontSize: compact ? 11 : 13, fontWeight: 700, color: '#b91c1c', pointerEvents: 'none' }}>%</span>}
        </div>
        <span style={{ width: compact ? 48 : 85, textAlign: 'right', fontSize: compact ? 12 : 14, fontWeight: 800, color: value ? '#dc2626' : '#c4b5b5', flexShrink: 0 }}>-${amount.toFixed(2)}</span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: compact ? 11 : 14, color: '#9ca3af', padding: 0, flexShrink: 0 }}
            title="Remove discount"
          >✕</button>
        )}
      </div>
    </div>
  );
};

// Combined discount editor. The rows are rendered FROM the customDiscounts list
// (the same array that is stored in crm_invoices.discount_details.customDiscounts):
// the first entry is Custom Discount 1 as long as it carries an amount, then every
// "+ Add Custom Discount" entry. The page passes an editor list that also includes
// still-empty rows so a freshly added discount shows up immediately. Editing still
// writes to the same underlying fields (custom 1 <-> discountValue/type, extras <->
// extraDiscounts), and extraDiscounts stays stored exactly as before.
const DiscountEditor = ({ variant, customDiscounts, discountType, setDiscountType, discountValue, setDiscountValue, customDiscountAmount, combinedDiscountTitle, setCombinedDiscountTitle, extraDiscounts, setExtraDiscounts, onAddScheduledDiscount, scheduledDiscounts }) => {
  const compact = variant === 'compact';

  const updateExtra = (id, patch) => setExtraDiscounts(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x));
  const addExtra = () => setExtraDiscounts(prev => [...prev, { id: `d_${Date.now()}_${prev.length}`, type: 'flat', value: '', title: `Custom ${prev.length + 2}` }]);

  const hasPrimary = customDiscountAmount > 0;

  const renderEntry = (cd, i) => {
    if (hasPrimary && i === 0) {
      return (
        <DiscountRow
          key="custom-1"
          variant={variant}
          label="Custom Discount 1"
          title={combinedDiscountTitle || cd.title}
          onTitleChange={setCombinedDiscountTitle}
          type={discountType}
          value={discountValue}
          onTypeChange={setDiscountType}
          onValueChange={setDiscountValue}
          amount={cd.displayAmount ?? cd.amount}
        />
      );
    }
    const d = extraDiscounts[hasPrimary ? i - 1 : i];
    if (!d) return null;
    return (
      <DiscountRow
        key={d.id}
        variant={variant}
        label={cd.title || d.title || `Custom Discount ${i + 1}`}
        title={d.title}
        onTitleChange={(val) => updateExtra(d.id, { title: val })}
        type={d.type}
        value={d.value}
        onTypeChange={(t) => updateExtra(d.id, { type: t })}
        onValueChange={(val) => updateExtra(d.id, { value: val })}
        amount={cd.displayAmount ?? cd.amount}
        onRemove={() => setExtraDiscounts(prev => prev.filter(x => x.id !== d.id))}
      />
    );
  };

  // Rows are ALWAYS rendered as an array with a stable key. Previously the first
  // row came from a keyless fallback branch until the very first digit was
  // typed; that made customDiscountAmount > 0, which switched the branch to the
  // keyed "custom-1" entry. The key changed (undefined -> "custom-1") and the
  // children changed shape (element -> array), so React unmounted and remounted
  // the input - the caret vanished after one character. Same key + same shape
  // means React reuses the DOM node and the cursor stays put.
  const rows = customDiscounts.length > 0
    ? customDiscounts.map(renderEntry)
    : [
      <DiscountRow
        key="custom-1"
        variant={variant}
        label="Custom Discount 1"
        title={combinedDiscountTitle}
        onTitleChange={setCombinedDiscountTitle}
        type={discountType}
        value={discountValue}
        onValueChange={setDiscountValue}
        amount={customDiscountAmount}
      />,
    ];

  return (
    <>
      {rows}

      {/* Scheduled-message ads discounts, itemised one row per message with the
          SAME label persisted to ad_contracts.discounts_json ("Scheduled Discount
          (Sep 26, 26 12:48AM) 1% off"). These replace the old single "Scheduled
          Ads Discount" line and deliberately share its layout - right-aligned label
          with the amount in a fixed-width column - so the two read as one list.
          Read-only: the amount and stamp belong to the scheduled message, and
          editing them belongs in the schedule modal. The figure shown is the
          resolved (monthly x term) amount, matching the custom discount rows. */}
      {(scheduledDiscounts || []).map((d, i) => (
        <div
          key={`sched-disc-${i}`}
          style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}
        >
          <span style={{ fontSize: 13, fontWeight: 500, color: '#dc2626' }}>💬 {d.label}</span>
          <div style={{ width: 140, textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#dc2626' }}>
            -${Number(d.displayAmount ?? d.amount ?? 0).toFixed(2)}
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, marginTop: compact ? 4 : 6 }}>
        <button
          type="button"
          onClick={addExtra}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: compact ? 11 : 12, fontWeight: 600, color: '#dc2626',
            padding: 0, fontFamily: 'inherit', textDecoration: 'underline',
          }}
        >+ Add Custom Discount</button>
        {onAddScheduledDiscount && (
          <button
            type="button"
            onClick={onAddScheduledDiscount}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: compact ? 11 : 12, fontWeight: 600, color: '#dc2626',
              padding: 0, fontFamily: 'inherit', textDecoration: 'underline',
            }}
          >+ Add Scheduled Discount</button>
        )}
      </div>
    </>
  );
};

// ── Main Page ────────────────────────────────────────────────────────────────
const CreateInvoicePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { invoiceId: urlInvoiceId } = useParams();
  const { lead, selectedListings = [], selectedMemberships = [], selectedProducts = [], selectedAdPackage = '', selectedAdFeatures = [], prefilledCustomer, existingInvoiceNumber, taxAmount: incomingTaxAmount, shippingCost: incomingShippingCost, totalOverride: incomingTotalOverride, seatCoversOverride: incomingSeatCoversOverride } = location.state || {};
  const stateInvoiceId = location.state?.invoiceIdFromCRM || null;
  const parsedUrlId = urlInvoiceId ? parseInt(urlInvoiceId, 10) : NaN;
  const invoiceIdFromCRM = (Number.isInteger(parsedUrlId) && parsedUrlId > 0) ? parsedUrlId : stateInvoiceId;
  const [invoiceNumber, setInvoiceNumber] = useState(existingInvoiceNumber || `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);

  const [sendModalState, setSendModalState] = useState('closed');
  const [linkCopied, setLinkCopied] = useState(false);

  const [currentInvoiceId, setCurrentInvoiceId] = useState(invoiceIdFromCRM || null);
  const [showEditCustomer, setShowEditCustomer] = useState(false);
  const [savedBadge, setSavedBadge] = useState(false);
  const [systemUsers, setSystemUsers] = useState([]);
  const [showChangeCustomerDropdown, setShowChangeCustomerDropdown] = useState(false);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [selectedUserId, setSelectedUserId] = useState(
    location.state?.prefilledCustomer?.userId || location.state?.existingLeadData?.userId || location.state?.lead?.user?.id || null
  );
  const [contactMode, setContactMode] = useState('existing');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  const [collapsedSections, setCollapsedSections] = useState({
    customer: false, items: true, discount: true, messages: true, notes: true, paymentLink: true, adAgreement: true, contactActions: true, followups: true
  });
  const toggleSection = (key) => setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));

  const [customerInfo, setCustomerInfo] = useState({
    name: prefilledCustomer?.name || lead?.user?.name || '',
    company: prefilledCustomer?.company || lead?.user?.company || '',
    email: prefilledCustomer?.email || lead?.user?.email || '',
    phone: prefilledCustomer?.phone || lead?.id || '',
    address: '', city: '', state: 'CA', zip: '',
    leadStatus: location.state?.leadStatus || 'Intake',
    internalNotes: '',
  });

  const [discountType, setDiscountType] = useState('flat');
  const [discountValue, setDiscountValue] = useState('');
  const [combinedDiscountTitle, setCombinedDiscountTitle] = useState('Custom 1');
  const [extraDiscounts, setExtraDiscounts] = useState([]);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState('');
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  // Tracks which package set (L/M/A itemIds) the applied coupon was last
  // validated against, and guards against overlapping coupon lookups.
  const lastCouponValidationSignature = useRef('');
  const couponValidationInFlight = useRef(false);
  const restoreSettledRef = useRef(!invoiceIdFromCRM);
  // Mirror of restoreSettledRef as STATE. The ref alone cannot schedule a
  // re-render, so flipping it in a .finally() left the ad-agreement fetch effect
  // free to bail out on its last run and never retry - which is why an
  // admin-created invoice (whose discount_details carries no adTermType /
  // adAgreementDate, so restore produces fewer state updates) could open with an
  // empty Ad Agreement Details section. The ref is still read synchronously by
  // the autosave gate; this state is what re-triggers the effect.
  const [restoreSettled, setRestoreSettled] = useState(!invoiceIdFromCRM);

  const [shippingOverride, setShippingOverride] = useState(incomingShippingCost != null ? parseFloat(incomingShippingCost) || 0 : null);
  const [taxOverride, setTaxOverride] = useState(incomingTaxAmount != null ? parseFloat(incomingTaxAmount) || 0 : null);
  const [totalOverride, setTotalOverride] = useState(incomingTotalOverride != null ? parseFloat(incomingTotalOverride) || 0 : null);
  const [seatCoversOverride, setSeatCoversOverride] = useState(incomingSeatCoversOverride != null ? parseFloat(incomingSeatCoversOverride) || 0 : null);

  const [cartItems, setCartItems] = useState([]);
  // { [vehicleKey]: { consignment?: {...}, referral?: {...} } }
  const [vehicleAgreements, setVehicleAgreements] = useState({});
  const [adPackages, setAdPackages] = useState([]);
  const [listingPackages, setListingPackages] = useState([]);
  const [membershipPackages, setMembershipPackages] = useState([]);
  const [renewalPackages, setRenewalPackages] = useState([]);
  const [packagesLoaded, setPackagesLoaded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [notes, setNotes] = useState('');
  const [paymentType, setPaymentType] = useState('full');
  const [depositPercent, setDepositPercent] = useState(35);

  const [messageTab, setMessageTab] = useState('texts');
  const [scheduledTexts, setScheduledTexts] = useState([]);
  const [scheduledEmails, setScheduledEmails] = useState([]);

  const [showAllMessages, setShowAllMessages] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState(null);

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [newSchedule, setNewSchedule] = useState({
    date: getCurrentDate(),
    time: getCurrentTime(),
    discount: 0,
    discountType: 'flat',
    discounts: {
      listing: { type: 'flat', value: 0 },
      membership: { type: 'flat', value: 0 },
      ads: { type: 'flat', value: 0 },
    },
    messageBody: '',
    attachPayLink: false,
    offerExpiry: null,
  });

  const [linkExpiry, setLinkExpiry] = useState('No Limit');
  const [payLinkMessage, setPayLinkMessage] = useState('');
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [payLinkPhone, setPayLinkPhone] = useState('');
  const [payLinkEmail, setPayLinkEmail] = useState('');
  const [emailSendingKind, setEmailSendingKind] = useState(null); // 'M' | 'L' | 'A' for "Email the person"

  const [agreementBillTo, setAgreementBillTo] = useState('');
  const [agreementPhone, setAgreementPhone] = useState('');
  const [agreementAltPhone, setAgreementAltPhone] = useState('');
  const [agreementDate, setAgreementDate] = useState('');
  const [agreementTerms, setAgreementTerms] = useState('Monthly');
  // Ads payment term (in months): how many months are billed upfront now.
  // Options run from "Monthly" (1) up to the selected contract term months.
  const [agreementPaymentTerm, setAgreementPaymentTerm] = useState('1');
  const [generatedAdLink, setGeneratedAdLink] = useState('');
  const [isGeneratingAdLink, setIsGeneratingAdLink] = useState(false);
  const [isSendingAdLink, setIsSendingAdLink] = useState(false);
  const [adLinkCopied, setAdLinkCopied] = useState(false);
  const [adContractId, setAdContractId] = useState(null);
  const [adContractToken, setAdContractToken] = useState('');

  // Values that live ONLY on ad_contracts and are written by the legacy admin
  // panel, not by the CRM. They are fetched for display so the invoice page
  // shows the real contract terms instead of the CRM's own (possibly stale)
  // copy in crm_invoices.discount_details.
  const [adTermType, setAdTermType] = useState('paid');
  const [adComplimentaryTerm, setAdComplimentaryTerm] = useState(1);
  const [adContractSource, setAdContractSource] = useState(null);
  const [isLoadingAdAgreement, setIsLoadingAdAgreement] = useState(false);
  // Guards the auto-fetch so it runs once per invoice. Without this, any
  // re-render that changes the id would overwrite whatever the agent is typing.
  const adAgreementFetchedFor = useRef(null);

  // Secure Payment Link panel: link is generated on demand, then delivered via
  // one of four modes — system text / manual text / system email / manual email.
  const [linkSendMode, setLinkSendMode] = useState('text_system');
  const [linkGenerated, setLinkGenerated] = useState(false);
  const [isSendingPayLink, setIsSendingPayLink] = useState(false);

  // SEPARATE HEX-TOKEN CHECKOUT LINKS (listing vs membership)
  const [checkoutLinks, setCheckoutLinks] = useState({ listing: null, membership: null });
  const [checkoutTokens, setCheckoutTokens] = useState({ listing: null, membership: null });
  const [linkIncludeTypes, setLinkIncludeTypes] = useState({ listing: true, membership: true, ads: true });
  const PAY_LINK_PLACEHOLDER = '[Secure payment link will be added automatically]';
  const AD_LINK_PLACEHOLDER = '[Ad Agreement link will be generated automatically]';

  // NEW LEGAL TERMS STATE
  const [termsTemplateId, setTermsTemplateId] = useState('');
  const [termsData, setTermsData] = useState({
    terms: '',
    payment_terms: '',
    limited_liability: '',
    indemnification: '',
    governing_law: '',
    dispute_resolution: ''
  });

  const [dbSchedules, setDbSchedules] = useState([]);
  const [showEditCartModal, setShowEditCartModal] = useState(false);
  const [showAddCardModal, setShowAddCardModal] = useState(false);
  const [storedCards] = useState([
    { id: 'card_1', brand: 'Visa', last4: '4242', isDefault: true },
    { id: 'card_2', brand: 'Mastercard', last4: '8888', isDefault: false },
    { id: 'card_3', brand: 'Amex', last4: '1005', isDefault: false },
  ]);
  const [selectedCardId, setSelectedCardId] = useState(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // 💡 AUTO-DETECT CART STATE AND ACTIVE PACKAGE
  // ─────────────────────────────────────────────────────────────────────────────
  const hasOnlyAds = useMemo(() => {
    return cartItems.length > 0 && cartItems.every(i => i.type === 'A' || i.id === 'ads-package');
  }, [cartItems]);

  const hasPhysical = useMemo(() => {
    return cartItems.some(i => i.type === 'P' || !i.type);
  }, [cartItems]);

  const hasAdItem = useMemo(() => {
    return cartItems.some(i => i.type === 'A' || i.id === 'ads-package');
  }, [cartItems]);

  const availableLinkTypes = useMemo(() => {
    const types = [];
    if (cartItems.some(i => i.type === 'L')) types.push({ key: 'listing', label: 'Listing' });
    if (cartItems.some(i => i.type === 'M')) types.push({ key: 'membership', label: 'Membership' });
    if (hasAdItem && !hasOnlyAds) types.push({ key: 'ads', label: 'Ads Agreement' });
    return types;
  }, [cartItems, hasAdItem, hasOnlyAds]);

  const defaultLinkIncludeTypes = useMemo(() => {
    return availableLinkTypes.reduce((acc, t) => ({ ...acc, [t.key]: true }), { listing: true, membership: true, ads: true });
  }, [availableLinkTypes]);

  // Determine the active ad package directly from cart items.
  // Falls back to a name match (covers invoices where itemId was never stored
  // or got out of sync with the packages list) and then to the lone package,
  // so the Generate Link buttons can never be silently dead.
  const activeAdPackage = useMemo(() => {
    const cartAdItem = cartItems.find(item => item.type === 'A' || item.id === 'ads-package');
    if (!cartAdItem) return null;
    let match = adPackages.find(p => String(p.id) === String(cartAdItem.itemId));
    if (!match && cartAdItem.name) {
      const nameKey = String(cartAdItem.name).trim().toLowerCase();
      match = adPackages.find(p => String(p.display_name || p.name || '').trim().toLowerCase() === nameKey);
    }
    if (!match && adPackages.length === 1) match = adPackages[0];
    return match || null;
  }, [cartItems, adPackages]);

  // Price of the selected ad package only (not the whole order total)
  const adPackagePrice = useMemo(() => {
    if (!activeAdPackage) return 0;
    const p = parseFloat(activeAdPackage.price);
    return (p > 0 ? p : parseFloat(activeAdPackage.org_price)) || 0;
  }, [activeAdPackage]);

  // ── Ads contract term / payment term ────────────────────────────────────────
  const contractMonths = CONTRACT_TERM_MONTHS(agreementTerms);
  // Only "paid" is implemented so far. A not-yet-available term type can still
  // arrive from a restored invoice or an admin-created contract, so it must
  // never silently bill as if complimentary - it falls back to the paid fields
  // and says so on screen.
  const termTypeAvailable = isTermTypeAvailable(adTermType);
  const showComplimentaryTerm = termTypeAvailable
    && (adTermType === 'complimentary' || adTermType === 'complimentary_then_pay');
  const showBillingTerms = !termTypeAvailable
    || adTermType === 'paid'
    || adTermType === 'complimentary_then_pay';
  const paymentTermOptions = Array.from({ length: contractMonths }, (_, i) => {
    const m = i + 1;
    return {
      value: String(m),
      label: m === 1 ? 'Monthly' : `${m} months and then charge monthly`,
    };
  });
  const paymentTermMonths = Math.min(
    contractMonths,
    Math.max(1, parseInt(agreementPaymentTerm, 10) || 1)
  );
  const paymentTermLabel = (paymentTermOptions.find(o => o.value === String(paymentTermMonths)) || {}).label || 'Monthly';
  // Monthly ads rate × how many months are billed now (uses the cart's ads
  // price so it always matches the invoice subtotal, even if the agent edited it).
  const adsBilledBase = Math.round(
    cartItems
      .filter(i => i.type === 'A' || i.id === 'ads-package')
      .reduce((sum, i) => sum + (parseFloat(i.price) || 0) * (parseInt(i.quantity, 10) || 1), 0)
    * (paymentTermMonths || 1) * 100
  ) / 100;

  useEffect(() => {
    // Clamp the payment term whenever the contract term shrinks below it.
    if (parseInt(agreementPaymentTerm, 10) > contractMonths) {
      setAgreementPaymentTerm(String(contractMonths));
    }
  }, [contractMonths, agreementPaymentTerm]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Auto-select an existing user if one matches this customer's email/phone,
  // so newly opened invoices for already-registered customers don't silently
  // send userId: null when saved. Runs once systemUsers has loaded and only
  // fills in when nothing is already selected (never overrides an explicit pick).
  useEffect(() => {
    if (selectedUserId) return; // already selected — don't override
    if (systemUsers.length === 0) return; // not loaded yet
    if (!customerInfo.email && !customerInfo.phone) return; // nothing to match on

    const match = systemUsers.find(u =>
      (customerInfo.email && u.email && u.email.toLowerCase() === customerInfo.email.toLowerCase()) ||
      (customerInfo.phone && u.phone && u.phone === customerInfo.phone)
    );

    if (match) {
      setSelectedUserId(match.id);
      setContactMode('existing');
    }
  }, [systemUsers, customerInfo.email, customerInfo.phone, selectedUserId]);

  useEffect(() => {
    if (!selectedCardId && storedCards.length > 0) {
      const defaultCard = storedCards.find(c => c.isDefault) || storedCards[0];
      setSelectedCardId(defaultCard.id);
    }
  }, [storedCards, selectedCardId]);

  const handleAddNewCard = (cardData) => {
    console.log("New Card Data:", cardData);
    alert(`💳 Card ending in ${cardData.cardNumber.slice(-4)} added successfully!`);
    setShowAddCardModal(false);
  };

  const handleCopyPaymentLink = async () => {
    try {
      let textToCopy = paymentLinkUrl;
      if (!checkoutLinks.listing && !checkoutLinks.membership && currentInvoiceId && !hasOnlyAds && !hasPhysical) {
        const links = await generateCheckoutLinks();
        if (links && (links.listing || links.membership)) {
          textToCopy = buildCombinedLinksText({
            listing: linkIncludeTypes.listing !== false ? links.listing : null,
            membership: linkIncludeTypes.membership !== false ? links.membership : null,
            ad: linkIncludeTypes.ads !== false ? generatedAdLink : null,
          });
        }
      }
      await navigator.clipboard.writeText(textToCopy);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
      alert('❌ Failed to copy link. Please copy it manually.');
    }
  };

  // ── "Email the person" — branded Klaviyo-style payment-link emails ────────
  // One dedicated endpoint per product type (listing / membership / ads).
  // Currently wired for MEMBERSHIP; L/A slots activate once their endpoint
  // paths are added to PAY_LINK_EMAIL.endpoints.
  const sendPayLinkTemplateEmail = async (kind, payload) => {
    const cfg = PAY_LINK_EMAIL;
    const path = cfg.endpoints[kind];
    if (!path) {
      throw new Error(`${kind === 'M' ? 'Membership' : kind === 'L' ? 'Listing' : 'Ads'} email endpoint is not configured yet.`);
    }
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.token) headers[cfg.tokenHeader] = cfg.token;
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* non-JSON body */ }
    console.log(`[sendPayLinkTemplateEmail:${kind}]`, { status: res.status, body: data });
    if (!res.ok || (data && (data.success === false || data.error))) {
      throw new Error((data && (data.message || data.error)) || `Email endpoint returned status ${res.status}`);
    }
    return data;
  };

  const buildMembershipMailPayload = async (item) => {
    const pkg = membershipPackages.find(p => String(p.id) === String(item.itemId)) || null;
    const nameParts = (customerInfo.name || '').trim().split(' ');
    const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

    let signUrl = checkoutLinks.membership;
    if (!signUrl) {
      const links = await generateCheckoutLinks();
      if (!links) return null;
      signUrl = links.membership;
    }
    if (!signUrl) throw new Error('Membership payment link could not be generated.');

    // Original price straight from sale_products.org_price (fall back to the
    // current selling price when no original is set) — this is the email's
    // "Regular Price".
    const org = pkg && parseFloat(pkg.org_price) > 0 ? pkg.org_price : (pkg && parseFloat(pkg.price) > 0 ? pkg.price : parseFloat(item.price) || 0);
    const sale = pkg ? (parseFloat(pkg.price) > 0 ? pkg.price : org) : (parseFloat(item.price) || 0);
    const promoOff = r2(Math.max(0, org - sale));
    const regular = r2(org);

    // "Discounted Price" = original - ALL discounts (promotional + custom +
    // coupon + scheduled), so the email quote equals the final payable amount.
    const membershipCoupon = r2(Math.max(0, getCouponDiscountForItem(item)));
    const extra = r2(Math.max(0, promoOff + combinedCustomDiscount + schedMembershipTotal + membershipCoupon));
    const finalPrice = r2(Math.max(0, regular - extra));
    const discounted = finalPrice;

    return {
      email: customerInfo.email || '',
      first_name: nameParts[0] || '',
      last_name: nameParts.slice(1).join(' ') || '',
      pack_name: item.name || (pkg && (pkg.display_name || pkg.name)) || 'Membership',
      validity_label: (pkg && pkg.short_description) || '12 Months',
      regular_price: regular,
      discounted_price: discounted,
      extra_discount: extra,
      final_price: finalPrice,
      listing_count: cartItems.filter(i => i.type === 'L').length,
      seat_cover: cartItems.filter(i => i.type === 'P').length,
      vehicle_image_url: '',
      sign_url: signUrl,
    };
  };

  const buildListingMailPayload = async (item) => {
    const pkg = listingPackages.find(p => String(p.id) === String(item.itemId)) || null;
    const nameParts = (customerInfo.name || '').trim().split(' ');
    const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

    let signUrl = checkoutLinks.listing;
    if (!signUrl) {
      const links = await generateCheckoutLinks();
      if (!links) return null;
      signUrl = links.listing;
    }
    if (!signUrl) throw new Error('Listing payment link could not be generated.');

    // Original price straight from sale_products.org_price (fall back to the
    // current selling price when no original is set) — this is the email's
    // "Regular Price".
    const org = pkg && parseFloat(pkg.org_price) > 0 ? pkg.org_price : (pkg && parseFloat(pkg.price) > 0 ? pkg.price : parseFloat(item.price) || 0);
    const sale = pkg ? (parseFloat(pkg.price) > 0 ? pkg.price : org) : (parseFloat(item.price) || 0);
    const promoOff = r2(Math.max(0, org - sale));
    const regular = r2(org);

    // "Discounted Price" = original - ALL discounts (promotional + custom +
    // coupon + scheduled). The coupon is included so the email quote matches the
    // final payable amount (the checkout applies the coupon automatically on open).
    const listingCoupon = r2(Math.max(0, getCouponDiscountForItem(item)));
    const totalOff = r2(Math.max(0, promoOff + combinedCustomDiscount + schedListingTotal + listingCoupon));
    const discounted = r2(Math.max(0, regular - totalOff));

    return {
      email: customerInfo.email || '',
      first_name: nameParts[0] || '',
      last_name: nameParts.slice(1).join(' ') || '',
      pack_name: item.name || (pkg && (pkg.display_name || pkg.name)) || 'Listing Pack',
      validity_label: '12 months',
      regular_price: regular,
      discounted_price: discounted,
      sign_url: signUrl,
    };
  };

  const buildAdsMailPayload = async (item) => {
    const nameParts = (customerInfo.name || '').trim().split(' ');
    const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

    // Ads use the agreement link (generatedAdLink), not a hex-token checkout
    // link — same URL the "Ads Agreement Details" panel generates/sends.
    let signUrl = generatedAdLink;
    if (!signUrl) {
      signUrl = await handleGenerateAdLink();
    }
    if (!signUrl) throw new Error('Ads agreement link could not be generated.');

    // Sync the contract's stored discount/coupon before emailing, so the link
    // the customer opens matches the price quoted in this email exactly.
    await syncAdContractDiscount();

    // Reuse the SAME price calc already used for the agreement link/contract
    // (adDiscountInfo), instead of recomputing separately — this guarantees
    // the email quote and the actual signed agreement never disagree.
    // Original price straight from sale_products.org_price (fall back to the
    // billed term price when no original is set) — this is the email's
    // "Regular Price".
    const hasAdsOrg = activeAdPackage && parseFloat(activeAdPackage.org_price) > 0;
    const regular = r2(hasAdsOrg
      ? parseFloat(activeAdPackage.org_price) * (paymentTermMonths || 1)
      : (adDiscountInfo.totalPrice + adDiscountInfo.totalDiscount));
    // Promotional discount = original - the current billed price for the term.
    const promoOff = r2(hasAdsOrg ? Math.max(0, regular - adsBilledBase) : 0);
    // Per-item coupon share for THIS ad package folded into the discounted price
    // (the agreement link applies the same coupon automatically on checkout).
    const adsCoupon = r2(Math.max(0, getCouponDiscountForItem(item)));
    const discounted = r2(Math.max(0, regular - (promoOff + combinedCustomDiscount + schedAdsTotal + adsCoupon)));

    return {
      email: customerInfo.email || '',
      first_name: nameParts[0] || '',
      last_name: nameParts.slice(1).join(' ') || '',
      pack_name: item.name || (activeAdPackage && (activeAdPackage.display_name || activeAdPackage.name)) || 'Advertising Package',
      validity_label: paymentTermLabel || agreementTerms || '12 Months',
      regular_price: regular,
      discounted_price: discounted,
      sign_url: signUrl,
    };
  };

  const TEMPLATE_MAIL_BUILDERS = {
    M: buildMembershipMailPayload,
    L: buildListingMailPayload,
    A: buildAdsMailPayload,
  };


  const handleEmailPerson = async (kind) => {
    if (!customerInfo.email) { alert('⚠️ Please add an Email Address for the customer first.'); return; }
    if (!currentInvoiceId) {
      try { await persistInvoice(); } catch (e) { alert(`❌ ${e.message || 'Failed to save the invoice first.'}`); return; }
    }
    try {
      setEmailSendingKind(kind);
      const item = cartItems.find(i => i.type === kind);
      if (!item) { alert('⚠️ That item is not in the invoice anymore.'); return; }
      const builder = TEMPLATE_MAIL_BUILDERS[kind]; // no more early-return needed for any kind now
      const payload = await builder(item);
      if (!payload) return;
      const result = await sendPayLinkTemplateEmail(kind, payload);
      console.log(`[email-send:${kind}] payload=`, payload);
      const label = kind === 'M' ? 'Membership' : kind === 'L' ? 'Listing' : 'Ads';
      alert(`✅ ${label} payment link email sent to ${customerInfo.email}!${result && result.message ? `\n${result.message}` : ''}`);
    } catch (err) {
      console.error('Email the person error:', err);
      alert(`❌ ${err.message || 'Failed to send the email.'}`);
    } finally {
      setEmailSendingKind(null);
    }
  };

  const [typeTotalOverrides, setTypeTotalOverrides] = useState({});

  // Keep the invoice id in the URL so a page refresh reloads the same invoice
  // instead of resetting to a blank draft (location.state is wiped on refresh).
  useEffect(() => {
    if (currentInvoiceId && String(currentInvoiceId) !== String(urlInvoiceId)) {
      navigate(`/sales/crm/create-invoice/${currentInvoiceId}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentInvoiceId, urlInvoiceId]);

  useEffect(() => {
    if (invoiceIdFromCRM && packagesLoaded) {
      fetch(`${API_BASE_URL}/invoices/details/${invoiceIdFromCRM}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.invoice) {
            const inv = data.invoice;
            setInvoiceNumber(inv.invoice_number);
            if (inv.user_id) setSelectedUserId(inv.user_id);
            if (inv.notes) setNotes(inv.notes);

            setCustomerInfo(prev => ({
              ...prev,
              name: prev.name || inv.customer_name || '',
              email: prev.email || inv.customer_email || '',
              phone: prev.phone || inv.lead_phone || inv.phone || '',
              company: prev.company || inv.customer_company || inv.company || '',
              leadStatus: prev.leadStatus || inv.lead_status || 'Intake',
            }));

            if (inv.customer_id) setSelectedUserId(inv.customer_id);

            let loadedSubtotal = 0;
            let dbProductItems = [];
            let dbNonProductItems = [];

            if (inv.items_json) {
              try {
                // Admin-panel renewal invoices are saved with crm_invoices.type = 6
                // but their line still carries the legacy 'L' type, so the header
                // type is authoritative: relabel non-product lines as Renewals.
                const headerType = Number(inv.type);
                const parsedItems = JSON.parse(inv.items_json)
                  .map(normalizeDbCartItem)
                  .map(i => (headerType === 6 && i && i.type !== 'P' ? { ...i, type: 'R' } : i));
                dbNonProductItems = parsedItems.filter(i => i.type !== 'P');
                dbProductItems = parsedItems.filter(i => i.type === 'P').map(p => {
                  const legacy = parseLegacySpecs(p.covers || p.description);
                  return {
                    ...p,
                    leatherColor: p.leatherColor || p.selectedColor || legacy.color,
                    stitchColor: p.stitchColor || p.selectedColor || legacy.color,
                    pattern: p.pattern || p.selectedPattern || legacy.pattern,
                    description: (p.description && !p.description.includes('Pattern:')) ? p.description : '',
                    covers: '-'
                  };
                });
              } catch (e) {
                console.error("Failed to parse DB items", e);
              }
            }

            const freshProductItems = (selectedProducts || []).map(prod => {
              const legacy = parseLegacySpecs(prod.specs);
              return {
                id: prod.lineKey || `prod-${prod.id}-${prod.leatherColor || 'default'}`,
                name: prod.name,
                description: (prod.specs && !prod.specs.includes('Pattern:')) ? prod.specs : '',
                price: prod.price,
                quantity: prod.qty || 1,
                type: 'P',
                covers: '-',
                img: prod.img || null,
                leatherColor: prod.leatherColor || prod.selectedColor || legacy.color,
                stitchColor: prod.stitchColor || prod.selectedColor || legacy.color,
                pattern: prod.pattern || prod.selectedPattern || legacy.pattern,
              };
            });

            const freshMemberships = (selectedMemberships || []).map((id) => {
              const pkg = membershipPackages.find(p => String(p.id) === String(id));
              const price = pkg ? (parseFloat(pkg.price) > 0 ? pkg.price : pkg.org_price) : 0;
              return {
                id: `mem-${id}`, itemId: id, name: pkg ? (pkg.display_name || pkg.name) : 'Membership',
                description: '', price: parseFloat(price) || 0,
                quantity: 1, type: 'M', covers: '-'
              };
            });
            const freshListings = (selectedListings || []).map((id) => {
              const pkg = listingPackages.find(p => String(p.id) === String(id));
              const price = pkg ? (parseFloat(pkg.price) > 0 ? pkg.price : pkg.org_price) : 0;
              return {
                id: `list-${id}`, itemId: id, name: pkg ? (pkg.display_name || pkg.name) : 'Listing',
                description: '', price: parseFloat(price) || 0,
                quantity: 1, type: 'L', covers: '-'
              };
            });

            const activeAds = selectedAdPackage
              ? adPackages.find(p => String(p.id) === String(selectedAdPackage))
              : null;
            const freshAdsItem = activeAds
              ? [{
                id: 'ads-package',
                itemId: activeAds.id,
                name: activeAds.display_name || activeAds.name,
                description: '',
                price: parseFloat(parseFloat(activeAds.price) > 0 ? activeAds.price : activeAds.org_price) || 0,
                quantity: 1,
                type: 'A',
                covers: '-'
              }]
              : [];

            const combinedFreshNonProducts = enforceSinglePackageKind([...freshMemberships, ...freshListings, ...freshAdsItem]);
            const hasExplicitState = location.state && (location.state.selectedProducts !== undefined || location.state.selectedListings !== undefined || location.state.selectedMemberships !== undefined);
            const finalProductItems = hasExplicitState ? freshProductItems : (freshProductItems.length > 0 ? freshProductItems : dbProductItems);
            const finalNonProductItems = hasExplicitState ? combinedFreshNonProducts : (combinedFreshNonProducts.length > 0 ? combinedFreshNonProducts : dbNonProductItems);

            const mergedItems = enforceSinglePackageKind([...finalNonProductItems, ...finalProductItems]);
            setCartItems(mergedItems);
            loadedSubtotal = mergedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

            if (inv.discount_details) {
              try {
                const dd = JSON.parse(inv.discount_details);
                if (dd.vehicleAgreements && typeof dd.vehicleAgreements === 'object') {
                  setVehicleAgreements(dd.vehicleAgreements);
                }
                setDiscountType(dd.customType || 'flat');
                setDiscountValue(dd.customValue != null ? String(dd.customValue) : '');
                if (Array.isArray(dd.customDiscounts)) {
                  if (dd.customDiscounts[0]?.title) setCombinedDiscountTitle(String(dd.customDiscounts[0].title));

                  // Rebuild the "+ Add Custom Discount" rows so EVERY discount in the
                  // stored customDiscounts list is visible (and stored again on update/
                  // create). customDiscounts[0] is Custom 1 as long as it holds an
                  // amount; every further entry that has no matching extra row yet gets
                  // re-created as a flat extra carrying its resolved amount and title.
                  const storedPrimaryAmt = dd.customType === 'percent'
                    ? loadedSubtotal * ((parseFloat(dd.customValue) || 0) / 100)
                    : (parseFloat(dd.customValue) || 0);
                  const hasStoredPrimary = storedPrimaryAmt > 0;
                  const storedExtras = (Array.isArray(dd.extraDiscounts) ? dd.extraDiscounts : [])
                    .map((d, i) => ({ id: `d_restored_${i}`, type: d.type || 'flat', value: d.value != null ? String(d.value) : '', title: d.title || '' }));
                  const expectedExtras = dd.customDiscounts.length - (hasStoredPrimary ? 1 : 0);
                  for (let i = storedExtras.length; i < expectedExtras; i++) {
                    const src = dd.customDiscounts[hasStoredPrimary ? 1 + i : i];
                    if (src && src.amount > 0) {
                      storedExtras.push({
                        id: `d_restored_${i}`,
                        type: 'flat',
                        value: String(src.amount),
                        title: src.title || `Custom Discount ${i + 2}`,
                      });
                    }
                  }
                  setExtraDiscounts(storedExtras);
                } else if (Array.isArray(dd.extraDiscounts)) {
                  setExtraDiscounts(dd.extraDiscounts.map((d, i) => ({ id: `d_restored_${i}`, type: d.type || 'flat', value: d.value != null ? String(d.value) : '', title: d.title || '' })));
                }
                if (dd.adContractId) setAdContractId(dd.adContractId);
                if (dd.adContractToken) {
                  setAdContractToken(dd.adContractToken);
                  // Rebuild the existing ads agreement link right away so the
                  // custom message shows it from the start (no re-generation).
                  setGeneratedAdLink(prev =>
                    prev || `${window.location.origin}/sales/advertising-contract/${dd.adContractToken}`
                  );
                }
                if (dd.adContractTerm) setAgreementTerms(dd.adContractTerm);
                if (dd.adPaymentMonths) {
                  const restoredMonths = Math.max(1, parseInt(dd.adPaymentMonths, 10) || 1);
                  const capped = Math.min(CONTRACT_TERM_MONTHS(dd.adContractTerm || agreementTerms), restoredMonths);
                  setAgreementPaymentTerm(String(capped));
                }
                if (dd.adAgreementDate) setAgreementDate(String(dd.adAgreementDate));
                if (dd.adTermType) setAdTermType(normaliseTermType(dd.adTermType));
                if (dd.adComplimentaryTerm) {
                  const cm = parseInt(dd.adComplimentaryTerm, 10);
                  if (Number.isInteger(cm) && cm >= 1) setAdComplimentaryTerm(Math.min(3, cm));
                }
                if (dd.couponCode) {
                  setAppliedCoupon({
                    code: dd.couponCode,
                    mode: dd.couponMode || 'flat-total',
                    type: dd.couponType || null,
                    discount: dd.couponDiscount || 0,
                    itemDiscountMap: dd.couponItemDiscountMap || {},
                  });
                  setCouponCode(dd.couponCode);
                  // Stamp the package signature so the auto-revalidation
                  // effect does not immediately re-fetch when the items
                  // loaded from the DB match what was saved.
                  lastCouponValidationSignature.current = couponSignatureFor(mergedItems);
                }
                if (dd.tax_amount != null) setTaxOverride(parseFloat(dd.tax_amount) || 0);
                if (dd.shipping_amount != null) setShippingOverride(parseFloat(dd.shipping_amount) || 0);
                if (dd.total_override != null) setTotalOverride(parseFloat(dd.total_override) || null);
                if (dd.listingLinkToken) setCheckoutTokens(prev => ({ ...prev, listing: dd.listingLinkToken }));
                if (dd.membershipLinkToken) setCheckoutTokens(prev => ({ ...prev, membership: dd.membershipLinkToken }));
              } catch (e) {
                console.error('Failed to parse discount_details', e);
              }
            } else if (inv.discount_amount && parseFloat(inv.discount_amount) > 0) {
              const discAmt = parseFloat(inv.discount_amount);
              const calcPercent = loadedSubtotal > 0 ? parseFloat(((discAmt / loadedSubtotal) * 100).toFixed(2)) : 0;
              const reverseCheck = parseFloat((loadedSubtotal * (calcPercent / 100)).toFixed(2));

              if (inv.discount_type === 'percent' || (inv.discount_type == null && loadedSubtotal > 0 && reverseCheck === discAmt)) {
                setDiscountType('percent');
                setDiscountValue(calcPercent.toString());
              } else {
                setDiscountType('flat');
                setDiscountValue(discAmt.toString());
              }
            }
          }
        })
        .catch(err => console.error('Failed to load DB details:', err))
        .finally(() => { restoreSettledRef.current = true; setRestoreSettled(true); });

      fetch(`${API_BASE_URL}/invoices/schedules/${invoiceIdFromCRM}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) setDbSchedules(data.messages.map(m => {
            let amounts = null;
            let meta = null;
            let dateLabel = null;
            try {
              const parsed = JSON.parse(m.discount_details || 'null');
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                if (parsed.listing !== undefined || parsed.membership !== undefined || parsed.ads !== undefined) {
                  amounts = { listing: Number(parsed.listing) || 0, membership: Number(parsed.membership) || 0, ads: Number(parsed.ads) || 0 };
                }
                // meta.ads carries the { type: 'percent'|'flat', amount } config and
                // dateLabel the send stamp already formatted as "Sep 26, 26 12:48AM".
                // Both are needed to rebuild the exact ad_contracts.discounts_json
                // "Scheduled Discount (...) X% off" label without a timezone shift.
                if (parsed.meta && typeof parsed.meta === 'object' && !Array.isArray(parsed.meta)) meta = parsed.meta;
                if (parsed.dateLabel) dateLabel = parsed.dateLabel;
              }
            } catch (e) { /* ignore */ }
            return { ...m, discountAmounts: amounts || undefined, discountMeta: meta || undefined, dateLabel: dateLabel || undefined };
          }));
        })
        .catch(err => console.error('Failed to load DB schedules:', err));
    }
  }, [invoiceIdFromCRM, packagesLoaded]);

  useEffect(() => {
    if (invoiceIdFromCRM || !packagesLoaded) return;

    let items = [];
    (selectedMemberships || []).forEach((id) => {
      const pkg = membershipPackages.find(p => String(p.id) === String(id));
      const price = pkg ? (parseFloat(pkg.price) > 0 ? pkg.price : pkg.org_price) : 0;
      items.push({
        id: `mem-${id}`, itemId: id, name: pkg ? (pkg.display_name || pkg.name) : 'Membership',
        description: '', price: parseFloat(price) || 0,
        quantity: 1, type: 'M', covers: '-'
      });
    });
    (selectedListings || []).forEach((id) => {
      const pkg = listingPackages.find(p => String(p.id) === String(id));
      const price = pkg ? (parseFloat(pkg.price) > 0 ? pkg.price : pkg.org_price) : 0;
      items.push({
        id: `list-${id}`, itemId: id, name: pkg ? (pkg.display_name || pkg.name) : 'Listing',
        description: '', price: parseFloat(price) || 0,
        quantity: 1, type: 'L', covers: '-'
      });
    });

    const activeAds = selectedAdPackage ? adPackages.find(p => String(p.id) === String(selectedAdPackage)) : null;
    if (activeAds) {
      items.push({
        id: 'ads-package',
        itemId: activeAds.id,
        name: activeAds.display_name || activeAds.name,
        description: '',
        price: parseFloat(parseFloat(activeAds.price) > 0 ? activeAds.price : activeAds.org_price) || 0,
        quantity: 1,
        type: 'A',
        covers: '-'
      });
    }

    (selectedProducts || []).forEach((prod, index) => {
      const legacy = parseLegacySpecs(prod.specs);
      items.push({
        id: prod.lineKey || `prod-${prod.id}-${index}`,
        name: prod.name,
        description: (prod.specs && !prod.specs.includes('Pattern:')) ? prod.specs : '',
        price: prod.price,
        quantity: prod.qty || 1,
        type: 'P',
        covers: '-',
        img: prod.img || null,
        leatherColor: prod.leatherColor || prod.selectedColor || legacy.color,
        stitchColor: prod.stitchColor || prod.selectedColor || legacy.color,
        pattern: prod.pattern || prod.selectedPattern || legacy.pattern,
      });
    });
    if (items.length > 0) setCartItems(enforceSinglePackageKind(items));
  }, [selectedListings, selectedMemberships, selectedProducts, selectedAdPackage, selectedAdFeatures, invoiceIdFromCRM, packagesLoaded, adPackages, listingPackages, membershipPackages]);

  const TYPE_LABELS = { P: 'Seat Covers', L: 'Listings', M: 'Memberships', A: 'Ads Package', V: 'Vehicles', R: 'Renewals' };
  const TYPE_TO_LINK_KEY = { L: 'listing', M: 'membership', A: 'ads' };
  const vehicleItems = cartItems.filter(i => i.type === 'V');
  const vehicleKey = (v) => String(v.id ?? v.itemId);
  // Only count agreements for vehicles that are still attached
  const referralFeeTotal = vehicleItems.reduce(
    (sum, v) => sum + (parseFloat(vehicleAgreements[vehicleKey(v)]?.referral?.amount) || 0), 0
  );
  const itemizedGroups = ['P', 'L', 'M', 'A', 'V', 'R'].reduce((acc, type) => {
    const items = cartItems.filter(i => i.type === type);
    if (items.length > 0) {
      // Ads line = monthly rate × selected payment term months (e.g. 3 months
      // and then charge monthly bills 3 × the monthly rate now).
      const termMult = type === 'A' ? (paymentTermMonths || 1) : 1;
      const computedTotal = items.reduce((sum, i) => sum + (i.price * i.quantity), 0) * termMult;
      const displayTotal = typeTotalOverrides[type] != null ? typeTotalOverrides[type] : computedTotal;
      acc.push({ type, label: TYPE_LABELS[type], count: items.length, computedTotal, displayTotal });
    }
    return acc;
  }, []);

  if (referralFeeTotal > 0) {
    const displayTotal = typeTotalOverrides.F != null ? typeTotalOverrides.F : referralFeeTotal;
    itemizedGroups.push({ type: 'F', label: 'Referral Fee', count: 1, computedTotal: referralFeeTotal, displayTotal });
  }

  const subtotal = itemizedGroups.reduce((sum, g) => sum + g.displayTotal, 0);

  const couponItemDiscountTotal = appliedCoupon?.mode === 'per-item'
    ? cartItems.reduce((sum, item) => {
      const override = appliedCoupon.itemDiscountMap[String(item.itemId)];
      if (!override || !['L', 'M', 'A'].includes(item.type)) return sum;
      const lineTotal = (item.price * item.quantity) * (item.type === 'A' ? (paymentTermMonths || 1) : 1);
      const lineDiscount = override.discountType === 'percent'
        ? lineTotal * (override.discount / 100)
        : override.discount * item.quantity * (item.type === 'A' ? (paymentTermMonths || 1) : 1);
      return sum + Math.min(lineTotal, lineDiscount);
    }, 0)
    : 0;

  const parsedDiscount = parseFloat(discountValue) || 0;

  // Flat discount amounts are per-month figures, so they are billed across every
  // month being charged now (paymentTermMonths - the ad line totals use the same
  // multiplier, which keeps the discount proportional to what's being invoiced).
  // Percentage discounts are a share of the subtotal and are deliberately NOT
  // multiplied: doing so would turn "10% off" on a 6-month deal into a 60%
  // discount, which then hits the subtotal cap. Every discount figure in this
  // page is funnelled through this one helper so the itemised rows can never
  // disagree with the totals.
  const monthsMult = paymentTermMonths || 1;
  const discountAmountFor = (type, value) => {
    const v = parseFloat(value) || 0;
    return type === 'percent' ? subtotal * (v / 100) : v * monthsMult;
  };

  const customDiscountAmount = discountAmountFor(discountType, parsedDiscount);

  // Additional combined discounts added via "+ Discount" — each applies to the whole subtotal.
  const extraDiscountAmount = extraDiscounts.reduce((sum, d) => sum + discountAmountFor(d.type, d.value), 0);

  // The combined discount (flat/percent + any "+ Discount" rows) applies to EVERY
  // link (listing, membership, ads) in full.
  const combinedCustomDiscount = customDiscountAmount + extraDiscountAmount;

  // Each custom discount is carried as its OWN entry (so the checkout can show
  // "Custom 1", "Custom 2", ... with the date each was given): the main combined
  // row first, then every "+ Add Custom Discount" row. Every entry carries an
  // editable title that the checkout displays.
  // `amount` is the MONTHLY figure the agent typed; `displayAmount` is that value
  // resolved across paymentTermMonths and is what the UI shows. Storing the
  // resolved figure here used to compound: discounts_json is read back into
  // discountValue on restore, so a 4-month invoice re-multiplied its own discount
  // on every open/save (200 -> 800 -> 3,200 -> 12,800 -> 51,200 -> 204,800).
  const customDiscountsList = (() => {
    const list = [];
    if (customDiscountAmount > 0) {
      list.push({
        amount: Math.round(parsedDiscount * 100) / 100,
        displayAmount: Math.round(customDiscountAmount * 100) / 100,
        title: (combinedDiscountTitle || '').trim() || 'Custom 1',
      });
    }
    extraDiscounts.forEach((d) => {
      const amt = discountAmountFor(d.type, d.value);
      if (amt > 0) list.push({
        amount: Math.round((parseFloat(d.value) || 0) * 100) / 100,
        displayAmount: Math.round(amt * 100) / 100,
        title: (d.title || '').trim(),
      });
    });
    return list;
  })();

  // Editor display list: identical to customDiscountsList but ALSO includes
  // every "+ Add Custom Discount" row while it still has no value, so the editor
  // can render its rows purely from this array yet a freshly added row appears.
  // Storage/checkout/link payloads keep using the filtered customDiscountsList.
  const customDiscountsEditorList = (() => {
    const list = [];
    if (customDiscountAmount > 0) {
      list.push({
        amount: Math.round(parsedDiscount * 100) / 100,
        displayAmount: Math.round(customDiscountAmount * 100) / 100,
        title: (combinedDiscountTitle || '').trim() || 'Custom 1',
      });
    }
    extraDiscounts.forEach((d) => {
      list.push({
        amount: Math.round((parseFloat(d.value) || 0) * 100) / 100,
        displayAmount: Math.round(discountAmountFor(d.type, d.value) * 100) / 100,
        title: (d.title || '').trim(),
      });
    });
    return list;
  })();

  // Per-item-type discounts (Listing / Membership / Ads) were removed — the
  // item picker now sends only individual package/vehicle/cover items and every
  // discount goes through "Custom Discount 1"/"+ Add Custom Discount" or a coupon.
  const listingCustomDiscount = 0;
  const membershipCustomDiscount = 0;
  const adsCustomDiscount = 0;
  const perItemDiscountTotal = 0;

  const couponDiscountAmount = appliedCoupon ? (couponItemDiscountTotal > 0 ? couponItemDiscountTotal : (appliedCoupon.type === 'percent' ? subtotal * (appliedCoupon.discount / 100) : Number(appliedCoupon.discount) * (paymentTermMonths || 1) || 0)) : 0;
  // The database keeps the ONE-MONTH coupon figure; the UI (and every saved total)
  // multiplies it by paymentTermMonths. Persisting the resolved figure made a
  // refresh re-apply the multiplier, because dd.couponDiscount is read straight
  // back into appliedCoupon.discount on load: a flat 200 over 4 months stored 800,
  // then reloaded as 800 and charged 800 x 4 = 3,200, compounding every refresh.
  const couponDiscountMonthly = !appliedCoupon
    ? 0
    : (Number(appliedCoupon.discount) || 0)
    || Math.round(((couponItemDiscountTotal || 0) / (paymentTermMonths || 1)) * 100) / 100;
  // Returns the coupon discount that applies to ONE specific cart item, instead
  // of the invoice-wide couponDiscountAmount (which sums listing+membership+ads
  // together). Klaviyo templates need the per-item slice, not the combined total.
  const getCouponDiscountForItem = (item) => {
    if (!appliedCoupon) return 0;
    const termMult = item.type === 'A' ? (paymentTermMonths || 1) : 1;
    const lineTotal = (item.price * item.quantity) * termMult;

    if (appliedCoupon.mode === 'per-item') {
      const override = appliedCoupon.itemDiscountMap[String(item.itemId)];
      if (!override) return 0;
      const lineDiscount = override.discountType === 'percent'
        ? lineTotal * (override.discount / 100)
        : override.discount * item.quantity * termMult;
      return Math.min(lineTotal, lineDiscount);
    }

    // flat-total mode: the coupon was defined against the whole subtotal, so
    // allocate it proportionally by this item's share of the subtotal.
    if (subtotal <= 0) return 0;
    const totalCouponAmt = appliedCoupon.type === 'percent'
      ? subtotal * (appliedCoupon.discount / 100)
      : (Number(appliedCoupon.discount) * (paymentTermMonths || 1) || 0);
    return totalCouponAmt * (lineTotal / subtotal);
  };
  const totalDiscount = Math.min(subtotal, Math.max(0, customDiscountAmount + couponDiscountAmount + extraDiscountAmount + perItemDiscountTotal));
  const discountAmount = totalDiscount;

  const physicalItems = cartItems.filter(item => item.type === 'P');
  const totalPhysicalQty = physicalItems.reduce((sum, item) => sum + parseInt(item.quantity || 1, 10), 0);

  let autoShippingCost = 0.00;
  if (totalPhysicalQty === 1) autoShippingCost = 60.00;
  else if (totalPhysicalQty === 2) autoShippingCost = 80.00;
  else if (totalPhysicalQty === 3) autoShippingCost = 120.00;
  else if (totalPhysicalQty === 4) autoShippingCost = 150.00;
  else if (totalPhysicalQty === 5) autoShippingCost = 180.00;
  else if (totalPhysicalQty === 6) autoShippingCost = 190.00;
  else if (totalPhysicalQty === 7) autoShippingCost = 200.00;
  else if (totalPhysicalQty >= 8) autoShippingCost = 29.00 * totalPhysicalQty;

  const shippingCost = shippingOverride != null ? shippingOverride : autoShippingCost;
  const taxAmount = taxOverride != null ? taxOverride : 0;

  const allCurrentSchedules = [...dbSchedules, ...scheduledTexts, ...scheduledEmails];

  // Latest (furthest away) 24-hour offer expiry across every scheduled message.
  // This is only a cosmetic urgency timer on the checkout page — the discount is
  // never actually revoked server-side when it passes.
  const latestOfferExpiry = useMemo(() => {
    const expiries = allCurrentSchedules.map(s => s.offerExpiry).filter(Boolean).sort().reverse();
    return expiries.length > 0 ? expiries[0] : null;
  }, [allCurrentSchedules]);

  // Per-type MONTHLY base price each scheduled discount percentage resolves
  // against. All three are single-month sums on purpose: a typed percentage is a
  // MONTHLY rate, exactly like a typed flat figure is a MONTHLY amount, so both
  // kinds are then scaled by the term in one place (scheduleDiscAmount). Using
  // the already-multiplied adsBilledBase here instead is what made a 5% ads
  // discount show a different figure from a 5% one on any other package.
  const listingBase = cartItems
    .filter(i => i.type === 'L')
    .reduce((sum, i) => sum + (parseFloat(i.price) || 0) * (parseInt(i.quantity, 10) || 1), 0);
  const membershipBase = cartItems
    .filter(i => i.type === 'M')
    .reduce((sum, i) => sum + (parseFloat(i.price) || 0) * (parseInt(i.quantity, 10) || 1), 0);
  const adsMonthlyBase = Math.round(
    (adsBilledBase / (paymentTermMonths || 1)) * 100
  ) / 100;
  const adsBase = adsMonthlyBase;

  // Dollar discount per package type for a scheduled message. New messages carry
  // explicit per-type amounts (discountAmounts); legacy messages (a single
  // discount value) are split proportionally across listing/membership bases, or
  // applied wholly to ads when there is no listing/membership cart.
  const resolveScheduleAmounts = (s) => {
    const la = Number(s?.discountAmounts?.listing);
    const ma = Number(s?.discountAmounts?.membership);
    const aa = Number(s?.discountAmounts?.ads);
    if (s && (s.discountAmounts !== undefined)) {
      return {
        listing: Math.round((la || 0) * 100) / 100,
        membership: Math.round((ma || 0) * 100) / 100,
        ads: Math.round((aa || 0) * 100) / 100,
      };
    }
    const d = Number(s?.discount ?? s?.discount_offered ?? 0) || 0;
    if (!d) return { listing: 0, membership: 0, ads: 0 };
    const dig = listingBase + membershipBase;
    if (dig > 0) {
      return {
        listing: Math.round(d * (listingBase / dig) * 100) / 100,
        membership: Math.round(d * (membershipBase / dig) * 100) / 100,
        ads: 0,
      };
    }
    return { listing: 0, membership: 0, ads: d };
  };

  const schedAllAmounts = allCurrentSchedules.map(resolveScheduleAmounts);
  const schedListingTotal = schedAllAmounts.reduce((sum, r) => sum + r.listing, 0);
  const schedMembershipTotal = schedAllAmounts.reduce((sum, r) => sum + r.membership, 0);

  // The ads portion of one scheduled message, split into the two figures the rest
  // of the page needs:
  //   monthly   - the ONE-month figure, which is what gets persisted to
  //               ad_contracts.discounts_json, exactly like the custom discounts
  //               and the coupon. Storing the resolved figure here used to
  //               compound, because the stored value is read back on every reopen.
  //   resolved  - what is actually deducted from the invoice and the contract.
  //
  // A scheduled ads discount is a MONTHLY figure whichever way it was typed, and
  // is scaled by the term here for BOTH kinds:
  //   flat   -> the agent's typed dollar amount, taken as per month.
  //   percent -> resolveNewSchedMonthly already turned the typed rate into a
  //              per-month DOLLAR figure (monthly ads rate x % / 100), so the
  //              stored value is per month too and gets the same multiplier.
  // This is why adsBase must stay a monthly figure: resolving a percentage
  // against the already-multiplied adsBilledBase and then multiplying here would
  // charge it once per month squared.
  //
  // The stored per-type amount is the source of truth for both kinds, because
  // resolveNewSchedMonthly already reduced a typed percentage to a per-month DOLLAR
  // figure when the message was saved. Re-deriving it from the raw config instead
  // would mix units (a "5" percentage against a dollar amount).
  const scheduleAdsAmounts = (s) => {
    const months = paymentTermMonths || 1;
    const monthly = Math.round((resolveScheduleAmounts(s).ads || 0) * 100) / 100;
    return { monthly, resolved: Math.round((monthly * months) * 100) / 100 };
  };

  const schedAdsTotal = allCurrentSchedules.reduce((sum, s) => sum + scheduleAdsAmounts(s).resolved, 0);
  const scheduledDiscountSum = schedListingTotal + schedMembershipTotal + schedAdsTotal;

  // Live per-type MONTHLY dollar amounts for the discount fields currently in the
  // modal - a typed percentage is reduced to a per-month dollar figure against the
  // monthly base, so flat and percent leave this function in the same unit and are
  // persisted identically.
  const resolveNewSchedMonthly = (key, discObj) => {
    const cfg = (discObj || (newSchedule.discounts || {}))[key] || { type: 'flat', value: 0 };
    const base = key === 'listing' ? listingBase : key === 'membership' ? membershipBase : adsBase;
    const v = Number(cfg.value) || 0;
    return cfg.type === 'percent'
      ? Math.round((base * v) / 100 * 100) / 100
      : Math.round(v * 100) / 100;
  };
  // What the modal shows, and what the "Total Scheduled Discount" line deducts:
  // the ads figure is scaled by the payment term so it matches what the schedule
  // actually takes off, for both flat and percent.
  const resolveNewSchedAmount = (key, discObj) => {
    const monthly = resolveNewSchedMonthly(key, discObj);
    if (key !== 'ads') return monthly;
    return Math.round((monthly * (paymentTermMonths || 1)) * 100) / 100;
  };
  const newSchedTotalDisc =
    resolveNewSchedAmount('listing') + resolveNewSchedAmount('membership') + resolveNewSchedAmount('ads');

  const totalDue = totalOverride != null ? totalOverride : Math.max(0, subtotal - totalDiscount - scheduledDiscountSum + shippingCost + taxAmount);
  const depositAmount = totalDue * (depositPercent / 100);
  const amountDueNow = paymentType === 'deposit' ? depositAmount : totalDue;

  const fetchSystemUsers = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/users/system-users`);
      const data = await response.json();
      if (data.success && data.users) { setSystemUsers(data.users); }
    } catch (error) { console.error("Failed to fetch system users", error); }
  };

  const fetchAllPackages = async () => {
    try {
      const [adsRes, lmRes] = await Promise.all([
        fetch(`${API_BASE_URL}/ads/ads-packages`),
        fetch(`${API_BASE_URL}/users/listings-memberships`),
      ]);
      const adsData = await adsRes.json();
      const lmData = await lmRes.json();
      if (adsData.success) setAdPackages(adsData.packages || []);
      if (lmData.success) {
        setListingPackages(lmData.listings || []);
        setMembershipPackages(lmData.memberships || []);
        setRenewalPackages(lmData.renewals || []);
      }
    } catch (error) {
      console.error('Failed to fetch package data:', error);
    } finally {
      setPackagesLoaded(true);
    }
  };

  useEffect(() => {
    fetchSystemUsers();
    fetchAllPackages();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // 💡 CENTRALIZED SMART URL GENERATION
  // ─────────────────────────────────────────────────────────────────────────────
  const paymentLinksText = useMemo(() => {
    const parts = [];
    if (linkIncludeTypes.listing !== false && checkoutLinks.listing) parts.push(`Listing link: ${checkoutLinks.listing}`);
    if (linkIncludeTypes.membership !== false && checkoutLinks.membership) parts.push(`Membership Link: ${checkoutLinks.membership}`);
    if (hasAdItem && !hasOnlyAds && linkIncludeTypes.ads !== false && generatedAdLink) parts.push(`Ads link: ${generatedAdLink}`);
    return parts.join('\n');
  }, [checkoutLinks, hasAdItem, hasOnlyAds, generatedAdLink, linkIncludeTypes]);

  const paymentLinkUrl = useMemo(() => {
    if (!currentInvoiceId) return '[Please save draft first to generate link]';

    // If only ads, we generate it on demand, so use the state or a placeholder.
    if (hasOnlyAds) {
      return generatedAdLink || '[Ad Agreement link will be generated automatically]';
    }

    const domain = window.location.origin;
    if (hasPhysical) {
      return `${domain}/sales/crm/cart?invoiceId=${currentInvoiceId}`;
    }

    // Digital services (listings/memberships) -> secure hex-token checkout links,
    // one per product type, so no email address ever appears in the URL.
    return paymentLinksText || PAY_LINK_PLACEHOLDER;

  }, [currentInvoiceId, hasOnlyAds, generatedAdLink, hasPhysical, paymentLinksText]);

  useEffect(() => {
    // Keep the message in sync with the latest link set. Links can arrive in any
    // order (listing/membership mint vs ads agreement), so rebuild the message
    // only when the current text is missing a link that paymentLinkUrl now offers
    // — never freeze on a partial set, but don't clobber an already-complete one.
    const linksInTarget = (paymentLinkUrl.match(/https?:\/\/\S+/g) || []);
    const linksInMessage = (payLinkMessage.match(/https?:\/\/\S+/g) || []);
    const missing = linksInTarget.some(l => !linksInMessage.includes(l));
    if (!missing && linksInMessage.length > 0) {
      // Message already has its links embedded — don't rebuild it, but keep the
      // written invoice amount current so a schedule (or any discount) change
      // reduces the "invoice for $X" text instead of leaving the old amount.
      setPayLinkMessage(prev => {
        const next = prev.replace(/(invoice for )\$[\d,]+(\.\d{2})?/i, `$1$${amountDueNow.toFixed(2)}`);
        return next === prev ? prev : next;
      });
      return;
    }
    setPayLinkMessage(`Hi ${customerInfo.name || 'there'},\n\nPlease find your invoice for $${amountDueNow.toFixed(2)}. You can securely pay online using the link below:\n\n${paymentLinkUrl}`);
    setPayLinkPhone(customerInfo.phone || '');
    setPayLinkEmail(customerInfo.email || '');
  }, [customerInfo.name, amountDueNow, customerInfo.phone, customerInfo.email, paymentLinkUrl, payLinkMessage]);

  // Once the real ads agreement link exists, swap the ads placeholder in the
  // custom message box and in an open schedule's message body with the actual
  // URL so the user always sees the exact link that will be sent.
  useEffect(() => {
    if (!generatedAdLink) return;
    setPayLinkMessage(prev =>
      prev.includes(AD_LINK_PLACEHOLDER)
        ? prev.replace(AD_LINK_PLACEHOLDER, generatedAdLink)
        : prev
    );
    setNewSchedule(prev =>
      prev.messageBody.includes(AD_LINK_PLACEHOLDER)
        ? { ...prev, messageBody: prev.messageBody.replace(AD_LINK_PLACEHOLDER, generatedAdLink) }
        : prev
    );
  }, [generatedAdLink]);

  // Auto-mint the real checkout links as soon as a saved invoice with digital
  // items (listings/memberships) is loaded, so the actual URLs are visible in
  // the message preview instead of the "[Secure payment link...]" placeholder.
  // Also auto-populates the ads agreement link (hybrid carts) so ALL links show
  // from the start — a saved ad contract is reused, never re-created.
  useEffect(() => {
    if (!currentInvoiceId) return;
    if (hasOnlyAds || hasPhysical) return;

    if (customerInfo.email && !checkoutLinks.listing && !checkoutLinks.membership) {
      const hasDigital = (cartItems || []).some(i => i.type === 'L' || i.type === 'M');
      if (hasDigital) generateCheckoutLinks();
    }

    // Hybrid cart: ensure the ads agreement link is present. If the invoice had
    // a saved ad contract, the load effect reconstructed it into generatedAdLink;
    // otherwise generate (backend reuses any existing contract for this invoice).
    if (hasAdItem && !generatedAdLink && activeAdPackage) {
      handleGenerateAdLink();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentInvoiceId, cartItems, hasOnlyAds, hasPhysical, customerInfo.email, hasAdItem, generatedAdLink, activeAdPackage]);

  // Once a real listing/membership checkout link exists, keep its stored
  // amounts in sync with the discounts edited on THIS page WITHOUT a manual
  // refresh. The backend re-mints the SAME token (it updates cart_items /
  // total_amount), so the link already sent to the customer reflects the new
  // price the moment the admin edits a discount. Debounced so typing in a
  // discount field doesn't hit the server on every keystroke. Skipped while no
  // link exists yet (drafts) and for cart-only/physical invoices.
  const discountSyncSignature = [
    subtotal,
    combinedCustomDiscount,
    JSON.stringify(customDiscountsList),
    listingCustomDiscount,
    membershipCustomDiscount,
    scheduledDiscountSum,
    schedListingTotal,
    schedMembershipTotal,
    couponDiscountAmount,
    appliedCoupon?.code || '',
    latestOfferExpiry || '',
    linkExpiry,
    JSON.stringify(cartItems.map(i => [i.type, i.itemId, i.price, i.quantity])),
  ].join('|');
  const hasListingOrMembershipLink = Boolean(checkoutTokens.listing || checkoutTokens.membership);

  useEffect(() => {
    if (!currentInvoiceId) return;
    if (hasOnlyAds || hasPhysical) return;
    if (!hasListingOrMembershipLink) return;
    const t = setTimeout(() => {
      generateCheckoutLinks();
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discountSyncSignature, currentInvoiceId, hasOnlyAds, hasPhysical, hasListingOrMembershipLink]);

  // Keep the ad agreement contract's stored coupon in sync with the coupon the
  // agent applies/removes on this page. The contract is created once and reused,
  // so if the agent applies a coupon AFTER the link was generated (or the coupon
  // is restored from the saved invoice after the link was auto-generated), the
  // contract's discount_details would otherwise keep a stale/no coupon — and the
  // customer-facing page would not auto-apply it. Re-syncing on every coupon
  // change makes the SAME sent link reflect the coupon immediately.
  useEffect(() => {
    if (!hasAdItem || !generatedAdLink) return;
    syncAdContractDiscount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedCoupon, hasAdItem, generatedAdLink]);

  useEffect(() => {
    if (!agreementBillTo && customerInfo.name) setAgreementBillTo(customerInfo.name);
    if (!agreementPhone && customerInfo.phone) setAgreementPhone(customerInfo.phone);
    if (!agreementDate) setAgreementDate(new Date().toISOString().slice(0, 10));
  }, [customerInfo.name, customerInfo.phone]);

  // ── FETCH THE AD AGREEMENT DETAILS FROM THE CONTRACT ROW ────────────────
  // crm_invoices.discount_details only holds the CRM's own copy of the
  // agreement fields. A contract created or edited from the legacy admin panel
  // (ad_contracts.source = 'admin') writes ad_contracts directly and never
  // touches that copy, so the invoice page would show stale bill-to / phone /
  // term values. Read the contract's own columns instead.

  // loadAdAgreementDetails is memoized without the discount/coupon state in its
  // dependency list (adding them would re-create the callback on every keystroke
  // and re-fire the auto-fetch effect), so it reads the current values through
  // this ref instead of a stale closure. Synced after every render so the
  // Refresh button never sees a stale snapshot.
  const discountStateRef = useRef({});
  useEffect(() => {
    discountStateRef.current = { appliedCoupon, discountValue, extraDiscounts };
  });
  // A coupon code restored from ad_contracts.discounts_json. Kept in state so
  // the effect below - declared after validateCoupon - can apply it, which keeps
  // the memoized fetcher free of any dependency on validateCoupon.
  const [pendingContractCoupon, setPendingContractCoupon] = useState('');
  const handledContractCoupon = useRef('');
  const persistInFlight = useRef(null);
  const persistInvoiceOnce = () => {
    if (!persistInFlight.current) {
      persistInFlight.current = persistInvoice().finally(() => { persistInFlight.current = null; });
    }
    return persistInFlight.current;
  };

  const loadAdAgreementDetails = useCallback(async (opts = {}) => {
    if (!hasAdItem) return null;

    const invoiceId = currentInvoiceId || invoiceIdFromCRM || null;
    if (!invoiceId && !adContractId && !adContractToken) return null;

    // Run once per invoice so a re-render can never clobber live typing.
    // The header's Refresh button passes { force: true } to re-pull on demand.
    const fetchKey = String(invoiceId || adContractId || adContractToken);
    if (!opts.force && adAgreementFetchedFor.current === fetchKey) return null;
    adAgreementFetchedFor.current = fetchKey;

    setIsLoadingAdAgreement(true);
    try {
      const params = new URLSearchParams();
      if (adContractId) params.set('contractId', adContractId);
      if (adContractToken) params.set('signToken', adContractToken);
      if (invoiceId) params.set('crmInvoiceId', invoiceId);

      const res = await fetch(`${API_BASE_URL}/ads/agreement-details?${params.toString()}`);
      const data = await res.json();
      console.log('Fetched ad agreement details:', data);
      if (!res.ok || !data.success || !data.found || !data.agreement) return null;

      const a = data.agreement;
      if (a.id) setAdContractId(a.id);
      if (a.signToken) setAdContractToken(a.signToken);
      setAdTermType(normaliseTermType(a.termType));
      // The contract stores the complimentary run length; the form only offers
      // 1-3 months, so clamp whatever the admin panel recorded.
      const compMonths = parseInt(a.complimentaryMonths, 10);
      if (Number.isInteger(compMonths) && compMonths >= 1) {
        setAdComplimentaryTerm(Math.min(3, compMonths));
      }
      setAdContractSource(a.source || null);

      // The contract wins over the invoice's stale copy. Blank contract columns
      // are left alone so the customer-name default above still applies.
      if (a.billTo) setAgreementBillTo(a.billTo);
      if (a.billPhone) setAgreementPhone(a.billPhone);
      if (a.billPhoneAlt) setAgreementAltPhone(a.billPhoneAlt);
      if (a.agreementDate) setAgreementDate(a.agreementDate);

      // Admin contracts store agreement_terms as free text (sometimes just
      // "paid", sometimes a bare "Monthly" next to a 4-month paid_term), so
      // resolve the real term and the upfront months together.
      const resolved = resolveAdAgreementTerm(a.agreementTerms, a.paidTerm, a.upfrontMonths, a.collectionType);
      setAgreementTerms(resolved.term);
      setAgreementPaymentTerm(String(resolved.upfrontMonths));

      // Restore the contract's itemized discounts (ad_contracts.discounts_json),
      // e.g. [{"label":"Custom Discount 1","amount":12,...},
      //        {"type":"coupon","label":"Coupon Discount (GC2026)","couponCode":"GC2026",...}].
      // This only ever FILLS EMPTY FIELDS: anything already restored from
      // crm_invoices wins, and live typing is never overwritten.
      const contractDiscounts = Array.isArray(a.discounts)
        ? a.discounts.filter((d) => d && d.active !== false)
        : [];
      const { appliedCoupon: liveCoupon, discountValue: liveDiscountValue, extraDiscounts: liveExtras } = discountStateRef.current;

      // Re-apply the stored coupon code against the CURRENT cart rather than
      // trusting the stored amount, so the figure always matches today's items.
      // Validation itself is handed to the effect below via pendingContractCoupon.
      const contractCoupon = contractDiscounts.find((d) => d.type === 'coupon' && d.couponCode);
      if (contractCoupon && !liveCoupon) {
        setCouponCode(contractCoupon.couponCode);
        setPendingContractCoupon(contractCoupon.couponCode);
      }

      // discounts_json stores the MONTHLY figure the agent typed, so restoring it
      // straight back into discountValue is stable and idempotent - reopening the
      // same invoice any number of times keeps the same discount.
      const contractCustoms = contractDiscounts.filter((d) => !d.type && parseFloat(d.amount) > 0);
      if (contractCustoms.length > 0 && !liveDiscountValue && liveExtras.length === 0) {
        const [first, ...rest] = contractCustoms;
        setDiscountType('flat');
        setDiscountValue(String(first.amount));
        // Only adopt a real title, not the generic "Custom Discount 1" /
        // legacy "Custom 1" placeholders.
        if (first.label && !/^custom( discount)? \d+$/i.test(first.label)) {
          setCombinedDiscountTitle(first.label);
        }
        if (rest.length > 0) {
          setExtraDiscounts(rest.map((d, i) => ({
            id: `d_contract_${i}`,
            type: 'flat',
            value: String(d.amount),
            title: d.label || '',
          })));
        }
      }

      return a;
    } catch (err) {
      console.error('Failed to load ad agreement details:', err);
      return null;
    } finally {
      setIsLoadingAdAgreement(false);
    }
  }, [hasAdItem, currentInvoiceId, invoiceIdFromCRM, adContractId, adContractToken]);

  // Auto-fetch once the invoice's DB details have finished restoring, so the
  // contract's values land AFTER the invoice's own copy and take precedence.
  // `restoreSettled` is a real dependency (not just the ref) so that the moment
  // restore completes this effect re-runs even if every other dependency already
  // had its final value - otherwise the fetch silently never happens.
  useEffect(() => {
    if (!packagesLoaded) return;
    if (!restoreSettled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAdAgreementDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packagesLoaded, restoreSettled, currentInvoiceId, hasAdItem]);

  const handleUpdateQuantity = (id, newQty) => {
    const qty = Math.max(1, Number(newQty));
    setCartItems(prev => prev.map(item => item.id === id ? { ...item, quantity: qty } : item));
  };

  const handleUpdateItemPrice = (id, newPrice) => {
    setCartItems(prev => prev.map(item =>
      item.id === id ? { ...item, price: newPrice === '' ? 0 : parseFloat(newPrice) || 0 } : item
    ));
  };

  const handleRemoveItem = (id) => {
    setCartItems(prev => prev.filter(item => item.id !== id));
  };

  const handleApplyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) { setCouponError('Please enter a coupon code'); return; }
    try {
      setIsApplyingCoupon(true);
      setCouponError('');
      await validateCoupon(code);
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  // Validates a coupon code against the CURRENT cart. A coupon is either
  // per-item (its entries match listing/membership/ads packages in the cart) or
  // flat-total (a whole-cart discount). The result drives the live discount line.
  const validateCoupon = async (code) => {
    const normalized = String(code || '').trim().toUpperCase();
    if (!normalized) { setAppliedCoupon(null); setCouponError('Please enter a coupon code'); return false; }
    if (couponValidationInFlight.current) return false;
    couponValidationInFlight.current = true;
    try {
      const response = await fetch(`${API_BASE_URL}/invoices/coupon/${encodeURIComponent(normalized)}`);
      const data = await response.json();
      if (!data.success) {
        setCouponError(data.message || 'Invalid or expired coupon code');
        setAppliedCoupon(null);
        lastCouponValidationSignature.current = '';
        return false;
      }
      const itemDiscountMap = {};
      (data.items || []).forEach(it => { itemDiscountMap[String(it.itemId)] = it; });
      const matchedLines = cartItems.filter(
        ci => ['L', 'M', 'A'].includes(ci.type) && itemDiscountMap[String(ci.itemId)]
      );
      if (matchedLines.length > 0) {
        setAppliedCoupon({ code: data.code, mode: 'per-item', itemDiscountMap });
      } else {
        setAppliedCoupon({ code: data.code, mode: 'flat-total', type: data.discountType, discount: data.discountValue });
      }
      lastCouponValidationSignature.current = couponSignatureFor(cartItems);
      setCouponError('');
      return true;
    } catch (error) {
      setCouponError('Failed to validate coupon. Please try again.');
      setAppliedCoupon(null);
      lastCouponValidationSignature.current = '';
      return false;
    } finally {
      couponValidationInFlight.current = false;
    }
  };

  // Re-validate a coupon code restored from ad_contracts.discounts_json against
  // the current cart. The ref guard means a later Refresh will not silently
  // re-apply a coupon the user has since removed.
  useEffect(() => {
    if (!pendingContractCoupon) return;
    if (handledContractCoupon.current === pendingContractCoupon) return;
    handledContractCoupon.current = pendingContractCoupon;
    validateCoupon(pendingContractCoupon);
    // validateCoupon is intentionally left out of the deps: it is redefined on every
    // render, and the ref guard above already makes repeat runs a no-op.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingContractCoupon]);

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponError('');
    lastCouponValidationSignature.current = '';
  };

  // When the cart's package lines change (e.g. Ads swapped for a Listing
  // package), re-validate the applied coupon against the new package set so the
  // discount recomputes for the current package automatically — instead of
  // silently keeping a stale per-item discount map from the old one.
  useEffect(() => {
    if (!appliedCoupon?.code) return;
    const currentSig = couponSignatureFor(cartItems);
    if (currentSig === lastCouponValidationSignature.current) return;
    validateCoupon(appliedCoupon.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartItems]);

  const handleSaveCustomer = (updated) => { setCustomerInfo(updated); setShowEditCustomer(false); setSavedBadge(true); setTimeout(() => setSavedBadge(false), 2500); };

  const getNormalizedDateString = (dateInput) => {
    if (!dateInput) return '';
    if (typeof dateInput === 'string' && !dateInput.includes('T')) return dateInput;
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDateString = (dateInput) => {
    const cleanDate = getNormalizedDateString(dateInput);
    if (!cleanDate) return 'Invalid Date';
    const [year, month, day] = cleanDate.split('-');
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const sortSchedules = (a, b) => {
    const dateA = getNormalizedDateString(a.send_date || a.date);
    const dateB = getNormalizedDateString(b.send_date || b.date);
    const timeA = a.send_time || a.time || '00:00';
    const timeB = b.send_time || b.time || '00:00';
    const timeStampA = new Date(`${dateA}T${timeA}`).getTime() || 0;
    const timeStampB = new Date(`${dateB}T${timeB}`).getTime() || 0;
    return timeStampA - timeStampB;
  };

  const runningTotal = Math.max(0, totalDue);

  const allTexts = [...dbSchedules.filter(s => s.message_type === 'sms'), ...scheduledTexts].sort(sortSchedules);
  const allEmails = [...dbSchedules.filter(s => s.message_type === 'email'), ...scheduledEmails].sort(sortSchedules);
  const activeSchedules = messageTab === 'texts' ? allTexts : allEmails;

  // Itemized discounts coming from scheduled SMS/Email messages (shown on the ad link).
  // Only the ADS portion of each message's per-type discount applies to the ad
  // contract; listings/membership discounts belong to their own checkout links.
  const adScheduledDiscounts = allCurrentSchedules
    .map(s => ({
      type: s.message_type || 'sms',
      // Resolved (monthly x term) so the contract total matches the invoice.
      amount: scheduleAdsAmounts(s).resolved,
      label: (s.message_type === 'email') ? 'Email Discount' : 'SMS Discount',
    }))
    .filter(d => d.amount > 0);

  // Single source of truth for the ad_contracts.discounts_json "Scheduled
  // Discount" rows. Both the writer (adDiscountsJson, which the admin panel
  // reads) and the itemized rows in the discount editor go through here, so what
  // the agent sees can never drift from what gets stored.
  // Returns null when the message contributes no ads discount, so callers can
  // just filter(Boolean).
  const buildScheduleDiscountEntry = (s) => {
    const { monthly, resolved } = scheduleAdsAmounts(s);
    if (!(resolved > 0)) return null;

    // Prefer discount_details.dateLabel: the schedule row already stores the send
    // stamp pre-formatted in exactly this shape, so the label round-trips byte for
    // byte. Only legacy rows that predate dateLabel reach the fallback below.
    const stamp = s?.dateLabel || formatSendStamp(
      s?.send_date_iso || s?.send_date || s?.date,
      s?.send_time_str || s?.send_time || s?.time
    );

    let label = `Scheduled Discount (${stamp})`;
    // The percent/flat config lives in different places depending on whether the
    // row came from crm_scheduled_messages (discount_details.meta) or is still
    // unsaved in the modal (discounts).
    const cfg = (s?.discountMeta && s.discountMeta.ads) || (s?.discounts && s.discounts.ads);
    if (cfg && /percent/i.test(String(cfg.type || ''))) label += ` ${parseFloat(cfg.amount ?? cfg.value) || 0}% off`;

    // `amount` is the MONTHLY figure, matching the custom discounts and the coupon.
    // `displayAmount` is that value resolved across paymentTermMonths and is what
    // the itemized row shows. The server's discounts_json normaliser keeps only
    // `amount`, so ad_contracts stores the monthly figure like its other rows.
    return { type: 'ads', label, amount: monthly, displayAmount: resolved, date: null, active: true };
  };

  // Itemized read-only rows shown in the discount editor. Sourced from the live
  // schedule list (crm_scheduled_messages + unsaved rows) rather than from the
  // contract, so they render even before an ad_contracts row exists.
  const scheduledDiscountRows = allCurrentSchedules.map(buildScheduleDiscountEntry).filter(Boolean);

  // Itemized breakdown persisted to ad_contracts.discounts_json so the customer-
  // facing ad agreement page can render every discount row (custom discounts +
  // per-schedule ads discounts), e.g.
  // [{"label":"Custom Discount 1","amount":12,"date":null,"active":true},
  //  {"type":"ads","label":"Scheduled Discount (Sep 21, 26 2:53AM) ...","amount":88.1,"date":null,"active":true}]
  const adDiscountsJson = [
    ...customDiscountsList.map((c, i) => ({
      // customDiscountsList pre-fills a generic "Custom N" placeholder, which
      // would win over the row label. Map that placeholder back to the editor's
      // "Custom Discount N" so discounts_json matches the rows the agent sees,
      // while a genuinely custom title is still preserved.
      label: (c.title && !/^custom \d+$/i.test(c.title)) ? c.title : `Custom Discount ${i + 1}`,
      amount: c.amount,
      date: null,
      active: true,
    })),
    ...allCurrentSchedules.map(buildScheduleDiscountEntry).filter(Boolean),
    // The coupon is itemized so the agreement page can list it alongside the
    // custom discounts. It is deliberately kept OUT of adTotalDiscount below:
    // the customer page re-applies it from couponCode instead of having it
    // baked into the price.
    ...(appliedCoupon ? [{
      type: 'coupon',
      label: `Coupon Discount (${appliedCoupon.code})`,
      // Store the ONE-MONTH coupon figure, matching the custom discounts above.
      // A percent coupon keeps its percentage; a flat one is divided back down
      // from the resolved total so re-opening never inflates it.
      amount: appliedCoupon.type === 'percent'
        ? Number(appliedCoupon.discount) || 0
        : couponDiscountMonthly,
      displayAmount: couponDiscountAmount || 0,
      date: null,
      active: true,
      couponCode: appliedCoupon.code,
    }] : []),
  ];

  // Total discount that applies to the ad package on the customer-facing agreement link.
  // Only the custom/flat discount + scheduled SMS/Email discounts are applied here.
  // The coupon discount is deliberately NOT baked into the link — the coupon code is
  // passed along instead so the customer page auto-applies it in its coupon field.
  const adBasePrice = adsBilledBase || 0;
  const adScheduledTotal = adScheduledDiscounts.reduce((sum, d) => sum + d.amount, 0);
  const adTotalDiscount = Math.min(Math.max(0, adBasePrice), Math.max(0, combinedCustomDiscount + adsCustomDiscount + adScheduledTotal));
  const adDiscountInfo = { totalDiscount: adTotalDiscount, totalPrice: Math.max(0, adBasePrice - adTotalDiscount) };
  const agreementsForSave = Object.fromEntries(
    Object.entries(vehicleAgreements)
      .filter(([k]) => vehicleItems.some(v => vehicleKey(v) === k)) // drops orphans of removed vehicles
      .map(([k, a]) => {
        const { consignments, consignment, ...rest } = a || {};
        return [k, rest]; // keeps referral only
      })
  );


  const buildDiscountDetails = (overrideItems, tokensOverride) => {
    const items = overrideItems || allCurrentSchedules;
    const totalSchedDisc = items.reduce(
      (sum, s) => sum + Number(s.discount || s.discount_offered || 0), 0
    );
    const expiries = items.map(s => s.offerExpiry).filter(Boolean).sort().reverse();
    const latestExpiry = expiries.length > 0 ? expiries[0] : null;
    const tokens = tokensOverride || checkoutTokens || {};
    return JSON.stringify({
      customType: discountType,
      customValue: discountValue || '',
      extraDiscounts: extraDiscounts.map((d) => ({ type: d.type, value: d.value, title: d.title || '' })),
      customDiscounts: customDiscountsList,
      couponCode: appliedCoupon?.code || null,
      couponMode: appliedCoupon?.mode || null,
      couponType: appliedCoupon?.type || null,
      couponDiscount: couponDiscountMonthly || null,
      couponItemDiscountMap: appliedCoupon?.itemDiscountMap || null,
      cumulativeScheduledDiscount: totalSchedDisc,
      listingLinkToken: tokens.listing || null,
      membershipLinkToken: tokens.membership || null,
      offerExpiry: latestExpiry,
      adContractId: adContractId ?? null,
      adContractToken: adContractToken || null,
      adContractTerm: agreementTerms,
      adPaymentMonths: paymentTermMonths,
      adTermType: adTermType,
      adComplimentaryTerm: showComplimentaryTerm ? adComplimentaryTerm : null,
      adAgreementDate: agreementDate || null,
      tax_amount: taxAmount,
      shipping_amount: shippingCost,
      total_override: totalOverride,
      vehicleAgreements: agreementsForSave
    });
  };

  const handleConfirmCreate = async (sendMethod) => {
    try {
      setIsSubmitting(true);
      const userId = await createAccountIfNeeded();
      const payload = {
        invoiceId: currentInvoiceId,
        invoiceNumber: invoiceNumber,
        userId,
        phone: customerInfo.phone,
        name: customerInfo.name,
        email: customerInfo.email,
        subtotal,
        discountAmount,
        discountType,
        discountValue,
        discountDetails: buildDiscountDetails(),
        shippingCost,
        totalDue,
        amountDueNow,
        paymentType,
        notes,
        items: cartItems,
        scheduledTexts: allTexts,
        scheduledEmails: allEmails,
        sendMethod
      };

      const response = await fetch(`${API_BASE_URL}/invoices/create`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (data.success) {
        if (data.invoiceId) setCurrentInvoiceId(data.invoiceId);
        await syncAdContractDiscount();

        // 💡 IF ONLY ADS ARE IN CART -> Generate Ad Link and inject it
        if (hasOnlyAds) {
          let link = generatedAdLink;
          if (!link) {
            link = await handleGenerateAdLink();
          }
          if (link) {
            const finalMsg = payLinkMessage.replace('[Ad Agreement link will be generated automatically]', link);
            setPayLinkMessage(finalMsg);

            if (sendMethod === 'sms') {
              await fetch(`${API_BASE_URL}/twilio/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: customerInfo.phone, message: finalMsg })
              });
            } else {
              const subject = encodeURIComponent(`Invoice #${invoiceNumber}`);
              window.location.href = `mailto:${customerInfo.email}?subject=${subject}&body=${encodeURIComponent(finalMsg)}`;
            }
            alert(`✅ Ads Invoice sent via ${sendMethod.toUpperCase()} successfully!`);
          }
        }
        // 💡 STANDARD LINK GENERATION
        else {
          // If the cart ALSO contains an ads package, generate the ads agreement
          // link too so the customer gets every link in the same message.
          let adLink = null;
          if (hasAdItem && !hasOnlyAds) {
            adLink = generatedAdLink || (await handleGenerateAdLink());
          }

          const linkRes = await fetch(`${API_BASE_URL}/invoices/generate-link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: customerInfo.email,
              firstName: (customerInfo.name || '').split(' ')[0],
              lastName: (customerInfo.name || '').split(' ').slice(1).join(' '),
              phone: customerInfo.phone,
              amount: amountDueNow,
              items: cartItems,
              subtotal,
              customDiscount: combinedCustomDiscount,
              customDiscounts: customDiscountsList,
              listingCustomDiscount,
              membershipCustomDiscount,
              couponDiscount: couponDiscountMonthly,
              couponCode: appliedCoupon?.code || null,
              offerExpiry: latestOfferExpiry,
              scheduledDiscount: scheduledDiscountSum,
              listingScheduledDiscount: schedListingTotal,
              membershipScheduledDiscount: schedMembershipTotal,
              listingToken: checkoutTokens.listing || null,
              membershipToken: checkoutTokens.membership || null,
              shipping: shippingCost,
              tax: taxAmount,
              deliveryMethod: sendMethod === 'sms' ? 'SMS Only' : 'Email Only',
              customMessage: payLinkMessage,
              expiresIn: linkExpiry,
              agentId: 1,
              adLink: adLink || null,
              invoiceId: currentInvoiceId || null,
            })
          });
          const linkData = await linkRes.json();
          if (!linkData.success) throw new Error(linkData.message || 'Failed to send payment link');
          if (linkData.links) {
            setCheckoutLinks({ listing: linkData.links.listingLink || null, membership: linkData.links.membershipLink || null });
            setCheckoutTokens({ listing: linkData.links.listingToken || null, membership: linkData.links.membershipToken || null });
          }

          const linksText = buildCombinedLinksText({
            listing: linkIncludeTypes.listing !== false ? linkData.links?.listingLink : null,
            membership: linkIncludeTypes.membership !== false ? linkData.links?.membershipLink : null,
            ad: linkIncludeTypes.ads !== false ? (adLink || null) : null,
          });
          const finalMsg = applyCheckoutLinksToMessage(payLinkMessage, linksText);
          setPayLinkMessage(finalMsg);

          // Email is delivered from the customer's mail client (the server only
          // sends SMS), so open a pre-filled mailto with the real links.
          if (sendMethod === 'email' && customerInfo.email) {
            const subject = encodeURIComponent(`Invoice #${invoiceNumber}`);
            window.location.href = `mailto:${customerInfo.email}?subject=${subject}&body=${encodeURIComponent(finalMsg)}`;
          }

          alert(`✅ Invoice ${data.invoiceNumber || invoiceNumber} created and sent via ${sendMethod.toUpperCase()} successfully!`);
        }

        navigate(-1);
      } else {
        throw new Error(data.message || "Failed to create invoice");
      }
    } catch (error) {
      console.error(error); alert('❌ Failed to create invoice.');
    } finally {
      setIsSubmitting(false);
      setSendModalState('closed');
    }
  };

  const loadConsignments = useCallback(async () => {
    if (!currentInvoiceId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/consignments?invoiceId=${currentInvoiceId}`);
      const json = await res.json();
      if (!json.success) return;
      setVehicleAgreements(prev => {
        const next = {};
        Object.entries(prev).forEach(([k, a]) => { next[k] = { ...a, consignments: [] }; });
        (json.consignments || []).forEach(c => {
          const k = String(c.vehicleKey);
          const list = next[k]?.consignments || [];
          next[k] = { ...(next[k] || {}), consignments: [...list, { ...c.form, id: c.id, status: c.status, stamp: c.stamp }] };
        });
        return next;
      });
    } catch (e) { console.error('Failed to load consignments', e); }
  }, [currentInvoiceId]);

  const loadReferrals = useCallback(async () => {
    if (!currentInvoiceId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/referrals?invoiceId=${currentInvoiceId}`);
      const json = await res.json();
      if (!json.success) return;
      
      setVehicleAgreements(prev => {
        const next = { ...prev };
        (json.referrals || []).forEach(r => {
          const k = String(r.vehicleKey);
          next[k] = { 
            ...(next[k] || {}), 
            referral: { ...r.form, id: r.id, status: r.status, stamp: r.stamp } 
          };
        });
        return next;
      });
    } catch (e) { 
      console.error('Failed to load referrals', e); 
    }
  }, [currentInvoiceId]);

  useEffect(() => { 
    if (restoreSettled) {
      loadConsignments();
      loadReferrals();
    }
  }, [restoreSettled, loadConsignments, loadReferrals]);

  // pick up "Signed" without a manual reload
  // pick up "Signed" without a manual reload for both agreements
  useEffect(() => {
    const handleFocus = () => {
      loadConsignments();
      loadReferrals();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadConsignments, loadReferrals]);

  const handleChargeAndOrder = async () => {
    if (!customerInfo.name || !customerInfo.email) {
      alert('⚠️ Please enter Billing Name and Email.');
      return;
    }

    if (cartItems.length === 0) {
      alert('⚠️ Cannot charge an empty invoice.');
      return;
    }

    try {
      setIsSubmitting(true);
      const uid = await createAccountIfNeeded();
      const nameParts = (customerInfo.name || '').trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      const payload = {
        invoiceId: currentInvoiceId,
        invoiceNumber: invoiceNumber,
        userId: uid,
        customerData: {
          firstName,
          lastName,
          email: customerInfo.email,
          phone: customerInfo.phone,
          address: customerInfo.address || '',
          city: customerInfo.city || '',
          state: customerInfo.state || '',
          zip: customerInfo.zip || ''
        },
        cart: cartItems,
        subtotal,
        discountAmount,
        shippingCost,
        totalDue,
        amountPaid: amountDueNow,
        paymentType
      };

      const response = await fetch(`${API_BASE_URL}/invoices/charge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (data.success) {
        alert(`✅ Successfully charged $${amountDueNow.toFixed(2)} to ${customerInfo.name}!\n\nAny Memberships, Listing Packs, or Seat Covers in this order have been successfully activated and logged.`);
        navigate(-1);
      } else {
        throw new Error(data.message || 'Payment processing failed on the server.');
      }
    } catch (error) {
      console.error("Charge error:", error);
      alert(`❌ Payment failed: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Generate the separate secure hex-token checkout links (listing + membership)
  // WITHOUT sending them. Used by "Copy Payment Link" and to display links.
  // schedOverrides lets a scheduled message embed links that carry THAT message's
  // own per-type scheduled discount instead of the invoice-wide totals.
  const generateCheckoutLinks = async (schedOverrides = {}) => {
    if (!currentInvoiceId) {
      try { await persistInvoice(); } catch (e) { alert(`❌ ${e.message || 'Failed to save the invoice first.'}`); return null; }
    }
    try {
      const response = await fetch(`${API_BASE_URL}/invoices/checkout-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: customerInfo.email,
          firstName: (customerInfo.name || '').split(' ')[0],
          lastName: (customerInfo.name || '').split(' ').slice(1).join(' '),
          phone: customerInfo.phone,
          items: cartItems,
          subtotal,
          customDiscount: combinedCustomDiscount,
          customDiscounts: customDiscountsList,
          listingCustomDiscount,
          membershipCustomDiscount,
          couponDiscount: couponDiscountMonthly,
          couponCode: appliedCoupon?.code || null,
          offerExpiry: latestOfferExpiry,
          scheduledDiscount: scheduledDiscountSum,
          listingScheduledDiscount: schedOverrides.listingScheduledDiscount != null ? schedOverrides.listingScheduledDiscount : schedListingTotal,
          membershipScheduledDiscount: schedOverrides.membershipScheduledDiscount != null ? schedOverrides.membershipScheduledDiscount : schedMembershipTotal,
          listingToken: checkoutTokens.listing || null,
          membershipToken: checkoutTokens.membership || null,
          shipping: shippingCost,
          tax: taxAmount,
          amount: amountDueNow,
          expiresIn: linkExpiry,
          agentId: 1,
          invoiceId: currentInvoiceId || null,
        })
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.message || 'Failed to generate checkout links');
      const links = {
        listing: data.listingLink || null,
        membership: data.membershipLink || null,
        listingToken: data.listingToken || null,
        membershipToken: data.membershipToken || null,
      };
      setCheckoutLinks({ listing: links.listing, membership: links.membership });
      setCheckoutTokens({ listing: links.listingToken, membership: links.membershipToken });
      return links;
    } catch (error) {
      console.error('Generate Checkout Links Error:', error);
      alert(`❌ ${error.message || 'Failed to generate checkout links.'}`);
      return null;
    }
  };

  // Build the final outbound message with the freshly-minted links, removing any
  // stale placeholder / old checkout URL so we never send duplicates.
  const applyCheckoutLinksToMessage = (message, linksText) => {
    if (!linksText) return message;
    const cleaned = (message || '')
      .replace(PAY_LINK_PLACEHOLDER, '')
      .replace(/Listing Payment Link:\s*https?:\/\/\S+/g, '')
      .replace(/Membership Payment Link:\s*https?:\/\/\S+/g, '')
      .replace(/Listing link:\s*https?:\/\/\S+/g, '')
      .replace(/Membership Link:\s*https?:\/\/\S+/g, '')
      .replace(/Ads link:\s*https?:\/\/\S+/g, '')
      .replace(/Pay securely here:\s*https?:\/\/\S+/g, '')
      .replace(/https?:\/\/\S*\/sales\/packages\/(buy_package|pay_transaction)\/\S+/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return `${cleaned}\n\n${linksText}`;
  };

  // Combine listing + membership + ads links into one clean block for the message.
  const buildCombinedLinksText = ({ listing, membership, ad }) => [
    listing && `Listing link: ${listing}`,
    membership && `Membership Link: ${membership}`,
    ad && `Ads link: ${ad}`,
  ].filter(Boolean).join('\n');

  const toggleLinkType = async (key) => {
    const turningOn = linkIncludeTypes[key] === false;
    const next = { ...linkIncludeTypes, [key]: turningOn };

    let listing = checkoutLinks.listing;
    let membership = checkoutLinks.membership;
    let ad = generatedAdLink;

    if (turningOn) {
      if (key === 'ads' && !ad && activeAdPackage && currentInvoiceId) {
        const link = await handleGenerateAdLink();
        if (link) ad = link;
      }
      if (key !== 'ads' && !listing && !membership && currentInvoiceId) {
        const links = await generateCheckoutLinks();
        if (links) {
          listing = links.listing;
          membership = links.membership;
          setCheckoutLinks({ listing: links.listing, membership: links.membership });
          setCheckoutTokens({ listing: links.listingToken, membership: links.membershipToken });
        }
      }
    }

    setLinkIncludeTypes(next);
    const linksText = buildCombinedLinksText({
      listing: next.listing !== false ? (listing || null) : null,
      membership: next.membership !== false ? (membership || null) : null,
      ad: next.ads !== false ? (ad || null) : null,
    });
    setPayLinkMessage(applyCheckoutLinksToMessage(payLinkMessage, linksText));
  };

  const handleGeneratePayLink = async () => {
    try {
      setIsGeneratingLink(true);

      if (!currentInvoiceId) {
        try { await persistInvoice(); } catch (e) { alert(`❌ ${e.message || 'Failed to save the invoice first.'}`); return null; }
      }

      // 💡 IF ONLY ADS -> Generate Ads agreement Link only (no send)
      if (hasOnlyAds) {
        let link = generatedAdLink;
        if (!link) {
          link = await handleGenerateAdLink();
          if (!link) return null;
        }
        await syncAdContractDiscount();

        const finalMsg = payLinkMessage.replace('[Ad Agreement link will be generated automatically]', link);
        setPayLinkMessage(finalMsg);
        setLinkGenerated(true);
        alert('✅ Ads payment link generated successfully!');
        setIsGeneratingLink(false);
        return finalMsg;
      }

      // 💡 STANDARD LINK GENERATION
      // If the cart ALSO contains an ads package, generate the ads agreement
      // link too so the customer gets one message with every link.
      let adLink = null;
      if (hasAdItem && !hasOnlyAds) {
        adLink = generatedAdLink || (await handleGenerateAdLink());
      }

      let linksText = '';
      if (!hasPhysical) {
        const links = await generateCheckoutLinks();
        if (links) {
          setCheckoutLinks({ listing: links.listing, membership: links.membership });
          setCheckoutTokens({ listing: links.listingToken, membership: links.membershipToken });
        }
        linksText = buildCombinedLinksText({
          listing: linkIncludeTypes.listing !== false ? (links?.listing || checkoutLinks.listing) : null,
          membership: linkIncludeTypes.membership !== false ? (links?.membership || checkoutLinks.membership) : null,
          ad: linkIncludeTypes.ads !== false ? (adLink || null) : null,
        });
      } else if (adLink && linkIncludeTypes.ads !== false) {
        linksText = `Ads link: ${adLink}`;
      }

      // Guarantee the ads link appears in the message whenever the cart has an
      // ads package (hybrid carts), so it is never silently dropped.
      if (hasAdItem && !hasOnlyAds && linkIncludeTypes.ads !== false && adLink && !linksText.includes('Ads link:')) {
        linksText = linksText ? `${linksText}\nAds link: ${adLink}` : `Ads link: ${adLink}`;
      }

      const body = applyCheckoutLinksToMessage(payLinkMessage, linksText);
      setPayLinkMessage(body);
      setLinkGenerated(true);
      alert('✅ Payment link generated successfully!');
      return body;
    } catch (error) {
      console.error("Pay Link Generate Error:", error);
      alert(`❌ ${error.message || 'Failed to generate payment link.'}`);
      return null;
    } finally {
      setIsGeneratingLink(false);
    }
  };

  // Sends the already-generated payment link according to the selected mode:
  //   text_system  -> Twilio SMS via the system
  //   text_manual  -> copy the message/link to clipboard for manual texting
  //   email_system -> SMTP email sent by the system
  //   email_manual -> open a pre-filled mailto draft for manual sending
  const handleSendPayLink = async () => {
    try {
      setIsSendingPayLink(true);

      const hasGenerated = linkGenerated ||
        generatedAdLink ||
        Boolean(checkoutLinks.listing) ||
        Boolean(checkoutLinks.membership) ||
        hasPhysical;

      // Re-generate when nothing is generated yet, or when an ads package is in
      // the cart but the message is missing its ads link.
      const needsAdsLink = hasAdItem && !hasOnlyAds && !/Ads link:\s*https?:\/\/\S+/.test(payLinkMessage);
      let message = payLinkMessage;
      if (!hasGenerated || needsAdsLink) {
        const generated = await handleGeneratePayLink();
        if (generated) message = generated;
      } else if (hasAdItem) {
        // Link already generated: no regeneration happens, so sync the ad
        // contract discount/coupon now so the sent link reflects the current
        // coupon state (e.g. coupon applied after the link was generated).
        await syncAdContractDiscount();
      }

      const subject = `Invoice #${invoiceNumber}`;

      if (linkSendMode === 'text_system') {
        if (!payLinkPhone) {
          alert("⚠️ Please enter a Mobile Number.");
          return;
        }
        const response = await fetch(`${API_BASE_URL}/twilio/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: payLinkPhone, message })
        });
        if (!response.ok) throw new Error("Failed to send SMS");
        alert('✅ Payment link sent via system text!');
      } else if (linkSendMode === 'text_manual') {
        await navigator.clipboard.writeText(message);
        window.location.href = `sms:?&body=${encodeURIComponent(message)}`;
        alert('✅ Your Messages app should now be open with the message ready — pick a contact and send. (It was also copied to your clipboard as backup.)');
      } else if (linkSendMode === 'email_system') {
        if (!payLinkEmail) {
          alert("⚠️ Please enter an Email Address.");
          return;
        }

        // Only act on types the checkboxes actually have checked. Unchecked types
        // are skipped entirely — no templated email AND no fallback generic email
        // for that type — mirroring how the text message already omits their link.
        const isIncluded = (type) => linkIncludeTypes[TYPE_TO_LINK_KEY[type]] !== false;

        const templatedTypes = Object.keys(PAY_LINK_EMAIL.endpoints).filter(k => PAY_LINK_EMAIL.endpoints[k]);
        const includedCartItems = cartItems.filter(i => isIncluded(i.type));
        const templatedItems = includedCartItems.filter(i => templatedTypes.includes(i.type));
        const nonTemplatedTypes = [...new Set(includedCartItems.map(i => i.type).filter(t => !templatedTypes.includes(t)))];

        if (includedCartItems.length === 0) {
          alert('⚠️ No links are selected to send. Check at least one link type above.');
          return;
        }

        const templateErrors = [];
        let anyTemplateSent = false;

        for (const item of templatedItems) {
          try {
            const builder = TEMPLATE_MAIL_BUILDERS[item.type];
            if (!builder) continue;
            const payload = await builder(item);
            if (!payload) continue;
            await sendPayLinkTemplateEmail(item.type, payload);
            anyTemplateSent = true;
          } catch (err) {
            templateErrors.push(`${item.name || item.type}: ${err.message}`);
          }
        }

        // Generic fallback covers only the checked types that don't have a
        // Klaviyo template yet (e.g. ads/listing before those are wired up).
        // The message body already reflects checkbox state via toggleLinkType,
        // so it naturally omits links for unchecked/already-templated types.
        let genericSent = false;
        if (nonTemplatedTypes.length > 0) {
          const response = await fetch(`${API_BASE_URL}/emails/send-pay-link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: payLinkEmail, subject, body: message })
          });
          const data = await response.json();
          if (!response.ok || !data.success) throw new Error(data.message || 'Failed to send email');
          genericSent = true;
        }

        if (templateErrors.length > 0) {
          alert(`⚠️ Some emails failed to send:\n${templateErrors.join('\n')}${(anyTemplateSent || genericSent) ? '\n\n(Other email(s) sent successfully.)' : ''}`);
        } else if (anyTemplateSent || genericSent) {
          alert('✅ Payment link email(s) sent via system email!');
        } else {
          alert('⚠️ Nothing to send — cart is empty or no items are checked.');
        }
      }
    } catch (error) {
      console.error("Send Pay Link Error:", error);
      alert(`❌ ${error.message || 'Failed to send payment link.'}`);
    } finally {
      setIsSendingPayLink(false);
    }
  };

  // Syncs the latest invoice discount (custom + coupon + scheduled SMS/Email) onto
  // the already-generated ad agreement contract, so the SAME customer link reflects
  // updated discounts every time the user re-opens it.
  // `overrideSchedules` lets callers pass freshly-updated scheduled messages.
  const syncAdContractDiscount = async (overrideSchedules) => {
    // Requires an ads package in the cart (pure-ads OR hybrid). For pure-ads the
    // ad contract is the only link; for hybrid it is the ad agreement link among
    // the checkout links. Each is updated via the SAME contract URL.
    if (!hasAdItem) return null;
    if (!adContractId && !adContractToken && !currentInvoiceId) return null;

    const schedList = overrideSchedules || allCurrentSchedules;
    // Only the ADS portion of each scheduled message's discount applies to the ad
    // contract link (listings/membership discounts live on their own checkout links).
    const schedDiscounts = schedList
      .map(s => ({
        type: s.message_type || 'sms',
        // Resolved (monthly x term) so the contract total matches the invoice;
        // discountsJson below still carries the monthly figure.
        amount: scheduleAdsAmounts(s).resolved,
        label: (s.message_type === 'email') ? 'Email Discount' : 'SMS Discount',
      }))
      .filter(d => d.amount > 0);

    try {
      const res = await fetch(`${API_BASE_URL}/ads/update-agreement-discount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId: adContractId,
          signToken: adContractToken,
          crmInvoiceId: currentInvoiceId,
          subtotal: adDiscountInfo.totalPrice + adDiscountInfo.totalDiscount,
          discountType,
          discountValue: parsedDiscount,
          customDiscount: combinedCustomDiscount,
          adsCustomDiscount,
          couponDiscount: couponDiscountMonthly,
          couponCode: appliedCoupon?.code || null,
          scheduledDiscounts: schedDiscounts,
          discountsJson: adDiscountsJson,
          agreementDate: agreementDate || null,
          agreementTerms: agreementTerms || null,
          // Keep the ad_contracts agreement columns in sync on a discount save.
          // The server applies these with COALESCE, so they only change when set.
          billTo: agreementBillTo || null,
          phone: agreementPhone || null,
          additionalPhone: agreementAltPhone || null,
          termType: adTermType,
          paidTerm: toAdPaidTerm(agreementTerms),
          collectionType: 'monthly',
          upfrontMonths: parseInt(agreementPaymentTerm, 10) > 0 ? parseInt(agreementPaymentTerm, 10) : null,
          complimentaryMonths: adTermType === 'paid' ? null : (parseInt(adComplimentaryTerm, 10) || null),
          offerExpiry: latestOfferExpiry,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.contractId) setAdContractId(data.contractId);
        if (data.signToken) setAdContractToken(data.signToken);
        return data;
      }
    } catch (error) {
      console.error('Failed to sync ad agreement discount:', error);
    }
    return null;
  };

  const handleGenerateAdLink = async () => {
    if (!activeAdPackage) {
      alert("⚠️ No ad package found in cart. Please add an ads package to the invoice first.");
      return null;
    }
    try {
      setIsGeneratingAdLink(true);
      setAdLinkCopied(false);

      const payload = {
        leadPhone: customerInfo.phone,
        userId: selectedUserId,
        billTo: agreementBillTo,
        phone: agreementPhone,
        additionalPhone: agreementAltPhone,
        agreementDate,
        terms: agreementTerms, // Monthly, "2 months and then monthly", etc.
        paymentTerm: paymentTermLabel,
        paymentTermMonths: paymentTermMonths,

        // ── AD AGREEMENT COLUMNS (ad_contracts) ──
        // term_type       -> term_type
        // paid_term       -> paid_term, as 'monthly' or 'N_then_monthly'
        // collection_type -> collection_type, always 'monthly'
        // upfront_months  -> upfront_months, the credit-card charge frequency
        termType: adTermType,
        paidTerm: toAdPaidTerm(agreementTerms),
        collectionType: 'monthly',
        upfrontMonths: parseInt(agreementPaymentTerm, 10) > 0 ? parseInt(agreementPaymentTerm, 10) : null,
        // Complimentary run length only applies to the complimentary term types;
        // a Paid contract must store NULL rather than a leftover default.
        complimentaryMonths: adTermType === 'paid' ? null : (parseInt(adComplimentaryTerm, 10) || null),
        adPackageId: activeAdPackage.id,
        adFeatures: selectedAdFeatures,
        email: customerInfo.email || null,

        // ── DISCOUNT DATA (mirrors what the CRM invoice shows) ──
        crmInvoiceId: currentInvoiceId,
        subtotal: adDiscountInfo.totalPrice + adDiscountInfo.totalDiscount,
        discount: adDiscountInfo.totalDiscount,
        totalPrice: adDiscountInfo.totalPrice, // Final total shown on the agreement link
        discountType,
        discountValue: parsedDiscount,
        customDiscount: combinedCustomDiscount,
        adsCustomDiscount,
        couponDiscount: couponDiscountMonthly,
        couponCode: appliedCoupon?.code || null,
        scheduledDiscounts: adScheduledDiscounts,
        discountsJson: adDiscountsJson,
        offerExpiry: latestOfferExpiry,
        termsTemplateId: termsTemplateId,
        termsJson: JSON.stringify(termsData)
      };

      const response = await fetch(`${API_BASE_URL}/ads/generate-agreement-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Failed to generate link");

      setGeneratedAdLink(data.link);
      if (data.contractId) setAdContractId(data.contractId);
      if (data.signToken) setAdContractToken(data.signToken);
      return data.link;
    } catch (error) {
      console.error("Error generating ad agreement link:", error);
      alert(`❌ ${error.message}`);
      return null;
    } finally {
      setIsGeneratingAdLink(false);
    }
  };

  const handleCopyAdLink = async () => {
    if (!generatedAdLink) return;
    try {
      // Sync the latest discount/coupon onto the contract BEFORE copying, so the
      // link the agent pastes/sends always reflects the coupon applied on this page.
      await syncAdContractDiscount();
      await navigator.clipboard.writeText(generatedAdLink);
      setAdLinkCopied(true);
      setTimeout(() => setAdLinkCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy link:", error);
    }
  };

  const handleSendAdLinkToUser = async () => {
    try {
      setIsSendingAdLink(true);
      let link = generatedAdLink;
      if (!link) {
        link = await handleGenerateAdLink();
        if (!link) return;
      }
      await syncAdContractDiscount();

      const nameParts = (customerInfo.name || '').split(' ');
      const greetingName = nameParts[0] ? ` ${nameParts[0]}` : '';
      const message = `Hi${greetingName}, please review and confirm your ad package here: ${link}`;

      const response = await fetch(`${API_BASE_URL}/twilio/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: customerInfo.phone, message })
      });
      if (!response.ok) throw new Error("Failed to send link");

      alert("✅ Link sent to the customer via text!");
    } catch (error) {
      console.error("Error sending ad agreement link:", error);
      alert("❌ Failed to send the link to the customer.");
    } finally {
      setIsSendingAdLink(false);
    }
  };

  const handlePreview = () => { window.print(); };
  const handleEditCart = () => { setShowEditCartModal(true); };
  const handleSaveCart = (updatedItems) => { setCartItems(updatedItems); };

  const persistInvoice = async () => {
    setIsSavingDraft(true);
    try {
      let userId = selectedUserId || null;
      if (userId == null && customerInfo.email) {
        try { userId = await createAccountIfNeeded(); } catch { userId = null; }
      }
      const payload = {
        invoiceId: currentInvoiceId,
        invoiceNumber: invoiceNumber || undefined,
        userId,
        phone: customerInfo.phone || '',
        name: customerInfo.name || '',
        email: customerInfo.email || '',
        subtotal,
        discountAmount,
        discountType,
        discountValue,
        discountDetails: buildDiscountDetails(),
        shippingCost,
        totalDue,
        amountDueNow,
        paymentType,
        notes: notes || '',
        items: cartItems,
        scheduledTexts: allTexts,
        scheduledEmails: allEmails,
      };

      const response = await fetch(`${API_BASE_URL}/invoices/create`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.message || "Failed to save draft");
      if (data.invoiceId && !currentInvoiceId) setCurrentInvoiceId(data.invoiceId);
      await syncAdContractDiscount();
      return data;
    } catch (error) {
      console.error('Autosave error:', error);
      throw error;
    } finally {
      setIsSavingDraft(false);
    }
  };

  // ── AUTOSAVE ────────────────────────────────────────────────────────────────
  // Persist customer details, cart, discounts, notes and totals automatically
  // whenever any of them change (debounced). The invoice is CREATED on the first
  // meaningful edit and UPDATED on every subsequent one — no Save button needed.
  // Scheduled messages are part of the autosave too — add, edit or remove them
  // and they persist automatically, no separate save action needed.
  const autosaveSignature = [
    currentInvoiceId || '',
    customerInfo.name, customerInfo.email, customerInfo.phone, customerInfo.company,
    selectedUserId || '',
    contactMode,
    invoiceNumber || '',
    subtotal,
    discountAmount,
    discountType,
    discountValue,
    buildDiscountDetails(),
    shippingCost,
    totalDue,
    amountDueNow,
    paymentType,
    notes,
    JSON.stringify(cartItems.map(i => [i.id, i.type, i.itemId, i.price, i.quantity, i.covers])),
    JSON.stringify(allTexts.map(s => [s.id, s.date || s.send_date, s.time || s.send_time, s.discount ?? s.discount_offered ?? 0, s.attach_pay_link ?? s.attachPayLink ?? false, (s.messageBody || s.message_body || '').length])),
    JSON.stringify(allEmails.map(s => [s.id, s.date || s.send_date, s.time || s.send_time, s.discount ?? s.discount_offered ?? 0, s.attach_pay_link ?? s.attachPayLink ?? false, (s.messageBody || s.message_body || '').length])),
  ].join('|');
  const hasContent = cartItems.length > 0 || scheduledTexts.length > 0 || scheduledEmails.length > 0 || dbSchedules.length > 0 || Boolean(customerInfo.email || customerInfo.phone || customerInfo.name || notes);

  useEffect(() => {
    if (!packagesLoaded) return;
    if (!restoreSettledRef.current) return;
    if (!currentInvoiceId && !hasContent) return;
    const t = setTimeout(() => {
      persistInvoice()
        .then(() => {
          setSavedBadge(true);
          setTimeout(() => setSavedBadge(false), 2000);
        })
        .catch((err) => {
          console.error('Autosave failed silently:', err);
        });
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosaveSignature, packagesLoaded, hasContent]);

  const handleEditSchedule = (item) => {
    const timeString = item.time || item.send_time;
    const cleanDate = getNormalizedDateString(item.date || item.send_date);

    setEditingScheduleId(item.id);
    const amts = item.discountAmounts;
    const fallbackDiscs = { listing: { type: 'flat', value: 0 }, membership: { type: 'flat', value: 0 }, ads: { type: 'flat', value: 0 } };
    setNewSchedule({
      date: cleanDate,
      time: typeof timeString === 'string' ? timeString.substring(0, 5) : timeString,
      discount: item.discount || item.discount_offered || 0,
      discountType: item.discountType || 'flat',
      discounts: item.discounts || (amts ? {
        listing: { type: 'flat', value: amts.listing || 0 },
        membership: { type: 'flat', value: amts.membership || 0 },
        ads: { type: 'flat', value: amts.ads || 0 },
      } : fallbackDiscs),
      messageBody: item.messageBody || item.message_body || '',
      attachPayLink: item.attachPayLink || item.attach_pay_link || false,
      offerExpiry: item.offerExpiry || null,
    });
    setShowScheduleModal(true);
  };

  // Opens a blank schedule in the same panel the Scheduled Messages section
  // uses. Shared by the "+ Add Text"/"+ Add Email" button and the
  // "+ Add Scheduled Discount" button in the discount editor, so both entry
  // points behave identically.
  const openNewScheduleModal = () => {
    setEditingScheduleId(null);
    setNewSchedule({
      date: getCurrentDate(),
      time: getCurrentTime(),
      discount: 0,
      discountType: 'flat',
      discounts: {
        listing: { type: 'flat', value: 0 },
        membership: { type: 'flat', value: 0 },
        ads: { type: 'flat', value: 0 },
      },
      messageBody: '',
      attachPayLink: false,
      offerExpiry: null,
    });
    setShowScheduleModal(true);
  };

  const handleSaveSchedule = async () => {
    if (!newSchedule.date || !newSchedule.time || !newSchedule.messageBody.trim()) { alert('⚠️ Please select a valid date, time, and enter a message.'); return; }

    // Persist the MONTHLY per-type figures. scheduleAdsAmounts re-applies the
    // payment term on read, so saving the resolved figure here would charge it
    // once per month squared.
    const discountAmounts = {
      listing: resolveNewSchedMonthly('listing'),
      membership: resolveNewSchedMonthly('membership'),
      ads: resolveNewSchedMonthly('ads'),
    };
    const finalDiscountAmount = Math.round((discountAmounts.listing + discountAmounts.membership + discountAmounts.ads) * 100) / 100;

    // discount_details carries the per-type amounts PLUS the typed percent/flat
    // config and the pre-formatted send stamp. The amounts alone cannot say whether
    // a figure came from a percentage or a flat entry, so without `meta` a restored
    // row loses its "10% off" label. The server writes this string verbatim
    // (invoiceController.js) and the loader reads all three parts back, so both
    // directions round-trip.
    const discountDetails = JSON.stringify({
      ...discountAmounts,
      meta: newSchedule.discounts || undefined,
      dateLabel: formatSendStamp(newSchedule.date, newSchedule.time),
    });

    let finalBody = newSchedule.messageBody;

    // 💡 IF A PAY LINK IS ATTACHED -> Embed the REAL link now, so scheduled
    // messages carry the SAME link that "Generate & Send Link" sends.
    //   Ads               -> ad agreement link
    //   Everything else   -> the CRM payment link (memberships/listings/physical)
    if (newSchedule.attachPayLink) {
      if (hasOnlyAds) {
        let link = generatedAdLink;
        if (!link) {
          link = await handleGenerateAdLink();
        }
        if (link) {
          finalBody = finalBody.replace('[Ad Agreement link will be generated automatically]', link);
        } else {
          // Failed to generate ad link, stop save
          return;
        }
      } else if (hasPhysical) {
        // Physical carts use the React cart link (no token minting).
        finalBody = finalBody.replace('[Secure payment link will be added automatically]', paymentLinkUrl);
      } else {
        // Digital (listings/memberships) -> mint separate hex-token links that
        // carry THIS schedule's per-type discount, so the embedded link shows
        // the scheduled discount when the customer opens it.
        let links = await generateCheckoutLinks({
          listingScheduledDiscount: discountAmounts.listing,
          membershipScheduledDiscount: discountAmounts.membership,
        });
        if (links && (links.listing || links.membership)) {
          // If the cart ALSO contains an ads package, generate its agreement
          // link too so the scheduled message carries every link.
          let adLink = null;
          if (hasAdItem && !hasOnlyAds) {
            adLink = generatedAdLink || (await handleGenerateAdLink());
          }
          const linksText = buildCombinedLinksText({
            listing: links.listing,
            membership: links.membership,
            ad: adLink,
          });
          // If the schedule toggle already embedded a real-link block earlier
          // (possibly without the ads link), replace that whole block with a
          // fresh one; otherwise replace the placeholder.
          if (/Secure Payment Link:\s*(Listing link:|Membership Link:)/.test(finalBody)) {
            finalBody = finalBody.replace(/(\n\n)?Secure Payment Link:\s*Listing link:[\s\S]*$/m, `\n\nSecure Payment Link: ${linksText}`);
          } else {
            finalBody = finalBody.replace('[Secure payment link will be added automatically]', linksText);
          }
        }
      }
    }

    const newItem = {
      id: editingScheduleId || Date.now(),
      message_type: messageTab === 'texts' ? 'sms' : 'email',
      date: newSchedule.date,
      time: newSchedule.time,
      discount: finalDiscountAmount,
      discountType: newSchedule.discountType,
      discounts: newSchedule.discounts,
      discountAmounts,
      discountDetails,
      messageBody: finalBody.trim(),
      attachPayLink: newSchedule.attachPayLink || false,
      payLinkAmount: newSchedule.attachPayLink ? amountDueNow : null,
      pay_link_amount: newSchedule.attachPayLink ? amountDueNow : null,
      attach_pay_link: newSchedule.attachPayLink || false,
      offerExpiry: newSchedule.offerExpiry || null,
    };

    if (editingScheduleId) {
      if (dbSchedules.some(s => s.id === editingScheduleId)) {
        setDbSchedules(dbSchedules.map(s =>
          s.id === editingScheduleId
            ? {
              ...s,
              send_date: newItem.date,
              send_time: newItem.time,
              discount_offered: newItem.discount,
              discountType: newItem.discountType,
              discounts: newItem.discounts,
              discountAmounts: newItem.discountAmounts,
              discountDetails: newItem.discountDetails,
              message_body: newItem.messageBody,
              attach_pay_link: newItem.attachPayLink,
              pay_link_amount: newItem.payLinkAmount,
            }
            : s
        ));
      } else if (messageTab === 'texts') {
        setScheduledTexts(prev => prev.map(s => s.id === editingScheduleId ? newItem : s));
      } else {
        setScheduledEmails(prev => prev.map(s => s.id === editingScheduleId ? newItem : s));
      }
    } else {
      if (messageTab === 'texts') {
        setScheduledTexts(prev => [...prev, newItem]);
      } else {
        setScheduledEmails(prev => [...prev, newItem]);
      }
    }

    setShowScheduleModal(false);
    setEditingScheduleId(null);
    setNewSchedule({ date: getCurrentDate(), time: getCurrentTime(), discount: 0, discountType: 'flat', discounts: { listing: { type: 'flat', value: 0 }, membership: { type: 'flat', value: 0 }, ads: { type: 'flat', value: 0 } }, messageBody: '', attachPayLink: false, offerExpiry: null });

    // Persistence happens automatically via the debounced autosave.
  };

  const handleRemoveSchedule = async (id, isFromDb) => {
    if (!window.confirm('Are you sure you want to cancel this scheduled message?')) return;

    if (isFromDb) {
      setDbSchedules(prev => prev.filter(item => item.id !== id));
    } else {
      setScheduledTexts(prev => prev.filter(item => item.id !== id));
      setScheduledEmails(prev => prev.filter(item => item.id !== id));
    }

    // The deletion is persisted automatically via the debounced autosave.
  };

  const avatarLetter = customerInfo.name ? customerInfo.name.charAt(0).toUpperCase() : '?';

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

  const filteredCustomerResults = systemUsers.filter(u =>
    u.name?.toLowerCase().includes(customerSearchTerm?.toLowerCase() || '') ||
    u.email?.toLowerCase().includes(customerSearchTerm?.toLowerCase() || '') ||
    u.phone?.includes(customerSearchTerm || '')
  );

  const handleSelectCustomer = (u) => {
    setCustomerInfo(prev => ({
      ...prev,
      name: u.name || '',
      email: u.email || '',
      phone: u.phone || '',
      company: u.company || '',
    }));
    setSelectedUserId(u.id);
    setContactMode('existing');
    setShowChangeCustomerDropdown(false);
    setCustomerSearchTerm('');
  };

  const createAccountIfNeeded = async () => {
    if (selectedUserId || contactMode !== 'new') return selectedUserId;
    const nameParts = (customerInfo.name || '').trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    if (!firstName || !lastName || !customerInfo.email) {
      throw new Error('Please fill in First Name, Last Name, and Email to create an account.');
    }
    try {
      const response = await fetch(`${API_BASE_URL}/users/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: customerInfo.phone,
          firstName,
          lastName,
          businessName: customerInfo.company || '',
          email: customerInfo.email,
          agentId: 1,
          selectedVehicles: [],
          selectedProducts: [],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to create account');
      if (data.userId) setSelectedUserId(data.userId);
      return data.userId;
    } catch (error) {
      throw new Error(error.message || 'Failed to create account');
    }
  };

  const handleCreateAccountNow = async () => {
    setIsCreatingAccount(true);
    try {
      await createAccountIfNeeded();
      setContactMode('existing');
      setShowChangeCustomerDropdown(false);
      alert('✅ Account created successfully!');
    } catch (error) {
      console.error("Error creating account:", error);
      alert(`❌ ${error.message}`);
    } finally {
      setIsCreatingAccount(false);
    }
  };

  const leadStatusStyle = (status) => {
    const map = {
      Intake: { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe', icon: '🔵' },
      Qualified: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0', icon: '✅' },
      Converted: { bg: '#fefce8', color: '#b45309', border: '#fde68a', icon: '⭐' },
      Lost: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', icon: '❌' },
      'Not Qualified': { bg: '#f9fafb', color: '#6b7280', border: '#e5e7eb', icon: '➖' },
    };
    return map[status] || map['Not Qualified'];
  };

  const handleCallCustomer = async () => {
    if (!customerInfo.phone) return alert("⚠️ No phone number available for this customer.");
    try {
      const response = await fetch(`${API_BASE_URL}/twilio/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadPhone: customerInfo.phone })
      });
      if (!response.ok) throw new Error("Call failed");
      alert(`📞 Ringing your phone now! Please pick up to connect to ${customerInfo.phone}.`);
    } catch (error) {
      console.error("Call error:", error);
      alert("❌ Failed to initiate the call. Check console for details.");
    }
  };

  const handleTextCustomer = async () => {
    if (!customerInfo.phone) return alert("⚠️ No phone number available for this customer.");
    const message = window.prompt(`Enter the SMS message to send to ${customerInfo.name || customerInfo.phone}:`);
    if (!message || !message.trim()) return;
    try {
      const response = await fetch(`${API_BASE_URL}/twilio/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: customerInfo.phone, message: message.trim() })
      });
      if (!response.ok) throw new Error("Send failed");
      alert(`✅ SMS sent successfully to ${customerInfo.phone}!`);
    } catch (error) {
      console.error("Send error:", error);
      alert("❌ Failed to send SMS.");
    }
  };

  return (
    <>
      <CrmQuickNav />
      <div style={{ backgroundColor: '#f3f4f6', minHeight: '100vh', padding: '16px', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" }}>
        <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        input, select, textarea, button { font-family: inherit; }

        .ci-wrap { max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }

        /* HEADER */
        .ci-header { display: flex; justify-content: space-between; align-items: center; padding: 4px 0 12px; flex-wrap: wrap; gap: 10px; }
        .ci-mobile-header { display: none; align-items: center; padding: 6px 0 14px; position: relative; }
        .ci-back, .ci-mobile-back { background: none; border: none; font-size: 14px; font-weight: 700; color: #2563eb; cursor: pointer; display: flex; align-items: center; gap: 5px; padding: 0; }
        .ci-back:hover, .ci-mobile-back:hover { color: #1d4ed8; }
        .ci-title { font-size: 18px; font-weight: 700; color: #111827; display: flex; align-items: center; gap: 10px; margin: 0; }
        .ci-draft-pill { font-size: 11px; background: #e5e7eb; color: #374151; padding: 3px 8px; border-radius: 6px; font-weight: 600; }
        .ci-header-btns { display: flex; gap: 8px; align-items: center; }
        .ci-mobile-title-block { position: absolute; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; pointer-events: none; }
        .ci-mobile-inv-label { font-size: 11px; font-weight: 600; color: #6b7280; letter-spacing: 0.05em; text-transform: uppercase; }
        .ci-mobile-inv-num { font-size: 17px; font-weight: 800; color: #111827; }
        .ci-mobile-draft-pill { font-size: 10px; background: #e5e7eb; color: #374151; padding: 2px 7px; border-radius: 5px; font-weight: 700; margin-top: 3px; }

        /* BUTTONS */
        .btn-ghost { background: white; border: 1px solid #d1d5db; color: #374151; padding: 7px 14px; border-radius: 7px; font-weight: 600; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px; white-space: nowrap; }
        .btn-ghost:hover { background: #f9fafb; }
        .btn-primary { background: #2563eb; color: white; border: none; padding: 7px 14px; border-radius: 7px; font-weight: 600; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px; white-space: nowrap; }
        .btn-primary:hover { background: #1d4ed8; }
        .btn-primary:disabled, .btn-ghost:disabled { opacity: 0.6; cursor: not-allowed; }

        /* GRID */
        .ci-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 20px; align-items: start; }
        @media (max-width: 900px) { .ci-grid { grid-template-columns: 1fr; } }

        /* PANEL */
        .ci-panel { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px 20px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
        .ci-panel:last-child { margin-bottom: 0; }
        .ci-panel-hdr { display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; }
        .ci-panel-title { font-size: 15px; font-weight: 700; color: #111827; display: flex; align-items: center; gap: 8px; margin: 0; flex-wrap: wrap; }
        .ci-chevron { font-size: 12px; color: #6b7280; transition: transform 0.2s; flex-shrink: 0; }
        .ci-chevron.open { transform: rotate(180deg); }

        /* CUSTOMER */
        .cust-row { display: flex; align-items: flex-start; gap: 14px; margin-top: 16px; }
        .cust-avatar { width: 44px; height: 44px; min-width: 44px; background: #16a34a; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700; }
        .cust-name { font-size: 15px; font-weight: 700; color: #111827; }
        .cust-contacts { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 10px; font-size: 13px; color: #374151; }
        .cust-contact-item { display: flex; align-items: center; gap: 5px; }
        .cust-edit-btn { border: 1px solid #e5e7eb; background: white; color: #2563eb; font-size: 12px; font-weight: 600; padding: 6px 13px; border-radius: 7px; cursor: pointer; display: flex; align-items: center; gap: 5px; white-space: nowrap; transition: background 0.15s; }
        .cust-edit-btn:hover { background: #eff6ff; border-color: #bfdbfe; }

        /* TABLE */
        .item-tbl { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 14px; }
        .item-tbl th { color: #6b7280; font-weight: 500; padding: 0 8px 10px 0; border-bottom: 1px solid #e5e7eb; white-space: nowrap; }
        .item-tbl th:last-child, .item-tbl td:last-child { text-align: right; padding-right: 0; }
        .item-tbl td { padding: 13px 8px 13px 0; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
        .item-name { font-weight: 600; color: #111827; margin-bottom: 2px; }
        .item-desc { color: #9ca3af; font-size: 12px; }
        .qty-ctrl { display: flex; flex-direction: column; align-items: center; border: 1px solid #d1d5db; border-radius: 6px; overflow: hidden; width: 44px; }
        .qty-num { font-size: 13px; font-weight: 600; color: #111827; padding: 0; height: 28px; line-height: 28px; text-align: center; width: 100%; background: white; border: none; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; outline: none; }
        .qty-btn { background: #f9fafb; border: none; cursor: pointer; font-size: 9px; color: #6b7280; width: 100%; padding: 2px 0; line-height: 1; }
        .qty-btn:hover { background: #f3f4f6; }

        /* SUBTOTAL */
        .items-footer { display: flex; justify-content: flex-end; margin-top: 16px; }
        .subtotal-box { min-width: 220px; font-size: 13px; }
        .sub-row { display: flex; justify-content: space-between; margin-bottom: 8px; color: #4b5563; }
        .sub-row span:last-child { font-weight: 500; color: #111827; }
        .sub-row.green-txt { color: #16a34a; }
        .sub-row.green-txt span:last-child { color: #16a34a; }
        .sub-row.total-row { font-size: 14px; font-weight: 700; color: #111827; border-top: 1px solid #e5e7eb; padding-top: 10px; margin-top: 4px; margin-bottom: 0; }

        /* MESSAGES */
        .msg-tabs { display: flex; gap: 20px; border-bottom: 1px solid #e5e7eb; margin-top: 14px; }
        .msg-tab { font-size: 13px; font-weight: 600; padding-bottom: 10px; cursor: pointer; color: #6b7280; border-bottom: 2px solid transparent; margin-bottom: -1px; }
        .msg-tab.active { color: #2563eb; border-bottom-color: #2563eb; }
        .view-all-link { color: #2563eb; font-size: 13px; font-weight: 600; text-decoration: none; display: inline-block; margin-top: 12px; }

        /* PAYMENT LINK */
        .pl-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
        @media (max-width: 480px) { .pl-grid { grid-template-columns: 1fr; } }
        .pl-label { font-size: 12px; font-weight: 600; color: #374151; display: block; margin-bottom: 5px; }
        .pl-select, .pl-input { width: 100%; padding: 9px 12px; border: 1px solid #d1d5db; border-radius: 7px; font-size: 13px; color: #111827; outline: none; background: white; }
        .pl-select:focus, .pl-input:focus { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,0.1); }
        .pl-textarea { width: 100%; padding: 9px 12px; border: 1px solid #d1d5db; border-radius: 7px; font-size: 13px; color: #111827; outline: none; resize: vertical; min-height: 80px; }

        /* RIGHT COLUMN */
        .inv-summary-rows { font-size: 13px; margin-top: 14px; }
        .summary-row { display: flex; justify-content: space-between; align-items: center; padding: 9px 0; font-size: 13px; }
.summary-row:not(:last-child) { border-bottom: 1px dashed #f0f1f3; }
.summary-label { color: #4b5563; }
.summary-input-wrap { position: relative; display: flex; align-items: center; }
.summary-input-wrap .cur { position: absolute; left: 9px; color: #9ca3af; font-size: 12px; pointer-events: none; }
.summary-value-input { width: 90px; text-align: right; border: 1px solid #e5e7eb; border-radius: 6px; padding: 6px 8px 6px 20px; font-size: 13px; font-weight: 600; color: #111827; outline: none; transition: border-color .15s, box-shadow .15s; }
.summary-value-input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
.summary-reset { margin-left: 6px; color: #9ca3af; cursor: pointer; font-size: 11px; }
.summary-reset:hover { color: #dc2626; }

.summary-row.discount { color: #dc2626; }
.summary-row.discount .summary-label { color: #b91c1c; font-weight: 600; font-size: 12.5px; }
.summary-row.discount .summary-amt { color: #dc2626; font-weight: 700; }

.summary-total-row { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding: 14px 16px; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 10px; }
.summary-total-row .summary-label { font-size: 15px; font-weight: 800; color: #111827; }
.summary-total-input { width: 105px; text-align: right; font-size: 15px; font-weight: 800; padding: 7px 8px 7px 22px; border: 1.5px solid #bbf7d0; border-radius: 8px; background: #f0fdf4; color: #111827; outline: none; }
.summary-total-input:focus { border-color: #16a34a; box-shadow: 0 0 0 3px rgba(22,163,74,0.12); }
        .sr { display: flex; justify-content: space-between; margin-bottom: 9px; color: #4b5563; }
        .sr span:last-child { font-weight: 500; color: #111827; }
        .sr.green { color: #16a34a; }
        .sr.green span:last-child { color: #16a34a; }
        .sr.total { font-size: 16px; font-weight: 700; color: #111827; border-top: 1.5px solid #e5e7eb; padding-top: 12px; margin-top: 4px; margin-bottom: 0; }
        .deposit-taken-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 13px 15px; margin: 14px 0; }
        .dt-row { display: flex; justify-content: space-between; font-size: 13px; font-weight: 700; color: #16a34a; margin-bottom: 3px; }
        .dt-meta { font-size: 12px; color: #4b5563; margin-bottom: 6px; }
        .dt-link { font-size: 12px; color: #2563eb; text-decoration: none; font-weight: 600; }
        .remaining-row { display: flex; justify-content: space-between; font-size: 15px; font-weight: 700; color: #2563eb; margin-top: 4px; }

        /* RADIO BOXES */
        .radio-box { border: 1.5px solid #e5e7eb; border-radius: 9px; padding: 14px; margin-bottom: 10px; cursor: pointer; transition: border-color 0.15s, background 0.15s; }
        .radio-box.active { border-color: #2563eb; background: #eff6ff; }
        .radio-box:last-of-type { margin-bottom: 0; }
        .rb-header { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: #111827; }
        .rb-header input[type=radio] { accent-color: #2563eb; width: 15px; height: 15px; }
        .rb-desc { font-size: 12px; color: #6b7280; margin-top: 3px; margin-left: 23px; }
        .deposit-fields { display: flex; gap: 10px; align-items: flex-end; margin: 12px 0 0 23px; flex-wrap: wrap; }
        .dep-field { flex: 1; min-width: 100px; }
        .dep-label { font-size: 11px; color: #6b7280; font-weight: 600; display: block; margin-bottom: 4px; }
        .dep-inp-wrap { position: relative; }
        .dep-inp-wrap span { position: absolute; top: 50%; transform: translateY(-50%); color: #6b7280; font-size: 13px; }
        .dep-inp-wrap span.prefix { left: 10px; }
        .dep-inp-wrap span.suffix { right: 10px; }
        .dep-input { width: 100%; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 7px; font-size: 13px; color: #111827; outline: none; }
        .dep-input.has-prefix { padding-left: 24px; }
        .dep-input.has-suffix { padding-right: 30px; text-align: right; }
        .dep-input:focus { border-color: #2563eb; }
        .amount-due-row { display: flex; justify-content: space-between; align-items: center; padding: 14px 0 0; border-top: 1px solid #e5e7eb; margin-top: 14px; font-size: 15px; font-weight: 700; color: #111827; }

        /* PAYMENT */
        .pm-top { display: flex; justify-content: space-between; align-items: center; font-size: 13px; margin: 14px 0 10px; }
        .pm-top span:first-child { color: #4b5563; font-weight: 600; }
        .pm-top span:last-child { color: #2563eb; font-weight: 600; cursor: pointer; }
        .card-default-wrap { background: #f9fafb; border: 1px solid #d1d5db; border-radius: 8px; padding: 11px 14px; display: flex; justify-content: space-between; align-items: center; font-size: 14px; margin-bottom: 8px; }
        .card-default-wrap .card-label { font-weight: 600; color: #111827; }
        .card-default-wrap .card-right { display: flex; align-items: center; gap: 10px; font-size: 12px; color: #6b7280; }
        .stored-card { display: flex; justify-content: space-between; align-items: center; padding: 11px 14px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 8px; font-size: 13px; color: #374151; }
        .card-badge { font-size: 11px; background: #f3f4f6; padding: 2px 8px; border-radius: 12px; color: #374151; }
        .card-menu { color: #9ca3af; cursor: pointer; font-size: 16px; }
        .btn-charge { width: 100%; background: #2563eb; color: white; padding: 13px; border-radius: 8px; border: none; font-size: 15px; font-weight: 700; margin-top: 14px; cursor: pointer; transition: background 0.15s; }
        .btn-charge:hover { background: #1d4ed8; }
        .btn-charge:disabled { opacity: 0.6; cursor: not-allowed; }
        .secure-note { text-align: center; font-size: 11px; color: #9ca3af; margin-top: 10px; }

        /* CONTACT ACTIONS */
        .contact-action-btn { width: 100%; display: flex; align-items: center; gap: 12px; padding: 13px 20px; border: none; background: transparent; font-size: 14px; color: #374151; font-weight: 500; cursor: pointer; border-bottom: 1px solid #f3f4f6; transition: background 0.1s; text-align: left; }
        .contact-action-btn:last-child { border-bottom: none; }
        .contact-action-btn:hover { background: #f9fafb; }

        /* NOTES */
        .notes-textarea { width: 100%; border: none; outline: none; resize: none; font-size: 14px; color: #4b5563; font-family: inherit; margin-top: 12px; }

        /* MOBILE FOOTER BAR */
        .ci-footer-bar { display: none; background: white; border-top: 1px solid #e5e7eb; padding: 12px 16px; position: sticky; bottom: 0; z-index: 100; }

        /* btn-gen-link */
        .btn-gen-link { width: 100%; background: white; border: 1.5px solid #059669; color: #059669; padding: 10px; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .btn-gen-link:hover { background: #f0fdf4; }
        .btn-gen-link:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-send-link { background: #059669; color: #ffffff !important; box-shadow: 0 3px 10px rgba(5, 150, 105, 0.35); }
        .btn-send-link:hover { background: #047857; }
        .btn-send-link:disabled { opacity: 0.6; cursor: not-allowed; }

        /* SAVED BADGE */
        .saved-badge { background: #f0fdf4; border: 1px solid #bbf7d0; color: #16a34a; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 20px; display: flex; align-items: center; gap: 4px; animation: fadeInOut 2.5s forwards; }
        @keyframes fadeInOut { 0% { opacity: 0; transform: scale(0.9); } 15% { opacity: 1; transform: scale(1); } 80% { opacity: 1; } 100% { opacity: 0; } }

        /* MOBILE FLOATING TOAST */
        .mobile-toast { display: none; position: fixed; bottom: 70px; left: 50%; transform: translateX(-50%); background: #f0fdf4; border: 1px solid #bbf7d0; color: #16a34a; font-size: 13px; font-weight: 700; padding: 8px 16px; border-radius: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 1000; align-items: center; gap: 6px; animation: fadeUpOut 2.5s forwards; white-space: nowrap; }
        @keyframes fadeUpOut { 0% { opacity: 0; transform: translate(-50%, 15px); } 15% { opacity: 1; transform: translate(-50%, 0); } 80% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, -15px); } }

        /* TABLE responsive: hide Seat Covers on small */
        @media (max-width: 600px) {
          .ci-header { display: none; }
          .ci-mobile-header { display: flex; }
          .ci-grid { grid-template-columns: 1fr; }
          .ci-footer-bar { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
          .ci-footer-bar .btn-preview { background: white; border: 1px solid #d1d5db; color: #374151; font-weight: 600; font-size: 14px; padding: 10px 14px; border-radius: 7px; cursor: pointer; display: flex; align-items: center; gap: 5px; white-space: nowrap; }
          .ci-footer-bar .btn-save-draft { background: none; border: 1px solid #d1d5db; color: #374151; font-weight: 600; font-size: 14px; padding: 10px 14px; border-radius: 7px; cursor: pointer; white-space: nowrap; }
          .ci-footer-bar .btn-send { background: #2563eb; color: white; border: none; font-weight: 700; font-size: 14px; padding: 11px 18px; border-radius: 7px; cursor: pointer; display: flex; align-items: center; gap: 5px; white-space: nowrap; }
          .cust-avatar { background: #16a34a !important; }
          .ci-panel-title { font-size: 16px; }
          .cust-name { font-size: 16px; }
          .item-tbl { font-size: 14px; }
          .item-tbl th { font-size: 11px; padding: 0 6px 8px 0; }
          .item-tbl td { padding: 10px 6px 10px 0; }
          .item-name { font-size: 14px; }
          .items-footer { flex-direction: column; align-items: stretch; }
          .subtotal-box { width: 100%; min-width: unset; font-size: 15px; }
          .sr { font-size: 14px; }
          .sr.total { font-size: 17px; }
          .ci-panel { padding: 16px; }
          .deposit-fields { margin-left: 0; }
          .mobile-toast { display: flex; }
          .cust-contacts { font-size: 14px; }
          .cust-edit-btn { font-size: 13px; padding: 8px 14px; }
          .radio-box { padding: 12px; }
          .rb-header { font-size: 15px; }
          .inv-summary-rows { font-size: 14px; }
          .amount-due-row { font-size: 16px; }
          .btn-charge { font-size: 16px; padding: 15px; }
          .pl-label { font-size: 13px; }
          .pl-select, .pl-input { font-size: 15px; padding: 11px 12px; }
          .pl-textarea { font-size: 15px; }
          .dt-row { font-size: 14px; }
          .dt-meta { font-size: 13px; }
          .remaining-row { font-size: 16px; }
          .cust-contact-item { font-size: 14px; }
          .notes-textarea { font-size: 15px; }
          .btn-ghost { font-size: 14px; padding: 9px 14px; }
          .btn-primary { font-size: 14px; padding: 9px 14px; }
          .btn-gen-link { font-size: 15px; padding: 12px; }
          .modal-box { max-width: 100%; margin: 0 8px; padding: 24px 20px; }
          .modal-title { font-size: 18px; }
          .modal-desc { font-size: 14px; }
        }

        @media (max-width: 420px) {
          .cust-contacts { gap: 8px; flex-wrap: wrap; }
          .ci-panel { padding: 12px; }
          .hide-on-mobile { display: none !important; }
          .item-tbl th, .item-tbl td { padding-right: 4px; }
          .item-tbl th:last-child, .item-tbl td:last-child { padding-right: 0; }
        }
        /* MODAL */
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 16px; }
        .modal-overlay input, .modal-overlay textarea, .modal-overlay select { touch-action: manipulation; }
        .modal-box { background: white; padding: 28px 24px; border-radius: 14px; width: 100%; max-width: 380px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.15); }
        .modal-icon { font-size: 36px; margin-bottom: 10px; }
        .modal-title { font-size: 17px; font-weight: 700; color: #111827; margin: 0 0 10px; }
        .modal-desc { color: #6b7280; font-size: 13px; line-height: 1.6; margin-bottom: 22px; }
        .modal-btns { display: flex; gap: 10px; }
        .modal-btns .btn-ghost { flex: 1; justify-content: center; }
        .modal-btns .btn-primary { flex: 1; justify-content: center; }

        /* PAY LINK TOGGLE */
        .pay-link-toggle { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-radius: 10px; cursor: pointer; transition: all 0.15s; }
        .pay-link-toggle:hover { opacity: 0.9; }
        .toggle-pill { width: 42px; height: 24px; border-radius: 12px; position: relative; transition: background 0.2s; flex-shrink: 0; }
        .toggle-knob { position: absolute; top: 3px; width: 18px; height: 18px; border-radius: 50%; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.2); transition: left 0.2s; }
      `}</style>

        {/* EDIT CUSTOMER MODAL */}
        {showEditCustomer && (
          <EditCustomerModal
            customerInfo={customerInfo}
            onSave={handleSaveCustomer}
            onClose={() => setShowEditCustomer(false)}
          />
        )}

        {/* MULTI-STEP SEND CONFIRMATION MODAL */}
        {sendModalState !== 'closed' && (
          <div className="modal-overlay">
            <div className="modal-box">

              {sendModalState === 'options' && (
                <>
                  <div className="modal-icon">📤</div>
                  <h3 className="modal-title">Send Invoice</h3>
                  <p className="modal-desc">
                    How would you like to send invoice <strong>{invoiceNumber}</strong> to <strong>{customerInfo.name || 'this customer'}</strong>?
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                    <button
                      onClick={() => { setLinkIncludeTypes(defaultLinkIncludeTypes); setSendModalState('confirm-sms'); }}
                      style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '12px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                      <span style={{ fontSize: '18px' }}>📱</span> Text Customer (SMS)
                    </button>
                    <button
                      onClick={() => { setLinkIncludeTypes(defaultLinkIncludeTypes); setSendModalState('confirm-email'); }}
                      style={{ background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe', padding: '12px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                      <span style={{ fontSize: '18px' }}>✉️</span> Email Customer
                    </button>
                    <button
                      onClick={handleCopyPaymentLink}
                      style={{ background: linkCopied ? '#f0fdf4' : '#f9fafb', color: linkCopied ? '#16a34a' : '#374151', border: `1px solid ${linkCopied ? '#bbf7d0' : '#e5e7eb'}`, padding: '12px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.15s' }}
                    >
                      <span style={{ fontSize: '18px' }}>{linkCopied ? '✅' : '🔗'}</span> {linkCopied ? 'Link Copied!' : 'Copy Payment Link'}
                    </button>
                  </div>
                  <div className="modal-btns">
                    <button className="btn-ghost" onClick={() => setSendModalState('closed')} disabled={isSubmitting} style={{ width: '100%' }}>Cancel</button>
                  </div>
                </>
              )}

              {(sendModalState === 'confirm-sms' || sendModalState === 'confirm-email') && (
                <>
                  <div className="modal-icon">📄</div>
                  <h3 className="modal-title">Confirm Send</h3>
                  <p className="modal-desc">
                    Are you sure you want to send invoice <strong>{invoiceNumber}</strong> via <strong>{sendModalState === 'confirm-sms' ? 'Text (SMS)' : 'Email'}</strong> to <strong>{customerInfo.name || 'this customer'}</strong>?
                  </p>
                  {availableLinkTypes.length >= 2 && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>INCLUDE LINKS IN MESSAGE</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {availableLinkTypes.map(t => {
                          const checked = linkIncludeTypes[t.key] !== false;
                          return (
                            <div
                              key={t.key}
                              onClick={() => setLinkIncludeTypes(prev => ({ ...prev, [t.key]: checked ? false : true }))}
                              style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${checked ? '#2563eb' : '#e5e7eb'}`, background: checked ? '#eff6ff' : '#f9fafb', transition: 'all 0.15s' }}
                            >
                              <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, background: checked ? '#2563eb' : '#ffffff', border: `1.5px solid ${checked ? '#2563eb' : '#d1d5db'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {checked && <span style={{ color: '#ffffff', fontSize: 12, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                              </div>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{t.label} Link</span>
                              <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: checked ? '#2563eb' : '#9ca3af' }}>
                                {checked ? 'Added to message' : 'Removed from message'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="modal-btns">
                    <button className="btn-ghost" onClick={() => setSendModalState('options')} disabled={isSubmitting}>← Back</button>
                    <button className="btn-primary" onClick={() => handleConfirmCreate(sendModalState === 'confirm-sms' ? 'sms' : 'email')} disabled={isSubmitting}>
                      {isSubmitting ? 'Sending...' : 'Yes, Send It'}
                    </button>
                  </div>
                </>
              )}

            </div>
          </div>
        )}

        {/* ADD/EDIT SCHEDULE MODAL */}
        {showScheduleModal && (
          <div className="modal-overlay">
            <div className="modal-box" style={{ maxWidth: 420, textAlign: 'left', maxHeight: '90vh', overflowY: 'auto' }}>
              <h3 className="modal-title" style={{ marginBottom: 20 }}>
                {editingScheduleId ? 'Edit Scheduled' : 'Schedule New'} {messageTab === 'texts' ? 'Text' : 'Email'}
              </h3>

              {/* DATE & TIME */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>DATE</label>
                  <input type="date" value={newSchedule.date} onChange={e => setNewSchedule({ ...newSchedule, date: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 8, outline: 'none', fontSize: 16 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>TIME</label>
                  <input type="time" value={newSchedule.time} onChange={e => setNewSchedule({ ...newSchedule, time: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 8, outline: 'none', fontSize: 16 }} />
                </div>
              </div>

              {/* MESSAGE CONTENT */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>MESSAGE CONTENT</label>
                <textarea
                  value={newSchedule.messageBody}
                  onChange={e => setNewSchedule({ ...newSchedule, messageBody: e.target.value })}
                  placeholder={`Type your custom ${messageTab === 'texts' ? 'SMS' : 'Email'} message here...`}
                  style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 8, outline: 'none', minHeight: '80px', fontFamily: 'inherit', fontSize: 16, resize: 'vertical' }}
                />
              </div>

              {/* DISCOUNTS */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>DISCOUNTS (OPTIONAL)</label>
                {['listing', 'membership', 'ads'].filter(key => {
                  if (key === 'listing') return cartItems.some(i => i.type === 'L');
                  if (key === 'membership') return cartItems.some(i => i.type === 'M');
                  return hasAdItem;
                }).map(key => {
                  const label = key === 'listing' ? 'Listings' : key === 'membership' ? 'Memberships' : 'Ads';
                  const cfg = (newSchedule.discounts || {})[key] || { type: 'flat', value: 0 };
                  const rowAmount = resolveNewSchedAmount(key);
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', width: 78, flexShrink: 0 }}>{label}</span>
                      <div
                        onClick={() => setNewSchedule(prev => {
                          const discs = prev.discounts || {};
                          const current = discs[key] || { type: 'flat', value: 0 };
                          return { ...prev, discounts: { ...discs, [key]: { type: 'flat', value: current.value } } };
                        })}
                        style={{ padding: '5px 9px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: `1.5px solid ${cfg.type === 'flat' ? '#2563eb' : '#d1d5db'}`, background: cfg.type === 'flat' ? '#eff6ff' : '#f9fafb', color: cfg.type === 'flat' ? '#2563eb' : '#374151' }}
                      >$</div>
                      <div
                        onClick={() => setNewSchedule(prev => {
                          const discs = prev.discounts || {};
                          const current = discs[key] || { type: 'flat', value: 0 };
                          return { ...prev, discounts: { ...discs, [key]: { type: 'percent', value: current.value } } };
                        })}
                        style={{ padding: '5px 9px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: `1.5px solid ${cfg.type === 'percent' ? '#2563eb' : '#d1d5db'}`, background: cfg.type === 'percent' ? '#eff6ff' : '#f9fafb', color: cfg.type === 'percent' ? '#2563eb' : '#374151' }}
                      >%</div>
                      <input
                        type="number" min="0" step="0.01"
                        value={cfg.value}
                        onChange={e => setNewSchedule(prev => {
                          const discs = prev.discounts || {};
                          const current = discs[key] || { type: 'flat', value: 0 };
                          return { ...prev, discounts: { ...discs, [key]: { type: current.type, value: e.target.value } } };
                        })}
                        style={{ flex: 1, minWidth: 0, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, outline: 'none', fontSize: 15 }}
                      />
                      <span style={{ fontSize: 12, color: rowAmount > 0 ? '#2563eb' : '#9ca3af', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {rowAmount > 0 ? `-$${rowAmount.toFixed(2)}` : '$0.00'}
                      </span>
                    </div>
                  );
                })}
                {newSchedTotalDisc > 0 && (
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', marginTop: 2 }}>Total Scheduled Discount: -${newSchedTotalDisc.toFixed(2)}</div>
                )}
              </div>

              {/* RUNNING TOTAL */}
              <div style={{ marginBottom: 16, padding: '10px 13px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
                  Current Total After Previous Discounts: <strong>${runningTotal.toFixed(2)}</strong>
                </div>
                {newSchedTotalDisc > 0 && (
                  <div style={{ fontSize: 12, color: '#2563eb', fontWeight: 600, marginTop: 4 }}>
                    New Total After This Discount: <strong>${Math.max(0, runningTotal - newSchedTotalDisc).toFixed(2)}</strong>
                  </div>
                )}
              </div>

              {/* 24-HOUR OFFER TOGGLE */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>LIMITED TIME OFFER</label>
                <div
                  onClick={() => {
                    setNewSchedule(prev => {
                      const willOffer = !prev.offerExpiry;
                      let updatedBody = prev.messageBody || '';
                      const OFFER_TEXT = '\n\n⏰ This offer is valid for the next 24 hours. Hurry, offer expires soon!';
                      if (willOffer) {
                        if (!updatedBody.includes('24 hours')) {
                          updatedBody += OFFER_TEXT;
                        }
                      } else {
                        updatedBody = updatedBody.replace(OFFER_TEXT, '');
                      }
                      return {
                        ...prev,
                        offerExpiry: willOffer ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null,
                        messageBody: updatedBody,
                      };
                    });
                  }}
                  style={{
                    border: `1.5px solid ${newSchedule.offerExpiry ? '#2563eb' : '#e5e7eb'}`,
                    background: newSchedule.offerExpiry ? '#eff6ff' : '#f9fafb',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 14px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 22 }}>⏰</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>24-Hour Offer</div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                        Adds "Valid for 24 hours" text to message
                      </div>
                    </div>
                  </div>
                  <div
                    className="toggle-pill"
                    style={{ background: newSchedule.offerExpiry ? '#2563eb' : '#d1d5db' }}
                  >
                    <div
                      className="toggle-knob"
                      style={{ left: newSchedule.offerExpiry ? 21 : 3 }}
                    />
                  </div>
                </div>
              </div>

              {/* ATTACH PAYMENT LINK TOGGLE */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>ATTACH PAYMENT LINK</label>
                <div
                  className="pay-link-toggle"
                  onClick={async () => {
                    const willAttach = !newSchedule.attachPayLink;

                    if (!willAttach) {
                      setNewSchedule(prev => ({
                        ...prev,
                        attachPayLink: false,
                        messageBody: (prev.messageBody || '').replace(/Secure Payment Link:[\s\S]*$/, '').replace(/\s+$/, ''),
                      }));
                      return;
                    }

                    // Resolve the real link(s) to embed (generating them on demand)
                    // so the message body shows the actual URL the customer gets.
                    let linkToEmbed = null;
                    if (hasOnlyAds) {
                      let link = generatedAdLink;
                      if (!link) link = await handleGenerateAdLink();
                      linkToEmbed = link || AD_LINK_PLACEHOLDER;
                    } else if (hasPhysical) {
                      linkToEmbed = paymentLinkUrl;
                    } else {
                      let links = checkoutLinks;
                      if (!links.listing && !links.membership) {
                        links = await generateCheckoutLinks();
                      }
                      let adLink = null;
                      if (hasAdItem && !hasOnlyAds) {
                        adLink = generatedAdLink || (await handleGenerateAdLink());
                      }
                      linkToEmbed = links && (links.listing || links.membership)
                        ? buildCombinedLinksText({ listing: links.listing, membership: links.membership, ad: adLink })
                        : PAY_LINK_PLACEHOLDER;
                    }

                    setNewSchedule(prev => {
                      let updatedBody = prev.messageBody || '';
                      const appendText = updatedBody.trim()
                        ? `\n\nSecure Payment Link: ${linkToEmbed}`
                        : `Secure Payment Link: ${linkToEmbed}`;
                      if (!/Secure Payment Link:/.test(updatedBody)) {
                        updatedBody += appendText;
                      }
                      return { ...prev, attachPayLink: true, messageBody: updatedBody };
                    });
                  }}
                  style={{
                    border: `1.5px solid ${newSchedule.attachPayLink ? '#2563eb' : '#e5e7eb'}`,
                    background: newSchedule.attachPayLink ? '#eff6ff' : '#f9fafb',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 22 }}>🔗</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Include Payment Link</div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                        A secure pay link for <strong>${amountDueNow.toFixed(2)}</strong> will be appended to this message
                      </div>
                    </div>
                  </div>
                  {/* Toggle pill */}
                  <div
                    className="toggle-pill"
                    style={{ background: newSchedule.attachPayLink ? '#2563eb' : '#d1d5db' }}
                  >
                    <div
                      className="toggle-knob"
                      style={{ left: newSchedule.attachPayLink ? 21 : 3 }}
                    />
                  </div>
                </div>

                {/* Confirmation strip shown when toggled on */}
                {newSchedule.attachPayLink && (
                  <div style={{
                    marginTop: 8, padding: '10px 13px',
                    background: '#f0fdf4', border: '1px solid #bbf7d0',
                    borderRadius: 8, fontSize: 12, color: '#16a34a',
                    display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600,
                  }}>
                    {hasOnlyAds
                      ? <>✓ A secure Ads Agreement link for <strong>${adPackagePrice.toFixed(2)}</strong> will be generated automatically when this message is sent</>
                      : cartItems.some(i => i.type === 'P' || !i.type)
                        ? <>✓ Your cart link for <strong>${amountDueNow.toFixed(2)}</strong> will be included as-is</>
                        : <>✓ A secure payment link for <strong>${amountDueNow.toFixed(2)}</strong> will be generated automatically when this message is sent</>
                    }
                  </div>
                )}
              </div>

              <div className="modal-btns">
                <button className="btn-ghost" onClick={() => { setShowScheduleModal(false); setEditingScheduleId(null); setNewSchedule({ date: getCurrentDate(), time: getCurrentTime(), discount: 0, discountType: 'flat', discounts: { listing: { type: 'flat', value: 0 }, membership: { type: 'flat', value: 0 }, ads: { type: 'flat', value: 0 } }, messageBody: '', attachPayLink: false, offerExpiry: null }); }}>Cancel</button>
                <button className="btn-primary" onClick={handleSaveSchedule}>{editingScheduleId ? 'Update Schedule' : 'Add Schedule'}</button>
              </div>
            </div>
          </div>
        )}

        {/* MOBILE FLOATING TOAST */}
        {savedBadge && (
          <div className="mobile-toast">
            ✓ Progress saved
          </div>
        )}

        <div className="ci-wrap">

          {/* DESKTOP HEADER */}
          <div className="ci-header">
            <button className="ci-back" onClick={() => window.history.back()}>‹ Back</button>
            <h2 className="ci-title">
              Invoice #{invoiceNumber}
              <span className="ci-draft-pill">Draft</span>
            </h2>
            <div className="ci-header-btns">
              {savedBadge && <span className="saved-badge">✓ Progress saved</span>}
              <button className="btn-ghost" onClick={handleEditCart}>✏ Edit Cart</button>
              <button className="btn-ghost" onClick={handlePreview}>🔍 Preview</button>
              <button className="btn-primary" onClick={() => setSendModalState('options')} disabled={isSubmitting || isSavingDraft}>
                ✉ Send Invoice
              </button>
            </div>
          </div>

          {/* MOBILE HEADER */}
          <div className="ci-mobile-header">
            <button className="ci-mobile-back" onClick={() => window.history.back()}>‹ Back</button>
            <div className="ci-mobile-title-block">
              <span className="ci-mobile-inv-label">Invoice</span>
              <span className="ci-mobile-inv-num">#{invoiceNumber}</span>
              <span className="ci-mobile-draft-pill">Draft</span>
            </div>
          </div>

          <div className="ci-grid">

            {/* ===== LEFT ===== */}
            <div>

              {/* CUSTOMER PANEL */}
              <div className="ci-panel">
                <div className="ci-panel-hdr" onClick={() => toggleSection('customer')}>
                  <h3 className="ci-panel-title">👤 Customer</h3>
                  <span className={`ci-chevron ${!collapsedSections.customer ? 'open' : ''}`}>▲</span>
                </div>
                {!collapsedSections.customer && (
                  <>
                    <div className="cust-row">
                      <div className="cust-avatar">{avatarLetter}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="cust-name">{customerInfo.name} <span style={{ color: '#6b7280', fontWeight: 400, fontSize: 13 }}>(Buyer)</span></div>
                        {customerInfo.leadStatus ? (
                          <div style={{ marginTop: 5 }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              fontSize: 11, fontWeight: 700,
                              background: leadStatusStyle(customerInfo.leadStatus).bg,
                              color: leadStatusStyle(customerInfo.leadStatus).color,
                              border: `1px solid ${leadStatusStyle(customerInfo.leadStatus).border}`,
                              borderRadius: 20, padding: '2px 9px',
                            }}>
                              {leadStatusStyle(customerInfo.leadStatus).icon} {customerInfo.leadStatus}
                            </span>
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>No status assigned</div>
                        )}
                        {customerInfo.company && (
                          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>🏢 {customerInfo.company}</div>
                        )}
                      </div>
                    </div>

                    <div className="cust-contacts">
                      <span className="cust-contact-item">📞 {customerInfo.phone}</span>
                      <span className="cust-contact-item">💬 {customerInfo.phone}</span>
                    </div>

                    <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'stretch' }}>
                      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                        <div
                          onClick={() => { setContactMode('existing'); setShowChangeCustomerDropdown(prev => !prev); }}
                          style={{
                            border: `1.5px solid ${contactMode === 'existing' ? '#3b82f6' : '#e5e7eb'}`,
                            borderRadius: 8, padding: '8px 12px', cursor: 'pointer',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            background: contactMode === 'existing' ? '#f5f9ff' : '#fff', height: '100%', boxSizing: 'border-box',
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              Existing User{selectedUserId ? <span style={{ color: '#2563eb' }}> {customerInfo.name}</span> : ''}
                            </div>
                            {selectedUserId && customerInfo.email && (
                              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customerInfo.email}</div>
                            )}
                          </div>
                          <span style={{ color: '#9ca3af', fontSize: 12, flexShrink: 0 }}>{showChangeCustomerDropdown ? '▲' : '▼'}</span>
                        </div>

                        {showChangeCustomerDropdown && contactMode === 'existing' && (
                          <div style={{
                            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6,
                            background: 'white', border: '1px solid #e5e7eb',
                            borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                            zIndex: 50, maxHeight: 320, overflow: 'hidden',
                            display: 'flex', flexDirection: 'column',
                          }}>
                            <div style={{ padding: 10, borderBottom: '1px solid #f3f4f6' }}>
                              <input
                                type="text"
                                autoFocus
                                placeholder="Search by name, email, or phone..."
                                value={customerSearchTerm}
                                onChange={(e) => setCustomerSearchTerm(e.target.value)}
                                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                              />
                            </div>
                            <div style={{ overflowY: 'auto' }}>
                              {filteredCustomerResults.length === 0 ? (
                                <div style={{ padding: 14, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>No users found</div>
                              ) : (
                                filteredCustomerResults.map((u, i) => {
                                  const colors = getUserColor(i);
                                  return (
                                    <div
                                      key={u.id}
                                      onClick={() => handleSelectCustomer(u)}
                                      style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '10px 12px', cursor: 'pointer',
                                        borderBottom: '1px solid #f3f4f6',
                                      }}
                                      onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                                      onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                                    >
                                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: colors.bg, color: colors.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                                        {getUserInitials(u.name)}
                                      </div>
                                      <div style={{ overflow: 'hidden' }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</div>
                                        <div style={{ fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email || u.phone}</div>
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => { setContactMode('new'); setShowChangeCustomerDropdown(false); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
                          border: contactMode === 'new' ? '1.5px solid #10b981' : '1.5px solid #d1d5db',
                          background: contactMode === 'new' ? '#f0fdf4' : '#fff',
                          color: contactMode === 'new' ? '#047857' : '#374151',
                          fontWeight: 600, fontSize: 13, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
                        }}
                      >
                        <span style={{ fontSize: 17, lineHeight: 1, marginTop: -2 }}>+</span> Add User
                      </button>
                    </div>

                    {contactMode === 'new' && (
                      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10, background: '#f0fdf4', border: '1px solid #bbe7c3', borderRadius: 10, padding: 14 }}>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 150px', minWidth: 120 }}>
                            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>First name</label>
                            <input
                              type="text" placeholder="First name"
                              value={(customerInfo.name || '').split(' ')[0] || ''}
                              onChange={(e) => {
                                const last = (customerInfo.name || '').split(' ').slice(1).join(' ');
                                setCustomerInfo(prev => ({ ...prev, name: [e.target.value, last].filter(Boolean).join(' ').trim() }));
                              }}
                              style={{ width: '100%', padding: 9, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', outline: 'none' }}
                            />
                          </div>
                          <div style={{ flex: '1 1 150px', minWidth: 120 }}>
                            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Last name</label>
                            <input
                              type="text" placeholder="Last name"
                              value={(customerInfo.name || '').split(' ').slice(1).join(' ') || ''}
                              onChange={(e) => {
                                const first = (customerInfo.name || '').split(' ')[0] || '';
                                setCustomerInfo(prev => ({ ...prev, name: [first, e.target.value].filter(Boolean).join(' ').trim() }));
                              }}
                              style={{ width: '100%', padding: 9, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', outline: 'none' }}
                            />
                          </div>
                        </div>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Business name</label>
                          <input type="text" placeholder="Transportation LLC" value={customerInfo.company || ''} onChange={(e) => setCustomerInfo(prev => ({ ...prev, company: e.target.value }))} style={{ width: '100%', padding: 9, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Email</label>
                          <input type="email" placeholder="email@example.com" value={customerInfo.email || ''} onChange={(e) => setCustomerInfo(prev => ({ ...prev, email: e.target.value }))} style={{ width: '100%', padding: 9, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Phone</label>
                          <input type="text" placeholder="Phone" value={customerInfo.phone || ''} onChange={(e) => setCustomerInfo(prev => ({ ...prev, phone: e.target.value }))} style={{ width: '100%', padding: 9, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
                        </div>
                        {!selectedUserId && (
                          <button
                            onClick={handleCreateAccountNow}
                            disabled={isCreatingAccount}
                            style={{
                              alignSelf: 'flex-start', background: '#10b981', color: 'white', border: 'none',
                              borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: 6,
                            }}
                          >
                            {isCreatingAccount ? 'Creating...' : '✅ Create Account'}
                          </button>
                        )}
                      </div>
                    )}

                    <div className="cust-contacts" style={{ marginTop: 12, justifyContent: 'space-between' }}>
                      <span className="cust-contact-item">✉ {customerInfo.email}</span>
                      <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
                        <button className="cust-edit-btn" onClick={() => setShowEditCustomer(true)}>
                          ✏ Edit Customer
                        </button>
                      </div>
                    </div>
                    {(customerInfo.address || customerInfo.city) && (
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                        📍 {[customerInfo.address, customerInfo.city, customerInfo.state, customerInfo.zip].filter(Boolean).join(', ')}
                      </div>
                    )}
                    {customerInfo.internalNotes && (
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8, background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: 7, padding: '8px 10px' }}>
                        📝 {customerInfo.internalNotes}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* ADD ITEMS */}
              <InlineItemPicker
                cartItems={cartItems}
                onChange={setCartItems}
                adPackages={adPackages}
                listingPackages={listingPackages}
                membershipPackages={membershipPackages}
                renewalPackages={renewalPackages}
              />

              {vehicleItems.length > 0 && (
                <div className="ci-panel">
                  <h3 className="ci-panel-title">🚗 Vehicle Agreements</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
                    {vehicleItems.map(v => (
                      <VehicleAgreementCard
                        key={vehicleKey(v)}
                        vehicle={v}
                        vehicles={vehicleItems}
                        vehicleKey={vehicleKey(v)}
                        invoiceId={currentInvoiceId}
                        ensureInvoiceSaved={async () => {
                          if (currentInvoiceId) return { invoiceId: currentInvoiceId };
                          const d = await persistInvoiceOnce();
                          return { invoiceId: d?.invoiceId || currentInvoiceId };
                        }}
                        customer={customerInfo}
                        data={vehicleAgreements[vehicleKey(v)] || {}}
                        onChange={(next) => setVehicleAgreements(prev => ({ ...prev, [vehicleKey(v)]: next }))}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* INVOICE ITEMS */}
              <div className="ci-panel">
                <div className="ci-panel-hdr" onClick={() => toggleSection('items')}>
                  <h3 className="ci-panel-title">📋 Invoice Items</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button
                      className="btn-ghost"
                      style={{ fontSize: 12, padding: '4px 10px' }}
                      onClick={(e) => { e.stopPropagation(); handleEditCart(); }}
                    >
                      ✏ Edit Cart
                    </button>
                    <span className={`ci-chevron ${!collapsedSections.items ? 'open' : ''}`}>▲</span>
                  </div>
                </div>
                {!collapsedSections.items && (
                  <>
                    <table className="item-tbl">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th style={{ textAlign: 'center' }}>Qty</th>
                          <th style={{ textAlign: 'right' }}>Unit Price</th>
                          <th style={{ textAlign: 'right' }}>Amount</th>
                          <th style={{ textAlign: 'right' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {cartItems.length === 0 ? (
                          <tr>
                            <td colSpan="5" style={{ textAlign: 'center', padding: '30px 10px', color: '#6b7280' }}>
                              No items added. Please select a listing or membership from the CRM.
                            </td>
                          </tr>
                        ) : cartItems.map((item, idx) => (
                          <React.Fragment key={item.id || idx}>
                            <tr>
                              <td>
                                <div className="item-name">{item.name}</div>
                                {item.description ? <div className="item-desc">{item.description}</div> : null}

                                {/* Color and Pattern merged here cleanly */}
                                {(item.leatherColor || item.stitchColor || item.pattern || item.selectedColor || item.selectedPattern || (item.covers && item.covers !== '-')) && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>

                                    {/* LEATHER BADGE */}
                                    {(item.leatherColor || item.selectedColor) && (
                                      <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                                        fontSize: '11px', padding: '3px 8px', borderRadius: '5px',
                                        background: '#f1f5f9', color: '#475569', fontWeight: 600
                                      }}>
                                        <span style={{
                                          width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0,
                                          backgroundColor: AVAILABLE_COLORS.find(c => c.name === (item.leatherColor || item.selectedColor))?.hex || '#000',
                                          border: (item.leatherColor || item.selectedColor) === 'white' ? '1px solid #d1d5db' : 'none'
                                        }} />
                                        Leather: <span style={{ textTransform: 'capitalize' }}>{item.leatherColor || item.selectedColor}</span>
                                      </span>
                                    )}

                                    {/* STITCH BADGE */}
                                    {item.stitchColor && (
                                      <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                                        fontSize: '11px', padding: '3px 8px', borderRadius: '5px',
                                        background: '#ecfdf5', color: '#047857', fontWeight: 600
                                      }}>
                                        <span style={{
                                          width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0,
                                          backgroundColor: AVAILABLE_COLORS.find(c => c.name === item.stitchColor)?.hex || '#000',
                                          border: item.stitchColor === 'white' ? '1px solid #d1d5db' : 'none'
                                        }} />
                                        Stitch: <span style={{ textTransform: 'capitalize' }}>{item.stitchColor}</span>
                                      </span>
                                    )}

                                    {/* PATTERN BADGE */}
                                    {(item.pattern || item.selectedPattern) && (
                                      <span style={{
                                        fontSize: '11px', padding: '3px 8px', borderRadius: '5px',
                                        background: '#eff6ff', color: '#3b28cc', fontWeight: 600
                                      }}>
                                        ◈ {item.pattern || item.selectedPattern}
                                      </span>
                                    )}

                                    {!item.leatherColor && !item.selectedColor && !item.pattern && !item.selectedPattern && item.covers && item.covers !== '-' && (
                                      <span style={{ color: '#9ca3af', fontSize: '11px' }}>{item.covers}</span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <div className="qty-ctrl" style={{ margin: '0 auto' }}>
                                  <button className="qty-btn" onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}>▲</button>
                                  <input type="number" className="qty-num" value={item.quantity}
                                    onChange={e => handleUpdateQuantity(item.id, e.target.value)} min="1" />
                                  <button className="qty-btn" onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}>▼</button>
                                </div>
                              </td>
                              <td style={{ textAlign: 'right', color: '#374151' }}>
                                <div style={{ position: 'relative', display: 'inline-block' }}>
                                  <span style={{ position: 'absolute', left: '6px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: '#6b7280' }}>$</span>
                                  <input type="number" min="0" step="0.01" value={item.price}
                                    onChange={e => handleUpdateItemPrice(item.id, e.target.value)}
                                    style={{ width: '80px', padding: '4px 6px 4px 16px', border: '1px solid #e5e7eb', borderRadius: '4px', fontSize: '13px', fontWeight: 600, textAlign: 'right', outline: 'none', color: '#111827', background: '#f9fafb' }} />
                                </div>
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }}>${((item.price * (item.type === 'A' ? (paymentTermMonths || 1) : 1)) * item.quantity).toFixed(2)}</td>
                              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                {PAY_LINK_EMAIL.endpoints[item.type] ? (
                                  <button
                                    onClick={() => handleEmailPerson(item.type)}
                                    disabled={emailSendingKind === item.type}
                                    style={{
                                      background: emailSendingKind === item.type ? '#f3e8ff' : '#f5f3ff',
                                      border: '1px solid #ddd6fe', color: '#7c3aed',
                                      borderRadius: '6px', width: '28px', height: '28px', display: 'inline-flex',
                                      alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '14px', marginRight: '6px',
                                    }}
                                    title={`Email the ${item.type === 'M' ? 'membership' : item.type === 'L' ? 'listing' : 'ads'} payment link to this customer`}
                                  >
                                    {emailSendingKind === item.type ? '⏳' : '✉'}
                                  </button>
                                ) : null}
                                <button onClick={() => handleRemoveItem(item.id)} style={{
                                  background: '#fef2f2', border: '1px solid #fecaca', color: '#ef4444',
                                  borderRadius: '6px', width: '28px', height: '28px', display: 'inline-flex',
                                  alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '14px',
                                }} title="Remove item">✕</button>
                              </td>
                            </tr>
                            {item.type === 'V' && getConsignments(vehicleAgreements[vehicleKey(item)]).length > 0 && (
                              <tr>
                                <td colSpan="5" style={{ padding: 0, textAlign: 'left' }}>
                                  <VehicleConsignmentSummary
                                    vehicle={item}
                                    data={vehicleAgreements[vehicleKey(item)]}
                                  />
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ marginTop: 20, borderTop: '2px solid #e5e7eb', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {itemizedGroups.map(group => (
                        <div key={group.type} style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{group.label} ({group.count})</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: 140, justifyContent: 'flex-end' }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>$</span>
                            <input type="number" min="0" step="0.01" value={typeTotalOverrides[group.type] != null ? typeTotalOverrides[group.type] : ''} placeholder={group.computedTotal.toFixed(2)} onChange={e => { const val = e.target.value === '' ? null : Math.max(0, parseFloat(e.target.value) || 0); setTypeTotalOverrides(prev => { const next = { ...prev }; if (val === null) delete next[group.type]; else next[group.type] = val; return next; }); }} style={{ width: 90, textAlign: 'right', border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 8px', fontSize: 13, fontWeight: 600, color: '#111827', outline: 'none', background: typeTotalOverrides[group.type] != null ? '#f0f7ff' : '#fff' }} />
                            {typeTotalOverrides[group.type] != null && <button onClick={() => setTypeTotalOverrides(prev => { const next = { ...prev }; delete next[group.type]; return next; })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#9ca3af', padding: 0 }} title="Reset">✕</button>}
                          </div>
                        </div>
                      ))}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <DiscountEditor
                          variant="wide"
                          customDiscounts={customDiscountsEditorList}
                          discountType={discountType}
                          setDiscountType={setDiscountType}
                          discountValue={discountValue}
                          setDiscountValue={setDiscountValue}
                          customDiscountAmount={customDiscountAmount}
                          combinedDiscountTitle={combinedDiscountTitle}
                          setCombinedDiscountTitle={setCombinedDiscountTitle}
                          extraDiscounts={extraDiscounts}
                          setExtraDiscounts={setExtraDiscounts}
                          onAddScheduledDiscount={openNewScheduleModal}
                          scheduledDiscounts={scheduledDiscountRows}
                        />
                      </div>

                      {couponDiscountAmount > 0 && appliedCoupon && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color: '#16a34a' }}>🎟 {appliedCoupon.code} discount</span>
                          <div style={{ width: 140, textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#16a34a' }}>-${couponDiscountAmount.toFixed(2)}</div>
                        </div>
                      )}

                      {schedListingTotal > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color: '#dc2626' }}>💬 Scheduled Listing Discount</span>
                          <div style={{ width: 140, textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#dc2626' }}>-${schedListingTotal.toFixed(2)}</div>
                        </div>
                      )}

                      {schedMembershipTotal > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color: '#dc2626' }}>💬 Scheduled Membership Discount</span>
                          <div style={{ width: 140, textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#dc2626' }}>-${schedMembershipTotal.toFixed(2)}</div>
                        </div>
                      )}

                      {/* The ads portion is NOT repeated here as a single
                          "Scheduled Ads Discount" line: the discount editor above
                          already itemises it, one row per scheduled message, using
                          the exact label persisted to ad_contracts.discounts_json.
                          Showing both meant the same money appeared twice. */}

                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>Shipping</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: 140, justifyContent: 'flex-end' }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>$</span>
                          <input type="number" min="0" step="0.01" value={shippingOverride != null ? shippingOverride : ''} placeholder={autoShippingCost.toFixed(2)} onChange={e => setShippingOverride(e.target.value === '' ? null : Math.max(0, parseFloat(e.target.value) || 0))} style={{ width: 90, textAlign: 'right', border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 8px', fontSize: 13, fontWeight: 600, color: '#111827', outline: 'none', background: shippingOverride != null ? '#f0f7ff' : '#fff' }} />
                          {shippingOverride != null && <button onClick={() => setShippingOverride(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#9ca3af', padding: 0 }} title="Reset">✕</button>}
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>Tax</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: 140, justifyContent: 'flex-end' }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>$</span>
                          <input type="number" min="0" step="0.01" value={taxOverride != null ? taxOverride : 0} placeholder="0.00" onChange={e => setTaxOverride(e.target.value === '' ? null : Math.max(0, parseFloat(e.target.value) || 0))} style={{ width: 90, textAlign: 'right', border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 8px', fontSize: 13, fontWeight: 600, color: '#111827', outline: 'none', background: taxOverride != null ? '#f0f7ff' : '#fff' }} />
                          {taxOverride != null && <button onClick={() => setTaxOverride(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#9ca3af', padding: 0 }} title="Reset">✕</button>}
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, borderTop: '2px solid #e5e7eb', paddingTop: 12, marginTop: 4 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Total</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: 140, justifyContent: 'flex-end' }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>$</span>
                          <input type="number" min="0" step="0.01" value={totalOverride != null ? totalOverride : ''} placeholder={totalDue.toFixed(2)} onChange={e => setTotalOverride(e.target.value === '' ? null : Math.max(0, parseFloat(e.target.value) || 0))} style={{ width: 100, textAlign: 'right', border: '2px solid #2563eb', borderRadius: 6, padding: '5px 8px', fontSize: 15, fontWeight: 700, color: '#1e40af', outline: 'none', background: totalOverride != null ? '#f0f7ff' : '#fff' }} />
                          {totalOverride != null && <button onClick={() => setTotalOverride(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#9ca3af', padding: 0 }} title="Reset">✕</button>}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* SCHEDULED MESSAGES */}
              <div className="ci-panel">
                <div className="ci-panel-hdr" onClick={() => toggleSection('messages')}>
                  <h3 className="ci-panel-title">💬 Scheduled Messages ({activeSchedules.length})</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={(e) => {
                      e.stopPropagation();
                      openNewScheduleModal();
                    }}>
                      + Add {messageTab === 'texts' ? 'Text' : 'Email'}
                    </button>
                    <span className={`ci-chevron ${!collapsedSections.messages ? 'open' : ''}`}>▲</span>
                  </div>
                </div>
                {!collapsedSections.messages && (
                  <>
                    <div className="msg-tabs">
                      <span className={`msg-tab ${messageTab === 'texts' ? 'active' : ''}`} onClick={() => { setMessageTab('texts'); setShowAllMessages(false); }}>Texts ({allTexts.length})</span>
                      <span className={`msg-tab ${messageTab === 'emails' ? 'active' : ''}`} onClick={() => { setMessageTab('emails'); setShowAllMessages(false); }}>Emails ({allEmails.length})</span>
                    </div>

                    {activeSchedules.length === 0 ? (
                      <div style={{ padding: '20px 0', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                        No scheduled {messageTab} found. Click "+ Add {messageTab === 'texts' ? 'Text' : 'Email'}" to create one.
                      </div>
                    ) : (
                      (() => {
                        const startIndex = showAllMessages ? 0 : Math.max(0, activeSchedules.length - 3);
                        const displayedSchedules = showAllMessages ? activeSchedules : activeSchedules.slice(-3);

                        return displayedSchedules.map((item, index) => {
                          const isFromDb = item.created_on !== undefined;
                          const dateVal = isFromDb ? item.send_date : item.date;
                          const timeVal = isFromDb ? item.send_time : item.time;
                          const msgBody = isFromDb ? item.message_body : item.messageBody;
                          const discountVal = isFromDb ? item.discount_offered : item.discount;
                          const schedAmounts = resolveScheduleAmounts(item);
                          const discParts = [
                            { key: 'L', label: 'Listing', value: schedAmounts.listing },
                            { key: 'M', label: 'Membership', value: schedAmounts.membership },
                            { key: 'A', label: 'Ads', value: schedAmounts.ads },
                          ].filter(p => p.value > 0);
                          const isSent = isFromDb ? item.is_sent : 0;
                          // send_status: NULL = not attempted yet, 'sent',
                          // 'failed'. A failed message is never retried, so it
                          // must not keep showing as "Pending".
                          const sendStatus = isFromDb ? item.send_status : null;
                          const isFailed = sendStatus === 'failed';
                          const hasPayLink = isFromDb ? item.attach_pay_link : item.attachPayLink;
                          const realIndex = startIndex + index;
                          const truncatedBody = msgBody && msgBody.length > 60 ? `${msgBody.substring(0, 60)}...` : (msgBody ? `"${msgBody}"` : '');

                          return (
                            <div key={item.id || realIndex} style={{ display: 'flex', alignItems: 'center', flexWrap: 'nowrap', gap: 8, padding: '12px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13, color: '#374151', maxWidth: '100%', overflow: 'hidden' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                <span style={{ color: messageTab === 'texts' ? '#3b82f6' : '#8b5cf6' }}>
                                  {messageTab === 'texts' ? '💬' : '✉'}
                                </span>
                                <span className="hide-on-mobile">{messageTab === 'texts' ? 'SMS' : 'Email'} #{realIndex + 1}</span>
                              </span>
                              <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>📅 {formatDateString(dateVal) || 'No date set'}</span>
                                  <span style={{ fontSize: 11, color: '#6b7280' }}>🕐 {typeof timeVal === 'string' ? timeVal.substring(0, 5) : timeVal}</span>
                                </span>
                                <span style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, maxWidth: '100%', minWidth: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }}>
                                  {truncatedBody}
                                </span>
                              </span>
                              <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'nowrap', gap: 6, flexShrink: 0 }}>
                                <span className="hide-on-mobile" style={{ fontSize: 12, color: '#6b7280' }}>Disc.</span>
                                {discParts.length > 0 ? (
                                  <span className="hide-on-mobile" style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                    {discParts.map(p => (
                                      <span key={p.key} title={`${p.label} discount`} style={{
                                        fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: '#16a34a',
                                        background: '#dcfce7', padding: '2px 6px', borderRadius: 10,
                                      }}>
                                        {p.key} -${p.value.toFixed(2)}
                                      </span>
                                    ))}
                                  </span>
                                ) : (
                                  <span style={{ color: '#6b7280', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>
                                    -${Number(discountVal).toFixed(2)}
                                  </span>
                                )}
                                {hasPayLink && (
                                  <span style={{
                                    fontSize: 10, fontWeight: 700, padding: '3px 6px',
                                    borderRadius: 12, background: '#eff6ff', color: '#2563eb',
                                    whiteSpace: 'nowrap', border: '1px solid #bfdbfe',
                                  }}>
                                    🔗 Link
                                  </span>
                                )}
                                <span style={{
                                  fontSize: 10, fontWeight: 700, padding: '3px 6px', borderRadius: '12px', marginLeft: 2,
                                  background: isFailed ? '#fee2e2' : (isSent ? '#dcfce7' : '#fef3c7'),
                                  color: isFailed ? '#dc2626' : (isSent ? '#16a34a' : '#d97706'),
                                  whiteSpace: 'nowrap'
                                }} title={isFailed ? (item.failure_reason || 'Send failed') : undefined}>
                                  {isFailed ? 'Failed' : (isSent ? 'Sent' : 'Pending')}
                                </span>
                                {!isSent && (
                                  <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 6, marginLeft: 4 }}>
                                    <span style={{ color: '#2563eb', cursor: 'pointer', fontSize: 14 }} onClick={() => handleEditSchedule(item)} title="Edit Schedule">✏️</span>
                                    <span style={{ color: '#dc2626', cursor: 'pointer', fontSize: 14, padding: '0 2px' }} onClick={() => handleRemoveSchedule(item.id, isFromDb)} title="Cancel Schedule">✕</span>
                                  </div>
                                )}
                              </span>
                            </div>
                          );
                        });
                      })()
                    )}

                    {activeSchedules.length > 3 && (
                      <button
                        onClick={(e) => { e.preventDefault(); setShowAllMessages(!showAllMessages); }}
                        className="view-all-link"
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', outline: 'none' }}
                      >
                        {showAllMessages ? 'Show less messages' : `View all messages (${activeSchedules.length})`}
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* CUSTOM DISCOUNT PANEL */}
              <div className="ci-panel">
                <div className="ci-panel-hdr" onClick={() => toggleSection('discount')}>
                  <h3 className="ci-panel-title">
                    🎟 Coupon Code
                    {couponDiscountAmount > 0 && (
                      <span style={{ fontSize: 11, background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>
                        -${couponDiscountAmount.toFixed(2)} Applied
                      </span>
                    )}
                  </h3>
                  <span className={`ci-chevron ${!collapsedSections.discount ? 'open' : ''}`}>▲</span>
                </div>
                {!collapsedSections.discount && (
                  <div style={{ marginTop: 14 }}>
                    {/* COUPON CODE */}
                    <div style={{ marginTop: 4 }}>
                      <label className="pl-label" style={{ marginBottom: 8 }}>Have a Coupon Code?</label>
                      {!appliedCoupon ? (
                        <>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input
                              type="text"
                              className="pl-input"
                              placeholder="e.g. WELCOME20"
                              value={couponCode}
                              onChange={e => { setCouponCode(e.target.value); setCouponError(''); }}
                              onKeyDown={e => { if (e.key === 'Enter') handleApplyCoupon(); }}
                              style={{ textTransform: 'uppercase' }}
                            />
                            <button
                              className="btn-ghost"
                              style={{ whiteSpace: 'nowrap' }}
                              onClick={handleApplyCoupon}
                              disabled={isApplyingCoupon}
                            >
                              {isApplyingCoupon ? 'Checking...' : 'Apply'}
                            </button>

                          </div>
                          {couponError && (
                            <div style={{ color: '#ef4444', fontSize: 12, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                              ⚠ {couponError}
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
                          padding: '10px 14px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#16a34a', fontWeight: 700 }}>
                            🎟 {appliedCoupon.code} applied — {
                              appliedCoupon.mode === 'per-item'
                                ? `$${couponItemDiscountTotal.toFixed(2)} off`
                                : (appliedCoupon.type === 'percent'
                                  ? `${appliedCoupon.discount}% off`
                                  : `$${Number(appliedCoupon.discount).toFixed(2)} off`)
                            }
                          </div>
                          <button
                            onClick={handleRemoveCoupon}
                            style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* NOTES */}
              <div className="ci-panel">
                <div className="ci-panel-hdr" onClick={() => toggleSection('notes')}>
                  <h3 className="ci-panel-title">✏ Notes <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 400 }}>(Optional)</span></h3>
                  <span className={`ci-chevron ${!collapsedSections.notes ? 'open' : ''}`}>▲</span>
                </div>
                {!collapsedSections.notes && (
                  <textarea className="notes-textarea" rows="3" placeholder="Add a note..." value={notes} onChange={e => setNotes(e.target.value)} />
                )}
              </div>

              {/* ADS AGREEMENT DETAILS + SHARE LINK */}
              <div className="ci-panel">
                <div className="ci-panel-hdr" onClick={() => toggleSection('adAgreement')}>
                  <h3 className="ci-panel-title">📢 Ads Agreement Details</h3>
                  <span className={`ci-chevron ${!collapsedSections.adAgreement ? 'open' : ''}`}>▲</span>
                </div>
                {!collapsedSections.adAgreement && (
                  hasAdItem ? (
                    <div style={{ marginTop: 14 }}>
                      {(adContractId || isLoadingAdAgreement) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: adContractSource === 'admin' ? '#fffbeb' : '#f0f9ff', border: `1px solid ${adContractSource === 'admin' ? '#fde68a' : '#bae6fd'}`, borderRadius: 6, padding: '8px 10px', marginBottom: 12 }}>
                          <i className={isLoadingAdAgreement ? 'fas fa-spinner fa-spin' : 'fas fa-file-contract'}
                            style={{ fontSize: 12, color: adContractSource === 'admin' ? '#d97706' : '#0369a1' }}></i>
                          <span style={{ fontSize: 12, color: adContractSource === 'admin' ? '#92400e' : '#0369a1', flex: 1, minWidth: 0 }}>
                            {isLoadingAdAgreement
                              ? 'Loading agreement details from contract...'
                              : adContractSource === 'admin'
                                ? `Showing contract #${adContractId} values (created in the admin panel)`
                                : `Showing contract #${adContractId} values`}
                          </span>
                          <button
                            type="button"
                            onClick={() => loadAdAgreementDetails({ force: true })}
                            disabled={isLoadingAdAgreement}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: isLoadingAdAgreement ? 'not-allowed' : 'pointer', color: adContractSource === 'admin' ? '#b45309' : '#0369a1', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}
                          >
                            Refresh
                          </button>
                        </div>
                      )}
                      <div style={{ marginBottom: 12 }}>
                        <label className="pl-label">Bill to</label>
                        <input
                          type="text"
                          className="pl-input"
                          placeholder="Business or customer name"
                          value={agreementBillTo}
                          onChange={(e) => setAgreementBillTo(e.target.value)}
                        />
                      </div>
                      <div className="pl-grid">
                        <div>
                          <label className="pl-label">Phone no.</label>
                          <input
                            type="text"
                            className="pl-input"
                            placeholder="(555) 123-4567"
                            value={agreementPhone}
                            onChange={(e) => setAgreementPhone(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="pl-label">Additional phone no.</label>
                          <input
                            type="text"
                            className="pl-input"
                            placeholder="(555) 987-6543"
                            value={agreementAltPhone}
                            onChange={(e) => setAgreementAltPhone(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="pl-grid">
                        <div>
                          <label className="pl-label">Agreement date</label>
                          <input
                            type="date"
                            className="pl-input"
                            value={agreementDate}
                            onChange={(e) => setAgreementDate(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="pl-label">Term type</label>
                          <select
                            className="pl-select"
                            value={adTermType}
                            onChange={(e) => setAdTermType(e.target.value)}
                          >
                            {TERM_TYPE_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value} disabled={!opt.available}>
                                {opt.label}{opt.available ? '' : ' (coming soon)'}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {!termTypeAvailable && (
                        <div style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '7px 9px', marginTop: 10 }}>
                          <strong>{TERM_TYPE_OPTIONS.find(o => o.value === adTermType)?.label || adTermType}</strong> is not available yet.
                          Complimentary billing is not implemented, so this invoice is charged as a normal
                          {' '}paid term using the fields below.
                        </div>
                      )}

                      {/* Complimentary run length - only when some of the term is free. */}
                      {showComplimentaryTerm && (
                        <div className="pl-grid">
                          <div>
                            <label className="pl-label">Complimentary term</label>
                            <select
                              className="pl-select"
                              value={String(adComplimentaryTerm)}
                              onChange={(e) => setAdComplimentaryTerm(parseInt(e.target.value, 10) || 1)}
                            >
                              {COMPLIMENTARY_TERM_OPTIONS.map(m => (
                                <option key={m} value={String(m)}>
                                  {m === 1 ? '1 month complimentary' : `${m} months complimentary`}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}

                      {/* Billing fields - hidden for a fully complimentary term. */}
                      {showBillingTerms && (
                        <>
                          <div className="pl-grid">
                            <div>
                              <label className="pl-label">Contract Term</label>
                              <select
                                className="pl-select"
                                value={agreementTerms}
                                onChange={(e) => setAgreementTerms(e.target.value)}
                              >
                                {CONTRACT_TERM_OPTIONS.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="pl-label">Credit Card Charge Frequency</label>
                              <select
                                className="pl-select"
                                value={String(paymentTermMonths)}
                                onChange={(e) => setAgreementPaymentTerm(e.target.value)}
                              >
                                {paymentTermOptions.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          {showComplimentaryTerm && adTermType === 'complimentary_then_pay' && (
                            <div style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '7px 9px', marginTop: 10 }}>
                              {adComplimentaryTerm} month{adComplimentaryTerm === 1 ? '' : 's'} complimentary,
                              then {paymentTermLabel.toLowerCase()} for the remaining contract term.
                            </div>
                          )}
                        </>
                      )}

                      <div className="pl-grid">
                        <div>
                          <label className="pl-label">Amount billed now</label>
                          <div className="pl-input" style={{ background: '#f0fdf4', color: '#047857', fontWeight: 700, display: 'flex', alignItems: 'center' }}>
                            ${(activeAdPackage ? adsBilledBase : 0).toFixed(2)}
                            {showBillingTerms && paymentTermMonths > 1 && (
                              <span style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', marginLeft: 6 }}>
                                ({paymentTermMonths} × ${((adsBilledBase / paymentTermMonths) || adPackagePrice || 0).toFixed(2)}/mo)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {generatedAdLink && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6, padding: '9px 10px', marginTop: 4, marginBottom: 12 }}>
                          <span style={{ fontSize: 12, color: '#0369a1', flex: 1, minWidth: 0, wordBreak: 'break-all', whiteSpace: 'normal', lineHeight: 1.4 }}>{generatedAdLink}</span>
                          <button
                            onClick={handleCopyAdLink}
                            style={{ background: 'none', border: '1px solid #93c5fd', color: '#2563eb', borderRadius: 5, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
                          >
                            {adLinkCopied ? '✓ Copied' : 'Copy'}
                          </button>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 10, marginTop: generatedAdLink ? 0 : 4 }}>
                        <button
                          onClick={handleGenerateAdLink}
                          disabled={isGeneratingAdLink || !hasAdItem}
                          style={{
                            flex: 1, padding: '11px', border: '1px solid #2563eb', borderRadius: 6,
                            background: '#fff', color: '#2563eb', fontSize: 13, fontWeight: 700,
                            cursor: (isGeneratingAdLink || !hasAdItem) ? 'not-allowed' : 'pointer',
                            opacity: (isGeneratingAdLink || !hasAdItem) ? 0.5 : 1,
                          }}
                        >
                          {isGeneratingAdLink ? '⏳ Generating…' : '🔗 Generate Link'}
                        </button>
                        <button
                          onClick={handleSendAdLinkToUser}
                          disabled={isSendingAdLink || !hasAdItem}
                          style={{
                            flex: 1, padding: '11px', border: 'none', borderRadius: 6,
                            background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 700,
                            cursor: (isSendingAdLink || !hasAdItem) ? 'not-allowed' : 'pointer',
                            opacity: (isSendingAdLink || !hasAdItem) ? 0.5 : 1,
                          }}
                        >
                          {isSendingAdLink ? '⏳ Sending…' : '✈ Send Link to User'}
                        </button>
                      </div>
                      {!activeAdPackage && !isGeneratingAdLink && (
                        <div style={{ fontSize: 11, color: '#dc2626', marginTop: 8, fontStyle: 'italic' }}>
                          Ad package could not be matched to the loaded packages. Click Generate Link to retry — you will see an error if it still fails.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: 10, padding: '16px 18px' }}>
                        <span style={{ fontSize: 22 }}>📢</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Ads Agreement Details</div>
                          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 3 }}>Add an ad package to the invoice items to unlock this section.</div>
                        </div>
                      </div>
                    </div>
                  ))
                }
              </div>

              {/* PAYMENT LINK */}
              <div className="ci-panel">
                <div className="ci-panel-hdr" onClick={() => toggleSection('paymentLink')}>
                  <h3 className="ci-panel-title">🔗 Secure Payment Link</h3>
                  <span className={`ci-chevron ${!collapsedSections.paymentLink ? 'open' : ''}`}>▲</span>
                </div>
                {!collapsedSections.paymentLink && (
                  <div style={{ marginTop: 14 }}>
                    <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 14px' }}>
                      Generate a secure link, then choose how to deliver it to the customer.
                    </p>
                    <div className="pl-grid">
                      <div>
                        <label className="pl-label">Link Expires In</label>
                        <select className="pl-select" value={linkExpiry} onChange={e => setLinkExpiry(e.target.value)}>
                          <option>No Limit</option>
                          <option>7 Days</option>
                          <option>14 Days</option>
                          <option>30 Days</option>
                        </select>
                      </div>
                      <div>
                        <label className="pl-label">Send Method</label>
                        <select className="pl-select" value={linkSendMode} onChange={e => setLinkSendMode(e.target.value)}>
                          <option value="text_system">Text Link via System</option>
                          <option value="text_manual">Manual Text Link</option>
                          <option value="email_system">Email Link via System</option>
                          <option value="email_manual">Manual Email Link</option>
                        </select>
                      </div>
                    </div>
                    <div className="pl-grid">
                      <div>
                        <label className="pl-label">Mobile Number</label>
                        <input type="tel" className="pl-input" value={payLinkPhone} onChange={e => setPayLinkPhone(e.target.value)} />
                      </div>
                      <div>
                        <label className="pl-label">Email Address</label>
                        <input type="email" className="pl-input" value={payLinkEmail} onChange={e => setPayLinkEmail(e.target.value)} />
                      </div>
                    </div>
                    <div style={{ marginBottom: 14 }}>
                      <label className="pl-label">Custom Message</label>
                      <textarea className="pl-textarea" value={payLinkMessage} onChange={e => setPayLinkMessage(e.target.value)} />
                    </div>
                    {availableLinkTypes.length >= 2 && (
                      <div style={{ marginBottom: 14 }}>
                        <label className="pl-label">Include Links in Message</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {availableLinkTypes.map(t => {
                            const checked = linkIncludeTypes[t.key] !== false;
                            return (
                              <div
                                key={t.key}
                                onClick={() => toggleLinkType(t.key)}
                                style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${checked ? '#2563eb' : '#e5e7eb'}`, background: checked ? '#eff6ff' : '#f9fafb', transition: 'all 0.15s' }}
                              >
                                <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, background: checked ? '#2563eb' : '#ffffff', border: `1.5px solid ${checked ? '#2563eb' : '#d1d5db'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {checked && <span style={{ color: '#ffffff', fontSize: 12, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                                </div>
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{t.label} Link</span>
                                <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: checked ? '#2563eb' : '#9ca3af' }}>
                                  {checked ? 'Added to message' : 'Removed from message'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button className="btn-gen-link" onClick={handleGeneratePayLink} disabled={isGeneratingLink}>
                        {isGeneratingLink ? '⏳ Generating...' : '🔗 Generate Link'}
                      </button>
                      <button
                        className="btn-gen-link btn-send-link"
                        onClick={handleSendPayLink}
                        disabled={isSendingPayLink}
                      >
                        {isSendingPayLink ? '⏳ Sending...' : '📤 Send Link'}
                      </button>
                    </div>
                    {linkGenerated && (
                      <div style={{ marginTop: 14, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#1e40af' }}>
                        <strong>✅ Link generated.</strong> It is embedded in the message above.
                        <div style={{ marginTop: 6, wordBreak: 'break-all', fontFamily: 'monospace', fontSize: 11, color: '#2563eb', whiteSpace: 'pre-wrap' }}>
                          {hasOnlyAds
                            ? (generatedAdLink || paymentLinkUrl)
                            : (hasPhysical
                              ? paymentLinkUrl
                              : [
                                checkoutLinks.listing && `Listing link: ${checkoutLinks.listing}`,
                                checkoutLinks.membership && `Membership Link: ${checkoutLinks.membership}`,
                                generatedAdLink && `Ads link: ${generatedAdLink}`,
                              ].filter(Boolean).join('\n'))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>

            {/* ===== RIGHT ===== */}
            <div>
              {/* <div className="ci-panel"> */}
              {/* <h3 className="ci-panel-title">Invoice Summary</h3> */}
              {/* <div className="inv-summary-rows"> */}
              {/* {itemizedGroups.map(group => (
                    <div key={group.type} className="sr" style={{ alignItems: 'center' }}>
                      <span>{group.label} ({group.count})</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <span style={{ color: '#6b7280', fontSize: 12 }}>$</span>
                        <input type="number" min="0" step="0.01" value={typeTotalOverrides[group.type] != null ? typeTotalOverrides[group.type] : ''} placeholder={group.computedTotal.toFixed(2)} onChange={e => { const val = e.target.value === '' ? null : Math.max(0, parseFloat(e.target.value) || 0); setTypeTotalOverrides(prev => { const next = { ...prev }; if (val === null) delete next[group.type]; else next[group.type] = val; return next; }); }} style={{ width: 75, textAlign: 'right', border: '1px solid #e5e7eb', borderRadius: 4, padding: '2px 4px', fontSize: 12, fontWeight: 600, color: '#111827', background: typeTotalOverrides[group.type] != null ? '#eff6ff' : '#f9fafb' }} />
                        {typeTotalOverrides[group.type] != null && <span style={{ cursor: 'pointer', color: '#9ca3af', fontSize: 11 }} onClick={() => setTypeTotalOverrides(prev => { const next = { ...prev }; delete next[group.type]; return next; })} title="Reset to auto">✕</span>}
                      </div>
                    </div>
                  ))} */}

              {/* Custom flat/percent discount — synced with the invoice items summary */}
              {/* <DiscountEditor
                    variant="compact"
                    subtotal={subtotal}
                    discountType={discountType}
                    setDiscountType={setDiscountType}
                    discountValue={discountValue}
                    setDiscountValue={setDiscountValue}
                    customDiscountAmount={customDiscountAmount}
                    combinedDiscountTitle={combinedDiscountTitle}
                    setCombinedDiscountTitle={setCombinedDiscountTitle}
                    extraDiscounts={extraDiscounts}
                    setExtraDiscounts={setExtraDiscounts}
                  /> */}

              {/* Discount #3: Coupon code discount */}
              {/* {appliedCoupon && (
                    <div className="sr" style={{ alignItems: 'center', color: '#dc2626' }}>
                      <span style={{ fontSize: 12 }}>🎟 {appliedCoupon.code}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <span style={{ fontSize: 11 }}>- $</span>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>${couponDiscountAmount.toFixed(2)}</span>
                      </div>
                    </div>
                  )} */}

              {/* <div className="sr" style={{ alignItems: 'center' }}>
                    <span>Shipping</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: '#6b7280', fontSize: 12 }}>$</span>
                      <input type="number" min="0" step="0.01" value={shippingOverride != null ? shippingOverride : ''} placeholder={autoShippingCost.toFixed(2)} onChange={e => setShippingOverride(e.target.value === '' ? null : Math.max(0, parseFloat(e.target.value) || 0))} style={{ width: 75, textAlign: 'right', border: '1px solid #e5e7eb', borderRadius: 4, padding: '2px 4px', fontSize: 12, fontWeight: 600, color: '#111827', background: shippingOverride != null ? '#eff6ff' : '#f9fafb' }} />
                      {shippingOverride != null && <span style={{ cursor: 'pointer', color: '#9ca3af', fontSize: 11 }} onClick={() => setShippingOverride(null)} title="Reset to auto">✕</span>}
                    </div>
                  </div> */}
              {/* <div className="sr" style={{ alignItems: 'center' }}>
                    <span>Tax </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: '#6b7280', fontSize: 12 }}>$</span>
                      <input type="number" min="0" step="0.01" value={taxOverride != null ? taxOverride : 0} placeholder="0.00" onChange={e => setTaxOverride(e.target.value === '' ? null : Math.max(0, parseFloat(e.target.value) || 0))} style={{ width: 75, textAlign: 'right', border: '1px solid #e5e7eb', borderRadius: 4, padding: '2px 4px', fontSize: 12, fontWeight: 600, color: '#111827', background: taxOverride != null ? '#eff6ff' : '#f9fafb' }} />
                      {taxOverride != null && <span style={{ cursor: 'pointer', color: '#9ca3af', fontSize: 11 }} onClick={() => setTaxOverride(null)} title="Reset to auto">✕</span>}
                    </div>
                  </div> */}
              {/* <div className="sr total" style={{ alignItems: 'center' }}>
                    <span>Total</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: '#6b7280', fontSize: 12 }}>$</span>
                      <input type="number" min="0" step="0.01" value={totalOverride != null ? totalOverride : ''} placeholder={totalDue.toFixed(2)} onChange={e => setTotalOverride(e.target.value === '' ? null : Math.max(0, parseFloat(e.target.value) || 0))} style={{ width: 85, textAlign: 'right', border: '1px solid #e5e7eb', borderRadius: 4, padding: '3px 5px', fontSize: 13, fontWeight: 700, color: '#111827', background: totalOverride != null ? '#f0fdf4' : '#f9fafb' }} />
                      {totalOverride != null && <span style={{ cursor: 'pointer', color: '#9ca3af', fontSize: 11 }} onClick={() => setTotalOverride(null)} title="Reset to auto">✕</span>}
                    </div>
                  </div> */}
              {/* </div>
              </div> */}

              <div className="ci-panel">
                <div className={`radio-box ${paymentType === 'deposit' ? 'active' : ''}`} onClick={() => setPaymentType('deposit')}>
                  <div className="rb-header"><input type="radio" checked={paymentType === 'deposit'} readOnly /><span>Deposit</span></div>
                  <div className="rb-desc">Collect a partial payment now</div>
                  {paymentType === 'deposit' && (
                    <div className="deposit-fields" onClick={e => e.stopPropagation()}>
                      <div className="dep-field">
                        <label className="dep-label">Deposit Amount</label>
                        <div className="dep-inp-wrap"><span className="prefix">$</span><input type="text" className="dep-input has-prefix" value={depositAmount.toFixed(2)} readOnly /></div>
                      </div>
                      <div style={{ width: 80 }}>
                        <label className="dep-label" style={{ visibility: 'hidden' }}>-</label>
                        <div className="dep-inp-wrap"><input type="number" className="dep-input has-suffix" value={depositPercent} onChange={e => setDepositPercent(Math.max(1, Math.min(100, Number(e.target.value))))} /><span className="suffix">%</span></div>
                      </div>
                    </div>
                  )}
                </div>
                <div className={`radio-box ${paymentType === 'full' ? 'active' : ''}`} onClick={() => setPaymentType('full')}>
                  <div className="rb-header"><input type="radio" checked={paymentType === 'full'} readOnly /><span>Full Payment</span></div>
                  <div className="rb-desc">Collect full payment now</div>
                </div>
                <div className="amount-due-row"><span>Amount Due Now</span><span>${amountDueNow.toFixed(2)}</span></div>
              </div>

              <div className="ci-panel">
                <h3 className="ci-panel-title">💳 Payment Method</h3>
                <div className="pm-top">
                  <span>Stored Cards</span>
                  <span onClick={() => setShowAddCardModal(true)} style={{ color: '#2563eb', fontWeight: 600, cursor: 'pointer' }}>+ Add Card</span>
                </div>
                {storedCards.map(({ id, brand, last4, isDefault }) => {
                  const isSelected = selectedCardId === id;
                  return (
                    <div
                      key={id}
                      className="stored-card"
                      onClick={() => setSelectedCardId(id)}
                      style={{
                        cursor: 'pointer',
                        border: isSelected ? '1.5px solid #16a34a' : '1px solid #e5e7eb',
                        background: isSelected ? '#f0fdf4' : 'white',
                      }}
                    >
                      <span style={{ fontWeight: isSelected ? 700 : 400, color: isSelected ? '#111827' : '#374151' }}>
                        💳 {brand} •••• {last4}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {isDefault && <span className="card-badge">Default</span>}
                        <span style={{
                          width: 22, height: 22, borderRadius: '50%',
                          border: `2px solid ${isSelected ? '#16a34a' : '#d1d5db'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: isSelected ? '#16a34a' : 'white',
                          flexShrink: 0, transition: 'all 0.15s',
                        }}>
                          {isSelected && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </span>
                        {!isSelected && <span className="card-menu">⋮</span>}
                      </div>
                    </div>
                  );
                })}
                <button className="btn-charge" onClick={handleChargeAndOrder} disabled={isSubmitting}>
                  {isSubmitting ? 'Processing...' : `Charge $${amountDueNow.toFixed(2)}`}
                </button>
                <div className="secure-note">🔒 Secure payments powered by Stripe</div>
              </div>

              <div className="ci-panel" style={{ padding: '14px 0' }}>
                <div className="ci-panel-hdr" style={{ padding: '0 20px 12px' }} onClick={() => toggleSection('contactActions')}>
                  <h3 className="ci-panel-title">📞 Contact Actions</h3>
                  <span className={`ci-chevron ${!collapsedSections.contactActions ? 'open' : ''}`}>▲</span>
                </div>
                {!collapsedSections.contactActions && (
                  <>
                    <button className="contact-action-btn" onClick={handleCallCustomer}>
                      <span style={{ color: '#10b981' }}>📞</span> Call Customer
                    </button>
                    <button className="contact-action-btn" onClick={handleTextCustomer}>
                      <span style={{ color: '#3b82f6' }}>💬</span> Text Customer
                    </button>
                    <button
                      className="contact-action-btn"
                      onClick={() => {
                        const hasMembership = cartItems.some(i => i.type === 'M');
                        if (hasMembership && PAY_LINK_EMAIL.endpoints.M && customerInfo.email && currentInvoiceId) {
                          handleEmailPerson('M');
                        } else if (customerInfo.email) {
                          const subject = encodeURIComponent(`Regarding Invoice #${invoiceNumber}`);
                          window.location.href = `mailto:${customerInfo.email}?subject=${subject}`;
                        } else {
                          alert("No email address available for this customer.");
                        }
                      }}
                    >
                      <span style={{ color: '#8b5cf6' }}>✉</span> Email Customer
                    </button>
                  </>
                )}
              </div>

              <div
                onClick={() => navigate('/sales/crm/followups', {
                  state: {
                    invoiceId: currentInvoiceId,
                    leadPhone: customerInfo.phone,
                    customerName: customerInfo.name || '',
                    from: 'invoice',
                  },
                })}
                style={{
                  background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb',
                  marginBottom: 16, padding: '14px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>⏰</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Follow-ups</span>
                </div>
                <button
                  style={{
                    background: '#3b28cc', color: '#fff', border: 'none', borderRadius: '8px',
                    padding: '8px 16px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  Manage Follow-ups →
                </button>
              </div>
            </div>
          </div>
        </div>

        <AddNewCardModal
          isOpen={showAddCardModal}
          onClose={() => setShowAddCardModal(false)}
          onAddCard={handleAddNewCard}
        />

        <EditCartModal
          isOpen={showEditCartModal}
          onClose={() => setShowEditCartModal(false)}
          onSave={handleSaveCart}
          cartItems={cartItems}
          adPackages={adPackages}
          listingPackages={listingPackages}
          membershipPackages={membershipPackages}
          API_BASE_URL={API_BASE_URL}
        />

        {/* MOBILE FOOTER */}
        <div className="ci-footer-bar">
          <button className="btn-preview" onClick={handleEditCart}>✏ Edit</button>
          <button className="btn-preview" onClick={handlePreview}>🔍 Preview</button>
          <button className="btn-send" onClick={() => setSendModalState('options')} disabled={isSubmitting || isSavingDraft}>
            ✉ Send
          </button>
        </div>
      </div>
    </>
  );
};

export default CreateInvoicePage;
