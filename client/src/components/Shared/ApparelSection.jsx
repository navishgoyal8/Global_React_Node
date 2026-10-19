import { useState, useMemo, useEffect } from 'react';
import { API_BASE_URL } from '../../config';
import { primaryImageUrl, parseImageEntries } from '../../utils/productImages';
import ApparelDetail from './ApparelDetail';
import CustomTeeConfigurator from './CustomTeeConfigurator';
import SmartImage from './SmartImage';
import { useNavigate } from 'react-router-dom';

// ── LOCAL SVGs (mirror lucide paths used by the reference) ──────────────────
const makeIcon = (children) => {
  const Icon = ({ size = 24, strokeWidth = 2, color = 'currentColor', fill = 'none' } = {}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
  return Icon;
};

const ShirtIcon = makeIcon(<><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" /></>);
const CapIcon = makeIcon(<><path d="M16.5 9.4 7.55 4.24" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.27 6.96 12 12.01l8.73-5.05" /><path d="M12 22.08V12" /></>);
const ShoeIcon = makeIcon(<><path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z" /><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z" /><path d="M16 17h4" /><path d="M4 13h4" /></>);
const AwardIcon = makeIcon(<><path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526" /><circle cx="12" cy="8" r="6" /></>);
const PenToolIcon = makeIcon(<><path d="M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z" /><path d="m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18" /><path d="m2.3 2.3 7.286 7.286" /><circle cx="11" cy="11" r="2" /></>);
const TruckIcon = makeIcon(<><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" /><path d="M15 18H9" /><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" /><circle cx="17" cy="18" r="2" /><circle cx="7" cy="18" r="2" /></>);
const ShieldIcon = makeIcon(<><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></>);
const SlidersIcon = makeIcon(<><line x1="21" x2="14" y1="4" y2="4" /><line x1="10" x2="3" y1="4" y2="4" /><line x1="21" x2="12" y1="12" y2="12" /><line x1="8" x2="3" y1="12" y2="12" /><line x1="21" x2="16" y1="20" y2="20" /><line x1="12" x2="3" y1="20" y2="20" /><line x1="14" x2="14" y1="2" y2="6" /><line x1="8" x2="8" y1="10" y2="14" /><line x1="16" x2="16" y1="18" y2="22" /></>);
const ChevronDownIcon = makeIcon(<path d="M6 9l6 6 6-6" />);
const ChevronLeftIcon = makeIcon(<path d="M15 18l-6-6 6-6" />);
const ChevronRightIcon = makeIcon(<path d="M9 18l6-6-6-6" />);
const GridIcon = makeIcon(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>);

const HeartIcon = ({ size = 19, filled = false, color = '#94a3b8' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? '#f97316' : 'none'} stroke={filled ? '#f97316' : color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>
);

// ── DATA (hardcoded reference items) ────────────────────────────────────────
const CATEGORIES = [
  { id: 'all', label: 'All', icon: GridIcon },
  { id: 'shirts', label: 'Shirts / Tshirts', icon: ShirtIcon },
  { id: 'jackets', label: 'Jackets', icon: ShirtIcon },
  { id: 'hats', label: 'Hats', icon: CapIcon },
  { id: 'shoes', label: 'Shoes', icon: ShoeIcon },
];

// Map the products.subcategory1 value (as stored in the DB) to the UI category id.
const SUBCATEGORY_TO_ID = {
  shirts: 'shirts', shirt: 'shirts', tshirts: 'shirts', 't-shirts': 'shirts', tees: 'shirts', tops: 'shirts',
  jackets: 'jackets', jacket: 'jackets', outerwear: 'jackets', coats: 'jackets',
  hats: 'hats', hat: 'hats', caps: 'hats', cap: 'hats', beanies: 'hats', beanie: 'hats',
  shoes: 'shoes', sneakers: 'shoes', sneaker: 'shoes', footwear: 'shoes', boots: 'shoes',
};

const iconForName = (name) => {
  const id = categoryIdFor(name);
  return id === 'hats' ? CapIcon : id === 'shoes' ? ShoeIcon : ShirtIcon;
};

const sizeList = (field) => {
  if (!field) return [];
  let list;
  try { const parsed = JSON.parse(String(field)); list = Array.isArray(parsed) ? parsed : [parsed]; }
  catch { list = String(field).split(','); }
  return list.map(e => String(e?.size || e?.name || e?.label || e || '').trim()).filter(Boolean);
};

const FilterDropdown = ({ label, options, selected, onToggle, open, setOpen }) => (
  <div style={{ position: 'relative' }}>
    {open && <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />}
    <button type="button" onClick={() => setOpen(!open)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', border: `1px solid ${selected.length ? '#3b28cc' : C.border}`, fontSize: '14px', fontWeight: 600, color: selected.length ? '#3b28cc' : C.subtle, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
      {label}{selected.length > 0 && ` (${selected.length})`} <ChevronDownIcon size={15} strokeWidth={2.4} />
    </button>
    {open && (
      <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 30, minWidth: '180px', maxHeight: '260px', overflowY: 'auto', background: '#fff', border: `1px solid ${C.border}`, borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.1)', padding: '6px 0' }}>
        {options.length === 0 && <div style={{ padding: '10px 14px', fontSize: '13px', color: C.faint }}>No options</div>}
        {options.map(opt => (
          <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer' }}>
            <input type="checkbox" checked={selected.includes(opt)} onChange={() => onToggle(opt)} /> {opt}
          </label>
        ))}
      </div>
    )}
  </div>
);

const categoryIdFor = (value) => {
  if (!value) return 'shirts';
  const key = String(value).trim().toLowerCase();
  return SUBCATEGORY_TO_ID[key] || 'shirts';
};

const COLOR_SWATCH = {
  Black: '#111318',
  White: '#f4f4f5',
  Gray: '#6b7280',
};

const HEX_RE = /^#?[0-9a-f]{6}$/i;

// Perceived brightness test so near-white swatches keep dark icons/label contrast.
const isLightHex = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 140;
};

// A products.colors entry is either a plain name ("Black") or a { name, hex } object.
const readColorEntry = (entry) => {
  const raw = entry && typeof entry === 'object'
    ? (entry.name ?? entry.hex ?? '')
    : entry;
  const name = String(raw ?? '').trim();
  const swatch = COLOR_SWATCH[name] || COLOR_SWATCH[name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())] || null;
  const hex = String(entry && typeof entry === 'object' ? (entry.hex ?? '') : '').trim();
  return {
    name: name || swatch || 'Black',
    hex: (HEX_RE.test(hex) ? hex : (swatch || (HEX_RE.test(name) ? name : null))) || COLOR_SWATCH.Black,
  };
};

// Map the products.colors JSON (or single string) to the first color shown on the card.
const firstColor = (colorsField) => {
  if (!colorsField) return readColorEntry('Black');
  const raw = String(colorsField);
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) return readColorEntry(parsed[0]);
    if (typeof parsed === 'string' && parsed.trim()) return readColorEntry(parsed.trim());
  } catch {
    // not JSON — fall through
  }
  const comma = raw.split(',');
  return readColorEntry((comma[0] || 'Black').trim());
};

// every color of a product as [{ name, hex }], for the swatch circles on the card
const allColors = (colorsField) => {
  if (!colorsField) return [];
  let list;
  try {
    const parsed = typeof colorsField === 'string' ? JSON.parse(colorsField) : colorsField;
    list = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    list = String(colorsField).split(',').map((s) => s.trim()).filter(Boolean);
  }
  return list
    .map(readColorEntry)
    .filter((c) => c.name)
    .map((c) => ({ name: c.name, hex: c.hex.startsWith('#') ? c.hex : `#${c.hex}` }));
};

// Resolve a product image to an absolute URL, else null (fall back to icon thumb).
// The shared helper in utils/productImages picks the first working upload base.
const resolveImage = (imageField) => primaryImageUrl(imageField);

const C = {
  '111318': '#111318',
  '0b0c10': '#0b0c10',
  orange: '#f97316',
  orangeLight: 'rgba(255, 237, 213, 0.45)',
  orangeCircle: '#fed7aa',
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',
  slate: '#0f172a',
  muted: '#64748b',
  subtle: '#334155',
  faint: '#94a3b8',
  whiteMuted: 'rgba(255,255,255,0.6)',
};

const PRODUCTS = [
  { id: 1, name: 'GC Premium Polo', color: 'Black', price: 28, category: 'shirts', icon: ShirtIcon },
  { id: 2, name: 'GC Premium Polo', color: 'White', price: 28, category: 'shirts', icon: ShirtIcon },
  { id: 3, name: 'Softshell Jacket', color: 'Black', price: 65, category: 'jackets', icon: ShirtIcon },
  { id: 4, name: 'GC Classic Cap', color: 'Black', price: 18, category: 'hats', icon: CapIcon },
  { id: 5, name: 'Performance Jacket', color: 'Gray', price: 62, category: 'jackets', icon: ShirtIcon },
  { id: 6, name: 'Crew Neck Tee', color: 'Black', price: 18, category: 'shirts', icon: ShirtIcon },
  { id: 7, name: 'GC Sneaker', color: 'Black', price: 59, category: 'shoes', icon: ShoeIcon },
  { id: 8, name: 'GC Sneaker', color: 'White', price: 59, category: 'shoes', icon: ShoeIcon },
  { id: 9, name: 'Oxford Button-Down', color: 'White', price: 34, category: 'shirts', icon: ShirtIcon },
  { id: 10, name: 'Bomber Jacket', color: 'Black', price: 72, category: 'jackets', icon: ShirtIcon },
  { id: 11, name: 'Trucker Cap', color: 'Gray', price: 16, category: 'hats', icon: CapIcon },
  { id: 12, name: 'Canvas Slip-On', color: 'White', price: 45, category: 'shoes', icon: ShoeIcon },
  { id: 13, name: 'Quarter-Zip Pullover', color: 'Gray', price: 48, category: 'shirts', icon: ShirtIcon },
  { id: 14, name: 'Insulated Parka', color: 'Black', price: 98, category: 'jackets', icon: ShirtIcon },
  { id: 15, name: 'Beanie', color: 'Black', price: 14, category: 'hats', icon: CapIcon },
  { id: 16, name: 'Work Boot', color: 'Black', price: 89, category: 'shoes', icon: ShoeIcon },
  { id: 17, name: 'Henley Tee', color: 'Gray', price: 22, category: 'shirts', icon: ShirtIcon },
  { id: 18, name: 'Windbreaker', color: 'White', price: 54, category: 'jackets', icon: ShirtIcon },
  { id: 19, name: 'Bucket Hat', color: 'White', price: 17, category: 'hats', icon: CapIcon },
  { id: 20, name: 'Running Shoe', color: 'Gray', price: 64, category: 'shoes', icon: ShoeIcon },
  { id: 21, name: 'Rugby Polo', color: 'Black', price: 32, category: 'shirts', icon: ShirtIcon },
  { id: 22, name: 'Vest', color: 'Gray', price: 44, category: 'jackets', icon: ShirtIcon },
  { id: 23, name: 'Snapback', color: 'Black', price: 19, category: 'hats', icon: CapIcon },
  { id: 24, name: 'Chelsea Boot', color: 'Black', price: 94, category: 'shoes', icon: ShoeIcon },
];

const PAGE_SIZE = 8;
const FILTERS = ['Color', 'Size', 'Brand', 'Price'];

const TRUST_ITEMS = [
  { icon: AwardIcon, title: 'Premium Quality', subtitle: 'Top materials' },
  { icon: PenToolIcon, title: 'Custom Branding', subtitle: 'Your logo, your way' },
  { icon: TruckIcon, title: 'Fast Shipping', subtitle: 'Nationwide delivery' },
  { icon: ShieldIcon, title: 'Satisfaction', subtitle: 'Guaranteed' },
];

const ColorDots = ({ product }) => {
  const list = product.colorList && product.colorList.length
    ? product.colorList
    : [{ name: product.color, hex: product.colorHex || COLOR_SWATCH[product.color] || '#111318' }];
  const MAX = 5;
  const shown = list.slice(0, MAX);
  const extra = list.length - shown.length;
  return (
    <div className="ap-dots" aria-label={`Colors: ${list.map((c) => c.name).join(', ')}`}>
      {shown.map((c, i) => (
        <span key={`${c.hex}-${i}`} className="ap-dot" title={c.name} style={{ background: c.hex }} />
      ))}
      {extra > 0 && <span className="ap-dot-more">+{extra}</span>}
    </div>
  );
};

// ── PRODUCT THUMB ────────────────────────────────────────────────────────────
const ProductThumb = ({ product }) => {
  const Icon = product.icon;
  if (product.image) {
    return (
      <div style={{ width: '100%', aspectRatio: '1/1', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#f1f5f9' }}>
        <SmartImage
          src={product.image}
          alt={product.name}
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
    );
  }
  const bg = product.colorHex || COLOR_SWATCH[product.color] || '#111318';
  const isLight = product.color === 'White' || isLightHex(bg);
  return (
    <div style={{ width: '100%', aspectRatio: '1/1', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}>
      <Icon size={56} strokeWidth={1.4} color={isLight ? '#111318' : '#f4f4f5'} />
    </div>
  );
};

// Map a raw DB product row into the shape used by the apparel card grid.
const mapDbProduct = (p) => {
  const catId = categoryIdFor(p.subcategory_name);
  const icon = (catId === 'hats' ? CapIcon : catId === 'shoes' ? ShoeIcon : ShirtIcon);
  const price = parseFloat(p.selling_price ?? p.dp ?? p.price);
  const orig = parseFloat(p.compare_at_price) > price ? parseFloat(p.compare_at_price) : null;
  const color = firstColor(p.colors);
  
  return {
    id: p.id,
    name: p.display_name || p.name || 'Apparel Item',
    color: color.name,
    colorHex: color.hex,
    colorList: allColors(p.colors),
    price: Number.isFinite(price) ? price : 28,
    category: catId,
    subcategoryId: p.subcategory1 != null ? String(p.subcategory1) : '',
    brand: p.brand_name || '',
    sizeList: sizeList(p.sizes),
    icon,
    image: resolveImage(p.image),
    images: parseImageEntries(p.image).map(resolveImage).filter(Boolean), print_areas: p.print_areas,
    colors: p.colors || null,
    sizes: p.sizes || null,
    size_chart_mode: p.size_chart_mode === 'image' ? 'image' : 'table',
    size_chart_image: p.size_chart_image ? resolveImage(p.size_chart_image) : null,
    selling_price: p.selling_price ?? p.dp ?? p.price,
    compare_at_price: p.compare_at_price || null,
    listDescription: (p.list_page_description || '').trim(),
    detailDescription: (p.detail_page_description || '').trim(),
    originalPrice: orig,
    decoration_type: p.decoration_type ?? '',
    moq: parseInt(p.moq,10) || 0
  };
};

// ── APPAREL STOREFRONT SECTION (Global Customs, backed by DB) ──────────────
export default function ApparelSection({ cart = [], handleApparelAdd, handleCustomTeeAdd, goToCart, embedded = false }) {

  const [activeCategory, setActiveCategory] = useState('all');
  const [subcategories, setSubcategories] = useState([]);
  const [filters, setFilters] = useState({ color: [], size: [], brand: [], price: '' });
  const [openFilter, setOpenFilter] = useState(null);
  const [page, setPage] = useState(1);
  const [favorites, setFavorites] = useState(new Set());
  const [products, setProducts] = useState([]);
  const [isLoading,setIsLoading] = useState(true)
  const [selected, setSelected] = useState(null);
  const [configuring, setConfiguring] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const loadApparel = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/products`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const items = data.data || data.products || data;
        if (items && Array.isArray(items)) {
          const mapped = items
            .filter(p => Number(p.category_id) === 5)
            .map(mapDbProduct);
          if (!cancelled  ) setProducts(mapped.length ? mapped : PRODUCTS);
        }
      } catch (err) {
        console.error('Failed to load apparel products:', err);
        if(!cancelled) setProducts(PRODUCTS)
      }
      finally{
        if(!cancelled) setIsLoading(false)
      }
    };
    loadApparel();
    return () => { cancelled = true; };
  }, []);

    useEffect(() => {
    if (embedded) return;
    fetch(`${API_BASE_URL}/products/store-filters`)
      .then(r => r.json())
      .then(d => { if (d?.success) setSubcategories(d.apparelSubcategories || []); })
      .catch(() => {});
  }, [embedded]);

  const uniq = (arr) => [...new Set(arr)];
  const colorOptions = useMemo(() => uniq(products.flatMap(p => (p.colorList || []).map(c => c.name))).sort(), [products]);
  const sizeOptions = useMemo(() => uniq(products.flatMap(p => p.sizeList || [])), [products]);
  const brandOptions = useMemo(() => uniq(products.map(p => p.brand).filter(Boolean)).sort(), [products]);
  const priceOptions = useMemo(() => {
    const prices = products.map(p => p.price).filter(Number.isFinite);
    if (!prices.length) return [];
    const min = Math.floor(Math.min(...prices)), max = Math.ceil(Math.max(...prices));
    if (min === max) return [];
    const step = Math.max(1, Math.ceil((max - min) / 4 / 5) * 5);
    const out = [];
    for (let lo = Math.floor(min / step) * step; lo < max; lo += step) out.push({ label: `$${lo} – $${lo + step}`, lo, hi: lo + step });
    return out;
  }, [products]);

  const filtered = useMemo(() => {
    if (embedded) return products;
    const pr = priceOptions.find(o => o.label === filters.price);
    return products.filter(p => {
      if (activeCategory !== 'all' && p.subcategoryId !== activeCategory) return false;
      if (filters.color.length && !(p.colorList || []).some(c => filters.color.includes(c.name))) return false;
      if (filters.size.length && !(p.sizeList || []).some(s => filters.size.includes(s))) return false;
      if (filters.brand.length && !filters.brand.includes(p.brand)) return false;
      if (pr && !(p.price >= pr.lo && p.price <= pr.hi)) return false;
      return true;
    });
  }, [products, embedded, activeCategory, filters, priceOptions]);

  const categoryCounts = useMemo(() => {
    const counts = { all: products.length };
    products.forEach(p => { counts[p.subcategoryId] = (counts[p.subcategoryId] || 0) + 1; });
    return counts;
  }, [products]);

  const categoryList = useMemo(() => [
    { id: 'all', label: 'All', icon: GridIcon },
    ...subcategories.map(s => ({ id: String(s.id), label: s.name, icon: iconForName(s.name) })),
  ], [subcategories]);

  const filterDefs = [
    { key: 'color', label: 'Color', options: colorOptions },
    { key: 'size', label: 'Size', options: sizeOptions },
    { key: 'brand', label: 'Brand', options: brandOptions },
    { key: 'price', label: 'Price', options: priceOptions.map(o => o.label), single: true },
  ];
  const hasFilters = filters.color.length || filters.size.length || filters.brand.length || filters.price;
  const toggleFilter = (key, val, single) => {
    setPage(1);
    setFilters(f => single
      ? { ...f, [key]: f[key] === val ? '' : val }
      : { ...f, [key]: f[key].includes(val) ? f[key].filter(v => v !== val) : [...f[key], val] });
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = embedded ? filtered : filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const selectCategory = (id) => { setActiveCategory(id); setPage(1); };
  const navigate = useNavigate();

  const toggleFavorite = (id) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const pageBtnBase = {
    width: '36px', height: '36px', borderRadius: '8px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '13px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
  };

  const openDetail = (product) => {

    // Strip out the 'icon' function (and any other non-data properties) 
    // so the browser's History API doesn't crash trying to clone it.
    const { icon, ...safeProductData } = product;

    // Pass the safe data to the router
    navigate(`/sales/crm/apparel/${product.id}`, { state: { product: safeProductData } });
    window.scrollTo(0, 0);
  };

   const renderCard = (product) => {
    const isFav = favorites.has(product.id);
    return (
      <div key={product.id} className="product-card">
        <div className="card-top">
          <div></div>
          <button
            className="wishlist-btn"
            onClick={(e) => { e.stopPropagation(); toggleFavorite(product.id); }}
            aria-label="Toggle favorite"
            style={{ borderColor: isFav ? '#ef4444' : '', backgroundColor: isFav ? '#fef2f2' : 'white', color: isFav ? '#ef4444' : '#9ca3af' }}
          >
            <HeartIcon filled={isFav} color={isFav ? '#ef4444' : '#9ca3af'} />
          </button>
        </div>

        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="product-image"
            onClick={() => openDetail(product)}
            onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/300x300/f3f4f6/9ca3af?text=No+Img'; }}
          />
        ) : (
          <div onClick={() => openDetail(product)} style={{ cursor: 'pointer' }}><ProductThumb product={product} /></div>
        )}

        <div className="product-title" onClick={() => openDetail(product)} style={{ cursor: 'pointer' }}>{product.name}</div>
        <div className="product-category">Apparel</div>

        <div className="mini-filters">
          <div className="mini-filter-row">
            <span className="mini-filter-label">Colors</span>
            <ColorDots product={product} />
          </div>
          {product.listDescription && (
            <div className="product-desc" onClick={() => openDetail(product)} title={product.listDescription} style={{ marginTop: '10px' }}>{product.listDescription}</div>
          )}
        </div>

        <div className="card-bottom" style={{ marginTop: '16px' }}>
          <div className="price-row">
            {product.originalPrice && <span className="original-price">${product.originalPrice.toFixed(2)}</span>}
            <span className="current-price">${product.price.toFixed(2)}</span>
          </div>
          <div className="action-row">
            <button className="btn-add-cart" onClick={() => openDetail(product)}>View</button>
          </div>
        </div>
      </div>
    );
  };


  if (configuring) {
    return <CustomTeeConfigurator product={products} onBack={() => { setConfiguring(null); window.scrollTo(0, 0); }} cart={cart} handleCustomTeeAdd={handleCustomTeeAdd} goToCart={goToCart} />;
  }

  if (embedded) {
    return (
      <>
        <style>{`
          .ap-dots { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
          .ap-dot { width: 18px; height: 18px; border-radius: 50%; border: 1px solid #cbd5e1; box-shadow: inset 0 0 0 1px rgba(255,255,255,.35); }
          .ap-dot-more { font-size: 12px; font-weight: 600; color: #64748b; margin-left: 2px; }
        `}</style>
        {pageItems.map(renderCard)}
      </>
    );
  }

  

  if (selected) {
    return <ApparelDetail product={selected} onBack={() => { setSelected(null); window.scrollTo(0, 0); }} cart={cart} handleApparelAdd={handleApparelAdd} goToCart={goToCart} />;
  }

  return (
    <div className="ap-page" style={{ background: '#fff', color: C.slate }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap');
        .apparel-cat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
        .apparel-prod-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
        .apparel-trust-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
        @media (min-width: 640px) {
          .apparel-cat-grid { grid-template-columns: repeat(5, 1fr); gap: 12px; }
          .apparel-trust-grid { grid-template-columns: repeat(4, 1fr); }
        }
        @media (min-width: 768px) {
          .apparel-prod-grid { grid-template-columns: repeat(4, 1fr); gap: 20px; }
        }
        @media (max-width: 379px) {
          .apparel-cat-grid { grid-template-columns: 1fr; }
        }

        .ap-page { font-family: 'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 1.5; letter-spacing: 0; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
  .ap-page button { font-family: inherit; }
  .ap-heading, .ap-card-name, .ap-card-price { font-family: 'Plus Jakarta Sans', 'Inter', sans-serif; }
  .ap-dots { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.ap-dot { width: 18px; height: 18px; border-radius: 50%; border: 1px solid #cbd5e1; box-shadow: inset 0 0 0 1px rgba(255,255,255,.35); }
.ap-dot-more { font-size: 12px; font-weight: 600; color: #64748b; margin-left: 2px; }

  .ap-card-name { font-size: 15px; font-weight: 700; line-height: 1.3; letter-spacing: -0.01em; color: #0f172a; }
  .ap-card-color { margin-top: 2px; font-size: 13px; font-weight: 500; color: #94a3b8; }
  .ap-card-desc { margin-top: 6px; font-size: 13px; line-height: 1.5; color: #64748b; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .ap-card-price { margin-top: 8px; font-size: 16px; font-weight: 700; letter-spacing: -0.01em; color: #0f172a; }
      `}</style>

      <div style={{ maxWidth: embedded ? 'none' : '1152px', margin: '0 auto', padding: embedded ? '0' : '24px 20px' }}>

        
        

        {/* ── Shop by category ── */}
        {!embedded && (<>
        <section style={{ marginBottom: '28px' }}>
          <h1 className='ap-heading' style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 14px 0', letterSpacing: '-0.02em' }}>Shop by Category</h1>
          <div className="apparel-cat-grid">
            {categoryList.map(cat => {
              const Icon = cat.icon;
              const active = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => selectCategory(cat.id)}
                  type="button"
                  style={{
                   borderRadius: '12px', border: `1.5px solid ${active ? '#3b28cc' : C.border}`,
                  background: active ? '#eff1ff' : '#fff',
                    padding: '10px 14px', display: 'flex', flexDirection: 'row',
                    alignItems: 'center', gap: '10px', textAlign: 'left',
                    cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit',
                    boxShadow: active ? '0 2px 10px rgba(59,40,204,0.15)' : 'none',                    minWidth: 0,
                  }}
                >
                  <div style={{ width: '40px', height: '40px', minWidth: '40px', borderRadius: '10px', background: active ? '#3b28cc' : '#111318', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={20} strokeWidth={1.6} color={active ? '#fff' : '#f4f4f5'} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '13px', lineHeight: 1.2, color: '#0f172a' }}>{cat.label}</div>
                    <div style={{ fontSize: '11px', color: C.faint, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {categoryCounts[cat.id] || 0} items
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <hr style={{ border: 'none', borderTop: `1px solid ${C.border}`, margin: '0 0 24px 0' }} />
         </>
        )} 

        {/* ── All products ── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 className='ap-heading' style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>All Products</h2>
            <span style={{ fontSize: '14px', color: C.faint }}>{filtered.length} products</span>
          </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
            {filterDefs.map(f => (
              <FilterDropdown
                key={f.key}
                label={f.label}
                options={f.options}
                selected={f.single ? [filters[f.key]].filter(Boolean) : filters[f.key]}
                onToggle={(val) => toggleFilter(f.key, val, f.single)}
                open={openFilter === f.key}
                setOpen={(o) => setOpenFilter(o ? f.key : null)}
              />
            ))}
            {hasFilters && (
              <button
                type="button"
                onClick={() => { setFilters({ color: [], size: [], brand: [], price: '' }); setPage(1); }}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#3b28cc', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
              >
                Clear all
              </button>
            )}
          </div>

          {/* Product grid */}
          <div className="product-grid">
            {pageItems.map(renderCard)}

            {isLoading && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#6b7280', padding: '64px 0' }}>
                Loading products…
              </div>
            )}

            {!isLoading && pageItems.length === 0 && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: C.faint, padding: '64px 0' }}>
                No products in this category yet.
              </div>
            )}
          </div>

          {/* Pagination */}
          {!embedded && totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '32px' }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{ ...pageBtnBase, border: `1px solid ${C.border}`, color: C.muted, opacity: page === 1 ? 0.4 : 1 }}
                aria-label="Previous page"
              >
                <ChevronLeftIcon size={16} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  style={{
                    ...pageBtnBase,
                    border: n === page ? 'none' : `1px solid ${C.border}`,
                    background: n === page ? '#0b0c10' : '#fff',
                    color: n === page ? '#fff' : C.subtle,
                  }}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{ ...pageBtnBase, border: `1px solid ${C.border}`, color: C.muted, opacity: page === totalPages ? 0.4 : 1 }}
                aria-label="Next page"
              >
                <ChevronRightIcon size={16} />
              </button>
            </div>
          )}
        </section>

        {/* ── Trust badges ── */}
        <section style={{ marginTop: '40px', paddingTop: '24px', borderTop: `1px solid ${C.border}` }}>
          <div className="apparel-trust-grid">
            {TRUST_ITEMS.map(({ icon: Icon, title, subtitle }) => (
              <div key={title} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ flexShrink: 0, width: '40px', height: '40px', borderRadius: '50%', border: '1px solid #c7cdfa', background: '#eff1ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b28cc' }}>                  <Icon size={18} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', lineHeight: 1.3 }}>{title}</div>
                  <div style={{ fontSize: '12px', color: C.faint }}>{subtitle}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}