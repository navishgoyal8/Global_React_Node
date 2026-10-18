import React, { useEffect } from 'react';
import DesignPreview from './DesignPreview';

// true when a cart item has everything needed to draw the customized shirt
export const canPreviewDesign = (item) =>
  !!(item?.isCustomApparel && item.apparel?.design && item.apparel?.area && (item.apparel.bgImage || item.image));

const DesignPreviewModal = ({ item, onClose, onEdit }) => {
  const open = canPreviewDesign(item);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open) return null;
  const a = item.apparel;
  const details = [
    a.color && ['Color', a.color],
    a.decoration && ['Decoration', a.decoration],
    a.placement && ['Placement', a.placement],
    item.totalPieces && ['Quantity', `${item.totalPieces} pcs`],
  ].filter(Boolean);

  return (
    <div className="dpm-overlay" onClick={onClose}>
      <style>{`
        .dpm-overlay { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(15,23,42,.65); backdrop-filter: blur(4px); }
        .dpm-box { width: 100%; max-width: 600px; max-height: 100%; overflow-y: auto; background: #fff; border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0,0,0,.2); font-family: 'Inter', sans-serif; color: #0f172a; }
        .dpm-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid #e2e8f0; }
        .dpm-head h3 { margin: 0; font-size: 18px; font-weight: 800; }
        .dpm-head p { margin: 2px 0 0; font-size: 13px; color: #64748b; }
        .dpm-x { flex-shrink: 0; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; border: none; border-radius: 50%; background: #f1f5f9; color: #475569; cursor: pointer; }
        .dpm-body { padding: 20px; background: #f8fafc; }
        .dpm-details { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 16px; margin: 0; padding: 16px 20px; font-size: 13px; }
        .dpm-details dt { font-size: 12px; color: #64748b; }
        .dpm-details dd { margin: 2px 0 0; font-weight: 600; text-transform: capitalize; }
        .dpm-actions { display: flex; gap: 10px; padding: 0 20px 20px; }
        .dpm-btn { flex: 1; padding: 12px 16px; font-size: 14px; font-weight: 700; font-family: inherit; border-radius: 10px; cursor: pointer; border: 1px solid #cbd5e1; background: #fff; color: #0f172a; }
        .dpm-btn.primary { border-color: #f97316; background: #f97316; color: #fff; }
        .dpm-btn.primary:hover { background: #ea580c; }
        @media (max-width: 520px) {
          .dpm-overlay { align-items: flex-end; padding: 0; }
          .dpm-box { max-height: 92vh; border-radius: 16px 16px 0 0; }
          .dpm-body { padding: 12px; }
          .dpm-actions { flex-direction: column; padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px)); }
        }
      `}</style>

      <div className="dpm-box" role="dialog" aria-modal="true" aria-label="Design preview" onClick={(e) => e.stopPropagation()}>
        <div className="dpm-head">
          <div>
            <h3>Design preview</h3>
            <p>{item.name}</p>
          </div>
          <button className="dpm-x" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="dpm-body">
          <DesignPreview bgImage={a.bgImage || item.image} area={a.area} design={a.design} logoSrc={a.logoUrl} maxWidth={520} maxVh={55} />
        </div>

        {details.length > 0 && (
          <dl className="dpm-details">
            {details.map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        )}

        <div className="dpm-actions">
          <button className="dpm-btn" onClick={onClose}>Close</button>
          {onEdit && <button className="dpm-btn primary" onClick={onEdit}>Edit design</button>}
        </div>
      </div>
    </div>
  );
};

export default DesignPreviewModal;