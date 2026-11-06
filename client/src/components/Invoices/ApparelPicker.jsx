import React, { useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE_URL } from '../../config';

// Apparel lines live in the cart as type 'W'. One line = one product in one
// colour. quantity is always the total piece count (sum of `sizes`), so the
// rest of the invoice maths (price * quantity) works unchanged.

const DECORATIONS = ['Embroidery', 'DTF', 'Screen Print'];
const MODIFY_BY = ['Company Name', 'Employee Name', 'Logo Only', 'Custom Text'];
const OPTIONS = ['Logo', 'Company Name', 'Employee Name', 'Other'];
const PLACEMENTS = ['Left Chest', 'Right Chest', 'Front', 'Back', 'Sleeve'];
const DEFAULT_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

const COLOR_HEX = {
  black: '#111827', white: '#f3f4f6', navy: '#1e3a8a', red: '#b91c1c', blue: '#2563eb',
  grey: '#9ca3af', gray: '#9ca3af', green: '#15803d', brown: '#78350f', beige: '#d6c3a3',
  orange: '#f97316', yellow: '#eab308', pink: '#ec4899', purple: '#7c3aed', maroon: '#7f1d1d',
};
const hexFor = (c) => (c && (c.hex || COLOR_HEX[String(c.name || '').toLowerCase()])) || '#9ca3af';

const piecesOf = (sizes) =>
  Object.values(sizes || {}).reduce((s, q) => s + (parseInt(q, 10) || 0), 0);

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;

const makeLine = (product, colorName) => {
  const sizeNames = product.sizes && product.sizes.length ? product.sizes : DEFAULT_SIZES;
  const sizes = {};
  sizeNames.forEach((s) => { sizes[s] = 0; });
  return {
    id: `apparel-${product.id}-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`,
    itemId: product.id,
    type: 'W',
    name: product.display_name || product.name,
    img: product.image || null,
    price: parseFloat(product.price) || 0,
    quantity: 0,
    covers: '-',
    color: colorName || (product.colors[0] && product.colors[0].name) || '',
    sizes,
    decoration: 'Embroidery',
    modifyBy: 'Company Name',
    options: ['Logo'],
    placements: [],
    logoUrl: '',
    logoName: '',
    notes: '',
    supplierId: '',
    supplierName: '',
  };
};

const ApparelPicker = ({ cartItems, onChange, locked = false, lockReason = '' }) => {
  const [open, setOpen] = useState(true);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [uploadingId, setUploadingId] = useState(null);
  const [uploadErrors, setUploadErrors] = useState({});

  // Async work (logo upload) must patch the LATEST cart, not the one captured
  // when the upload started.
  const cartRef = useRef(cartItems);
  cartRef.current = cartItems;

  const lines = cartItems.filter((i) => i.type === 'W');

  const loadProducts = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`${API_BASE_URL}/invoices/apparel-products`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Could not load apparel products.');
      setProducts((data.products || []).map((p) => ({
        ...p,
        colors: (p.colors || []).map((c) => (typeof c === 'string' ? { name: c } : c)),
        sizes: p.sizes || [],
      })));
      setSuppliers(data.suppliers || []);
    } catch (e) {
      setLoadError(e.message || 'Could not load apparel products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProducts(); }, []);

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? products.filter((p) => String(p.display_name || p.name).toLowerCase().includes(q)) : products;
  }, [products, search]);

  const patchLine = (id, patch) => {
    onChange(cartRef.current.map((i) => {
      if (i.id !== id) return i;
      const next = { ...i, ...patch };
      next.quantity = piecesOf(next.sizes);
      return next;
    }));
  };

  const removeLine = (id) => onChange(cartRef.current.filter((i) => i.id !== id));

  const toggleProduct = (p) => {
    if (locked) return;
    const has = lines.some((l) => String(l.itemId) === String(p.id));
    if (has) {
      onChange(cartItems.filter((i) => !(i.type === 'W' && String(i.itemId) === String(p.id))));
      return;
    }
    const line = makeLine(p);
    onChange([...cartItems, line]);
    setExpanded(line.id);
  };

  const allSelected = products.length > 0 && products.every((p) => lines.some((l) => String(l.itemId) === String(p.id)));
  const toggleAll = () => {
    if (locked) return;
    if (allSelected) { onChange(cartItems.filter((i) => i.type !== 'W')); return; }
    const missing = products.filter((p) => !lines.some((l) => String(l.itemId) === String(p.id)));
    onChange([...cartItems, ...missing.map((p) => makeLine(p))]);
  };

  const addAnotherColour = (line) => {
    const product = products.find((p) => String(p.id) === String(line.itemId));
    if (!product) return;
    const used = new Set(lines.filter((l) => String(l.itemId) === String(line.itemId)).map((l) => l.color));
    const next = product.colors.find((c) => !used.has(c.name));
    if (!next) return;
    const clone = {
      ...makeLine(product, next.name),
      decoration: line.decoration, modifyBy: line.modifyBy, options: [...line.options],
      placements: [...line.placements], logoUrl: line.logoUrl, logoName: line.logoName,
      notes: line.notes, supplierId: line.supplierId, supplierName: line.supplierName,
    };
    const idx = cartItems.findIndex((i) => i.id === line.id);
    const nextCart = [...cartItems];
    nextCart.splice(idx + 1, 0, clone);
    onChange(nextCart);
    setExpanded(clone.id);
  };

  const toggleIn = (line, key, value) => {
    const cur = line[key] || [];
    patchLine(line.id, { [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] });
  };

  const uploadLogo = async (line, file) => {
    if (!file) return;
    const okType = /\.(png|jpe?g|pdf|ai)$/i.test(file.name);
    const setErr = (msg) => setUploadErrors((prev) => ({ ...prev, [line.id]: msg }));
    if (!okType) { setErr('Use a PNG, JPG, AI or PDF file.'); return; }
    if (file.size > MAX_LOGO_BYTES) { setErr('File is larger than 5 MB.'); return; }
    setErr('');
    setUploadingId(line.id);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const res = await fetch(`${API_BASE_URL}/invoices/apparel-logo`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.success || !data.url) throw new Error(data.message || 'Upload failed.');
      patchLine(line.id, { logoUrl: data.url, logoName: file.name });
    } catch (e) {
      setErr(e.message || 'Upload failed. Try again.');
    } finally {
      setUploadingId(null);
    }
  };

  const totalPieces = lines.reduce((s, l) => s + (l.quantity || 0), 0);
  const totalAmount = lines.reduce((s, l) => s + (l.price || 0) * (l.quantity || 0), 0);

  return (
    <div className="crm-panel">
      <style>{`
        .ap-body { padding: 16px; }
        .ap-top { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-bottom: 14px; }
        .ap-check { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #374151; cursor: pointer; user-select: none; }
        .ap-check input { accent-color: #2563eb; width: 16px; height: 16px; }
        .ap-search { flex: 1; min-width: 160px; max-width: 280px; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px; outline: none; }
        .ap-search:focus, .ap-in:focus { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,.12); }
        .ap-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 10px; margin-bottom: 14px; }
        .ap-card { position: relative; border: 1.5px solid #e5e7eb; border-radius: 10px; padding: 10px 6px 8px; text-align: center; cursor: pointer; background: #fff; transition: border-color .15s, background .15s; }
        .ap-card.on { border-color: #2563eb; background: #eff6ff; }
        .ap-card.off { opacity: .5; cursor: not-allowed; }
        .ap-card .tick { position: absolute; top: 6px; left: 6px; width: 17px; height: 17px; border: 1.5px solid #cbd5e1; border-radius: 4px; background: #fff; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; color: #fff; }
        .ap-card.on .tick { background: #2563eb; border-color: #2563eb; }
        .ap-card img { width: 64px; height: 64px; object-fit: contain; display: block; margin: 4px auto 6px; }
        .ap-card .ph { width: 64px; height: 64px; margin: 4px auto 6px; border-radius: 8px; background: #f3f4f6; }
        .ap-card .nm { font-size: 12.5px; font-weight: 600; color: #111827; }
        .ap-card .pr { font-size: 12.5px; font-weight: 700; color: #2563eb; }
        .ap-line { border: 1px solid #e5e7eb; border-radius: 10px; margin-bottom: 10px; background: #fff; overflow: hidden; }
        .ap-lh { display: flex; align-items: center; gap: 10px; padding: 10px 12px; cursor: pointer; flex-wrap: wrap; }
        .ap-lh img { width: 36px; height: 36px; object-fit: contain; }
        .ap-lh .t { font-size: 14px; font-weight: 700; color: #111827; }
        .ap-lh .p { font-size: 14px; font-weight: 700; color: #2563eb; }
        .ap-dot { width: 12px; height: 12px; border-radius: 50%; border: 1px solid #d1d5db; display: inline-block; }
        .ap-pill { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 12px; background: #f1f5f9; color: #475569; display: inline-flex; align-items: center; gap: 5px; }
        .ap-pill.warn { background: #fef3c7; color: #92400e; }
        .ap-x { margin-left: auto; background: #fef2f2; border: 1px solid #fecaca; color: #ef4444; border-radius: 6px; width: 26px; height: 26px; cursor: pointer; font-size: 13px; }
        .ap-lb { border-top: 1px solid #f1f5f9; padding: 14px 12px; display: grid; gap: 16px; }
        .ap-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr); gap: 18px; }
        @media (max-width: 640px) { .ap-row { grid-template-columns: 1fr; } }
        .ap-lbl { font-size: 12px; font-weight: 700; color: #374151; margin: 0 0 6px; display: block; }
        .ap-swatches { display: flex; gap: 10px; flex-wrap: wrap; }
        .ap-sw { width: 30px; height: 30px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1px #d1d5db; cursor: pointer; padding: 0; }
        .ap-sw.on { box-shadow: 0 0 0 2px #2563eb; }
        .ap-sizes { display: grid; grid-template-columns: repeat(auto-fit, minmax(60px, 1fr)); gap: 8px; }
        .ap-sizes label { font-size: 12px; color: #6b7280; text-align: center; display: block; margin-bottom: 3px; }
        .ap-in { width: 100%; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; outline: none; background: #fff; font-family: inherit; }
        .ap-sizes .ap-in { text-align: center; font-weight: 600; }
        .ap-seg { display: flex; gap: 8px; flex-wrap: wrap; }
        .ap-seg button, .ap-chip { padding: 7px 12px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; font-size: 13px; cursor: pointer; font-family: inherit; color: #374151; }
        .ap-seg button.on, .ap-chip.on { border-color: #2563eb; background: #eff6ff; color: #1d4ed8; font-weight: 600; }
        .ap-opts { display: flex; gap: 16px; flex-wrap: wrap; }
        .ap-drop { border: 1.5px dashed #cbd5e1; border-radius: 8px; padding: 14px; text-align: center; font-size: 12px; color: #6b7280; cursor: pointer; display: block; }
        .ap-drop:hover { border-color: #2563eb; background: #f8fafc; }
        .ap-logo { display: flex; align-items: center; gap: 10px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; margin-top: 8px; font-size: 12px; color: #374151; }
        .ap-logo img { width: 56px; height: 40px; object-fit: contain; background: #0f172a; border-radius: 4px; }
        .ap-err { font-size: 12px; color: #dc2626; margin-top: 6px; }
        .ap-foot { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 13px; color: #374151; border-top: 1px solid #f1f5f9; padding-top: 12px; margin-top: 4px; }
        .ap-link { background: none; border: none; padding: 0; color: #2563eb; font-weight: 600; font-size: 12px; cursor: pointer; text-decoration: underline; font-family: inherit; }
      `}</style>

      <div className="panel-header" onClick={() => setOpen((o) => !o)}>
        <h3>👕 Apparel</h3>
        <span className="collapse-icon" style={{ transform: open ? 'rotate(0deg)' : 'rotate(180deg)' }}>^</span>
      </div>

      {open && (
        <div className="ap-body">
          {locked && (
            <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 600, marginBottom: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 10px' }}>
              ⚠ {lockReason || "Apparel can't be combined with a package or vehicle on the same invoice."}
            </div>
          )}

          {loading && <div style={{ fontSize: 13, color: '#6b7280' }}>Loading apparel…</div>}
          {!loading && loadError && (
            <div style={{ fontSize: 13, color: '#dc2626' }}>
              {loadError} <button type="button" className="ap-link" onClick={loadProducts}>Try again</button>
            </div>
          )}
          {!loading && !loadError && products.length === 0 && (
            <div style={{ fontSize: 13, color: '#9ca3af' }}>No apparel products are set up yet.</div>
          )}

          {!loading && !loadError && products.length > 0 && (
            <>
              <div className="ap-top">
                <label className="ap-check">
                  <input type="checkbox" checked={allSelected} disabled={locked} onChange={toggleAll} /> Select all
                </label>
                <input className="ap-search" placeholder="Search apparel…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>

              <div className="ap-cards">
                {visibleProducts.map((p) => {
                  const on = lines.some((l) => String(l.itemId) === String(p.id));
                  return (
                    <div key={p.id} className={`ap-card ${on ? 'on' : ''} ${locked ? 'off' : ''}`} onClick={() => toggleProduct(p)}>
                      <span className="tick">{on ? '✓' : ''}</span>
                      {p.image ? <img src={p.image} alt="" /> : <div className="ph" />}
                      <div className="nm">{p.display_name || p.name}</div>
                      <div className="pr">{money(p.price)}</div>
                    </div>
                  );
                })}
                {visibleProducts.length === 0 && <div style={{ fontSize: 13, color: '#9ca3af' }}>No apparel matches “{search}”.</div>}
              </div>

              {lines.map((line) => {
                const product = products.find((p) => String(p.id) === String(line.itemId));
                const colors = product ? product.colors : [];
                const sizeNames = Object.keys(line.sizes || {});
                const isOpen = expanded === line.id;
                const colour = colors.find((c) => c.name === line.color);
                const canAddColour = product && colors.some((c) => !lines.some((l) => String(l.itemId) === String(line.itemId) && l.color === c.name));
                return (
                  <div className="ap-line" key={line.id}>
                    <div className="ap-lh" onClick={() => setExpanded(isOpen ? null : line.id)}>
                      {line.img ? <img src={line.img} alt="" /> : null}
                      <span className="t">{line.name}</span>
                      <span className="p">{money(line.price)}</span>
                      <span className="ap-pill"><span className="ap-dot" style={{ background: hexFor(colour || { name: line.color }) }} />{line.color || 'No colour'}</span>
                      {line.quantity > 0
                        ? <span className="ap-pill">{line.quantity} pcs</span>
                        : <span className="ap-pill warn">Add sizes</span>}
                      <button type="button" className="ap-x" title="Remove this line" onClick={(e) => { e.stopPropagation(); removeLine(line.id); }}>✕</button>
                    </div>

                    {isOpen && (
                      <div className="ap-lb">
                        <div className="ap-row">
                          <div>
                            <span className="ap-lbl">Colour</span>
                            <div className="ap-swatches">
                              {colors.map((c) => (
                                <button key={c.name} type="button" title={c.name}
                                  className={`ap-sw ${line.color === c.name ? 'on' : ''}`}
                                  style={{ background: hexFor(c) }}
                                  onClick={() => patchLine(line.id, { color: c.name })} />
                              ))}
                              {colors.length === 0 && <span style={{ fontSize: 12, color: '#9ca3af' }}>No colours set for this product.</span>}
                            </div>
                          </div>
                          <div>
                            <span className="ap-lbl">Sizes &amp; quantity</span>
                            <div className="ap-sizes">
                              {sizeNames.map((s) => (
                                <div key={s}>
                                  <label>{s}</label>
                                  <input className="ap-in" type="number" min="0" value={line.sizes[s] || 0}
                                    onFocus={(e) => e.target.select()}
                                    onChange={(e) => patchLine(line.id, { sizes: { ...line.sizes, [s]: Math.max(0, parseInt(e.target.value, 10) || 0) } })} />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="ap-row">
                          <div>
                            <span className="ap-lbl">Customization type</span>
                            <div className="ap-seg">
                              {DECORATIONS.map((d) => (
                                <button key={d} type="button" className={line.decoration === d ? 'on' : ''}
                                  onClick={() => patchLine(line.id, { decoration: d })}>{d}</button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <span className="ap-lbl">Modify by</span>
                            <select className="ap-in" value={line.modifyBy} onChange={(e) => patchLine(line.id, { modifyBy: e.target.value })}>
                              {MODIFY_BY.map((m) => <option key={m} value={m}>{m}</option>)}
                            </select>
                          </div>
                        </div>

                        <div>
                          <span className="ap-lbl">Customization options</span>
                          <div className="ap-opts">
                            {OPTIONS.map((o) => (
                              <label key={o} className="ap-check" style={{ fontWeight: 500 }}>
                                <input type="checkbox" checked={line.options.includes(o)} onChange={() => toggleIn(line, 'options', o)} /> {o}
                              </label>
                            ))}
                          </div>
                        </div>

                        <div>
                          <span className="ap-lbl">Placement (optional)</span>
                          <div className="ap-seg">
                            {PLACEMENTS.map((pl) => (
                              <button key={pl} type="button" className={`ap-chip ${line.placements.includes(pl) ? 'on' : ''}`}
                                onClick={() => toggleIn(line, 'placements', pl)}>{pl}</button>
                            ))}
                          </div>
                        </div>

                        <div className="ap-row">
                          <div>
                            <span className="ap-lbl">Logo upload</span>
                            <label className="ap-drop">
                              {uploadingId === line.id ? 'Uploading…' : <>Upload logo<br />PNG, JPG, AI, PDF · max 5 MB</>}
                              <input type="file" accept=".png,.jpg,.jpeg,.ai,.pdf" style={{ display: 'none' }}
                                disabled={uploadingId === line.id}
                                onChange={(e) => { uploadLogo(line, e.target.files[0]); e.target.value = ''; }} />
                            </label>
                            {line.logoUrl && (
                              <div className="ap-logo">
                                {/\.(png|jpe?g)(\?|$)/i.test(line.logoUrl) ? <img src={line.logoUrl} alt="" /> : null}
                                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line.logoName || 'Logo uploaded'}</span>
                                <button type="button" className="ap-link" onClick={() => patchLine(line.id, { logoUrl: '', logoName: '' })}>Remove</button>
                              </div>
                            )}
                            {uploadErrors[line.id] && <div className="ap-err">{uploadErrors[line.id]}</div>}
                          </div>
                          <div style={{ display: 'grid', gap: 12 }}>
                            <div>
                              <span className="ap-lbl">Notes (optional)</span>
                              <input className="ap-in" placeholder="e.g. left chest, 3&quot; logo, white thread" value={line.notes}
                                onChange={(e) => patchLine(line.id, { notes: e.target.value })} />
                            </div>
                            <div>
                              <span className="ap-lbl">Supplier</span>
                              <select className="ap-in" value={line.supplierId}
                                onChange={(e) => {
                                  const s = suppliers.find((x) => String(x.id) === e.target.value);
                                  patchLine(line.id, { supplierId: e.target.value, supplierName: s ? s.name : '' });
                                }}>
                                <option value="">Select supplier</option>
                                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            </div>
                          </div>
                        </div>

                        <div className="ap-foot">
                          <span>{line.quantity} pcs × {money(line.price)} = <strong>{money(line.quantity * line.price)}</strong></span>
                          {canAddColour && <button type="button" className="ap-link" onClick={() => addAnotherColour(line)}>+ Add another colour</button>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {lines.length > 0 && (
                <div style={{ fontSize: 13, color: '#374151', textAlign: 'right' }}>
                  {lines.length} line{lines.length === 1 ? '' : 's'} · {totalPieces} pcs · <strong>{money(totalAmount)}</strong>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ApparelPicker;