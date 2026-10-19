import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './CartPage.css';
import { API_BASE_URL } from '../config';
import {DesignOnShirt} from '../components/Apparel/DesignPreview.jsx';
import DesignPreviewModal, { canPreviewDesign } from '../components/Apparel/DesignPreviewModal';
import QuantityDrawer from '../components/Apparel/QuantityDrawer.jsx';

const CartPage = () => {
  const navigate = useNavigate();

  const [cart, setCart] = useState(() => {
    try {
      const savedCart = localStorage.getItem('seatcover_cart');
      return savedCart ? JSON.parse(savedCart) : [];
    } catch (error) {
      console.error("Failed to parse cart data", error);
      return [];
    }
  });

  // Read extraCharge from sessionStorage (set when coming from CRM payment link)
  const [extraCharge, setExtraCharge] = useState(() => {
    try {
      const raw = sessionStorage.getItem('crm_extra_charge');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  const [crmDiscount, setCrmDiscount] = useState(() => {
    try {
      const raw = sessionStorage.getItem('crm_discount');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  const [scheduledDiscount, setScheduledDiscount] = useState(() => {
    try {
      const raw = sessionStorage.getItem('crm_scheduled_discount');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  const [offerExpiry, setOfferExpiry] = useState(() => {
    try {
      return sessionStorage.getItem('crm_offer_expiry') || null;
    } catch { return null; }
  });
  const [qtyEditId, setQtyEditId] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(null);

    // TODO: change to your real editor route
  const apparelEditorRoute = (productId) => `/sales/crm/apparel/editor/${productId}`;

  const handleEditApparel = (item) => {
    const a = item.apparel || {};
    if (!a.editState) {
      alert('This item was added before editing was available. Please delete it and add it again.');
      return;
    }
    navigate(apparelEditorRoute(a.productId), {
      state: {
        ...a.editState,
        savedLogo: { url: a.logoUrl },
        savedDesign: a.design,
        editingCartItemId: item.cartItemId,
        initialSizes: a.sizes,
      },
    });
  };

    const handleSaveApparelQty = (cartItemId, { sizes, total, each, lineTotal, base }) => {
    setCart((prev) => prev.map((it) =>
      it.cartItemId === cartItemId
        ? {
            ...it,
            price: lineTotal,
            originalPrice: Math.round(base * total * 100) / 100,
            totalPieces: total,
            apparel: { ...it.apparel, sizes, unitPrice: each },
          }
        : it
    ));
    setQtyEditId(null);
  };

  // On mount: check for crm_data param and pre-fill cart
  // On mount: check for invoiceId param and fetch cart from the server
// ── HELPER FUNCTIONS TO PREVENT NaN ERRORS ──
  const cleanPrice = (val) => {
    if (!val) return 0;
    const parsed = parseFloat(String(val).replace(/[^0-9.]/g, ''));
    return isNaN(parsed) ? 0 : parsed;
  };

  const cleanQty = (val) => {
    if (!val) return 1;
    const parsed = parseInt(String(val).replace(/[^0-9]/g, ''), 10);
    return isNaN(parsed) ? 1 : Math.max(1, parsed);
  };

  const formatCountdown = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const parseLegacySpecs = (specsStr) => {
    let color = null;
    let pattern = null;
    if (specsStr && specsStr !== '-') {
      const parts = specsStr.split('•');
      parts.forEach(part => {
        if (part.includes('Color:')) {
          const val = part.split('Color:')[1].trim().toLowerCase();
          if (['1','black'].includes(val)) color = 'black';
          else if (['2','white'].includes(val)) color = 'white';
          else if (['3','orange'].includes(val)) color = 'orange';
          else if (['4','yellow'].includes(val)) color = 'yellow';
          else if (['5','red'].includes(val)) color = 'red';
          else if (['6','blue'].includes(val)) color = 'blue';
          else color = val;
        }
        if (part.includes('Pattern:')) {
          const val = part.split('Pattern:')[1].trim().toLowerCase();
          if (['1','hexagon'].includes(val)) pattern = 'Hexagon';
          else if (['2','diamond'].includes(val)) pattern = 'Diamond';
          else if (['3','chevron'].includes(val)) pattern = 'Chevron';
          else if (['4','leaf'].includes(val)) pattern = 'Leaf';
          else if (['5','custom'].includes(val)) pattern = 'Custom';
          else pattern = val.charAt(0).toUpperCase() + val.slice(1);
        }
      });
    }
    return { color, pattern };
  };

  // On mount: check for invoiceId param and fetch cart from the server
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invoiceId = params.get('invoiceId');
    if (!invoiceId) return;

    fetch(`${API_BASE_URL}/invoices/details/${invoiceId}`)
      .then(res => res.json())
      .then(data => {
        if (!data.success || !data.invoice) return;
        const inv = data.invoice;

        let parsedItems = [];
        try {
          parsedItems = inv.items_json ? JSON.parse(inv.items_json) : [];
        } catch (e) {
          console.error('Failed to parse invoice items', e);
          return;
        }

        const normalizedItems = parsedItems.map(item => {
          // Fallback parsing just in case attributes were saved as strings
          const legacy = parseLegacySpecs(item.covers || item.description || item.specs);
          
          return {
            id: item.id,
            cartItemId: item.id,
            name: item.name || 'Unknown Item',
            
            // ✅ SANITIZED MATH VALUES: No more NaN crashes!
            price: cleanPrice(item.price),
            originalPrice: cleanPrice(item.originalPrice || item.price),
            qty: cleanQty(item.quantity || item.qty),
            
            type: item.type || 'P',
            image: item.img || item.image || '',
            
            // ✅ ROBUST ATTRIBUTES: Checks new format, old format, and legacy strings
            leatherColor: item.leatherColor || item.selectedColor || legacy.color || '',
            stitchColor: item.stitchColor || item.selectedStitching || legacy.color || '', 
            pattern: item.pattern || item.selectedPattern || legacy.pattern || '',
            
            covers: item.covers || '-',
            description: item.description || '',
            location: item.location || '-',
          };
        });

        if (normalizedItems.length > 0) setCart(normalizedItems);

        const discAmt = parseFloat(inv.discount_amount);
        if (discAmt > 0) {
          const disc = {
            amount: discAmt,
            label: inv.discount_type === 'percent' ? 'Discount' : 'Discount',
          };
          sessionStorage.setItem('crm_discount', JSON.stringify(disc));
          setCrmDiscount(disc);
        }

        // Read cumulative scheduled discount and offer expiry from discount_details
        let cumulativeScheduledDiscount = 0;
        let loadedOfferExpiry = null;
        if (inv.discount_details) {
          try {
            const dd = JSON.parse(inv.discount_details);
            cumulativeScheduledDiscount = Number(dd.cumulativeScheduledDiscount) || 0;
            loadedOfferExpiry = dd.offerExpiry || null;
          } catch (e) {}
        }
        if (cumulativeScheduledDiscount > 0) {
          const sd = { amount: cumulativeScheduledDiscount, label: 'Scheduled Discount' };
          sessionStorage.setItem('crm_scheduled_discount', JSON.stringify(sd));
          setScheduledDiscount(sd);
        }
        if (loadedOfferExpiry) {
          sessionStorage.setItem('crm_offer_expiry', loadedOfferExpiry);
          setOfferExpiry(loadedOfferExpiry);
        }

        sessionStorage.setItem('crm_invoice_id', invoiceId);

        // Clean the URL so refreshing doesn't re-fetch unnecessarily
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
      })
      .catch(err => console.error('Failed to load invoice for cart', err));
  }, []);
  useEffect(() => {
    localStorage.setItem('seatcover_cart', JSON.stringify(cart));
  }, [cart]);

  const isOfferExpired = !timeRemaining && offerExpiry !== null && new Date(offerExpiry) <= new Date();

  useEffect(() => {
    if (!offerExpiry) return;
    const check = () => {
      const remaining = new Date(offerExpiry) - new Date();
      if (remaining <= 0) {
        setTimeRemaining(null);
        setScheduledDiscount(null);
        sessionStorage.removeItem('crm_scheduled_discount');
      } else {
        setTimeRemaining(remaining);
      }
    };
    check();
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, [offerExpiry]);

  const handleUpdateQty = (cartItemId, delta) => {
    setCart(prevCart => {
      const existingProduct = prevCart.find(item => item.cartItemId === cartItemId || item.id === cartItemId);
      if (!existingProduct) return prevCart;

      const newQty = existingProduct.qty + delta;

      if (newQty <= 0) {
        return prevCart.filter(item => item.cartItemId !== cartItemId && item.id !== cartItemId);
      } else {
        return prevCart.map(item =>
          (item.cartItemId === cartItemId || item.id === cartItemId) ? { ...item, qty: newQty } : item
        );
      }
    });
  };

  const handleRemoveItem = (cartItemId) => {
    setCart(prevCart => prevCart.filter(item => item.cartItemId !== cartItemId && item.id !== cartItemId));
  };

// --- HYBRID CART CALCULATIONS ---

  const physicalItems = cart.filter(item => item.type !== 'M' && item.type !== 'L');
  const digitalItems = cart.filter(item => item.type === 'M' || item.type === 'L');

  const physicalCount = physicalItems.reduce((total, item) => total + item.qty, 0);
  const physicalTotal = physicalItems.reduce((total, item) => total + (item.price * item.qty), 0);
  const physicalOriginalTotal = physicalItems.reduce((total, item) => total + ((item.originalPrice || item.price) * item.qty), 0);
  const itemLevelDiscount = physicalOriginalTotal - physicalTotal;

  const digitalTotal = digitalItems.reduce((total, item) => total + (item.price * item.qty), 0);
  const totalItemCount = cart.reduce((sum, item) => sum + item.qty, 0);

  let shipping = 0;
  if (physicalCount === 1) shipping = 60;
  else if (physicalCount === 2) shipping = 80;
  else if (physicalCount === 3) shipping = 120;
  else if (physicalCount === 4) shipping = 150;
  else if (physicalCount === 5) shipping = 180;
  else if (physicalCount === 6) shipping = 190;
  else if (physicalCount === 7) shipping = 200;
  else if (physicalCount >= 8) shipping = physicalCount * 29;

  // ✅ MATH FIX: Accurately calculate MRP vs Discount vs Subtotal
  const crmDiscountAmount = crmDiscount?.amount || 0;
  const scheduledDiscountAmount = !isOfferExpired ? (scheduledDiscount?.amount || 0) : 0;
  const totalDiscount = itemLevelDiscount + crmDiscountAmount + scheduledDiscountAmount;
  
  const totalMRP = physicalOriginalTotal + digitalTotal + (extraCharge?.amount || 0);
  const subtotal = totalMRP - totalDiscount; // Deduct discounts BEFORE Subtotal so UI makes sense

  const TAX_RATE = 0.08;
  const tax = physicalTotal * TAX_RATE; // Tax applied to discounted subtotal
  const orderTotal = subtotal + tax + shipping;


  const getDigitalLabel = (item) => {
    if (item.type === 'M') return 'Membership';
    if (item.type === 'L') return 'Vehicle Listing';
    return 'Service';
  };

  // Helper: derive category/detail text from description
  const getDigitalCategory = (item) => {
    if (item.description) return item.description;
    if (item.type === 'M') return 'Membership Plan';
    if (item.type === 'L') return 'Premium Vehicle Listing';
    return '';
  };

  // Helper: "S ×5, M ×3" style size breakdown for custom apparel bundles.
  const apparelSizeSummary = (cfg) => {
    if (!cfg || !cfg.sizes) return '';
    return Object.entries(cfg.sizes)
      .filter(([, q]) => Number(q) > 0)
      .map(([s, q]) => `${s} ×${q}`)
      .join(', ');
  };

  return (
    <div className="cart-page-wrapper">

      {/* HEADER */}
      <header className="cart-header">
        <div
          className="cart-brand"
          onClick={() => navigate('/sales/crm/all')}
        >
          <div className="brand-icon">
            <CartIcon size={20} />
          </div>
          <div>
            <h1 className="brand-name">SeatCover</h1>
            <span className="brand-sub">Premium Seat Covers</span>
          </div>
        </div>
        <div className="secure-badge">
          <LockIcon /> <span>Secure Checkout</span>
        </div>
      </header>

      <div className="cart-container">

        {/* STEPPER */}
        <div className="stepper-container">
          <div className="stepper-track">
            <div className="stepper-track-fill" style={{ width: '0%' }} />
          </div>
          {[{ label: 'Cart', n: 1 }, { label: 'Checkout', n: 2 }, { label: 'Order Placed', n: 3 }].map(({ label, n }) => (
            <div className={`step ${n === 1 ? 'active' : ''}`} key={n}>
              <div className="step-circle">{n}</div>
              <span className="step-label">{label}</span>
            </div>
          ))}
        </div>

        {/* MAIN LAYOUT */}
        <div className="cart-layout">

          {/* LEFT: ITEM LIST */}
          <div className="cart-main">
            <div className="section-header">
              <h2>Your Cart <span className="item-count-badge">{totalItemCount}</span></h2>
              <div className="header-actions">
                <button className="continue-link" onClick={() => navigate('/sales/crm/all')}>
                  <ArrowLeftIcon size={13} /> Continue Shopping
                </button>
                {cart.length > 0 && (
                  <>
                    <span className="action-divider">|</span>
                    <button className="deselect-link" onClick={() => setCart([])}>
                      Clear all
                    </button>
                  </>
                )}
              </div>
            </div>

            {cart.length === 0 ? (
              <div className="empty-cart">
                <div className="empty-cart-icon">
                  <CartIcon size={40} />
                </div>
                <h3>Your cart is empty</h3>
                <p>Looks like you haven't added anything yet.</p>
                <button
                  onClick={() => navigate('/sales/crm/all')}
                  className="btn-continue-shopping"
                >
                  Continue Shopping
                </button>
              </div>
            ) : (
              <>
                {/* ── PHYSICAL ITEMS (Seat Covers) ── */}
                {physicalItems.map((item, idx) => (
                  <div className="cart-item-row" key={item.cartItemId || item.id || idx}>

                    {/* Checkbox */}
                    <input type="checkbox" className="item-checkbox" defaultChecked />

                    {item.isCustomApparel ? (
                      <>
                        {/* Image */}
                         <div className="item-img-wrapper" style={{ cursor: 'default', height: 'auto', alignSelf: 'flex-start', overflow: 'hidden' }}>
                          {item.apparel?.design && item.apparel?.area && (item.apparel.bgImage || item.image) ? (
                            <DesignOnShirt
                              bgImage={item.apparel.bgImage || item.image}
                              area={item.apparel.area}
                              design={item.apparel.design}
                              logoSrc={item.apparel.logoUrl}
                            />
                          ) : (
                            <img src={item.apparel?.logoUrl || item.image || 'https://placehold.co/300x300/f3f4f6/9ca3af?text=Custom+Apparel'} alt={item.name} />
                          )}
                        </div>

                        {/* Info block */}
                        <div className="item-info">
                          <div className="item-top-row">
                            <div className="item-meta">
                              <div className="item-title">{item.name}</div>
                              <div className="item-category">
                                Custom Apparel {item.totalPieces ? `· ${item.totalPieces} pcs` : ''}
                              </div>

                              <div className="item-attrs" style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '6px', fontSize: '13px' }}>
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
                                  <span style={{ color: '#64748b' }}><strong>Notes:</strong> {item.apparel.notes}</span>
                                )}
                              </div>
                            </div>

                            <div className="item-pricing">
                              <div className="item-price">${(item.price * item.qty).toFixed(2)}</div>
                              <span className="stock-badge">Custom</span>
                            </div>
                          </div>

                          {/* Mobile price */}
                          <div className="item-price-mobile">
                            <span className="item-price">${(item.price * item.qty).toFixed(2)}</span>
                            <span className="stock-badge">Custom</span>
                          </div>

                          {/* Actions row */}
                          <div className="item-actions-row">
                            <button
                              type="button"
                              onClick={() => setQtyEditId(item.cartItemId)}
                              style={{ background: 'none', border: 'none', padding: '8px 0', textDecoration: 'underline', color: '#0f172a', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
                            >
                              Edit quantity and size
                            </button>

                            <div className="action-links">
                              <button className="action-btn delete" onClick={() => handleRemoveItem(item.cartItemId || item.id)}>
                                <TrashIcon size={14} />
                                <span>Delete</span>
                              </button>
                              {canPreviewDesign(item) && (
                                <button className="action-btn" onClick={() => setPreviewItem(item)}>
                                  <EyeIcon size={14} />
                                  <span>Preview</span>
                                </button>
                              )}
                               <button className="action-btn" onClick={() => handleEditApparel(item)}>
                                <EditIcon size={14} />
                                <span>Edit design</span>
                              </button>
                              <button className="action-btn" onClick={() => navigate('/sales/crm/all')}>
                                <SearchIcon size={14} />
                                <span>Shop More</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Image */}
                        <div
                          className="item-img-wrapper"
                          onClick={() => navigate(`/sales/crm/seat-covers?id=${item.id}`)}
                        >
                          <img src={item.image || item.img || 'https://placehold.co/300x300/f3f4f6/9ca3af?text=No+Img'} alt={item.name} />
                        </div>

                        {/* Info block */}
                        <div className="item-info">
                          <div className="item-top-row">
                            <div className="item-meta">
                              <div
                                className="item-title"
                                onClick={() => navigate(`/sales/crm/seat-covers?id=${item.id}`)}
                              >
                                {item.name}
                              </div>
                              <div className="item-category">
                                Premium Seat Cover {item.selectedPattern ? `· ${item.selectedPattern}` : ''}
                              </div>

                              {(item.leatherColor || item.stitchColor || item.pattern || item.covers) && (
                                <div className="item-attrs" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '4px', fontSize: '13px' }}>
                                  
                                  {item.leatherColor && (
                                    <>
                                      <span style={{ textTransform: 'capitalize' }}><strong>Leather:</strong> {item.leatherColor}</span>
                                      <span style={{ color: '#cbd5e1' }}>|</span>
                                    </>
                                  )}
                                  
                                  {item.stitchColor && (
                                    <>
                                      <span style={{ textTransform: 'capitalize' }}><strong>Stitch:</strong> {item.stitchColor}</span>
                                      <span style={{ color: '#cbd5e1' }}>|</span>
                                    </>
                                  )}
                                  
                                  {item.pattern && (
                                    <span style={{ textTransform: 'capitalize' }}><strong>Pattern:</strong> {item.pattern}</span>
                                  )}

                                  {!item.leatherColor && !item.pattern && item.covers !== '-' && (
                                    <span style={{ color: '#64748b' }}>{item.covers}</span>
                                  )}
                                </div>
                              )}

                            </div>

                            <div className="item-pricing">
                              <div className="item-price">${(item.price * item.qty).toFixed(2)}</div>
                              {item.originalPrice && (
                                <div className="item-old-price">${(item.originalPrice * item.qty).toFixed(2)}</div>
                              )}
                              <span className="stock-badge">In Stock</span>
                            </div>
                          </div>

                          {/* Mobile price */}
                          <div className="item-price-mobile">
                            <span className="item-price">${(item.price * item.qty).toFixed(2)}</span>
                            {item.originalPrice && (
                              <span className="item-old-price">${(item.originalPrice * item.qty).toFixed(2)}</span>
                            )}
                            <span className="stock-badge">In Stock</span>
                          </div>

                          {/* Actions row */}
                          <div className="item-actions-row">
                            <div className="cart-qty-control">
                              <button className="qty-btn" onClick={() => handleUpdateQty(item.cartItemId || item.id, -1)}>−</button>
                              <span className="qty-value">{item.qty}</span>
                              <button className="qty-btn" onClick={() => handleUpdateQty(item.cartItemId || item.id, 1)}>+</button>
                            </div>

                            <div className="action-links">
                              <button className="action-btn delete" onClick={() => handleRemoveItem(item.cartItemId || item.id)}>
                                <TrashIcon size={14} />
                                <span>Delete</span>
                              </button>
                              <button className="action-btn">
                                <HeartOutlineIcon size={14} />
                                <span>Save</span>
                              </button>
                              <button className="action-btn" onClick={() => navigate('/sales/crm/all')}>
                                <SearchIcon size={14} />
                                <span>Similar</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}

                {/* ── DIGITAL ITEMS (Listings & Memberships) ── */}
                {digitalItems.map((item, idx) => {
                  const itemKey = item.cartItemId || item.id || `digital-${idx}`;
                  const label = getDigitalLabel(item);
                  const category = getDigitalCategory(item);

                  return (
                    <div className="cart-item-row" key={itemKey}>

                      {/* Checkbox */}
                      <input type="checkbox" className="item-checkbox" defaultChecked />

                      {/* Icon placeholder (no real image for digital items) */}
                      <div className="item-img-wrapper" style={{ cursor: 'default' }}>
                        <div style={{
                          width: '100%', height: '100%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: '#eff0ff', borderRadius: '10px',
                          minHeight: '90px',
                        }}>
                          {item.type === 'M' ? (
                            <MembershipIcon />
                          ) : (
                            <ListingCarIcon />
                          )}
                        </div>
                      </div>

                      {/* Info block */}
                      <div className="item-info">
                        <div className="item-top-row">
                          <div className="item-meta">
                            <div className="item-title">{item.name || label}</div>
                            <div className="item-category">{label}</div>

                            {/* Category & Location details */}
                            <div className="item-attrs" style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
                              <span style={{ fontSize: '13px', color: '#374151' }}>
                                <strong>Category:</strong> {label}
                              </span>
                              {item.description && (
                                <span style={{ fontSize: '13px', color: '#374151' }}>
                                  <strong>Details:</strong> {item.description}
                                </span>
                              )}
                              <span style={{ fontSize: '13px', color: '#374151' }}>
                                <strong>Location:</strong> {item.location || '-'}
                              </span>
                            </div>
                          </div>

                          <div className="item-pricing">
                            <div className="item-price">${(item.price * item.qty).toFixed(2)}</div>
                            {/* Active badge for listings/memberships */}
                            <span style={{
                              display: 'inline-block', fontSize: '11px', fontWeight: 700,
                              background: '#dcfce7', color: '#16a34a',
                              padding: '2px 10px', borderRadius: '20px', marginTop: '4px',
                            }}>
                              Active
                            </span>
                          </div>
                        </div>

                        {/* Mobile price */}
                        <div className="item-price-mobile">
                          <span className="item-price">${(item.price * item.qty).toFixed(2)}</span>
                          <span style={{
                            display: 'inline-block', fontSize: '11px', fontWeight: 700,
                            background: '#dcfce7', color: '#16a34a',
                            padding: '2px 10px', borderRadius: '20px', marginLeft: '6px',
                          }}>
                            Active
                          </span>
                        </div>

                        {/* Actions row */}
                        <div className="item-actions-row">
                          <div className="cart-qty-control">
                            <button className="qty-btn" onClick={() => handleUpdateQty(itemKey, -1)}>−</button>
                            <span className="qty-value">{item.qty}</span>
                            <button className="qty-btn" onClick={() => handleUpdateQty(itemKey, 1)}>+</button>
                          </div>

                          <div className="action-links">
                            <button className="action-btn delete" onClick={() => handleRemoveItem(itemKey)}>
                              <TrashIcon size={14} />
                              <span>Delete</span>
                            </button>
                            <button className="action-btn">
                              <EditIcon size={14} />
                              <span>Edit {label}</span>
                            </button>
                            <button className="action-btn">
                              <HeartOutlineIcon size={14} />
                              <span>Save</span>
                            </button>
                            <button className="action-btn" onClick={() => navigate('/sales/crm/all')}>
                              <SearchIcon size={14} />
                              <span>Similar</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* RIGHT: ORDER SUMMARY */}
          {cart.length > 0 && (
            <div className="cart-sidebar">

              {timeRemaining !== null && !isOfferExpired && (
                <div className="cart-offer-timer">
                  ⏰ Limited Time Offer — expires in{' '}
                  <span className="timer-count">{formatCountdown(timeRemaining)}</span>
                </div>
              )}
              {isOfferExpired && (
                <div className="cart-offer-timer" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }}>
                  ⏰ This offer has expired
                </div>
              )}

              <h3 className="summary-title">Order Summary</h3>

              <div className="summary-rows">
                {/* MRP counts ALL items (physical + digital) */}
                <div className="summary-row">
                  <span>MRP ({totalItemCount} {totalItemCount === 1 ? 'item' : 'items'})</span>
                  <span>${totalMRP.toFixed(2)}</span>
                </div>

                {itemLevelDiscount > 0 && (
                  <div className="summary-row discount-row">
                    <span>Discount</span>
                    <span className="discount-value">−${itemLevelDiscount.toFixed(2)}</span>
                  </div>
                )}
                {crmDiscount && crmDiscountAmount > 0 && (
                  <div className="summary-row discount-row">
                    <span>📋 {crmDiscount.label}</span>
                    <span className="discount-value">−${crmDiscountAmount.toFixed(2)}</span>
                  </div>
                )}
                {scheduledDiscount && scheduledDiscountAmount > 0 && !isOfferExpired && (
                  <div className="summary-row discount-row">
                    <span>📅 {scheduledDiscount.label}</span>
                    <span className="discount-value">−${scheduledDiscountAmount.toFixed(2)}</span>
                  </div>
                )}

                <div className="summary-row">
                  <span>Subtotal</span>
                  <span>${(physicalTotal + digitalTotal + (extraCharge?.amount || 0)).toFixed(2)}</span>
                </div>

                <div className="summary-row">
                  <span>Shipping</span>
                  {shipping === 0 ? (
                    <span className="free-tag">FREE</span>
                  ) : (
                    <span>${shipping.toFixed(2)}</span>
                  )}
                </div>

                {/* Tax only on physical items */}
                {physicalTotal > 0 && (
                  <div className="summary-row">
                    <span>Estimated Tax (8%)</span>
                    <span>${tax.toFixed(2)}</span>
                  </div>
                )}

                {/* Extra CRM charge row — only shown when coming from CRM */}
                {extraCharge && (
                  <div className="summary-row" style={{ color: '#1e40af', fontWeight: 600 }}>
                    <span>📋 {extraCharge.label}</span>
                    <span>${Number(extraCharge.amount).toFixed(2)}</span>
                  </div>
                )}
              </div>

              {(itemLevelDiscount > 0 || crmDiscountAmount > 0 || scheduledDiscountAmount > 0) && (
                <div className="savings-banner">
                  <TagIcon />
                  <span>You're saving <strong>${(itemLevelDiscount + crmDiscountAmount + scheduledDiscountAmount).toFixed(2)}</strong> on this order!</span>
                </div>
              )}

              <div className="summary-total">
                <div>
                  <div className="total-label">Total</div>
                  <div className="total-note">Incl. all taxes &amp; fees</div>
                </div>
                <span className="total-amount">${orderTotal.toFixed(2)}</span>
              </div>

              <button className="btn-proceed" onClick={() => navigate('/sales/crm/checkout', {
                state: {
                  crmDiscount: crmDiscount,
                  scheduledDiscount: !isOfferExpired ? scheduledDiscount : null,
                }
              })}>
                Proceed to Checkout <ArrowRightIcon />
              </button>

              <p className="secure-note"><LockIcon size={13} /> Secured with SSL encryption</p>
            </div>
          )}
        </div>
      </div>

      <QuantityDrawer
        item={cart.find((i) => i.cartItemId === qtyEditId) || null}
       onClose={() => setQtyEditId(null)}
       onSave={(r) => handleSaveApparelQty(qtyEditId, r)}
        onBrowseSimilar={() => navigate('/sales/crm/all')}
      />

      <DesignPreviewModal
        item={previewItem}
        onClose={() => setPreviewItem(null)}
        onEdit={previewItem ? () => { const it = previewItem; setPreviewItem(null); handleEditApparel(it); } : undefined}
      />


     </div>
   );
 };
    

/* ---- ICONS ---- */
const CartIcon = ({ size = 24 }) => (
  <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.2 9.3a1 1 0 001 1.2h13.4a1 1 0 00.9-1.2L17 13M9 21h.01M15 21h.01" />
  </svg>
);
const LockIcon = ({ size = 16 }) => (
  <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
);
const TrashIcon = ({ size = 16 }) => (
  <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" />
  </svg>
);
const ArrowRightIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);
const ArrowLeftIcon = ({ size = 16 }) => (
  <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);
const HeartOutlineIcon = ({ size = 16 }) => (
  <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
  </svg>
);

const EyeIcon = ({ size = 16 }) => (
  <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
  </svg>
);

const SearchIcon = ({ size = 16 }) => (
  <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
  </svg>
);
const TagIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);
const EditIcon = ({ size = 16 }) => (
  <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

// Car/listing placeholder icon matching the screenshot style
const ListingCarIcon = () => (
  <svg width="52" height="52" fill="none" viewBox="0 0 64 64" style={{ opacity: 0.55 }}>
    <rect width="64" height="64" rx="12" fill="#e0e7ff" />
    <path
      d="M14 38h36M18 38l4-10h20l4 10"
      stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    />
    <path
      d="M20 38v4a1 1 0 001 1h4a1 1 0 001-1v-4M38 38v4a1 1 0 001 1h4a1 1 0 001-1v-4"
      stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round"
    />
    <circle cx="23" cy="34" r="1.5" fill="#6366f1" />
    <circle cx="41" cy="34" r="1.5" fill="#6366f1" />
    <path d="M26 28h12" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

// Membership icon placeholder
const MembershipIcon = () => (
  <svg width="52" height="52" fill="none" viewBox="0 0 64 64" style={{ opacity: 0.55 }}>
    <rect width="64" height="64" rx="12" fill="#e0e7ff" />
    <rect x="12" y="20" width="40" height="26" rx="4" stroke="#6366f1" strokeWidth="2.5" />
    <path d="M12 28h40" stroke="#6366f1" strokeWidth="2.5" />
    <path d="M20 36h10M20 40h6" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" />
    <circle cx="44" cy="38" r="4" stroke="#6366f1" strokeWidth="2" />
  </svg>
);

export default CartPage;