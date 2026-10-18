import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { API_BASE_URL } from '../../config';
import { primaryImageUrl } from '../../utils/productImages';   // add to the imports at the top

// ── ICONS ────────────────────────────────────────────────────────────────────
const makeIcon = (children) => {
  const Icon = ({ size = 24, strokeWidth = 2, color = 'currentColor', fill = 'none' } = {}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
  );
  return Icon;
};

const ArrowLeftIcon = makeIcon(<><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></>);
const UploadCloudIcon = makeIcon(<><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m8 16 4-4 4 4"/></>);
const TextIcon = makeIcon(<><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></>);
const ImageIcon = makeIcon(<><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></>);
const CloseIcon = makeIcon(<><path d="M18 6L6 18"/><path d="M6 6l12 12"/></>);
const QrCodeIcon = makeIcon(<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h7v7h-7z"/></>);
const FileTextIcon = makeIcon(<><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></>);
const RotateIcon = makeIcon(<><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></>);

const readDraft = (key) => {
  try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; }
};

// ── INTERACTABLE LOGO (drag, corner-resize, rotate, crop — all bounded to the print area) ──
const ACCENT = '#f97316';
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

const frameSize = (t, aspect) => {
  const fullH = t.w / aspect;
  return { fullH, fw: t.w * (1 - t.crop.l - t.crop.r), fh: fullH * (1 - t.crop.t - t.crop.b) };
};
const rotatedBox = (fw, fh, deg) => {
  const r = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
  return { bw: fw * c + fh * s, bh: fw * s + fh * c };
};
const clampCenter = (t, aspect, PW, PH) => {
  const { fw, fh } = frameSize(t, aspect);
  const { bw, bh } = rotatedBox(fw, fh, t.rot);
  const cx = bw / 2 > PW - bw / 2 ? PW / 2 : clamp(t.cx, bw / 2, PW - bw / 2);
  const cy = bh / 2 > PH - bh / 2 ? PH / 2 : clamp(t.cy, bh / 2, PH - bh / 2);
  return { ...t, cx, cy };
};
// shrink (never grow) so the rotated frame still fits inside the print area
const shrinkToFit = (t, aspect, PW, PH) => {
  const { fw, fh } = frameSize(t, aspect);
  const { bw, bh } = rotatedBox(fw, fh, t.rot);
  const f = Math.min(1, PW / bw, PH / bh);
  return f < 1 ? { ...t, w: t.w * f } : t;
};

const NO_CROP = { l: 0, t: 0, r: 0, b: 0 };
const MIN_CROP_FRAME = 0.1; // keep at least 10% of the image

const InteractableLogo = ({ logoSrc, parentRef, scale, onRemove, onChange, initialDesign }) => {
  const [aspect, setAspect] = useState(1);
  const [t, setT] = useState(null); // { cx, cy, w, rot, crop } — px inside the print area
  const [cropMode, setCropMode] = useState(false);
  const [active, setActive] = useState(null);
  const boxRef = useRef(null);
  const tRef = useRef(t);
  const aspectRef = useRef(aspect);
  const scaleRef = useRef(scale);
  tRef.current = t;
  aspectRef.current = aspect;
  scaleRef.current = scale;

  const area = () => ({ PW: parentRef.current.clientWidth, PH: parentRef.current.clientHeight });

  // Load the image to get its aspect ratio, then place it centered at 80% "fit"
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      if (!parentRef.current) return;
      const a = img.naturalWidth / img.naturalHeight || 1;
      const { PW, PH } = area();
             setAspect(a);
      if (initialDesign) {
        const d = initialDesign;
        const fw = (d.width / 100) * PW;
        const cl = -d.imgLeft / d.imgW;
        const ct = -d.imgTop / d.imgH;
        setT({
          cx: ((d.left + d.width / 2) / 100) * PW,
          cy: ((d.top + d.height / 2) / 100) * PH,
          w: (d.imgW / 100) * fw,
          rot: d.rot,
          crop: { l: cl, t: ct, r: 1 - cl - 100 / d.imgW, b: 1 - ct - 100 / d.imgH },
        });
      } else {
        setT({ cx: PW / 2, cy: PH / 2, w: Math.min(PW, PH * a) * 0.8, rot: 0, crop: NO_CROP });
      }
    };
    img.src = logoSrc;
  }, [logoSrc, parentRef]);

   // Report placement as % of the print area so the preview can render it at any size
  useEffect(() => {
    if (!t || !parentRef.current) return;
    const { PW, PH } = area();
    const { fw, fh, fullH } = frameSize(t, aspect);
    onChange?.({
      left: ((t.cx - fw / 2) / PW) * 100,
      top: ((t.cy - fh / 2) / PH) * 100,
      width: (fw / PW) * 100,
      height: (fh / PH) * 100,
      rot: t.rot,
      imgW: (t.w / fw) * 100,
      imgH: (fullH / fh) * 100,
      imgLeft: ((-t.crop.l * t.w) / fw) * 100,
      imgTop: ((-t.crop.t * fullH) / fh) * 100,
    });
  }, [t, aspect]);

  const fit = () => {
    const { PW, PH } = area();
    setT({ cx: PW / 2, cy: PH / 2, w: Math.min(PW, PH * aspect), rot: 0, crop: NO_CROP });
  };
  const fill = () => {
    const { PW, PH } = area();
    const w = Math.max(PW, PH * aspect);
    const cl = Math.max(0, (1 - PW / w) / 2);
    const ct = Math.max(0, (1 - PH / (w / aspect)) / 2);
    setT({ cx: PW / 2, cy: PH / 2, w, rot: 0, crop: { l: cl, r: cl, t: ct, b: ct } });
  };

  const compute = (start, ev) => {
    const { PW, PH } = area();
    const a = aspectRef.current;
    const t0 = start.t;
    const dx = (ev.clientX - start.px) / scaleRef.current; // screen px → print-area px
    const dy = (ev.clientY - start.py) / scaleRef.current;

    if (start.type === 'drag') {
      return clampCenter({ ...t0, cx: t0.cx + dx, cy: t0.cy + dy }, a, PW, PH);
    }

    if (start.type === 'resize') {
      const f0 = frameSize(t0, a);
      const bb = rotatedBox(f0.fw, f0.fh, t0.rot);
      const minF = 30 / Math.min(f0.fw, f0.fh);
      const maxF = Math.max(minF, Math.min(PW / bb.bw, PH / bb.bh));
      const dist = Math.hypot(ev.clientX - start.c.x, ev.clientY - start.c.y);
      const f = clamp(dist / start.d0, minF, maxF);
      return clampCenter({ ...t0, w: t0.w * f }, a, PW, PH);
    }

    if (start.type === 'rotate') {
      const ang = Math.atan2(ev.clientY - start.c.y, ev.clientX - start.c.x);
      let rot = t0.rot + ((ang - start.a0) * 180) / Math.PI;
      const snapped = Math.round(rot / 90) * 90;
      if (Math.abs(rot - snapped) < 4) rot = snapped;
      return clampCenter(shrinkToFit({ ...t0, rot }, a, PW, PH), a, PW, PH);
    }

    if (start.type === 'crop') {
      const r = (t0.rot * Math.PI) / 180;
      const u = { x: Math.cos(r), y: Math.sin(r) };
      const v = { x: -Math.sin(r), y: Math.cos(r) };
      const lx = dx * u.x + dy * u.y; // pointer movement in the logo's own axes
      const ly = dx * v.x + dy * v.y;
      const { fullH } = frameSize(t0, a);
      const crop = { ...t0.crop };
      let m = 0, axis = u;
      if (start.edge === 'l') { crop.l = clamp(t0.crop.l + lx / t0.w, 0, 1 - crop.r - MIN_CROP_FRAME); m = (crop.l - t0.crop.l) * t0.w; }
      if (start.edge === 'r') { crop.r = clamp(t0.crop.r - lx / t0.w, 0, 1 - crop.l - MIN_CROP_FRAME); m = -(crop.r - t0.crop.r) * t0.w; }
      if (start.edge === 't') { crop.t = clamp(t0.crop.t + ly / fullH, 0, 1 - crop.b - MIN_CROP_FRAME); m = (crop.t - t0.crop.t) * fullH; axis = v; }
      if (start.edge === 'b') { crop.b = clamp(t0.crop.b - ly / fullH, 0, 1 - crop.t - MIN_CROP_FRAME); m = -(crop.b - t0.crop.b) * fullH; axis = v; }
      return { ...t0, crop, cx: t0.cx + (axis.x * m) / 2, cy: t0.cy + (axis.y * m) / 2 };
    }
    return t0;
  };

  const begin = (e, type, edge) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = boxRef.current.getBoundingClientRect();
    const c = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const start = {
      type, edge, c, t: tRef.current, px: e.clientX, py: e.clientY,
      a0: Math.atan2(e.clientY - c.y, e.clientX - c.x),
      d0: Math.hypot(e.clientX - c.x, e.clientY - c.y) || 1,
    };
    setActive(type);
    const move = (ev) => setT(compute(start, ev));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setActive(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  if (!t) return null;

  const k = 1 / scale; // keeps borders/handles the same size on screen at any zoom
  const { fw, fh, fullH } = frameSize(t, aspect);
  const imgStyle = { position: 'absolute', left: -t.crop.l * t.w, top: -t.crop.t * fullH, width: t.w, height: fullH, maxWidth: 'none', display: 'block', pointerEvents: 'none' };
  const dot = { position: 'absolute', width: 14 * k, height: 14 * k, boxSizing: 'border-box', background: '#fff', border: `${2 * k}px solid ${ACCENT}`, borderRadius: '50%', transform: 'translate(-50%, -50%)', zIndex: 30, touchAction: 'none' };
  const bar = { position: 'absolute', background: '#fff', border: `${2 * k}px solid ${ACCENT}`, borderRadius: 99, boxSizing: 'border-box', transform: 'translate(-50%, -50%)', zIndex: 30, touchAction: 'none' };
  const tb = (on) => ({ border: 'none', background: on ? '#fff7ed' : 'transparent', color: on ? ACCENT : '#0f172a', fontWeight: 700, fontSize: 13, padding: '8px 12px', borderRadius: 8, cursor: 'pointer' });

  return (
    <>
      {/* Floating toolbar above the print area */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'absolute', left: '50%', bottom: `calc(100% + ${14 * k}px)`, transform: `translateX(-50%) scale(${k})`, transformOrigin: 'bottom center', display: 'flex', gap: 2, background: '#fff', borderRadius: 12, padding: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', whiteSpace: 'nowrap', zIndex: 40 }}
      >
        <button style={tb(false)} onClick={fit}>Fit</button>
        <button style={tb(false)} onClick={fill}>Fill</button>
        <button style={tb(cropMode)} onClick={() => setCropMode((v) => !v)}>{cropMode ? 'Done' : 'Crop'}</button>
        {cropMode && <button style={tb(false)} onClick={() => setT((p) => ({ ...p, crop: NO_CROP }))}>Reset crop</button>}
        <button style={{ ...tb(false), color: '#ef4444' }} onClick={onRemove}>Delete</button>
      </div>

      <div
        ref={boxRef}
        onPointerDown={(e) => begin(e, 'drag')}
        style={{ position: 'absolute', left: t.cx - fw / 2, top: t.cy - fh / 2, width: fw, height: fh, transform: `rotate(${t.rot}deg)`, outline: `${2 * k}px solid ${ACCENT}`, cursor: active === 'drag' ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none', zIndex: 20 }}
      >
        {/* in crop mode, show the cropped-away part faintly */}
        {cropMode && <img src={logoSrc} alt="" draggable={false} style={{ ...imgStyle, opacity: 0.3 }} />}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          <img src={logoSrc} alt="Uploaded design" draggable={false} style={imgStyle} />
        </div>

        {cropMode ? (
          <>
            <div onPointerDown={(e) => begin(e, 'crop', 't')} style={{ ...bar, left: '50%', top: 0, width: 32 * k, height: 8 * k, cursor: 'ns-resize' }} />
            <div onPointerDown={(e) => begin(e, 'crop', 'b')} style={{ ...bar, left: '50%', top: '100%', width: 32 * k, height: 8 * k, cursor: 'ns-resize' }} />
            <div onPointerDown={(e) => begin(e, 'crop', 'l')} style={{ ...bar, left: 0, top: '50%', width: 8 * k, height: 32 * k, cursor: 'ew-resize' }} />
            <div onPointerDown={(e) => begin(e, 'crop', 'r')} style={{ ...bar, left: '100%', top: '50%', width: 8 * k, height: 32 * k, cursor: 'ew-resize' }} />
          </>
        ) : (
          <>
            <div onPointerDown={(e) => begin(e, 'resize')} style={{ ...dot, left: 0, top: 0, cursor: 'nwse-resize' }} />
            <div onPointerDown={(e) => begin(e, 'resize')} style={{ ...dot, left: '100%', top: 0, cursor: 'nesw-resize' }} />
            <div onPointerDown={(e) => begin(e, 'resize')} style={{ ...dot, left: 0, top: '100%', cursor: 'nesw-resize' }} />
            <div onPointerDown={(e) => begin(e, 'resize')} style={{ ...dot, left: '100%', top: '100%', cursor: 'nwse-resize' }} />
            <div
              onPointerDown={(e) => begin(e, 'rotate')}
              style={{ ...dot, left: '50%', top: `calc(100% + ${26 * k}px)`, width: 26 * k, height: 26 * k, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ACCENT, cursor: 'crosshair' }}
            >
              <RotateIcon size={14 * k} />
            </div>
          </>
        )}
      </div>
    </>
  );
};

// ── UPLOAD MODAL COMPONENT ───────────────────────────────────────────────────
const UploadModal = ({ isOpen, onClose, onUpload, uploading }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef(null);

  if (!isOpen) return null;

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      onUpload(e.target.files[0]);
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
            
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="lum-btn-primary">
              <UploadCloudIcon size={20} /> {uploading ? 'Uploading...' : 'Upload from this device'}
            </button>
            <button onClick={() => alert('Mobile scan coming soon!')} disabled={uploading} className="lum-btn-secondary">
              <QrCodeIcon size={20} /> Upload from phone
            </button>
            <span style={{ fontSize: '14px', color: '#64748b', marginTop: '12px' }}>or drag and drop here</span>
          </div>

          <div className="lum-info">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, fontSize: '14px', color: '#0f172a', paddingBottom: '16px', borderBottom: '1px solid #e2e8f0' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FileTextIcon size={18} /> Specs and templates</span>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: '#64748b', textAlign: 'center', padding: '32px 20px' }}>
              We recommend high-resolution PNG files with transparent backgrounds for the best printing results.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const PreviewModal = ({ isOpen, onClose, bgImage, area, design, logoSrc, title }) => {
  if (!isOpen) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, maxWidth: 560, width: '100%', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Preview{title ? ` – ${title}` : ''}</h2>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#475569' }}>
            <CloseIcon size={18} />
          </button>
        </div>
        <div style={{ padding: 20, display: 'flex', justifyContent: 'center', background: '#f8fafc' }}>
          <div style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
            <img src={bgImage} alt="Apparel preview" style={{ maxHeight: '70vh', maxWidth: '100%', display: 'block', borderRadius: 8 }} />
            {design && (
              <div style={{ position: 'absolute', left: `${area.x}%`, top: `${area.y}%`, width: `${area.w}%`, height: `${area.h}%` }}>
                <div style={{ position: 'absolute', left: `${design.left}%`, top: `${design.top}%`, width: `${design.width}%`, height: `${design.height}%`, transform: `rotate(${design.rot}deg)`, overflow: 'hidden' }}>
                  <img src={logoSrc} alt="Design" draggable={false} style={{ position: 'absolute', left: `${design.imgLeft}%`, top: `${design.imgTop}%`, width: `${design.imgW}%`, height: `${design.imgH}%`, maxWidth: 'none' }} />
                </div>
              </div>
            )}
          </div>
        </div>
        {!design && <p style={{ margin: 0, padding: '0 20px 16px', fontSize: 13, color: '#64748b', textAlign: 'center' }}>Upload a design to see it on the product.</p>}
      </div>
    </div>
  );
};

// ── MAIN EDITOR PAGE ─────────────────────────────────────────────────────────
export default function ApparelEditor() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  
  const { product, color, placement, currentBgImage, unitPrice } = location.state || {};

  const draftKey = `apparel-draft:${id}:${placement?.id ?? 'default'}`;
  const [draft] = useState(() => readDraft(draftKey));
  const seed = location.state?.editingCartItemId ? null : draft; // cart item beats an older draft
  const [logo, setLogo] = useState(seed?.logo || location.state?.savedLogo || null);
  const [initialDesign, setInitialDesign] = useState(seed?.design || location.state?.savedDesign || null);
  const [isModalOpen, setIsModalOpen] = useState(!(seed?.logo || location.state?.savedLogo));
  const [uploading, setUploading] = useState(false);
const printAreaRef = useRef(null);
  const [design, setDesign] = useState(null);

    // persist the logo (server URL only, never the blob) and its placement
  useEffect(() => {
    try {
      if (!logo) localStorage.removeItem(draftKey);
      else if (design) localStorage.setItem(draftKey, JSON.stringify({ logo: { url: logo.url }, design }));
    } catch {}
  }, [logo, design, draftKey]);

  const logoSrc = logo ? (logo.preview || logo.url) : null;


  const [showPreview, setShowPreview] = useState(false);
  const stageRef = useRef(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [bgAspect, setBgAspect] = useState(3 / 4);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!product) navigate(`/sales/crm/apparel/${id}`);
  }, [product, id, navigate]);

  // Read coordinates perfectly mapped from database
 const activePrintArea = useMemo(() => {
  const fallback = { x: 50, y: 40, w: 20, h: 20 };
  if (!product || !product.print_areas || !placement) return fallback;
  try {
    const areas = typeof product.print_areas === 'string' ? JSON.parse(product.print_areas) : product.print_areas;
    const match = areas.find(a => String(a.id) === String(placement.id) || a.label === placement.label);
    if (!match) return fallback;
    const n = (v, d) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : d);
    return { x: n(match.x, 50), y: n(match.y, 40), w: n(match.w, 20), h: n(match.h, 20) };
  } catch {
    return fallback;
  }
}, [product, placement]);


const bgImage = useMemo(() => {
  if (currentBgImage) return currentBgImage;
  const match = (Array.isArray(product?.print_areas) ? product.print_areas : [])
    .find(a => String(a.id) === String(placement?.id));
  return match?.image ? primaryImageUrl(match.image) : '';
}, [currentBgImage, product, placement]);

   // Zoom math: the shirt image is laid out at a fixed size ("world") and scaled so the print area fills the stage
  const WORLD_H = 800;
  const WORLD_W = WORLD_H * bgAspect;
  const paW = (activePrintArea.w / 100) * WORLD_W;
  const paH = (activePrintArea.h / 100) * WORLD_H;
  const paCx = (activePrintArea.x / 100) * WORLD_W + paW / 2;
  const paCy = (activePrintArea.y / 100) * WORLD_H + paH / 2;
  const fitAll = stage.w ? Math.min((stage.w * 0.95) / WORLD_W, (stage.h * 0.95) / WORLD_H) : 1;
  const fitPrint = stage.w ? Math.min((stage.w * 0.7) / paW, (stage.h * 0.6) / paH) : 1;
  const baseScale = Math.max(fitAll, Math.min(fitPrint, fitAll * 4));
  const MAX_ZOOM = 4;
  const minZoom = fitAll / baseScale;
  const z = clamp(zoom, minZoom, MAX_ZOOM);
  const scale = baseScale * z;
  // as you zoom out past the default, drift the focus from the print area to the shirt center
  const blend = baseScale > fitAll && scale < baseScale ? (baseScale - scale) / (baseScale - fitAll) : 0;
  const focusX = paCx + (WORLD_W / 2 - paCx) * blend;
  const focusY = paCy + (WORLD_H / 2 - paCy) * blend;
  const k = 1 / scale;
  const zoomBtn = { border: 'none', background: 'transparent', fontSize: 18, fontWeight: 700, width: 32, height: 32, cursor: 'pointer', color: '#0f172a' };

  const handleUploadFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const preview = URL.createObjectURL(file);
      setUploading(true);
      
      fetch(`${API_BASE_URL}/uploads/apparel-logo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, dataUrl }),
      })
      .then(res => res.json())
      .then(data => {
        if (data?.success) {
          
          setInitialDesign(null);
          setLogo({ url: data.url, preview });
          setIsModalOpen(false);
        } else {
          alert(data?.message || 'Upload failed.');
        }
      })
      .catch(() => alert('Upload failed. Check your connection.'))
      .finally(() => setUploading(false));
    };
    reader.readAsDataURL(file);
  };

    const handleNext = () => {
    if (!logo || !design) { alert('Please upload a design first.'); return; }
    navigate(`/sales/crm/apparel/review/${id}`, {
  state: {
        product, color, placement, currentBgImage:bgImage, unitPrice, area: activePrintArea, logoUrl: logo.url, design,
        editingCartItemId: location.state?.editingCartItemId,
        initialSizes: location.state?.initialSizes,
        placementLabels: location.state?.placementLabels,
        decoration: location.state?.decoration,
      },    });
   };

  if (!product) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f1f5f9', fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        .editor-container { display: flex; flex: 1; overflow: hidden; }
        .editor-sidebar { width: 80px; background: #fff; border-right: 1px solid #e2e8f0; display: flex; flex-direction: column; align-items: center; padding: 20px 0; gap: 24px; z-index: 5; }
        .editor-main { flex: 1; position: relative; display: flex; align-items: center; justify-content: center; padding: 40px; }
        
        .tool-btn { display: flex; flex-direction: column; align-items: center; color: #64748b; background: none; border: none; cursor: pointer; transition: color 0.2s; }
        .tool-btn:hover, .tool-btn.active { color: #38bdf8; }
        .tool-label { font-size: 10px; font-weight: 700; margin-top: 6px; }

        .lum-body { display: grid; grid-template-columns: 1fr 1fr; min-height: 420px; }
        .lum-dropzone { padding: 40px 24px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; border-right: 1px dashed #cbd5e1; background: #fff; transition: background 0.2s; }
        .lum-dropzone.dragging { background: #f0f9ff; border: 2px dashed #38bdf8; }
        .lum-info { padding: 40px; display: flex; flex-direction: column; background: #f8fafc; }
        .lum-btn-primary { width: 100%; max-width: 280px; display: flex; align-items: center; justify-content: center; gap: 8px; background: #7dd3fc; color: #0c4a6e; border: none; border-radius: 8px; padding: 14px 16px; font-size: 15px; font-weight: 700; cursor: pointer; transition: background 0.2s; }
        .lum-btn-primary:hover:not(:disabled) { background: #38bdf8; }
        .lum-btn-primary:disabled { opacity: 0.7; cursor: wait; }
        .lum-btn-secondary { width: 100%; max-width: 280px; display: flex; align-items: center; justify-content: center; gap: 8px; background: #fff; color: #0f172a; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px 16px; font-size: 15px; font-weight: 700; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }

        @media (max-width: 768px) {
          .editor-container { flex-direction: column-reverse; }
          .editor-sidebar { width: 100%; height: 70px; border-right: none; border-top: 1px solid #e2e8f0; flex-direction: row; justify-content: space-around; padding: 0 10px; }
          .editor-main { padding: 20px; }
          .lum-body { grid-template-columns: 1fr; grid-template-rows: auto auto; min-height: auto; }
          .lum-dropzone { border-right: none; border-bottom: 1px solid #e2e8f0; padding: 40px 20px; }
          .lum-info { padding: 24px 20px; }
        }
      `}</style>

      {/* ── TOP NAVBAR ── */}
      <div style={{ height: '64px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => navigate(-1)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#475569' }}>
            <ArrowLeftIcon size={18} />
          </button>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 800, fontSize: '15px', color: '#0f172a', lineHeight: 1.2 }}>{product.name}</span>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Editing {placement?.label || 'Front'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button onClick={() => setShowPreview(true)} style={{ background: '#fff', color: '#0f172a', border: '1px solid #cbd5e1', padding: '10px 18px', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            Preview
          </button>
          <span style={{ fontWeight: 800, fontSize: '16px', color: '#0f172a' }}>${unitPrice?.toFixed(2)}</span>
          <button onClick={handleNext} disabled={uploading} style={{ background: '#0ea5e9', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: '8px', fontWeight: 700, fontSize: '14px', cursor: uploading ? 'wait' : 'pointer' }}>
            Review & Next
          </button>
        </div>
      </div>

      <div className="editor-container">
        {/* ── SIDEBAR ── */}
        <div className="editor-sidebar">
          <button className="tool-btn active" onClick={() => setIsModalOpen(true)}>
            <UploadCloudIcon />
            <span className="tool-label">Uploads</span>
          </button>
          <button className="tool-btn" onClick={() => alert('Text tool coming soon')}>
            <TextIcon />
            <span className="tool-label">Text</span>
          </button>
          <button className="tool-btn" onClick={() => alert('Graphics gallery coming soon')}>
            <ImageIcon />
            <span className="tool-label">Graphics</span>
          </button>
        </div>

               {/* ── MAIN CANVAS ── */}
        <div className="editor-main">
          <div ref={stageRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#e2e8f0' }}>

            {/* Zoomable world: shirt + print area */}
            <div style={{ position: 'absolute', left: '50%', top: '50%', width: WORLD_W, height: WORLD_H, transformOrigin: '0 0', transform: `scale(${scale}) translate(${-focusX}px, ${-focusY}px)`, transition: 'transform 0.25s ease' }}>
              <img
                src={bgImage}
                alt="Shirt"
                draggable={false}
                onLoad={(e) => setBgAspect(e.target.naturalWidth / e.target.naturalHeight || 3 / 4)}
                style={{ width: WORLD_W, height: WORLD_H, display: 'block', maxWidth: 'none' }}
              />

              <div
                ref={printAreaRef}
                onClick={() => !logo && setIsModalOpen(true)}
                style={{
                  position: 'absolute',
                  left: `${activePrintArea.x}%`,
                  top: `${activePrintArea.y}%`,
                  width: `${activePrintArea.w}%`,
                  height: `${activePrintArea.h}%`,
                  boxSizing: 'border-box',
                  border: `${2 * k}px dashed #0ea5e9`,
                  background: logo ? 'rgba(14,165,233,0.06)' : 'rgba(255,255,255,0.85)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  cursor: logo ? 'default' : 'pointer',
                  zIndex: 10
                }}
              >
                {logo ? (
                    <InteractableLogo
                     logoSrc={logoSrc}
                     initialDesign={initialDesign}
                     parentRef={printAreaRef}
                     scale={scale}
                    onChange={setDesign}
                    onRemove={() => { setLogo(null); setDesign(null); setInitialDesign(null); setIsModalOpen(true); }}
                   />
                ) : (
                  <div style={{ transform: `scale(${k})`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <UploadCloudIcon />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginTop: 4, textAlign: 'center' }}>Upload design</span>
                  </div>
                )}

                {/* label under the box */}
                <div style={{ position: 'absolute', left: 0, top: '100%', marginTop: 6 * k, transform: `scale(${k})`, transformOrigin: 'left top', background: '#0f172a', color: '#fff', fontSize: 11, padding: '4px 10px', borderRadius: 99, fontWeight: 700, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                  {placement?.label || 'Safe Print Area'}
                </div>
              </div>
            </div>

            {/* Zoom controls */}
            <div style={{ position: 'absolute', left: '50%', bottom: 16, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 4, background: '#fff', borderRadius: 12, padding: '4px 8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 50 }}>
              <button style={zoomBtn} onClick={() => setZoom(Math.max(minZoom, z / 1.25))}>−</button>
              <button style={{ ...zoomBtn, width: 60, fontSize: 13 }} onClick={() => setZoom(1)} title="Reset zoom">{Math.round(z * 100)}%</button>
              <button style={zoomBtn} onClick={() => setZoom(Math.min(MAX_ZOOM, z * 1.25))}>+</button>
            </div>
          </div>
        </div>
      </div>

      <UploadModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onUpload={handleUploadFile} 
        uploading={uploading} 
      />

      <PreviewModal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        bgImage={bgImage}
        area={activePrintArea}
        design={design}
        logoSrc={logoSrc}
        title={placement?.label}
      />
    </div>
  );
}