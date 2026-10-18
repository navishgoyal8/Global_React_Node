import React, { useState, useEffect } from 'react';
import { fmtMoney, getSizes, parseTiers, priceFor } from './apparelPricing';
import SizeChartDrawer from './SizeChartDrawer';

const LOW_STOCK = 100; // the "running low" banner shows when a size has this many left or fewer

const DrawerBody = ({ item, onClose, onSave, onBrowseSimilar }) => {
  const a = item.apparel || {};
  const product = a.editState?.product;
  // items added before editing existed have no product: fall back to the sizes already chosen
  const sizeList = product
    ? getSizes(product)
    : Object.keys(a.sizes || {}).map((label) => ({ label, stock: null, chart: {} }));
  const tiers = parseTiers(product);
  const base = Number(a.editState?.unitPrice) || (item.totalPieces ? item.originalPrice / item.totalPieces : 0);

  const [qty, setQty] = useState(a.sizes || {});
  const [chartOpen, setChartOpen] = useState(false);

  const total = sizeList.reduce((sum, s) => sum + (Number(qty[s.label]) || 0), 0);
  const { each, discountPct } = priceFor(base, tiers, total);
  const lineTotal = Math.round(each * total * 100) / 100;
  const lowStock = sizeList.some((s) => s.stock != null && s.stock <= LOW_STOCK);
  const hasChart = sizeList.some((s) => Object.values(s.chart || {}).some((v) => v != null && v !== ''));

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !chartOpen) onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [chartOpen, onClose]);

  const onChange = (s, raw) => {
    const digits = raw.replace(/\D/g, '').slice(0, 5);
    let n = digits === '' ? '' : Number(digits);
    if (n !== '' && s.stock != null && n > s.stock) n = s.stock; // can't exceed stock
    setQty((q) => ({ ...q, [s.label]: n }));
  };

  const save = () => {
    if (total < 1) return;
    const sizes = Object.fromEntries(
      sizeList.filter((s) => Number(qty[s.label]) > 0).map((s) => [s.label, Number(qty[s.label])])
    );
    onSave({ sizes, total, each, lineTotal, base });
  };

  return (
    <>
      <div className="qd-overlay" onClick={onClose}>
        <style>{`
          .qd-overlay { position: fixed; inset: 0; z-index: 9999; background: rgba(15,23,42,0.65); display: flex; justify-content: flex-end; animation: qd-fade .2s ease; }
          .qd-panel { position: relative; display: flex; flex-direction: column; width: min(100%, 740px); height: 100%; background: #fff; box-sizing: border-box; animation: qd-slide .25s ease; font-family: 'Inter', sans-serif; color: #0f172a; }
          .qd-close { position: absolute; top: 16px; right: 16px; z-index: 2; background: none; border: none; padding: 8px; display: flex; cursor: pointer; color: #0f172a; }
          .qd-scroll { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 56px 30px 24px; }
          .qd-title { margin: 0 0 24px; font-size: clamp(26px, 4vw, 36px); font-weight: 800; line-height: 1.1; }
          .qd-banner { display: flex; align-items: center; gap: 14px; margin-bottom: 32px; padding: 20px 28px; background: #eef4fc; border: 1px solid #b9cbe6; border-radius: 16px; font-size: 18px; line-height: 1.4; }
          .qd-row { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; margin-bottom: 16px; }
          .qd-row h3 { margin: 0; font-size: 20px; font-weight: 700; }
          .qd-link { background: none; border: none; padding: 0; font-family: inherit; font-size: 18px; color: #0f172a; text-decoration: underline; cursor: pointer; }
          .qd-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px 30px; }
          .qd-size label { display: block; margin-bottom: 10px; font-size: 18px; }
          .qd-input { width: 100%; height: 60px; box-sizing: border-box; padding: 0 20px; font-size: 20px; font-family: inherit; color: #0f172a; background: #fff; border: 1px solid #94a3b8; border-radius: 10px; outline: none; }
          .qd-input:focus { border: 2px solid #0b6aa2; padding: 0 19px; }
          .qd-stock { margin: 8px 0 0; font-size: 16px; color: #64748b; }
          .qd-foot { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; padding: 20px 30px calc(20px + env(safe-area-inset-bottom, 0px)); background: #fff; border-top: 1px solid #e2e8f0; box-shadow: 0 -8px 16px -12px rgba(0,0,0,0.12); }
          .qd-total { font-size: 26px; font-weight: 800; }
          .qd-each, .qd-setup { margin-top: 2px; font-size: 16px; color: #64748b; }
          .qd-discount { margin-top: 6px; font-size: 16px; font-weight: 700; color: #047857; }
          .qd-update { min-width: 170px; height: 60px; padding: 0 24px; font-size: 18px; font-weight: 700; color: #0f172a; background: #6dd0f5; border: none; border-radius: 10px; cursor: pointer; }
          .qd-update:disabled { background: #e5e7eb; color: #9ca3af; cursor: not-allowed; }
          @keyframes qd-slide { from { transform: translateX(100%); } to { transform: none; } }
          @keyframes qd-fade { from { opacity: 0; } to { opacity: 1; } }
          @media (max-width: 600px) {
            .qd-scroll { padding: 56px 16px 16px; }
            .qd-banner { padding: 14px 16px; font-size: 15px; margin-bottom: 24px; }
            .qd-link { font-size: 16px; }
            .qd-grid { gap: 16px; }
            .qd-input { height: 54px; padding: 0 16px; }
            .qd-input:focus { padding: 0 15px; }
            .qd-foot { flex-direction: column; align-items: stretch; gap: 12px; padding: 14px 16px calc(14px + env(safe-area-inset-bottom, 0px)); }
            .qd-update { width: 100%; }
          }
        `}</style>

        <aside className="qd-panel" role="dialog" aria-modal="true" aria-label="Sizes and quantity" onClick={(e) => e.stopPropagation()}>
          <button className="qd-close" onClick={onClose} aria-label="Close">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg>
          </button>

          <div className="qd-scroll">
            <h2 className="qd-title">Sizes and quantity</h2>

            {lowStock && (
              <div className="qd-banner">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10" /><path d="M12 16v-5" /><path d="M12 8h.01" />
                </svg>
                <span>Some sizes are running low. <button className="qd-link" style={{ fontSize: 'inherit' }} onClick={onBrowseSimilar}>Browse similar products</button></span>
              </div>
            )}

            <div className="qd-row">
              <h3>Quantity per size</h3>
              {hasChart && <button className="qd-link" onClick={() => setChartOpen(true)}>Size chart</button>}
            </div>

            <div className="qd-grid">
              {sizeList.map((s) => (
                <div className="qd-size" key={s.label}>
                  <label htmlFor={`qd-${s.label}`}>{s.label}</label>
                  <input
                    id={`qd-${s.label}`}
                    className="qd-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={qty[s.label] ?? ''}
                    onChange={(e) => onChange(s, e.target.value)}
                  />
                  {s.stock != null && <p className="qd-stock">Only {s.stock} left</p>}
                </div>
              ))}
            </div>
          </div>

          <div className="qd-foot">
            <div>
              <div className="qd-total">{fmtMoney(lineTotal)}</div>
              <div className="qd-each">{fmtMoney(each)} each / {total} unit{total === 1 ? '' : 's'}</div>
              <div className="qd-setup">No setup fee</div>
              {total > 0 && discountPct > 0 && <div className="qd-discount">{discountPct}% Volume Discount</div>}
            </div>
            <button className="qd-update" disabled={total < 1} onClick={save}>Update cart</button>
          </div>
        </aside>
      </div>

      {/* rendered beside the overlay (not inside it) so closing the size chart doesn't also close this drawer */}
      <SizeChartDrawer open={chartOpen} onClose={() => setChartOpen(false)} sizes={sizeList} image={product?.size_chart_image} />
    </>
  );
};

// mounted only while an item is being edited, so the inputs start from that item's sizes each time
const QuantityDrawer = ({ item, ...rest }) =>
  item ? <DrawerBody key={item.cartItemId} item={item} {...rest} /> : null;

export default QuantityDrawer;