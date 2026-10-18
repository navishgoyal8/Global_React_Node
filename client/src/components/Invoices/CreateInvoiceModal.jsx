import React, {useState, useEffect} from 'react';
import { createPortal } from 'react-dom';
import './CreateInvoiceModal.css';
import AddNewCardModal from './AddNewCardModal'; // ✅ IMPORTED THE NEW MODAL

const AVAILABLE_COUPONS = [
  { code: 'WELCOME20', discount: 20 },
  { code: 'SAVE10', discount: 10 },
  { code: 'MEMBER15', discount: 15 },
  { code: 'SPRING25', discount: 25 }
];

const CreateInvoiceModal = ({ isOpen, onClose, lead, selectedListings = [], selectedMemberships = [], prefilledCustomer, leadStatus }) => {

  const [customerInfo, setCustomerInfo] = useState({
      name: '', 
      company: '', 
      email: '', 
      phone: '', 
      address: '', 
      city: '', state: 'CA', 
      zip: ''
  });
  const [manualDiscount, setManualDiscount] = useState(0); 
  const [selectedCoupons, setSelectedCoupons] = useState(['WELCOME20', 'SAVE10']); 
  const [discountTab, setDiscountTab] = useState('coupon'); // 'coupon' or 'manual'
  const [paymentTab, setPaymentTab] = useState('card');
  const [cartItems, setCartItems] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPaymentLinkEnabled, setIsPaymentLinkEnabled] = useState(true);
  const [linkExpiry, setLinkExpiry] = useState('7 Days');
  const [deliveryMethod, setDeliveryMethod] = useState('SMS & Email');
  const [payLinkMessage, setPayLinkMessage] = useState('');
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  
  // ✅ STATE TO CONTROL THE NEW CARD MODAL
  const [isAddCardOpen, setIsAddCardOpen] = useState(false);
  
  const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);  

  const getStatusIcon = (status) => {
  switch (status) {
    case 'Intake': return '🔵';
    case 'Qualified': return '✅';
    case 'Converted': return '⭐';
    case 'Lost': return '❌';
    case 'Not Qualified': return '➖';
    default: return '🔵';
  }
}
  
  let effectiveDiscountPercent = 0;
  if (discountTab === 'manual') {
    effectiveDiscountPercent = manualDiscount;
  } else {
    effectiveDiscountPercent = selectedCoupons.reduce((total, code) => {
      const coupon = AVAILABLE_COUPONS.find(c => c.code === code);
      return total + (coupon ? coupon.discount : 0);
    }, 0);
  }

  effectiveDiscountPercent = Math.min(effectiveDiscountPercent, 100);

  const discountAmount = subtotal * (effectiveDiscountPercent / 100);
  const totalDue = subtotal - discountAmount;

  useEffect(() => {
    if (isOpen) {
      setPayLinkMessage(`Hi ${customerInfo.name || 'there'},\n\nPlease find your invoice for $${totalDue.toFixed(2)}. You can securely pay online using the link below.`);
    }
  }, [isOpen, customerInfo.name, totalDue]);

  useEffect(() => {
    if (isOpen) {
      let items = [];
      
      const extractPrice = (str) => parseFloat(str.replace(/[^0-9.]/g, ''));

      selectedMemberships.forEach(mem => {
        items.push({ id: mem, name: 'Membership', description: mem, price: extractPrice(mem), quantity: 1, type: 'M' });
      });

      selectedListings.forEach(list => {
        items.push({ id: list, name: 'Listing', description: list, price: extractPrice(list), quantity: 1, type: 'L' });
      });

      setCartItems(items);
    }
  }, [isOpen, selectedListings, selectedMemberships]);

  useEffect(() => {
    if (lead) {
      // ✅ Look for prefilledCustomer first. If it's empty, fall back to the raw lead data.
      const actualName = prefilledCustomer?.name || (lead.user?.name === 'Un-registered' ? '' : (lead.user?.name || ''));
      const actualEmail = prefilledCustomer?.email || (lead.user?.email === 'No email provided' ? '' : (lead.user?.email || ''));
      const actualCompany = prefilledCustomer?.company || lead.user?.company || '';
      const actualPhone = prefilledCustomer?.phone || lead.id || '';
      
      setCustomerInfo({
        name: actualName,
        company: actualCompany,
        email: actualEmail,
        phone: actualPhone, 
        address: '', 
        city: '',
        state: 'CA',
        zip: '',
        userId: prefilledCustomer?.userId || null // ✅ Stores the database ID for billing
      });
    }
  }, [lead, prefilledCustomer]); // <-- Make sure prefilledCustomer is in the dependency array

  

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCustomerInfo(prev => ({ ...prev, [name]: value }));
  };

  const avatarLetter = customerInfo.name ? customerInfo.name.charAt(0).toUpperCase() : '👤';

  const handleToggleCoupon = (code) => {
    setSelectedCoupons(prev => 
      prev.includes(code) 
        ? prev.filter(c => c !== code) 
        : [...prev, code]              
    );
  };

  const handleUpdateQuantity = (id, newQty) => {
    const qty = Math.max(1, Number(newQty)); // Prevent negative or zero quantity
    setCartItems(prev => prev.map(item => item.id === id ? { ...item, quantity: qty } : item));
  };

  const handleChargeAndOrder = async () => {
    if (!customerInfo.name || !customerInfo.email) {
      alert("⚠️ Please enter a Billing Name and Email before charging.");
      return;
    }

    if (cartItems.length === 0) {
      alert("⚠️ You must select at least one Listing or Membership to charge.");
      return;
    }

    try {
      setIsSubmitting(true);
      // Simulate API call to Stripe/Backend
      await new Promise(resolve => setTimeout(resolve, 1500)); 
      
      alert(`✅ Successfully charged $${totalDue.toFixed(2)} to ${customerInfo.name}!`);
      onClose(); 
    } catch (error) {
      alert("❌ Payment failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

 const handleGeneratePayLink = async () => {
    if (!customerInfo.userId) {
      alert("⚠️ This user must be an existing registered user to receive a payment link.");
      return;
    }
    if (!customerInfo.phone && deliveryMethod.includes('SMS')) {
      alert("⚠️ Please provide a Customer Phone number to text the link.");
      return;
    }

    try {
      setIsGeneratingLink(true);
      
      const payload = {
        userId: customerInfo.userId, 
        phone: customerInfo.phone,
        email: customerInfo.email,
        amount: totalDue,
        items: cartItems,
        deliveryMethod: deliveryMethod,
        customMessage: payLinkMessage,
        expiresIn: linkExpiry,
        agentId: 1 // Replace with actual logged-in Admin/Agent ID if you have it in context
      };

      // Ensure this URL matches the route you set up in Step 2
      const response = await fetch('${API_BASE_URL}/invoices/generate-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.message || "Failed to generate link");

      alert(`✅ Secure payment link generated and sent via ${deliveryMethod}!\n\nLink:\n${data.link}`);
      onClose();
      
    } catch (error) {
      console.error(error);
      alert("❌ Failed to generate payment link.");
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const handlePreviewInvoice = () => {
    // In a real app, this would route to a PDF generator or a read-only view
    alert("👁 Opening Preview...\n\n(This will open a PDF-style view of the invoice in a new tab for the agent to review.)");
  };

  const handleSaveDraft = async () => {
    try {
      setIsSavingDraft(true);
      
      const draftPayload = {
        status: 'Draft',
        customer: customerInfo,
        items: cartItems,
        totals: { subtotal, discountAmount, totalDue }
      };

      console.log("Saving Draft to Database:", draftPayload);
      
      await new Promise(resolve => setTimeout(resolve, 1000)); 
      
      alert("💾 Invoice successfully saved to your Drafts!");
    } catch (error) {
      alert("❌ Failed to save draft.");
    } finally {
      setIsSavingDraft(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="invoice-modal-backdrop" onClick={onClose}>
      <div className="invoice-modal-container" onClick={e => e.stopPropagation()}>
        
        {/* --- HEADER --- */}
        <div className="invoice-header">
          
          <div className="invoice-header-left">
            <button style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }} onClick={onClose}>✕</button>
            <h2>📄 Create Invoice</h2>
          </div>

          <div className="invoice-header-actions" style={{ position: 'relative' }}>
            <button 
              className="btn-outline" 
              onClick={handlePreviewInvoice}
            >
              👁 Preview Invoice
            </button>
            
            <button 
              className="btn-outline" 
              onClick={handleSaveDraft}
              disabled={isSavingDraft}
            >
              {isSavingDraft ? '💾 Saving...' : 'Save Draft'}
            </button>
            
            <button 
              className="btn-primary-blue" 
              onClick={() => setShowMoreActions(!showMoreActions)}
            >
              More Actions ⌄
            </button>

            {/* DYNAMIC DROPDOWN MENU */}
            {showMoreActions && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: '0',
                marginTop: '8px',
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                width: '160px',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}>
                <button className="dropdown-item" onClick={() => { alert('Downloading PDF...'); setShowMoreActions(false); }}>📥 Download PDF</button>
                <button className="dropdown-item" onClick={() => { alert('Duplicating invoice...'); setShowMoreActions(false); }}>📋 Duplicate</button>
                <button 
                  className="dropdown-item" 
                  style={{ color: '#dc2626', borderTop: '1px solid #e5e7eb' }} 
                  onClick={() => { setShowMoreActions(false); onClose(); }}
                >
                  🗑️ Discard
                </button>
              </div>
            )}
          </div>
        </div>

        {/* --- BODY --- */}
        <div className="invoice-body">
          <div className="invoice-grid">
            
            {/* ================= LEFT COLUMN ================= */}
            <div className="invoice-col">
              
              {/* Customer Info Panel */}
              <div className="invoice-panel">
                <h3>👤 Customer Information <span style={{fontSize:'12px', color:'#6b7280'}}>^</span></h3>

                {!customerInfo.name && (
                  <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fef08a', color: '#92400e', padding: '10px 12px', borderRadius: '6px', fontSize: '12px', marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '16px' }}>⚠️</span>
                    <span><strong>Action Required:</strong> This lead is unregistered. Please enter their billing name and email to generate a valid invoice.</span>
                  </div>
                )}
                
                {/* Dynamic CRM Contact Banner */}
                {/* Dynamic CRM Contact Banner */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px' }}>
                  <div 
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      background: customerInfo.name ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #d1d5db 0%, #9ca3af 100%)',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '22px',
                      fontWeight: '700',
                      boxShadow: customerInfo.name ? '0 4px 10px rgba(16, 185, 129, 0.3)' : '0 4px 10px rgba(156, 163, 175, 0.3)',
                      textTransform: 'uppercase',
                      flexShrink: 0,
                      border: '2px solid #ffffff'
                    }}
                  >
                    {avatarLetter}
                  </div>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '16px', color: customerInfo.name ? '#111827' : '#6b7280' }}>
                      {customerInfo.name || 'Un-registered'} 
                      <span 
                        style={{fontSize: '11px', backgroundColor: '#ecfdf5', color: '#059669', padding: '2px 6px', borderRadius: '12px', marginLeft: '6px'}}>
                          {getStatusIcon(leadStatus || 'Intake')} {leadStatus || 'Intake'}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                      📞 {customerInfo.phone} &nbsp;&nbsp; {customerInfo.email ? `✉ ${customerInfo.email}` : ''}
                    </div>
                  </div>
                </div>

                <div className="inv-form-group">
                  <label>Billing Name</label>
                  <input type="text" name="name" className="inv-form-control" value={customerInfo.name} onChange={handleInputChange} />
                </div>
                
                <div className="inv-form-group">
                  <label>Company Name (Optional)</label>
                  <input type="text" name="company" className="inv-form-control" value={customerInfo.company} onChange={handleInputChange} />
                </div>

                <div className="inv-form-group">
                  <label>Email</label>
                  <input type="email" name="email" className="inv-form-control" value={customerInfo.email} onChange={handleInputChange} />
                </div>

                <div className="inv-form-group">
                  <label>Address (Optional)</label>
                  <input type="text" name="address" className="inv-form-control" value={customerInfo.address} onChange={handleInputChange} />
                </div>

                <div className="inv-row">
                  <div className="inv-form-group">
                    <label>City</label>
                    <input type="text" name="city" className="inv-form-control" value={customerInfo.city} onChange={handleInputChange} />
                  </div>
                  <div className="inv-form-group">
                    <label>State</label>
                    <select name="state" className="inv-form-control" value={customerInfo.state} onChange={handleInputChange}>
                      <option value="CA">CA</option>
                      <option value="NY">NY</option>
                      <option value="TX">TX</option>
                      <option value="FL">FL</option>
                    </select>
                  </div>
                  <div className="inv-form-group">
                    <label>ZIP</label>
                    <input type="text" name="zip" className="inv-form-control" value={customerInfo.zip} onChange={handleInputChange} />
                  </div>
                </div>
              </div>

              {/* Invoice Details Panel */}
              <div className="invoice-panel">
                <h3>🧾 Invoice Details <span style={{fontSize:'12px', color:'#6b7280'}}>^</span></h3>
                
                <div className="inv-row">
                  <div className="inv-form-group">
                    <label>Invoice Number</label>
                    <input type="text" className="inv-form-control" defaultValue="INV-2026-0401" readOnly style={{backgroundColor:'#f3f4f6'}} />
                  </div>
                  <div className="inv-form-group">
                    <label>Issue Date</label>
                    <input type="date" className="inv-form-control" defaultValue="2026-04-01" />
                  </div>
                  <div className="inv-form-group">
                    <label>Due Date</label>
                    <input type="date" className="inv-form-control" defaultValue="2026-04-15" />
                  </div>
                </div>

                <div className="inv-form-group">
                  <label>Description (Optional)</label>
                  <input type="text" className="inv-form-control" defaultValue="$345/year membership" />
                </div>
              </div>

            {/* Payment Link Panel */}
              <div className="invoice-panel">
                <h3 style={{ marginBottom: '4px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    🔗 Payment Link <span style={{fontSize: '13px', fontWeight: 'normal', color: '#6b7280'}}>(Optional)</span>
                  </span>
                  <label className="toggle-switch">
                    <input 
                      type="checkbox" 
                      checked={isPaymentLinkEnabled} 
                      onChange={(e) => setIsPaymentLinkEnabled(e.target.checked)} 
                    />
                    <span className="slider"></span>
                  </label>
                </h3>
                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '0', marginBottom: '16px' }}>
                  Send a secure payment link to your customer via email or text.
                </p>

                <div style={{ opacity: isPaymentLinkEnabled ? 1 : 0.4, pointerEvents: isPaymentLinkEnabled ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                  <div className="inv-row">
                    <div className="inv-form-group">
                      <label>Link Expires In</label>
                      <select className="inv-form-control" value={linkExpiry} onChange={(e) => setLinkExpiry(e.target.value)}>
                        <option value="7 Days">7 Days</option>
                        <option value="14 Days">14 Days</option>
                        <option value="30 Days">30 Days</option>
                      </select>
                    </div>
                    <div className="inv-form-group">
                      <label>Customer Email</label>
                      <input 
                        type="email" 
                        name="email"
                        className="inv-form-control" 
                        value={customerInfo.email} 
                        onChange={handleInputChange}
                        placeholder="email@example.com"
                      />
                    </div>
                  </div>

                  <div className="inv-row">
                    <div className="inv-form-group">
                      <label>Customer Phone</label>
                      <input 
                        type="text" 
                        name="phone"
                        className="inv-form-control" 
                        value={customerInfo.phone} 
                        onChange={handleInputChange}
                        placeholder="Phone number"
                      />
                    </div>
                    <div className="inv-form-group">
                      <label>Delivery Method</label>
                      <select className="inv-form-control" value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value)}>
                        <option value="SMS & Email">SMS & Email</option>
                        <option value="SMS Only">SMS Only</option>
                        <option value="Email Only">Email Only</option>
                      </select>
                    </div>
                  </div>

                  <div className="inv-form-group">
                    <label>Email Message (Optional)</label>
                    <textarea 
                      className="inv-form-control" 
                      rows="3" 
                      value={payLinkMessage}
                      onChange={(e) => setPayLinkMessage(e.target.value)}
                    ></textarea>
                  </div>

                  <button 
                    className="btn-outline-green" 
                    onClick={handleGeneratePayLink}
                    disabled={isGeneratingLink}
                  >
                    {isGeneratingLink ? '⏳ Generating...' : '🔗 Generate Pay Link'}
                  </button>
                  <p style={{ fontSize: '11px', color: '#6b7280', textAlign: 'center', marginTop: '12px', marginBottom: '0' }}>
                    A payment link will be generated after saving the invoice.
                  </p>
                </div>
              </div>

              {/* Info Text at the bottom of the column */}
              <div style={{ fontSize: '12px', color: '#2563eb', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 10px' }}>
                <span style={{ background: '#dbeafe', padding: '2px 6px', borderRadius: '50%', fontWeight: 'bold' }}>i</span> 
                You can preview the invoice before sending or save it as a draft.
              </div>

            </div>

            {/* ================= RIGHT COLUMN ================= */}
            <div className="invoice-col">
              
              {/* Item / Membership Panel */}
              <div className="invoice-panel">
                <h3>🛒 Item / Membership <span style={{fontSize:'12px', color:'#6b7280'}}>^</span></h3>
                
                {cartItems.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280', fontSize: '13px', borderBottom: '1px solid #e5e7eb', marginBottom: '15px' }}>
                    No items selected. Please go back and select a listing or membership.
                  </div>
                ) : (
                  cartItems.map((item, index) => (
                    <div key={index} style={{ display: 'flex', alignItems: 'flex-start', paddingBottom: '15px', borderBottom: '1px solid #e5e7eb', marginBottom: '15px' }}>
                      <div className="icon-circle" style={{ width: '36px', height: '36px', marginRight: '15px', fontSize: '14px', backgroundColor: item.type === 'M' ? '#059669' : '#2563eb' }}>
                        {item.type}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                          <strong>{item.name}</strong>
                          <strong>${item.price.toFixed(2)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{fontSize: '13px', color: '#6b7280'}}>{item.description}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input 
                              type="number" 
                              value={item.quantity}
                              onChange={(e) => handleUpdateQuantity(item.id, e.target.value)}
                              min="1"
                              style={{ width: '40px', padding: '4px', textAlign: 'center', border: '1px solid #d1d5db', borderRadius: '4px' }} 
                            />
                            <span style={{ fontWeight: 'bold', color: '#9ca3af', cursor: 'pointer' }}>⋮</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}

                {/* Pricing Summary */}
                <div style={{ fontWeight: '600', color: '#374151', marginBottom: '10px', fontSize: '14px' }}>Pricing Summary</div>
                <div className="summary-row"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
                <div className="summary-row"><span>Tax (0%) ⓘ</span><span>$0.00</span></div>
                <div className="summary-row" style={{ fontWeight: '600', marginTop: '10px', color: '#111827' }}>
                  <span>Total Before Discount</span><span>${subtotal.toFixed(2)}</span>
                </div>
              </div>

             {/* Discount Panel */}
              <div className="invoice-panel">
                <h3>🏷️ Discount <span style={{fontSize:'12px', color:'#6b7280'}}>^</span></h3>
                
                <div className="inv-tabs">
                  <div 
                    className={`inv-tab ${discountTab === 'coupon' ? 'active' : ''}`} 
                    onClick={() => setDiscountTab('coupon')}
                  >Apply Coupon</div>
                  <div 
                    className={`inv-tab ${discountTab === 'manual' ? 'active' : ''}`} 
                    onClick={() => setDiscountTab('manual')}
                  >Manual Discount</div>
                </div>

                {discountTab === 'coupon' ? (
                  <>
                    <div className="inv-form-group">
                      <label>Select Coupon(s)</label>
                      <div className="custom-select-box">
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '500' }}>
                          {selectedCoupons.length} coupon(s) selected <span style={{color: '#9ca3af'}}>⌄</span>
                        </div>
                        <div style={{ marginTop: selectedCoupons.length > 0 ? '8px' : '0' }}>
                          {selectedCoupons.map(code => (
                            <span key={code} className="inv-pill">
                              {code} 
                              <span 
                                style={{color:'#9ca3af', cursor:'pointer', paddingLeft: '4px'}} 
                                onClick={() => handleToggleCoupon(code)}
                              >✕</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', margin: '15px 0 10px 0' }}>Available Coupons</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                      {AVAILABLE_COUPONS.map(coupon => (
                        <div key={coupon.code} style={{display:'flex', justifyContent:'space-between', fontSize:'13px'}}>
                          <label style={{display:'flex', gap:'8px', fontWeight:'500', cursor: 'pointer'}}>
                            <input 
                              type="checkbox" 
                              checked={selectedCoupons.includes(coupon.code)}
                              onChange={() => handleToggleCoupon(coupon.code)}
                            /> 
                            {coupon.code}
                          </label>
                          <span style={{color:'#059669', fontWeight:'600'}}>{coupon.discount}% off</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="inv-form-group" style={{ marginBottom: '20px' }}>
                    <label>Custom Discount Percentage (%)</label>
                    <input 
                      type="number" 
                      className="inv-form-control" 
                      value={manualDiscount} 
                      onChange={(e) => setManualDiscount(Number(e.target.value))}
                      min="0" max="100"
                    />
                  </div>
                )}

                <div className="summary-row" style={{ color: '#059669', fontWeight: '600' }}>
                  <span>Discount ({effectiveDiscountPercent}%)</span><span>- ${discountAmount.toFixed(2)}</span>
                </div>
                <div className="summary-row" style={{ fontWeight: 'bold', color: '#111827' }}>
                  <span>Total</span><span>${totalDue.toFixed(2)}</span>
                </div>
                <div className="summary-row summary-total">
                  <span>Due Amount</span><span style={{ color: '#059669' }}>USD ${totalDue.toFixed(2)}</span>
                </div>
              </div>

              {/* Payment Method Panel */}
              <div className="invoice-panel">
                <h3>💳 Payment Method <span style={{fontSize:'12px', color:'#6b7280'}}>^</span></h3>
                
                <div className="inv-tabs" style={{ marginBottom: '15px' }}>
                  <div 
                    className={`inv-tab ${paymentTab === 'card' ? 'active' : ''}`} 
                    onClick={() => setPaymentTab('card')}
                  >Card</div>
                  <div 
                    className={`inv-tab ${paymentTab === 'ach' ? 'active' : ''}`} 
                    onClick={() => setPaymentTab('ach')}
                  >ACH (Bank Transfer)</div>
                </div>

                {paymentTab === 'card' ? (
                  <>
                    <div className="inv-form-group">
                      <label>Use a stored card</label>
                      <div className="custom-select-box" style={{ padding: '0', overflow: 'hidden' }}>
                        <div style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f0fdf4', display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span style={{fontWeight:'600'}}>💳 Visa • • • • 4242 <span style={{color:'#059669', fontSize:'11px', marginLeft:'6px'}}>Default</span></span>
                          <span>Exp 12/27 <span style={{color: '#9ca3af', marginLeft:'5px'}}>⌄</span></span>
                        </div>
                      </div>
                      
                      {/* ✅ WIRED UP "Add new card" CLICK EVENT */}
                      <div 
                        onClick={() => setIsAddCardOpen(true)}
                        style={{ padding: '10px 0', fontSize: '13px', color: '#2563eb', fontWeight: '600', cursor: 'pointer' }}
                      >
                        + Add new card
                      </div>
                    </div>

                    <div className="inv-row">
                      <div className="inv-form-group">
                        <label>Cardholder Name</label>
                        <input type="text" className="inv-form-control" placeholder="Name on card" />
                      </div>
                      <div className="inv-form-group">
                        <label>Billing ZIP Code</label>
                        <input type="text" className="inv-form-control" placeholder="ZIP Code" />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="inv-form-group">
                      <label>Routing Number</label>
                      <input type="text" className="inv-form-control" placeholder="9 digit routing number" />
                    </div>
                    <div className="inv-form-group">
                      <label>Account Number</label>
                      <input type="text" className="inv-form-control" placeholder="Account number" />
                    </div>
                  </>
                )}

                <div style={{ fontSize: '11px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px' }}>
                  <span>🔒</span> Your payment information is secure and encrypted.
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* --- FOOTER --- */}
        <div className="invoice-footer">
          <button className="btn-outline" onClick={onClose} disabled={isSubmitting}>Cancel</button>
          <div className="footer-actions-right">
            <button className="btn-primary-blue" disabled={isSubmitting}>✉ Email Pay Link</button>
            <button className="btn-primary-blue" disabled={isSubmitting}>💬 Text Pay Link</button>
            
            <button 
              className="btn-green" 
              onClick={handleChargeAndOrder}
              disabled={isSubmitting}
              style={{ opacity: isSubmitting ? 0.7 : 1, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
            >
              {isSubmitting ? '🔒 Processing...' : '🔒 Charge & Order'}
            </button>
          </div>
        </div>

      </div>

      {/* ✅ NEW: RENDER THE ADD NEW CARD MODAL HERE */}
      <AddNewCardModal 
        isOpen={isAddCardOpen} 
        onClose={() => setIsAddCardOpen(false)} 
        onAddCard={(cardDetails) => {
          console.log("Saving new card:", cardDetails);
          // Future logic to save to database goes here
        }}
      />
      
    </div>,
    document.body
  );
};

export default CreateInvoiceModal;