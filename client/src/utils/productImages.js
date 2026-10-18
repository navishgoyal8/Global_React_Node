import { API_BASE_URL } from '../config';

// Product photos live under `sales/uploads/products/` on the PHP server. The
// filename stored in products.image is only a bare name (JSON array), so it has
// to be prefixed with an absolute base URL. Depending on where the file was
// uploaded (local XAMPP vs. the live server) it can exist on either host, so we
// keep both bases and let <SmartImage> walk through them on load failure.
const LOCAL_BASE = 'http://localhost/globallimos/sales/uploads/products/';
const REMOTE_BASE = 'https://developer.globallimos.com/sales/uploads/products/';

const isLocalApi = (() => {
  try {
    const host = new URL(API_BASE_URL).hostname;
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
})();

export const IMAGE_BASES = isLocalApi ? [LOCAL_BASE, REMOTE_BASE] : [REMOTE_BASE, LOCAL_BASE];

// products.image is a JSON array of filenames (`["a.png"]`), but it can also be
// a single filename, an already absolute URL, or an actual array.
export const parseImageEntries = (imageField) => {
  if (!imageField) return [];
  const raw = typeof imageField === 'string' ? imageField : JSON.stringify(imageField);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = raw;
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list
    .map(entry => String(entry ?? '').replace(/['"[\]]/g, '').trim())
    .filter(Boolean);
};

const UPLOADS_MARKER = '/uploads/products/';

// Ordered list of URLs to try for one stored image value (bare filename or URL).
export const imageCandidates = (entry) => {
  const value = String(entry ?? '').trim();
  if (!value) return [];

  const out = [];
  const push = (url) => { if (url && !out.includes(url)) out.push(url); };

  if (/^https?:\/\//i.test(value)) {
    push(value);
    const at = value.indexOf(UPLOADS_MARKER);
    if (at !== -1) {
      const fileName = value.slice(at + UPLOADS_MARKER.length);
      if (fileName) IMAGE_BASES.forEach(base => push(base + fileName));
    }
    return out;
  }

  IMAGE_BASES.forEach(base => push(base + value));
  return out;
};

// Single best-effort URL (used where only one src can be kept, e.g. cart items).
export const primaryImageUrl = (imageField) => {
  const entries = parseImageEntries(imageField);
  if (!entries.length) return null;
  return imageCandidates(entries[0])[0] || null;
};
