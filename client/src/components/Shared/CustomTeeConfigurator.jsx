import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config';
import { toSafeHtml } from '../../utils/richText';
import SizeChartDrawer from '../Apparel/SizeChartDrawer'; // adjust both paths to where you put these files
import { getSizes } from '../Apparel/apparelPricing';
import { primaryImageUrl } from '../../utils/productImages';

// ── LOCAL ICONS ──────────────────────────────────────────────────────────────
const makeIcon = (children) => {
  const Icon = ({ size = 24, strokeWidth = 2, color = 'currentColor', fill = 'none' } = {}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
  );
  return Icon;
};

const ChevronDownIcon = makeIcon(<path d="M6 9l6 6 6-6" />);
const ChevronUpIcon = makeIcon(<path d="M6 15l6-6 6 6" />);
const MinusIcon = makeIcon(<path d="M5 12h14" />);
const PlusIcon = makeIcon(<path d="M12 5v14M5 12h14" />);
const SparklesIcon = makeIcon(<><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" /></>);
const FileTextIcon = makeIcon(<><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" /></>);
const LockIcon = makeIcon(<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>);
const InfoIcon = makeIcon(<><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>);
const ArrowRightIcon = makeIcon(<><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>);
const TrashIcon = makeIcon(<><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>);
const ArrowLeftIcon = makeIcon(<><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>);
const CloudUploadIcon = makeIcon(<><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" /><path d="M12 12v9" /><path d="m8 16 4-4 4 4" /></>);
const ImageIcon = makeIcon(<><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></>);
const CloseIcon = makeIcon(<><path d="M18 6L6 18" /><path d="M6 6l12 12" /></>);
const QrCodeIcon = makeIcon(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h7v7h-7z" /></>);
const ChevronLeftIcon = makeIcon(<path d="M15 18l-6-6 6-6" />);
const ChevronRightIcon = makeIcon(<path d="M9 18l6-6-6-6" />);
const CartIcon = makeIcon(<><circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" /></>);
const DropletsIcon = makeIcon(<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />);
const StretchIcon = makeIcon(<><path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" /></>);
const LayersIcon = makeIcon(<><path d="m12 2-10.5 5.63 10.5 5.37 10.5-5.37L12 2z" /><path d="M1.5 12.25 12 17.5l10.5-5.25" /><path d="M1.5 17.5 12 22.75l10.5-5.25" /></>);
const RulerIcon = makeIcon(<><path d="M21.3 8.7 15.3 2.7a1 1 0 0 0-1.4 0L2.7 13.9a1 1 0 0 0 0 1.4l6 6a1 1 0 0 0 1.4 0L22.7 10.1a1 1 0 0 0 0-1.4Z" /><path d="m7.5 10.5 2 2" /><path d="m10.5 7.5 2 2" /><path d="m13.5 4.5 2 2" /><path d="m4.5 13.5 2 2" /></>);
const TruckIcon = makeIcon(<><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" /><path d="M15 18H9" /><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" /><circle cx="17" cy="18" r="2" /><circle cx="7" cy="18" r="2" /></>);
const RotateIcon = makeIcon(<><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></>);
const ShieldIcon = makeIcon(<><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></>);
const BadgeCheckIcon = makeIcon(<><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" /><path d="m9 12 2 2 4-4" /></>);
const SunIcon = makeIcon(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M19.07 4.93l-1.41 1.41M6.34 17.66l-1.41 1.41" /></>);
const HeadphonesIcon = makeIcon(<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />);
const MessageCircleIcon = makeIcon(<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />);
const MessageSquareIcon = makeIcon(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />);
const MailIcon = makeIcon(<><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></>);
const PhoneIcon = makeIcon(<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />);
const CheckIcon = makeIcon(<path d="M20 6 9 17l-5-5" />);
const PlayIcon = makeIcon(<polygon points="6 4 20 12 6 20 6 4" />);
const StarIcon = makeIcon(<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />);
const UsersIcon = makeIcon(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>);
const PencilIcon = makeIcon(<><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></>);

// ── DATA & HELPERS ───────────────────────────────────────────────────────────
const DEFAULT_SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL'];
const SIZE_EXTRAS = { '2xl': 2, '2x': 2, 'xxl': 2, '3xl': 4, '3x': 4, 'xxxl': 4 };
export const MIN_ORDER = 40;

const COLOR_MAP = {
  black: '#111318', white: '#f4f4f5', gray: '#6b7280', grey: '#6b7280',
  navy: '#1e3a5f', blue: '#2563eb', charcoal: '#5b6470', red: '#dc2626',
  green: '#16a34a', 'dark green': '#14532d', maroon: '#881337', orange: '#f97316',
};

const VIEWS = ['Front', 'Back', 'Left Sleeve', 'Right Sleeve'];
const DECORATIONS = ['Embroidery', 'DTF', 'Screen Printing'];
// the admin saves these as text (older records may say "DTF Printing")
const normalizeDecoration = (v) => {
  const t = String(v).trim().toLowerCase();
  if (t.startsWith('emb')) return 'Embroidery';
  if (t.startsWith('dtf')) return 'DTF';
  if (t.startsWith('screen')) return 'Screen Printing';
  return null;
};
const FALLBACK_PLACEMENTS = [
  { id: 'Left Chest',   label: 'Left Chest',   view: 'Front',        x: 20, y: 42, w: 15, extra_fee: 0 },
  { id: 'Front Center', label: 'Front Center', view: 'Front',        x: 50, y: 44, w: 34, extra_fee: 0 },
  { id: 'Center Back',  label: 'Center Back',  view: 'Back',         x: 50, y: 44, w: 40, extra_fee: 0 },
  { id: 'Left Sleeve',  label: 'Left Sleeve',  view: 'Left Sleeve',  x: 22, y: 16, w: 18, extra_fee: 0 },
  { id: 'Right Sleeve', label: 'Right Sleeve', view: 'Right Sleeve', x: 78, y: 16, w: 18, extra_fee: 0 },
];

const ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');
const MAX_LOGO_MB = 5;

const parseSizes = (field) => {
  if (!field) return DEFAULT_SIZES;
  let list;
  try {
    const parsed = JSON.parse(String(field));
    list = Array.isArray(parsed) ? parsed : [parsed];
  } catch { list = String(field).split(','); }
  const out = list.map(entry => String(entry?.size || entry?.name || entry?.label || entry || '').trim()).filter(Boolean);
  return out.length ? out : DEFAULT_SIZES;
};

const HEX_RE = /^#[0-9a-f]{3,8}$/i;
const hexToRgb = (hex) => {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const NAMED_COLORS = [
  ['Black', '#000000'], ['White', '#ffffff'], ['Gray', '#808080'], ['Silver', '#c0c0c0'],
  ['Red', '#dc2626'], ['Maroon', '#7f1d1d'], ['Orange', '#f97316'], ['Yellow', '#eab308'],
  ['Green', '#16a34a'], ['Dark Green', '#14532d'], ['Teal', '#0d9488'], ['Blue', '#2563eb'],
  ['Navy', '#1e3a5f'], ['Purple', '#7c3aed'], ['Pink', '#ec4899'], ['Brown', '#78350f'], ['Beige', '#d6c7a1'],
];
const nearestColorName = (hex) => {
  const [r, g, b] = hexToRgb(hex);
  let best = NAMED_COLORS[0][0], bestD = Infinity;
  NAMED_COLORS.forEach(([name, h]) => {
    const [r2, g2, b2] = hexToRgb(h);
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (d < bestD) { bestD = d; best = name; }
  });
  return best;
};
const isLightHex = (hex) => { const [r, g, b] = hexToRgb(hex); return 0.299 * r + 0.587 * g + 0.114 * b > 235; };

const parseColors = (colorsField) => {
  if (!colorsField) return [{ name: 'Black', hex: COLOR_MAP.black }];
  let list;
  try {
    const parsed = JSON.parse(typeof colorsField === 'string' ? colorsField : JSON.stringify(colorsField));
    list = Array.isArray(parsed) ? parsed : [parsed];
  } catch { list = String(colorsField).split(',').map(s => s.trim()).filter(Boolean); }
  
  return list.map(entry => {
    const obj = entry && typeof entry === 'object' ? entry : null;
   const rawName = String(obj?.name || obj?.label || obj?.value || entry || '').trim();
    const hex = (obj && HEX_RE.test(obj.hex)) ? obj.hex : (HEX_RE.test(rawName) ? rawName : (COLOR_MAP[rawName.toLowerCase()] || '#334155'));
    // the admin saves some colors with the hex code as the name: show a friendly name instead
    const name = HEX_RE.test(rawName) ? nearestColorName(hex) : rawName;
    return { name: name || hex, hex, front_image: obj?.front_image || null, back_image: obj?.back_image || null };
  });
};

// const resolveImageUrl = (img) => {
//   const clean = String(img || '').replace(/['"[\]]/g, '').trim();
//   if (!clean || clean === 'null') return null;
//   if (clean.startsWith('http')) return clean;
//   const baseUrl = API_BASE_URL ? API_BASE_URL.split('/api')[0] : 'https://developer.globallimos.com/sales';
//   return `${baseUrl}/uploads/products/${clean}`;
// };

const resolveImageUrl = (img) => {
  const clean = String(img || '').replace(/['"[\]]/g, '').trim();
  if (!clean || clean === 'null') return null;
  if (clean.startsWith('http')) return clean;
  return primaryImageUrl(clean);
};

const sizeExtra = (size) => SIZE_EXTRAS[String(size).toLowerCase()] || 0;
const num = (v, fallback = 0) => Number.isFinite(parseFloat(v)) ? parseFloat(v) : fallback;

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
  { icon: TruckIcon, title: 'Fast Production', desc: 'Get it on time' },
  { icon: ShieldIcon, title: 'Premium Quality', desc: 'Built to last' },
  { icon: StarIcon, title: 'Perfect for Teams', desc: 'Business, Events & More' },
  { icon: UsersIcon, title: 'Need Help?', desc: "We're here for you" },
];

// ── SUB-COMPONENT: SHIRT GLYPH (FALLBACK) ────────────────────────────────────
const ShirtGlyph = ({ color = '#111318', small = false, view = 'Front' }) => (
  <svg viewBox="0 0 200 200" className={small ? 'tc-glyph tc-glyph-sm' : 'tc-glyph'} fill="none">
    <path d="M70 30 L55 15 L20 35 L35 65 L50 55 L50 175 L150 175 L150 55 L165 65 L180 35 L145 15 L130 30 Q100 55 70 30 Z" fill={color} />
    {view === 'Front' && <path d="M70 30 Q100 55 130 30 Q100 40 70 30 Z" fill="#ffffff" opacity="0.25" />}
    {view === 'Back' && (
      <>
        <path d="M78 36 Q100 58 122 36" stroke="rgba(0,0,0,0.28)" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path d="M100 58 L100 168" stroke="rgba(0,0,0,0.18)" strokeWidth="2.5" strokeDasharray="6 6" strokeLinecap="round" fill="none" />
      </>
    )}
    {view === 'Left Sleeve' && (
      <><path d="M20 35 L55 15 L50 55 L35 65 Z" fill="#ffffff" opacity="0.18" /><path d="M26 40 L46 56" stroke="rgba(0,0,0,0.22)" strokeWidth="2.5" strokeLinecap="round" /></>
    )}
    {view === 'Right Sleeve' && (
      <><path d="M180 35 L145 15 L150 55 L165 65 Z" fill="#ffffff" opacity="0.18" /><path d="M174 40 L154 56" stroke="rgba(0,0,0,0.22)" strokeWidth="2.5" strokeLinecap="round" /></>
    )}
  </svg>
);

// ── SUB-COMPONENT: ACCORDION ROW ─────────────────────────────────────────────
const AccordionRow = ({ number, title, value, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: '1px solid #f1f5f9' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 0', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          {number && <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#0f172a', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{number}</span>}
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: '#1e293b' }}>{title}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#64748b', flexShrink: 0 }}>
          {value}
          {open ? <ChevronUpIcon size={16} color="#94a3b8" /> : <ChevronDownIcon size={16} color="#94a3b8" />}
        </span>
      </button>
      {open && <div style={{ paddingBottom: 20 }}>{children}</div>}
    </div>
  );
};

// ── SUB-COMPONENT: QTY STEPPER ───────────────────────────────────────────────
const QtyStepper = ({ size, value, onChange }) => {
  const extra = sizeExtra(size);
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px' }}>
      <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>{size}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <MinusIcon size={15} />
        </button>
        <input
          type="number"
          min="0"
          value={value}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value || '0', 10) || 0))}
          style={{ width: '100%', minWidth: 0, border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 0', textAlign: 'center', fontSize: 14, fontWeight: 700, outline: 'none' }}
        />
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <PlusIcon size={15} />
        </button>
      </div>
      {extra > 0 && <div style={{ marginTop: 4, textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>+ ${extra.toFixed(2)}</div>}
    </div>
  );
};

// ── SUB-COMPONENT: FULL UPLOAD MODAL ─────────────────────────────────────────
const UploadModal = ({ isOpen, onClose, onUpload }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef(null);

  if (!isOpen) return null;

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onUpload(e.dataTransfer.files[0]);
      onClose();
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      onUpload(e.target.files[0]);
      onClose();
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div style={{ backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }} onClick={e => e.stopPropagation()}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>Upload your design</h2>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#475569' }}>
            <CloseIcon size={20} />
          </button>
        </div>

        <div className="lum-body">
          <div className={`lum-dropzone ${isDragging ? 'dragging' : ''}`} onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}>
            <input type="file" ref={fileRef} onChange={handleFileSelect} accept="image/png,image/jpeg,image/webp,image/svg+xml" style={{ display: 'none' }} />
            <button onClick={() => fileRef.current?.click()} className="lum-btn-primary">
              <CloudUploadIcon size={20} /> Upload from this device
            </button>
            <button onClick={() => alert('Mobile scan-to-upload coming soon!')} className="lum-btn-secondary">
              <QrCodeIcon size={20} /> Upload from phone
            </button>
            <span style={{ fontSize: '14px', color: '#64748b', marginTop: '12px' }}>or drag and drop here</span>
          </div>

          <div className="lum-info">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, fontSize: '14px', color: '#0f172a', paddingBottom: '16px', borderBottom: '1px solid #e2e8f0', cursor: 'pointer' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FileTextIcon size={18} /> Specs and templates</span>
              <ChevronDownIcon size={16} />
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: '#64748b', textAlign: 'center', padding: '32px 20px' }}>
              Your uploaded files will appear here once you add them
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── SUB-COMPONENT: DESIGN UPLOAD AREA ────────────────────────────────────────
// Find the DesignUploadArea component and change it to this:
const DesignUploadArea = ({ logo, onOpenEditor, onRemove }) => {
  return (
    <div style={{ padding: '4px 0' }}>
      {!logo ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button 
            type="button" 
            onClick={onOpenEditor}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#fff', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '14px', fontSize: '15px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
          >
            Upload design <CloudUploadIcon size={18} />
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px' }}>
          <div style={{ width: 64, height: 64, borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img src={logo.preview || logo?.url} alt="Uploaded logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Design Attached</div>
          </div>
          <button type="button" onClick={onRemove} style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#ef4444', borderRadius: '8px', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <TrashIcon size={18} />
          </button>
        </div>
      )}
    </div>
  );
};

// ── CONTACT OPTIONS ── fill in your real details. An option with an empty value is hidden.
const CONTACT = {
  whatsapp: '+919501181265',   // number with country code, e.g. '15551234567'
  messenger: 'navishgoyal8',  // your Facebook page username or id, e.g. 'yourpage'
  phone: '+919501181265',      // used for both Call and Text, e.g. '+15551234567'
  email: 'goyalnavish125@gmail.com',      // e.g. 'sales@yourcompany.com'
};

const ContactModal = ({ open, onClose, productName }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open) return null;

  const msg = `Hi! I have a question about "${productName}".`;
  const page = typeof window !== 'undefined' ? window.location.href : '';
  const tel = String(CONTACT.phone || '').replace(/[^\d+]/g, '');
  const waNumber = String(CONTACT.whatsapp || '').replace(/\D/g, '');

  const options = [
    waNumber && { key: 'wa', title: 'WhatsApp', sub: 'Chat with us', color: '#25D366', icon: MessageCircleIcon, external: true,
      href: `https://wa.me/${waNumber}?text=${encodeURIComponent(`${msg}\n${page}`)}` },
    CONTACT.messenger && { key: 'ms', title: 'Facebook Messenger', sub: 'Message our page', color: '#0084ff', icon: MessageCircleIcon, external: true,
      href: `https://m.me/${CONTACT.messenger}` },
    tel && { key: 'sms', title: 'Text', sub: CONTACT.phone, color: '#0ea5e9', icon: MessageSquareIcon,
      href: `sms:${tel}?&body=${encodeURIComponent(msg)}` },
    CONTACT.email && { key: 'em', title: 'Email', sub: CONTACT.email, color: '#f97316', icon: MailIcon,
      href: `mailto:${CONTACT.email}?subject=${encodeURIComponent(`Question about ${productName}`)}&body=${encodeURIComponent(`${msg}\n${page}`)}` },
    tel && { key: 'call', title: 'Call', sub: CONTACT.phone, color: '#0f172a', icon: PhoneIcon,
      href: `tel:${tel}` },
  ].filter(Boolean);

  return (
    <div className="tc-contact-overlay" onClick={onClose}>
      <div className="tc-contact" role="dialog" aria-modal="true" aria-label="Talk to our team" onClick={(e) => e.stopPropagation()}>
        <div className="tc-contact-head">
          <div>
            <h3>Talk to our team</h3>
            <p>Choose how you'd like to reach us.</p>
          </div>
          <button className="tc-x" onClick={onClose} aria-label="Close"><CloseIcon size={18} /></button>
        </div>

        {options.length === 0 && <p style={{ fontSize: 14, color: '#64748b' }}>Contact options aren't set up yet.</p>}

        {options.map((o) => (
          <a key={o.key} className="tc-contact-row" href={o.href} {...(o.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
            <span className="tc-contact-ic" style={{ background: o.color }}><o.icon size={20} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="t" style={{ display: 'block' }}>{o.title}</span>
              <span className="s" style={{ display: 'block' }}>{o.sub}</span>
            </span>
            <ChevronRightIcon size={18} color="#94a3b8" />
          </a>
        ))}
      </div>
    </div>
  );
};

 // ── MAIN CONFIGURATOR PAGE COMPONENT ─────────────────────────────────────────
// Used when this page is opened from its own route (no cart props passed in).
// Mirrors Storefront's handleCustomTeeAdd and writes to the same localStorage cart.
const addCustomTeeToStoredCart = (product, config) => {
  const sig = JSON.stringify(config || {});
  let hash = 0;
  for (let i = 0; i < sig.length; i++) {
    hash = (Math.imul(31, hash) + sig.charCodeAt(i)) | 0;
  }
  const cartItemId = `tee-${product.id}-${Math.abs(hash).toString(36)}`;
  let stored = [];
  try { stored = JSON.parse(localStorage.getItem('seatcover_cart')) || []; } catch { stored = []; }
  if (stored.some((item) => item.cartItemId === cartItemId)) return;
  stored.push({
    ...product,
    name: product.name || 'Custom Tee',
    image: product.image || '',
    cartItemId,
    price: Number(config?.estTotal) || 0,
    originalPrice: 0,
    qty: 1,
    type: 'A',
    isCustomApparel: true,
    totalPieces: config?.totalPieces || 0,
    apparel: config || {},
  });
  try {
    localStorage.setItem('seatcover_cart', JSON.stringify(stored));
  } catch (err) {
    console.error('[cart] save failed', err);
  }
};

// ── MAIN CONFIGURATOR PAGE COMPONENT ─────────────────────────────────────────
export default function CustomTeeConfigurator({ cart = [], handleCustomTeeAdd, goToCart, onBack }) {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  
  // If product is passed via state, use it. Otherwise, fetch it.
  const [product, setProduct] = useState(location.state?.product || null);
  const [loading, setLoading] = useState(!product);
  const [descOpen, setDescOpen] = useState(false);

  useEffect(() => {
  if (!id) return;
  fetch(`${API_BASE_URL}/products/${id}`)
    .then((res) => res.json())
    .then((data) => {
      const fresh = data?.data || data?.product;
      if (!data?.success || !fresh) return;
      // only refresh the fields that change; keep the mapped fields (image, images, price...) as they are
      setProduct((prev) => prev ? ({
        ...prev,
        colors: fresh.colors ?? prev.colors,
        sizes: fresh.sizes ?? prev.sizes,
        size_chart_mode: fresh.size_chart_mode === 'image' ? 'image' : 'table',
        size_chart_image: fresh.size_chart_image ?? null,
      }) : fresh);
    })
    .catch(() => {})
    .finally(() => setLoading(false));
}, [id]);

  const sizes = useMemo(() => parseSizes(product?.sizes), [product]);
  const colors = useMemo(() => parseColors(product?.colors), [product]);
  const detailHtml = useMemo(
    () => toSafeHtml(product?.detail_page_description || product?.detailDescription),
    [product]
  );

    const decorations = useMemo(() => {
  const src = product?.decoration_type ?? product?.modification_type ?? '';
  const raw = Array.isArray(src) ? src.join(',') : String(src);
  const found = raw.replace(/[\[\]"]/g, '').split(',').map(normalizeDecoration).filter(Boolean);
  const list = DECORATIONS.filter((d) => found.includes(d));
  return list.length ? list : DECORATIONS;
}, [product]);

const minOrder = useMemo(() => {
  const m = parseInt(product?.moq, 10);
  return m > 0 ? m : MIN_ORDER;
}, [product]);

  const baseImages = useMemo(() => {
  const clean = (arr) => arr.map((s) => String(s).replace(/['"[\]]/g, '').trim()).filter(Boolean);

  // preferred: the full list passed by the mapper
  if (Array.isArray(product?.images) && product.images.length) return clean(product.images);

  // fallback: product.image as an array, a JSON string, or a plain value
  const raw = product?.image;
  if (Array.isArray(raw)) return clean(raw);
  try {
    const parsed = JSON.parse(String(raw || '[]'));
    return clean(Array.isArray(parsed) ? parsed : [parsed]);
  } catch {
    return clean(String(raw || '').split(','));
  }
}, [product]);

  const availablePlacements = useMemo(() => {
    if (!product?.print_areas) return FALLBACK_PLACEMENTS;
    try {
      const parsed = typeof product.print_areas === 'string' ? JSON.parse(product.print_areas) : product.print_areas;
      if (!Array.isArray(parsed) || parsed.length === 0) return FALLBACK_PLACEMENTS;
      return parsed.map(pa => {
        let mappedView = 'Front';
        if (pa.view === 'back') mappedView = 'Back';
        if (pa.view === 'left_sleeve') mappedView = 'Left Sleeve';
        if (pa.view === 'right_sleeve') mappedView = 'Right Sleeve';
        return {
          id: String(pa.id || pa.label), label: pa.label || 'Custom Box', view: mappedView,
          // admin boxes store the top-left corner; the preview positions the logo by its center
          x: (parseFloat(pa.x) || 0) + (parseFloat(pa.w) || 20) / 2,
          y: (parseFloat(pa.y) || 0) + (parseFloat(pa.h) || parseFloat(pa.w) || 20) / 2,
          w: parseFloat(pa.w) || 20,          
          extra_fee: parseFloat(pa.extra_fee) || 0,
          image: pa.image || null
        };
      });
    } catch { return FALLBACK_PLACEMENTS; }
  }, [product]);

    // when the product arrives after first render, make sure the selected placement exists
  useEffect(() => {
    if (placement !== 'Custom' && !availablePlacements.some((p) => p.id === placement)) {
      setPlacement(availablePlacements[0].id);
      setActiveView(availablePlacements[0].view);
    }
  }, [availablePlacements]); // eslint-disable-line react-hooks/exhaustive-deps

  const [quantities, setQuantities] = useState(() => {
    const init = {}; sizes.forEach(s => { init[s] = 0; }); return init;
  });
  
  const [activeColor, setActiveColor] = useState(0);
  const [decoration, setDecoration] = useState(DECORATIONS[0]);
  const [placement, setPlacement] = useState(availablePlacements[0] ? availablePlacements[0].id : 'Custom');
  const [activeView, setActiveView] = useState(availablePlacements[0] ? availablePlacements[0].view : 'Front');
  const [notes, setNotes] = useState('');
  const [logo, setLogo] = useState(location.state?.savedLogo || null);
  const [logoPos, setLogoPos] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState(null);
  const [contactOpen, setContactOpen] = useState(false);

  const shirtPreviewRef = useRef(null);

    useEffect(() => { if (!decorations.includes(decoration)) setDecoration(decorations[0]); }, [decorations]); // eslint-disable-line react-hooks/exhaustive-deps
    const [selectedIds, setSelectedIds] = useState(() => (availablePlacements[0] ? [availablePlacements[0].id] : []));
  useEffect(() => {
    setSelectedIds((ids) => {
      const ok = ids.filter((i) => availablePlacements.some((p) => p.id === i));
      return ok.length ? ok : (availablePlacements[0] ? [availablePlacements[0].id] : []);
    });
  }, [availablePlacements]);
  // ── DYNAMIC PRICING ──
  const basePrice = useMemo(() => num(product?.selling_price, num(product?.price, num(product?.dp, 18.75))), [product]);
  const isCustomizing = !!logo;
  const customBaseFee = isCustomizing ? num(product?.custom_base_fee) : 0;
  const curPreset = availablePlacements.find(p => p.id === placement);
  // placements in the order the customer picked them: the first is included, each extra one adds its fee
  const selectedPlacements = selectedIds.map((i) => availablePlacements.find((p) => p.id === i)).filter(Boolean);
  const extraPlacementFee = selectedPlacements.slice(1).reduce((s, p) => s + num(p.extra_fee), 0);
  const placementFee = isCustomizing ? extraPlacementFee : 0;  
  const unitPrice = basePrice + customBaseFee + placementFee;
  const customizedUnit = basePrice + num(product?.custom_base_fee) + extraPlacementFee; // the price once a design is added
  const addlFee = Math.max(0, ...availablePlacements.map((p) => num(p.extra_fee)));
  const totalPieces = useMemo(() => Object.values(quantities).reduce((a, b) => a + b, 0), [quantities]);
  const estTotal = useMemo(() => sizes.reduce((sum, s) => sum + (quantities[s] || 0) * (unitPrice + sizeExtra(s)), 0), [quantities, sizes, unitPrice]);

  const productName = product?.name || 'Custom Apparel';
  const garmentColor = colors[activeColor] || { name: 'Black', hex: '#111318' };
  const ready = totalPieces >= minOrder;

const currentBgImage = useMemo(() => {
  // the photo uploaded in the admin for this exact placement
  if (curPreset?.image) return resolveImageUrl(curPreset.image);

  let img = activeView === 'Front' ? garmentColor?.front_image : garmentColor?.back_image;
  if (!img && baseImages.length > 0) img = activeView === 'Back' && baseImages.length > 1 ? baseImages[1] : baseImages[0];
  return resolveImageUrl(img);
}, [curPreset, garmentColor, activeView, baseImages]);

    // ── GALLERY: every image from the backend array ──
  // the selected color's front/back come first, then the rest of product.image (duplicates removed)
  const gallery = useMemo(() => {
    const items = [];
    const seen = new Set();
    const push = (raw, view, pid = null) => {
  const src = resolveImageUrl(raw);
  if (!src || seen.has(src)) return;
  seen.add(src);
  items.push({ src, view, pid });
};
push(garmentColor?.front_image || baseImages[0], 'Front');
push(garmentColor?.back_image || baseImages[1], 'Back');
baseImages.forEach((img) => push(img, null));
availablePlacements.forEach((p) => push(p.image, null, p.id));   // <-- ADD
return items;
  }, [garmentColor, baseImages, availablePlacements]);

  const [galleryIdx, setGalleryIdx] = useState(0);
  const [customView, setCustomView] = useState('Front');
  const touchX = useRef(null);

  const idx = Math.min(galleryIdx, Math.max(0, gallery.length - 1));
  const current = gallery[idx] || null;

  // which gallery image matches a placement view (sleeves use the back photo, as before)
  const viewIdx = (v) => {
    const want = v === 'Front' ? 'Front' : 'Back';
    const i = gallery.findIndex((g) => g.view === want);
    return i >= 0 ? i : 0;
  };
  // the logo is drawn only on the photo that matches its placement
  const placeView = curPreset ? (curPreset.view === 'Front' ? 'Front' : 'Back') : customView;
  const overlayIdx = Math.max(0, gallery.findIndex((g) => g.view === placeView));

  const goTo = (i) => {
    const n = gallery.length;
    if (!n) return;
    const next = (i + n) % n;
    setGalleryIdx(next);
    if (gallery[next].view) setActiveView(gallery[next].view);
  };

    const togglePlacement = (p) => {
    const on = selectedIds.includes(p.id);
    if (on && selectedIds.length === 1) return; // keep at least one placement
    const next = on ? selectedIds.filter((i) => i !== p.id) : [...selectedIds, p.id];
    setSelectedIds(next);
    const show = on ? (placement === p.id ? availablePlacements.find((q) => q.id === next[0]) : null) : p;
    if (show) { 
      setPlacement(show.id); 
      setActiveView(show.view); 
      setGalleryIdx(idxFor(show)); 
      setLogoPos({ x: show.x, y: show.y, w: show.w }); 
    }  
  };

  const stepImage = (d) => goTo(idx + d);

  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 45) stepImage(dx < 0 ? 1 : -1); // swipe on phones
  };

  // changing color swaps the front/back photos: jump back to the current view's photo
  useEffect(() => { setGalleryIdx(viewIdx(activeView)); }, [activeColor]); // eslint-disable-line react-hooks/exhaustive-deps

  const effPos = logoPos || (curPreset ? { x: curPreset.x, y: curPreset.y, w: curPreset.w } : { x: 20, y: 42, w: 20 });

 const viewIdxOf = (v) => Math.max(0, gallery.findIndex((g) => g.view === v));
// the photo a placement is drawn on: its own photo, else the front/back photo
const idxFor = (p) => {
  const i = gallery.findIndex((g) => g.pid === p.id);
  return i >= 0 ? i : viewIdxOf(p.view === 'Front' ? 'Front' : 'Back');
};
const overlays = [
  ...selectedPlacements.filter((p) => p.id !== placement).map((p) => ({ key: p.id, at: idxFor(p), pos: { x: p.x, y: p.y, w: p.w } })),
  { key: 'active', at: curPreset ? idxFor(curPreset) : viewIdxOf(customView), pos: effPos },
];

  const handleOpenEditor = () => {
    navigate(`/sales/crm/apparel/editor/${id}`, {
      state: {
        product: product,
        color: garmentColor,
        placement: curPreset,
        currentBgImage: currentBgImage,
        unitPrice: customizedUnit,
        placementLabels: selectedPlacements.map((p) => p.label),
        decoration
      }
    });
  };

  const placeLogoOnShirt = (e) => {
    if (!logo || !shirtPreviewRef.current || !current?.view) return;
    const rect = shirtPreviewRef.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 10;
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 10;
    setLogoPos({ x: Math.max(2, Math.min(98, x)), y: Math.max(2, Math.min(98, y)), w: effPos.w || 20 });
    setPlacement('Custom');
    setCustomView(current.view)
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  const handleUpload = (file) => {
    if (!file) return;
    if (file.size > MAX_LOGO_MB * 1024 * 1024) { showToast(`Logo must be under ${MAX_LOGO_MB}MB.`); return; }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const preview = URL.createObjectURL(file);
      setLogo({ url: '', preview });
      setUploading(true);
      fetch(`${API_BASE_URL}/uploads/apparel-logo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, dataUrl }),
      })
      .then(res => res.json())
      .then(data => {
        if (data?.success) {
          setLogo({ url: `${ORIGIN}${data.url}`, preview });
          showToast('Design uploaded ✓');
        } else {
          setLogo(null);
          showToast(data?.message || 'Upload failed.');
        }
      })
      .catch(() => { setLogo(null); showToast('Upload failed — check connection.'); })
      .finally(() => setUploading(false));
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    if (logo && logo.preview) URL.revokeObjectURL(logo.preview);
    setLogo(null);
  };

   const handleProceed = (mode = 'standard') => {
    if (!ready) return showToast(`Minimum order is ${minOrder} pieces.`);
    const team = mode === 'team'; // our team designs the logo later: no logo, no customization fees
    const unit = team ? basePrice : unitPrice;
    const total = team
      ? sizes.reduce((sum, s) => sum + (quantities[s] || 0) * (basePrice + sizeExtra(s)), 0)
      : estTotal;
    const config = {
      color: garmentColor.name, decoration, placement: placement === 'Custom' ? `Custom (${effPos.x}%, ${effPos.y}%)` : (selectedPlacements.map((p) => p.label).join(' + ') || curPreset?.label || placement),      placementFee: team ? 0 : placementFee, customBaseFee: team ? 0 : customBaseFee,
      logoPosition: !team && logo ? effPos : null, sizes: quantities, totalPieces,
      logoUrl: !team && logo ? logo.url : '',
      notes: team ? 'Design by our team — we will contact you to finalize your logo.' : notes.trim(),
      unitPrice: unit, estTotal: total,
    };
    if(handleCustomTeeAdd) handleCustomTeeAdd(product,config)
    else addCustomTeeToStoredCart(product,config)
    showToast('Added to cart ✓');
    setTimeout(() => (goToCart ? goToCart() : navigate('/sales/crm/cart')), 900);
  };

  const handleBack = () => {
    if (onBack) return onBack();
    navigate(-1);
  };

  const shirtBg = isLightHex(garmentColor.hex) ? '#e9e9ee' : garmentColor.hex;    const category = product?.category || 'shirts';
  const features = FEATURES_BY_CAT[category] || FEATURES_BY_CAT.shirts;

  const stepView = (d) => {
    const i = VIEWS.indexOf(activeView);
    setActiveView(VIEWS[(i + d + VIEWS.length) % VIEWS.length]);
  };
  const updateQty = (s, d) => setQuantities((q) => ({ ...q, [s]: Math.max(0, (q[s] || 0) + d) }));
  const setTotalQty = (val) => {
    const target = Math.max(0, parseInt(val || '0', 10) || 0);
    setQuantities((q) => {
      const total = sizes.reduce((a, s) => a + (q[s] || 0), 0);
      const mid = sizes[Math.max(0, Math.floor((sizes.length - 1) / 2))];
      return { ...q, [mid]: Math.max(0, (q[mid] || 0) + (target - total)) };
    });
  };

  const [chartOpen, setChartOpen] = useState(false);
  const sizeChartRows = useMemo(() => getSizes(product), [product]);
const chartImage = product?.size_chart_mode === 'image' ? (resolveImageUrl(product?.size_chart_image) || null) : null;
const hasChart = !!chartImage || sizeChartRows.some((s) => Object.values(s.chart || {}).some((v) => v != null && v !== ''));  const focusQty = (i) => document.getElementById(`tc-qty-${i}`)?.focus();
  const hasMore = (product?.listDescription || '').length > 140 || !!detailHtml;
  const rating = num(product?.rating);
  const reviewCount = num(product?.review_count ?? product?.reviews_count);

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading product details...</div>;

     return (
    <div className="tc-page">
      <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap');
        .tc-glyph { width: 100%; height: 100%; }
        .tc-page { min-height: 100vh; background: #fff; color: #0f172a; font-family: 'Inter', sans-serif; letter-spacing: -0.01em; }
        .tc-wrap { max-width: 1200px; margin: 0 auto; padding: 16px 16px 40px; }
        .tc-back-btn { display: inline-flex; align-items: center; gap: 6px; background: #fff; border: 1px solid #e2e8f0; border-radius: 999px; padding: 8px 14px; font-size: 13px; font-weight: 600; color: #475569; cursor: pointer; font-family: inherit; }
        .tc-back-btn:hover { border-color: #1a5cf5; color: #1a5cf5; }
        .tc-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 24px; margin-top: 14px; align-items: start; }
        .tc-left { min-width: 0; }

        .tc-gallery { position: relative; display: flex; align-items: center; justify-content: center; padding: 20px; background: #f4f4f5; border-radius: 20px; }
        .tc-canvas { position: relative; width: 100%; max-width: 560px; aspect-ratio: 1 / 1; display: flex; align-items: center; justify-content: center; cursor: crosshair; }
        .tc-nav { position: absolute; top: 50%; transform: translateY(-50%); z-index: 5; width: 52px; height: 52px; border-radius: 50%; background: #fff; border: none; box-shadow: 0 2px 12px rgba(0,0,0,.15); display: flex; align-items: center; justify-content: center; cursor: pointer; color: #0f172a; }
        .tc-nav.prev { left: 12px; } .tc-nav.next { right: 12px; }
        .tc-video { position: absolute; left: 14px; bottom: 14px; z-index: 5; display: flex; align-items: center; gap: 8px; padding: 8px 18px 8px 10px; border-radius: 999px; background: rgba(75,85,99,.92); color: #fff; text-decoration: none; font-size: 15px; font-weight: 600; }
        .tc-dots { position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; z-index: 5; }
        .tc-dot { width: 10px; height: 10px; padding: 0; border: none; border-radius: 50%; background: #c4c4c8; cursor: pointer; }
        .tc-dot.on { background: #0f172a; }

        .tc-eyebrow { margin-bottom: 8px; font-size: 13px; letter-spacing: .18em; text-transform: uppercase; color: #64748b; }
        .tc-title { margin: 0 0 10px; font-size: clamp(30px, 5vw, 46px); line-height: 1.08; font-weight: 800; letter-spacing: -0.02em; }
        .tc-rating { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; font-size: 17px; color: #1a5cf5; }
        .tc-stars { display: flex; gap: 2px; }
        .tc-price { margin: 4px 0; font-size: clamp(32px, 5vw, 44px); font-weight: 800; letter-spacing: -0.02em; }
        .tc-fee { margin: 0 0 8px; font-size: 16px; }
        .tc-desc { margin-top: 12px; font-size: 16px; line-height: 1.65; color: #475569; }
        .tc-desc p { margin: 0 0 8px; }
        .tc-desc.clamp { max-height: 108px; overflow: hidden; -webkit-mask-image: linear-gradient(#000 65%, transparent); mask-image: linear-gradient(#000 65%, transparent); }
        .tc-more { display: inline-flex; align-items: center; gap: 6px; margin-top: 6px; padding: 0; background: none; border: none; color: #1a5cf5; font: inherit; font-size: 17px; cursor: pointer; }
        .tc-rich { font-size: 15px; color: #475569; line-height: 1.6; }
        .tc-rich ul { list-style: disc; margin: 0; padding-left: 22px; }
        .tc-rich ol { list-style: decimal; margin: 0; padding-left: 22px; }
        .tc-rich li { margin: 6px 0; padding-left: 2px; }
        .tc-rich li::marker { color: #1a5cf5; }
        .tc-rich p { margin: 0 0 8px; }
        .tc-hr { border: none; border-top: 1px solid #e5e7eb; margin: 18px 0 0; }
        .tc-h { margin: 22px 0 10px; font-size: 18px; font-weight: 700; }
        .tc-h small { margin-left: 6px; font-size: 17px; font-weight: 400; color: #64748b; }

        .tc-swatches { display: flex; flex-wrap: wrap; gap: 14px 18px; }
        .tc-sw { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 0; background: none; border: none; cursor: pointer; font-family: inherit; font-size: 14px; color: #334155; }
        .tc-sw-dot { width: 58px; height: 58px; border-radius: 50%; border: 1px solid #cbd5e1; transition: box-shadow .15s; }
        .tc-sw.on .tc-sw-dot { box-shadow: 0 0 0 3px #fff, 0 0 0 5px #0f172a; }
        .tc-sw.on .tc-sw-name { font-weight: 700; color: #0f172a; }

        .tc-pills { display: flex; flex-wrap: wrap; gap: 10px; }
        .tc-pill { min-height: 52px; padding: 0 22px; border: 1px solid #e2e8f0; border-radius: 999px; background: #fff; font: inherit; font-size: 17px; color: #0f172a; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
        .tc-pill.round { min-width: 60px; padding: 0 16px; }
        .tc-pill.on { border: 2px solid #0f172a; font-weight: 700; background: #f8fafc; }
        .tc-chart-row { display: flex; justify-content: flex-end; margin-top: 8px; }
        .tc-chart-link { display: inline-flex; align-items: center; gap: 8px; padding: 0; background: none; border: none; color: #1a5cf5; text-decoration: underline; font: inherit; font-size: 17px; cursor: pointer; }

        .tc-qbox { margin-top: 10px; padding: 12px 14px 14px; background: #f1f1f2; border-radius: 12px; }
        .tc-qtitle { margin-bottom: 8px; font-size: 17px; font-weight: 700; }
        .tc-qtitle span { font-weight: 400; color: #64748b; }
        .tc-qgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(72px, 1fr)); gap: 10px 8px; }
        .tc-qcell { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 16px; font-weight: 600; }
        .tc-qcell input { width: 100%; max-width: 84px; height: 46px; box-sizing: border-box; padding: 0 6px 0 12px; border: 1px solid #cbd5e1; border-radius: 10px; background: #fff; font: inherit; font-size: 16px; }
        .tc-qcell input::-webkit-inner-spin-button, .tc-qcell input::-webkit-outer-spin-button { opacity: 1; }
        .tc-qcell em { font-style: normal; font-size: 11px; font-weight: 400; color: #94a3b8; }
        .tc-qsum { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 16px; margin-top: 12px; font-size: 14px; color: #475569; }
        .tc-qsum b { color: #0f172a; }
        .tc-qstep { display: flex; align-items: center; border: 1px solid #cbd5e1; border-radius: 10px; background: #fff; overflow: hidden; }
        .tc-qstep button { width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; border: none; background: #fff; color: #0f172a; cursor: pointer; }
        .tc-qstep input { width: 48px; height: 34px; text-align: center; border: none; outline: none; font-weight: 700; font-size: 14px; background: #fff; }

        .tc-locs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 16px; }
        .tc-loc { display: flex; align-items: center; gap: 12px; padding: 0; background: none; border: none; cursor: pointer; font: inherit; font-size: 17px; color: #0f172a; text-align: left; }
        .tc-loc em { margin-left: 4px; font-style: normal; font-size: 12px; color: #64748b; }
        .tc-box { flex-shrink: 0; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border: 2px solid #94a3b8; border-radius: 7px; background: #fff; }
        .tc-box.on { background: #0f172a; border-color: #0f172a; }

        .tc-actions { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; margin-top: 28px; }
        .tc-act { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; min-height: 96px; padding: 14px 18px; border: 2px solid #1a5cf5; border-radius: 14px; background: #fff; color: #1a5cf5; font-family: inherit; text-align: center; cursor: pointer; transition: background .15s; }
        .tc-act:hover:not(:disabled) { background: #eff4ff; }
        .tc-act:disabled { opacity: .5; cursor: not-allowed; }
        .tc-act-t { display: flex; align-items: center; gap: 12px; font-size: 22px; font-weight: 700; }
        .tc-act-s { max-width: 300px; font-size: 14px; line-height: 1.35; color: #64748b; }
        .tc-act.up { flex-direction: row; gap: 16px; background: #1a5cf5; color: #fff; }
        .tc-act.up:hover:not(:disabled) { background: #1448cc; }
        .tc-act.up b { display: block; font-size: 22px; font-weight: 700; text-align: left; }
        .tc-act.up small { display: block; margin-top: 2px; font-size: 14px; text-align: left; opacity: .85; }
        .tc-note { margin-top: 10px; text-align: center; font-size: 13px; color: #64748b; }
        .tc-talk { width: 100%; min-height: 60px; margin-top: 14px; display: flex; align-items: center; justify-content: center; gap: 14px; border: 1.5px solid #1a5cf5; border-radius: 14px; background: #fff; color: #0f172a; font: inherit; font-size: 20px; font-weight: 700; cursor: pointer; transition: background .15s; }
        .tc-talk:hover { background: #eff4ff; }
        .tc-talk .ic { color: #1a5cf5; }

        .tc-perks { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px 12px; margin-top: 24px; padding: 20px 0 0; border-top: 1px solid #e5e7eb; }
        .tc-perk { display: flex; align-items: center; gap: 12px; padding: 0 8px; }
        .tc-perk .t { font-size: 15px; font-weight: 700; }
        .tc-perk .d { font-size: 13px; color: #64748b; }

        .tc-contact-overlay { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(15,23,42,.65); backdrop-filter: blur(4px); }
        .tc-contact { width: 100%; max-width: 420px; max-height: 100%; overflow-y: auto; padding: 22px; background: #fff; border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0,0,0,.2); animation: tc-pop .2s ease; }
        .tc-contact-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
        .tc-contact-head h3 { margin: 0; font-size: 20px; font-weight: 800; }
        .tc-contact-head p { margin: 4px 0 0; font-size: 13px; color: #64748b; }
        .tc-x { flex-shrink: 0; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; border: none; border-radius: 50%; background: #f1f5f9; color: #475569; cursor: pointer; }
        .tc-contact-row { display: flex; align-items: center; gap: 14px; padding: 12px; margin-bottom: 8px; border: 1px solid #e2e8f0; border-radius: 12px; text-decoration: none; color: #0f172a; transition: border-color .15s, background .15s; }
        .tc-contact-row:hover { border-color: #1a5cf5; background: #eff4ff; }
        .tc-contact-ic { flex-shrink: 0; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; border-radius: 50%; color: #fff; }
        .tc-contact-row .t { font-size: 15px; font-weight: 700; }
        .tc-contact-row .s { font-size: 12px; color: #64748b; word-break: break-all; }
        @keyframes tc-pop { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }
        @keyframes tc-up { from { transform: translateY(100%); } to { transform: none; } }

        @media (min-width: 720px) {
          .tc-actions { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        @media (max-width: 719px) {
          .tc-act.up { order: -1; }
        }
        @media (min-width: 900px) {
          .tc-wrap { padding: 24px 32px 56px; }
          .tc-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 48px; }
          .tc-left { position: sticky; top: 16px; }
          .tc-perks { grid-template-columns: repeat(4, 1fr); gap: 0; }
          .tc-perk + .tc-perk { border-left: 1px solid #e5e7eb; }
        }
        @media (max-width: 520px) {
          .tc-contact-overlay { align-items: flex-end; padding: 0; }
          .tc-contact { max-width: none; border-radius: 16px 16px 0 0; padding-bottom: calc(22px + env(safe-area-inset-bottom, 0px)); animation: tc-up .25s ease; }
        }
        @media (max-width: 480px) {
          .tc-act-t, .tc-act.up b { font-size: 19px; }
          .tc-nav { width: 44px; height: 44px; }
          .tc-sw-dot { width: 50px; height: 50px; }
          .tc-pill { min-height: 46px; padding: 0 16px; font-size: 16px; }
          .tc-gallery { padding: 12px; }
        }

                /* ── refined typography & compact buttons ── */
        .tc-page { font-family: 'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 1.5; letter-spacing: 0; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
        .tc-page button, .tc-page input { font-family: inherit; }
        .tc-title, .tc-price, .tc-h, .tc-qtitle, .tc-act-t, .tc-act.up b, .tc-talk, .tc-perk .t, .tc-contact-head h3 { font-family: 'Plus Jakarta Sans', 'Inter', sans-serif; }

        .tc-back-btn { font-size: 13px; font-weight: 500; }
        .tc-gallery { background: #f6f7f9; border-radius: 16px; }
        .tc-nav { width: 42px; height: 42px; }
        .tc-video { font-size: 13px; padding: 6px 14px 6px 8px; }

        .tc-eyebrow { margin-bottom: 10px; font-size: 12px; font-weight: 600; letter-spacing: .14em; color: #1a5cf5; }
        .tc-title { margin: 0 0 12px; font-size: clamp(26px, 3.6vw, 36px); font-weight: 700; line-height: 1.15; letter-spacing: -0.02em; }
        .tc-rating { gap: 8px; margin-bottom: 12px; font-size: 14px; }
        .tc-price { margin: 6px 0 4px; font-size: clamp(26px, 3.2vw, 32px); font-weight: 700; letter-spacing: -0.02em; }
        .tc-fee { font-size: 14px; color: #475569; }
        .tc-desc { font-size: 15px; line-height: 1.7; color: #475569; }
        .tc-desc.clamp { max-height: 104px; }
        .tc-more { font-size: 14.5px; font-weight: 600; }
        .tc-hr { margin-top: 20px; }
        .tc-h { margin: 24px 0 12px; font-size: 13px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: #0f172a; }

        .tc-swatches { gap: 12px 16px; }
        .tc-sw { gap: 6px; font-size: 12.5px; font-weight: 500; color: #475569; }
        .tc-sw-dot { width: 44px; height: 44px; }
        .tc-sw.on .tc-sw-dot { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #0f172a; }

        .tc-pills { gap: 8px; }
        .tc-pill { min-height: 40px; padding: 0 18px; border: 1px solid #d5dbe5; box-shadow: none; font-size: 14px; font-weight: 500; color: #1e293b; transition: border-color .15s, background .15s; }
        .tc-pill:hover { border-color: #94a3b8; }
        .tc-pill.round { min-width: 48px; padding: 0 14px; }
        .tc-pill.on { border: 1.5px solid #0f172a; background: #f8fafc; color: #0f172a; font-weight: 600; }
        .tc-chart-link { font-size: 13.5px; font-weight: 500; }

        .tc-qbox { padding: 14px 16px 16px; background: #f8fafc; border: 1px solid #e5e9f0; border-radius: 12px; }
        .tc-qtitle { margin-bottom: 10px; font-size: 14px; font-weight: 600; }
        .tc-qtitle span { font-size: 13px; font-weight: 400; }
        .tc-qcell { font-size: 13px; font-weight: 600; color: #334155; }
        .tc-qcell input { height: 40px; font-size: 15px; border-color: #d5dbe5; border-radius: 8px; }
        .tc-qcell input:focus { outline: none; border-color: #1a5cf5; box-shadow: 0 0 0 3px rgba(26,92,245,.15); }
        .tc-qsum { font-size: 13px; }
        .tc-qstep button { width: 30px; height: 30px; }
        .tc-qstep input { width: 44px; height: 30px; font-size: 13px; }

        .tc-loc { gap: 10px; font-size: 14.5px; font-weight: 500; }
        .tc-loc em { font-size: 11.5px; }
        .tc-box { width: 22px; height: 22px; border-width: 1.5px; border-radius: 6px; }

        .tc-actions { gap: 12px; margin-top: 28px; }
        .tc-act { min-height: 68px; gap: 3px; padding: 10px 16px; border-width: 1.5px; border-radius: 10px; }
        .tc-act-t { gap: 10px; font-size: 16px; font-weight: 600; }
        .tc-act-s { max-width: 280px; font-size: 12.5px; line-height: 1.35; }
        .tc-act.up { gap: 12px; }
        .tc-act.up b { font-size: 16px; font-weight: 600; }
        .tc-act.up small { font-size: 12.5px; }
        .tc-note { margin-top: 10px; font-size: 12.5px; }
        .tc-talk { min-height: 48px; margin-top: 12px; gap: 10px; border-radius: 10px; font-size: 15px; font-weight: 600; }

        .tc-perks { margin-top: 28px; }
        .tc-perk .t { font-size: 14px; font-weight: 600; }
        .tc-perk .d { font-size: 12.5px; }

        .tc-contact-head h3 { font-size: 18px; font-weight: 700; }
        .tc-contact-row .t { font-size: 14.5px; font-weight: 600; }

        @media (max-width: 480px) {
          .tc-act-t, .tc-act.up b { font-size: 15.5px; }
          .tc-nav { width: 38px; height: 38px; }
          .tc-sw-dot { width: 40px; height: 40px; }
          .tc-pill { min-height: 38px; padding: 0 14px; font-size: 13.5px; }
        }

                .tc-gallery { touch-action: pan-y; user-select: none; }
        .tc-main { animation: tc-fade .25s ease; }
        @keyframes tc-fade { from { opacity: 0; } to { opacity: 1; } }

                .tc-h small { margin-left: 6px; font-size: 13px; font-weight: 400; letter-spacing: 0; text-transform: none; color: #64748b; }
        .tc-locnote { margin-top: 10px; font-size: 13px; color: #64748b; }
        .tc-locnote b { color: #0f172a; }

      `}</style>

      <main className="tc-wrap">
        <button className="tc-back-btn" onClick={handleBack}><ArrowLeftIcon size={15} /> Back to Apparel</button>

        <div className="tc-grid">
          {/* ── LEFT: GALLERY ── */}
          <div className="tc-left">
            <div className="tc-gallery" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
                
              <div ref={shirtPreviewRef} onClick={placeLogoOnShirt} className="tc-canvas" style={{ cursor: logo && current?.view ? 'crosshair' : 'default' }}>
                {current ? (
                  <img key={current.src} className="tc-main" src={current.src} alt={`${productName} ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', pointerEvents: 'none' }} />
                ) : (
                  <ShirtGlyph color={shirtBg} view={activeView} />
                )}
               {logo && overlays.filter((o) => o.at === idx).map((o) => (
                  <div key={o.key} style={{ position: 'absolute', left: o.pos.x + '%', top: o.pos.y + '%', transform: 'translate(-50%, -50%)', width: `${o.pos.w || 20}%`, aspectRatio: '1/1', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, overflow: 'hidden', background: '#fff', boxShadow: '0 0 0 2px rgba(255,255,255,0.75), 0 2px 10px rgba(0,0,0,0.18)' }}>
                    <img src={logo.preview || logo.url} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', pointerEvents: 'none' }} />
                  </div>
                ))}
              </div>

              {gallery.length > 1 && (
                <>
                  <button className="tc-nav prev" onClick={() => stepImage(-1)} aria-label="Previous image"><ChevronLeftIcon size={20} /></button>
                  <button className="tc-nav next" onClick={() => stepImage(1)} aria-label="Next image"><ChevronRightIcon size={20} /></button>
                </>
              )}

              {product?.video_url && (
                <a className="tc-video" href={product.video_url} target="_blank" rel="noopener noreferrer">
                  <PlayIcon size={22} fill="#fff" color="#fff" /> Video
                </a>
              )}

                             <div className="tc-dots">
                {gallery.length > 1 && gallery.map((g, i) => (
                  <button key={g.src} className={`tc-dot ${i === idx ? 'on' : ''}`} onClick={() => goTo(i)} aria-label={`Image ${i + 1}`} />
                ))}
               </div>
            </div>
          </div>

          {/* ── RIGHT: OPTIONS ── */}
          <div className="tc-right">
            <div className="tc-eyebrow">Premium | Custom | Professional</div>
            <h1 className="tc-title">{productName}</h1>

            {rating > 0 && (
              <div className="tc-rating">
                <span className="tc-stars">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <StarIcon key={n} size={20} color="#f59e0b" fill={n <= Math.round(rating) ? '#f59e0b' : 'none'} />
                  ))}
                </span>
                <span>{rating.toFixed(1)}{reviewCount > 0 ? ` (${reviewCount.toLocaleString()} reviews)` : ''}</span>
              </div>
            )}

            <div className="tc-price">${unitPrice.toFixed(2)}</div>
            {isCustomizing && (customBaseFee + placementFee) > 0 && (
              <div className="tc-fee">Includes ${(customBaseFee + placementFee).toFixed(2)} customization.</div>
            )}

            {(product?.listDescription || detailHtml) && (
              <div>
                <div className={`tc-desc ${descOpen ? '' : 'clamp'}`}>
                  {product?.listDescription && <p>{product.listDescription}</p>}
                  {detailHtml && <div className="tc-rich" dangerouslySetInnerHTML={{ __html: detailHtml }} />}
                </div>
                {hasMore && (
                  <button type="button" className="tc-more" onClick={() => setDescOpen((o) => !o)}>
                    {descOpen ? 'Show less' : 'Read more'} {descOpen ? <ChevronUpIcon size={18} /> : <ChevronDownIcon size={18} />}
                  </button>
                )}
              </div>
            )}

            <hr className="tc-hr" />

            {/* Color */}
            <h3 className="tc-h">Color</h3>
            <div className="tc-swatches">
              {colors.map((c, i) => (
                <button key={`${c.hex}-${i}`} type="button" title={String(c.hex).toUpperCase()} className={`tc-sw ${i === activeColor ? 'on' : ''}`} onClick={() => setActiveColor(i)}>
                  <span className="tc-sw-dot" style={{ background: c.hex }} />
                  <span className="tc-sw-name">{c.name}</span>
                </button>
              ))}
            </div>

            {/* Size + quantity */}
            <h3 className="tc-h">Size</h3>
            <div className="tc-pills">
              {sizes.map((s, i) => (
                <button key={s} type="button" className={`tc-pill round ${(quantities[s] || 0) > 0 ? 'on' : ''}`} onClick={() => focusQty(i)}>{s}</button>
              ))}
            </div>
            {hasChart && (
              <div className="tc-chart-row">
                <button type="button" className="tc-chart-link" onClick={() => setChartOpen(true)}><RulerIcon size={20} /> Size Chart</button>
              </div>
            )}

            <div className="tc-qbox">
              <div className="tc-qtitle">Quantity <span>(minimum {minOrder} pieces)</span></div>
              <div className="tc-qgrid">
                {sizes.map((s, i) => (
                  <label key={s} className="tc-qcell" htmlFor={`tc-qty-${i}`}>
                    <span>{s}</span>
                    <input
                      id={`tc-qty-${i}`} type="number" min="0" value={quantities[s] || 0}
                      onChange={(e) => { const v = Math.max(0, parseInt(e.target.value || '0', 10) || 0); setQuantities((q) => ({ ...q, [s]: v })); }}
                    />
                    {sizeExtra(s) > 0 && <em>+ ${sizeExtra(s).toFixed(2)}</em>}
                  </label>
                ))}
              </div>
              <div className="tc-qsum">
                <span>Items <b>{totalPieces}</b> · Unit <b>${unitPrice.toFixed(2)}</b> · Total <b>${estTotal.toFixed(2)}</b></span>
                <div className="tc-qstep">
                  <button type="button" onClick={() => setTotalQty(totalPieces - 1)} aria-label="decrease total"><MinusIcon size={14} /></button>
                  <input value={totalPieces} onChange={(e) => setTotalQty(e.target.value)} aria-label="total pieces" />
                  <button type="button" onClick={() => setTotalQty(totalPieces + 1)} aria-label="increase total"><PlusIcon size={14} /></button>
                </div>
              </div>
            </div>

            {/* Customization type */}
            <h3 className="tc-h">Customization Type</h3>
            <div className="tc-pills">
              {decorations.map((d) => (
                <button key={d} type="button" className={`tc-pill ${decoration === d ? 'on' : ''}`} onClick={() => setDecoration(d)}>{d}</button>
              ))}
            </div>

            {/* Print location */}
                        <h3 className="tc-h">Print Locations <small>(select all that apply)</small></h3>
            <div className="tc-locs" role="group">
              {availablePlacements.map((p) => {
                const on = selectedIds.includes(p.id);
                const fee = num(p.extra_fee);
                return (
                  <button key={p.id} type="button" className="tc-loc" role="checkbox" aria-checked={on} onClick={() => togglePlacement(p)}>
                    <span className={`tc-box ${on ? 'on' : ''}`}>{on && <CheckIcon size={14} color="#fff" strokeWidth={3} />}</span>
                    <span>{p.label}<em>{selectedIds[0] === p.id || fee <= 0 ? 'Included' : `+$${fee.toFixed(2)}`}</em></span>
                  </button>
                );
              })}
            </div>
            <div className="tc-locnote">
              First placement included{addlFee > 0 && <>, each additional placement <b>+${addlFee.toFixed(2)}</b></>}
              {extraPlacementFee > 0 && <> · your {selectedPlacements.length - 1} extra: <b>+${extraPlacementFee.toFixed(2)}</b> per piece</>}
            </div>

            {logo && <div style={{ marginTop: 18 }}><DesignUploadArea logo={logo} onOpenEditor={handleOpenEditor} onRemove={removeLogo} /></div>}
          </div>
        </div>

        {/* ── ACTIONS ── */}
        <section className="tc-actions">
          <button type="button" className="tc-act" disabled={!ready} onClick={() => handleProceed('standard')}>
            <span className="tc-act-t"><CartIcon size={26} /> Add to Cart</span>
            <span className="tc-act-s">{logo ? '(Includes your uploaded design)' : '(Buy without customization)'}</span>
          </button>

          <button type="button" className="tc-act up" onClick={handleOpenEditor}>
            <CloudUploadIcon size={40} />
            <span><b>Upload Your Design</b><small>PNG, JPG, WebP (Max 5MB)</small></span>
          </button>

          <button type="button" className="tc-act" disabled={!ready} onClick={() => handleProceed('team')}>
            <span className="tc-act-t"><PencilIcon size={26} /> Add to Cart</span>
            <span className="tc-act-s">(Let our team design logos for you after talking to you.)</span>
          </button>
        </section>
        <div className="tc-note">
          {ready ? 'Review proof before print' : `${minOrder - totalPieces} more pcs needed to reach the ${minOrder}-piece minimum`}
        </div>

        <button type="button" className="tc-talk" onClick={() => setContactOpen(true)}>
          <HeadphonesIcon size={26} className="ic" color="#1a5cf5" /> Talk to Our Team <ChevronRightIcon size={22} color="#1a5cf5" />
        </button>

        <div className="tc-perks">
          {BOTTOM_STRIP.map((f) => (
            <div key={f.title} className="tc-perk">
              <f.icon size={32} color="#0f172a" strokeWidth={1.6} />
              <div><div className="t">{f.title}</div><div className="d">{f.desc}</div></div>
            </div>
          ))}
        </div>
      </main>

      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} productName={productName} />
    <SizeChartDrawer open={chartOpen} onClose={() => setChartOpen(false)} sizes={sizeChartRows} chartImage={chartImage} />
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#0f172a', color: '#fff', padding: '12px 20px', borderRadius: 12, fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
          {toast}
        </div>
      )}
    </div>
  );

}