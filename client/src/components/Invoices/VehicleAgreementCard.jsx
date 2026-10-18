import React, { useState } from 'react';
import ConsignmentAgreementModal from './ConsignmentAgreementModal';
import ReferralFeeModal from './ReferralFeeModal';
import { getConsignments, withConsignments, consignmentSummary, money } from './vehicleAgreementUtils';
import './VehicleAgreementCard.css';
import { API_BASE_URL } from "../../config";

// ── Vehicle agreements: Consignment + Referral Fee ───────────────────────────
//   Add Consignment   -> ConsignmentAgreementModal (can be added again and again)
//   Add Referral Fee  -> ReferralFeeModal          (one per vehicle)
//
// Props
//   vehicle   : the cart item (type 'V') this card belongs to
//   vehicles  : (optional) every attached vehicle, for the referral Vehicle dropdown
//   customer  : (optional) the page's customerInfo, prefills the referral customer section
//   agentName : (optional) name shown in "Referred By"
//   data      : { consignments?: [...], referral?: {...} } for this vehicle
//   onChange  : (nextData) => void   called with the full updated object

const Row = ({ icon, title, sub, chip, onEdit, onRemove, label, isSigned }) => (
    <div className="va-saved">
        <span className="va-saved-icon">{icon}</span>
        <div className="va-saved-text">
            <div className="va-saved-title">
                {title}
                {chip}
            </div>
            {sub && <div className="va-saved-sub">{sub}</div>}
        </div>
       {!isSigned && (
            <>
                <button type="button" className="va-icon-btn" onClick={onEdit} title="Edit" aria-label={`Edit ${label}`}>✏️</button>
                <button type="button" className="va-icon-btn danger" onClick={onRemove} title="Remove" aria-label={`Remove ${label}`}>✕</button>
            </>
        )}
    </div>
);

const todayStamp = () => {
    const d = new Date();
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
};

const referralSummary = (v) =>
    [money(v.amount), v.referralType === 'seller' ? 'Seller' : 'Buyer', v.paymentStatus].filter(Boolean).join(' • ');

const StatusChip = ({ status }) => {
    const signed = status === 'signed';
    return (
        <span
            style={{
                marginLeft: 6, padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                background: signed ? '#dcfce7' : '#fef3c7', color: signed ? '#16a34a' : '#b45309',
            }}
        >
            {signed ? 'Signed' : 'Sent'}
        </span>
    );
};

const VehicleAgreementCard = ({ vehicle, vehicles, customer, agentName, data = {}, onChange, vehicleKey, invoiceId: invoiceIdProp, ensureInvoiceSaved }) => {
    // { kind: 'consignment', id?: string } | { kind: 'referral' } | null
    const [modal, setModal] = useState(null);
    const closeModal = () => setModal(null);

    const consignments = getConsignments(data);
    const editingConsignment =
        modal && modal.kind === 'consignment' && modal.id ? consignments.find((c) => c.id === modal.id) : undefined;

    // Called when "Generate & Send Consignment Agreement" is pressed. Adds a new
    // consignment, or replaces the one being edited. Either way it is (re)sent, so
    // its status goes back to "sent" until it is signed.
    const saveConsignment = async (form, sendMethod = 'both') => {
        try {
            let invoiceId = invoiceIdProp;
            if (!invoiceId) {
                const saved = await ensureInvoiceSaved?.();
                invoiceId = saved?.invoiceId;
            }
            if (!invoiceId) throw new Error('Please save the invoice first.');

            const res = await fetch(`${API_BASE_URL}/consignments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    invoiceId,
                    vehicleKey,
                    consignmentId: modal.id || null,
                    form,
                    sendMethod,
                    seller: {
                        name: customer?.name || '',
                        email: customer?.email || '',
                        phone: customer?.phone || '',
                    }
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.message || 'Failed to send agreement');

            const saved = {
                ...json.consignment.form,
                id: json.consignment.id,
                status: json.consignment.status,
                stamp: todayStamp(),
            };
            const list = modal.id
                ? consignments.map((c) => (c.id === modal.id ? saved : c))
                : [...consignments, saved];
            onChange(withConsignments(data, list));
            closeModal();

            if (json.warning) {
                alert(`⚠️ ${json.warning}`);
            } else {
                const d = json.delivery || {};
                if (d.sms === false) alert('⚠️ Saved, but the SMS could not be delivered.');
                if (d.email === false) alert('⚠️ Saved, but the email could not be delivered.');
            }

        } catch (err) {
            alert(`❌ ${err.message}`);
            throw err; // lets the modal re-enable its button
        }
    };

    // Add the sendMethod parameter (defaults to sms just in case)
    const saveReferral = async (form, sendMethod = 'both') => {
        try {
            let invoiceId = invoiceIdProp;
            if (!invoiceId) {
                const saved = await ensureInvoiceSaved?.();
                invoiceId = saved?.invoiceId;
            }
            if (!invoiceId) throw new Error('Please save the invoice first.');

            const res = await fetch(`${API_BASE_URL}/referrals/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    invoiceId,
                    vehicleKey,
                    form,
                    sendMethod // <-- Passes "sms", "email", "both", or "manual"
                }),
            });
            
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.message || 'Failed to send referral agreement');

            // Update local state so it appears on the invoice
            onChange({ ...data, referral: { ...form, status: json.status, id: json.referralId, stamp: todayStamp() } });
            closeModal();

            if (json.status !== 'manual' && !json.delivery?.sms && ['sms', 'both'].includes(sendMethod)) {
                alert('⚠️ Saved, but the SMS could not be delivered.');
            }
            if (json.status !== 'manual' && !json.delivery?.email && ['email', 'both'].includes(sendMethod)) {
                alert('⚠️ Saved, but the Email could not be delivered.');
            }

        } catch (err) {
            alert(`❌ ${err.message}`);
            throw err; // Throws so the modal can reset its loading state
        }
    };

    const removeReferral = async () => {
        if (!window.confirm('Remove this referral fee?')) return;
        
        // If it was saved to the database, delete it there first
        if (data.referral?.id) {
            try {
                const res = await fetch(`${API_BASE_URL}/referrals/${data.referral.id}`, { method: 'DELETE' });
                const json = await res.json();
                if (!res.ok || !json.success) throw new Error(json.message || 'Failed to remove');
            } catch (err) {
                alert(`❌ ${err.message}`);
                return; // Stop if db delete fails
            }
        }
        
        // Update the local state to remove it from the UI
        const { referral, ...rest } = data;
        onChange(rest);
    };

    const removeConsignment = async (id) => {
        if (!window.confirm('Remove this consignment agreement?')) return;
        try {
            const res = await fetch(`${API_BASE_URL}/consignments/${id}`, { method: 'DELETE' });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.message || 'Failed to remove');
            onChange(withConsignments(data, consignments.filter((c) => c.id !== id)));
        } catch (err) {
            alert(`❌ ${err.message}`);
        }
    };



    const vehicleName = (vehicle && (vehicle.name || vehicle.display_name)) || 'Vehicle';

    return (
        <div className="va-card">
            <div className="va-vehicle">
                <span className="va-vehicle-icon">🚗</span>
                <div className="va-vehicle-info">
                    <div className="va-vehicle-name">{vehicleName}</div>
                    {vehicle && vehicle.description ? <div className="va-vehicle-desc">{vehicle.description}</div> : null}
                </div>
            </div>

            {(data.referral || consignments.length > 0) && (
                <div className="va-saved-list">
                    {data.referral && (
                        <Row
                            icon="🤝"
                            title={`Referral Fee ${data.referral.stamp || ''}`}
                            chip={<StatusChip status={data.referral.status} />}
                            sub={referralSummary(data.referral)}
                            label="Referral Fee"
                            isSigned={data.referral.status === 'signed'}
                            onEdit={() => setModal({ kind: 'referral' })}
                            onRemove={removeReferral}
                        />
                    )}
                    {consignments.map((c) => (
                        <Row
                            key={c.id}
                            icon="📄"
                            title={`Consignment ${c.stamp || ''}`}
                            chip={<StatusChip status={c.status} />}
                            sub={consignmentSummary(c)}
                            label="Consignment"
                            isSigned={c.status === 'signed'}
                            onEdit={() => setModal({ kind: 'consignment', id: c.id })}
                            onRemove={() => removeConsignment(c.id)}
                        />
                    ))}
                </div>
            )}

            <div className="va-actions">
                <button type="button" className="va-add-btn" onClick={() => setModal({ kind: 'consignment' })}>
                    <span aria-hidden="true">＋</span> Add Consignment
                </button>
                {!data.referral && (
                    <button type="button" className="va-add-btn" onClick={() => setModal({ kind: 'referral' })}>
                        <span aria-hidden="true">＋</span> Add Referral Fee
                    </button>
                )}
            </div>

            {modal && modal.kind === 'consignment' && (
                <ConsignmentAgreementModal
                    vehicle={vehicle}
                    data={editingConsignment}
                    onClose={closeModal}
                    onSubmit={saveConsignment}
                />
            )}

            {modal && modal.kind === 'referral' && (
                <ReferralFeeModal
                    vehicle={vehicle}
                    vehicles={vehicles}
                    customer={customer}
                    agentName={agentName}
                    data={data.referral}
                    onClose={closeModal}
                    onSubmit={saveReferral}
                />
            )}
        </div>
    );
};

export default VehicleAgreementCard;