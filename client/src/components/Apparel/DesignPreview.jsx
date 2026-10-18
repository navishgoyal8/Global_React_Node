import React, { useState } from 'react';

// Shirt photo with the logo placed exactly as in the editor (all % based, scales to any size)
const Layer = ({ bgImage, area, design, logoSrc, onAspect }) => (
  <div style={{ position: 'relative', width: '100%', lineHeight: 0 }}>
    <img
      src={bgImage}
      alt="Apparel"
      draggable={false}
      onLoad={onAspect ? (e) => onAspect(e.target.naturalWidth / e.target.naturalHeight || 3 / 4) : undefined}
      style={{ width: '100%', height: 'auto', display: 'block' }}
    />
    <div style={{ position: 'absolute', left: `${area.x}%`, top: `${area.y}%`, width: `${area.w}%`, height: `${area.h}%` }}>
      <div style={{ position: 'absolute', left: `${design.left}%`, top: `${design.top}%`, width: `${design.width}%`, height: `${design.height}%`, transform: `rotate(${design.rot}deg)`, overflow: 'hidden' }}>
        <img src={logoSrc} alt="Your design" draggable={false} style={{ position: 'absolute', left: `${design.imgLeft}%`, top: `${design.imgTop}%`, width: `${design.imgW}%`, height: `${design.imgH}%`, maxWidth: 'none' }} />
      </div>
    </div>
  </div>
);

// Shirt + circular close-up of the print area
export default function DesignPreview({ bgImage, area, design, logoSrc, maxWidth = 560, maxVh = 70 }) {
  const [aspect, setAspect] = useState(null);
  const a = aspect || 3 / 4;

  // zoom so the print area fills ~55% of the circle (without overflowing it vertically)
  const r = area.h / area.w / a;
  const fill = 0.55 * r > 0.7 ? 0.7 / r : 0.55;
  const innerW = (fill * 10000) / area.w;
  const innerH = innerW / a;
  const innerLeft = 50 - ((area.x + area.w / 2) / 100) * innerW;
  const innerTop = 50 - ((area.y + area.h / 2) / 100) * innerH;

  return (
    <div style={{ position: 'relative', width: `min(100%, ${maxWidth}px, ${maxVh * a}vh)`, margin: '0 auto' }}>
      <Layer bgImage={bgImage} area={area} design={design} logoSrc={logoSrc} onAspect={setAspect} />
      {aspect && (
        <div style={{ position: 'absolute', right: '4%', bottom: '4%', width: '40%', aspectRatio: '1 / 1', borderRadius: '50%', overflow: 'hidden', background: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', border: '3px solid #fff' }}>
          <div style={{ position: 'absolute', width: `${innerW}%`, left: `${innerLeft}%`, top: `${innerTop}%` }}>
            <Layer bgImage={bgImage} area={area} design={design} logoSrc={logoSrc} />
          </div>
        </div>
      )}
    </div>
  );
}

export { Layer as DesignOnShirt };