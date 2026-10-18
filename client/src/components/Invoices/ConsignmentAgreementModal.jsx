import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import './ConsignmentAgreementModal.css';

// ── Static option lists ──────────────────────────────────────────────────────
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR + 1 - 1980 + 1 }, (_, i) => String(CURRENT_YEAR + 1 - i));

const COMMON_MAKES = [
  'Acura', 'Audi', 'BMW', 'Buick', 'Cadillac', 'Chevrolet', 'Chrysler', 'Dodge', 'Ford', 'GMC',
  'Honda', 'Hyundai', 'Infiniti', 'Jeep', 'Kia', 'Land Rover', 'Lexus', 'Lincoln', 'Mazda',
  'Mercedes-Benz', 'Mitsubishi', 'Nissan', 'Porsche', 'Ram', 'Subaru', 'Tesla', 'Toyota',
  'Volkswagen', 'Volvo',
];

const COMMON_MODELS = {
  Ford: ['E-350', 'E-450', 'Transit', 'F-150', 'F-250', 'F-350', 'Expedition', 'Explorer'],
  Chevrolet: ['Express 3500', 'Suburban', 'Tahoe', 'Silverado 1500', 'Silverado 2500'],
  GMC: ['Savana 3500', 'Yukon XL', 'Sierra 1500'],
  'Mercedes-Benz': ['Sprinter 2500', 'Sprinter 3500', 'S-Class', 'E-Class'],
  Tesla: ['Model S', 'Model 3', 'Model X', 'Model Y'],
  Cadillac: ['Escalade', 'Escalade ESV', 'XTS'],
  Lincoln: ['Navigator', 'Navigator L', 'Town Car', 'Continental'],
  Toyota: ['Sienna', 'Highlander', 'Camry', 'Land Cruiser'],
};

const ODOMETER_OPTIONS = ['Actual Miles', 'Not Actual Mileage', 'Exceeds Mechanical Limits'];
const DURATION_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12 months
const durationLabel = (m) => `${m} ${m === 1 ? 'Month' : 'Months'}`;
const PAYMENT_DUE_OPTIONS = ['Within 10 days after sale', 'Within 15 days after sale', 'Within 20 days after sale'];
const ACCOUNTING_OPTIONS = [
  'Provide detailed accounting with payment',
  'Provide accounting upon request',
  'No accounting statement',
];
const REPAIR_OPTIONS = [
  'No repairs/detailing without approval',
  'Dealer may perform minor repairs/detailing',
  'Dealer may perform all necessary repairs',
];
const INSURANCE_OPTIONS = [
  "Dealer's insurance will cover vehicle",
  "Seller's insurance remains in effect",
  'Both dealer and seller insurance apply',
];

const COMP_OPTIONS = [
  {
    key: 'min',
    title: 'Dealer gets anything above a minimum price',
    desc: 'Set the minimum price. Dealer keeps the amount above this price.',
    label: 'Minimum Price',
    field: 'minPrice',
    prefix: '$',
  },
  {
    key: 'flat',
    title: 'Dealer gets a flat fee',
    desc: 'Enter the flat fee amount.',
    label: 'Flat Fee Amount',
    field: 'flatFee',
    prefix: '$',
  },
  {
    key: 'percent',
    title: 'Dealer gets a percentage of the total sale price',
    desc: 'Enter the commission percentage.',
    label: 'Commission Percentage',
    field: 'commission',
    suffix: '%',
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ISO date + N months -> "MM/DD/YYYY" (local time, so no timezone drift).
// The day is clamped to the target month's length, so Jan 31 + 1 month is
// Feb 28/29 instead of spilling over into March.
const endDateFor = (startISO, months) => {
  const m = String(startISO || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1 + (parseInt(months, 10) || 0);
  const lastDay = new Date(y, mo + 1, 0).getDate();
  const d = new Date(y, mo, Math.min(Number(m[3]), lastDay));
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
};

// "2017 Ford E-350" -> { year: '2017', make: 'Ford', model: 'E-350' }
const parseVehicle = (vehicle = {}) => {
  const m = String(vehicle.name || vehicle.display_name || '').trim().match(/^(\d{4})\s+(\S+)\s+(.+)$/);
  const miles = String(vehicle.description || '').match(/([\d,]+)\s*miles/i);
  return {
    year: vehicle.year ? String(vehicle.year) : m ? m[1] : '',
    make: vehicle.make || (m ? m[2] : ''),
    model: vehicle.model || (m ? m[3] : ''),
    mileage: vehicle.mileage != null ? String(vehicle.mileage) : miles ? miles[1] : '',
  };
};

const buildDefaults = (vehicle) => {
  const p = parseVehicle(vehicle);
  const price = parseFloat(vehicle?.price);
  return {
    // 1. Vehicle information
    year: p.year,
    make: p.make,
    model: p.model,
    vin: vehicle?.vin || '',
    mileage: p.mileage,
    color: vehicle?.color || '',
    licensePlate: vehicle?.license_plate || vehicle?.licensePlate || '',
    odometer: ODOMETER_OPTIONS[0],
    // 2. Pricing & dealer compensation
    listPrice: price > 0 ? String(price) : '',
    compType: 'min',
    minPrice: '',
    flatFee: '',
    commission: '',
    // 3. Agreement term
    startDate: todayISO(),
    duration: '3', // months
    // 4. Payment terms
    paymentDue: PAYMENT_DUE_OPTIONS[2],
    accounting: ACCOUNTING_OPTIONS[0],
    // 5. Condition & repairs
    repairAuth: REPAIR_OPTIONS[1],
    maxRepair: '500',
    requireApproval: true,
    // 6. Liens & title
    hasLiens: 'no',
    titleInHand: 'yes',
    lienholder: '',
    // 7. Insurance
    insurance: INSURANCE_OPTIONS[0],
    insuranceNotes: '',
    // 8. Special terms
    specialTerms: '',
  };
};

// ── Small presentational pieces ──────────────────────────────────────────────
const Field = ({ label, required, error, info, className = '', children }) => (
  <div className={`cm-field ${className}`}>
    <label className="cm-label">
      {label}
      {required && <span className="cm-req"> *</span>}
      {info && <span className="cm-info" title={info}>ⓘ</span>}
    </label>
    {children}
    {error && <div className="cm-error">⚠ {error}</div>}
  </div>
);

const AffixInput = ({ prefix, suffix, error, ...rest }) => (
  <div className={`cm-affix-group ${error ? 'is-invalid' : ''} ${rest.disabled ? 'is-disabled' : ''}`}>
    {prefix && <span className="cm-affix pre">{prefix}</span>}
    <input className="cm-input bare" type="number" min="0" step="0.01" {...rest} />
    {suffix && <span className="cm-affix suf">{suffix}</span>}
  </div>
);

const Radios = ({ name, value, onChange, options }) => (
  <div className="cm-radios">
    {options.map((o) => (
      <label key={o.value} className="cm-radio">
        <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} />
        <span>{o.label}</span>
      </label>
    ))}
  </div>
);

// ── Modal ────────────────────────────────────────────────────────────────────
// Props
//   vehicle  : cart item the agreement is for (used to prefill)
//   data     : previously saved consignment object (when editing)
//   onClose  : () => void
//   onSubmit : (formData) => void   formData includes `endDate`
const ConsignmentAgreementModal = ({ vehicle, data, onClose, onSubmit, readOnly = false }) => {
  const [form, setForm] = useState(() => {
    const merged = { ...buildDefaults(vehicle), ...(data || {}) };
    // An older save may hold a day count (30/60/90...). Months only go 1-12.
    const m = parseInt(merged.duration, 10);
    if (!(m >= 1 && m <= 12)) merged.duration = '3';
    return merged;
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [sendingVia, setSendingVia] = useState(null);
  const bodyRef = useRef(null);

  const set = (key, value) => {
    if (readOnly) return;
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const endDate = useMemo(() => endDateFor(form.startDate, form.duration), [form.startDate, form.duration]);
  const modelOptions = COMMON_MODELS[form.make] || [];
  const makeOptions = useMemo(
    () => (form.make && !COMMON_MAKES.includes(form.make) ? [form.make, ...COMMON_MAKES] : COMMON_MAKES),
    [form.make]
  );
  const yearOptions = useMemo(
    () => (form.year && !YEARS.includes(form.year) ? [form.year, ...YEARS] : YEARS),
    [form.year]
  );

  // Escape closes, and the page behind stops scrolling while the modal is open.
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
    if (!form.year) e.year = 'Required';
    if (!form.make.trim()) e.make = 'Required';
    if (!form.model.trim()) e.model = 'Required';
    if (!form.vin.trim()) e.vin = 'Required';
    else if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(form.vin.trim())) e.vin = 'VIN must be 17 characters';

    const comp = COMP_OPTIONS.find((c) => c.key === form.compType);
    if (!(parseFloat(form[comp.field]) > 0)) e[comp.field] = 'Enter an amount greater than 0';
    if (form.compType === 'percent' && parseFloat(form.commission) > 100) e.commission = 'Cannot exceed 100%';

    if (!form.startDate) e.startDate = 'Required';
    if (!form.duration) e.duration = 'Required';
    if (!form.paymentDue) e.paymentDue = 'Required';

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
      await onSubmit({ ...form, endDate }, method);
      // success: the parent closes the modal
    } catch {
      setSubmitting(false);
      setSendingVia(null);
    }
  };

  // Enter key inside a field must not submit the form
  const handleSubmit = (ev) => ev.preventDefault();

  const inputCls = (k) => `cm-input ${errors[k] ? 'is-invalid' : ''}`;

  return createPortal(
    <div className="cm-overlay" role="dialog" aria-modal="true" aria-labelledby="cm-title">
      <form className="cm-modal" onSubmit={handleSubmit} noValidate>
        {/* HEADER */}
        <div className="cm-header">
          <div>
            <h2 id="cm-title" className="cm-title">
              {readOnly ? 'View' : data ? 'Edit' : 'Add'} Consignment Agreement
            </h2>
            <p className="cm-subtitle">
              Fill in the details below. A California-compliant consignment agreement will be generated and sent to the seller for e-signature.
            </p>
          </div>
          <button type="button" className="cm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="cm-body" ref={bodyRef}>
          {/* In view mode a disabled fieldset locks every input inside it */}
          <fieldset className="cm-fieldset" disabled={readOnly}>

            
          {/* 1. VEHICLE INFORMATION */}
          <section className="cm-section">
            <h3 className="cm-section-title">1. Vehicle Information</h3>
            <div className="cm-grid g4">
              <Field label="Year" required error={errors.year}>
                <select className={`cm-select ${errors.year ? 'is-invalid' : ''}`} value={form.year} onChange={(e) => set('year', e.target.value)}>
                  <option value="">Select</option>
                  {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </Field>
              <Field label="Make" required error={errors.make}>
                <select className={`cm-select ${errors.make ? 'is-invalid' : ''}`} value={form.make} onChange={(e) => set('make', e.target.value)}>
                  <option value="">Select</option>
                  {makeOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Model" required error={errors.model}>
                <input className={inputCls('model')} list="cm-model-list" value={form.model} placeholder="e.g. E-350" onChange={(e) => set('model', e.target.value)} />
                <datalist id="cm-model-list">
                  {modelOptions.map((m) => <option key={m} value={m} />)}
                </datalist>
              </Field>
              <Field label="VIN" required error={errors.vin}>
                <input className={inputCls('vin')} value={form.vin} maxLength={17} placeholder="17-character VIN" autoCapitalize="characters" onChange={(e) => set('vin', e.target.value.toUpperCase())} />
              </Field>

              <Field label="Mileage">
                <input className="cm-input" inputMode="numeric" value={form.mileage} placeholder="e.g. 181,000" onChange={(e) => set('mileage', e.target.value)} />
              </Field>
              <Field label="Color">
                <input className="cm-input" value={form.color} placeholder="e.g. White" onChange={(e) => set('color', e.target.value)} />
              </Field>
              <Field label="License Plate">
                <input className="cm-input" value={form.licensePlate} placeholder="N/A" onChange={(e) => set('licensePlate', e.target.value)} />
              </Field>
              <Field label="Odometer Disclosure">
                <select className="cm-select" value={form.odometer} onChange={(e) => set('odometer', e.target.value)}>
                  {ODOMETER_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                </select>
              </Field>
            </div>
          </section>

          {/* 2. PRICING & DEALER COMPENSATION */}
          <section className="cm-section">
            <h3 className="cm-section-title">2. Pricing &amp; Dealer Compensation</h3>
            <div className="cm-pricing">
              <Field label="List Price (Asking Price)" info="The price the vehicle is advertised for.">
                <AffixInput prefix="$" value={form.listPrice} placeholder="0.00" onChange={(e) => set('listPrice', e.target.value)} />
              </Field>

              <div className="cm-comp" role="radiogroup" aria-label="Dealer compensation">
                <div className="cm-comp-heading">
                  Dealer Compensation (choose one)<span className="cm-req"> *</span>
                </div>
                {COMP_OPTIONS.map((o) => {
                  const active = form.compType === o.key;
                  return (
                    <div
                      key={o.key}
                      className={`cm-comp-opt ${active ? 'active' : ''}`}
                      onClick={() => set('compType', o.key)}
                    >
                      <label className="cm-comp-head">
                        <input type="radio" name="cm-comp" checked={active} onChange={() => set('compType', o.key)} />
                        <span>
                          <span className="cm-comp-title">{o.title}</span>
                          <span className="cm-comp-desc">{o.desc}</span>
                        </span>
                      </label>
                      <div className="cm-comp-input" onClick={(e) => e.stopPropagation()}>
                        <Field label={o.label} required error={errors[o.field]}>
                          <AffixInput
                            prefix={o.prefix}
                            suffix={o.suffix}
                            max={o.key === 'percent' ? 100 : undefined}
                            value={form[o.field]}
                            disabled={!active}
                            error={errors[o.field]}
                            placeholder={o.key === 'percent' ? '0' : '0.00'}
                            onChange={(e) => set(o.field, e.target.value)}
                          />
                        </Field>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 3. AGREEMENT TERM */}
          <section className="cm-section">
            <h3 className="cm-section-title">3. Agreement Term</h3>
            <div className="cm-grid g3">
              <Field label="Consignment Start Date" required error={errors.startDate}>
                <input type="date" className={inputCls('startDate')} value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
              </Field>
              <Field label="Agreement Duration" required error={errors.duration}>
                <select className="cm-select" value={form.duration} onChange={(e) => set('duration', e.target.value)}>
                  {DURATION_OPTIONS.map((d) => <option key={d} value={String(d)}>{durationLabel(d)}</option>)}
                </select>
              </Field>
              <Field label="End Date (Auto-calculated)">
                <input className="cm-input" value={endDate} readOnly tabIndex={-1} />
              </Field>
            </div>
          </section>

          {/* 4. PAYMENT TERMS */}
          <section className="cm-section">
            <h3 className="cm-section-title">4. Payment Terms (California Requirement)</h3>
            <div className="cm-grid g2">
              <Field label="Payment Due to Seller" required error={errors.paymentDue}>
                <select className="cm-select" value={form.paymentDue} onChange={(e) => set('paymentDue', e.target.value)}>
                  {PAYMENT_DUE_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Accounting Statement">
                <select className="cm-select" value={form.accounting} onChange={(e) => set('accounting', e.target.value)}>
                  {ACCOUNTING_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                </select>
              </Field>
            </div>
          </section>

          {/* 5. VEHICLE CONDITION & REPAIRS */}
          <section className="cm-section">
            <h3 className="cm-section-title">5. Vehicle Condition &amp; Repairs</h3>
            <div className="cm-grid g3 repairs">
              <Field label="Repairs/Detailing Authorization">
                <select className="cm-select" value={form.repairAuth} onChange={(e) => set('repairAuth', e.target.value)}>
                  {REPAIR_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Maximum Repair Amount" info="The most the dealer may spend on repairs without further approval.">
                <AffixInput prefix="$" value={form.maxRepair} placeholder="0" onChange={(e) => set('maxRepair', e.target.value)} />
              </Field>
              <Field label="Require Approval for Major Repairs">
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.requireApproval}
                  className="cm-switch-row"
                  onClick={() => set('requireApproval', !form.requireApproval)}
                >
                  <span className={`cm-switch ${form.requireApproval ? 'on' : ''}`}><span className="cm-knob" /></span>
                  <span className="cm-switch-text">{form.requireApproval ? 'Yes' : 'No'}</span>
                </button>
              </Field>
            </div>
          </section>

          {/* 6. LIENS & TITLE STATUS */}
          <section className="cm-section">
            <h3 className="cm-section-title">6. Liens &amp; Title Status</h3>
            <div className="cm-grid g3">
              <Field label="Are there any liens on this vehicle?" required>
                <Radios
                  name="cm-liens"
                  value={form.hasLiens}
                  onChange={(v) => set('hasLiens', v)}
                  options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }]}
                />
              </Field>
              <Field label="Title in Hand?" required>
                <Radios
                  name="cm-title"
                  value={form.titleInHand}
                  onChange={(v) => set('titleInHand', v)}
                  options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
                />
              </Field>
              <Field label="If Yes, Lienholder Information">
                <input
                  className="cm-input"
                  value={form.lienholder}
                  disabled={form.hasLiens !== 'yes'}
                  placeholder="Lienholder name (if any)"
                  onChange={(e) => set('lienholder', e.target.value)}
                />
              </Field>
            </div>
          </section>

          {/* 7. INSURANCE */}
          <section className="cm-section">
            <h3 className="cm-section-title">7. Insurance</h3>
            <div className="cm-grid g2">
              <Field label="Insurance Coverage">
                <select className="cm-select" value={form.insurance} onChange={(e) => set('insurance', e.target.value)}>
                  {INSURANCE_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Notes (Optional)">
                <input className="cm-input" value={form.insuranceNotes} placeholder="Additional insurance notes..." onChange={(e) => set('insuranceNotes', e.target.value)} />
              </Field>
            </div>
          </section>

          {/* 8. SPECIAL TERMS */}
          <section className="cm-section">
            <h3 className="cm-section-title">8. Special Terms / Notes (Optional)</h3>
            <textarea
              className="cm-textarea"
              rows={3}
              value={form.specialTerms}
              placeholder="Add any special terms or instructions that will appear in the agreement..."
              onChange={(e) => set('specialTerms', e.target.value)}
            />
          </section>

          <div className="cm-notice">
            <span className="cm-notice-icon">i</span>
            <div>
              <strong>This agreement will include all required terms under California Vehicle Code §§ 11729–11730,</strong>{' '}
              including trust, use limitations, 20-day payment requirement, and return of the vehicle if unsold.
            </div>
          </div>
          </fieldset>
        </div>

        {/* FOOTER */}
                   {/* FOOTER */}
        <div className="cm-footer">
          <button type="button" className="cm-btn ghost cm-cancel" onClick={onClose} disabled={submitting}>
            {readOnly ? 'Close' : 'Cancel'}
          </button>

          {!readOnly && (
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

export default ConsignmentAgreementModal;