import { useState } from 'react';
import { HeartIcon, CartIcon } from './Icons';

const Swatch = ({ color, border, active, onClick }) => (
  <div onClick={onClick} style={{ backgroundColor: color, width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: border ? '1px solid #d1d5db' : '1px solid transparent', outline: active ? `2px solid #3b28cc` : 'none', outlineOffset: '2px', cursor: 'pointer' }}>
    {active && <div style={{ width: '6px', height: '6px', backgroundColor: (color==='white'||color==='#ffffff') ? 'black' : 'white', borderRadius: '50%' }}></div>}
  </div>
);

// ── FAUX LEATHER TOOLTIP ────────────────────────────────────────────────────
const ColorInfoTooltip = () => {
  const [visible, setVisible] = useState(false);
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {/* ⓘ icon */}
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '13px', height: '13px', borderRadius: '50%',
          border: '1.5px solid #94a3b8',
          color: '#94a3b8', fontSize: '8px', fontWeight: 700,
          cursor: 'default', userSelect: 'none', lineHeight: 1,
          marginLeft: '4px', flexShrink: 0,
        }}
      >i</span>

      {/* Tooltip bubble */}
      {visible && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1e293b',
            color: '#fff',
            fontSize: '11px',
            lineHeight: 1.55,
            padding: '9px 12px',
            borderRadius: '9px',
            width: '210px',
            boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        >
          Our faux leather resembles genuine leather — very comfortable, luxe, and durable for commercial use without the maintenance required to condition genuine leather.
          {/* Arrow */}
          <div style={{
            position: 'absolute',
            top: '100%', left: '50%',
            transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '6px solid #1e293b',
          }} />
        </div>
      )}
    </span>
  );
};

const AVAILABLE_COLORS = [
  { name: 'black', hex: '#000000' },
  { name: 'gray', hex: '#94a3b8' },
  { name: 'blue', hex: '#3b82f6' }
];

const AVAILABLE_PATTERNS = ['Hexagon', 'Diamond', 'Chevron', 'Leaf', 'Custom'];

const ProductCard = ({ product, getVariantQty, wishlist, handleUpdateQty, toggleWishlist, handleAddToCart, onClickImage }) => {
  const isFavorited = wishlist[product.id];
  
  // Track all three variant choices
  const [selectedColor, setSelectedColor] = useState('black');
  const [selectedStitching, setSelectedStitching] = useState('black');
  const [selectedPattern, setSelectedPattern] = useState('Diamond');
  
  // Get cart quantity for this specific variant combo
  const qty = getVariantQty(product.id, selectedColor, selectedStitching, selectedPattern);

  return (
    <div className="product-card">
      <div className="card-top">
        {product.badge ? <span className={`badge ${product.badge.color}`}>{product.badge.text}</span> : <div></div>}
        <button className="wishlist-btn" onClick={() => toggleWishlist(product.id)} style={{ borderColor: isFavorited ? '#ef4444' : '', backgroundColor: isFavorited ? '#fef2f2' : 'white', color: isFavorited ? '#ef4444' : '#9ca3af' }}>
          <HeartIcon filled={isFavorited} />
        </button>
      </div>

      <img src={product.image} alt={product.name} className="product-image" onClick={onClickImage} onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/300x300/f3f4f6/9ca3af?text=No+Img'; }} />

      <div className="product-title" onClick={onClickImage} style={{ cursor: 'pointer' }}>{product.name}</div>
      <div className="product-category">{product.category}</div>

      <div className="mini-filters">
        
        {/* Faux Leather Color row */}
        <div className="mini-filter-row">
          <span className="mini-filter-label" style={{ display: 'flex', alignItems: 'center' }}>
            Faux Leather Color
            <ColorInfoTooltip />
          </span>
          <div className="mini-filter-options" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {AVAILABLE_COLORS.map(c => (
              <Swatch key={c.name} color={c.hex} border={c.name === 'white'} active={selectedColor === c.name} onClick={(e) => { e.stopPropagation(); setSelectedColor(c.name); }} />
            ))}
          </div>
        </div>

        {/* Stitching Color row */}
        <div className="mini-filter-row" style={{ marginTop: '10px' }}>
          <span className="mini-filter-label" style={{ display: 'flex', alignItems: 'center' }}>
            Stitching Color
            <ColorInfoTooltip />
          </span>
          <div className="mini-filter-options" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {AVAILABLE_COLORS.map(c => (
              <Swatch key={`stitch-${c.name}`} color={c.hex} border={c.name === 'white'} active={selectedStitching === c.name} onClick={(e) => { e.stopPropagation(); setSelectedStitching(c.name); }} />
            ))}
          </div>
        </div>

        {/* Patterns row — selectable chips */}
        <div className="mini-filter-row" style={{ marginTop: '10px', alignItems: 'center' }}>
          <span className="mini-filter-label">Patterns</span>
          <div className="mini-filter-options" style={{ display: 'flex', gap: '6px', overflowX: 'auto', whiteSpace: 'nowrap', paddingBottom: '4px', scrollbarWidth: 'thin' }}>
            {AVAILABLE_PATTERNS.map(pattern => (
              <button
                type="button"
                key={pattern}
                onClick={(e) => { e.stopPropagation(); setSelectedPattern(pattern); }}
                style={{
                  flexShrink: 0,
                  padding: '4px 10px',
                  borderRadius: '999px',
                  border: '1.5px solid',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  borderColor: selectedPattern === pattern ? '#3b28cc' : '#d1d5db',
                  background: selectedPattern === pattern ? '#eef2ff' : '#fff',
                  color: selectedPattern === pattern ? '#3b28cc' : '#6b7280',
                }}
              >
                {pattern}
              </button>
            ))}
          </div>
        </div>

        {/* List Page Description */}
        {product.listDescription && (
          <div className="product-desc" onClick={onClickImage} title={product.listDescription} style={{ marginTop: '10px' }}>{product.listDescription}</div>
        )}
      </div>

      <div className="card-bottom" style={{ marginTop: '16px' }}>
        <div className="price-row">
          {product.originalPrice && <span className="original-price">${product.originalPrice.toFixed(2)}</span>}
          <span className="current-price">${product.price.toFixed(2)}</span>
        </div>
        <div className="action-row">
          {qty === 0 ? (
            <button className="btn-add-cart" onClick={(e) => { e.stopPropagation(); handleAddToCart(product, selectedColor, selectedStitching, selectedPattern); }}><CartIcon size={18} /> Add</button>
          ) : (
            <div className="qty-control">
              <button className="qty-btn" onClick={(e) => { e.stopPropagation(); handleUpdateQty(product, selectedColor, selectedStitching, selectedPattern, -1); }}>−</button>
              <span className="qty-input">{qty}</span>
              <button className="qty-btn" onClick={(e) => { e.stopPropagation(); handleUpdateQty(product, selectedColor, selectedStitching, selectedPattern, 1); }}>+</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductCard;