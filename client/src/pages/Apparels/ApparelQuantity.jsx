import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import DesignPreview from '../../components/Apparel/DesignPreview';
import SizeChartDrawer from '../../components/Apparel/SizeChartDrawer'
import { fmtMoney, getSizes, parseTiers, priceFor } from '../../components/Apparel/apparelPricing';

const CART_KEY = 'seatcover_cart';
const CART_ROUTE = '/sales/crm/cart'; // TODO: change to your real cart route

const SHIPPING_NOTE = 'Free shipping'; // set to '' to hide the line



export default function ApparelQuantity() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state } = useLocation();
  const { product, color, placement, currentBgImage, unitPrice, area, logoUrl, design, editingCartItemId, placementLabels, decoration } = state || {};  const [qty, setQty] = useState(state?.initialSizes || {});
  const [chartOpen, setChartOpen] = useState(false);

  const missing = !product || !currentBgImage || !logoUrl || !design || !area;

  useEffect(() => {
    if (missing) navigate(`/apparel/customize/${id}`, { replace: true });
  }, [missing, id, navigate]);
  if (missing) return null;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const sizeList = getSizes(product);
  const total = sizeList.reduce((sum, s) => sum + (Number(qty[s.label]) || 0), 0);
    const tiers = parseTiers(product);
  const base = Number(unitPrice) || 0;
  const { each, discountPct } = priceFor(base, tiers, total);
  const lineTotal = Math.round(each * total * 100) / 100;
  const lowest = tiers.length ? Math.min(base, ...tiers.map((t) => priceFor(base, tiers, t.min).each)) : base;

  const onChange = (s, raw) => {
    const digits = raw.replace(/\D/g, '').slice(0, 5);
    let n = digits === '' ? '' : Number(digits);
    if (n !== '' && s.stock != null && n > s.stock) n = s.stock; // can't exceed stock
    setQty((q) => ({ ...q, [s.label]: n }));
  };

   const hasChart = sizeList.some((s) => Object.values(s.chart || {}).some((v) => v != null && v !== ''));

    const handleAddToCart = () => {
    if (total < 1) return;
    const sizes = Object.fromEntries(
      sizeList.filter((s) => Number(qty[s.label]) > 0).map((s) => [s.label, Number(qty[s.label])])
    );
    // color / placement may be objects: the cart renders them as text, so send plain strings
    const text = (v) => (typeof v === 'string' ? v : v?.name || v?.label || '');
    const cartItemId = `apparel-${id}-${Date.now()}`; // unique, so deleting one row never hits another

    const item = {
      id: cartItemId,
      cartItemId,
      isCustomApparel: true,
      type: 'P',
      name: product.name,
      image: currentBgImage,
      price: lineTotal,                                      // whole bundle
      originalPrice: Math.round(base * total * 100) / 100,   // lets the cart show the volume discount
      qty: 1,
      totalPieces: total,
      apparel: {
        logoUrl,
        color: text(color),
        decoration: decoration || product.decoration_type || 'Custom print',
        placement: placementLabels && placementLabels.length > 1 ? placementLabels.join(' + ') : text(placement),
        sizes,
        notes: '',
        // kept for saving the order later; the cart page ignores these
        productId: id,
        bgImage: currentBgImage,
        area,
        design,
        unitPrice: each,
        // everything the editor needs to reopen this design from the cart
        editState: { product, color, placement, currentBgImage, unitPrice, placementLabels, decoration },      },
    };

    try {
       const cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      const idx = editingCartItemId ? cart.findIndex((c) => c.cartItemId === editingCartItemId) : -1;
      const next = idx >= 0
        ? cart.map((c, i) => (i === idx ? { ...item, id: editingCartItemId, cartItemId: editingCartItemId } : c))
        : [...cart, item];
      localStorage.setItem(CART_KEY, JSON.stringify(next));
     } catch(err) {
        console.error('Failed to save cart item in localstorage',err);
     }
    navigate(CART_ROUTE);
  };

  return (
    <div className="qt-page">
      <style>{`
        .qt-page { position: fixed; inset: 0; z-index: 1000; overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column; background: #fff; color: #0f172a; font-family: 'Inter', sans-serif; }        
        .qt-header { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 20px 56px; }
        .qt-back { background: none; border: none; display: flex; align-items: center; gap: 8px; padding: 10px 4px; font-size: 16px; font-weight: 600; color: #0f172a; cursor: pointer; }
        .qt-back:hover { text-decoration: underline; }
        .qt-help { background: none; border: none; display: flex; align-items: center; gap: 10px; font-size: 16px; color: #0f172a; cursor: pointer; }
        .qt-main { flex: 1; width: 100%; max-width: 1360px; margin: 0 auto; padding: 0 56px 40px; box-sizing: border-box; }
        .qt-title { margin: 0 0 40px; font-size: clamp(30px, 4vw, 44px); font-weight: 800; line-height: 1.1; }
        .qt-grid { display: grid; grid-template-columns: minmax(260px, 380px) minmax(0, 1fr); gap: clamp(32px, 7vw, 130px); align-items: start; }
        .qt-top { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; }
        .qt-name { margin: 0; font-size: 24px; font-weight: 700; }
        .qt-link { background: none; border: none; padding: 0; font-size: 17px; color: #0f172a; text-decoration: underline; cursor: pointer; white-space: nowrap; }
        .qt-price { margin: 24px 0 4px; font-size: 26px; font-weight: 700; }
        .qt-setup { margin: 0; font-size: 16px; color: #64748b; }
        .qt-each { margin: 0 0 4px; font-size: 16px; color: #64748b; }
        .qt-discount { margin: 10px 0 0; font-size: 16px; font-weight: 700; color: #047857; }
        .qt-label { margin: 40px 0 24px; font-size: 18px; font-weight: 700; }
        .qt-sizes { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 28px 32px; }
        .qt-size label { display: block; margin-bottom: 12px; font-size: 18px; }
        .qt-input { width: 100%; height: 60px; box-sizing: border-box; padding: 0 16px; font-size: 20px; font-family: inherit; color: #0f172a; border: 1px solid #94a3b8; border-radius: 10px; background: #fff; outline: none; }
        .qt-input:focus { border: 2px solid #0b6aa2; padding: 0 15px; }
        .qt-stock { margin: 10px 0 0; font-size: 16px; color: #64748b; }
        .qt-footer { position: sticky; bottom: 0; display: flex; justify-content: flex-end; align-items: center; gap: 24px; padding: 20px 56px; background: #fff; border-top: 1px solid #e2e8f0; }
        .qt-sum { text-align: right; line-height: 1.35; }
        .qt-sum-main { font-size: 18px; }
        .qt-sum-note { font-size: 15px; color: #475569; }        .qt-cart { min-width: 150px; height: 60px; padding: 0 24px; font-size: 18px; font-weight: 700; border: none; border-radius: 10px; background: #6dd0f5; color: #0f172a; cursor: pointer; }
        .qt-cart:disabled { background: #e5e7eb; color: #9ca3af; cursor: not-allowed; }

        @media (max-width: 1000px) {
          .qt-header { padding: 16px 24px; }
          .qt-main { padding: 0 24px 32px; }
          .qt-grid { grid-template-columns: 1fr; gap: 24px; }
          .qt-sizes { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .qt-footer { padding: 16px 24px calc(16px + env(safe-area-inset-bottom, 0px)); }
          .qt-cart { min-width: 140px; }
          .qt-sum { margin-right: auto; text-align: left; }
        }
        @media (max-width: 480px) {
          .qt-header { padding: 12px 16px; }
          .qt-main { padding: 0 16px 24px; }
          .qt-title { margin-bottom: 24px; }
          .qt-sizes { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px 16px; }
          .qt-top { flex-direction: column; gap: 8px; }
          .qt-price { font-size: 22px; margin-top: 16px; }
          .qt-label { margin: 28px 0 16px; }
          .qt-footer { padding-left: 16px; padding-right: 16px; }
          .qt-footer { flex-direction: column; align-items: stretch; gap: 12px; }
          .qt-sum { margin-right: 0; }
          .qt-cart { width: 100%; }
        }
      `}</style>

      <div className="qt-header">
        <button className="qt-back" onClick={() => navigate(-2)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
         Edit design
        </button>
        <button className="qt-help" onClick={() => alert('Help coming soon')}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" />
          </svg>
          Help is here
        </button>
      </div>

      <div className="qt-main">
        <h1 className="qt-title">Add quantity</h1>

        <div className="qt-grid">
          <DesignPreview bgImage={currentBgImage} area={area} design={design} logoSrc={logoUrl} maxWidth={380} maxVh={50} />

          <div>
            <div className="qt-top">
              <h2 className="qt-name">{product.name}</h2>
              {hasChart && <button className="qt-link" onClick={() => setChartOpen(true)}>See size chart</button>}
            </div>

            {base > 0 && (total > 0 ? (
              <>
                <p className="qt-price">{fmtMoney(lineTotal)}</p>
                <p className="qt-each">{fmtMoney(each)} each / {total} unit{total === 1 ? '' : 's'}</p>
              </>
            ) : (
              <p className="qt-price">{lowest < base ? `${fmtMoney(lowest)} – ${fmtMoney(base)}` : fmtMoney(base)} each</p>
            ))}
            <p className="qt-setup">No setup fee</p>
            {total > 0 && discountPct > 0 && <p className="qt-discount">{discountPct}% Volume Discount</p>}

            <h3 className="qt-label">Size and quantity*</h3>
            <div className="qt-sizes">
              {sizeList.map((s) => (
                <div className="qt-size" key={s.label}>
                  <label htmlFor={`qty-${s.label}`}>{s.label}</label>
                  <input
                    id={`qty-${s.label}`}
                    className="qt-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={qty[s.label] ?? ''}
                    onChange={(e) => onChange(s, e.target.value)}
                  />
                  {s.stock != null && <p className="qt-stock">Only {s.stock} left</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="qt-footer">
        {total > 0 && (
          <div className="qt-sum">
            <div className="qt-sum-main">{fmtMoney(lineTotal)} for {total} unit{total === 1 ? '' : 's'}</div>
            {SHIPPING_NOTE && <div className="qt-sum-note">{SHIPPING_NOTE}</div>}
          </div>
        )}
        <button className="qt-cart" disabled={total < 1} onClick={handleAddToCart}>{editingCartItemId ? 'Update Cart' : 'Add to Cart'}</button>
      </div>
      <SizeChartDrawer open={chartOpen} onClose={() => setChartOpen(false)} sizes={sizeList} image={product.size_chart_image} />
    </div>
  );
}