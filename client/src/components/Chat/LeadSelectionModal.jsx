import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import './LeadSelectionModal.css';
import { API_BASE_URL } from '../../config';

const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_CONFIG = {
  'Paid':           { bg: '#ecfdf5', color: '#059669', border: '#a7f3d0', icon: '✓' },
  'Unpaid':         { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', icon: '✗' },
  'Partially Paid': { bg: '#fffbeb', color: '#d97706', border: '#fde68a', icon: '◐' },
};

const computePaymentStatus = (inv) => {
  const totalDue = Number(inv.total_due) || 0;
  const amountPaid = Number(inv.paid_amount) || 0;
  if (inv.payment_status == 1 || (totalDue > 0 && amountPaid >= totalDue)) return 'Paid';
  if (Number(inv.payment_status) === 2 || amountPaid > 0) return 'Partially Paid';
  return 'Unpaid';
};

const LeadSelectionModal = ({ isOpen, onClose, thread }) => {
  const navigate = useNavigate();
  const portalRef = useRef(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const el = document.createElement('div');
    el.setAttribute('id', 'lead-modal-portal');
    el.style.cssText = [
      'position: fixed',
      'top: 0',
      'left: 0',
      'width: 100vw',
      'height: 100vh',
      'z-index: 2147483647',
      'pointer-events: none',
      'display: flex',
      'align-items: center',
      'justify-content: center',
    ].join(' !important; ') + ' !important;';
    document.body.appendChild(el);
    portalRef.current = el;

    return () => {
      if (document.body.contains(el)) {
        document.body.removeChild(el);
      }
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !thread) return;

    let cancelled = false;
    setInvoices([]);
    setLoading(true);

    const preferenceIds = (thread.pastInquiries || [])
      .map(i => i.id)
      .filter(Boolean);
    if (thread.preferences?.id) preferenceIds.push(thread.preferences.id);
    const uniquePrefs = [...new Set(preferenceIds)];

    const params = new URLSearchParams();
    const userId = thread.userId || thread.user?.id;
    if (userId) params.set('userId', userId);
    if (uniquePrefs.length > 0) params.set('preferenceIds', uniquePrefs.join(','));
    const phone = thread.id || thread.user?.phone;
    if (phone) params.set('phone', phone);
    const email = thread.user?.email;
    if (email && email !== 'No email provided') params.set('email', email);

    fetch(`${API_BASE_URL}/invoices/by-contact?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        if (!cancelled) setInvoices(data.invoices || []);
      })
      .catch(err => {
        console.error('Failed to fetch invoices for contact:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [isOpen, thread]);

  if (!isOpen || !thread || !portalRef.current) return null;

  const contactName = thread.user?.name || 'Unknown';
  const contactEmail = thread.user?.email || '';
  const contactPhone = thread.id || '';

  const handleOpenInvoice = (inv) => {
    onClose();
    navigate(`/sales/crm/create-invoice/${inv.id}`, {
      state: {
        invoiceIdFromCRM: inv.id,
        existingInvoiceNumber: inv.invoice_number,
      },
    });
  };

  const handleCreateNewInvoice = () => {
    onClose();
    navigate('/sales/crm/create-invoice', {
      state: {
        prefilledCustomer: {
          name: contactName !== 'Unknown' ? contactName : '',
          email: contactEmail || '',
          phone: contactPhone || thread.user?.phone || '',
          userId: thread.userId || thread.user?.id || null,
        },
      },
    });
  };

  return createPortal(
    <div
      className="lead-selection-backdrop"
      onClick={onClose}
      style={{ pointerEvents: 'all' }}
    >
      <div
        className="lead-selection-container"
        style={{ maxWidth: '520px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="lead-selection-header">
          <div className="header-title">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: '#4f46e5', marginRight: '8px' }}
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            Invoices
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Contact info bar */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #f3f4f6', backgroundColor: '#fafafa', fontSize: '13px', color: '#4b5563', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, color: '#111827' }}>{contactName}</span>
          {contactPhone && <span>{contactPhone}</span>}
          {contactEmail && <span style={{ color: '#6b7280' }}>{contactEmail}</span>}
        </div>

        {/* Invoice List */}
        <div className="lead-selection-list" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {loading && (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
              Loading invoices...
            </div>
          )}

          {!loading && invoices.length === 0 && (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
              No invoices found for this contact.
            </div>
          )}

          {!loading && invoices.map((inv) => {
            let parsedItems = [];
            try {
              if (inv.items_json) parsedItems = JSON.parse(inv.items_json);
            } catch { /* ignore */ }

            const status = computePaymentStatus(inv);
            const sc = STATUS_CONFIG[status] || STATUS_CONFIG['Unpaid'];
            const d = new Date(inv.created_on);
            const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

            return (
              <div
                key={inv.id}
                className="lead-option-row"
                onClick={() => handleOpenInvoice(inv)}
                style={{ cursor: 'pointer' }}
              >
                <div className="option-content" style={{ width: '100%' }}>
                  {/* Top: Invoice number + Status + Date */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 700, fontSize: '14px', color: '#111827' }}>{inv.invoice_number}</span>
                      <span
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          padding: '2px 8px', borderRadius: '12px',
                          fontSize: '11px', fontWeight: 700,
                          border: `1px solid ${sc.border}`, backgroundColor: sc.bg, color: sc.color,
                        }}
                      >
                        {sc.icon} {status}
                      </span>
                    </div>
                    <span style={{ fontSize: '12px', color: '#9ca3af' }}>{dateStr}</span>
                  </div>

                  {/* Items */}
                  <div style={{ marginBottom: '6px' }}>
                    {parsedItems.map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#374151', marginBottom: '2px' }}>
                        <span style={{ flex: 1, color: '#4b5563' }}>{item.name || item.description || 'Item'}{item.quantity > 1 ? ` x${item.quantity}` : ''}</span>
                        <span style={{ fontWeight: 500, marginLeft: '8px' }}>${fmt((Number(item.price) || 0) * (Number(item.quantity) || 1))}</span>
                      </div>
                    ))}
                  </div>

                  {/* Total */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '15px', color: '#111827', borderTop: '1px solid #f3f4f6', paddingTop: '6px' }}>
                    <span>Total</span>
                    <span>${fmt(inv.total_due)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="lead-selection-footer">
          <button className="cancel-btn" onClick={onClose}>Cancel</button>
          <button
            className="create-invoice-btn"
            onClick={handleCreateNewInvoice}
            style={{
              backgroundColor: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 18px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            + Create New Invoice
          </button>
        </div>
      </div>
    </div>,
    portalRef.current
  );
};

export default LeadSelectionModal;
