import React, { useState } from 'react';
import ConsignmentAgreementModal from './ConsignmentAgreementModal';
import { getConsignments, compOptionsFor } from './vehicleAgreementUtils';
import './VehicleConsignmentSummary.css';

// Shown under a vehicle line in the "Invoice Items" table once a consignment
// agreement has been generated and sent. For every consignment on the vehicle it
// shows:
//   - the agreement status (Signed / Sent) with a View link
//   - the Dealer Compensation that was chosen in the agreement
//   - the "no price will be shown" note
//
// Props
//   vehicle : the cart item (type 'V')
//   data    : vehicleAgreements[vehicleKey] for this vehicle
const VehicleConsignmentSummary = ({ vehicle, data }) => {
  const [viewId, setViewId] = useState(null);
  const list = getConsignments(data);
  if (list.length === 0) return null;

  const viewing = list.find((c) => c.id === viewId);

  return (
    <div className="vc-wrap">
      {list.map((c, i) => {
        const signed = c.status === 'signed';
        const options = compOptionsFor(c);
        const suffix = list.length > 1 ? ` #${i + 1}` : '';

        return (
          <div className="vc-item" key={c.id}>
            <div className="vc-status">
              <span className={`vc-badge ${signed ? 'signed' : 'sent'}`} aria-hidden="true">
                {signed ? '✓' : '✉'}
              </span>
              <span className={`vc-status-text ${signed ? 'signed' : 'sent'}`}>
                {signed ? 'Signed Consignment Agreement' : 'Consignment Agreement sent for signature'}
                {suffix}
              </span>
              <button type="button" className="vc-view" onClick={() => setViewId(c.id)}>
                📄 View
              </button>
            </div>

            <div className="vc-comp">
              <div className="vc-comp-heading">Dealer Compensation (choose one)</div>
              <div className="vc-options">
                {options.map((o) => (
                  <div key={o.key} className={`vc-option ${o.selected ? 'selected' : ''}`}>
                    <span className="vc-radio" aria-hidden="true" />
                    <div>
                      <div className="vc-option-title">{o.title}</div>
                      <div className="vc-option-note">{o.note}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="vc-note">
              <span className="vc-note-icon">i</span>
              <div>
                No price will be shown on the invoice for this item.
                <br />
                {signed
                  ? 'A consignment agreement was signed and will be sent to the seller.'
                  : 'A consignment agreement was sent to the seller for e-signature.'}
              </div>
            </div>
          </div>
        );
      })}

      {viewing && (
        <ConsignmentAgreementModal
          readOnly
          vehicle={vehicle}
          data={viewing}
          onClose={() => setViewId(null)}
          onSubmit={() => {}}
        />
      )}
    </div>
  );
};

export default VehicleConsignmentSummary;