export const CURRENCY = '$';
// Volume tiers. Either put them on the product (product.price_tiers) or fill this in:
// [{ min_qty: 10, discount_percent: 3 }, { min_qty: 30, price: 535 }]
export const DEFAULT_TIERS = [];
export const DEFAULT_SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL'];
// The admin "Ratio / Qty" value: set to true if it is the stock left
export const USE_RATIO_AS_STOCK = false;

export const MEASURES = [
  { key: 'body_length', label: 'Body Length' },
  { key: 'chest_width', label: 'Chest Width' },
  { key: 'sleeve_length', label: 'Sleeve Length' },
  { key: 'shoulder_width', label: 'Shoulder Width' },
];

// admin stores inches, so show "in/cm" like 28/71.1
export const fmt = (inches) => {
  const n = Number(inches);
  return inches == null || inches === '' || !Number.isFinite(n) ? '–' : `${n}/${(n * 2.54).toFixed(1)}`;
};

export const fmtMoney = (n) =>
  `${CURRENCY}${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const parseTiers = (product) => {
  let raw = product?.price_tiers;
  try { if (typeof raw === 'string') raw = JSON.parse(raw); } catch { raw = null; }
  const list = Array.isArray(raw) && raw.length ? raw : DEFAULT_TIERS;
  return list
    .map((t) => ({
      min: Number(t.min_qty ?? t.min),
      price: t.price != null ? Number(t.price) : null,
      discount: Number(t.discount_percent ?? t.discount ?? 0),
    }))
    .filter((t) => Number.isFinite(t.min))
    .sort((a, b) => a.min - b.min);
};

// price each + discount % for a given quantity
export const priceFor = (base, tiers, qty) => {
  let tier = null;
  for (const t of tiers) if (qty >= t.min) tier = t;
  let each = tier ? (tier.price != null ? tier.price : base * (1 - tier.discount / 100)) : base;
  each = Math.round(each * 100) / 100;
  return { each, discountPct: base > 0 ? Math.round((1 - each / base) * 100) : 0 };
};

// product.sizes = [{ size, ratio, body_length, chest_width, sleeve_length, shoulder_width }]
export const getSizes = (product) => {
  let raw = product?.sizes;
  try { if (typeof raw === 'string') raw = JSON.parse(raw); } catch { raw = null; }
  if (!Array.isArray(raw) || !raw.length) return DEFAULT_SIZES.map((label) => ({ label, stock: null, chart: {} }));
  return raw
    .filter((s) => s && s.size)
    .map((s) => ({
      label: String(s.size),
      stock: USE_RATIO_AS_STOCK && s.ratio != null ? Number(s.ratio) : null,
      chart: { body_length: s.body_length, chest_width: s.chest_width, sleeve_length: s.sleeve_length, shoulder_width: s.shoulder_width },
    }));
};