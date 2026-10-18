import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import './ConsignmentAgreementModal.css';
import './ReferralFeeModal.css';

const PAYMENT_METHODS = ['Card (Processed Now)', 'Cash', 'Check', 'Zelle / Wire Transfer', 'Pay Later (Invoice)'];
const PAYMENT_STATUSES = [
  { value: 'Paid', color: '#16a34a' },
  { value: 'Pending', color: '#d97706' },
  { value: 'Unpaid', color: '#dc2626' },
];

const pad = (n) => String(n).padStart(2, '0');
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const vehicleKey = (v) => String(v?.id ?? v?.itemId ?? '');
const vehicleLabel = (v) => {
  const name = v?.name || v?.display_name || 'Vehicle';
  const miles = String(v?.description || '').match(/([\d,]+)\s*miles/i);
  return miles ? `${name} (${miles[1]} miles)` : name;
};

const buildDefaults = ({ vehicle, customer, agentName }) => ({
  date: todayISO(),
  amount: '',
  referredBy: agentName || 'Admin User',
  referralType: 'buyer',
  vehicleId: vehicleKey(vehicle),
  stockNumber: '',
  fullName: customer?.name || '',
  businessName: customer?.company || '',
  email: customer?.email || '',
  phone: customer?.phone || '',
  address: customer?.address || '',
  cityStateZip: [customer?.city, customer?.state, customer?.zip].filter(Boolean).join(', '),
  paymentMethod: PAYMENT_METHODS[0],
  paymentStatus: 'Paid',
  transactionId: '',
  paymentDate: todayISO(),
  sendTo: 'customer',
  notes: '',
});

const Field = ({ label, required, error, children }) => (
  <div className="cm-field">
    <label className="cm-label">
      {label}
      {required && <span className="cm-req"> *</span>}
    </label>
    {children}
    {error && <div className="cm-error">⚠ {error}</div>}
  </div>
);

const Radios = ({ name, value, onChange, options, stack }) => (
  <div className={`cm-radios ${stack ? 'rf-stack' : ''}`}>
    {options.map((o) => (
      <label key={o.value} className="cm-radio">
        <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} />
        <span>{o.label}</span>
      </label>
    ))}
  </div>
);

const ReferralFeeModal = ({ vehicle, vehicles, customer, agentName, agentOptions, data, onClose, onSubmit }) => {
  const [form, setForm] = useState(() => ({ ...buildDefaults({ vehicle, customer, agentName }), ...(data || {}) }));
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [sendingVia, setSendingVia] = useState(null); // Tracks which button is loading
  const bodyRef = useRef(null);

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const vehicleOptions = useMemo(() => {
    const list = Array.isArray(vehicles) && vehicles.length > 0 ? vehicles : vehicle ? [vehicle] : [];
    return list.map((v) => ({ value: vehicleKey(v), label: vehicleLabel(v) }));
  }, [vehicles, vehicle]);

  const referredByOptions = useMemo(() => {
    const names = [...(agentOptions || []), agentName || 'Admin User', form.referredBy].filter(Boolean);
    return [...new Set(names)];
  }, [agentOptions, agentName, form.referredBy]);

  const statusColor = (PAYMENT_STATUSES.find((s) => s.value === form.paymentStatus) || {}).color || '#9ca3af';

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const validate = () => {
    const e = {};
    if (!form.date) e.date = 'Required';
    if (!(parseFloat(form.amount) > 0)) e.amount = 'Enter an amount greater than 0';
    if (!form.referredBy.trim()) e.referredBy = 'Required';
    if (!form.vehicleId) e.vehicleId = 'Select a vehicle';
    if (!form.fullName.trim()) e.fullName = 'Required';
    if (!form.email.trim()) e.email = 'Required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'Invalid email';
    if (!form.phone.trim()) e.phone = 'Required';
    if (!form.paymentMethod) e.paymentMethod = 'Required';
    if (!form.paymentStatus) e.paymentStatus = 'Required';
    if (!form.paymentDate) e.paymentDate = 'Required';
    setErrors(e);
    return e;
  };

  const submitWith = async (method) => {
    if (submitting) return;
    const e = validate();
    if (Object.keys(e).length > 0) {
      setTimeout(() => {
        const el = bodyRef.current && bodyRef.current.querySelector('.is-invalid, .cm-error');
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 30);
      return;
    }
    
    setSubmitting(true);
    setSendingVia(method);
    
    try {
      // Pass the specific method (sms, email, both) to the onSubmit handler
      await onSubmit({ ...form, vehicleLabel: (vehicleOptions.find((o) => o.value === form.vehicleId) || {}).label || '' }, method);
      // Success is handled by the parent closing the modal
    } catch (err) {
      setSubmitting(false);
      setSendingVia(null);
    }
  };

  // Prevent default form submission via Enter key
  const handleSubmit = (ev) => ev.preventDefault();

  const cls = (base, k) => `${base} ${errors[k] ? 'is-invalid' : ''}`;

  return createPortal(
    <div className="cm-overlay" role="dialog" aria-modal="true" aria-labelledby="rf-title">
      <form className="cm-modal rf-modal" onSubmit={handleSubmit} noValidate>
        {/* HEADER */}
        <div className="cm-header">
          <div>
            <h2 id="rf-title" className="cm-title">{data ? 'Edit' : 'Add'} Referral Fee</h2>
            <p className="cm-subtitle">
              Enter the referral fee details below. A referral agreement will be generated and sent to the customer for e-signature.
            </p>
          </div>
          <button type="button" className="cm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="cm-body" ref={bodyRef}>
          {/* 1. REFERRAL INFORMATION */}
          <section className="cm-section">
            <h3 className="cm-section-title">1. Referral Information</h3>
            <div className="cm-grid g2">
              <Field label="Referral Date" required error={errors.date}>
                <input type="date" className={cls('cm-input', 'date')} value={form.date} onChange={(e) => set('date', e.target.value)} />
              </Field>
              <Field label="Referral Fee Amount" required error={errors.amount}>
                <div className={cls('cm-affix-group', 'amount')}>
                  <span className="cm-affix pre">$</span>
                  <input
                    className="cm-input bare"
                    type="number" min="0" step="0.01" inputMode="decimal"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => set('amount', e.target.value)}
                  />
                </div>
              </Field>

              <Field label="Referred By (Your Name)" required error={errors.referredBy}>
                <select className={cls('cm-select', 'referredBy')} value={form.referredBy} onChange={(e) => set('referredBy', e.target.value)}>
                  {referredByOptions.map((n) => <option key={n}>{n}</option>)}
                </select>
              </Field>
              <Field label="Referral Type" required>
                <Radios
                  name="rf-type"
                  value={form.referralType}
                  onChange={(v) => set('referralType', v)}
                  options={[{ value: 'buyer', label: 'Buyer' }, { value: 'seller', label: 'Seller' }]}
                />
              </Field>

              <Field label="Vehicle" required error={errors.vehicleId}>
                <select className={cls('cm-select', 'vehicleId')} value={form.vehicleId} onChange={(e) => set('vehicleId', e.target.value)}>
                  {vehicleOptions.length === 0 && <option value="">No vehicle attached</option>}
                  {vehicleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Stock # (Optional)">
                <input className="cm-input" value={form.stockNumber} placeholder="Stock number" onChange={(e) => set('stockNumber', e.target.value)} />
              </Field>
            </div>
          </section>

          {/* 2. CUSTOMER INFORMATION */}
          <section className="cm-section">
            <h3 className="cm-section-title">2. Customer Information (Person Paying Referral Fee)</h3>
            <div className="cm-grid g2">
              <Field label="Full Name" required error={errors.fullName}>
                <input className={cls('cm-input', 'fullName')} value={form.fullName} placeholder="John Smith" autoComplete="name" onChange={(e) => set('fullName', e.target.value)} />
              </Field>
              <Field label="Business Name (Optional)">
                <input className="cm-input" value={form.businessName} placeholder="ABC Transportation" onChange={(e) => set('businessName', e.target.value)} />
              </Field>

              <Field label="Email" required error={errors.email}>
                <input type="email" className={cls('cm-input', 'email')} value={form.email} placeholder="john@example.com" autoComplete="email" onChange={(e) => set('email', e.target.value)} />
              </Field>
              <Field label="Phone" required error={errors.phone}>
                <input type="tel" className={cls('cm-input', 'phone')} value={form.phone} placeholder="(555) 123-4567" autoComplete="tel" onChange={(e) => set('phone', e.target.value)} />
              </Field>

              <Field label="Address (Optional)">
                <input className="cm-input" value={form.address} placeholder="123 Main St" autoComplete="street-address" onChange={(e) => set('address', e.target.value)} />
              </Field>
              <Field label="City, State, ZIP (Optional)">
                <input className="cm-input" value={form.cityStateZip} placeholder="Los Angeles, CA 90001" onChange={(e) => set('cityStateZip', e.target.value)} />
              </Field>
            </div>
          </section>

          {/* 3. PAYMENT DETAILS */}
          <section className="cm-section">
            <h3 className="cm-section-title">3. Payment Details</h3>
            <div className="cm-grid g2">
              <Field label="Payment Method" required error={errors.paymentMethod}>
                <select className={cls('cm-select', 'paymentMethod')} value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)}>
                  {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Payment Status" required error={errors.paymentStatus}>
                <div className="rf-status">
                  <span className="rf-dot" style={{ background: statusColor }} />
                  <select className={cls('cm-select', 'paymentStatus')} value={form.paymentStatus} onChange={(e) => set('paymentStatus', e.target.value)}>
                    {PAYMENT_STATUSES.map((s) => <option key={s.value}>{s.value}</option>)}
                  </select>
                </div>
              </Field>

              <Field label="Transaction ID (Optional)">
                <input className="cm-input" value={form.transactionId} placeholder="Stripe/Processor Transaction ID" onChange={(e) => set('transactionId', e.target.value)} />
              </Field>
              <Field label="Payment Date" required error={errors.paymentDate}>
                <input type="date" className={cls('cm-input', 'paymentDate')} value={form.paymentDate} onChange={(e) => set('paymentDate', e.target.value)} />
              </Field>
            </div>
          </section>

          {/* 4. AGREEMENT & NEXT STEPS */}
          <section className="cm-section">
            <h3 className="cm-section-title">4. Agreement &amp; Next Steps</h3>
            <div className="cm-grid g2">
              <Field label="Send Agreement To" required>
                <Radios
                  stack
                  name="rf-send"
                  value={form.sendTo}
                  onChange={(v) => set('sendTo', v)}
                  options={[
                    { value: 'customer', label: 'Customer (for e-signature)' },
                    { value: 'manual', label: 'Manually sign later' },
                  ]}
                />
              </Field>
              <Field label="Notes (Optional)">
                <textarea className="cm-textarea" rows={3} value={form.notes} placeholder="Add any internal notes..." onChange={(e) => set('notes', e.target.value)} />
              </Field>
            </div>
          </section>

          <div className="cm-notice">
            <span className="cm-notice-icon">i</span>
            <div>
              A referral agreement will be generated with the details above and sent to the customer for e-signature.
              The agreement includes payment terms, service description, and liability waiver.
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="cm-footer">
          <button type="button" className="cm-btn ghost cm-cancel" onClick={onClose} disabled={submitting}>Cancel</button>

          {form.sendTo === 'manual' ? (
            <button type="button" className="cm-btn primary" disabled={submitting} onClick={() => submitWith('manual')}>
              <span aria-hidden="true">✔</span> {submitting ? 'Saving…' : 'Save Agreement'}
            </button>
          ) : (
            <div className="cm-send">
              <span className="cm-send-label">Send agreement link via</span>
              <div className="cm-send-btns">
                <button type="button" className="cm-btn outline" disabled={submitting} onClick={() => submitWith('sms')}>
                  <span aria-hidden="true">💬</span> {sendingVia === 'sms' ? 'Sending…' : 'SMS'}
                </button>
                <button type="button" className="cm-btn outline" disabled={submitting} onClick={() => submitWith('email')}>
                  <span aria-hidden="true">✉</span> {sendingVia === 'email' ? 'Sending…' : 'Email'}
                </button>
                <button type="button" className="cm-btn primary" disabled={submitting} onClick={() => submitWith('both')}>
                  <span aria-hidden="true">✈</span> {sendingVia === 'both' ? 'Sending…' : 'Both'}
                </button>
              </div>
            </div>
          )}
        </div>
      </form>
    </div>,
    document.body
  );
};

export default ReferralFeeModal;