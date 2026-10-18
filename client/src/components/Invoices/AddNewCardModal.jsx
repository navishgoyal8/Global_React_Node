import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './AddNewCardModal.css'; 

const AddNewCardModal = ({ isOpen, onClose, onAddCard }) => {
  const [cardNumber, setCardNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvc, setCvc] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [zipCode, setZipCode] = useState('');

  // Auto-format Card Number with spaces
  const handleCardNumberChange = (e) => {
    let value = e.target.value.replace(/\D/g, '');
    value = value.replace(/(.{4})/g, '$1 ').trim();
    setCardNumber(value.substring(0, 19)); // 16 digits + 3 spaces max
  };

  // Auto-format Expiry Date with " / "
  const handleExpiryChange = (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length >= 3) {
      value = `${value.substring(0, 2)} / ${value.substring(2, 4)  }`;
    }
    setExpiryDate(value.substring(0, 7)); // MM / YY max
  };

  const handleCvcChange = (e) => {
    const value = e.target.value.replace(/\D/g, '');
    setCvc(value.substring(0, 4)); // max 4 digits
  };

  const handleSubmit = () => {
    if (onAddCard) {
      onAddCard({ cardNumber, expiryDate, cvc, cardholderName, zipCode });
    }
    onClose();
  };

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="add-card-backdrop" onClick={onClose}>

      <div className="add-card-modal" onClick={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div className="add-card-header">
          <h3 className="add-card-title">
            <div className="card-icon-blue">💳</div>
            Add New Card
          </h3>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>

        {/* BODY (Form) */}
        <div className="add-card-body">
          <div className="input-group">
            <label className="input-label">Card Number</label>
            <div className="input-wrapper">
              <span className="left-icon">💳</span>
              <input
                type="text"
                className="styled-input card-input"
                placeholder="1234 1234 1234 1234"
                value={cardNumber}
                onChange={handleCardNumberChange}
              />
              <div className="card-brands">
                {/* Clean CSS/Unicode representations of card logos to avoid missing image links */}
                <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#1a1f71', fontStyle: 'italic', background: '#f8fafc', padding: '2px 4px', border: '1px solid #e2e8f0', borderRadius: '3px' }}>VISA</span>
                <span style={{ fontSize: '12px', display: 'flex' }}><span style={{ color: '#eb001b' }}>●</span><span style={{ color: '#f79e1b', marginLeft: '-6px' }}>●</span></span>
                <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'white', background: '#2671b9', padding: '2px 4px', borderRadius: '3px' }}>AMEX</span>
              </div>
            </div>
          </div>

          <div className="row-2">
            <div className="input-group">
              <label className="input-label">Expiry Date</label>
              <input
                type="text"
                className="styled-input"
                placeholder="MM / YY"
                value={expiryDate}
                onChange={handleExpiryChange}
              />
            </div>
            <div className="input-group">
              <label className="input-label">CVC</label>
              <div className="input-wrapper">
                <input
                  type="text"
                  className="styled-input cvc-input"
                  placeholder="CVC"
                  value={cvc}
                  onChange={handleCvcChange}
                />
                <span className="cvc-icon">💳</span>
              </div>
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Cardholder Name</label>
            <input
              type="text"
              className="styled-input"
              placeholder="Name on card"
              value={cardholderName}
              onChange={(e) => setCardholderName(e.target.value)}
            />
          </div>

          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Billing ZIP Code</label>
            <input
              type="text"
              className="styled-input"
              placeholder="ZIP Code"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
            />
          </div>

          <div className="security-note">
            <span className="lock-icon">🔒</span>
            Your payment information is secure and encrypted.
          </div>
        </div>

        {/* FOOTER (Buttons) */}
        <div className="add-card-footer">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-add" onClick={handleSubmit}>Add Card</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AddNewCardModal;