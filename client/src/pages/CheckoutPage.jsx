import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_BASE_URL } from '../config'; 
import { DesignOnShirt } from '../components/Apparel/DesignPreview';
import './CheckoutPage.css';
import DesignPreviewModal, { canPreviewDesign } from '../components/Apparel/DesignPreviewModal';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

const CheckoutPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const crmDiscount = location.state?.crmDiscount || null;
  const scheduledDiscount = location.state?.scheduledDiscount || null;
  const [cart, setCart] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('apple');
  const [saveCard, setSaveCard] = useState(true);
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);

  // Modal and Processing states
  const [showModal, setShowModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [loginStep, setLoginStep] = useState('identify'); // 'identify' | 'otp'
  const [loginId, setLoginId] = useState('');
  const [otp, setOtp] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const googleBtnRef = useRef(null);

  // Form State including User Creation fields (No Password)
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    addressType: 'Home',
    address: '',
    city: '',
    state: '',
    zip: '',
    cardNumber: '',
    expDate: '',
    cvv: '',
    cardName: '',
    billingAddress: '',
    billingCity: '',
    billingState: '',
    billingZip: ''
  });

  useEffect(() => {
    const savedCart = localStorage.getItem('seatcover_cart');
    if (savedCart) {
      try { setCart(JSON.parse(savedCart)); } catch (e) {}
    }
  }, []);

  // --- HYBRID CART CALCULATIONS ---
  const physicalItems = cart.filter(item => item.type !== 'M' && item.type !== 'L');
  const digitalItems = cart.filter(item => item.type === 'M' || item.type === 'L');

  // Overall count for header/modal
  const itemCount = cart.reduce((total, item) => total + item.qty, 0);

  // Physical Totals
  const physicalCount = physicalItems.reduce((total, item) => total + item.qty, 0);
  const physicalOriginalTotal = physicalItems.reduce((total, item) => total + ((item.originalPrice || item.price) * item.qty), 0);
  const physicalSubtotal = physicalItems.reduce((total, item) => total + (item.price * item.qty), 0);
  
  // Digital Totals
  const digitalSubtotal = digitalItems.reduce((total, item) => total + (item.price * item.qty), 0);

  const itemDiscount = physicalOriginalTotal - physicalSubtotal;
  const promoDiscount = promoApplied ? physicalSubtotal * 0.1 : 0;
  const crmDiscountAmount = crmDiscount?.amount || 0;
  const scheduledDiscountAmount = scheduledDiscount?.amount || 0;
  const discountedPhysicalSubtotal = physicalSubtotal - promoDiscount;

  // Tiered Shipping (Calculated ONLY on physical items)
  let shipping = 0;
  if (physicalCount === 1) shipping = 60;
  else if (physicalCount === 2) shipping = 80;
  else if (physicalCount === 3) shipping = 120;
  else if (physicalCount === 4) shipping = 150;
  else if (physicalCount === 5) shipping = 180;
  else if (physicalCount === 6) shipping = 190;
  else if (physicalCount === 7) shipping = 200;
  else if (physicalCount >= 8) shipping = physicalCount * 29;

  // Tax (Calculated ONLY on physical items)
  const TAX_RATE = 0.08;
  const tax = discountedPhysicalSubtotal * TAX_RATE;
  
  // Grand Total = Physical + Tax + Shipping + Digital - CRM Discounts
  const additionalDiscounts = crmDiscountAmount + scheduledDiscountAmount;
  const orderTotal = Math.max(0, discountedPhysicalSubtotal + tax + shipping + digitalSubtotal - additionalDiscounts);

  const handleApplyPromo = () => {
    if (promoCode.trim().toLowerCase() === 'save10') setPromoApplied(true);
  };

  // "S ×5, M ×3" size breakdown for custom apparel bundles.
  const apparelSizeSummary = (cfg) => {
    if (!cfg || !cfg.sizes) return '';
    return Object.entries(cfg.sizes)
      .filter(([, q]) => Number(q) > 0)
      .map(([s, q]) => `${s} ×${q}`)
      .join(', ');
  };

  // --- CARD FORMATTING HELPERS ---
  const formatCardNumber = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(.{4})/g, '$1 ').trim();
  };

  const formatExpDate = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) {
      return `${digits.slice(0, 2)} / ${digits.slice(2)}`;
    }
    return digits;
  };

  const formatCVV = (value) => value.replace(/\D/g, '').slice(0, 4);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    let formattedValue = value;

    if (name === 'cardNumber') {
      formattedValue = formatCardNumber(value);
    } else if (name === 'expDate') {
      formattedValue = formatExpDate(value);
    } else if (name === 'cvv') {
      formattedValue = formatCVV(value);
    }

    setFormData({ ...formData, [name]: formattedValue });
  };

   // ── LOGIN WITH EXISTING ACCOUNT ──
  const openLogin = () => { setLoginStep('identify'); setLoginId(''); setOtp(''); setLoginError(''); setShowLogin(true); };
  const closeLogin = () => setShowLogin(false);

  const applyUser = (u) => {
    setLoggedInUser(u);
    setFormData(f => ({
      ...f,
      firstName: u.firstName || f.firstName,
      lastName: u.lastName || f.lastName,
      email: u.email || f.email,
      phone: u.phone || f.phone,
      address: u.address || f.address,
      city: u.city || f.city,
      state: u.state || f.state,
      zip: u.zip || f.zip,
    }));
    setShowLogin(false);
  };

  const postAuth = async (path, body) => {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || 'Something went wrong. Please try again.');
    return data;
  };

  const handleSendOtp = async () => {
    const id = loginId.trim();
    if (!id) { setLoginError('Enter your email or phone number.'); return; }
    setLoginBusy(true); setLoginError('');
    try {
      await postAuth('/auth/send-otp', { identifier: id });
      setLoginStep('otp'); setOtp(''); setResendIn(30);
    } catch (e) { setLoginError(e.message); }
   finally { setLoginBusy(false); }
  };

  const handleVerifyOtp = async () => {
    if (otp.length < 4) { setLoginError('Enter the code we sent you.'); return; }
    setLoginBusy(true); setLoginError('');
    try {
      const data = await postAuth('/auth/verify-otp', { identifier: loginId.trim(), otp });
      applyUser(data.user);
    } catch (e) { setLoginError(e.message); }
    finally { setLoginBusy(false); }
  };

  const handleGoogleCredential = async (resp) => {
    setLoginBusy(true); setLoginError('');
    try {
      const data = await postAuth('/auth/google', { credential: resp.credential });
      applyUser(data.user);
    } catch (e) { setLoginError(e.message); }
    finally { setLoginBusy(false); }
  };

  // resend countdown
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // render Google's button inside the popup
  useEffect(() => {
    if (!showLogin || loginStep !== 'identify' || !GOOGLE_CLIENT_ID) return;
    const init = () => {
      if (!window.google?.accounts?.id || !googleBtnRef.current) return;
      window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleCredential });
      window.google.accounts.id.renderButton(googleBtnRef.current, { theme: 'outline', size: 'large', width: 300 });
    };
    if (window.google?.accounts?.id) { init(); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = init;
    document.head.appendChild(s);
  }, [showLogin, loginStep]); // eslint-disable-line react-hooks/exhaustive-deps

   // Validation before opening Modal

  // Validation before opening Modal
  const handlePayClick = () => {
    if (cart.length === 0) return;

    // Check mandatory Contact & Shipping fields
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.phone) {
      alert("Please fill in your Name, Email, and Phone number.");
      return;
    }

    // Only force shipping address if they are buying physical items
    if (physicalCount > 0 && (!formData.address || !formData.city || !formData.state || !formData.zip)) {
      alert("Please fill in all Shipping Address fields for your physical items.");
      return;
    }

    // Check mandatory Payment fields if paying by card
    if (paymentMethod === 'card') {
      if (!formData.cardNumber || !formData.expDate || !formData.cvv || !formData.cardName || !formData.billingAddress || !formData.billingCity || !formData.billingState || !formData.billingZip) {
        alert("Please fill in all credit card details.");
        return;
      }
    }

    setShowModal(true);
  };

  const handleConfirmPayment = async () => {
    setIsProcessing(true);
    
    try {
      const response = await fetch(`${API_BASE_URL}/orders/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cart: cart.map((it) => (it.apparel ? { ...it, apparel: { ...it.apparel, editState: undefined } } : it)),
          paymentMethod: paymentMethod,
          customerData: formData 
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        localStorage.removeItem('seatcover_cart');
        setCart([]);
        setShowModal(false);
        
        // Navigate directly to the new success page and pass the order ID via state
        navigate('/sales/crm/order-success', { 
          state: { 
            orderReference: result.orderId,
            autoLoginToken: result.autoLoginToken,
            hasPhysical: physicalCount > 0,
            hasDigital: digitalItems.length > 0
          } 
        }); 
      } else {
        alert(result.message || 'Checkout failed. Please try again.');
        setShowModal(false);
      }
    } catch (error) {
      console.error("Payment error:", error);
      alert('Network error. Please try again.');
      setShowModal(false);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="co-page">

      {/* ── MODAL ── */}
      {showModal && (
        <div className="co-modal-overlay">
          <div className="co-modal-box">
            <div className="co-modal-icon">
              <LockIcon size={32} />
            </div>
            <h2 className="co-modal-title">Confirm Payment</h2>
            <p className="co-modal-text">You are about to be charged for {itemCount} item(s). Do you want to proceed?</p>
            <span className="co-modal-amount">${orderTotal.toFixed(2)}</span>
            
            <div className="co-modal-actions">
              <button 
                className="co-btn-cancel" 
                onClick={() => setShowModal(false)}
                disabled={isProcessing}
              >
                Cancel
              </button>
              <button 
                className="co-btn-confirm" 
                onClick={handleConfirmPayment}
                disabled={isProcessing}
              >
                {isProcessing ? 'Processing...' : 'Confirm & Pay'}
              </button>
            </div>
          </div>
        </div>
      )}

      
            {/* ── LOGIN POPUP ── */}
      {showLogin && (
        <div className="co-modal-overlay" onClick={closeLogin}>
          <div className="co-modal-box" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', maxWidth: 400 }}>
            <h2 className="co-modal-title" style={{ textAlign: 'center' }}>Log in</h2>

            {loginStep === 'identify' ? (
              <>
                <p className="co-modal-text" style={{ textAlign: 'center' }}>Enter the email or phone number on your account and we'll send you a one-time code.</p>
                <input
                  type="text" className="co-input co-input-plain" placeholder="Email or phone number"
                  value={loginId} onChange={e => setLoginId(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendOtp()} autoFocus
                />
                <button className="co-btn-confirm" style={{ width: '100%', marginTop: 12 }} onClick={handleSendOtp} disabled={loginBusy}>
                  {loginBusy ? 'Sending…' : 'Send OTP'}
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0', color: '#94a3b8', fontSize: 12 }}>
                  <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} /> OR <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                </div>

                {GOOGLE_CLIENT_ID
                  ? <div ref={googleBtnRef} style={{ display: 'flex', justifyContent: 'center' }} />
                  : <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>Google login isn't configured yet.</p>}
              </>
            ) : (
              <>
                <p className="co-modal-text" style={{ textAlign: 'center' }}>Enter the code sent to <strong>{loginId}</strong>.</p>
                <input
                  type="tel" inputMode="numeric" maxLength={6} className="co-input co-input-plain"
                  placeholder="6-digit code" value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
                  style={{ letterSpacing: '0.3em', textAlign: 'center', fontSize: 18 }} autoFocus
                />
                <button className="co-btn-confirm" style={{ width: '100%', marginTop: 12 }} onClick={handleVerifyOtp} disabled={loginBusy}>
                  {loginBusy ? 'Verifying…' : 'Verify & Log in'}
                </button>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 13 }}>
                  <button type="button" onClick={() => { setLoginStep('identify'); setLoginError(''); }} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>← Change</button>
                  <button type="button" onClick={handleSendOtp} disabled={resendIn > 0 || loginBusy} style={{ background: 'none', border: 'none', color: resendIn > 0 ? '#94a3b8' : '#3b28cc', cursor: resendIn > 0 ? 'default' : 'pointer', fontWeight: 600 }}>
                    {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                  </button>
                </div>
              </>
            )}

            {loginError && <p style={{ color: '#dc2626', fontSize: 13, marginTop: 12, textAlign: 'center' }}>{loginError}</p>}
            <button type="button" className="co-btn-cancel" style={{ width: '100%', marginTop: 14 }} onClick={closeLogin}>Cancel</button>
          </div>
        </div>
      )}


      {/* ── HEADER ── */}
      <header className="co-header">
        <div className="co-brand" onClick={() => navigate('/sales/crm/seat-covers')}>
          <div className="co-brand-icon"><CartIcon size={20} /></div>
          <div>
            <p className="co-brand-name">SeatCover</p>
            <p className="co-brand-sub">Premium Seat Covers</p>
          </div>
        </div>
        <div className="co-secure"><LockIcon size={15} /><span>Secure Checkout</span></div>
        <div className="co-header-cart" onClick={() => navigate('/sales/crm/cart')}>
          <div className="co-cart-icon-wrap">
            <CartIcon size={22} />
            {itemCount > 0 && <span className="co-cart-badge">{itemCount}</span>}
          </div>
          <span className="co-cart-total">${orderTotal.toFixed(2)}</span>
        </div>
      </header>

      <div className="co-container">

        {/* ── STEPPER ── */}
        <div className="co-stepper">
          <div className="co-stepper-track">
            <div className="co-stepper-fill" style={{ width: '50%' }} />
          </div>
          <div className="co-step completed">
            <div className="co-step-circle"><CheckIcon size={14} /></div>
            <span className="co-step-label">Cart</span>
          </div>
          <div className="co-step active">
            <div className="co-step-circle">2</div>
            <span className="co-step-label">Checkout</span>
          </div>
          <div className="co-step">
            <div className="co-step-circle">3</div>
            <span className="co-step-label">Order Placed</span>
          </div>
        </div>

        <div className="co-page-title">
          <h1>Checkout</h1>
          <p>Review your items and complete your purchase</p>
        </div>

        <div className="co-layout">

          {/* ══ LEFT COLUMN ══ */}
          <div className="co-main">

            <div className="co-card">
              <div className="co-card-header">
                <h3>Your Items <span className="co-count-pill">{itemCount}</span></h3>
                <button className="co-edit-link" onClick={() => navigate('/sales/crm/cart')}>Edit Cart</button>
              </div>

              {/* HYBRID DIGITAL ITEMS BANNER */}
              {digitalItems.length > 0 && (
                <div style={{
                  background: '#f8fafc',
                  border: '1px solid #bfdbfe',
                  borderRadius: '12px',
                  padding: '16px',
                  margin: '0 20px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px'
                }}>
                  <span style={{ fontSize: '24px' }}>📋</span>
                  <div>
                    <div style={{ fontWeight: 700, color: '#1e40af', fontSize: '15px' }}>Memberships & Listings</div>
                    <div style={{ color: '#3b82f6', fontSize: '13px', marginTop: '2px' }}>
                      ${digitalSubtotal.toFixed(2)} will be added to your order total
                    </div>
                  </div>
                </div>
              )}

              {cart.length === 0 ? (
                <div className="co-empty">
                  <p>Your cart is empty.</p>
                  <button className="co-btn-outline" onClick={() => navigate('/sales/crm/seat-covers')}>Continue Shopping</button>
                </div>
              ) : (
                physicalItems.map(item => (
                  <div className="co-item" key={item.cartItemId || item.id}>
                    {item.isCustomApparel && item.apparel?.design && item.apparel?.area && (item.apparel.bgImage || item.image) ? (
                      <div className="co-item-img" style={{ height: 'auto', aspectRatio: 'auto', overflow: 'hidden', alignSelf: 'flex-start', background: '#f1f5f9' }}>
                        <DesignOnShirt
                          bgImage={item.apparel.bgImage || item.image}
                          area={item.apparel.area}
                          design={item.apparel.design}
                          logoSrc={item.apparel.logoUrl}
                        />
                      </div>
                    ) : (
                      <img
                        src={item.isCustomApparel ? ((item.apparel && item.apparel.logoUrl) || item.image || 'https://placehold.co/300x300/f3f4f6/9ca3af?text=Custom+Apparel') : item.image}
                        alt={item.name}
                        className="co-item-img"
                      />
                    )}
                    <div className="co-item-body">
                      <div className="co-item-top">
                        <div>
                          <p className="co-item-name">{item.name}</p>
                          {item.isCustomApparel ? (
                            <>
                              <p className="co-item-cat">Custom Apparel {item.totalPieces ? `· ${item.totalPieces} pcs` : ''}</p>
                              <div className="co-item-attrs">
                                {item.apparel && item.apparel.color && (
                                  <span style={{ textTransform: 'capitalize' }}><strong>Color:</strong> {item.apparel.color}</span>
                                )}
                                {item.apparel && item.apparel.decoration && (
                                  <span><strong>Decoration:</strong> {item.apparel.decoration} · {item.apparel.placement}</span>
                                )}
                                {apparelSizeSummary(item.apparel) && (
                                  <span><strong>Sizes:</strong> {apparelSizeSummary(item.apparel)}</span>
                                )}
                                {item.apparel && item.apparel.notes && (
                                  <span style={{ display: 'block', color: '#64748b' }}><strong>Notes:</strong> {item.apparel.notes}</span>
                                )}
                              </div>

                              {canPreviewDesign(item) && (
                                <button type="button" className="co-edit-link" style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setPreviewItem(item)}>
                                  <EyeIcon /> Preview design
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              <p className="co-item-cat">Premium Seat Cover · {item.selectedPattern || 'Standard'}</p>
                              <div className="co-item-attrs">
                                <span style={{ textTransform: 'capitalize' }}><strong>Color:</strong> {item.selectedColor || 'Standard'}</span>
                                <span><strong>Qty:</strong> {item.qty}</span>
                              </div>
                            </>
                          )}
                        </div>
                        <div className="co-item-price-block">
                          {!item.isCustomApparel && item.originalPrice && (
                            <span className="co-old-price">${(item.originalPrice * item.qty).toFixed(2)}</span>
                          )}
                          <span className="co-new-price">${(item.price * item.qty).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}

              {cart.length > 0 && (
                <button className="co-order-note">
                  <EditIcon /> Add order note (optional)
                </button>
              )}
            </div>

            {cart.length > 0 && <>

              {/* Contact Information */}
              <div className="co-card">
                <h3 className="co-section-title">Contact Information <span className="co-req">*</span></h3>
                {loggedInUser ? (
                  <p style={{ fontSize: '13px', color: '#166534', marginBottom: '16px' }}>
                    ✓ Logged in as <strong>{loggedInUser.email || loggedInUser.phone}</strong>{' '}
                    <button type="button" onClick={() => setLoggedInUser(null)} style={{ background: 'none', border: 'none', color: '#3b28cc', cursor: 'pointer', fontWeight: 600 }}>Not you?</button>
                  </p>
                ) : (
                  <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
                    We'll use this to send your order updates. Already have an account?{' '}
                    <button type="button" onClick={openLogin} style={{ background: 'none', border: 'none', padding: 0, color: '#3b28cc', cursor: 'pointer', fontWeight: 700, textDecoration: 'underline', fontSize: 'inherit' }}>
                      Log in with existing account
                    </button>
                  </p>
                )}
                <div className="co-form-row">
                  <div className="co-form-group">
                    <label className="co-label">First Name</label>
                    <input type="text" name="firstName" className="co-input co-input-plain" placeholder="First name" value={formData.firstName} onChange={handleInputChange} />
                  </div>
                  <div className="co-form-group">
                    <label className="co-label">Last Name</label>
                    <input type="text" name="lastName" className="co-input co-input-plain" placeholder="Last name" value={formData.lastName} onChange={handleInputChange} />
                  </div>
                </div>

                <div className="co-form-row">
                  <div className="co-form-group">
                    <label className="co-label">Email Address</label>
                    <div className="co-input-wrap">
                      <MailIcon className="co-input-icon" />
                      <input type="email" name="email" className="co-input" placeholder="Enter your email" value={formData.email} onChange={handleInputChange} />
                      {formData.email && <CheckCircleIcon className="co-check-icon" />}
                    </div>
                  </div>
                  <div className="co-form-group">
                    <label className="co-label">Phone Number</label>
                    <div className="co-input-wrap">
                      <PhoneIcon className="co-input-icon" />
                      <input type="tel" name="phone" className="co-input" placeholder="e.g. +1 234 567 8900" value={formData.phone} onChange={handleInputChange} />
                      {formData.phone && <CheckCircleIcon className="co-check-icon" />}
                    </div>
                  </div>
                </div>
              </div>

              {/* Shipping Address (Only show if there are physical items!) */}
              {physicalCount > 0 && (
                <div className="co-card">
                  <h3 className="co-section-title">Shipping Address <span className="co-req">*</span></h3>
                  <div className="co-form-group" style={{ marginBottom: 14 }}>
                    <label className="co-label">Address Type</label>
                    <div className="co-input-wrap">
                      <MapPinIcon className="co-input-icon" />
                      <select name="addressType" className="co-input co-select" value={formData.addressType} onChange={handleInputChange}>
                        <option value="Home">Home</option>
                        <option value="Work">Work</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="co-form-group" style={{ marginBottom: 14 }}>
                    <label className="co-label">Street Address <span className="co-req">*</span></label>
                    <div className="co-input-wrap">
                      <MapPinIcon className="co-input-icon" style={{ color: 'var(--co-primary)' }} />
                      <input type="text" name="address" className="co-input" placeholder="Enter street address" value={formData.address} onChange={handleInputChange} />
                      {formData.address && <CheckCircleIcon className="co-check-icon" />}
                    </div>
                  </div>
                  <div className="co-form-row">
                    <div className="co-form-group">
                      <label className="co-label">City <span className="co-req">*</span></label>
                      <input type="text" name="city" className="co-input co-input-plain" placeholder="City" value={formData.city} onChange={handleInputChange} />
                    </div>
                    <div className="co-form-group">
                      <label className="co-label">State <span className="co-req">*</span></label>
                      <input type="text" name="state" className="co-input co-input-plain" placeholder="State / Province" value={formData.state} onChange={handleInputChange} />
                    </div>
                    <div className="co-form-group">
                      <label className="co-label">ZIP Code <span className="co-req">*</span></label>
                      <input type="text" name="zip" className="co-input co-input-plain" placeholder="Postal Code" value={formData.zip} onChange={handleInputChange} />
                    </div>
                  </div>
                  <button className="co-add-line">+ Add apartment, suite, etc. (optional)</button>
                </div>
              )}

              {/* Payment Method */}
              <div className="co-card">
                <h3 className="co-section-title">Payment Method <span className="co-req">*</span></h3>

                {/* 1. Apple Pay */}
                <div
                  className={`co-pay-option ${paymentMethod === 'apple' ? 'selected' : ''}`}
                  onClick={() => setPaymentMethod('apple')}
                >
                  <label className="co-radio-label">
                    <input type="radio" name="payment" checked={paymentMethod === 'apple'} onChange={() => setPaymentMethod('apple')} />
                    Apple Pay
                  </label>
                  <span className="co-pay-brand apple">Pay</span>
                </div>

                {/* 2. PayPal */}
                <div
                  className={`co-pay-option ${paymentMethod === 'paypal' ? 'selected' : ''}`}
                  onClick={() => setPaymentMethod('paypal')}
                >
                  <label className="co-radio-label">
                    <input type="radio" name="payment" checked={paymentMethod === 'paypal'} onChange={() => setPaymentMethod('paypal')} />
                    PayPal
                  </label>
                  <span className="co-pay-brand paypal">PayPal</span>
                </div>

                {/* 3. Credit / Debit Card */}
                <div
                  className={`co-pay-option ${paymentMethod === 'card' ? 'selected' : ''}`}
                  onClick={() => setPaymentMethod('card')}
                >
                  <div className="co-pay-option-header">
                    <label className="co-radio-label">
                      <input type="radio" name="payment" checked={paymentMethod === 'card'} onChange={() => setPaymentMethod('card')} />
                      Credit / Debit Card
                    </label>
                    <div className="co-card-logos">
                      <img src="https://upload.wikimedia.org/wikipedia/commons/4/41/Visa_Logo.png" alt="Visa" />
                      <img src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg" alt="Mastercard" />
                      <img src="https://upload.wikimedia.org/wikipedia/commons/f/fa/American_Express_logo_%282018%29.svg" alt="Amex" />
                    </div>
                  </div>

                  {paymentMethod === 'card' && (
                    <div className="co-card-fields" onClick={e => e.stopPropagation()}>
                      <div className="co-form-group">
                        <label className="co-label">Card Number <span className="co-req">*</span></label>
                        <div className="co-input-wrap">
                          <input
                            type="tel"
                            name="cardNumber"
                            className="co-input"
                            placeholder="0000 0000 0000 0000"
                            value={formData.cardNumber}
                            onChange={handleInputChange}
                            maxLength="19"
                            inputMode="numeric"
                            pattern="[0-9\s]*"
                            autoComplete="cc-number"
                          />
                          <CreditCardIcon className="co-input-icon co-icon-right" />
                        </div>
                      </div>
                      <div className="co-form-row">
                        <div className="co-form-group">
                          <label className="co-label">Expiry Date <span className="co-req">*</span></label>
                          <input
                            type="tel"
                            name="expDate"
                            className="co-input co-input-plain"
                            placeholder="MM / YY"
                            value={formData.expDate}
                            onChange={handleInputChange}
                            maxLength="7"
                            inputMode="numeric"
                            pattern="[0-9\s/]*"
                            autoComplete="cc-exp"
                          />
                        </div>
                        <div className="co-form-group">
                          <label className="co-label">CVV <span className="co-req">*</span></label>
                          <div className="co-input-wrap">
                            <input
                              type="tel"
                              name="cvv"
                              className="co-input"
                              placeholder="123"
                              value={formData.cvv}
                              onChange={handleInputChange}
                              maxLength="4"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              autoComplete="cc-csc"
                            />
                            <HelpIcon className="co-input-icon co-icon-right" />
                          </div>
                        </div>
                        <div className="co-form-group">
                          <label className="co-label">Cardholder Name <span className="co-req">*</span></label>
                          <input type="text" name="cardName" className="co-input co-input-plain" placeholder="Name on card" value={formData.cardName} onChange={handleInputChange} autoComplete="cc-name" />
                        </div>
                      </div>
                      <h4 style={{fontSize: '13px', margin: '15px 0 10px'}}>Billing Address</h4>
                      <div className="co-form-group" style={{marginBottom: '10px'}}>
                        <input
                          type="text"
                          name="billingAddress"
                          className="co-input co-input-plain"
                          placeholder="Street address"
                          value={formData.billingAddress}
                          onChange={handleInputChange}
                          autoComplete="billing address-line1"
                        />
                      </div>
                      <div className="co-form-row">
                        <div className="co-form-group">
                          <input
                            type="text"
                            name="billingCity"
                            className="co-input co-input-plain"
                            placeholder="City"
                            value={formData.billingCity}
                            onChange={handleInputChange}
                            autoComplete="billing address-level2"
                          />
                        </div>
                        <div className="co-form-group">
                          <input
                            type="text"
                            name="billingState"
                            className="co-input co-input-plain"
                            placeholder="State / Province"
                            value={formData.billingState}
                            onChange={handleInputChange}
                            autoComplete="billing address-level1"
                          />
                        </div>
                        <div className="co-form-group">
                          <input
                            type="text"
                            name="billingZip"
                            className="co-input co-input-plain"
                            placeholder="Postal code"
                            value={formData.billingZip}
                            onChange={handleInputChange}
                            maxLength="10"
                            autoComplete="billing postal-code"
                          />
                        </div>
                      </div>
                      <label className="co-save-card">
                        <input type="checkbox" checked={saveCard} onChange={e => setSaveCard(e.target.checked)} />
                        Save this card for future purchases
                      </label>
                    </div>
                  )}
                </div>

              </div>

            </>}
          </div>

          {/* ══ RIGHT COLUMN ══ */}
          <div className="co-sidebar">

            <div className="co-card">
              <h3 className="co-summary-title">Order Summary</h3>

              <div className="co-summary-rows">
                {physicalCount > 0 && (
                  <div className="co-srow">
                    <span>Physical Items ({physicalCount})</span>
                    <span>${physicalOriginalTotal.toFixed(2)}</span>
                  </div>
                )}
                {itemDiscount > 0 && (
                  <div className="co-srow co-srow--green">
                    <span>Item Discount</span>
                    <span>−${itemDiscount.toFixed(2)}</span>
                  </div>
                )}
                {promoApplied && (
                  <div className="co-srow co-srow--green">
                    <span>Promo (SAVE10)</span>
                    <span>−${promoDiscount.toFixed(2)}</span>
                  </div>
                )}
                {crmDiscountAmount > 0 && (
                  <div className="co-srow co-srow--green">
                    <span>📋 {crmDiscount?.label || 'CRM Discount'}</span>
                    <span>−${crmDiscountAmount.toFixed(2)}</span>
                  </div>
                )}
                {scheduledDiscountAmount > 0 && (
                  <div className="co-srow co-srow--green">
                    <span>📅 {scheduledDiscount?.label || 'Scheduled Discount'}</span>
                    <span>−${scheduledDiscountAmount.toFixed(2)}</span>
                  </div>
                )}
                {physicalCount > 0 && (
                  <div className="co-srow co-srow--muted">
                    <span>Shipping</span>
                    {shipping === 0 ? (
                      <span className="co-free-tag">FREE</span>
                    ) : (
                      <span>${shipping.toFixed(2)}</span>
                    )}
                  </div>
                )}
                {physicalCount > 0 && (
                  <div className="co-srow co-srow--muted">
                    <span>Estimated Tax (8%)</span>
                    <span>${tax.toFixed(2)}</span>
                  </div>
                )}
                {digitalSubtotal > 0 && (
                  <div className="co-srow" style={{ color: '#1e40af', fontWeight: 600, borderTop: '1px dashed #e2e8f0', paddingTop: '10px', marginTop: '6px' }}>
                    <span>Memberships & Listings</span>
                    <span>${digitalSubtotal.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {(itemDiscount > 0 || promoApplied || crmDiscountAmount > 0 || scheduledDiscountAmount > 0) && (
                <div className="co-savings-banner">
                  <TagIcon />
                  <span>You're saving <strong>${(itemDiscount + promoDiscount + crmDiscountAmount + scheduledDiscountAmount).toFixed(2)}</strong> on this order!</span>
                </div>
              )}

              <div className="co-total-row">
                <div>
                  <p className="co-total-label">Total</p>
                  <p className="co-total-note">Incl. all taxes & fees</p>
                </div>
                <span className="co-total-amount">${orderTotal.toFixed(2)}</span>
              </div>

              <button
                className="co-btn-pay"
                onClick={handlePayClick}
                disabled={cart.length === 0}
              >
                <LockIcon size={18} /> Pay ${orderTotal.toFixed(2)}
              </button>

              <p className="co-secure-note"><LockIcon size={13} /> Secured with SSL encryption</p>
            </div>

            <div className="co-card co-promo-card">
              <h4 className="co-promo-title">Have a promo code?</h4>
              {promoApplied ? (
                <div className="co-promo-success">
                  <CheckIcon size={16} /> Code <strong>SAVE10</strong> applied — 10% off!
                  <button onClick={() => { setPromoApplied(false); setPromoCode(''); }}>Remove</button>
                </div>
              ) : (
                <div className="co-promo-row">
                  <input
                    type="text"
                    className="co-promo-input"
                    placeholder='Try "SAVE10"'
                    value={promoCode}
                    onChange={e => setPromoCode(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleApplyPromo()}
                  />
                  <button className="co-btn-outline" onClick={handleApplyPromo}>Apply</button>
                </div>
              )}
            </div>

            <div className="co-guarantee">
              <ShieldCheckIcon />
              <div>
                <p className="co-guarantee-title">30-Day Money Back Guarantee</p>
                <p className="co-guarantee-sub">No questions asked returns on all orders</p>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── BOTTOM BAR ── */}
      <div className="co-bottom-bar">
        <button className="co-btn-back" onClick={() => navigate('/sales/crm/cart')}>
          <ArrowLeftIcon /> <span>Back to Cart</span>
        </button>
        <div className="co-bottom-guarantee">
          <ShieldIcon size={18} /> <span>30-Day Money Back Guarantee</span>
        </div>
        
        <button
          className="co-btn-pay-bar"
          onClick={handlePayClick}
          disabled={cart.length === 0}
        >
          <LockIcon size={16} /> Pay ${orderTotal.toFixed(2)}
        </button>
      </div>

      <DesignPreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />

    </div>
  );
};

/* ── ICONS ── */
const CartIcon = ({ size = 24 }) => (<svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.2 9.3a1 1 0 001 1.2h13.4a1 1 0 00.9-1.2L17 13M9 21h.01M15 21h.01" /></svg>);
const LockIcon = ({ size = 18 }) => (<svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>);
const CheckIcon = ({ size = 14 }) => (<svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></svg>);
const EditIcon = () => (<svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>);
const MailIcon = ({ className }) => (<svg className={className} width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>);
const PhoneIcon = ({ className }) => (<svg className={className} width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" /></svg>);
const MapPinIcon = ({ className, style }) => (<svg className={className} style={style} width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>);
const CheckCircleIcon = ({ className }) => (<svg className={className} width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3" /></svg>);
const CreditCardIcon = ({ className }) => (<svg className={className} width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>);
const HelpIcon = ({ className }) => (<svg className={className} width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" /></svg>);
const TagIcon = () => (<svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0 }}><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>);
const ShieldIcon = ({ size = 24 }) => (<svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>);
const ShieldCheckIcon = () => (<svg width="32" height="32" fill="none" stroke="var(--co-primary)" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></svg>);
const ArrowLeftIcon = () => (<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>);
const EyeIcon = ({ size = 16 }) => (
  <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
  </svg>
);

export default CheckoutPage;