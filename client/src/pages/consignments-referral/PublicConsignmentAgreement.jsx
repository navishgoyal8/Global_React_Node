import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { API_BASE_URL } from '../../config'; // Adjust path as needed

// ── Dealer branding shown in the page header & PDF ──────────────────────────
const DEALER = {
  logoTop: 'COVENANT',
  logoBottom: 'AUTO SALES',
  tagline: 'QUALITY VEHICLES. TRUSTED SERVICE.',
  address: '721 North B St, Sacramento, CA 95811',
  license: 'California Dealer #12345',
};

const US_STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];

// ── Helpers ─────────────────────────────────────────────────────────────────
const money = (n) =>
  `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const fmtDate = (v) => {
  if (!v) return '';
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m && !String(v).includes('T')) return `${m[2]}/${m[3]}/${m[1]}`;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(v))) return String(v);
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-US');
};

const todayDisplay = () => new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ── Small icon set ─────────────────────────
const Svg = ({ children, size = 22, fill = 'none' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const IconPin = () => <Svg size={20}><path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.4" /></Svg>;
const IconLicense = () => <Svg size={20}><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M10 15l2 2 3.5-4" /></Svg>;
const IconDoc = ({ size = 22 }) => <Svg size={size}><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></Svg>;
const IconRefresh = () => <Svg><path d="M20 11a8 8 0 0 0-14.5-3.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14.5 3.5M20 20v-4.5h-4.5" /></Svg>;
const IconShield = () => <Svg><path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></Svg>;
const IconWarn = () => <Svg size={26}><path d="M12 3L2 20h20L12 3z" /><path d="M12 10v5M12 18v.5" /></Svg>;
const IconPen = () => <Svg size={18}><path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" /><path d="M14 6l3 3" /></Svg>;
const IconSign = () => <Svg size={22}><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M10 15l2 2 3.5-4" /></Svg>;
const IconDownload = () => <Svg size={20}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></Svg>;

// ── Layout building blocks ───────────────────────────────────────────────────
const Section = ({ num, title, children }) => (
  <section className="pca-section">
    <h2 className="pca-sec-title">
      <span className="pca-sec-num">{num}</span>
      {title}
    </h2>
    {children}
  </section>
);

const Field = ({ label, value, mono, className = '', options }) => (
  <div className={`pca-field ${className}`}>
    <span className="pca-label">{label}</span>
    {options ? (
      <select className="pca-value pca-select" value={value || ''} disabled>
        <option value="">—</option>
        {options.map((o) => (<option key={o} value={o}>{o}</option>))}
      </select>
    ) : (
      <div className={`pca-value ${mono ? 'mono' : ''}`}>{value === 0 || value ? value : '—'}</div>
    )}
  </div>
);

const Disclosure = ({ tone, icon, title, children }) => (
  <div className={`pca-disc ${tone}`}>
    <span className={`pca-disc-icon ${tone}`}>{icon}</span>
    <div className="pca-disc-text">
      <h4>{title}</h4>
      <p>{children}</p>
    </div>
  </div>
);

// ── Signature pad ────────────────────────
const SignaturePad = ({ onChange }) => {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvasRef.current;
    const ratio = window.devicePixelRatio || 1;
    const r = c.getBoundingClientRect();
    c.width = r.width * ratio;
    c.height = r.height * ratio;
    const ctx = c.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e3a8a';
  }, []);

  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const start = (e) => {
    e.preventDefault();
    canvasRef.current.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = pos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.01, y);
    ctx.stroke();
  };

  const move = (e) => {
    if (!drawing.current) return;
    const { x, y } = pos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setEmpty(false);
    onChange(canvasRef.current.toDataURL('image/png'));
  };

  const clear = () => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    c.getContext('2d').clearRect(0, 0, r.width, r.height);
    setEmpty(true);
    onChange('');
  };

  return (
    <div className="pca-pad-wrap">
      <canvas
        ref={canvasRef}
        className="pca-pad"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      {empty && (
        <span className="pca-pad-hint">
          <IconPen /> Sign here with your finger or mouse
        </span>
      )}
      <button type="button" className="pca-pad-clear" onClick={clear}>Clear</button>
    </div>
  );
};

// ── PDF Hidden Template Component ─────────────────────────────────────────
const PdfTemplate = ({ agreement }) => {
  if (!agreement) return null;

  const getPdfCompText = () => {
    if (agreement.compType === 'min') return 'Dealer retains all sale proceeds above the agreed minimum amount.';
    if (agreement.compType === 'flat') return 'Dealer receives a flat fee from the sale proceeds.';
    if (agreement.compType === 'percent') return 'Dealer receives a percentage of the total sale price.';
    return '';
  };

  const getPdfCompValue = () => {
    if (agreement.compType === 'min') return money(agreement.minPrice);
    if (agreement.compType === 'flat') return money(agreement.flatFee);
    if (agreement.compType === 'percent') return `${agreement.commission}%`;
    return '';
  };

  return (
    <div id="pdf-template" className="pdf-container">
      <div className="pdf-header">
        <h1 className="pdf-dealer-title">{DEALER.logoTop} {DEALER.logoBottom}</h1>
        <p className="pdf-dealer-address">{DEALER.address} | {DEALER.license}</p>
        <h2 className="pdf-doc-title">CALIFORNIA VEHICLE CONSIGNMENT AGREEMENT</h2>
        <p className="pdf-doc-subtitle">Signed Seller Copy - California Vehicle Code §§ 11729-11730</p>
      </div>

      <div className="pdf-section">
        <h3 className="pdf-sec-title">1. Parties</h3>
        <table className="pdf-table">
          <tbody>
            <tr>
              <td className="pdf-td-label">Consignee / Dealer</td>
              <td className="pdf-td-value">{DEALER.logoTop} {DEALER.logoBottom}</td>
              <td className="pdf-td-label">Agreement Date</td>
              <td className="pdf-td-value">{fmtDate(agreement.startDate)}</td>
            </tr>
            <tr>
              <td className="pdf-td-label">Consignor / Owner</td>
              <td className="pdf-td-value">{agreement.dbSignedName || agreement.sellerName}</td>
              <td className="pdf-td-label">Phone</td>
              <td className="pdf-td-value">{agreement.sellerPhone}</td>
            </tr>
            <tr>
              <td className="pdf-td-label">Email</td>
              <td className="pdf-td-value">{agreement.sellerEmail}</td>
              <td className="pdf-td-label">Address</td>
              <td className="pdf-td-value">{[agreement.sellerAddress, agreement.sellerCity, agreement.sellerState, agreement.sellerZip].filter(Boolean).join(', ')}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="pdf-section">
        <h3 className="pdf-sec-title">2. Vehicle</h3>
        <table className="pdf-table">
          <tbody>
            <tr>
              <td className="pdf-td-label">Year / Make / Model</td>
              <td className="pdf-td-value">{agreement.year} {agreement.make} {agreement.model}</td>
              <td className="pdf-td-label">Mileage</td>
              <td className="pdf-td-value">{agreement.mileage}</td>
            </tr>
            <tr>
              <td className="pdf-td-label">VIN</td>
              <td className="pdf-td-value" style={{ fontFamily: 'monospace' }}>{agreement.vin}</td>
              <td className="pdf-td-label">Plate</td>
              <td className="pdf-td-value">{agreement.licensePlate || 'N/A'}</td>
            </tr>
            <tr>
              <td className="pdf-td-label">Odometer</td>
              <td className="pdf-td-value">{agreement.odometer}</td>
              <td className="pdf-td-label">Color</td>
              <td className="pdf-td-value">{agreement.color || 'N/A'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="pdf-section">
        <h3 className="pdf-sec-title">3. Consignment Terms and Compensation</h3>
        <table className="pdf-table">
          <tbody>
            <tr>
              <td className="pdf-td-label">Listing / Asking Price</td>
              <td className="pdf-td-value">{money(agreement.listPrice)}</td>
              <td className="pdf-td-label">Term</td>
              <td className="pdf-td-value">{agreement.duration} months</td>
            </tr>
            <tr>
              <td className="pdf-td-label">Start Date</td>
              <td className="pdf-td-value">{fmtDate(agreement.startDate)}</td>
              <td className="pdf-td-label">Expiration</td>
              <td className="pdf-td-value">{fmtDate(agreement.endDate)}</td>
            </tr>
            <tr>
              <td className="pdf-td-label">Dealer Compensation</td>
              <td className="pdf-td-value">{getPdfCompText()}</td>
              <td className="pdf-td-label">Agreed Compensation Value</td>
              <td className="pdf-td-value">{getPdfCompValue()}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="pdf-section">
        <h3 className="pdf-sec-title">4. Liens, Title, Repairs and Insurance</h3>
        <table className="pdf-table">
          <tbody>
            <tr>
              <td className="pdf-td-label">Liens</td>
              <td className="pdf-td-value">{agreement.hasLiens === 'yes' ? agreement.lienholder : 'None disclosed'}</td>
              <td className="pdf-td-label">Title in Hand</td>
              <td className="pdf-td-value">{agreement.titleInHand === 'yes' ? 'Yes' : 'No'}</td>
            </tr>
            <tr>
              <td className="pdf-td-label">Repairs</td>
              <td className="pdf-td-value">{agreement.repairAuth} up to {money(agreement.maxRepair)}. {agreement.requireApproval ? 'Approval required above that.' : ''}</td>
              <td className="pdf-td-label">Insurance</td>
              <td className="pdf-td-value">{agreement.insurance}. {agreement.insuranceNotes}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="pdf-section">
        <h3 className="pdf-sec-title">5. Required Consignment Terms</h3>
        <ol className="pdf-list">
          <li><strong>Vehicle held for sale.</strong> The vehicle is delivered to the dealer for the purpose of sale under this written consignment agreement. The dealer may not use the vehicle for another purpose without the consignor's express written consent.</li>
          <li><strong>Term and return.</strong> This agreement applies only for the stated term. If the vehicle remains unsold when the agreement terminates, it will be returned to the consignor unless the parties execute a written renewal or other lawful written agreement.</li>
          <li><strong>Payment.</strong> If the vehicle is sold, money due to the consignor will be disbursed within 20 days after the date of sale, subject to lawful lien payoff and authorized charges.</li>
          <li><strong>Accounting.</strong> Within 20 days after sale, the dealer will provide an accounting identifying the sale date, total sale price, authorized repairs and supporting records, liens/payoffs and supporting evidence, and the amount due to the consignor.</li>
          <li><strong>Trust and use.</strong> The vehicle and sale proceeds will be handled in accordance with applicable California law and the written terms of this agreement.</li>
          <li><strong>Transfer documents.</strong> The consignor agrees to furnish title and other ownership-transfer documents reasonably required to transfer the vehicle to the purchaser after payment and satisfaction of applicable conditions.</li>
          <li><strong>Notice to consignor.</strong> Failure of the consignee to comply with applicable California consignment requirements may constitute a violation of law. The consignor may contact the California DMV if the consignor believes a violation has occurred.</li>
        </ol>
      </div>

      <div className="pdf-section">
        <h3 className="pdf-sec-title">6. Seller Representations</h3>
        <p className="pdf-text">
          The consignor represents that the consignor has authority to consign the vehicle; has disclosed known liens and title issues; and has provided materially accurate information concerning ownership, mileage, and the vehicle information stated above. Nothing in this agreement waives rights or duties that cannot lawfully be waived under California law.
        </p>
      </div>

      <div className="pdf-section">
        <h3 className="pdf-sec-title">7. Electronic Signature and Signed Record</h3>
        <p className="pdf-text" style={{ marginBottom: '20px' }}>
          The parties consent to electronic records and electronic signatures. A completed electronic copy of this agreement is intended to serve as the parties' signed record.
        </p>
        <table className="pdf-table signature-table">
          <tbody>
            <tr>
              <td className="pdf-sig-label">Consignor / Owner Signature</td>
              <td className="pdf-sig-label">Dealer Authorized Representative</td>
            </tr>
            <tr>
              <td className="pdf-sig-box">
                {agreement.dbSignature ? (
                  <img src={agreement.dbSignature} alt="Signature" className="pdf-sig-img" />
                ) : (
                  <span className="pdf-sig-typed">/s/ {agreement.dbSignedName}</span>
                )}
              </td>
              <td className="pdf-sig-box">
                <span className="pdf-sig-typed">/s/ {DEALER.logoTop} {DEALER.logoBottom}</span>
              </td>
            </tr>
            <tr>
              <td className="pdf-sig-meta">{agreement.dbSignedName} - Signed {fmtDate(agreement.signedAt)}</td>
              <td className="pdf-sig-meta">Authorized Representative - Signed {fmtDate(agreement.signedAt)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="pdf-footer">
        Document status: SIGNED | Agreement ID: {agreement.id ? `CAS-CONS-${agreement.id}` : 'PENDING'} | Electronic signature record retained.
      </div>
    </div>
  );
};

// ── Main Page Component ─────────────────────────────────────────────────────
const PublicConsignmentAgreement = () => {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [agreement, setAgreement] = useState(null);

  const [agreed1, setAgreed1] = useState(false);
  const [agreed2, setAgreed2] = useState(false);
  const [signature, setSignature] = useState('');
  const [ownerDate, setOwnerDate] = useState(todayISO());
  const [dealerDate, setDealerDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fetchAgreement = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/consignments/public/${token}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Agreement not found.');
        
        setAgreement({
          ...data.agreement.form,
          sellerName: data.agreement.sellerName,
          sellerEmail: data.agreement.sellerEmail,
          sellerPhone: data.agreement.sellerPhone,
          status: data.agreement.status,
          signedAt: data.agreement.signedAt,
          dbSignedName: data.agreement.signedName,
          dbSignature: data.agreement.signature,
          id: data.agreement.id
        });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchAgreement();
  }, [token]);

  const handleSign = async (e) => {
    e.preventDefault();
    if (!agreed1 || !agreed2) {
      alert('Please check both acknowledgment boxes to proceed.');
      return;
    }
    if (!signature) {
      alert('Please draw your signature to proceed.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/consignments/public/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signedName: (agreement.sellerName || '').trim(),
          signature,
          signedDate: ownerDate,
          dealerDate: dealerDate,
          agree: true
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to sign agreement.');

      setSuccess(true);
      setAgreement((prev) => ({ 
        ...prev, 
        status: 'signed', 
        dbSignature: signature, 
        dbSignedName: (agreement.sellerName || '').trim(),
        signedAt: new Date().toISOString() 
      }));
    } catch (err) {
      alert(`❌ ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    try {
      const element = document.getElementById('pdf-template');
      
      // Briefly show it so html2canvas can grab the layout
      element.style.display = 'block';
      // Wait a tick to ensure the DOM recalculates heights
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const canvas = await html2canvas(element, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      
      // Hide it again
      element.style.display = 'none';

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfPageHeight = pdf.internal.pageSize.getHeight();
      
      // Calculate total height of the image based on A4 width
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      // Add the first page
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfPageHeight;

      // Add new pages if the content bleeds past one page
      while (heightLeft > 0) {
        position -= pdfPageHeight; // Shift the image up by exactly one page height
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfPageHeight;
      }

      pdf.save(`Consignment_Agreement_${agreement.vin || 'Signed'}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'sans-serif' }}>Loading agreement details...</div>;
  if (error) return <div style={{ padding: 40, textAlign: 'center', color: '#dc2626', fontFamily: 'sans-serif' }}>{error}</div>;
  if (!agreement) return null;

  const isSigned = agreement.status === 'signed' || success;

  const compCards = [
    { key: 'min', title: 'Minimum Price', detail: `Dealer keeps amount above ${money(agreement.minPrice)}`, has: Number(agreement.minPrice) > 0 },
    { key: 'flat', title: 'Flat Fee', detail: `${money(agreement.flatFee)} to dealer`, has: Number(agreement.flatFee) > 0 },
    { key: 'percent', title: 'Percentage of Sale Price', detail: `${agreement.commission}% of sale price`, has: Number(agreement.commission) > 0 },
  ].filter((c) => c.has || c.key === agreement.compType);

 return (
    <div className="pca-wrapper">
      <style>{`
        .pca-wrapper, .pca-wrapper *, .pca-wrapper *::before, .pca-wrapper *::after { box-sizing: border-box; }
        .pca-wrapper { background: #eef3fb; min-height: 100vh; padding: 20px 12px 40px; font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif; color: #111827; }
        .pca-container { max-width: 900px; margin: 0 auto; }

        /* Hidden PDF Template Styles */
        .pdf-container { display: none; width: 800px; padding: 40px; background: white; color: black; font-family: 'Helvetica', 'Arial', sans-serif; position: absolute; top: 0; left: -9999px; }
        .pdf-header { text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 20px; }
        .pdf-dealer-title { font-size: 28px; font-weight: bold; color: #1e3a8a; margin: 0; }
        .pdf-dealer-address { font-size: 12px; color: #4b5563; margin: 5px 0 10px; }
        .pdf-doc-title { font-size: 18px; font-weight: bold; margin: 0 0 5px; }
        .pdf-doc-subtitle { font-size: 12px; color: #4b5563; margin: 0; }
        .pdf-section { margin-bottom: 20px; }
        .pdf-sec-title { font-size: 14px; font-weight: bold; border-bottom: 1px solid #d1d5db; padding-bottom: 4px; margin-bottom: 10px; color: #1e3a8a; text-transform: uppercase; }
        .pdf-table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .pdf-table td { border: 1px solid #d1d5db; padding: 6px 8px; }
        .pdf-td-label { background: #f3f4f6; font-weight: bold; width: 20%; color: #374151; }
        .pdf-td-value { width: 30%; }
        .pdf-list { font-size: 11px; padding-left: 20px; margin: 0; }
        .pdf-list li { margin-bottom: 6px; text-align: justify; }
        .pdf-text { font-size: 11px; text-align: justify; margin: 0; }
        .signature-table td { border: none !important; width: 50%; }
        .pdf-sig-label { font-weight: bold; border-bottom: 1px solid black !important; padding-bottom: 5px !important; }
        .pdf-sig-box { height: 60px; vertical-align: bottom; padding-top: 10px !important; }
        .pdf-sig-img { max-height: 50px; max-width: 100%; }
        .pdf-sig-typed { font-family: 'Brush Script MT', cursive; font-size: 20px; color: #1e3a8a; }
        .pdf-sig-meta { font-size: 10px; color: #6b7280; padding-top: 5px !important; }
        .pdf-footer { margin-top: 30px; font-size: 10px; text-align: center; color: #6b7280; border-top: 1px solid #d1d5db; padding-top: 10px; }

        /* UI Styles */
        .pca-brand { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding: 4px 4px 14px; }
        .pca-logo { display: flex; flex-direction: column; align-items: flex-start; line-height: 1; }
        .pca-logo-swoosh { width: 200px; height: 30px; margin-bottom: -6px; }
        .pca-logo-top { font-size: 34px; font-weight: 900; color: #1d4ed8; letter-spacing: 0.02em; }
        .pca-logo-bottom { font-size: 20px; font-weight: 600; color: #1f2937; letter-spacing: 0.32em; margin-top: 2px; }
        .pca-logo-tag { font-size: 9px; font-weight: 600; color: #6b7280; letter-spacing: 0.2em; margin-top: 6px; }
        .pca-dealer-info { display: flex; flex-direction: column; gap: 8px; font-size: 14px; color: #374151; }
        .pca-dealer-row { display: flex; align-items: center; gap: 10px; }
        .pca-dealer-row svg { color: #2563eb; flex-shrink: 0; }

        .pca-banner { display: flex; align-items: center; justify-content: center; gap: 16px; background: #dbeafe; border: 1px solid #bfdbfe; border-radius: 12px; padding: 16px 20px; margin-bottom: 14px; text-align: left; }
        .pca-banner-icon { color: #2563eb; flex-shrink: 0; }
        .pca-banner h1 { margin: 0; font-size: 24px; font-weight: 800; color: #1e3a8a; line-height: 1.2; }
        .pca-banner p { margin: 3px 0 0; font-size: 14px; color: #374151; }

        .pca-download-btn { display: inline-flex; align-items: center; gap: 8px; background: #16a34a; color: white; border: none; padding: 10px 16px; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; transition: background 0.2s; white-space: nowrap; }
        .pca-download-btn:hover { background: #15803d; }
        .pca-download-btn:disabled { opacity: 0.7; cursor: not-allowed; }

        .pca-section { background: #fff; border: 1px solid #dbe4f3; border-radius: 12px; padding: 16px 18px 18px; margin-bottom: 14px; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04); }
        .pca-sec-title { display: flex; align-items: center; gap: 12px; margin: 0 0 12px; font-size: 18px; font-weight: 700; color: #1e3a8a; }
        .pca-sec-num { width: 30px; height: 30px; border-radius: 50%; background: #2563eb; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800; flex-shrink: 0; }

        .pca-grid { display: grid; gap: 12px 16px; }
        .pca-g1 { grid-template-columns: 1fr; }
        .pca-g2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .pca-g3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .pca-g4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .pca-span-all { grid-column: 1 / -1; }

        .pca-field { min-width: 0; }
        .pca-label { display: block; margin-bottom: 5px; font-size: 13px; font-weight: 500; color: #4b5563; }
        .pca-value { min-height: 42px; display: flex; align-items: center; padding: 9px 12px; background: #fff; border: 1px solid #d5deed; border-radius: 8px; font-size: 15px; font-weight: 600; color: #111827; word-break: break-word; }
        .pca-value.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px; }
        .pca-select { appearance: none; -webkit-appearance: none; width: 100%; font-family: inherit; opacity: 1; color: #111827; }

        .pca-pay-lead { margin: 0 0 10px; font-size: 14px; color: #374151; }
        .pca-pay-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
        .pca-pay { display: flex; align-items: flex-start; gap: 10px; padding: 12px; border: 1px solid #dbe4f3; border-radius: 10px; background: #fff; }
        .pca-pay.selected { border-color: #2563eb; background: #eaf2ff; box-shadow: 0 0 0 1px #2563eb inset; }
        .pca-radio { width: 20px; height: 20px; flex-shrink: 0; border-radius: 50%; border: 2px solid #cbd5e1; background: #fff; position: relative; margin-top: 1px; }
        .pca-pay.selected .pca-radio { border-color: #2563eb; }
        .pca-pay.selected .pca-radio::after { content: ''; position: absolute; inset: 3px; border-radius: 50%; background: #2563eb; }
        .pca-pay-title { font-size: 14px; font-weight: 700; color: #1e3a8a; }
        .pca-pay-detail { margin-top: 3px; font-size: 13px; color: #374151; }

        .pca-disc { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 8px; margin-bottom: 10px; background: #eff4fb; }
        .pca-disc:last-child { margin-bottom: 0; }
        .pca-disc.warn { background: #fde8e8; border: 1px solid #fecaca; }
        .pca-disc-icon { width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 800; }
        .pca-disc-icon.green { background: #dcfce7; color: #16a34a; }
        .pca-disc-icon.blue { background: #dbeafe; color: #2563eb; }
        .pca-disc-icon.purple { background: #ede9fe; color: #7c3aed; }
        .pca-disc-icon.orange { background: #ffedd5; color: #ea580c; }
        .pca-disc-icon.warn { background: transparent; color: #dc2626; width: 34px; }
        .pca-disc-text h4 { margin: 0 0 3px; font-size: 14px; font-weight: 700; }
        .pca-disc.green h4 { color: #15803d; } .pca-disc.blue h4 { color: #1d4ed8; }
        .pca-disc.purple h4 { color: #6d28d9; } .pca-disc.orange h4 { color: #c2410c; }
        .pca-disc.warn h4 { color: #b91c1c; }
        .pca-disc-text p { margin: 0; font-size: 13px; line-height: 1.5; color: #374151; }
        .pca-disc.warn .pca-disc-text p { color: #7f1d1d; }

        .pca-check { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; cursor: pointer; }
        .pca-check:last-child { margin-bottom: 0; }
        .pca-check input { width: 18px; height: 18px; margin-top: 2px; accent-color: #2563eb; flex-shrink: 0; }
        .pca-check span { font-size: 14px; color: #1f2937; line-height: 1.45; }

        .pca-sign-box { position: relative; height: 130px; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 12px; border: 1px solid #d5deed; border-radius: 8px; background: #f3f6fb; color: #94a3b8; font-size: 14px; }
        .pca-sign-box.signed { background: #ecfdf5; border-color: #a7f3d0; color: #166534; }
        .pca-signed-name { font-family: 'Brush Script MT', 'Segoe Script', cursive; font-size: 28px; color: #166534; text-align: center; }
        .pca-date { margin-top: 12px; }
        .pca-sig-label { min-height: 2.6em; }
        .pca-input { width: 100%; min-height: 42px; padding: 9px 12px; background: #fff; border: 1px solid #d5deed; border-radius: 8px; font-size: 15px; font-weight: 600; font-family: inherit; color: #111827; }
        .pca-input:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15); }

        .pca-pad-wrap { position: relative; }
        .pca-pad { display: block; width: 100%; height: 130px; border: 1px dashed #94a3b8; border-radius: 8px; background: #f8fafc; touch-action: none; cursor: crosshair; }
        .pca-pad:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
        .pca-pad-hint { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 8px; color: #94a3b8; font-size: 14px; pointer-events: none; }
        .pca-pad-clear { position: absolute; top: 6px; right: 6px; padding: 3px 10px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; color: #475569; cursor: pointer; }
        .pca-pad-clear:hover { background: #f1f5f9; }

        .pca-btn { width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 16px; padding: 15px; border: none; border-radius: 10px; background: #2563eb; color: #fff; font-size: 17px; font-weight: 700; font-family: inherit; cursor: pointer; transition: background 0.2s; }
        .pca-btn:hover { background: #1d4ed8; }
        .pca-btn:disabled { background: #94a3b8; cursor: not-allowed; }
        .pca-foot { margin: 12px 0 0; text-align: center; font-size: 12px; color: #6b7280; }

        @media (max-width: 720px) {
          .pca-g4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .pca-banner h1 { font-size: 20px; }
          .pca-logo-top { font-size: 30px; }
        }
        @media (max-width: 560px) {
          .pca-wrapper { padding: 12px 10px 30px; }
          .pca-brand { flex-direction: column; align-items: flex-start; }
          .pca-g3 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .pca-banner { padding: 14px; gap: 12px; }
          .pca-banner h1 { font-size: 18px; }
          .pca-banner p { font-size: 13px; }
          .pca-section { padding: 14px; }
          .pca-sec-title { font-size: 17px; }
        }
        @media (max-width: 400px) {
          .pca-g2, .pca-g3, .pca-g4 { grid-template-columns: 1fr; }
          .pca-banner { flex-direction: column; text-align: center; }
        }
      `}</style>

      {/* Render the hidden PDF template */}
      <PdfTemplate agreement={agreement} />

      <div className="pca-container">
        {/* DEALER HEADER */}
        <header className="pca-brand">
          <div className="pca-logo">
            <svg className="pca-logo-swoosh" viewBox="0 0 220 32" fill="none" aria-hidden="true">
              <path d="M4 28C40 2 150 -4 216 20" stroke="#1e3a8a" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <span className="pca-logo-top">{DEALER.logoTop}</span>
            <span className="pca-logo-bottom">{DEALER.logoBottom}</span>
            <span className="pca-logo-tag">{DEALER.tagline}</span>
          </div>
          <div className="pca-dealer-info">
            <div className="pca-dealer-row"><IconPin /><span>{DEALER.address}</span></div>
            <div className="pca-dealer-row"><IconLicense /><span>{DEALER.license}</span></div>
          </div>
        </header>

        {/* TITLE */}
        <div className="pca-banner">
          <span className="pca-banner-icon"><IconDoc size={44} /></span>
          <div>
            <h1>California Vehicle Consignment Agreement</h1>
            <p>California Vehicle Code §§11729–11730</p>
          </div>
        </div>

        {/* CONDITIONAL RENDER: Form vs. Signed View */}
        {isSigned ? (
          <div className="pca-section" style={{ padding: '60px 20px', textAlign: 'center', background: '#fff', border: '1px solid #dbe4f3', borderRadius: 12, marginTop: 20 }}>
            <div style={{ width: 72, height: 72, background: '#dcfce7', color: '#16a34a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
              <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: '#111827', margin: '0 0 10px' }}>Agreement Signed & Completed</h2>
            <p style={{ color: '#4b5563', margin: '0 auto 30px', fontSize: 16, maxWidth: '500px', lineHeight: 1.5 }}>
              This consignment agreement was successfully signed on {fmtDate(agreement.signedAt || new Date())}. No further action is required from you at this time.
            </p>
            <button 
              type="button"
              className="pca-download-btn" 
              onClick={handleDownloadPDF} 
              disabled={isDownloading}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#2563eb', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '8px', fontSize: '16px', fontWeight: 700, cursor: 'pointer', transition: 'background 0.2s',
                opacity: isDownloading ? 0.7 : 1
              }}
            >
              <IconDownload />
              {isDownloading ? 'Generating PDF...' : 'Download Signed PDF'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSign}>
            {/* 1. Agreement Date */}
            <Section num="1" title="Agreement Date">
              <div className="pca-grid pca-g1">
                <Field label="Agreement Date" value={fmtDate(agreement.startDate)} />
              </div>
            </Section>

            {/* 2. Consignor / Owner Information */}
            <Section num="2" title="Consignor / Owner Information">
              <div className="pca-grid pca-g2">
                <Field label="Full Name (As it appears on title)" value={agreement.sellerName || 'Not Provided'} />
                <Field label="Phone Number" value={agreement.sellerPhone} />
                <Field label="Email Address" value={agreement.sellerEmail} className="pca-span-all" />
                <Field label="Address" value={agreement.sellerAddress} className="pca-span-all" />
                <Field label="City" value={agreement.sellerCity} />
                <Field label="State" value={agreement.sellerState} options={US_STATES} />
                <Field label="ZIP Code" value={agreement.sellerZip} />
              </div>
            </Section>

            {/* 3. Vehicle Information */}
            <Section num="3" title="Vehicle Information">
              <div className="pca-grid pca-g3">
                <Field label="Year" value={agreement.year} />
                <Field label="Make" value={agreement.make} />
                <Field label="Model" value={agreement.model} />
              </div>
              <div className="pca-grid pca-g4" style={{ marginTop: 12 }}>
                <Field label="VIN / ID #" value={agreement.vin} mono />
                <Field label="License Plate" value={agreement.licensePlate || 'N/A'} />
                <Field label="State" value={agreement.vehicleState} options={US_STATES} />
                <Field
                  label="Current Mileage"
                  value={agreement.mileage ? `${agreement.mileage}${agreement.odometer ? ` (${agreement.odometer})` : ''}` : ''}
                />
              </div>
            </Section>

            {/* 4. Consignment Terms */}
            <Section num="4" title="Consignment Terms">
              <div className="pca-grid pca-g2">
                <Field label="Agreement Duration" value={agreement.duration ? `${agreement.duration} Month(s)` : ''} />
                <Field label="Expiration Date" value={fmtDate(agreement.endDate) || 'TBD'} />
              </div>
            </Section>

            {/* 5. Financial Information */}
            <Section num="5" title="Financial Information">
              <div className="pca-grid pca-g2">
                <Field label="List Price (Asking Price)" value={money(agreement.listPrice)} />
                <Field label="Outstanding Liens (If any)" value={agreement.hasLiens === 'yes' ? 'Yes' : 'No'} />
                {agreement.hasLiens === 'yes' && (
                  <Field label="Lienholder Name" value={agreement.lienholder} className="pca-span-all" />
                )}
              </div>
            </Section>

            {/* 6. Repairs & Condition */}
            <Section num="6" title="Repairs & Condition">
              <div className="pca-grid pca-g3">
                <Field label="Repair Authorization" value={agreement.repairAuth} />
                <Field label="Max Repair Amount (Without Approval)" value={money(agreement.maxRepair || 0)} />
                {agreement.requireApproval !== undefined && (
                  <Field label="Approval for Major Repairs" value={agreement.requireApproval ? 'Required' : 'Not required'} />
                )}
              </div>
            </Section>

            {/* 7. Dealer Compensation & Owner Payout */}
            <Section num="7" title="Dealer Compensation & Owner Payout">
              <p className="pca-pay-lead">Agreed compensation structure</p>
              <div className="pca-pay-grid">
                {compCards.map((c) => (
                  <div key={c.key} className={`pca-pay ${c.key === agreement.compType ? 'selected' : ''}`}>
                    <span className="pca-radio" aria-hidden="true" />
                    <div>
                      <div className="pca-pay-title">{c.title}</div>
                      <div className="pca-pay-detail">{c.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* 8. Important Terms and Disclosures */}
            <Section num="8" title="Important Terms and Disclosures">
              <Disclosure tone="green" icon="$" title="Payment and Accounting">
                If the vehicle is sold, all money due to the consignor will be disbursed: <strong>{agreement.paymentDue}</strong>. {agreement.accounting}.
              </Disclosure>

              <Disclosure tone="blue" icon={<IconRefresh />} title="Termination">
                Upon termination of this agreement, the vehicle will be returned to the consignor unless both parties enter into a new agreement in writing.
              </Disclosure>

              <Disclosure tone="purple" icon={<IconShield />} title="Trust and Use">
                The vehicle is held in trust for the purpose of sale and may not be used for any other purpose without the owner's express written consent.
              </Disclosure>

              <Disclosure tone="orange" icon={<IconDoc />} title="Title / Transfer Documents">
                The owner will furnish all necessary ownership-transfer documents (e.g., title, smog certificate if required, release of lien) upon payment.
              </Disclosure>

              {(agreement.insurance || agreement.insuranceNotes) && (
                <Disclosure tone="blue" icon={<IconShield />} title="Insurance Coverage">
                  {agreement.insurance}
                  {agreement.insuranceNotes ? ` — ${agreement.insuranceNotes}` : ''}
                </Disclosure>
              )}

              {agreement.specialTerms && (
                <Disclosure tone="orange" icon={<IconDoc />} title="Special Terms">
                  {agreement.specialTerms}
                </Disclosure>
              )}

              <Disclosure tone="warn" icon={<IconWarn />} title="NOTICE TO CONSIGNOR">
                Failure of the consignee (dealer) to comply with the terms of this agreement may be a violation of California Vehicle Code §§11729–11730.
                The consignor may contact a California DMV investigator if they believe a violation has occurred.
              </Disclosure>
            </Section>

            {/* 9. Acknowledgment */}
            <Section num="9" title="Acknowledgment">
              <label className="pca-check">
                <input
                  type="checkbox"
                  checked={agreed1}
                  onChange={(e) => setAgreed1(e.target.checked)}
                />
                <span>I confirm the information provided above regarding my vehicle is accurate to the best of my knowledge.</span>
              </label>
              <label className="pca-check">
                <input
                  type="checkbox"
                  checked={agreed2}
                  onChange={(e) => setAgreed2(e.target.checked)}
                />
                <span>I have read, understood, and agree to the consignment terms and disclosures outlined in this document.</span>
              </label>
            </Section>

            {/* 10. Signatures */}
            <Section num="10" title="Signatures">
              <div className="pca-grid pca-g2">
                <div>
                  <span className="pca-label pca-sig-label">Consignor / Owner Signature</span>
                  <SignaturePad onChange={setSignature} />
                  <div className="pca-date">
                    <span className="pca-label">Date</span>
                    <input type="date" className="pca-input" value={ownerDate} onChange={(e) => setOwnerDate(e.target.value)} />
                  </div>
                </div>

                <div>
                  <span className="pca-label pca-sig-label">{DEALER.logoTop.charAt(0) + DEALER.logoTop.slice(1).toLowerCase()} {DEALER.logoBottom.split(' ').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')} Authorized Representative</span>
                  <div className={`pca-sign-box ${agreement.dealerSignedName ? 'signed' : ''}`}>
                    {agreement.dealerSignedName ? (
                      <span className="pca-signed-name">{agreement.dealerSignedName || `${DEALER.logoTop} ${DEALER.logoBottom}`}</span>
                    ) : (
                      <>
                        <IconPen />
                        <span>Dealer signature</span>
                      </>
                    )}
                  </div>
                  <div className="pca-date">
                    <span className="pca-label">Date</span>
                    <input type="date" className="pca-input" value={dealerDate} onChange={(e) => setDealerDate(e.target.value)} />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="pca-btn"
                disabled={isSubmitting || !agreed1 || !agreed2 || !signature}
              >
                <IconSign />
                {isSubmitting ? 'Submitting...' : 'Review & Sign Agreement'}
              </button>
              <p className="pca-foot">A copy of the completed agreement will be provided to the consignor.</p>
            </Section>
          </form>
        )}
      </div>
    </div>
  );
};

export default PublicConsignmentAgreement;