import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config'; 
import CrmQuickNav from '../../components/Navigation/CrmQuickNav';

// Only 3 statuses: Paid, Unpaid, Partially Paid
const STATUS_CONFIG = {
  'Paid':           { bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' },
  'Unpaid':         { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  'Partially Paid': { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
};

const STATUS_ICON = (status) => {
  if (status === 'Paid')           return <i className="far fa-check-square" style={{ fontSize: '12px' }}></i>;
  if (status === 'Unpaid')         return <i className="fas fa-times-circle" style={{ fontSize: '12px' }}></i>;
  if (status === 'Partially Paid') return <i className="fas fa-adjust"       style={{ fontSize: '12px' }}></i>;
  return null;
};

const MEMBERSHIP_OPTIONS = ['$345 / year', '$695 / year', '$1095 / year'];
const LISTING_OPTIONS = ['$79.99', '$199', '$499'];

const INVOICE_TYPE_BADGE = {
  1: { label: 'Listing',   bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  2: { label: 'Membership', bg: '#f5f3ff', color: '#7c3aed', border: '#ddd6fe' },
  3: { label: 'Ads',       bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  5: { label: 'Apparel',   bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
  6: { label: 'Renewal',   bg: '#fff7ed', color: '#ea580c', border: '#fed7aa' },
  7: { label: 'Vehicles',  bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' },
};

// Invoices created by the legacy PHP panel/checkout only store the package
// type on each item in items_json (as a sale_products.type number), leaving
// crm_invoices.type NULL. Derive a display type from the items when the
// header is empty so those invoices still get the right badge.
const ITEM_TYPE_TO_SALE_TYPE = { L: 1, M: 2, A: 3, P: 5, R: 6, V: 7 };
const TYPE_PRIORITY = [7, 1, 2, 3, 6, 5];
const deriveTypeFromItems = (items) => {
  const codes = new Set();
  (items || []).forEach(item => {
    const t = item && item.type;
    if (t === null || t === undefined || t === '') return;
    const code = typeof t === 'number' ? t : (ITEM_TYPE_TO_SALE_TYPE[t] ?? Number(t));
    if (code) codes.add(code);
  });
  for (const code of TYPE_PRIORITY) if (codes.has(code)) return code;
  return null;
};

// ⚠️ No real data backs these — placeholders matching your screenshot only
const SAMPLE_OPTIONS = Array.from({ length: 10 }, (_, i) => `Sample ${i + 1}`);
const COMMON_NAME_OPTIONS = ['Grech', 'Freedman', 'Turtle Top', 'Temsa', 'Setra', 'MCI', 'Prevost'];
const APPAREL_OPTIONS = ['T-Shirts', 'Polos', 'Hoodies', 'Jackets', 'Hats / Caps', 'Vests', 'Bags', 'Other'];

const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Format the invoice timestamp WITHOUT any timezone conversion.
// created_on_raw is the literal "YYYY-MM-DD HH:MM:SS" wall-clock string that
// MySQL stored. Passing it to `new Date()` makes the browser shift it by its
// own UTC offset, which is what made invoices appear with a time that had not
// happened yet. Splitting the string and formatting the parts by hand always
// shows exactly what is in the database, whatever the viewer's timezone is.
const formatInvoiceDate = (value) => {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return '';
  const [, year, month, day, hour, minute] = m;
  const h = Number(hour);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${MONTHS[Number(month) - 1]} ${Number(day)}, ${year} at ${h12}:${minute} ${suffix}`;
};

export default function InvoicesPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('All');
  const [searchVal, setSearchVal] = useState('');
  
  // ✅ STATE FOR DYNAMIC DATABASE INVOICES
  const [invoicesData, setInvoicesData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [showFilterModal, setShowFilterModal] = useState(false);

  // ── SOFT DELETE ────────────────────────────────────────────────────────
  // deleteTarget holds the invoice awaiting confirmation; isDeleting disables
  // the buttons while the request is in flight so a double click can't fire two
  // DELETEs. The row is dropped from invoicesData once the server confirms.
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

const cancelDelete = () => { if (isDeleting) return; setDeleteTarget(null); setDeleteError(''); };

const confirmDelete = async () => {
  if (!deleteTarget || isDeleting) return;
  setIsDeleting(true);
  setDeleteError('');
  const targetId = deleteTarget.id;
  try {
    const res = await fetch(`${API_BASE_URL}/invoices/${targetId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Could not delete this invoice.');
    setInvoicesData(prev => prev.filter(inv => inv.id !== targetId));
    setDeleteTarget(null);
  } catch (err) {
    setDeleteError(err.message || 'Could not delete this invoice.');
  } finally {
    setIsDeleting(false);
  }
};
const [openFilterSections, setOpenFilterSections] = useState({
  membership: true, listing: true, upholstery: true, samples: true, commonNames: true, apparel: true
});

const emptyFilters = {
  startDate: '', endDate: '', name: '', minAmount: '', maxAmount: '',
  memberships: [], listings: [], samples: [], commonNames: [], apparel: []
};
const [draftFilters, setDraftFilters] = useState(emptyFilters);
const [appliedFilters, setAppliedFilters] = useState(emptyFilters);

const toggleFilterSection = (key) => setOpenFilterSections(prev => ({ ...prev, [key]: !prev[key] }));

const toggleDraftCheckbox = (group, value) => {
  setDraftFilters(prev => ({
    ...prev,
    [group]: prev[group].includes(value) ? prev[group].filter(v => v !== value) : [...prev[group], value]
  }));
};

const handleApplyFilters = () => { setAppliedFilters(draftFilters); setShowFilterModal(false); };
const handleResetFilters = () => { setDraftFilters(emptyFilters); setAppliedFilters(emptyFilters); };
const handleCancelFilters = () => { setDraftFilters(appliedFilters); setShowFilterModal(false); };

// ── EDIT INVOICE FROM LIST — open it in CreateInvoicePage. The page loads
// the full record (items_json with type + variants, customer, user_id,
// discounts, notes) from /invoices/details/:id by URL param alone, so
// nothing needs to be reconstructed here.
const handleEditInvoice = (invoiceId) => {
  navigate(`/sales/crm/create-invoice/${invoiceId}`);
};

  // ✅ FETCH REAL INVOICES FROM BACKEND
  useEffect(() => {
    fetch(`${API_BASE_URL}/invoices/list`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          // Format the raw DB data to match your UI's required structure
          const formattedInvoices = data.invoices.map(inv => {
            let parsedItems = [];
            try {
              if (inv.items_json) parsedItems = JSON.parse(inv.items_json);
            } catch(e) { console.error("Error parsing items JSON", e); }

            // Ads packages are billed PER MONTH. items_json stores the monthly
            // rate with quantity 1, while the invoice total is
            // monthly rate × adPaymentMonths. discount_details.adPaymentMonths is
            // the same figure the create-invoice page used to build the total, so
            // reading it back lets the line show the real per-month rate AND the
            // actual amount being charged instead of just one month of it.
            let adMonths = 1;
            let adTerm = '';
            if (inv.discount_details) {
              try {
                const dd = JSON.parse(inv.discount_details);
                adMonths = Math.max(1, parseInt(dd.adPaymentMonths, 10) || 1);
                adTerm = dd.adContractTerm || '';
              } catch(e) { console.error("Error parsing discount_details", e); }
            }

            // Map DB items array to UI format.
            // Keep BOTH the display name (desc) and the raw description
            // separately — e.g. Membership items have name='Membership' but
            // description='$695 / year', which is what the filter checkboxes
            // actually need to match against.
            const uiItems = parsedItems.map(item => {
              const isAds = item.type === 'A' || item.id === 'ads-package';
              const price = Number(item.price) || 0;
              const qty = (Number(item.quantity) || 1) * (isAds ? adMonths : 1);
              return {
                desc: item.name || item.description || 'Item',
                rawDescription: item.description || '',
                isAds,
                term: isAds ? adTerm : '',
                qty,
                price,
                total: price * qty
              };
            });

            // Display the stored wall-clock time as-is. created_on is a
            // timezone-shifted UTC ISO string, so it is only a fallback for
            // rows that somehow lack created_on_raw.
            const rawStamp = inv.created_on_raw || inv.created_on;
            const dateStr = formatInvoiceDate(rawStamp);

            // Payment status from the DB (payment_status 1=paid, 2=partial,
            // plus paid_amount). Falls back to comparing paid vs total_due.
            const totalDue = Number(inv.total_due) || 0;
            const amountPaid = Number(inv.paid_amount) || 0;
            let calculatedStatus = 'Unpaid';
            if (inv.payment_status == 1 || (totalDue > 0 && amountPaid >= totalDue)) calculatedStatus = 'Paid';
            else if (Number(inv.payment_status) === 2 || amountPaid > 0) calculatedStatus = 'Partially Paid';

            return {
              id: inv.id,
              inv: inv.invoice_number,
              name: inv.customer_name || 'Unknown',
              email: inv.customer_email || 'No email',
              phone: inv.lead_phone || 'No phone',
              date: dateStr,
              rawDate: rawStamp,
              status: calculatedStatus, 
              total: Number(inv.total_due) || 0,
              method: '', // Add payment method logic here later if needed
              type: Number(inv.type) || deriveTypeFromItems(parsedItems),
              items: uiItems
            };
          });
          
          setInvoicesData(formattedInvoices);
        }
      })
      .catch(err => console.error('Failed to load invoices:', err))
      .finally(() => setIsLoading(false));
  }, []);

 const filtered = invoicesData.filter(inv => {
    const matchTab = activeTab === 'All' || inv.status === activeTab;
    const q = searchVal.toLowerCase();
    const matchSearch = !q
      || inv.name.toLowerCase().includes(q)
      || inv.inv.toLowerCase().includes(q)
      || inv.email.toLowerCase().includes(q);

    const matchName = !appliedFilters.name || inv.name.toLowerCase().includes(appliedFilters.name.toLowerCase());
    const matchMin = !appliedFilters.minAmount || inv.total >= parseFloat(appliedFilters.minAmount);
    const matchMax = !appliedFilters.maxAmount || inv.total <= parseFloat(appliedFilters.maxAmount);

    const invDate = inv.rawDate ? new Date(inv.rawDate) : null;
    const matchStart = !appliedFilters.startDate || (invDate && invDate >= new Date(appliedFilters.startDate));
    const matchEnd = !appliedFilters.endDate || (invDate && invDate <= new Date(appliedFilters.endDate + 'T23:59:59'));

    // Category checkboxes — best-effort text match against item descriptions.
    // Real data only exists for memberships/listings; samples/commonNames/apparel
    // will practically never match since your invoices don't carry that data.
    const allSelectedLabels = [
      ...appliedFilters.memberships,
      ...appliedFilters.listings,
      ...appliedFilters.samples,
      ...appliedFilters.commonNames,
      ...appliedFilters.apparel,
    ];
   const matchCategory = allSelectedLabels.length === 0 || inv.items.some(item =>
      allSelectedLabels.some(label =>
        item.desc.toLowerCase().includes(label.toLowerCase()) ||
        (item.rawDescription && item.rawDescription.toLowerCase().includes(label.toLowerCase()))
      )
    );

    return matchTab && matchSearch && matchName && matchMin && matchMax && matchStart && matchEnd && matchCategory;
  });

  // Newest invoice (highest primary key) at the top. The API already returns
  // id DESC; sorting again here keeps the order correct after filtering.
  const sorted = [...filtered].sort((a, b) => Number(b.id) - Number(a.id));

  return (
    <>
    <CrmQuickNav />
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .inv-page { background: #f3f4f6; min-height: 100vh; padding: 24px; font-family: 'Inter', system-ui, sans-serif; }
        .inv-card { max-width: 1100px; margin: 0 auto; background: #fff; border-radius: 14px; box-shadow: 0 2px 12px rgba(0,0,0,0.07); padding: 28px 28px 20px; }

        /* HEADER */
        .inv-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 12px; }
        .inv-header-left { display: flex; align-items: center; gap: 14px; }
        .btn-back { background: none; border: none; font-size: 14px; font-weight: 600; color: #374151; cursor: pointer; display: flex; align-items: center; gap: 6px; padding: 0; }
        .btn-back:hover { color: #4f46e5; }
        .inv-icon-wrap { width: 42px; height: 42px; background: #ede9fe; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #6d28d9; font-size: 19px; flex-shrink: 0; }
        .inv-title { font-size: 19px; font-weight: 800; color: #111827; line-height: 1.2; }
        .inv-sub { font-size: 12.5px; color: #6b7280; margin-top: 1px; }
        .btn-create { background: #4f46e5; color: #fff; border: none; border-radius: 8px; padding: 10px 18px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; white-space: nowrap; }
        .btn-create:hover { background: #4338ca; }

        /* SEARCH */
        .inv-toolbar { display: flex; gap: 12px; margin-bottom: 20px; }
        .search-wrap { flex: 1; position: relative; min-width: 0; }
        .search-wrap i { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: #9ca3af; font-size: 13px; }
        .search-input { width: 100%; padding: 9px 12px 9px 38px; border: 1.5px solid #d1d5db; border-radius: 8px; font-size: 14px; outline: none; color: #374151; background: #fff; transition: border-color .15s; }
        .search-input:focus { border-color: #6366f1; }
        .time-select { border: 1.5px solid #d1d5db; border-radius: 8px; padding: 9px 14px; font-size: 13.5px; background: #fff; color: #374151; font-weight: 500; display: flex; align-items: center; gap: 7px; cursor: pointer; white-space: nowrap; user-select: none; }

        /* TABS */
        .tabs-bar { display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #e5e7eb; margin-bottom: 18px; flex-wrap: wrap; gap: 10px; }
        .tabs-list { display: flex; gap: 0; }
        .tab-btn { padding: 10px 16px; font-size: 13.5px; font-weight: 600; color: #6b7280; cursor: pointer; border: none; background: none; position: relative; white-space: nowrap; transition: color .15s; }
        .tab-btn:first-child { border: 1.5px solid #e5e7eb; border-radius: 6px; margin-right: 16px; padding: 7px 18px; }
        .tab-btn:first-child.active { border-color: #6366f1; color: #4f46e5; background: #fff; }
        .tab-btn.active { color: #4f46e5; }
        .tab-btn.active::after { content: ''; position: absolute; bottom: -2px; left: 0; right: 0; height: 2px; background: #4f46e5; }
        .tab-btn:first-child.active::after { display: none; }
        .tabs-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .btn-filter { border: 1.5px solid #d1d5db; border-radius: 7px; padding: 7px 14px; font-size: 13.5px; background: #fff; color: #374151; font-weight: 500; display: flex; align-items: center; gap: 7px; cursor: pointer; }

        /* SHOWING */
        .showing { font-size: 13px; color: #6b7280; margin-bottom: 4px; }

        /* INVOICE ROW */
        .inv-row { display: grid; grid-template-columns: 200px 1fr 160px; gap: 0; padding: 20px 0; border-bottom: 1.5px solid #e5e7eb; align-items: start; }
        .inv-row:last-child { border-bottom: none; }

        /* LEFT */
        .inv-num { font-size: 12px; color: #6b7280; font-weight: 600; margin-bottom: 4px; }
        .inv-name { font-size: 15px; font-weight: 700; color: #111827; margin-bottom: 7px; }
        .inv-contact { display: flex; align-items: flex-start; gap: 9px; }
        .phone-circle { width: 26px; height: 26px; border-radius: 50%; background: #ede9fe; color: #6d28d9; display: flex; align-items: center; justify-content: center; font-size: 10px; flex-shrink: 0; margin-top: 2px; }
        .inv-email { font-size: 13px; color: #374151; line-height: 1.5; }
        .inv-phone { font-size: 13px; color: #374151; }
        .inv-date-row { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: #6b7280; margin-top: 12px; }

        /* MIDDLE */
        .inv-items { padding: 0 24px; }
        .item-line { display: flex; align-items: baseline; gap: 0; margin-bottom: 7px; font-size: 13.5px; }
        .item-desc { flex: 1; color: #374151; }
        .item-calc { width: 150px; text-align: right; color: #9ca3af; font-size: 13px; }
        .item-amt { width: 90px; text-align: right; color: #111827; font-weight: 500; }
        .item-term { display: block; font-size: 11.5px; color: #9ca3af; font-weight: 400; margin-top: 1px; }
        .inv-divider { border: none; border-top: 1.5px solid #e5e7eb; margin: 10px 0; }
        .total-line { display: flex; justify-content: space-between; font-weight: 700; font-size: 14px; color: #111827; }

        /* RIGHT */
        .inv-right { display: flex; flex-direction: column; align-items: flex-end; }
        .status-badge { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 7px; font-size: 12px; font-weight: 700; border: 1px solid; margin-bottom: 10px; }
        .inv-big-total { font-size: 24px; font-weight: 800; color: #111827; letter-spacing: -0.5px; line-height: 1.1; margin-bottom: 3px; }
        .inv-method { font-size: 12.5px; color: #6b7280; margin-bottom: 14px; }
        .inv-actions { display: flex; gap: 18px; font-size: 13.5px; font-weight: 600; }
        .link-view { color: #4f46e5; text-decoration: none; cursor: pointer; }
        .link-send { color: #059669; text-decoration: none; cursor: pointer; }
        .link-delete { color: #dc2626; text-decoration: none; cursor: pointer; }
        .link-delete:hover { color: #b91c1c; text-decoration: underline; }
        .link-edit:hover { color: #ea580c; text-decoration: underline; }

        /* PAGINATION */
        .pag-row { display: flex; justify-content: space-between; align-items: center; margin-top: 20px; font-size: 13px; color: #4b5563; flex-wrap: wrap; gap: 12px; }
        .pag-show { display: flex; align-items: center; gap: 6px; }
        .pag-select { margin: 0 4px; padding: 4px 8px; border-radius: 5px; border: 1px solid #d1d5db; font-size: 13px; background: #fff; }
        .pag-btns { display: flex; gap: 6px; align-items: center; }
        .pag-btn { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border: 1.5px solid #e5e7eb; background: #fff; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; color: #374151; transition: all .15s; }
        .pag-btn.active { background: #4f46e5; color: #fff; border-color: #4f46e5; }
        .pag-btn:hover:not(.active) { border-color: #6366f1; color: #4f46e5; }

        /* RESPONSIVE */
        @media (max-width: 768px) {
          .inv-page { padding: 12px; }
          .inv-card { padding: 16px; border-radius: 10px; }
          .inv-row { grid-template-columns: 1fr; gap: 14px; background: #f9fafb; padding: 16px; border-radius: 10px; border: 1.5px solid #e5e7eb; margin-bottom: 12px; }
          .inv-row:last-child { border-bottom: 1.5px solid #e5e7eb; }
          .inv-items { padding: 0; }
          .inv-right { align-items: flex-start; padding-top: 12px; border-top: 1.5px solid #e5e7eb; }
          .inv-toolbar { flex-wrap: wrap; }
          .time-select { width: 100%; justify-content: center; }
          .tabs-list { overflow-x: auto; gap: 0; padding-bottom: 2px; }
          .tab-btn { padding: 8px 12px; font-size: 13px; }
          .tabs-right { width: 100%; }
          .inv-header { gap: 14px; }
          .btn-create { font-size: 13px; padding: 8px 14px; }
        }

        @media (max-width: 900px) and (min-width: 769px) {
          .inv-row { grid-template-columns: 180px 1fr 150px; }
          .inv-items { padding: 0 16px; }
        }
      `}</style>

      <div className="inv-page">
        <div className="inv-card">

          {/* HEADER */}
          <div className="inv-header">
            <div className="inv-header-left">
              <button className="btn-back" onClick={() => window.history.back()}>
                <i className="fas fa-arrow-left"></i> Back
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="inv-icon-wrap">
                  <i className="fas fa-file-invoice"></i>
                </div>
                <div>
                  <div className="inv-title">Invoices</div>
                  <div className="inv-sub">Manage and track all your invoices</div>
                </div>
              </div>
            </div>
            <button className="btn-create" onClick={() => navigate('/sales/crm/create-invoice')}>
              <i className="fas fa-plus"></i> Create Invoice
            </button>
          </div>

          {/* SEARCH */}
          <div className="inv-toolbar">
            <div className="search-wrap">
              <i className="fas fa-search"></i>
              <input
                className="search-input"
                type="text"
                placeholder="Search by customer, invoice # or email..."
                value={searchVal}
                onChange={e => setSearchVal(e.target.value)}
              />
            </div>
            <div className="time-select">
              <i className="far fa-calendar-alt"></i> All Time
              <i className="fas fa-chevron-down" style={{ fontSize: '10px', marginLeft: '4px' }}></i>
            </div>
          </div>

          {/* TABS */}
          <div className="tabs-bar">
            <div className="tabs-list">
              {['All', 'Paid', 'Unpaid', 'Partially Paid'].map(tab => (
                <button
                  key={tab}
                  className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="tabs-right">
              <button className="btn-filter" onClick={() => setShowFilterModal(true)}>
                <i className="fas fa-sliders-h"></i> Filter
                {(appliedFilters.memberships.length + appliedFilters.listings.length + appliedFilters.samples.length + appliedFilters.commonNames.length + appliedFilters.apparel.length + (appliedFilters.name ? 1 : 0) + (appliedFilters.minAmount ? 1 : 0) + (appliedFilters.maxAmount ? 1 : 0) + (appliedFilters.startDate ? 1 : 0) + (appliedFilters.endDate ? 1 : 0)) > 0 && (
                  <span style={{ background: '#4f46e5', color: 'white', borderRadius: '10px', fontSize: '10px', padding: '1px 6px', marginLeft: '4px', fontWeight: 700 }}>
                    {appliedFilters.memberships.length + appliedFilters.listings.length + appliedFilters.samples.length + appliedFilters.commonNames.length + appliedFilters.apparel.length + (appliedFilters.name ? 1 : 0) + (appliedFilters.minAmount ? 1 : 0) + (appliedFilters.maxAmount ? 1 : 0) + (appliedFilters.startDate ? 1 : 0) + (appliedFilters.endDate ? 1 : 0)}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="showing">
            {isLoading ? 'Loading invoices...' : `Showing 1–${sorted.length} of ${sorted.length} invoices`}
          </div>

          {/* LIST */}
          <div>
            {!isLoading && sorted.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                No invoices found matching your criteria.
              </div>
            ) : (
              sorted.map((inv, i) => {
                const sc = STATUS_CONFIG[inv.status] || STATUS_CONFIG['Unpaid'];
                return (
                  <div className="inv-row" key={inv.id || i}>

                    {/* LEFT */}
                    <div>
                      <div className="inv-num">
                        {inv.inv}
                        {INVOICE_TYPE_BADGE[inv.type] && (
                          <span style={{
                            marginLeft: '8px',
                            background: INVOICE_TYPE_BADGE[inv.type].bg,
                            color: INVOICE_TYPE_BADGE[inv.type].color,
                            border: `1px solid ${INVOICE_TYPE_BADGE[inv.type].border}`,
                            borderRadius: '6px', padding: '2px 8px',
                            fontSize: '10.5px', fontWeight: 700, verticalAlign: 'middle',
                          }}>
                            {INVOICE_TYPE_BADGE[inv.type].label}
                          </span>
                        )}
                      </div>
                      <div className="inv-name">{inv.name}</div>
                      <div className="inv-contact">
                        <div className="phone-circle">
                          <i className="fas fa-phone-alt"></i>
                        </div>
                        <div>
                          <div className="inv-email">{inv.email}</div>
                          <div className="inv-phone">{inv.phone}</div>
                        </div>
                      </div>
                      <div className="inv-date-row">
                        <i className="far fa-calendar-alt"></i> {inv.date}
                      </div>
                    </div>

                    {/* MIDDLE */}
                    <div className="inv-items">
                      {inv.items.map((item, j) => (
                        <div className="item-line" key={j}>
                          <span className="item-desc">
                            {item.desc}
                            {item.isAds && item.term && (
                              <span className="item-term">{item.term}</span>
                            )}
                          </span>
                          <span className="item-calc">
                            {item.qty
                              ? `${item.qty} × $${item.price.toFixed(2)}${item.isAds ? ' / mo' : ''}`
                              : ''}
                          </span>
                          <span className="item-amt">${fmt(item.total)}</span>
                        </div>
                      ))}
                      <hr className="inv-divider" />
                      <div className="total-line">
                        <span>Total</span>
                        <span>${fmt(inv.total)}</span>
                      </div>
                    </div>

                    {/* RIGHT */}
                    <div className="inv-right">
                      <div
                        className="status-badge"
                        style={{ background: sc.bg, color: sc.color, borderColor: sc.border }}
                      >
                        {STATUS_ICON(inv.status)}
                        {inv.status}
                      </div>
                      <div className="inv-big-total">${fmt(inv.total)}</div>
                      <div className="inv-method">{inv.method || '\u00A0'}</div>
                      <div className="inv-actions">
                        
                        {/* ✅ DYNAMIC VIEW BUTTON OPENS IN EDIT MODE */}
                        <a 
                          className="link-view" 
                          onClick={(e) => {
                            e.preventDefault();
                            navigate(`/sales/crm/create-invoice/${inv.id}`, { 
                              state: { 
                                invoiceIdFromCRM: inv.id,
                                existingInvoiceNumber: inv.inv 
                              } 
                            });
                          }}
                        >
                          View
                        </a>

                        <a
                          className="link-edit"
                          style={{ color: '#f97316', textDecoration: 'none', cursor: 'pointer' }}
                          onClick={(e) => {
                            e.preventDefault();
                            navigate(`/sales/crm/create-invoice/${inv.id}`, { 
                              state: { 
                                invoiceIdFromCRM: inv.id,
                                existingInvoiceNumber: inv.inv 
                              } 
                            });
                          }}
                        >
                          Edit
                        </a>

                        <a
                          className="link-delete"
                          style={{ color: '#dc2626', textDecoration: 'none', cursor: 'pointer' }}
                          onClick={(e) => {
                            e.preventDefault();
                            setDeleteError('');
                            setDeleteTarget(inv);
                          }}
                        >
                          Delete
                        </a>
                      </div>
                    </div>

                  </div>
                );
              })
            )}
          </div>

          {/* PAGINATION */}
          <div className="pag-row">
            <div className="pag-show">
              Show
              <select className="pag-select">
                <option>10</option>
                <option>25</option>
              </select>
              entries
            </div>
            <div className="pag-btns">
              <button className="pag-btn">
                <i className="fas fa-chevron-left" style={{ fontSize: '10px' }}></i>
              </button>
              <button className="pag-btn active">1</button>
              <button className="pag-btn">
                <i className="fas fa-chevron-right" style={{ fontSize: '10px' }}></i>
              </button>
            </div>
            <div>1–{sorted.length} of {sorted.length}</div>
          </div>

{/* ── DELETE CONFIRMATION ──────────────────────────────────────────────
    Soft delete: the server only sets crm_invoices.is_deleted = 1, so the
    row stays in the database and can be restored. */}
{deleteTarget && (
  <div
    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
    onClick={(e) => { if (e.target === e.currentTarget) cancelDelete(); }}
  >
    <div
      role="alertdialog"
      aria-modal="true"
      style={{ background: 'white', width: '100%', maxWidth: '440px', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 45px rgba(0,0,0,0.25)' }}
    >
      <div style={{ padding: '24px 24px 0', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
        <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#fef2f2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '19px', flexShrink: 0 }}>
          <i className="fas fa-trash-alt"></i>
        </div>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#111827', margin: 0, lineHeight: 1.3 }}>
            Delete this invoice?
          </h2>
          <p style={{ fontSize: '14px', color: '#6b7280', margin: '7px 0 0', lineHeight: 1.55 }}>
            Are you sure you want to delete invoice{' '}
            <strong style={{ color: '#111827' }}>{deleteTarget.inv}</strong> for{' '}
            <strong style={{ color: '#111827' }}>{deleteTarget.name}</strong>?
          </p>
        </div>
      </div>

      <div style={{ margin: '18px 24px 0', background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '10px', padding: '12px 14px' }}>
        <p style={{ fontSize: '12.5px', color: '#6b7280', margin: 0, lineHeight: 1.55 }}>
          <i className="fas fa-info-circle" style={{ marginRight: '6px', color: '#6366f1' }}></i>
          This is a soft delete — the invoice stays in the database and is only hidden from this list. Any scheduled messages that have not been sent yet will be cancelled.
        </p>
      </div>

      {deleteError && (
        <div style={{ margin: '14px 24px 0', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '10px 14px' }}>
          <p style={{ fontSize: '13px', color: '#dc2626', margin: 0 }}>
            <i className="fas fa-exclamation-circle" style={{ marginRight: '6px' }}></i>
            {deleteError}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', padding: '22px 24px 24px' }}>
        <button
          onClick={cancelDelete}
          disabled={isDeleting}
          style={{ flex: 1, padding: '12px', border: '1.5px solid #d1d5db', borderRadius: '10px', background: 'white', color: '#374151', fontWeight: 600, fontSize: '14px', cursor: isDeleting ? 'not-allowed' : 'pointer', opacity: isDeleting ? 0.6 : 1 }}
        >
          Cancel
        </button>
        <button
          onClick={confirmDelete}
          disabled={isDeleting}
          style={{ flex: 1.4, padding: '12px', border: 'none', borderRadius: '10px', background: isDeleting ? '#f87171' : '#dc2626', color: 'white', fontWeight: 700, fontSize: '14px', cursor: isDeleting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}
        >
          {isDeleting ? (
            <>
              <i className="fas fa-spinner fa-spin"></i> Deleting...
            </>
          ) : (
            <>
              <i className="fas fa-trash-alt"></i> Yes, Delete Invoice
            </>
          )}
        </button>
      </div>
    </div>
  </div>
)}

{showFilterModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={(e) => { if (e.target === e.currentTarget) handleCancelFilters(); }}>
          <div style={{ background: 'white', width: '100%', maxWidth: '520px', maxHeight: '92vh', borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f3f4f6', position: 'relative', flexShrink: 0 }}>
              <div style={{ width: '40px', height: '4px', background: '#e5e7eb', borderRadius: '2px', margin: '0 auto 16px' }} />
              <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#111827', margin: 0 }}>Filter Invoices</h2>
              <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>Refine your invoice list</p>
              <button onClick={handleCancelFilters} style={{ position: 'absolute', top: '20px', right: '20px', width: '36px', height: '36px', borderRadius: '50%', background: '#f3f4f6', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#374151' }}>✕</button>
            </div>

            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>

              {/* DATE RANGE */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '14px', fontWeight: 700, color: '#111827', display: 'block', marginBottom: '10px' }}>Date range</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input type="date" value={draftFilters.startDate} onChange={e => setDraftFilters(prev => ({ ...prev, startDate: e.target.value }))} style={{ flex: 1, padding: '12px 14px', border: '1.5px solid #d1d5db', borderRadius: '10px', fontSize: '14px', outline: 'none', color: '#374151' }} />
                  <span style={{ color: '#9ca3af' }}>—</span>
                  <input type="date" value={draftFilters.endDate} onChange={e => setDraftFilters(prev => ({ ...prev, endDate: e.target.value }))} style={{ flex: 1, padding: '12px 14px', border: '1.5px solid #d1d5db', borderRadius: '10px', fontSize: '14px', outline: 'none', color: '#374151' }} />
                </div>
              </div>

              {/* NAME */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '14px', fontWeight: 700, color: '#111827', display: 'block', marginBottom: '10px' }}>Name</label>
                <input type="text" placeholder="Search by customer name..." value={draftFilters.name} onChange={e => setDraftFilters(prev => ({ ...prev, name: e.target.value }))} style={{ width: '100%', padding: '12px 14px', border: '1.5px solid #d1d5db', borderRadius: '10px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
              </div>

              {/* PRICE RANGE */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ fontSize: '14px', fontWeight: 700, color: '#111827', display: 'block', marginBottom: '10px' }}>Price range</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}>$</span>
                    <input type="number" placeholder="Min amount" value={draftFilters.minAmount} onChange={e => setDraftFilters(prev => ({ ...prev, minAmount: e.target.value }))} style={{ width: '100%', padding: '12px 14px 12px 28px', border: '1.5px solid #d1d5db', borderRadius: '10px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <span style={{ color: '#9ca3af' }}>—</span>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}>$</span>
                    <input type="number" placeholder="Max amount" value={draftFilters.maxAmount} onChange={e => setDraftFilters(prev => ({ ...prev, maxAmount: e.target.value }))} style={{ width: '100%', padding: '12px 14px 12px 28px', border: '1.5px solid #d1d5db', borderRadius: '10px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>
              </div>

              {/* MEMBERSHIP */}
              <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '16px', marginBottom: '8px' }}>
                <div onClick={() => toggleFilterSection('membership')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: openFilterSections.membership ? '12px' : 0 }}>
                  <span style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>Membership</span>
                  <span style={{ color: '#6b7280', transform: openFilterSections.membership ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>⌄</span>
                </div>
                {openFilterSections.membership && MEMBERSHIP_OPTIONS.map(opt => (
                  <label key={opt} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f9fafb', cursor: 'pointer', fontSize: '14px', color: '#374151' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <input type="checkbox" checked={draftFilters.memberships.includes(opt)} onChange={() => toggleDraftCheckbox('memberships', opt)} style={{ width: '16px', height: '16px' }} />
                      {opt.replace(' / year', '')} Membership
                    </span>
                    <span style={{ fontWeight: 600 }}>{opt.split(' / ')[0]}</span>
                  </label>
                ))}
              </div>

              {/* SALES LISTING */}
              <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '16px', marginBottom: '8px' }}>
                <div onClick={() => toggleFilterSection('listing')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: openFilterSections.listing ? '12px' : 0 }}>
                  <span style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>Sales Listing</span>
                  <span style={{ color: '#6b7280', transform: openFilterSections.listing ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>⌄</span>
                </div>
                {openFilterSections.listing && LISTING_OPTIONS.map(opt => (
                  <label key={opt} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f9fafb', cursor: 'pointer', fontSize: '14px', color: '#374151' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <input type="checkbox" checked={draftFilters.listings.includes(opt)} onChange={() => toggleDraftCheckbox('listings', opt)} style={{ width: '16px', height: '16px' }} />
                      {opt} Listing
                    </span>
                    <span style={{ fontWeight: 600 }}>{opt}</span>
                  </label>
                ))}
              </div>

              {/* UPHOLSTERY (parent, wraps Samples + Common names) */}
              <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '16px', marginBottom: '8px' }}>
                <div onClick={() => toggleFilterSection('upholstery')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                  <span style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>Upholstery</span>
                  <span style={{ color: '#6b7280', transform: openFilterSections.upholstery ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>⌃</span>
                </div>

                {openFilterSections.upholstery && (
                  <div style={{ marginTop: '14px' }}>
                    {/* SAMPLES */}
                    <div style={{ marginBottom: '16px' }}>
                      <div onClick={() => toggleFilterSection('samples')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: '10px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>Samples</span>
                        <span style={{ color: '#6b7280', transform: openFilterSections.samples ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>⌃</span>
                      </div>
                      {openFilterSections.samples && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '10px 16px' }}>
                          {SAMPLE_OPTIONS.map(opt => (
                            <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              <input type="checkbox" checked={draftFilters.samples.includes(opt)} onChange={() => toggleDraftCheckbox('samples', opt)} style={{ width: '15px', height: '15px' }} />
                              {opt}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* COMMON NAMES */}
                    <div>
                      <div onClick={() => toggleFilterSection('commonNames')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: '10px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>Common names</span>
                        <span style={{ color: '#6b7280', transform: openFilterSections.commonNames ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>⌄</span>
                      </div>
                      {openFilterSections.commonNames && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '10px 16px' }}>
                          {COMMON_NAME_OPTIONS.map(opt => (
                            <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              <input type="checkbox" checked={draftFilters.commonNames.includes(opt)} onChange={() => toggleDraftCheckbox('commonNames', opt)} style={{ width: '15px', height: '15px' }} />
                              {opt}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* APPAREL */}
              <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '16px' }}>
                <div onClick={() => toggleFilterSection('apparel')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: openFilterSections.apparel ? '12px' : 0 }}>
                  <span style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>Apparel</span>
                  <span style={{ color: '#6b7280', transform: openFilterSections.apparel ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>⌃</span>
                </div>
                {openFilterSections.apparel && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '10px 16px' }}>
                    {APPAREL_OPTIONS.map(opt => (
                      <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={draftFilters.apparel.includes(opt)} onChange={() => toggleDraftCheckbox('apparel', opt)} style={{ width: '15px', height: '15px' }} />
                        {opt}
                      </label>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* FOOTER */}
            <div style={{ display: 'flex', gap: '10px', padding: '16px 24px', borderTop: '1px solid #f3f4f6', flexShrink: 0 }}>
              <button onClick={handleResetFilters} style={{ flex: 1, padding: '13px', border: '1.5px solid #d1d5db', borderRadius: '10px', background: 'white', color: '#374151', fontWeight: 600, fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>↺ Reset</button>
              <button onClick={handleCancelFilters} style={{ flex: 1, padding: '13px', border: '1.5px solid #d1d5db', borderRadius: '10px', background: 'white', color: '#374151', fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleApplyFilters} style={{ flex: 1.4, padding: '13px', border: 'none', borderRadius: '10px', background: '#4f46e5', color: 'white', fontWeight: 700, fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>☰ Apply Filters</button>
            </div>

          </div>
        </div>
      )}
        </div>
      </div>
    </div>
    </>
  );
}