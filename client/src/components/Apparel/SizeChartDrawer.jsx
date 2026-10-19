import React, { useEffect } from 'react';
import { MEASURES, fmt } from './apparelPricing';

const SizeDiagram = () => (
  <svg viewBox="0 0 420 250" role="img" aria-label="Where each measurement is taken" style={{ fontFamily: 'Inter, sans-serif' }}>
    <g transform="translate(110 0)" fill="#fff" stroke="#0f172a" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
      <path d="M120 22 L100 28 L60 52 L30 95 L62 112 L82 88 L82 235 L238 235 L238 88 L258 112 L290 95 L260 52 L220 28 L200 22 Q160 52 120 22 Z" />
      <path d="M120 22 L112 42 L158 62 M200 22 L208 42 L162 62" fill="none" />
      <rect x="154" y="52" width="12" height="42" fill="none" />
      <circle cx="160" cy="62" r="2" /><circle cx="160" cy="74" r="2" /><circle cx="160" cy="86" r="2" />
      <g stroke="#2563eb" strokeWidth="1.6" fill="#2563eb">
        <line x1="102" y1="30" x2="218" y2="30" /><circle cx="102" cy="30" r="2.5" /><circle cx="218" cy="30" r="2.5" />
        <line x1="92" y1="40" x2="46" y2="104" /><circle cx="92" cy="40" r="2.5" /><circle cx="46" cy="104" r="2.5" />
        <line x1="82" y1="118" x2="238" y2="118" strokeDasharray="4 3" />
        <line x1="102" y1="30" x2="102" y2="235" strokeDasharray="4 3" /><circle cx="102" cy="235" r="2.5" />
      </g>
    </g>
    <g fontSize="9.5" fontWeight="700" fill="#0f172a">
      <text x="2" y="33">Across Shoulder</text>
      <text x="2" y="66">Sleeve Length</text>
      <text x="2" y="121">Full Chest</text>
      <text x="2" y="201">Length</text>
    </g>
    <g stroke="#2563eb" strokeWidth="0.9">
      <line x1="84" y1="30" x2="212" y2="30" />
      <line x1="76" y1="63" x2="184" y2="66" />
      <line x1="52" y1="118" x2="192" y2="118" />
      <line x1="36" y1="198" x2="212" y2="198" />
    </g>
  </svg>
);

const SizeChartDrawer = ({ open, onClose, sizes, image, chartImage }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open) return null;
  const rows = MEASURES.filter((m) => sizes.some((s) => s.chart?.[m.key] != null && s.chart[m.key] !== ''));

  return (
    <div className="sc-overlay" onClick={onClose}>
      <style>{`
        .sc-overlay { position: fixed; inset: 0; z-index: 9999; background: rgba(15,23,42,0.65); display: flex; justify-content: flex-end; animation: sc-fade .2s ease; }
        .sc-panel { position: relative; width: min(100%, 760px); height: 100%; background: #fff; overflow-y: auto; box-sizing: border-box; padding: 72px 32px calc(32px + env(safe-area-inset-bottom, 0px)); animation: sc-slide .25s ease; font-family: 'Inter', sans-serif; color: #0f172a; }
        .sc-close { position: absolute; top: 16px; right: 16px; background: none; border: none; padding: 8px; display: flex; cursor: pointer; color: #0f172a; }
        .sc-diagram { margin-bottom: 32px; }
        .sc-chart-img { display: block; width: 100%; height: auto; border: 1px solid #e2e8f0; border-radius: 8px; }
        .sc-diagram svg, .sc-diagram img { display: block; width: 100%; max-width: 420px; height: auto; }
        .sc-title { margin: 0 0 24px; font-size: clamp(28px, 4vw, 40px); font-weight: 800; line-height: 1.1; }
        .sc-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .sc-table { width: 100%; min-width: 520px; border-collapse: collapse; font-size: 16px; }
        .sc-table th, .sc-table td { padding: 16px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
        .sc-table thead th { font-weight: 700; }
        .sc-table th:first-child { position: sticky; left: 0; background: #fff; min-width: 110px; white-space: normal; font-weight: 400; }
        .sc-table thead th:first-child { font-weight: 700; }
        .sc-table th span { display: block; font-size: 14px; color: #64748b; }
        @keyframes sc-slide { from { transform: translateX(100%); } to { transform: none; } }
        @keyframes sc-fade { from { opacity: 0; } to { opacity: 1; } }
        @media (max-width: 600px) {
          .sc-panel { padding: 64px 16px calc(24px + env(safe-area-inset-bottom, 0px)); }
          .sc-table { font-size: 14px; }
          .sc-table th, .sc-table td { padding: 12px 8px; }
        }
      `}</style>

      <aside className="sc-panel" role="dialog" aria-modal="true" aria-label="Size chart" onClick={(e) => e.stopPropagation()}>
        <button className="sc-close" onClick={onClose} aria-label="Close">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg>
        </button>

        {chartImage ? (
          <>
            <h2 className="sc-title">Size Chart</h2>
            <img className="sc-chart-img" src={chartImage} alt="Size chart" />
          </>
        ) : (
          <>
            <div className="sc-diagram">{image ? <img src={image} alt="Size guide" /> : <SizeDiagram />}</div>
            <h2 className="sc-title">Size Chart</h2>

            <div className="sc-scroll">
              <table className="sc-table">
                <thead>
                  <tr><th>Size</th>{sizes.map((s) => <th key={s.label}>{s.label}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.key}>
                      <th scope="row">{m.label}<span>(in/cm)</span></th>
                      {sizes.map((s) => <td key={s.label}>{fmt(s.chart?.[m.key])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </aside>
    </div>
  );
};
export default SizeChartDrawer;