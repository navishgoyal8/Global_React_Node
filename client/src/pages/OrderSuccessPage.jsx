import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './CheckoutPage.css'; 
// import { API_BASE_URL } from '../config';

const OrderSuccessPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Grab data passed from the checkout redirect
  const orderReference = location.state?.orderReference || 'ORD-UNKNOWN';
  const autoLoginToken = location.state?.autoLoginToken || '';
  
  // Grab the flags passed from CheckoutPage to determine cart contents
  const hasPhysical = location.state?.hasPhysical ?? true; 
  const hasDigital = location.state?.hasDigital ?? false;

  const isHybrid = hasPhysical && hasDigital;
  
  const [showHybridModal, setShowHybridModal] = useState(isHybrid);

  const seatCoversUrl = autoLoginToken 
    ? `https://developer.globallimos.com/sales/orders/all?token=${autoLoginToken}`
    : `https://developer.globallimos.com/sales/orders/all`;
    
  const membershipsUrl = autoLoginToken
    ? `https://developer.globallimos.com/sales/users/myPurchaseHistory?token=${autoLoginToken}`
    : `https://developer.globallimos.com/sales/users/myPurchaseHistory`;

  // Auto-redirect logic
  useEffect(() => {
    // If it's a hybrid cart, DO NOT auto-redirect. Wait for user selection.
    if (isHybrid) return;

    const timer = setTimeout(() => {
      if (hasDigital && !hasPhysical) {
        window.location.href = membershipsUrl;
      } else {
        window.location.href = seatCoversUrl;
      }
    }, 4000);

    return () => clearTimeout(timer);
  }, [isHybrid, hasPhysical, hasDigital, seatCoversUrl, membershipsUrl]);

  // Handle manual modal clicks
  const handleRedirect = (type) => {
    if (type === 'digital') {
      window.location.href = membershipsUrl;
    } else {
      window.location.href = seatCoversUrl;
    }
  };

  return (
    <div className="co-page">

      {/* ── HYBRID SELECTION MODAL ── */}
      {showHybridModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#fff', padding: '32px 24px', borderRadius: '24px', width: '100%', maxWidth: '420px', textAlign: 'center', position: 'relative', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
            
            {/* Close Button */}
            <button 
              onClick={() => setShowHybridModal(false)}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', fontSize: '20px', color: '#9ca3af', cursor: 'pointer' }}
            >
              ✕
            </button>

            {/* Header Icon */}
            <div style={{ position: 'relative', width: '64px', height: '64px', background: '#f5f3ff', borderRadius: '50%', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c3aed' }}>
              <CartIcon size={30} />
              <div style={{ position: 'absolute', top: '-4px', right: '-8px', background: '#7c3aed', color: '#fff', fontSize: '14px', fontWeight: 800, width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>
                ?
              </div>
            </div>

            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#111827', margin: '0 0 6px' }}>How would you like to proceed?</h2>
            <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 24px' }}>Choose an option to continue.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              
              {/* Option 1: Listings / Memberships */}
              <div 
                onClick={() => handleRedirect('digital')}
                style={{ display: 'flex', alignItems: 'center', padding: '16px', border: '1.5px solid #f3f4f6', borderRadius: '16px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}
                onMouseOver={e => { e.currentTarget.style.borderColor = '#7c3aed'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(124, 58, 237, 0.1)'; }}
                onMouseOut={e => { e.currentTarget.style.borderColor = '#f3f4f6'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.02)'; }}
              >
                <div style={{ width: '48px', height: '48px', background: '#f5f3ff', color: '#7c3aed', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: '16px' }}>
                  <CarIcon size={24} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#111827' }}>List Vehicle</div>
                  <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '3px', lineHeight: 1.4 }}>List your vehicle now and get more visibility.</div>
                </div>
                <div style={{ color: '#9ca3af', marginLeft: '10px' }}><ChevronRightIcon size={20} /></div>
              </div>

              {/* Option 2: Seat Covers */}
              <div 
                onClick={() => handleRedirect('physical')}
                style={{ display: 'flex', alignItems: 'center', padding: '16px', border: '1.5px solid #f3f4f6', borderRadius: '16px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}
                onMouseOver={e => { e.currentTarget.style.borderColor = '#4f46e5'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(79, 70, 229, 0.1)'; }}
                onMouseOut={e => { e.currentTarget.style.borderColor = '#f3f4f6'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.02)'; }}
              >
                <div style={{ width: '48px', height: '48px', background: '#eef2ff', color: '#4f46e5', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: '16px' }}>
                  <SeatIcon size={24} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#111827' }}>Check out seat cover order</div>
                  <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '3px', lineHeight: 1.4 }}>Proceed to checkout for your seat cover order.</div>
                </div>
                <div style={{ color: '#9ca3af', marginLeft: '10px' }}><ChevronRightIcon size={20} /></div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ── STANDARD SUCCESS BACKGROUND UI ── */}
      <header className="co-header">
        <div className="co-brand" onClick={() => navigate('/sales/crm/seat-covers')} style={{ cursor: 'pointer' }}>
          <div className="co-brand-icon"><CartIcon size={20} /></div>
          <div>
            <p className="co-brand-name">SeatCover</p>
            <p className="co-brand-sub">Premium Seat Covers</p>
          </div>
        </div>
      </header>

      <div className="co-container">
        {/* Stepper showing Step 3 active */}
        <div className="co-stepper" style={{marginBottom: '40px'}}>
          <div className="co-stepper-track"><div className="co-stepper-fill" style={{ width: '100%' }} /></div>
          <div className="co-step completed"><div className="co-step-circle"><CheckIcon size={14} /></div><span className="co-step-label">Cart</span></div>
          <div className="co-step completed"><div className="co-step-circle"><CheckIcon size={14} /></div><span className="co-step-label">Checkout</span></div>
          <div className="co-step active"><div className="co-step-circle">3</div><span className="co-step-label">Order Placed</span></div>
        </div>

        <div className="co-card" style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center', padding: '60px 40px' }}>
          <div style={{ width: '70px', height: '70px', background: '#dcfce7', color: '#16a34a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <CheckIcon size={40} />
          </div>
          <h1 style={{ fontSize: '28px', color: '#0f172a', marginBottom: '12px' }}>Thank you for your order!</h1>
          <p style={{ fontSize: '16px', color: '#64748b', marginBottom: '24px' }}>
            Your account has been linked, and your order <strong>{orderReference}</strong> has been successfully placed.
          </p>
          
          {/* Only show the loading spinner if we are auto-redirecting */}
          {!showHybridModal && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontSize: '14px', color: '#475569', background: '#f8fafc', padding: '16px', borderRadius: '8px' }}>
              <span className="spinner-loader" style={{width: '20px', height: '20px', border: '3px solid #cbd5e1', borderTopColor: '#3b28cc', borderRadius: '50%', animation: 'spin 1s linear infinite'}}></span>
              Redirecting to your Order Dashboard...
            </div>
          )}
          
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    </div>
  );
};

/* ── ICONS ── */
const CartIcon = ({ size = 24 }) => (<svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.2 9.3a1 1 0 001 1.2h13.4a1 1 0 00.9-1.2L17 13M9 21h.01M15 21h.01" /></svg>);
const CheckIcon = ({ size = 14 }) => (<svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></svg>);
const CarIcon = ({ size = 24 }) => (<svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 16H9m10 0h3v-3.15a1 1 0 00-.84-.99L16 11l-2.7-3.6a2 2 0 00-1.6-.8H8.3a2 2 0 00-1.6.8L4 11l-5.16.86a1 1 0 00-.84.99V16h3m10 0a2 2 0 10-4 0m4 0a2 2 0 11-4 0m-6 0a2 2 0 10-4 0m4 0a2 2 0 11-4 0" /></svg>);
const SeatIcon = ({ size = 24 }) => (<svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M4 18v3m16-3v3M4 11h16v7H4v-7zM6 11V5a2 2 0 012-2h8a2 2 0 012 2v6" /></svg>);
const ChevronRightIcon = ({ size = 24 }) => (<svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg>);

export default OrderSuccessPage;