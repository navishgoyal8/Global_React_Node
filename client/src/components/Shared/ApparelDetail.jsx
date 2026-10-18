import { useState, useMemo, useEffect, useRef } from 'react';
import { toSafeHtml } from '../../utils/richText';
import { parseImageEntries } from '../../utils/productImages';
import SmartImage from './SmartImage';

// ── LOCAL SVGs (mirror lucide paths used in the reference) ──────────────────
const makeIcon = (children) => {
  const Icon = ({ size = 24, strokeWidth = 2, color = 'currentColor', fill = 'none' } = {}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
  return Icon;
};

const DropletsIcon = makeIcon(<><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" /></>);
const StretchIcon = makeIcon(<><path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" /></>);
const LayersIcon = makeIcon(<><path d="m12 2-10.5 5.63 10.5 5.37 10.5-5.37L12 2z" /><path d="M1.5 12.25 12 17.5l10.5-5.25" /><path d="M1.5 17.5 12 22.75l10.5-5.25" /></>);
const RulerIcon = makeIcon(<><path d="M21.3 8.7 15.3 2.7a1 1 0 0 0-1.4 0L2.7 13.9a1 1 0 0 0 0 1.4l6 6a1 1 0 0 0 1.4 0L22.7 10.1a1 1 0 0 0 0-1.4Z" /><path d="m7.5 10.5 2 2" /><path d="m10.5 7.5 2 2" /><path d="m13.5 4.5 2 2" /><path d="m4.5 13.5 2 2" /></>);
const SparklesIcon = makeIcon(<><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" /></>);
const TruckIcon = makeIcon(<><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" /><path d="M15 18H9" /><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" /><circle cx="17" cy="18" r="2" /><circle cx="7" cy="18" r="2" /></>);
const RotateIcon = makeIcon(<><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></>);
const LockIcon = makeIcon(<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>);
const ShieldIcon = makeIcon(<><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></>);
const CheckIcon = makeIcon(<path d="M20 6 9 17l-5-5" />);
const MinusIcon = makeIcon(<path d="M5 12h14" />);
const PlusIcon = makeIcon(<path d="M12 5v14M5 12h14" />);
const ChevronLeftIcon = makeIcon(<path d="M15 18l-6-6 6-6" />);
const StarIcon = makeIcon(<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />);
const BadgeCheckIcon = makeIcon(<><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" /><path d="m9 12 2 2 4-4" /></>);
const SunIcon = makeIcon(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M19.07 4.93l-1.41 1.41M6.34 17.66l-1.41 1.41" /></>);
const UploadIcon = makeIcon(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" /><path d="M12 3v12" /></>);
const CartIcon = makeIcon(<><circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" /></>);
const ChevronRightIcon = makeIcon(<path d="M9 18l6-6-6-6" />);
const ChevronUpIcon = makeIcon(<path d="M18 15l-6-6-6 6" />);
const ChevronDownIcon = makeIcon(<path d="M6 9l6 6 6-6" />);
const PlayIcon = makeIcon(<polygon points="6 4 20 12 6 20 6 4" />);

// ── Data helpers ─────────────────────────────────────────────────────────────
const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL'];
const COLOR_MAP = {
  black: '#171717', white: '#f4f4f5', gray: '#6b7280', grey: '#6b7280',
  navy: '#1e3a5f', blue: '#2563eb', charcoal: '#5b6470', red: '#dc2626',
  green: '#16a34a', 'dark green': '#14532d', maroon: '#881337', orange: '#f97316',
};

// Parse the product.colors JSON into a { name, hex } list. Entries may be plain
// names ("Black") or { name, hex } objects as stored in products.colors.
const parseColors = (colorsField) => {
  if (!colorsField) return [{ name: 'Black', hex: COLOR_MAP.black }];
  const raw = typeof colorsField === 'string' ? colorsField : JSON.stringify(colorsField);
  let list;
  try {
    const parsed = JSON.parse(raw);
    list = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    list = raw.split(',').map(s => s.trim()).filter(Boolean);
  }
  return list.map(entry => {
    const obj = entry && typeof entry === 'object' ? entry : null;
    const storedHex = String((obj && (obj.hex ?? obj.value ?? obj.code)) || '').trim();
    const name = String((obj ? (obj.name ?? obj.label ?? obj.value) : entry) ?? '').trim();
    const hex = (obj && /^#[0-9a-f]{3,8}$/i.test(storedHex))
      ? storedHex
      : (/^#[0-9a-f]{3,8}$/i.test(name) ? name : (COLOR_MAP[name.toLowerCase()] || '#334155'));
    return { 
      name: name || hex, 
      hex,
      front_image: obj?.front_image || obj?.front_image_url || null,
      back_image: obj?.back_image || obj?.back_image_url || null
    };
  });
};

// Parse the product.sizes JSON into a plain size-label list. Entries may be plain
// labels ("M") or { size, ... } objects as stored in products.sizes.
const parseSizes = (sizesField) => {
  if (!sizesField) return DEFAULT_SIZES;
  const raw = String(sizesField);
  let list;
  try {
    const parsed = JSON.parse(raw);
    list = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    list = raw.split(',').map(s => s.trim()).filter(Boolean);
  }
  const out = list
    .map(entry => String((entry && typeof entry === 'object') ? (entry.size ?? entry.name ?? entry.label ?? '') : (entry ?? '')).trim())
    .filter(Boolean);
  return out.length ? out : DEFAULT_SIZES;
};


const num = (v, fallback = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

const FEATURES_BY_CAT = {
  shirts: [
    { icon: DropletsIcon, title: 'Moisture Wicking', desc: 'Keeps you dry all day.' },
    { icon: ShieldIcon, title: 'Premium Fabric', desc: 'Soft, breathable 100% cotton.' },
    { icon: SparklesIcon, title: 'Custom Branding', desc: 'Embroidery or screen print.' },
    { icon: RulerIcon, title: 'Sizes XS–6XL', desc: 'Fits every team member.' },
  ],
  jackets: [
    { icon: DropletsIcon, title: 'Water & Wind Resistant', desc: 'Stay protected in all weather.' },
    { icon: LayersIcon, title: 'Warm Lining', desc: 'Comfortable and cozy all day.' },
    { icon: StretchIcon, title: 'Stretch Fabric', desc: 'Move freely with flexibility.' },
    { icon: SparklesIcon, title: 'Custom Embroidery', desc: 'Company logo on left chest.' },
  ],
  hats: [
    { icon: SunIcon, title: 'UV Resistant', desc: 'Sun protection you can trust.' },
    { icon: ShieldIcon, title: 'Durable Build', desc: 'Built to last through daily wear.' },
    { icon: SparklesIcon, title: 'Custom Embroidery', desc: 'Embroidered logo on front.' },
    { icon: RulerIcon, title: 'One Size Fits All', desc: 'Adjustable for any head.' },
  ],
  shoes: [
    { icon: StretchIcon, title: 'Comfort Cushioning', desc: 'Supportive all-day wear.' },
    { icon: ShieldIcon, title: 'Durable Sole', desc: 'Grippy, long-lasting traction.' },
    { icon: SparklesIcon, title: 'Custom Branding', desc: 'Printed or embroidered logo.' },
    { icon: RulerIcon, title: 'Sizes 7–13', desc: 'A size for every foot.' },
  ],
};

const TRUST_BADGES = [
  { icon: ShieldIcon, title: 'Durable & Long Lasting', desc: 'Built to withstand daily wear.' },
  { icon: BadgeCheckIcon, title: 'Professional Look', desc: 'Clean, modern style for any team.' },
  { icon: RotateIcon, title: 'Easy Care', desc: 'Machine washable & wrinkle resistant.' },
  { icon: SunIcon, title: 'All-Season Wear', desc: 'Perfect for year-round comfort.' },
];

const SERVICE_PROMISES = [
  { icon: TruckIcon, title: 'Fast Shipping', desc: 'Ships in 1-2 business days' },
  { icon: RotateIcon, title: 'Easy Returns', desc: '30-day return policy' },
  { icon: LockIcon, title: 'Secure Checkout', desc: '100% secure payment' },
];

const BOTTOM_STRIP = [
  { icon: SparklesIcon, title: 'Premium Quality', desc: 'Top materials' },
  { icon: LayersIcon, title: 'Custom Branding', desc: 'Your logo, your way' },
  { icon: TruckIcon, title: 'Fast Shipping', desc: 'Nationwide delivery' },
  { icon: BadgeCheckIcon, title: 'Satisfaction Guaranteed', desc: 'Love it or get your money back' },
];

const RATING_BREAKDOWN = [
  { stars: 5, count: 73 },
  { stars: 4, count: 17 },
  { stars: 3, count: 4 },
  { stars: 2, count: 1 },
  { stars: 1, count: 1 },
];

const Stars = ({ rating = 4.5, size = 14 }) => {
  const full = Math.floor(rating);
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <StarIcon key={i} size={size} color={i < full ? '#f97316' : '#e2e8f0'} fill={i < full ? '#f97316' : 'none'} />
      ))}
    </div>
  );
};

const C = {
  orange: '#f97316',
  border: '#e2e8f0',
  bg: '#f8fafc',
  slate: '#0f172a',
  muted: '#475569',
  faint: '#94a3b8',
};

// ── MAIN DETAIL COMPONENT ────────────────────────────────────────────────────
export default function ApparelDetail({ product, onBack, cart = [], handleApparelAdd, goToCart }) {
  console.log('ApparelDetail render', product);
  const category = product && product.category ? product.category : 'shirts';
  const productName = (product && product.name) || 'Global Customs Apparel Item';
  const detailHtml = useMemo(() => toSafeHtml(product && product.detailDescription), [product]);
  const features = FEATURES_BY_CAT[category] || FEATURES_BY_CAT.shirts;

  const [activeColor, setActiveColor] = useState(0);
  const [activeImage, setActiveImage] = useState(0);

  const colors = useMemo(() => (product ? parseColors(product.colors) : []), [product]);
  const sizes = useMemo(() => (product ? parseSizes(product.sizes) : DEFAULT_SIZES), [product]);

const NO_IMAGE = 'https://placehold.co/900x900/f3f4f6/9ca3af?text=No+Img';

// Gallery holds the stored image values (bare filenames or absolute URLs);
// <SmartImage> resolves each one against every known upload location.
const gallery = useMemo(() => {
    if (!product) return [NO_IMAGE];

    // Grab general product images
    const baseImages = parseImageEntries(product.image);

    // Grab the specific mockups for the currently selected color
    const colorImages = [];
    const currentColor = colors[activeColor];
    if (currentColor) {
      if (currentColor.front_image) colorImages.push(String(currentColor.front_image).trim());
      if (currentColor.back_image) colorImages.push(String(currentColor.back_image).trim());
    }

    // Combine them (color-specific images go first) and remove duplicates
    const uniqueImages = [...new Set([...colorImages, ...baseImages])].filter(Boolean);
    console.log('Unique images for gallery:', uniqueImages);

    if (!uniqueImages.length) return [NO_IMAGE];
    return uniqueImages;
  }, [product, colors, activeColor]);

  // Reset to the first image (front view) whenever the user changes the color
  useEffect(() => {
    setActiveImage(0);
  }, [activeColor]);
  
  // --- ADD THESE NEW HOOKS ---
  const printAreas = useMemo(() => {
    if (!product || !product.print_areas) return [];
    try {
      return typeof product.print_areas === 'string' ? JSON.parse(product.print_areas) : product.print_areas;
    } catch { return []; }
  }, [product]);

  const fileInputRef = useRef(null);
  const [customLogo, setCustomLogo] = useState(null); // Holds the actual File object
  const [logoPreview, setLogoPreview] = useState(null); // Holds the Data URL for UI
  const [selectedAreaId, setSelectedAreaId] = useState('');

  // Auto-select the first available print area if one exists
  useEffect(() => {
    if (printAreas.length > 0 && !selectedAreaId) {
      setSelectedAreaId(String(printAreas[0].id));
    }
  }, [printAreas, selectedAreaId]);

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setCustomLogo(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const removeLogo = () => {
    setCustomLogo(null);
    setLogoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- UPDATE YOUR UNIT PRICE CALCULATION ---
  const basePrice = product ? num(product.selling_price, num(product.price, num(product.dp, 28))) : 28;
  const isCustomizing = !!customLogo;
  const customBaseFee = isCustomizing ? num(product.custom_base_fee) : 0;
  const selectedArea = printAreas.find(a => String(a.id) === String(selectedAreaId)) || printAreas[0];
  const placementFee = (isCustomizing && selectedArea) ? num(selectedArea.extra_fee) : 0;
  
  // New dynamic unit price
  const unitPrice = basePrice + customBaseFee + placementFee;

  
  const [qty, setQty] = useState(() => sizes.map(() => 0));
  
  const [toast, setToast] = useState(null);

  // const unitPrice = product ? num(product.selling_price, num(product.price, num(product.dp, 28))) : 28;
  const totalQty = qty.reduce((a, b) => a + b, 0);
  const totalPrice = totalQty * unitPrice;
  const cartCount = cart.reduce((t, i) => t + i.qty, 0);

  const addAllToCart = () => {
    if (typeof handleApparelAdd !== 'function') return;
    let added = 0;
    
    // Package the customization data for the backend/cart
    const customData = isCustomizing ? {
      logoFile: customLogo,
      logoPreview: logoPreview,
      printArea: selectedArea,
      customFeeTotal: customBaseFee + placementFee
    } : null;

    qty.forEach((q, i) => {
      if (!q) return;
      // Pass customData to your parent handler
      handleApparelAdd(product, colors[activeColor].name, sizes[i], q, customData);
      added += q;
    });
    
    if (added > 0) {
      setToast(`${added} item${added > 1 ? 's' : ''} added to cart`);
      setTimeout(() => setToast(null), 1800);
      setQty(sizes.map(() => 0)); // Optional: reset quantities after adding
    }
  };

  const setTotalQty = (val) => {
    const target = Math.max(0, parseInt(val || '0', 10) || 0);
    setQty(prev => {
      const total = prev.reduce((a, b) => a + b, 0);
      const next = [...prev];
      const mid = Math.max(0, Math.floor((sizes.length - 1) / 2));
      next[mid] = Math.max(0, next[mid] + (target - total));
      return next;
    });
  };

  const updateQty = (idx, delta) => {
    setQty(prev => {
      const next = [...prev];
      next[idx] = Math.max(0, next[idx] + delta);
      return next;
    });
  };

  const goCart = () => {
    if (typeof goToCart === 'function') { goToCart(); return; }
    window.location.href = '/sales/crm/cart';
  };

  const prevImage = () => setActiveImage((i) => (i - 1 + gallery.length) % gallery.length);
  const nextImage = () => setActiveImage((i) => (i + 1) % gallery.length);
  const bulkLow = unitPrice * 0.85; // same "as low as" estimate your page already used
  const retail = num(product && product.originalPrice);
  const savePct = retail > bulkLow ? Math.round((1 - bulkLow / retail) * 100) : 0;

  const centerDiv = { display: 'flex', alignItems: 'center', justifyContent: 'center' };

  return (
    <div style={{ background: '#fff', color: '#0f172a', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", letterSpacing: '-0.01em' }}>
            <style>{`
        .ad-wrap { max-width: 1200px; margin: 0 auto; padding: 16px; }
        .ad-crumbs { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; font-size: 13px; color: #64748b; }
        .ad-crumbs button { background: none; border: none; padding: 0; font: inherit; color: #64748b; cursor: pointer; }
        .ad-crumbs button:hover { color: #f97316; }
        .ad-crumbs .cap { text-transform: capitalize; }
        .ad-crumbs b { color: #0f172a; font-weight: 600; }
        .ad-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 28px; align-items: start; }

        .ad-gallery { position: relative; }
        .ad-main-img { display: block; width: 100%; aspect-ratio: 1 / 1; object-fit: cover; border-radius: 16px; background: #f1f5f9; }
        .ad-badge { position: absolute; top: 14px; left: 14px; z-index: 5; background: #f97316; color: #fff; font-size: 11px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; padding: 6px 12px; border-radius: 8px; }
        .ad-nav { position: absolute; top: 50%; transform: translateY(-50%); z-index: 5; width: 40px; height: 40px; border-radius: 50%; background: #fff; border: none; box-shadow: 0 2px 10px rgba(0,0,0,.2); display: flex; align-items: center; justify-content: center; cursor: pointer; color: #0f172a; }
        .ad-nav.prev { left: 12px; } .ad-nav.next { right: 12px; }
        .ad-video { position: absolute; left: 14px; bottom: 14px; z-index: 5; display: flex; align-items: center; gap: 10px; background: rgba(15,23,42,.85); color: #fff; padding: 10px 16px; border-radius: 12px; text-decoration: none; font-size: 14px; font-weight: 700; line-height: 1.2; }
        .ad-video small { display: block; font-size: 12px; font-weight: 400; color: #cbd5e1; }
        .ad-thumbs { display: grid; gap: 8px; margin-top: 12px; }
        .ad-thumb { aspect-ratio: 1 / 1; object-fit: cover; border-radius: 10px; cursor: pointer; border: 2px solid transparent; width: 100%; }
        .ad-thumb.active { border-color: #f97316; }

        .ad-trust { margin-top: 16px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px; background: #e2e8f0; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; }
        .ad-trust > div { background: #fff; padding: 14px 10px; text-align: center; }
        .ad-trust .t { margin-top: 8px; font-size: 12px; font-weight: 700; color: #1e293b; }
        .ad-trust .d { margin-top: 2px; font-size: 11px; color: #64748b; }

        .ad-make { margin-top: 16px; display: grid; grid-template-columns: minmax(0, 1fr); border: 1px solid #e2e8f0; border-radius: 14px; background: #f8fafc; overflow: hidden; }
        .ad-make-visual { background: #0f1f3d; min-height: 170px; padding: 16px; display: flex; align-items: center; justify-content: center; }
        .ad-make-body { padding: 18px; }
        .ad-make-body h3 { margin: 0 0 6px; font-size: 18px; font-weight: 800; }
        .ad-make-body p { margin: 0 0 12px; font-size: 13px; line-height: 1.5; color: #475569; }
        .ad-checks { list-style: none; margin: 0 0 14px; padding: 0; display: grid; gap: 6px; font-size: 13px; color: #334155; }
        .ad-checks li { display: flex; align-items: center; gap: 8px; }
        .ad-chk { width: 18px; height: 18px; border-radius: 50%; background: #16a34a; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .ad-upload-btn { display: inline-flex; align-items: center; gap: 8px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 16px; font-size: 13px; font-weight: 700; background: #fff; color: #0f172a; cursor: pointer; font-family: inherit; }
        .ad-upload-btn:hover { border-color: #f97316; color: #f97316; }
        .ad-hint { margin-top: 6px; font-size: 11px; color: #94a3b8; }

        .ad-title { margin: 0 0 6px; font-size: clamp(26px, 4vw, 34px); line-height: 1.15; font-weight: 800; }
        .ad-sub { margin: 0 0 12px; font-size: 14px; color: #475569; }
        .ad-rate { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 14px; margin-bottom: 14px; font-size: 13px; color: #64748b; }
        .ad-price { font-size: clamp(28px, 4vw, 34px); font-weight: 800; color: #0f172a; }
        .ad-aslow { margin: 4px 0 18px; font-size: 14px; color: #475569; }
        .ad-aslow b { color: #f97316; }
        .ad-feats { list-style: none; margin: 0 0 18px; padding: 0; display: grid; gap: 4px; }
        .ad-feats li { display: flex; align-items: flex-start; gap: 12px; padding: 8px 0; }
        .ad-feat-ic { width: 36px; height: 36px; border-radius: 50%; background: #f1f5f9; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .ad-feats .t { font-size: 14px; font-weight: 700; color: #0f172a; }
        .ad-feats .d { font-size: 13px; color: #64748b; }
        .ad-sec { display: flex; align-items: center; gap: 12px; margin: 0 0 10px; }
        .ad-sec h3 { margin: 0; font-size: 15px; font-weight: 700; white-space: nowrap; }
        .ad-sec .line { flex: 1; height: 1px; background: #e2e8f0; }

        .ad-color { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 76px; padding: 8px; border: 2px solid #e2e8f0; border-radius: 10px; background: #fff; cursor: pointer; font-family: inherit; font-size: 12px; font-weight: 600; color: #334155; }
        .ad-color.active { border-color: #f97316; background: #fff7ed; }
        .ad-color-img, .ad-color-sw { width: 56px; height: 56px; border-radius: 8px; object-fit: cover; display: block; }

        .ad-bulk-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .ad-size-table { border-collapse: separate; border-spacing: 5px; width: max-content; min-width: 100%; }
        .ad-size-table th { font-size: 11px; font-weight: 700; color: #475569; padding: 6px 2px; white-space: nowrap; text-align: center; }
        .ad-size-cell { display: flex; flex-direction: column; width: 52px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
        .ad-size-cell input { width: 100%; box-sizing: border-box; text-align: center; border: none; outline: none; padding: 9px 0 5px; font-size: 14px; font-weight: 600; -moz-appearance: textfield; }
        .ad-size-cell input::-webkit-outer-spin-button, .ad-size-cell input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .ad-size-cell .steppers { display: flex; }
        .ad-size-cell .steppers button { flex: 1; border: none; background: #fff; cursor: pointer; padding: 5px 0; display: flex; align-items: center; justify-content: center; color: #475569; }
        .ad-size-cell .steppers button:hover { background: #f1f5f9; }

        .ad-totals { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin: 14px 0; font-size: 14px; }
        .ad-cart-row { display: flex; align-items: stretch; gap: 12px; }
        .ad-qty-stepper { display: flex; align-items: center; border: 1px solid #cbd5e1; border-radius: 10px; overflow: hidden; background: #fff; }
        .ad-qty-stepper button { width: 42px; border: none; background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #0f172a; }
        .ad-qty-stepper input { width: 56px; text-align: center; border: none; outline: none; font-weight: 700; font-size: 15px; }
        .ad-add-btn { flex: 1; min-height: 54px; background: #f97316; color: #fff; border: none; border-radius: 10px; padding: 0 20px; font-size: 16px; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; transition: background .15s; }
        .ad-add-btn:hover { background: #ea580c; }
        .ad-services { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 18px; text-align: center; }

        .ad-back-btn { display: inline-flex; align-items: center; gap: 6px; background: #fff; border: 1px solid #e2e8f0; border-radius: 999px; padding: 8px 14px; font-size: 13px; font-weight: 600; color: #475569; cursor: pointer; font-family: inherit; }
        .ad-back-btn:hover { border-color: #f97316; color: #f97316; }

        .ad-banner { margin-top: 36px; display: grid; grid-template-columns: minmax(0, 1fr); background: #0b0c10; color: #fff; border-radius: 16px; overflow: hidden; }
        .ad-banner-copy { padding: 28px 24px; }
        .ad-banner-copy h2 { margin: 0 0 10px; font-size: clamp(20px, 3.4vw, 28px); font-weight: 800; line-height: 1.2; text-transform: uppercase; }
        .ad-banner-copy p { margin: 0; font-size: 14px; line-height: 1.6; color: #cbd5e1; }
        .ad-banner-cmp { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; padding: 0 24px 24px; align-items: center; }
        .ad-cmp { padding: 16px; border-radius: 12px; background: #151821; text-align: center; font-size: 12px; font-weight: 700; letter-spacing: .03em; }
        .ad-cmp b { display: block; margin-top: 4px; font-size: 14px; color: #f97316; }
        .ad-cmp.good b { color: #4ade80; }
        .ad-save { width: 118px; height: 118px; margin: 0 auto; border-radius: 50%; background: radial-gradient(circle at 30% 30%, #fde68a, #d4a017 70%); color: #3b2a00; box-shadow: 0 0 0 4px rgba(212,160,23,.35); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; line-height: 1.05; }
        .ad-save span { font-size: 20px; font-weight: 900; } .ad-save b { font-size: 11px; font-weight: 800; } .ad-save strong { font-size: 30px; font-weight: 900; }

        .ad-reviews-sec { margin-top: 36px; }
        .ad-reviews-sec h2 { margin: 0 0 16px; font-size: 20px; font-weight: 800; }
        .ad-reviews { display: grid; grid-template-columns: minmax(0, 1fr); gap: 24px; border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px; }
        .ad-feature-strip { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-top: 36px; border-top: 1px solid #e2e8f0; padding-top: 24px; }
        .ad-bottom-strip { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
        .ad-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: #0f172a; color: #fff; padding: 12px 20px; border-radius: 12px; font-size: 14px; font-weight: 600; z-index: 9999; box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
        .ad-rich { font-size: 14px; color: #475569; line-height: 1.6; }
        .ad-rich p { margin: 0 0 8px; }
        .ad-rich ul { list-style: disc; padding-left: 22px; margin: 6px 0; }
        .ad-rich ol { list-style: decimal; padding-left: 22px; margin: 6px 0; }
        .ad-rich li { margin: 3px 0; }

        @media (min-width: 640px) {
          .ad-wrap { padding: 24px; }
          .ad-trust { grid-template-columns: repeat(4, 1fr); }
          .ad-make { grid-template-columns: 200px minmax(0, 1fr); }
          .ad-banner-cmp { grid-template-columns: 1fr auto 1fr; }
        }
        @media (min-width: 900px) {
          .ad-grid { grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 40px; }
          .ad-main-img { aspect-ratio: 10 / 9; }
          .ad-banner.has-cmp { grid-template-columns: 1fr 1.3fr; align-items: center; }
          .ad-banner-cmp { padding: 24px 24px 24px 0; }
          .ad-reviews { grid-template-columns: 300px minmax(0, 1fr); }
          .ad-feature-strip { grid-template-columns: repeat(4, 1fr); }
          .ad-bottom-strip { grid-template-columns: repeat(4, 1fr); }
        }
      `}</style>

      {/* Back + cart bar */}
      <div style={{ maxWidth: '1152px', margin: '0 auto', padding: '16px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <button className="ad-back-btn" onClick={onBack}><ChevronLeftIcon size={16} /> Back to Apparel</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button onClick={goCart} style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit', fontSize: '13px', fontWeight: 600 }}>
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <CartIcon size={22} />
              {cartCount > 0 && (
                <span style={{ position: 'absolute', top: '-8px', right: '-9px', background: '#ef4444', color: '#fff', fontSize: '10px', fontWeight: 800, width: '16px', height: '16px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {cartCount}
                </span>
              )}
            </span>
            ${cart.reduce((t, i) => t + i.qty * i.price, 0).toFixed(2)}
          </button>
        </div>
      </div>

           <div className="ad-wrap">
        {/* Breadcrumb */}
        <nav className="ad-crumbs">
          <button onClick={onBack}>Home</button><span>›</span>
          <button onClick={onBack}>Apparel</button><span>›</span>
          <span className="cap">{category}</span><span>›</span>
          <b>{productName}</b>
        </nav>

        <div className="ad-grid">
          {/* ── LEFT ── */}
          <div>
            <div className="ad-gallery">
              <span className="ad-badge">{category === 'shirts' ? 'Best Seller' : 'Premium'}</span>
              <SmartImage src={gallery[activeImage]} fallback={NO_IMAGE} alt={productName} className="ad-main-img" />
              {gallery.length > 1 && (
                <>
                  <button className="ad-nav prev" onClick={prevImage} aria-label="Previous image"><ChevronLeftIcon size={20} /></button>
                  <button className="ad-nav next" onClick={nextImage} aria-label="Next image"><ChevronRightIcon size={20} /></button>
                </>
              )}
              {product.video_url && (
                <a className="ad-video" href={product.video_url} target="_blank" rel="noopener noreferrer">
                  <PlayIcon size={22} fill="#fff" />
                  <span>Watch Video<small>See it in action</small></span>
                </a>
              )}
            </div>

            {gallery.length > 1 && (
              <div className="ad-thumbs" style={{ gridTemplateColumns: `repeat(${Math.min(gallery.length, 6)}, 1fr)` }}>
                {gallery.map((src, i) => (
                  <SmartImage key={i} src={src} fallback={NO_IMAGE} alt={`${productName} ${i + 1}`} className={`ad-thumb ${i === activeImage ? 'active' : ''}`} onClick={() => setActiveImage(i)} />
                ))}
              </div>
            )}

            {/* Trust badges */}
            <div className="ad-trust">
              {TRUST_BADGES.map((b) => (
                <div key={b.title}>
                  <div style={centerDiv}><b.icon size={24} color="#334155" /></div>
                  <div className="t">{b.title}</div>
                  <div className="d">{b.desc}</div>
                </div>
              ))}
            </div>

            {/* Make it yours (upload logo) */}
            {product?.is_customizable == 1 && (
              <div className="ad-make">
                <div className="ad-make-visual">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Your logo" style={{ maxWidth: '100%', maxHeight: 150, objectFit: 'contain' }} />
                  ) : (
                    <div style={{ textAlign: 'center', color: '#93c5fd' }}>
                      <UploadIcon size={30} />
                      <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700 }}>Your Logo Here</div>
                    </div>
                  )}
                </div>

                <div className="ad-make-body">
                  <input type="file" accept="image/png, image/jpeg, image/webp, image/svg+xml" ref={fileInputRef} onChange={handleLogoUpload} style={{ display: 'none' }} />
                  <h3>Make It Yours</h3>
                  <p>Custom embroidery / printing available. Add your company logo for a professional branded look.</p>

                  {printAreas.length > 0 && (
                    <ul className="ad-checks">
                      {printAreas.map((a) => (
                        <li key={a.id}><span className="ad-chk"><CheckIcon size={12} color="#fff" strokeWidth={3} /></span>{a.label}</li>
                      ))}
                    </ul>
                  )}

                  {!isCustomizing ? (
                    <>
                      <button className="ad-upload-btn" onClick={() => fileInputRef.current?.click()}>
                        <UploadIcon size={15} /> Upload Logo
                      </button>
                      <div className="ad-hint">PNG, JPG, WebP or SVG (Max 5MB)</div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>Logo Attached</div>
                          <div style={{ fontSize: 12, color: '#f97316', fontWeight: 700 }}>+ ${(customBaseFee + placementFee).toFixed(2)} / ea</div>
                        </div>
                        <div style={{ display: 'flex', gap: 14 }}>
                          <button onClick={() => fileInputRef.current?.click()} style={{ background: 'none', border: 'none', color: '#0f172a', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Change</button>
                          <button onClick={removeLogo} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Remove</button>
                        </div>
                      </div>
                      {printAreas.length > 0 && (
                        <div>
                          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Select Placement:</label>
                          <select value={selectedAreaId} onChange={(e) => setSelectedAreaId(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, outline: 'none', background: '#fff' }}>
                            {printAreas.map((area) => (
                              <option key={area.id} value={area.id}>
                                {area.label} {Number(area.extra_fee) > 0 ? `(+$${Number(area.extra_fee).toFixed(2)})` : '(Included)'}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT ── */}
          <div>
            <h1 className="ad-title">{productName}</h1>
            <p className="ad-sub">{product.listDescription || 'Premium quality, custom branded apparel.'}</p>

            <div className="ad-rate">
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Stars rating={4.5} size={15} /> 4.8 (96 reviews)
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#15803d', fontWeight: 600 }}>
                <BadgeCheckIcon size={15} /> Verified Quality
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <span className="ad-price">${unitPrice.toFixed(2)}</span>
              {product.originalPrice > unitPrice && (
                <span style={{ fontSize: 16, color: '#94a3b8', textDecoration: 'line-through' }}>${num(product.originalPrice).toFixed(2)}</span>
              )}
            </div>
            <div className="ad-aslow">As low as <b>${bulkLow.toFixed(2)} each</b> when you buy more</div>

            <ul className="ad-feats">
              {features.map((f) => (
                <li key={f.title}>
                  <span className="ad-feat-ic"><f.icon size={18} color="#334155" /></span>
                  <div><div className="t">{f.title}</div><div className="d">{f.desc}</div></div>
                </li>
              ))}
            </ul>

            {detailHtml && (
              <div style={{ marginBottom: 18 }}>
                <h3 style={{ fontWeight: 700, fontSize: 15, margin: '0 0 8px' }}>Product Details</h3>
                <div className="ad-rich" dangerouslySetInnerHTML={{ __html: detailHtml }} />
              </div>
            )}

            {/* Color */}
            <div style={{ marginBottom: 20 }}>
              <div className="ad-sec"><h3>Select Color</h3><span className="line" /></div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {colors.map((c, i) => (
                  <button key={c.name} className={`ad-color ${i === activeColor ? 'active' : ''}`} onClick={() => setActiveColor(i)}>
                    {c.front_image
                      ? <SmartImage src={c.front_image} fallback={NO_IMAGE} alt={c.name} className="ad-color-img" />
                      : <span className="ad-color-sw" style={{ background: c.hex, border: String(c.name).toLowerCase() === 'white' ? `1px solid ${C.border}` : 'none' }} />}
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Bulk order */}
            <div style={{ marginBottom: 6 }}>
              <h3 style={{ fontWeight: 700, fontSize: 15, margin: '0 0 4px' }}>Bulk Order: Multiple Sizes &amp; Quantities</h3>
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 10px' }}>Mix sizes and quantities. The more you buy, the more you save!</p>
              <div className="ad-bulk-scroll">
                <table className="ad-size-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', paddingRight: 8 }}>Size</th>
                      {sizes.map((s) => <th key={s}>{s}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', paddingRight: 8, whiteSpace: 'nowrap' }}>Your Qty</td>
                      {sizes.map((s, i) => (
                        <td key={s} style={{ padding: 0 }}>
                          <div className="ad-size-cell">
                            <input
                              type="number" min="0" value={qty[i]}
                              onChange={(e) => { const v = Math.max(0, parseInt(e.target.value || '0', 10) || 0); setQty((prev) => { const n = [...prev]; n[i] = v; return n; }); }}
                            />
                            <div className="steppers">
                              <button onClick={(e) => { e.preventDefault(); updateQty(i, -1); }} aria-label={`decrease ${s}`}><ChevronDownIcon size={14} /></button>
                              <button onClick={(e) => { e.preventDefault(); updateQty(i, 1); }} aria-label={`increase ${s}`}><ChevronUpIcon size={14} /></button>
                            </div>
                          </div>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals + add to cart */}
            <div className="ad-totals">
              <div style={{ fontWeight: 700 }}>Total Items: <span style={{ color: '#f97316' }}>{totalQty}</span></div>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                <span style={{ color: '#64748b' }}>Unit Price: <b style={{ color: '#0f172a' }}>${unitPrice.toFixed(2)}</b></span>
                <span style={{ color: '#64748b' }}>Total Price: <b style={{ color: '#0f172a' }}>${totalPrice.toFixed(2)}</b></span>
              </div>
            </div>

            <div className="ad-cart-row">
              <div className="ad-qty-stepper">
                <button onClick={() => setTotalQty(totalQty - 1)} aria-label="decrease total"><MinusIcon size={15} /></button>
                <input value={totalQty} onChange={(e) => setTotalQty(e.target.value)} />
                <button onClick={() => setTotalQty(totalQty + 1)} aria-label="increase total"><PlusIcon size={15} /></button>
              </div>
              <button className="ad-add-btn" onClick={addAllToCart}><CartIcon size={20} /> Add to Cart</button>
            </div>

            <div className="ad-services">
              {SERVICE_PROMISES.map((s) => (
                <div key={s.title} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <s.icon size={22} color="#f97316" />
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>{s.title}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bulk pricing banner */}
        <section className={`ad-banner ${savePct > 0 ? 'has-cmp' : ''}`}>
          <div className="ad-banner-copy">
            <h2>Professional gear. Built to last.<br /><span style={{ color: '#f97316' }}>Bulk pricing that works for you.</span></h2>
            <p>Outfit your entire team with premium {category} at unbeatable prices. Look professional, stay comfortable, and represent your brand everywhere.</p>
          </div>
          {savePct > 0 && (
            <div className="ad-banner-cmp">
              <div className="ad-cmp">RETAIL PRICE<b>UP TO ${retail.toFixed(2)} EACH</b></div>
              <div className="ad-save"><span>SAVE</span><b>UP TO</b><strong>{savePct}%</strong></div>
              <div className="ad-cmp good">OUR PRICE<b>AS LOW AS ${bulkLow.toFixed(2)} EACH</b></div>
            </div>
          )}
        </section>

        {/* Reviews */}
        <section className="ad-reviews-sec">
          <h2>What Customers Are Saying</h2>
          <div className="ad-reviews">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                <div style={{ fontSize: 40, fontWeight: 800 }}>4.8</div>
                <div><Stars rating={4.5} size={18} /><div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Based on 96 reviews</div></div>
              </div>
              {RATING_BREAKDOWN.map((r) => (
                <div key={r.stars} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#475569', marginBottom: 4 }}>
                  <span style={{ width: 12 }}>{r.stars}</span>
                  <StarIcon size={11} color="#f97316" fill="#f97316" />
                  <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: '#f97316', width: `${(r.count / 96) * 100}%` }} />
                  </div>
                  <span style={{ width: 22, textAlign: 'right' }}>{r.count}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>JP</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontWeight: 700, fontSize: 14 }}>
                  James Peterson <BadgeCheckIcon size={15} color="#2563eb" /> <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>Verified Buyer</span>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Fleet Manager</div>
                <Stars rating={5} size={13} />
                <h4 style={{ fontWeight: 700, margin: '8px 0 4px', fontSize: 15 }}>Outstanding Quality &amp; Fit!</h4>
                <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, margin: 0 }}>
                  We ordered for our entire team and couldn't be happier. Great fit, excellent quality, and the branding looks sharp.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Feature strip */}
        <div className="ad-feature-strip">
          {features.map((f) => (
            <div key={f.title} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={centerDiv}><f.icon size={22} color="#64748b" /></div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{f.title}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Bottom strip */}
      <div style={{ background: '#0b0c10', color: '#fff', marginTop: '8px' }}>
        <div style={{ maxWidth: '1152px', margin: '0 auto', padding: '24px 16px' }}>
          <div className="ad-bottom-strip">
            {BOTTOM_STRIP.map(f => (
              <div key={f.title} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <f.icon size={22} color="#f97316" style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, lineHeight: 1.2 }}>{f.title}</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.2 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {toast && <div className="ad-toast">{toast}</div>}
    </div>
  );
}
