import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

const buildQuery = (contact) => {
  const params = new URLSearchParams();
  const userId = contact.userId || contact.user?.id || contact.preferenceUserId || contact.user_id;
  if (userId) params.set('userId', userId);

  const prefIds = (contact.pastInquiries || []).map(i => i.id).filter(Boolean);
  if (contact.preferenceId) prefIds.push(contact.preferenceId);
  if (contact.preferences?.id) prefIds.push(contact.preferences.id);
  const unique = [...new Set(prefIds)];
  if (unique.length > 0) params.set('preferenceIds', unique.join(','));

  const phone = contact.id || contact.phone || contact.user?.phone;
  if (phone) params.set('phone', phone);

  const email = contact.email || contact.user?.email;
  if (email && email !== 'No email provided') params.set('email', email);

  return params;
};

// Compact inline list on the inbox cards: shows only the LATEST 3 invoices.
// The full list (all invoices) lives in the popup opened via the Assign button.
const ContactInvoicesList = ({
  contact,
  onViewAll,
  max = 3,
  emptyText = 'No invoices found for this contact.',
}) => {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);

  // Stable identity so the card only refetches when the contact ACTUALLY changes,
  // not on every inbox re-render / 20s auto-refresh (that churn flooded the
  // browser with concurrent requests -> net::ERR_INSUFFICIENT_RESOURCES).
  const contactKey = [
    contact?.id || '',
    contact?.userId || contact?.user?.id || '',
    contact?.preferenceId || contact?.preferences?.id || '',
    contact?.phone || contact?.user?.phone || '',
    (contact?.pastInquiries || []).map(i => i.id).join(',')
  ].join('|');

  useEffect(() => {
    if (!contact) return;
    let cancelled = false;
    setInvoices([]);
    setLoading(true);

    const params = buildQuery(contact);
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
  }, [contactKey]);

  const visible = invoices.slice(0, max);
  const extraCount = invoices.length - visible.length;

  if (loading) {
    return (
      <div style={{ fontSize: '12px', color: '#9ca3af', padding: '4px 0' }}>Loading invoices...</div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div style={{ fontSize: '12px', color: '#9ca3af', padding: '4px 0' }}>{emptyText}</div>
    );
  }

  const chipStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '3px 10px',
    borderRadius: '14px',
    fontSize: '11px',
    fontWeight: 600,
    border: '1px solid',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'opacity 0.15s',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', width: '100%' }}>
      {visible.map(inv => {
        const status = computePaymentStatus(inv);
        const sc = STATUS_CONFIG[status] || STATUS_CONFIG['Unpaid'];

        return (
          <span
            key={inv.id}
            title={`${inv.invoice_number} — ${status}`}
            onClick={() => navigate(`/sales/crm/create-invoice/${inv.id}`, {
              state: { invoiceIdFromCRM: inv.id, existingInvoiceNumber: inv.invoice_number },
            })}
            style={{
              ...chipStyle,
              borderColor: sc.border,
              backgroundColor: sc.bg,
              color: sc.color,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            {inv.invoice_number} · ${fmt(inv.total_due)}
          </span>
        );
      })}

      {extraCount > 0 && (
        <span
          title={`View all ${invoices.length} invoices`}
          onClick={onViewAll}
          style={{
            ...chipStyle,
            borderColor: '#e5e7eb',
            backgroundColor: '#f9fafb',
            color: '#6b7280',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
        >
          +{extraCount} more
        </span>
      )}
    </div>
  );
};

export default ContactInvoicesList;