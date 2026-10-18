import React from 'react';
import { XIcon, HeartIcon } from './Icons';

const WishlistDrawer = ({ isOpen, onClose, wishlistItems, toggleWishlist, goToProduct }) => {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop with a subtle blur effect */}
      <div 
        style={{ 
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', 
          background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(2px)', 
          zIndex: 9998, animation: 'fadeIn 0.2s ease-out' 
        }} 
        onClick={onClose} 
      />
      
      {/* Drawer Container - Responsive width */}
      <div style={{ 
        position: 'fixed', top: 0, right: 0, width: '100%', maxWidth: '420px', 
        height: '100vh', background: '#ffffff', zIndex: 9999, display: 'flex', 
        flexDirection: 'column', boxShadow: '-10px 0 25px rgba(0,0,0,0.05)', 
        animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)' 
      }}>
        
        {/* Header */}
        <div style={{ 
          padding: '20px 24px', borderBottom: '1px solid #e2e8f0', 
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#f8fafc'
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <HeartIcon filled={true} style={{ color: '#ef4444' }} /> Your Wishlist ({wishlistItems.length})
          </h2>
          <button 
            onClick={onClose} 
            style={{ 
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: '50%', 
              width: '34px', height: '34px', display: 'flex', alignItems: 'center', 
              justifyContent: 'center', cursor: 'pointer', color: '#64748b', transition: 'all 0.2s' 
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#0f172a'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#64748b'; }}
          >
            <XIcon size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {wishlistItems.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', marginTop: '60px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '50%', marginBottom: '16px' }}>
                <HeartIcon filled={false} size={48} />
              </div>
              <h3 style={{ fontSize: '18px', color: '#1e293b', margin: '0 0 8px 0', fontWeight: '600' }}>Your wishlist is empty</h3>
              <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.6' }}>Save your favorite seat covers here to review them later.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {wishlistItems.map(item => (
                <div key={item.id} style={{ 
                  display: 'flex', gap: '16px', padding: '16px', 
                  background: '#fff', border: '1px solid #e2e8f0', 
                  borderRadius: '12px', transition: 'box-shadow 0.2s, border-color 0.2s',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                }}
                onMouseOver={(e) => { e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.06)'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
                onMouseOut={(e) => { e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                >
                  {/* Image */}
                  <div 
                    style={{ width: '88px', height: '88px', flexShrink: 0, borderRadius: '8px', overflow: 'hidden', border: '1px solid #f1f5f9', cursor: 'pointer', background: '#f8fafc' }}
                    onClick={() => { goToProduct(item.id); onClose(); }}
                  >
                    <img 
                      src={item.image} 
                      alt={item.name} 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                      onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/150x150/f3f4f6/9ca3af?text=No+Img'; }}
                    />
                  </div>
                  
                  {/* Item Details */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <h4 
                        style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: '600', color: '#0f172a', cursor: 'pointer', lineHeight: '1.3' }} 
                        onClick={() => { goToProduct(item.id); onClose(); }}
                      >
                        {item.name}
                      </h4>
                      <p style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '700', color: '#3b28cc' }}>
                        ${item.price.toFixed(2)}
                      </p>
                    </div>
                    
                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button 
                        onClick={() => { goToProduct(item.id); onClose(); }} 
                        style={{ 
                          flex: 1, padding: '8px 12px', background: '#3b28cc', color: '#fff', 
                          border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', 
                          cursor: 'pointer', transition: 'background 0.2s', textAlign: 'center', whiteSpace: 'nowrap'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = '#2c1e9e'}
                        onMouseOut={(e) => e.currentTarget.style.background = '#3b28cc'}
                      >
                        View Details
                      </button>
                      <button 
                        onClick={() => toggleWishlist(item.id)} 
                        style={{ 
                          padding: '8px 14px', background: '#fef2f2', color: '#ef4444', 
                          border: '1px solid #fecaca', borderRadius: '6px', fontSize: '13px', fontWeight: '600',
                          cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center'
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.borderColor = '#f87171'; }}
                        onMouseOut={(e) => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.borderColor = '#fecaca'; }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Sticky Bottom Footer */}
        {wishlistItems.length > 0 && (
          <div style={{ padding: '20px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <button 
              onClick={onClose} 
              style={{ 
                width: '100%', padding: '14px', background: '#fff', color: '#0f172a', 
                border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', fontWeight: '600', 
                cursor: 'pointer', transition: 'background 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.background = '#f1f5f9'}
              onMouseOut={(e) => e.currentTarget.style.background = '#fff'}
            >
              Continue Shopping
            </button>
          </div>
        )}
      </div>

      {/* Embedded CSS Animations */}
      <style>{`
        @keyframes slideIn { 
          from { transform: translateX(100%); opacity: 0; } 
          to { transform: translateX(0); opacity: 1; } 
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </>
  );
};

export default WishlistDrawer;