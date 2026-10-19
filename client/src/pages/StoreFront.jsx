import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import './Storefront.css';

// ── IMPORT OUR COMPONENTS ──
import Header from '../components/Shared/Header';
import ProductCard from '../components/Shared/ProductCard';
import WishlistDrawer from '../components/Shared/WishlistDrawer';
import ApparelSection from '../components/Shared/ApparelSection';
import { ShieldIcon, CheckIcon, TruckIcon, SupportIcon, BusIcon, VanIcon, HeartIcon, CartIcon, CheckCircleIcon, ArrowLeftIcon } from '../components/Shared/Icons';

// ── SITE COLOR PALETTE
const PALETTE = {
  primary: '#3b28cc',
  primaryDark: '#0f172a',
  primaryLight: '#eff6ff',
  accent: '#2563eb',
  accentBadge: '#dbeafe',
  accentText: '#1e40af',
  greenBadge: '#dcfce7',
  greenText: '#166534',
  greenDot: '#16a34a',
  border: '#e2e8f0',
  bg: '#ffffff',
  textMuted: '#64748b',
  textLabel: '#475569',
  textDark: '#0f172a',
};

// SHOW ONLY BLACK, GRAY, AND BLUE
const AVAILABLE_COLORS = [
  { name: 'black', hex: '#000000' },
  { name: 'gray', hex: '#94a3b8' },
  { name: 'blue', hex: '#3b82f6' }
];
const AVAILABLE_PATTERNS = ['Hexagon', 'Diamond', 'Chevron', 'Leaf', 'Custom'];

// ── SVG ICONS ───────────────────────────────────────────────────────────────
const PlayCircleIcon = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" /></svg>);
const LeatherIcon = () => (<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></svg>);
const LinkIcon = () => (<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>);
const SparkleIcon = () => (<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M12 3v3m0 12v3m9-9h-3M6 12H3m14.485-6.364l-2.121 2.121M7.636 17.657l-2.121 2.121M18.364 18.364l-2.121-2.121M7.636 6.343L5.515 4.222M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>);
const SunIcon = () => (<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2m10-10h-2M4 12H2m15.536-6.364l-1.414 1.414M7.879 17.536l-1.414 1.414M17.536 17.536l-1.414-1.414M7.879 6.464L6.465 5.05" /></svg>);
const ChairIcon = () => (<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M4 18v3m16-3v3M4 11h16v7H4v-7zM6 11V5a2 2 0 012-2h8a2 2 0 012 2v6" /></svg>);
const QualityShieldIcon = () => (<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4M7.88 22H16.12L22 16.12V7.88L16.12 2H7.88L2 7.88v8.24L7.88 22z" /></svg>);
const SettingsIcon = () => (<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" /></svg>);
const ChevronLeftIcon = () => (<svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>);
const ChevronRightIcon = () => (<svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg>);
const FilterIcon = () => (<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" /></svg>);
const XIcon = () => (<svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>);
const ChevronDownIcon = () => (<svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>);
const SmallCheckIcon = () => (<svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></svg>);

// ── TOOLTIP ──────────────────────────────────────────────────────────────────
const InfoTooltip = () => {
  const [visible, setVisible] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }} onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '14px', height: '14px', borderRadius: '50%', border: `1.5px solid ${PALETTE.textMuted}`, color: PALETTE.textMuted, fontSize: '10px', fontWeight: 700, cursor: 'default', userSelect: 'none', marginLeft: '6px' }}>i</span>
      {visible && (
        <div style={{ position: 'absolute', bottom: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)', background: '#1e293b', color: '#fff', fontSize: '12px', lineHeight: 1.55, padding: '10px 13px', borderRadius: '10px', width: '230px', boxShadow: '0 6px 24px rgba(0,0,0,0.18)', zIndex: 9999, pointerEvents: 'none' }}>
          Details about material quality and maintenance.
          <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid #1e293b' }} />
        </div>
      )}
    </span>
  );
};

// ── SWATCH ───────────────────────────────────────────────────────────────────
const Swatch = ({ color, border, active, onClick }) => (
  <div onClick={onClick} style={{ backgroundColor: color, width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: border ? '1px solid #d1d5db' : '1px solid transparent', outline: active ? `2px solid ${PALETTE.primary}` : 'none', outlineOffset: '3px', cursor: 'pointer', transition: 'all 0.15s' }}>
    {active && <div style={{ width: '8px', height: '8px', backgroundColor: (color === 'white' || color === '#ffffff') ? 'black' : 'white', borderRadius: '50%' }} />}
  </div>
);

// ── STICKY CART BAR ───────────────────────────────────────────────────────────
const CartStickyBar = ({ cartCount, cartTotal, onCheckoutClick }) => (
  <div className="sticky-cart-bar" style={{ boxShadow: '0 -4px 20px rgba(0,0,0,0.08)', zIndex: 100 }}>
    <div className="cart-info">
      <div className="cart-icon-wrapper" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '8px' }}>
        <CartIcon size={24} />
        <span className="cart-badge" style={{ top: '-5px', right: '-5px' }}>{cartCount}</span>
      </div>
      <div className="cart-info-text">
        <div className="title" style={{ fontSize: '13px', fontWeight: 800 }}>{cartCount} Items in Cart</div>
        <div className="subtitle" style={{ fontSize: '12px' }}>Total: <span className="price" style={{ fontSize: '15px', fontWeight: 800 }}>${cartTotal.toFixed(2)}</span></div>
        <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', fontWeight: '600', lineHeight: '1.2', letterSpacing: '-0.01em', maxWidth: '160px' }}>
          Discounts apply at checkout
        </div>
      </div>
    </div>
    <button className="btn-checkout" onClick={onCheckoutClick} style={{ padding: '12px 24px', fontSize: '14px', borderRadius: '30px' }}>View Cart →</button>
  </div>
);

// ── MULTI-SELECT DROPDOWN ────────────────────────────────────────────────────
const MultiSelectDropdown = ({ label, options, selected, onChange, groupedOptions }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (val) => onChange(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);

  // Build flat list from groupedOptions if provided, otherwise use options
  const flatOptions = groupedOptions
    ? Object.values(groupedOptions).flat()
    : options;

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
      {/* Trigger */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', padding: '9px 12px',
          border: `1.5px solid ${open ? PALETTE.primary : PALETTE.border}`,
          borderRadius: '8px', background: '#fff', cursor: 'pointer',
          minHeight: '40px', gap: '6px', transition: 'border-color 0.15s',
        }}
      >
        <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {selected.length === 0
            ? <span style={{ color: '#94a3b8', fontSize: '13px' }}>Select {label.toLowerCase()}(s)</span>
            : selected.map(v => (
              <span key={v} style={{ background: PALETTE.primaryLight, color: PALETTE.primary, borderRadius: '5px', padding: '2px 7px', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                {v}
                <span
                  onClick={e => { e.stopPropagation(); toggle(v); }}
                  style={{ cursor: 'pointer', opacity: 0.6, display: 'flex', alignItems: 'center' }}
                >
                  <XIcon />
                </span>
              </span>
            ))
          }
        </div>
        <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>
          <ChevronDownIcon />
        </span>
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: '#fff', border: `1.5px solid ${PALETTE.border}`,
          borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
          zIndex: 300, overflow: 'hidden', maxHeight: '260px', overflowY: 'auto',
          padding: '8px 0',
        }}>
          {groupedOptions
            ? Object.entries(groupedOptions).map(([group, opts], gi) => {
              if (opts.length === 0) return null; // Hide empty groups
              return (
                <div key={group}>
                  {gi > 0 && <div style={{ height: '1px', background: PALETTE.border, margin: '2px 0' }} />}
                  <div style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', padding: '8px 14px 4px' }}>{group}</div>
                  {opts.map(opt => (
                    <DropdownOption key={opt} opt={opt} selected={selected} toggle={toggle} />
                  ))}
                </div>
              )
            })
            : flatOptions.map(opt => (
              <DropdownOption key={opt} opt={opt} selected={selected} toggle={toggle} />
            ))
          }
        </div>
      )}
    </div>
  );
};

const DropdownOption = ({ opt, selected, toggle }) => {
  const isSelected = selected.includes(opt);
  return (
    <div
      onClick={() => toggle(opt)}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '9px 14px', fontSize: '13px',
        color: isSelected ? PALETTE.primary : '#334155',
        cursor: 'pointer', background: isSelected ? PALETTE.primaryLight : '#fff',
        transition: 'background 0.1s',
      }}
      onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = '#f8fafc'; }}
      onMouseOut={e => { if (!isSelected) e.currentTarget.style.background = '#fff'; }}
    >
      <div style={{
        width: '15px', height: '15px', borderRadius: '3px', flexShrink: 0,
        border: `1.5px solid ${isSelected ? PALETTE.primary : '#cbd5e1'}`,
        background: isSelected ? PALETTE.primary : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '9px', color: '#fff', fontWeight: 800,
      }}>
        {isSelected ? '✓' : ''}
      </div>
      {opt}
    </div>
  );
};

// ── FILTER PANEL (DYNAMIC) ───────────────────────────────────────────────────
const FilterPanel = ({
  filterMakes, setFilterMakes,
  filterBuilders, setFilterBuilders,
  filterModels, setFilterModels,
  filterCategories, setFilterCategories,
  filterYear, setFilterYear,
  masterFilters, products // Now receiving data from DB + Products
}) => {
  const [showCatInput, setShowCatInput] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  const catInputRef = useRef(null);

  const hasFilters = filterMakes.length || filterBuilders.length || filterModels.length || filterCategories.length || filterYear;

  const clearAll = () => {
    setFilterMakes([]);
    setFilterBuilders([]);
    setFilterModels([]);
    setFilterCategories([]);
    setFilterYear(''); // NEW
  };

  // When Make changes, auto-clear any models that no longer belong to the selected makes
  const handleMakeChange = (newMakes) => {
    setFilterMakes(newMakes);
    if (newMakes.length > 0) {
      const activeMakeIds = masterFilters.makes.filter(m => newMakes.includes(m.name)).map(m => m.id);
      const validModels = masterFilters.models.filter(mod => activeMakeIds.includes(mod.makeid)).map(mod => mod.name);
      setFilterModels(prev => prev.filter(m => validModels.includes(m)));
    }
  };

  // 1. Dynamic Makes (from DB)
  const availableMakes = masterFilters.makes.map(m => m.name);

  // 2. Dynamic Builders (full master list from DB, same as admin)
  const availableBuilders = masterFilters.builders.map(b => b.name);

  // 3. Dynamic Models (Grouped by selected Makes)
  const selectedMakeIds = masterFilters.makes
    .filter(m => filterMakes.includes(m.name))
    .map(m => m.id);

  const availableModelsGrouped = {};
  masterFilters.models.forEach(mod => {
    if (selectedMakeIds.length > 0 && !selectedMakeIds.includes(mod.makeid)) return;

    // Find the parent Make name to act as the Group Header in the dropdown
    const makeObj = masterFilters.makes.find(m => m.id === mod.makeid);
    const groupName = makeObj ? makeObj.name : 'Other';

    if (!availableModelsGrouped[groupName]) availableModelsGrouped[groupName] = [];
    availableModelsGrouped[groupName].push(mod.name);
  });

  // 4. Dynamic Categories (from DB)
  const availableCategories = masterFilters.categories.map(c => c.name);

  // NEW: build a sorted list of years actually covered by any product's fitments
  const availableYears = (() => {
    let min = null, max = null;
    products.forEach(p => {
      (p.fitments || []).forEach(f => {
        if (f.year_start) {
          const y = parseInt(f.year_start, 10);
          if (min === null || y < min) min = y;
        }
        if (f.year_end) {
          const y = parseInt(f.year_end, 10);
          if (max === null || y > max) max = y;
        }
      });
    });
    if (min === null || max === null) return [];
    const years = [];
    for (let y = max; y >= min; y--) years.push(y); // newest first
    return years;
  })();

  const handleAddCat = () => {
    setShowCatInput(true);
    setTimeout(() => catInputRef.current?.focus(), 50);
  };

  const submitCat = (e) => {
    if (e.key === 'Enter') {
      const val = newCatInput.trim();
      if (val && !filterCategories.includes(val)) {
        setFilterCategories(prev => [...prev, val]);
      }
      setNewCatInput('');
      setShowCatInput(false);
    }
    if (e.key === 'Escape') {
      setNewCatInput('');
      setShowCatInput(false);
    }
  };

  const sectionLabel = {
    fontSize: '11px', fontWeight: 800,
    textTransform: 'uppercase', letterSpacing: '0.08em',
    color: PALETTE.textMuted, marginBottom: '10px',
  };

  return (
    <div style={{ padding: '20px 24px', background: '#fff', borderBottom: `1px solid ${PALETTE.border}` }}>

      {/* ── 4-Column Dropdown Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: hasFilters ? '20px' : '0' }}>

        {/* MAKE */}
        <div>
          <div style={sectionLabel}>Make</div>
          <MultiSelectDropdown
            label="Make"
            options={availableMakes}
            selected={filterMakes}
            onChange={handleMakeChange}
          />
        </div>

        {/* BUILDER */}
        <div>
          <div style={sectionLabel}>Builder</div>
          <MultiSelectDropdown
            label="Builder"
            options={availableBuilders}
            selected={filterBuilders}
            onChange={setFilterBuilders}
          />
        </div>

        {/* BUILDER MODEL */}
        <div>
          <div style={sectionLabel}>Builder Model</div>
          <MultiSelectDropdown
            label="Builder Model"
            options={[]}
            groupedOptions={availableModelsGrouped}
            selected={filterModels}
            onChange={setFilterModels}
          />
        </div>

        {/* BUS CATEGORY */}
        <div>
          <div style={{ ...sectionLabel, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Bus Category
            <span onClick={handleAddCat} style={{ color: PALETTE.primary, cursor: 'pointer', fontSize: '10px', textTransform: 'none' }}>+ Custom</span>
          </div>
          {showCatInput ? (
            <input
              ref={catInputRef}
              value={newCatInput}
              onChange={e => setNewCatInput(e.target.value)}
              onKeyDown={submitCat}
              onBlur={() => { setShowCatInput(false); setNewCatInput(''); }}
              placeholder="Type category & Enter"
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1.5px solid ${PALETTE.primary}`, fontSize: '14px', outline: 'none', height: '40px', boxSizing: 'border-box' }}
            />
          ) : (
            <MultiSelectDropdown
              label="Category"
              options={availableCategories}
              selected={filterCategories}
              onChange={setFilterCategories}
            />
          )}
        </div>

      </div>

      <div>
        <div style={sectionLabel}>Year</div>
        <select
          value={filterYear}
          onChange={e => setFilterYear(e.target.value)}
          style={{
            width: '100%', padding: '9px 12px', borderRadius: '8px',
            border: `1.5px solid ${filterYear ? PALETTE.primary : PALETTE.border}`,
            fontSize: '13px', color: filterYear ? PALETTE.primary : '#334155',
            background: '#fff', height: '40px', boxSizing: 'border-box',
            cursor: 'pointer', outline: 'none',
          }}
        >
          <option value="">Any year</option>
          {availableYears.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* ── Active filter summary bar ── */}
      {!!hasFilters && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '10px 14px', background: '#f8fafc',
          borderRadius: '8px', border: `1px solid ${PALETTE.border}`,
          fontSize: '13px', color: PALETTE.textMuted,
        }}>
          <FilterIcon />
          <span>
            Filtering by{' '}
            {[
              filterMakes.length && `${filterMakes.length} make${filterMakes.length > 1 ? 's' : ''}`,
              filterBuilders.length && `${filterBuilders.length} builder${filterBuilders.length > 1 ? 's' : ''}`,
              filterModels.length && `${filterModels.length} model${filterModels.length > 1 ? 's' : ''}`,
              filterCategories.length && `${filterCategories.length} categor${filterCategories.length > 1 ? 'ies' : 'y'}`,
              filterYear && `year ${filterYear}`,
            ].filter(Boolean).join(', ')}
          </span>
          <button
            onClick={clearAll}
            style={{
              marginLeft: 'auto', background: 'none', border: 'none',
              color: PALETTE.primary, fontWeight: 700, fontSize: '12px',
              cursor: 'pointer', padding: 0,
            }}
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
};
// ─────────────────────────────────────────────────────────────────────────────

const Storefront = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const productId = searchParams.get('id');

  const path = location.pathname
  const activeTab = path.includes('/sales/crm/apparel') ? 'apparel'
    : path.endsWith('/sales/crm/all') ? 'all'
      : 'covers';

  const handleTabChange = (tabId) => {
    if (tabId === 'apparel') navigate('/sales/crm/apparel');
    else if (tabId === 'all') navigate('/sales/crm/all');
    else navigate('/sales/crm/seat-covers');
  };

  useEffect(() => {
    if (path.endsWith('/sales/crm/seat-covers') && searchParams.get('tab') === 'all') {
      navigate('/sales/crm/all', { replace: true });
    }
  }, [path, searchParams, navigate]);

  const [cart, setCart] = useState(() => {
    const saved = localStorage.getItem('seatcover_cart');
    return saved ? JSON.parse(saved) : [];
  });
  const [wishlist, setWishlist] = useState(() => {
    const saved = localStorage.getItem('seatcover_wishlist');
    return saved ? JSON.parse(saved) : {};
  });

  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);

  // ── FILTER STATE ──
  const [filterMakes, setFilterMakes] = useState([]);
  const [filterBuilders, setFilterBuilders] = useState([]);
  const [filterModels, setFilterModels] = useState([]);
  const [filterCategories, setFilterCategories] = useState([]);
  const [filterYear, setFilterYear] = useState('');

  // ── DYNAMIC DB STATE ──
  const [masterFilters, setMasterFilters] = useState({ makes: [], models: [], categories: [], builders: [] });

  // Detail Variants
  const [detailColor, setDetailColor] = useState('black');
  const [detailStitching, setDetailStitching] = useState('black');
  const [detailPattern, setDetailPattern] = useState('Diamond');
  const [currentImageIdx, setCurrentImageIdx] = useState(0);

  useEffect(() => localStorage.setItem('seatcover_cart', JSON.stringify(cart)), [cart]);
  useEffect(() => localStorage.setItem('seatcover_wishlist', JSON.stringify(wishlist)), [wishlist]);

  const cartCount = cart.reduce((t, i) => t + i.qty, 0);
  const cartTotal = cart.reduce((t, i) => t + (i.price * i.qty), 0);
  const wishlistCount = Object.values(wishlist).filter(Boolean).length;
  const wishlistItems = products.filter(p => wishlist[p.id]);

  // ── FETCH PRODUCTS & FILTERS ──
  useEffect(() => {
    const fetchStoreData = async () => {
      try {
        // Fetch Filter Metadata
        const filterRes = await fetch(`${API_BASE_URL}/products/store-filters`).catch(() => null);
        if (filterRes && filterRes.ok) {
          const filterData = await filterRes.json();
          if (filterData.success) {
            setMasterFilters({
              makes: filterData.makes || [],
              models: filterData.models || [],
              categories: filterData.categories || [],
              builders: filterData.builders || []
            });
          }
        }

        // Fetch Products
        const response = await fetch(`${API_BASE_URL}/products`);
        const data = await response.json();
        const items = data.data || data.products || data;

        if (items && Array.isArray(items)) {
          const formattedProducts = items.map((p, index) => {
            let imagesArray = [];
            if (p.image && p.image !== '[]') {
              try {
                const parsed = JSON.parse(p.image);
                if (Array.isArray(parsed)) imagesArray = parsed;
                else if (typeof parsed === 'string') imagesArray = [parsed];
              } catch {
                if (typeof p.image === 'string' && p.image.length > 4) imagesArray = [p.image];
              }
            }

            let finalGallery = imagesArray.map(imgStr => {
              let str = imgStr.replace(/['"\[\]]+/g, '').trim();
              return str.startsWith('http') ? str : `https://developer.globallimos.com/sales/uploads/products/${str}`;
            });

            if (finalGallery.length === 0) finalGallery = ['https://placehold.co/800x600/f3f4f6/9ca3af?text=No+Img'];
            if (finalGallery.length === 1 && finalGallery[0] !== 'https://placehold.co/800x600/f3f4f6/9ca3af?text=No+Img') {
              finalGallery = [finalGallery[0], finalGallery[0], finalGallery[0], finalGallery[0]];
            }

            let dynamicBadge = null;
            if (index === 0) dynamicBadge = { text: 'New Arrival', color: 'green' };

            let price = parseFloat(p.dp || p.ndr || p.price || 185.00);
            let orig = parseFloat(p.ndr) > parseFloat(p.dp) ? parseFloat(p.ndr) : null;
            if (!orig && price < 200) orig = 400.00;

            const baseName = p.display_name || p.name || 'various models';
            const rawFitment = p.fitment || p.fitment_details || '';
            const dynamicFitment = rawFitment.trim() !== '' ? rawFitment : `Precision fit designed for ${baseName}.`;
            const rawShortFitment = p.short_fitment || '';
            const dynamicShortFitment = rawShortFitment.trim() !== '' ? rawShortFitment : 'Custom Fit for Your Vehicle';

            return {
              id: p.id,
              name: baseName,
              category: p.category_name || 'Bus & Coach',
              // make:          p.make || '',
              builder: p.manufacturer_name || '',
              fitments: p.fitments || [],
              // model:         p.builder_model || p.model || '',
              price,
              originalPrice: orig,
              badge: dynamicBadge,
              image: finalGallery[0],
              gallery: finalGallery,
              description: p.list_page_description || 'Premium quality seat cover with luxury finish and superior comfort.',
              fitment: dynamicFitment,
              shortFitment: dynamicShortFitment,
              materials: ['Leatherette'],
              stockQty: parseInt(p.qty || 100),
              listDescription: (p.list_page_description || '').trim(),
              detailDescription: (p.detail_page_description || '').trim(),
            };
          });
          setProducts(formattedProducts);
        }
      } catch (error) {
        console.error('Failed to fetch store data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchStoreData();
  }, []);

  useEffect(() => {
    if (productId) {
      setDetailColor('black');
      setDetailStitching('black');
      setDetailPattern('Diamond');
      setCurrentImageIdx(0);
      window.scrollTo(0, 0);
    }
  }, [productId]);

  // ── FILTER LOGIC ──
  const filteredProducts = products.filter(p => {
    // Only show seat covers in the seat-cover grid (apparel is rendered via ApparelSection)
    if ((p.category_name || '').toLowerCase() === 'apparel' || (p.category || '').toLowerCase() === 'apparel') {
      return false;
    }
    if (filterMakes.length) {
      const matchesMake = p.fitments.some(f => filterMakes.includes(f.make_name));
      if (!matchesMake) return false;
    }
    if (filterBuilders.length) {
      const matchesBuilder = p.fitments.some(f => filterBuilders.includes(f.builder_name));
      if (!matchesBuilder) return false;
    }
    if (filterModels.length) {
      const matchesModel = p.fitments.some(f => filterModels.includes(f.model_name));
      if (!matchesModel) return false;
    }
    if (filterCategories.length) {
      const matchesCat = filterCategories.some(c =>
        p.category?.toLowerCase().includes(c.toLowerCase())
      );
      if (!matchesCat) return false;
    }
    // NEW: Year filter — matches if ANY fitment's range includes the selected year
    // A fitment with no year range set is treated as "fits all years"
    if (filterYear) {
      const year = parseInt(filterYear, 10);
      const matchesYear = p.fitments.some(f => {
        const start = f.year_start ? parseInt(f.year_start, 10) : null;
        const end = f.year_end ? parseInt(f.year_end, 10) : null;
        if (!start && !end) return true; // no range = unrestricted fitment
        if (start && year < start) return false;
        if (end && year > end) return false;
        return true;
      });
      if (!matchesYear) return false;
    }
    return true;
  });

  // ── ACTIONS ──
  const goHome = () => { searchParams.delete('id'); setSearchParams(searchParams); window.scrollTo(0, 0); };
  const goToProduct = (id) => {
    searchParams.set('id', id);
    setSearchParams(searchParams);
    window.scrollTo(0, 0);
  };
  const goToCart = () => { navigate('/sales/crm/cart'); window.scrollTo(0, 0); };
  const toggleWishlist = (id) => setWishlist(prev => ({ ...prev, [id]: !prev[id] }));

  const getVariantQty = (productId, color, arg3, arg4) => {
    const stitching = arg4 !== undefined ? arg3 : 'black';
    const pattern = arg4 !== undefined ? arg4 : arg3;
    const cartItemId = `${productId}-${color}-${stitching}-${pattern}`;
    const item = cart.find(i => i.cartItemId === cartItemId);
    return item ? item.qty : 0;
  };

  const handleAddToCart = (product, color, arg3, arg4) => {
    const stitching = arg4 !== undefined ? arg3 : 'black';
    const pattern = arg4 !== undefined ? arg4 : arg3;
    const cartItemId = `${product.id}-${color}-${stitching}-${pattern}`;
    setCart(prevCart => {
      const existing = prevCart.find(item => item.cartItemId === cartItemId);
      if (existing) return prevCart.map(item => item.cartItemId === cartItemId ? { ...item, qty: item.qty + 1 } : item);
      return [...prevCart, { ...product, cartItemId, selectedColor: color, selectedStitching: stitching, selectedPattern: pattern, qty: 1 }];
    });
  };

  const handleUpdateQty = (product, color, arg3, arg4, arg5) => {
    let stitching = 'black';
    let pattern = 'Diamond';
    let delta = 1;
    if (arg5 !== undefined) { stitching = arg3; pattern = arg4; delta = arg5; }
    else { stitching = 'black'; pattern = arg3; delta = arg4; }
    const cartItemId = `${product.id}-${color}-${stitching}-${pattern}`;
    setCart(prevCart => {
      const existing = prevCart.find(item => item.cartItemId === cartItemId);
      if (!existing) return prevCart;
      const newQty = existing.qty + delta;
      if (newQty <= 0) return prevCart.filter(item => item.cartItemId !== cartItemId);
      return prevCart.map(item => item.cartItemId === cartItemId ? { ...item, qty: newQty } : item);
    });
  };

  const handleApparelAdd = (product, colorName, sizeName, qty) => {
    const count = Math.max(0, parseInt(qty, 10) || 0);
    if (count <= 0) return;
    const cartItemId = `${product.id}-${colorName}-${sizeName}`;
    setCart(prevCart => {
      const existing = prevCart.find(item => item.cartItemId === cartItemId);
      if (existing) return prevCart.map(item => item.cartItemId === cartItemId ? { ...item, qty: item.qty + count } : item);
      return [...prevCart, {
        ...product, cartItemId, selectedColor: colorName, selectedStitching: sizeName, selectedPattern: sizeName,
        type: product.type || 'Apparel', qty: count,
      }];
    });
  };

  // Custom tee (configurator) → deterministic cart line so identical configs replace instead of duplicating.
  const handleCustomTeeAdd = (product, config) => {
    const sig = JSON.stringify(config || {});
    let hash = 0;
    for (let i = 0; i < sig.length; i++) {
      hash = (Math.imul(31, hash) + sig.charCodeAt(i)) | 0;
    }
    const cartItemId = `tee-${product.id}-${Math.abs(hash).toString(36)}`;
    const bundlePrice = Number(config && config.estTotal) || 0;
    setCart(prevCart => {
      const existing = prevCart.find(item => item.cartItemId === cartItemId);
      if (existing) return prevCart;
      return [...prevCart, {
        ...product,
        name: product.name || 'Custom Tee',
        image: product.image || '',
        cartItemId,
        price: bundlePrice,
        originalPrice: 0,
        qty: 1,
        type: 'A',
        isCustomApparel: true,
        totalPieces: (config && config.totalPieces) || 0,
        apparel: config || {},
      }];
    });
  };

  const viewingProduct = productId ? products.find(p => p.id.toString() === productId) : null;
  const currentVariantQty = viewingProduct ? getVariantQty(viewingProduct.id, detailColor, detailStitching, detailPattern) : 0;

  return (
    <div style={{ backgroundColor: PALETTE.bg, minHeight: '100vh', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", letterSpacing: '-0.01em', paddingBottom: '80px' }}>

      {/* ── RESPONSIVE STYLES ── */}
      <style>{`
        .pd-wrap { max-width: 1100px; margin: 0 auto; padding: 20px; }
        .pd-gallery-grid { display: grid; gap: 15px; margin-bottom: 25px; }
        .pd-main-img { width: 100%; border-radius: 16px; object-fit: cover; aspect-ratio: 4/3; border: 1px solid #f1f5f9; transition: opacity 0.3s ease; }
        .pd-side-gallery { display: none; }

        .pd-carousel-arrow {
          position: absolute; top: 50%; transform: translateY(-50%);
          width: 40px; height: 40px; border-radius: 50%;
          background: rgba(255,255,255,0.95); border: 1px solid #e2e8f0;
          color: #0f172a; display: flex; align-items: center; justify-content: center;
          cursor: pointer; z-index: 10; box-shadow: 0 4px 12px rgba(0,0,0,0.08);
          transition: all 0.2s;
        }
        .pd-carousel-arrow:hover { background: #fff; transform: translateY(-50%) scale(1.05); color: #3b28cc; }
        .pd-carousel-arrow.left  { left: 15px; }
        .pd-carousel-arrow.right { right: 15px; }

        .pd-ribbon { display: flex; gap: 20px; overflow-x: auto; padding: 15px 0; border-top: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9; margin: 25px 0; scrollbar-width: none; }
        .pd-ribbon::-webkit-scrollbar { display: none; }
        .pd-ribbon-item { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; font-size: 11px; font-weight: 600; color: #0f172a; min-width: 90px; }

        .pd-section-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #475569; margin-bottom: 10px; }
        .pd-steps-row { display: flex; flex-direction: row; gap: 8px; margin-bottom: 25px; }
        .pd-step { display: flex; flex-direction: column; align-items: center; gap: 8px; font-size: 11px; font-weight: 600; color: #0f172a; background: #f8fafc; padding: 10px 8px; border-radius: 12px; border: 1px solid #f1f5f9; flex: 1; text-align: center; line-height: 1.35; }
        .pd-step-num { width: 26px; height: 26px; border-radius: 50%; border: 1.5px solid #cbd5e1; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #475569; flex-shrink: 0; background: white; line-height: 1; }
        .pd-action-grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
        .pd-video-card { background: #f5f3ff; border: 1px solid #ede9fe; border-radius: 16px; padding: 20px; display: flex; flex-direction: column; justify-content: center; }

        .pd-footer-badges { display: grid; grid-template-columns: 1fr; gap: 20px; padding: 30px 20px; border-top: 1px solid #e2e8f0; margin-top: 40px; }
        .pd-badge { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 600; color: #475569; line-height: 1.4; }
        .pd-badge-icon { color: #64748b; flex-shrink: 0; }
        .pd-mobile-video { display: flex; }

        /* MULTI-SELECT DROPDOWN CSS */
        .advanced-filters-bar { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 20px; margin-bottom: 10px; }
        .filter-dropdown-container { position: relative; min-width: 180px; flex: 1; }
        .filter-dropdown-btn { width: 100%; padding: 12px 16px; background: #fff; border: 1.5px solid #e2e8f0; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; font-size: 14px; color: #475569; transition: all 0.2s; user-select: none; }
        .filter-dropdown-btn:hover { border-color: #cbd5e1; }
        .filter-dropdown-btn.active { border-color: #3b28cc; background: #f5f3ff; color: #3b28cc; }
        .filter-dropdown-menu { position: absolute; top: calc(100% + 8px); left: 0; width: 100%; background: #fff; border: 1.5px solid #e2e8f0; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.08); z-index: 50; max-height: 280px; overflow-y: auto; padding: 8px 0; }
        .filter-dropdown-item { padding: 10px 16px; display: flex; align-items: center; gap: 12px; cursor: pointer; font-size: 14px; color: #111827; transition: background 0.2s; }
        .filter-dropdown-item:hover { background: #f8fafc; }
        .filter-checkbox { width: 18px; height: 18px; border-radius: 5px; border: 1.5px solid #cbd5e1; display: flex; align-items: center; justify-content: center; transition: all 0.15s; background: #fff; flex-shrink: 0; }
        .filter-checkbox.checked { background: #3b28cc; border-color: #3b28cc; color: #fff; }
        .filter-count-badge { background: #3b28cc; color: #fff; font-size: 11px; font-weight: 800; padding: 2px 6px; border-radius: 12px; margin-left: 6px; }

        @media(min-width: 768px) {
          .pd-mobile-video { display: none; }
          .pd-gallery-grid { grid-template-columns: 3fr 1fr; gap: 20px; }
          .pd-main-img { aspect-ratio: 16/10; }
          .pd-side-gallery { display: flex; flex-direction: column; gap: 15px; }
          .pd-side-thumb { width: 100%; border-radius: 12px; object-fit: cover; aspect-ratio: 16/10; border: 2px solid transparent; cursor: pointer; transition: all 0.2s; }
          .pd-side-thumb:hover { opacity: 0.8; }
          .pd-side-thumb.active { border-color: #3b28cc; padding: 2px; }
          .pd-steps-row { flex-direction: row; align-items: stretch; gap: 15px; }
          .pd-step { flex: 1; flex-direction: row; text-align: left; font-size: 14px; padding: 14px 16px; gap: 12px; }
          .pd-action-grid { grid-template-columns: 2fr 1fr; }
          .pd-footer-badges { grid-template-columns: repeat(4, 1fr); max-width: 1100px; margin: 40px auto 0; padding: 30px 0; }
          .filter-dropdown-container { flex: none; width: auto; }
        }
      `}</style>

      <Header
        cartCount={cartCount} cartTotal={cartTotal}
        wishlistCount={wishlistCount} onBrandClick={goHome}
        onCartClick={goToCart} onWishlistClick={() => setIsWishlistOpen(true)}
      />
      <WishlistDrawer
        isOpen={isWishlistOpen} onClose={() => setIsWishlistOpen(false)}
        wishlistItems={wishlistItems} toggleWishlist={toggleWishlist} goToProduct={goToProduct}
      />

      {viewingProduct ? (
        // ── PRODUCT DETAIL PAGE ───────────────────────────────────────────────
        <div className="pd-wrap">
          {/* Breadcrumbs */}
          <div style={{ fontSize: '13px', color: PALETTE.textMuted, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span onClick={goHome} style={{ cursor: 'pointer', color: PALETTE.textMuted }}>← Back</span>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <span style={{ color: PALETTE.textMuted }}>Seat Cover</span>
            <span>›</span>
            <span style={{ color: PALETTE.textMuted }}>Bus & Coach</span>
          </div>

          {/* ── GALLERY ── */}
          <div className="pd-gallery-grid">
            <div style={{ position: 'relative' }}>
              {viewingProduct.badge && (
                <span style={{ position: 'absolute', top: '15px', left: '15px', background: viewingProduct.badge.color === 'blue' ? PALETTE.accentBadge : PALETTE.greenBadge, color: viewingProduct.badge.color === 'blue' ? PALETTE.accentText : PALETTE.greenText, fontSize: '12px', fontWeight: 800, padding: '4px 12px', borderRadius: '8px', zIndex: 10 }}>
                  {viewingProduct.badge.text}
                </span>
              )}
              <button
                onClick={() => toggleWishlist(viewingProduct.id)}
                style={{ position: 'absolute', top: '15px', right: '15px', width: '40px', height: '40px', borderRadius: '50%', border: `1px solid ${wishlist[viewingProduct.id] ? '#ef4444' : '#e2e8f0'}`, background: wishlist[viewingProduct.id] ? '#fef2f2' : '#fff', color: wishlist[viewingProduct.id] ? '#ef4444' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
              >
                <HeartIcon filled={wishlist[viewingProduct.id]} />
              </button>

              {viewingProduct.gallery.length > 1 && (
                <>
                  <button onClick={(e) => { e.stopPropagation(); setCurrentImageIdx(prev => prev === 0 ? viewingProduct.gallery.length - 1 : prev - 1); }} className="pd-carousel-arrow left"><ChevronLeftIcon /></button>
                  <button onClick={(e) => { e.stopPropagation(); setCurrentImageIdx(prev => prev === viewingProduct.gallery.length - 1 ? 0 : prev + 1); }} className="pd-carousel-arrow right"><ChevronRightIcon /></button>
                </>
              )}

              <img src={viewingProduct.gallery[currentImageIdx]} alt={viewingProduct.name} className="pd-main-img" />

              {viewingProduct.gallery.length > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '15px' }}>
                  {viewingProduct.gallery.map((_, idx) => (
                    <div key={idx} onClick={() => setCurrentImageIdx(idx)} style={{ width: '8px', height: '8px', borderRadius: '50%', cursor: 'pointer', transition: 'background 0.2s', background: idx === currentImageIdx ? PALETTE.primary : '#cbd5e1' }} />
                  ))}
                </div>
              )}
            </div>

            {/* Desktop Side Gallery */}
            <div className="pd-side-gallery">
              {viewingProduct.gallery.slice(0, 3).map((imgUrl, idx) => (
                <img key={idx} src={imgUrl} alt={`Thumbnail ${idx}`} className={`pd-side-thumb ${idx === currentImageIdx ? 'active' : ''}`} onClick={() => setCurrentImageIdx(idx)} />
              ))}
              <button style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', padding: '12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', color: '#ef4444', fontWeight: 800, fontSize: '13px', cursor: 'pointer', marginTop: 'auto', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <PlayCircleIcon /> WATCH VIDEO
              </button>
            </div>
          </div>

          {/* Mobile Video Card */}
          <div style={{ background: '#f5f3ff', border: '1px solid #ede9fe', borderRadius: '16px', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '22px' }} className="pd-mobile-video">
            <div style={{ background: '#4c1d95', color: '#fff', width: '44px', height: '44px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <PlayCircleIcon />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, color: '#4c1d95', fontSize: '14px', marginBottom: '2px' }}>PRODUCT VIDEO</div>
              <div style={{ fontSize: '12px', color: '#5b21b6', lineHeight: 1.5 }}>See material, stitching & installation.</div>
            </div>
            <button style={{ background: '#4c1d95', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Watch ▶</button>
          </div>

          {/* Product Header */}
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: PALETTE.textDark, margin: '0 0 5px 0', letterSpacing: '-0.02em' }}>{viewingProduct.name}</h1>
          <p style={{ fontSize: '14px', color: PALETTE.textMuted, margin: '0 0 15px 0', fontWeight: 500 }}>Seat Cover • Bus & Coach</p>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', marginBottom: '4px' }}>
            {viewingProduct.originalPrice && (
              <span style={{ fontSize: '20px', color: '#94a3b8', textDecoration: 'line-through', fontWeight: 600 }}>${viewingProduct.originalPrice.toFixed(2)}</span>
            )}
            <span style={{ fontSize: '32px', fontWeight: 800, color: PALETTE.primary, lineHeight: 1 }}>${viewingProduct.price.toFixed(2)}</span>
          </div>
          {viewingProduct.originalPrice && (
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#ef4444', marginBottom: '10px' }}>
              You save ${(viewingProduct.originalPrice - viewingProduct.price).toFixed(2)} ({Math.round(((viewingProduct.originalPrice - viewingProduct.price) / viewingProduct.originalPrice) * 100)}%)
            </div>
          )}

          {/* Quality Ribbon */}
          <div className="pd-ribbon">
            <div className="pd-ribbon-item"><LeatherIcon /> Premium Faux<br />Leather</div>
            <div className="pd-ribbon-item"><LinkIcon /> Durable &<br />Long Lasting</div>
            <div className="pd-ribbon-item"><SparkleIcon /> Easy to Clean<br />& Maintain</div>
            <div className="pd-ribbon-item"><SunIcon /> UV & Wear<br />Resistant</div>
            <div className="pd-ribbon-item"><ChairIcon /> Comfort &<br />Luxury Finish</div>
          </div>

          {/* Overview — Detail Page Description, styled like the Fitment box */}
          {viewingProduct.detailDescription && (
            <div style={{ marginBottom: '30px' }}>
              <h4 className="pd-section-title">Overview</h4>
              <div style={{ background: '#f8fafc', border: '1px solid #f1f5f9', padding: '14px 18px', borderRadius: '10px', fontSize: '14px', color: '#334155', fontWeight: 500, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {viewingProduct.detailDescription}
              </div>
            </div>
          )}

          {/* Details */}
          <div style={{ marginBottom: '30px' }}>
            <h4 className="pd-section-title">Fitment</h4>
            <div style={{ background: '#f8fafc', border: '1px solid #f1f5f9', padding: '14px 18px', borderRadius: '10px', fontSize: '14px', color: '#334155', fontWeight: 500, lineHeight: 1.5 }}>
              {viewingProduct.fitment}
            </div>
          </div>

          <div style={{ marginBottom: '30px' }}>
            <h4 className="pd-section-title">How To Install</h4>
            <p style={{ fontSize: '14px', color: '#475569', marginBottom: '15px', lineHeight: 1.5 }}>You can hire an upholstery person or have your team do the install.</p>
            <div className="pd-steps-row">
              <div className="pd-step"><div className="pd-step-num">1</div> Remove seat from frame.</div>
              <div className="pd-step"><div className="pd-step-num">2</div> Remove old cover.</div>
              <div className="pd-step"><div className="pd-step-num">3</div> Keep velcro intact and install new covers.</div>
            </div>
          </div>

          <div style={{ marginBottom: '30px' }}>
            <h4 className="pd-section-title">Pricing</h4>
            <p style={{ fontSize: '14px', color: '#475569', lineHeight: 1.5 }}>We offer better pricing than competitors — and of course better quality.</p>
          </div>

          <div style={{ marginBottom: '40px' }}>
            <h4 className="pd-section-title">Production & Shipping</h4>
            <p style={{ fontSize: '14px', color: '#475569', marginBottom: '15px', lineHeight: 1.5 }}>Most orders are made after purchase to ensure a precise fit and quality finish.</p>
            <div className="pd-steps-row">
              <div className="pd-step"><div className="pd-step-num">1</div><span>1–2 Weeks Production</span></div>
              <div className="pd-step"><div className="pd-step-num">2</div><span>3–4 Days Shipping</span></div>
              <div className="pd-step"><div className="pd-step-num">3</div><span>Within 3 Weeks Delivered</span></div>
            </div>
          </div>

          {/* Variants & Video */}
          <div className="pd-action-grid">
            <div>
              {/* Faux Leather Color */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                  <span className="pd-section-title" style={{ margin: 0 }}>Faux Leather Color</span>
                  <InfoTooltip />
                </div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {AVAILABLE_COLORS.map(c => <Swatch key={c.name} color={c.hex} border={c.name === 'white'} active={detailColor === c.name} onClick={() => setDetailColor(c.name)} />)}
                </div>
              </div>

              {/* Stitching Color */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                  <span className="pd-section-title" style={{ margin: 0 }}>Stitching Color</span>
                  <InfoTooltip />
                </div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {AVAILABLE_COLORS.map(c => <Swatch key={c.name} color={c.hex} border={c.name === 'white'} active={detailStitching === c.name} onClick={() => setDetailStitching(c.name)} />)}
                </div>
              </div>

              {/* Pattern */}
              <div style={{ marginBottom: '25px' }}>
                <div className="pd-section-title" style={{ marginBottom: '10px' }}>
                  Select Pattern: <span style={{ color: PALETTE.textDark }}>{detailPattern}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {AVAILABLE_PATTERNS.map(pattern => (
                    <button
                      key={pattern}
                      onClick={() => setDetailPattern(pattern)}
                      style={{
                        padding: '10px 18px', border: '1.5px solid', borderRadius: '8px',
                        fontSize: '13px', cursor: 'pointer', transition: 'all 0.15s',
                        borderColor: detailPattern === pattern ? PALETTE.primary : PALETTE.border,
                        background: detailPattern === pattern ? PALETTE.primaryLight : '#fff',
                        color: detailPattern === pattern ? PALETTE.primary : PALETTE.textMuted,
                        fontWeight: detailPattern === pattern ? 700 : 500,
                      }}
                    >{pattern}</button>
                  ))}
                </div>
              </div>

              {/* Stock */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 700, color: PALETTE.greenText, marginBottom: '20px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: PALETTE.greenDot }} />
                In stock
              </div>

              {/* Add to Cart / Buy Now */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {currentVariantQty === 0 ? (
                  <button
                    onClick={() => handleAddToCart(viewingProduct, detailColor, detailStitching, detailPattern)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '16px', borderRadius: '12px', fontSize: '15px', fontWeight: 700, border: `2px solid ${PALETTE.primary}`, background: '#fff', color: PALETTE.primary, cursor: 'pointer', transition: 'all 0.15s' }}
                    onMouseOver={e => { e.currentTarget.style.background = PALETTE.primaryLight; }}
                    onMouseOut={e => { e.currentTarget.style.background = '#fff'; }}
                  >
                    <CartIcon size={18} /> Add to Cart
                  </button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: `2px solid ${PALETTE.primaryDark}`, borderRadius: '12px', overflow: 'hidden' }}>
                    <button onClick={() => handleUpdateQty(viewingProduct, detailColor, detailStitching, detailPattern, -1)} style={{ flex: 1, padding: '16px', fontSize: '20px', background: 'transparent', border: 'none', cursor: 'pointer', color: PALETTE.primaryDark, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }} onMouseOver={e => { e.currentTarget.style.background = '#f1f5f9'; }} onMouseOut={e => { e.currentTarget.style.background = 'transparent'; }}>−</button>
                    <span style={{ fontSize: '15px', fontWeight: 800, color: PALETTE.textDark, padding: '0 10px', minWidth: '40px', textAlign: 'center' }}>{currentVariantQty}</span>
                    <button onClick={() => handleUpdateQty(viewingProduct, detailColor, detailStitching, detailPattern, 1)} style={{ flex: 1, padding: '16px', fontSize: '20px', background: 'transparent', border: 'none', cursor: 'pointer', color: PALETTE.primaryDark, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }} onMouseOver={e => { e.currentTarget.style.background = '#f1f5f9'; }} onMouseOut={e => { e.currentTarget.style.background = 'transparent'; }}>+</button>
                  </div>
                )}
                <button
                  onClick={() => { if (currentVariantQty === 0) handleAddToCart(viewingProduct, detailColor, detailStitching, detailPattern); goToCart(); }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', borderRadius: '12px', fontSize: '15px', fontWeight: 700, border: 'none', background: PALETTE.primaryDark, color: '#fff', cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseOver={e => { e.currentTarget.style.background = '#000'; }}
                  onMouseOut={e => { e.currentTarget.style.background = PALETTE.primaryDark; }}
                >
                  Buy Now
                </button>
              </div>
            </div>

            {/* Video Card */}
            <div className="pd-video-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '15px' }}>
                <div style={{ background: '#4c1d95', color: '#fff', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PlayCircleIcon /></div>
                <div style={{ fontWeight: 800, color: '#4c1d95', fontSize: '15px' }}>PRODUCT VIDEO</div>
              </div>
              <p style={{ fontSize: '13px', color: '#5b21b6', lineHeight: 1.6, marginBottom: '20px', fontWeight: 500 }}>See material quality, stitching options, and installation examples.</p>
              <button style={{ width: '100%', background: '#4c1d95', color: '#fff', border: 'none', padding: '14px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <PlayCircleIcon /> Watch Video
              </button>
            </div>
          </div>
        </div>
      ) : (
        // ── PAGE 1: MAIN STOREFRONT GRID VIEW ────────────────────────────────
        <div className="container">
          {/* ── MAIN TAB BAR: All / Seat Covers / Apparel ── */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'All' },
              { id: 'covers', label: 'Seat Covers' },
              { id: 'apparel', label: 'Apparel' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => handleTabChange(t.id)}
                style={{
                  padding: '10px 22px', borderRadius: '999px', fontSize: '14px', fontWeight: 700,
                  cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
                  background: activeTab === t.id ? PALETTE.primary : '#fff',
                  color: activeTab === t.id ? '#fff' : PALETTE.textMuted,
                  border: `1.5px solid ${activeTab === t.id ? PALETTE.primary : PALETTE.border}`,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === 'apparel' && (
            <ApparelSection cart={cart} handleApparelAdd={handleApparelAdd} handleCustomTeeAdd={handleCustomTeeAdd} goToCart={goToCart} />
          )}

          {activeTab === 'covers' && (
            <>
              <div className="hero-section">
                <div className="hero-content">
                  <h2>Premium Comfort.<br />Every Journey.</h2>
                  <p>High quality seat covers for<br />bus & coach seats.</p>
                  <button className="btn-primary">Shop Now →</button>
                </div>
              </div>

              {/* ── NEW ADVANCED FILTERS ── */}
              <FilterPanel
                filterMakes={filterMakes} setFilterMakes={setFilterMakes}
                filterBuilders={filterBuilders} setFilterBuilders={setFilterBuilders}
                filterModels={filterModels} setFilterModels={setFilterModels}
                filterCategories={filterCategories} setFilterCategories={setFilterCategories}
                filterYear={filterYear} setFilterYear={setFilterYear}
                masterFilters={masterFilters} products={products}
              />

              {/* {activeTab === 'all' ? (
                <div className="section-head" style={{ marginTop: 20 }}>
                  <div>
                    <h2>Seat Covers</h2>
                    <span>{filteredProducts.length} products</span>
                  </div>
                  <button className="section-link" onClick={() => handleTabChange('covers')}>View all seat covers →</button>
                </div>
              ) : (
                <div className="grid-header" style={{ marginTop: 20 }}>
                  <span>{filteredProducts.length} Products Found</span>
                  <div className="sort-dropdown">Sort by: <strong>Popular ⌄</strong></div>
                </div>
              )} */}

              <div className="grid-header" style={{ marginTop: 20 }}>
                <span>{filteredProducts.length} Products Found</span>
                <div className="sort-dropdown">Sort by: <strong>Popular ⌄</strong></div>
              </div>

              <div className="product-grid">
                {isLoading ? (
                  <div style={{ padding: '40px', width: '100%', textAlign: 'center', gridColumn: '1 / -1', color: '#6b7280' }}>
                    Loading products…
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div style={{ padding: '60px 20px', width: '100%', textAlign: 'center', gridColumn: '1 / -1', color: '#6b7280', background: '#f8fafc', borderRadius: '16px', border: '1px dashed #e2e8f0' }}>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>No exact matches found</div>
                    <div style={{ fontSize: '14px' }}>Try adjusting your filters to see more seat covers.</div>
                    <button
                      onClick={() => {
                        setFilterMakes([]);
                        setFilterBuilders([]);
                        setFilterModels([]);
                        setFilterCategories([]);
                        setFilterYear('');
                      }}
                      style={{ marginTop: '16px', background: '#fff', border: '1.5px solid #cbd5e1', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, color: '#334155' }}>
                      Clear All Filters
                    </button>
                  </div>
                ) : (
                  filteredProducts.map(product => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      wishlist={wishlist}
                      getVariantQty={getVariantQty}
                      handleUpdateQty={handleUpdateQty}
                      toggleWishlist={toggleWishlist}
                      handleAddToCart={handleAddToCart}
                      onClickImage={() => goToProduct(product.id)}
                    />
                  ))
                )}
              </div>

              {/* {activeTab === 'all' && (
                <section className="all-apparel">
                  <div className="section-head">
                    <div>
                      <h2>Apparel</h2>
                      <span>Custom apparel, embroidery &amp; uniforms</span>
                    </div>
                    <button className="section-link" onClick={() => handleTabChange('apparel')}>View all apparel →</button>
                  </div>
                  <ApparelSection embedded cart={cart} handleApparelAdd={handleApparelAdd} handleCustomTeeAdd={handleCustomTeeAdd} goToCart={goToCart} />
                </section>
              )} */}
                        </>
           )}

          {activeTab === 'all' && (
            <>
              <div className="product-grid">
                {isLoading ? (
                  <div style={{ padding: '40px', width: '100%', textAlign: 'center', gridColumn: '1 / -1', color: '#6b7280' }}>
                    Loading products…
                  </div>
                ) : (
                  filteredProducts.map(product => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      wishlist={wishlist}
                      getVariantQty={getVariantQty}
                      handleUpdateQty={handleUpdateQty}
                      toggleWishlist={toggleWishlist}
                      handleAddToCart={handleAddToCart}
                      onClickImage={() => goToProduct(product.id)}
                    />
                  ))
                )}
                {!isLoading && (
                  <ApparelSection embedded cart={cart} handleApparelAdd={handleApparelAdd} handleCustomTeeAdd={handleCustomTeeAdd} goToCart={goToCart} />
                )}
              </div>
            </>
          )}
         </div>
       )}

      {/* Trust Badges (detail page only) */}
      {viewingProduct && (
        <div className="pd-footer-badges">
          <div className="pd-badge"><div className="pd-badge-icon"><QualityShieldIcon /></div> Premium Quality Materials</div>
          <div className="pd-badge"><div className="pd-badge-icon"><SettingsIcon /></div> {viewingProduct.shortFitment}</div>
          <div className="pd-badge"><div className="pd-badge-icon"><TruckIcon /></div> Fast Shipping Across USA</div>
          <div className="pd-badge"><div className="pd-badge-icon"><SupportIcon /></div> Dedicated Customer Support</div>
        </div>
      )}

      {cartCount > 0 && <CartStickyBar cartCount={cartCount} cartTotal={cartTotal} onCheckoutClick={goToCart} />}
    </div>
  );
};

export default Storefront;