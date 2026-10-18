import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { API_BASE_URL } from '../../config';

// ── Icons ────────────────────────────────────────────────────────────────────
const Svg = ({ children, size = 20, fill = 'none', stroke = 2, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{children}</svg>
);
const IconGlobe = () => (
  <Svg size={48} stroke={1.4} className="pra-globe">
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20" />
    <path d="M3.5 7.5h17M3.5 16.5h17" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </Svg>
);
const IconShield = () => <Svg size={34} stroke={1.6}><path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></Svg>;
const IconUsers = () => (
  <svg width="46" height="40" viewBox="0 0 48 40" fill="currentColor" aria-hidden="true">
    <circle cx="18" cy="11" r="8" />
    <path d="M2 37c0-8.5 7-14 16-14s16 5.500 16 14z" />
    <circle cx="35" cy="14" r="6" opacity="0.8" />
    <path d="M31 24.500c9-1 17 3 17 11.500H36c0-4.500-1.800-8.500-5-11.500z" opacity="0.8" />
  </svg>
);
const IconCard = ({ size = 20 }) => <Svg size={size}><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></Svg>;
const IconBank = () => <Svg><path d="M3 21h18" /><path d="M5 21V10M9.500 21V10M14.500 21V10M19 21V10" /><path d="M2 10l10-7 10 7z" /></Svg>;
const IconZelle = () => (
  <svg width="20" height="22" viewBox="0 0 24 24" fill="#6d1ed4" aria-hidden="true">
    <rect x="10.500" y="0.500" width="3" height="4" />
    <rect x="10.500" y="19.500" width="3" height="4" />
    <path d="M5.500 4h13v3.600L10.600 17H18.500v3.500h-13V17L13.400 7.500H5.500z" />
  </svg>
);
const IconLock = ({ size = 16 }) => <Svg size={size}><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></Svg>;
const IconPen = ({ size = 30 }) => <Svg size={size} stroke={1.6}><path d="M12 20h9" /><path d="M16.500 3.500a2.120 2.120 0 0 1 3 3L7 19l-4 1 1-4L16.500 3.500z" /></Svg>;
const IconRefresh = () => <Svg size={14} stroke={2.2}><path d="M23 4v6h-6" /><path d="M20.500 15a9 9 0 1 1-2.100-9.400L23 10" /></Svg>;
const IconCalendar = () => <Svg size={18} stroke={1.8}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></Svg>;
const IconExternal = () => <Svg size={14} stroke={2}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6" /><path d="M10 14L21 3" /></Svg>;
const IconVehicle = () => <Svg size={34} stroke={1.5}><path d="M3 13l2-5a2 2 0 0 1 2-1.400h10a2 2 0 0 1 2 1.400l2 5v5h-3v-2H6v2H3z" /><circle cx="7.500" cy="14.500" r="1" /><circle cx="16.500" cy="14.500" r="1" /></Svg>;
const IconDownload = () => <Svg size={20}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></Svg>;
const IconCheck = () => <Svg size={32} stroke={2.5}><polyline points="20 6 9 17 4 12" /></Svg>;

const CardLogos = () => (
  <div className="pra-cc-logos" aria-label="Accepted cards: Visa, Mastercard, American Express, Discover">
    <span className="pra-cc-visa">VISA</span>
    <span className="pra-cc-mc"><i /><i /></span>
    <span className="pra-cc-amex">AMERICAN<br />EXPRESS</span>
    <span className="pra-cc-disc">DISC<span className="o">O</span>VER</span>
  </div>
);

const fmtDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
};

// ── Signature Pad ────────────────────────────────────────────────────────────
const SignaturePad = ({ onChange }) => {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const lastWidth = useRef(0);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const setup = () => {
      const c = canvasRef.current;
      if (!c) return;
      const r = c.getBoundingClientRect();
      if (!r.width || r.width === lastWidth.current) return;
      lastWidth.current = r.width;

      const prev = hasInk.current ? c.toDataURL('image/png') : null;
      const ratio = window.devicePixelRatio || 1;
      c.width = r.width * ratio;
      c.height = r.height * ratio;
      const ctx = c.getContext('2d');
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1e3a8a';

      if (prev) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height);
        img.src = prev;
      }
    };
    setup();
    window.addEventListener('resize', setup);
    return () => window.removeEventListener('resize', setup);
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
    hasInk.current = true;
    setEmpty(false);
    onChange(canvasRef.current.toDataURL('image/png'));
  };

  const clear = () => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    c.getContext('2d').clearRect(0, 0, r.width, r.height);
    hasInk.current = false;
    setEmpty(true);
    onChange('');
  };

  return (
    <div>
      <div className="pra-pad-wrap">
        <canvas
          ref={canvasRef}
          className="pra-pad"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
        {empty && (
          <span className="pra-pad-hint">
            <span className="pra-pad-hint-icon"><IconPen /></span>
            <span className="pra-pad-hint-text">Sign Here</span>
          </span>
        )}
      </div>
      <button type="button" className="pra-pad-clear" onClick={clear}>
        <IconRefresh /> Clear
      </button>
    </div>
  );
};

// ── PDF Hidden Template Component ─────────────────────────────────────────
const PdfTemplate = ({ agreement, formData, payMethod }) => {
  if (!agreement) return null;
  const form = agreement.form || {};
  const amount = Number(form.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const finalStatus = agreement.status === 'signed' ? 'PAID' : (form.paymentStatus || 'Pending');

  return (
    <div id="pdf-template" className="pdf-container">
      <div className="pdf-header">
        <h1 className="pdf-dealer-title">GLOBAL LIMO & BUS SALES</h1>
        <h2 className="pdf-doc-title">REFERRAL/INTRODUCTION SERVICE AGREEMENT</h2>
        <p className="pdf-doc-subtitle">Customer-signed copy Sample completed record</p>
      </div>

      <table className="pdf-table" style={{ marginBottom: '20px' }}>
        <tbody>
          <tr>
            <td className="pdf-td-label">Vehicle</td>
            <td className="pdf-td-value">{form.vehicleLabel || 'N/A'}</td>
            <td className="pdf-td-label">Mileage</td>
            <td className="pdf-td-value">{form.vehicleMileage || form.mileage || 'N/A'}</td>
          </tr>
          <tr>
            <td className="pdf-td-label">Listing URL</td>
            <td className="pdf-td-value">Global Limo & Bus Sales vehicle listing</td>
            <td className="pdf-td-label">Referral Fee</td>
            <td className="pdf-td-value">${amount}</td>
          </tr>
        </tbody>
      </table>

      <div className="pdf-section">
        <h3 className="pdf-sec-title">1. Customer Information</h3>
        <table className="pdf-table">
          <tbody>
            <tr>
              <td className="pdf-td-label">Customer</td>
              <td className="pdf-td-value">{formData.fullName || form.fullName}</td>
              <td className="pdf-td-label">Role</td>
              <td className="pdf-td-value" style={{ textTransform: 'capitalize' }}>{formData.referralType || form.referralType || 'Buyer'}</td>
            </tr>
            <tr>
              <td className="pdf-td-label">Business</td>
              <td className="pdf-td-value">{formData.businessName || form.businessName || 'N/A'}</td>
              <td className="pdf-td-label">Phone</td>
              <td className="pdf-td-value">{formData.phone || form.phone}</td>
            </tr>
            <tr>
              <td className="pdf-td-label">Email</td>
              <td className="pdf-td-value">{formData.email || form.email}</td>
              <td className="pdf-td-label">City / State</td>
              <td className="pdf-td-value">{formData.cityStateZip || form.cityStateZip || 'N/A'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="pdf-section">
        <h3 className="pdf-sec-title">2. Service and Fee</h3>
        <p className="pdf-text">
          Customer requests that Global Limo & Bus Sales ("GLBS") facilitate an introduction to the seller associated with the vehicle identified
          above. The customer agrees to pay GLBS a ${amount} referral/introduction service fee. This fee is for the introduction service described
          in this agreement; it is not the purchase price of the vehicle, a vehicle deposit, a DMV fee, a tax, or a representation that GLBS owns the
          vehicle.
        </p>
        <p className="pdf-text">
          Unless GLBS separately agrees in writing to perform additional services, GLBS does not inspect, warrant, finance, transport, repair, or
          guarantee the vehicle, the seller, the buyer, financing, title condition, mechanical condition, transaction completion, or any statement
          made by another party.
        </p>
      </div>

      <div className="pdf-section">
        <h3 className="pdf-sec-title">3. Payment Record</h3>
        <table className="pdf-table">
          <tbody>
            <tr>
              <td className="pdf-td-label">Amount</td>
              <td className="pdf-td-value">${amount}</td>
              <td className="pdf-td-label">Method</td>
              <td className="pdf-td-value" style={{ textTransform: 'capitalize' }}>{payMethod || form.paymentMethod || 'N/A'}</td>
            </tr>
            <tr>
              <td className="pdf-td-label">Status</td>
              <td className="pdf-td-value" style={{ fontWeight: 'bold' }}>{finalStatus.toUpperCase()}</td>
              <td className="pdf-td-label">Payment Date</td>
              <td className="pdf-td-value">{fmtDate(agreement.signedAt) || fmtDate(new Date())}</td>
            </tr>
            <tr>
              <td className="pdf-td-label">Reference</td>
              <td className="pdf-td-value">{form.transactionId || (payMethod ? `${payMethod.toUpperCase()}-REF-${fmtDate(new Date()).replace(/\//g, '')}` : 'PENDING')}</td>
              <td className="pdf-td-label">Agreement ID</td>
              <td className="pdf-td-value">{agreement.id ? `GLBS-REF-${agreement.id}` : 'PENDING'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="pdf-section">
        <h3 className="pdf-sec-title">4. Customer Acknowledgments</h3>
        <ol className="pdf-list">
          <li><strong>Independent transaction.</strong> Any purchase or sale of the vehicle is a separate transaction between buyer and seller unless a separate written agreement expressly states otherwise.</li>
          <li><strong>Customer due diligence.</strong> Customer is responsible for verifying the vehicle, seller identity, ownership/title, liens, mileage, condition, inspection results, price, taxes, registration, transportation, financing, and all other transaction terms before sending purchase funds or completing a sale.</li>
          <li><strong>No guarantee.</strong> GLBS does not guarantee that the seller will respond, that the parties will reach an agreement, or that a transaction will close.</li>
          <li><strong>Authorization to share information.</strong> Customer authorizes GLBS to provide the customer's name, business name, phone number, email address, and inquiry details to the seller and other parties reasonably necessary to facilitate the requested introduction.</li>
          <li><strong>Release and indemnity.</strong> To the fullest extent permitted by applicable law, customer agrees to release, defend, indemnify, and hold harmless GLBS and its owners, officers, employees, agents, and affiliates from third-party claims, losses, liabilities, damages, and reasonable costs arising from the customer's dealings or transaction with the seller, except to the extent caused by GLBS's own fraud, willful misconduct, or liability that cannot lawfully be waived.</li>
          <li><strong>Dispute resolution.</strong> To the extent enforceable under applicable law, disputes arising from this agreement or the introduction service will be resolved by binding arbitration on an individual basis. The parties waive jury trial and class or representative proceedings to the extent such waivers are enforceable. The arbitrator may award any remedy available under applicable law.</li>
          <li><strong>Electronic records and signatures.</strong> Customer consents to electronic delivery, electronic records, and use of an electronic signature for this agreement.</li>
        </ol>
      </div>

      <div className="pdf-section">
        <h3 className="pdf-sec-title">5. Important California Notice</h3>
        <p className="pdf-text">
          This document is intended to record a paid referral/introduction service. California law regulates persons and dealers who, for compensation, arrange, negotiate, assist, effectuate,
          or induce motor-vehicle sales. Nothing in this agreement is intended to avoid any dealer, salesperson, autobroker, disclosure, trust-account, fee, or other licensing requirement that
          applies to the actual services performed. GLBS should use this form only for activities it is legally authorized to perform.
        </p>
      </div>

      <div className="pdf-section">
        <h3 className="pdf-sec-title">6. Signature and Acceptance</h3>
        <table className="pdf-table signature-table">
          <thead>
            <tr>
              <th className="pdf-sig-label" style={{ textAlign: 'left', width: '40%' }}>Customer Signature</th>
              <th className="pdf-sig-label" style={{ textAlign: 'left', width: '35%' }}>Printed Name</th>
              <th className="pdf-sig-label" style={{ textAlign: 'left', width: '25%' }}>Date</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="pdf-sig-box">
                {agreement.signature ? (
                  <img src={agreement.signature} alt="Signature" className="pdf-sig-img" />
                ) : (
                  <span className="pdf-sig-typed">/s/ {agreement.signedName}</span>
                )}
              </td>
              <td className="pdf-sig-box" style={{ verticalAlign: 'middle', fontWeight: 'bold' }}>
                {agreement.signedName}
              </td>
              <td className="pdf-sig-box" style={{ verticalAlign: 'middle' }}>
                {fmtDate(agreement.signedAt)}
              </td>
            </tr>
            <tr>
              <td className="pdf-sig-meta" colSpan="3">
                <strong>IP/Audit Record:</strong> Electronic signature captured | Payment confirmed
              </td>
            </tr>
          </tbody>
        </table>
        <p className="pdf-text" style={{ marginTop: '10px', fontSize: '11px', background: '#f9fafb', padding: '8px', border: '1px solid #e5e7eb' }}>
          <strong>Customer certification:</strong> By signing, the customer confirms that the information above is accurate, has reviewed this agreement,
          understands the ${amount} referral/introduction fee, and voluntarily authorizes payment and the requested introduction.
        </p>
      </div>

      <div className="pdf-footer">
        GLOBAL LIMO & BUS SALES Referral / Introduction Service Agreement Signed Customer Copy
      </div>
    </div>
  );
};

// ── Main Component ───────────────────────────────────────────────────────────
const PublicReferralAgreement = () => {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [agreement, setAgreement] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    fullName: '',
    businessName: '',
    email: '',
    phone: '',
    cityStateZip: '',
    referralType: 'buyer'
  });

  const [payMethod, setPayMethod] = useState('card');
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState('');
  const [signedName, setSignedName] = useState('');
  const [signedDate, setSignedDate] = useState(new Date().toISOString().slice(0, 10));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fetchAgreement = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/referrals/public/${token}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Agreement not found.');

        const form = data.agreement.form || {};
        setAgreement(data.agreement);
        setFormData({
          fullName: data.agreement.customerName || form.fullName || '',
          businessName: form.businessName || '',
          email: form.email || '',
          phone: form.phone || '',
          cityStateZip: form.cityStateZip || '',
          referralType: form.referralType || 'buyer'
        });
        if (data.agreement.signedName) setSignedName(data.agreement.signedName);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchAgreement();
  }, [token]);

  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    try {
      const element = document.getElementById('pdf-template');
      element.style.display = 'block';
      await new Promise(resolve => setTimeout(resolve, 100));

      const canvas = await html2canvas(element, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      element.style.display = 'none';

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfPageHeight = pdf.internal.pageSize.getHeight();
      
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfPageHeight;

      while (heightLeft > 0) {
        position -= pdfPageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfPageHeight;
      }

      pdf.save(`Referral_Agreement_${agreement.id || 'Signed'}.pdf`);
      
      // Upload PDF behind the scenes
      const pdfBase64 = pdf.output('datauristring');
      if (agreement.id) {
        fetch(`${API_BASE_URL}/referrals/upload-pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ referralId: agreement.id, pdfData: pdfBase64 })
        }).catch(err => console.error("PDF silent upload failed:", err));
      }
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!agreed) return alert('Please agree to the Terms & Conditions.');
    if (!signature) return alert('Please provide your signature.');
    if (!signedName.trim()) return alert('Please enter your Full Name in the signature section.');

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/referrals/public/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signedName,
          signature,
          signedDate,
          agree: true
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to sign agreement.');

      setSuccess(true);
      setAgreement(prev => ({
        ...prev,
        status: 'signed',
        signature: signature,
        signedName: signedName,
        signedAt: new Date().toISOString()
      }));

      // Automatically trigger PDF generation and download
      setTimeout(() => {
        handleDownloadPDF();
      }, 500);

    } catch (err) {
      alert(`❌ ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'sans-serif' }}>Loading request details...</div>;
  if (error) return <div style={{ padding: 40, textAlign: 'center', color: '#dc2626', fontFamily: 'sans-serif' }}>{error}</div>;
  if (!agreement) return null;

  const isSigned = agreement.status === 'signed' || success;
  const form = agreement.form || {};
  const amount = Number(form.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const vehicleImage = form.vehicleImage || form.imageUrl || '';

  return (
    <div className="pra-page">
      <style>{`
        .pra-page { --blue: #1a6df0; --blue-dark: #1459cc; --navy: #0f1b3d; --ink: #1f2937; --muted: #6b7280; --line: #dde3ec; --tint: #eef5ff; --tint-line: #d3e2fa; min-height: 100vh; background: #fbfcfe; font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: var(--ink); padding-bottom: 36px; -webkit-text-size-adjust: 100%; }
        .pra-page *, .pra-page *::before, .pra-page *::after { box-sizing: border-box; }
        .pra-page button, .pra-page input { font-family: inherit; }

        /* ── Hidden PDF Template Styles ── */
        .pdf-container { display: none; width: 800px; padding: 40px; background: white; color: black; font-family: 'Helvetica', 'Arial', sans-serif; position: absolute; top: 0; left: -9999px; }
        .pdf-header { text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 20px; }
        .pdf-dealer-title { font-size: 24px; font-weight: bold; color: #1e3a8a; margin: 0; }
        .pdf-doc-title { font-size: 16px; font-weight: bold; margin: 5px 0; }
        .pdf-doc-subtitle { font-size: 11px; color: #4b5563; margin: 0; font-style: italic; }
        .pdf-section { margin-bottom: 18px; }
        .pdf-sec-title { font-size: 14px; font-weight: bold; border-bottom: 1px solid #d1d5db; padding-bottom: 4px; margin-bottom: 8px; color: #1e3a8a; }
        .pdf-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .pdf-table td, .pdf-table th { border: 1px solid #d1d5db; padding: 6px 8px; }
        .pdf-table th { background: #f3f4f6; color: #374151; font-weight: bold; }
        .pdf-td-label { background: #f3f4f6; font-weight: bold; width: 20%; color: #374151; }
        .pdf-td-value { width: 30%; }
        .pdf-text { font-size: 11px; text-align: justify; margin: 0 0 10px; line-height: 1.5; color: #111827; }
        .pdf-list { font-size: 11px; margin: 0 0 10px 20px; padding: 0; text-align: justify; color: #111827; }
        .pdf-list li { margin-bottom: 6px; line-height: 1.4; }
        .signature-table td, .signature-table th { border: none !important; }
        .pdf-sig-label { font-weight: bold; border-bottom: 1px solid black !important; padding-bottom: 5px !important; font-size: 12px; }
        .pdf-sig-box { height: 60px; vertical-align: bottom; padding-top: 10px !important; }
        .pdf-sig-img { max-height: 50px; max-width: 100%; }
        .pdf-sig-typed { font-family: 'Brush Script MT', cursive; font-size: 24px; color: #1e3a8a; }
        .pdf-sig-meta { font-size: 10px; color: #6b7280; padding-top: 5px !important; border-top: 1px solid #e5e7eb !important; }
        .pdf-footer { margin-top: 20px; font-size: 9px; text-align: center; color: #6b7280; border-top: 1px solid #d1d5db; padding-top: 10px; }

        /* ── Navigation ── */
        .pra-nav { background: #0d1b34; color: #fff; }
        .pra-nav-in { max-width: 1200px; margin: 0 auto; padding: 12px 24px; min-height: 72px; display: flex; align-items: center; gap: 56px; }
        .pra-brand { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
        .pra-globe { flex-shrink: 0; }
        .pra-brand-text { display: flex; flex-direction: column; line-height: 1; }
        .pra-brand-name { font-size: 30px; font-weight: 800; letter-spacing: 0.2em; }
        .pra-brand-sub { margin-top: 6px; padding-left: 2px; font-size: 10px; font-weight: 500; letter-spacing: 0.32em; color: #d5dbe6; white-space: nowrap; }
        .pra-links { display: flex; gap: 36px; font-size: 15px; font-weight: 500; }
        .pra-trust { margin-left: auto; display: flex; align-items: center; gap: 12px; font-size: 13px; line-height: 1.35; color: #e5e9f1; }
        .pra-trust svg { flex-shrink: 0; }

        /* ── Container + heading ── */
        .pra-container { max-width: 960px; margin: 0 auto; padding: 26px 24px 0; }
        .pra-header h1 { margin: 0 0 8px; font-size: clamp(24px, 4vw, 36px); font-weight: 800; letter-spacing: -0.01em; line-height: 1.15; color: var(--navy); }
        .pra-header p { margin: 0 0 22px; font-size: clamp(14px, 1.8vw, 17px); line-height: 1.45; color: #6b7686; }

        /* ── Vehicle card ── */
        .pra-vehicle { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; padding: 12px 16px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
        .pra-v-info { display: flex; align-items: center; gap: 20px; min-width: 0; }
        .pra-v-img { width: 198px; height: 97px; flex-shrink: 0; border-radius: 6px; background: #eef1f6; color: #9aa5b8; object-fit: cover; display: flex; align-items: center; justify-content: center; }
        .pra-v-text { min-width: 0; }
        .pra-v-text h3 { margin: 0 0 4px; font-size: clamp(18px, 2.4vw, 24px); font-weight: 800; line-height: 1.2; color: var(--navy); }
        .pra-v-meta { display: flex; flex-wrap: wrap; align-items: center; font-size: 15px; color: #7a8494; }
        .pra-v-meta span + span { margin-left: 12px; padding-left: 12px; border-left: 1px solid #cdd4df; }
        .pra-v-btn { flex-shrink: 0; padding: 12px 24px; border: 1px solid #b9d3fb; border-radius: 6px; background: var(--tint); color: var(--blue); font-size: 15px; font-weight: 600; cursor: pointer; }
        .pra-v-btn:hover { background: #e2eeff; }

        /* ── Section cards ── */
        .pra-section { margin-bottom: 16px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
        .pra-sec-header { display: flex; align-items: flex-start; gap: 14px; padding: 16px 20px 12px; }
        .pra-sec-num { width: 38px; height: 38px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--blue); color: #fff; font-size: 18px; font-weight: 700; }
        .pra-sec-title h2 { margin: 0; font-size: 20px; font-weight: 700; line-height: 1.25; color: var(--navy); }
        .pra-sec-title p { margin: 3px 0 0; font-size: 14px; color: var(--muted); }
        .pra-sec-body { padding: 4px 20px 20px; }

        /* ── Form ── */
        .pra-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 20px; }
        .pra-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .pra-label { font-size: 14px; font-weight: 500; color: var(--ink); }
        .pra-label .req, .pra-terms-text .req { color: #dc2626; }
        .pra-input { display: block; width: 100%; height: 42px; padding: 0 14px; border: 1px solid #d5dce8; border-radius: 6px; background: #fff; font-size: 15px; color: #111827; outline: none; transition: border-color 0.15s, box-shadow 0.15s; }
        .pra-input::placeholder { color: #a0a9b8; }
        .pra-input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(26, 109, 240, 0.12); }
        .pra-input:disabled { background: #f5f7fa; color: #6b7280; cursor: not-allowed; }

        .pra-radio-group { display: flex; align-items: center; gap: 32px; height: 42px; }
        .pra-radio { display: flex; align-items: center; gap: 10px; font-size: 15px; color: var(--ink); cursor: pointer; }
        .pra-radio input { width: 20px; height: 20px; margin: 0; accent-color: var(--blue); cursor: pointer; }

        /* ── Intro service ── */
        .pra-intro-box { display: flex; align-items: flex-start; gap: 20px; padding: 18px 20px; background: var(--tint); border: 1px solid var(--tint-line); border-radius: 8px; }
        .pra-intro-icon { flex-shrink: 0; color: var(--blue); padding-top: 2px; }
        .pra-intro-text h4 { margin: 0 0 6px; font-size: 17px; font-weight: 700; color: #123a8f; }
        .pra-intro-text p { margin: 0; font-size: 15px; line-height: 1.5; color: #4b5563; }

        /* ── Payment ── */
        .pra-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 16px; }
        .pra-tab { height: 46px; display: flex; align-items: center; justify-content: center; gap: 10px; padding: 0 12px; border: 1px solid #d5dce8; border-radius: 6px; background: #f5f7fa; color: #374151; font-size: 15px; font-weight: 500; cursor: pointer; transition: background 0.15s, border-color 0.15s; }
        .pra-tab:hover { background: #eef1f6; }
        .pra-tab.active { background: #fff; border-color: var(--blue); box-shadow: inset 0 2px 0 var(--blue); color: var(--blue); font-weight: 600; }
        .pra-tab:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }

        .pra-pay-grid { display: grid; grid-template-columns: minmax(0, 1.75fr) minmax(0, 1fr); gap: 16px; align-items: start; }
        .pra-card-box { display: flex; align-items: center; gap: 10px; height: 46px; margin-top: 8px; padding: 0 12px; background: #fff; border: 1px solid #d5dce8; border-radius: 6px; color: #9aa5b8; }
        .pra-card-box:focus-within { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(26, 109, 240, 0.12); }
        .pra-card-box svg { flex-shrink: 0; }
        .pra-card-box input { min-width: 0; border: none; outline: none; background: transparent; padding: 0; font-size: 15px; color: #111827; }
        .pra-card-box input::placeholder { color: #9aa5b8; }
        .pra-cc-num { flex: 1; }
        .pra-cc-exp { width: 74px; text-align: right; }
        .pra-cc-cvc { width: 52px; text-align: right; }

        .pra-secure-box { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; background: var(--tint); border: 1px solid var(--tint-line); border-radius: 8px; }
        .pra-secure-box > svg { flex-shrink: 0; color: #475569; margin-top: 2px; }
        .pra-secure-box strong { display: block; margin-bottom: 2px; font-size: 13px; color: #111827; }
        .pra-secure-box p { margin: 0 0 10px; font-size: 12px; line-height: 1.4; color: #6b7280; }
        .pra-cc-logos { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; }
        .pra-cc-visa { font-size: 17px; font-weight: 900; font-style: italic; letter-spacing: -0.02em; color: #1a1f71; }
        .pra-cc-mc { position: relative; display: inline-block; width: 34px; height: 22px; }
        .pra-cc-mc i { position: absolute; top: 0; width: 22px; height: 22px; border-radius: 50%; }
        .pra-cc-mc i:first-child { left: 0; background: #eb001b; }
        .pra-cc-mc i:last-child { right: 0; background: #f79e1b; opacity: 0.92; }
        .pra-cc-amex { padding: 2px 4px; border-radius: 2px; background: #2e77bb; color: #fff; font-size: 7px; font-weight: 800; line-height: 1.1; text-align: center; letter-spacing: 0.02em; }
        .pra-cc-disc { font-size: 11px; font-weight: 800; color: #111827; }
        .pra-cc-disc .o { color: #f58220; }
        .pra-pay-note { padding: 20px; text-align: center; color: #4b5563; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; font-size: 14px; }

        /* ── Signature ── */
        .pra-sign-grid { display: grid; grid-template-columns: minmax(0, 1.8fr) minmax(0, 1fr); gap: 22px; align-items: start; }
        .pra-sign-side { display: flex; flex-direction: column; gap: 14px; }
        .pra-pad-wrap { position: relative; overflow: hidden; background: #fff; border: 1px solid #cfd6e2; border-radius: 6px; }
        .pra-pad { display: block; width: 100%; height: 104px; cursor: crosshair; touch-action: none; }
        .pra-pad-hint { position: absolute; inset: 0; display: flex; align-items: center; gap: 18px; padding: 0 18px; pointer-events: none; color: #6b7280; }
        .pra-pad-hint-icon { display: flex; flex-shrink: 0; }
        .pra-pad-hint-text { flex: 1; text-align: center; font-family: 'Segoe Script', 'Snell Roundhand', 'Brush Script MT', cursive; font-size: 28px; color: #c5ccd8; }
        .pra-pad-clear { display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; padding: 6px 4px; border: none; background: none; color: var(--blue); font-size: 14px; font-weight: 500; cursor: pointer; }
        .pra-pad-clear:hover { color: var(--blue-dark); }

        .pra-date-wrap { position: relative; }
        .pra-date-icon { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); display: flex; color: #6b7280; pointer-events: none; }
        .pra-date-input { position: relative; padding-left: 42px; text-align: left; -webkit-appearance: none; appearance: none; }
        .pra-date-input::-webkit-calendar-picker-indicator { position: absolute; left: 0; top: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }

        .pra-terms-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 16px; margin-top: 18px; }
        .pra-terms-check { display: flex; align-items: flex-start; gap: 12px; cursor: pointer; flex: 1 1 420px; min-width: 0; }
        .pra-terms-check input { width: 20px; height: 20px; margin: 1px 0 0; flex-shrink: 0; accent-color: var(--blue); cursor: pointer; }
        .pra-terms-text { font-size: 14px; line-height: 1.45; color: #4b5563; }
        .pra-terms-link { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; font-size: 14px; color: var(--blue); text-decoration: underline; }

        /* ── Submit + footer ── */
        .pra-submit { width: 100%; height: 48px; display: flex; align-items: center; justify-content: center; gap: 10px; border: none; border-radius: 6px; background: var(--blue); color: #fff; font-size: 16px; font-weight: 600; cursor: pointer; transition: background 0.15s; }
        .pra-submit:hover:not(:disabled) { background: var(--blue-dark); }
        .pra-submit:disabled { opacity: 0.7; cursor: not-allowed; }
        .pra-submit-sub { margin-top: 10px; text-align: center; font-size: 13px; color: #6b7280; }

        .pra-download-btn { display: inline-flex; align-items: center; gap: 8px; background: #2563eb; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 16px; font-weight: 700; cursor: pointer; transition: background 0.2s; white-space: nowrap; }
        .pra-download-btn:hover { background: #1d4ed8; }
        .pra-download-btn:disabled { opacity: 0.7; cursor: not-allowed; }

        .pra-footer { margin-top: 28px; text-align: center; }
        .pra-footer-top { display: flex; align-items: center; gap: 16px; font-size: 11px; letter-spacing: 0.26em; color: #8b94a5; white-space: nowrap; }
        .pra-footer-top::before, .pra-footer-top::after { content: ''; flex: 1; height: 1px; background: var(--line); }
        .pra-footer-name { margin-top: 6px; font-size: 13px; color: #8b94a5; }

        /* ── Tablets & Phones ── */
        @media (max-width: 900px) {
          .pra-nav-in { gap: 32px; }
          .pra-links { display: none; }
        }
        @media (max-width: 640px) {
          .pra-nav-in { min-height: 60px; padding: 10px 14px; gap: 12px; }
          .pra-globe { width: 38px; height: 38px; }
          .pra-brand-name { font-size: 22px; }
          .pra-brand-sub { font-size: 8px; margin-top: 5px; }
          .pra-trust-text { display: none; }

          .pra-container { padding: 20px 14px 0; }
          .pra-header p { margin-bottom: 16px; }

          .pra-vehicle { flex-direction: column; align-items: stretch; padding: 12px; }
          .pra-v-info { gap: 14px; }
          .pra-v-img { width: 104px; height: 78px; }
          .pra-v-meta { font-size: 14px; }
          .pra-v-btn { width: 100%; }

          .pra-sec-header { padding: 14px 14px 10px; gap: 12px; }
          .pra-sec-body { padding: 4px 14px 16px; }

          .pra-grid, .pra-pay-grid, .pra-sign-grid { grid-template-columns: 1fr; gap: 14px; }
          .pra-tabs { grid-template-columns: 1fr; }
          .pra-sign-side { flex-direction: column; }
        }
      `}</style>

      {/* Render the hidden PDF template */}
      <PdfTemplate agreement={agreement} formData={formData} payMethod={payMethod} />

      {/* ── Navigation Header ── */}
      <nav className="pra-nav">
        <div className="pra-nav-in">
          <div className="pra-brand">
            <IconGlobe />
            <div className="pra-brand-text">
              <span className="pra-brand-name">GLOBAL</span>
              <span className="pra-brand-sub">LIMO &amp; BUS SALES</span>
            </div>
          </div>
          <div className="pra-links">
            <span>Buy</span><span>Sell</span><span>Consign</span><span>About</span><span>Contact</span>
          </div>
          <div className="pra-trust">
            <IconShield />
            <span className="pra-trust-text">Trusted Marketplace<br />for Commercial Vehicles</span>
          </div>
        </div>
      </nav>

      <div className="pra-container">

        <div className="pra-header">
          <h1>Complete Your Introduction Request</h1>
          <p>Global Limo &amp; Bus Sales will facilitate an introduction to the seller for the vehicle below.<br className="pra-br" /> Once payment is received, we will share your information with the seller.</p>
        </div>

        <div className="pra-vehicle">
          <div className="pra-v-info">
            {vehicleImage ? (
              <img className="pra-v-img" src={vehicleImage} alt={form.vehicleLabel || 'Vehicle'} />
            ) : (
              <div className="pra-v-img"><IconVehicle /></div>
            )}
            <div className="pra-v-text">
              <h3>{form.vehicleLabel || 'Vehicle Information Unavailable'}</h3>
              <div className="pra-v-meta">
                {form.vehicleMileage ? <span>{Number(form.vehicleMileage) ? `${Number(form.vehicleMileage).toLocaleString('en-US')} miles` : vehicleMileage}</span> : null}
                <span>Location: {form.vehicleLocation || 'N/A'}</span>
              </div>
            </div>
          </div>
          <button type="button" className="pra-v-btn">View Details</button>
        </div>

        {/* ── Conditional Render: Form vs. Signed View ── */}
        {isSigned ? (
          <div className="pra-section" style={{ padding: '60px 20px', textAlign: 'center', background: '#fff' }}>
            <div style={{ width: 72, height: 72, background: '#dcfce7', color: '#16a34a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
              <IconCheck />
            </div>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: '#111827', margin: '0 0 10px' }}>Agreement Signed & Completed</h2>
            <p style={{ color: '#4b5563', margin: '0 auto 30px', fontSize: 16, maxWidth: '500px', lineHeight: 1.5 }}>
              This agreement was successfully signed on {fmtDate(agreement.signedAt)}. No further action is required from you at this time.
            </p>
            <button 
              type="button"
              className="pra-download-btn" 
              onClick={handleDownloadPDF} 
              disabled={isDownloading}
            >
              <IconDownload />
              {isDownloading ? 'Generating PDF...' : 'Download Signed PDF'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* 1. Your Information */}
            <div className="pra-section">
              <div className="pra-sec-header">
                <div className="pra-sec-num">1</div>
                <div className="pra-sec-title">
                  <h2>Your Information</h2>
                  <p>We'll share this information with the seller so they can contact you.</p>
                </div>
              </div>
              <div className="pra-sec-body">
                <div className="pra-grid">
                  <div className="pra-field">
                    <span className="pra-label">Full Name <span className="req">*</span></span>
                    <input type="text" className="pra-input" placeholder="John Smith" autoComplete="name" value={formData.fullName} onChange={e => handleInputChange('fullName', e.target.value)} required />
                  </div>
                  <div className="pra-field">
                    <span className="pra-label">Business Name (Optional)</span>
                    <input type="text" className="pra-input" placeholder="ABC Transportation" autoComplete="organization" value={formData.businessName} onChange={e => handleInputChange('businessName', e.target.value)} />
                  </div>
                  <div className="pra-field">
                    <span className="pra-label">Email <span className="req">*</span></span>
                    <input type="email" className="pra-input" placeholder="john@example.com" autoComplete="email" value={formData.email} onChange={e => handleInputChange('email', e.target.value)} required />
                  </div>
                  <div className="pra-field">
                    <span className="pra-label">City, State <span className="req">*</span></span>
                    <input type="text" className="pra-input" placeholder="Los Angeles, CA" autoComplete="address-level2" value={formData.cityStateZip} onChange={e => handleInputChange('cityStateZip', e.target.value)} required />
                  </div>
                  <div className="pra-field">
                    <span className="pra-label">Phone <span className="req">*</span></span>
                    <input type="tel" className="pra-input" placeholder="(555) 123-4567" autoComplete="tel" value={formData.phone} onChange={e => handleInputChange('phone', e.target.value)} required />
                  </div>
                  <div className="pra-field">
                    <span className="pra-label">I am a <span className="req">*</span></span>
                    <div className="pra-radio-group">
                      <label className="pra-radio">
                        <input type="radio" name="referralType" checked={formData.referralType === 'buyer'} onChange={() => handleInputChange('referralType', 'buyer')} /> Buyer
                      </label>
                      <label className="pra-radio">
                        <input type="radio" name="referralType" checked={formData.referralType === 'seller'} onChange={() => handleInputChange('referralType', 'seller')} /> Seller
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Introduction Service */}
            <div className="pra-section">
              <div className="pra-sec-header">
                <div className="pra-sec-num">2</div>
                <div className="pra-sec-title">
                  <h2>Introduction Service</h2>
                  <p>Complete payment to authorize us to make the introduction to the seller.</p>
                </div>
              </div>
              <div className="pra-sec-body">
                <div className="pra-intro-box">
                  <div className="pra-intro-icon"><IconUsers /></div>
                  <div className="pra-intro-text">
                    <h4>Introduction Service — ${amount}</h4>
                    <p>This payment allows Global Limo &amp; Bus Sales to facilitate an introduction between you and the {formData.referralType === 'buyer' ? 'seller' : 'buyer'} of this vehicle. After payment, we will share your contact information securely.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Payment Method */}
            <div className="pra-section">
              <div className="pra-sec-header">
                <div className="pra-sec-num">3</div>
                <div className="pra-sec-title">
                  <h2>Payment Method</h2>
                  <p>Choose a secure payment option.</p>
                </div>
              </div>
              <div className="pra-sec-body">
                <div className="pra-tabs" role="tablist">
                  <button type="button" role="tab" aria-selected={payMethod === 'card'} className={`pra-tab ${payMethod === 'card' ? 'active' : ''}`} onClick={() => setPayMethod('card')}><IconCard /> Credit / Debit Card</button>
                  <button type="button" role="tab" aria-selected={payMethod === 'zelle'} className={`pra-tab ${payMethod === 'zelle' ? 'active' : ''}`} onClick={() => setPayMethod('zelle')}><IconZelle /> Zelle®</button>
                  <button type="button" role="tab" aria-selected={payMethod === 'wire'} className={`pra-tab ${payMethod === 'wire' ? 'active' : ''}`} onClick={() => setPayMethod('wire')}><IconBank /> Wire Transfer</button>
                </div>

                {payMethod === 'card' && (
                  <div className="pra-pay-grid">
                    <div>
                      <span className="pra-label">Card Information</span>
                      <div className="pra-card-box">
                        <IconCard size={22} />
                        <input type="text" className="pra-cc-num" placeholder="Card number" inputMode="numeric" autoComplete="cc-number" aria-label="Card number" />
                        <input type="text" className="pra-cc-exp" placeholder="MM / YY" inputMode="numeric" autoComplete="cc-exp" aria-label="Expiry date" />
                        <input type="text" className="pra-cc-cvc" placeholder="CVC" inputMode="numeric" autoComplete="cc-csc" aria-label="CVC" />
                      </div>
                    </div>
                    <div className="pra-secure-box">
                      <IconLock size={28} />
                      <div>
                        <strong>Secure Payment</strong>
                        <p>Your payment information is encrypted and processed securely.</p>
                        <CardLogos />
                      </div>
                    </div>
                  </div>
                )}
                {payMethod !== 'card' && (
                  <div className="pra-pay-note">
                    Instructions for {payMethod === 'zelle' ? 'Zelle' : 'Wire Transfer'} will be provided upon agreement submission.
                  </div>
                )}
              </div>
            </div>

            {/* 4. Signature */}
            <div className="pra-section">
              <div className="pra-sec-header">
                <div className="pra-sec-num">4</div>
                <div className="pra-sec-title">
                  <h2>Signature</h2>
                  <p>Please sign below to authorize this request and payment.</p>
                </div>
              </div>
              <div className="pra-sec-body">
                <div className="pra-sign-grid">
                  <div>
                    <SignaturePad onChange={setSignature} />
                  </div>
                  <div className="pra-sign-side">
                    <div className="pra-field">
                      <span className="pra-label">Full Name <span className="req">*</span></span>
                      <input type="text" className="pra-input" placeholder="John Smith" value={signedName} onChange={e => setSignedName(e.target.value)} required />
                    </div>
                    <div className="pra-field">
                      <span className="pra-label">Date <span className="req">*</span></span>
                      <div className="pra-date-wrap">
                        <span className="pra-date-icon"><IconCalendar /></span>
                        <input type="date" className="pra-input pra-date-input" value={signedDate} onChange={e => setSignedDate(e.target.value)} required />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pra-terms-row">
                  <label className="pra-terms-check">
                    <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
                    <span className="pra-terms-text">
                      I agree to the Terms &amp; Conditions and authorize Global Limo &amp; Bus Sales to share my information with the seller. <span className="req">*</span>
                    </span>
                  </label>
                  <a href="#" className="pra-terms-link" onClick={e => e.preventDefault()}>View Terms <IconExternal /></a>
                </div>
              </div>
            </div>

            <button type="submit" className="pra-submit" disabled={isSubmitting}>
              <IconLock size={18} /> {isSubmitting ? 'Processing...' : `Pay $${amount} & Submit Request`}
            </button>
            <div className="pra-submit-sub">You'll be redirected to a confirmation page after payment.</div>
          </form>
        )}

        <div className="pra-footer">
          <div className="pra-footer-top">PEOPLE &nbsp; CONNECTING &nbsp; VEHICLES</div>
          <div className="pra-footer-name">Global Limo &amp; Bus Sales</div>
        </div>

      </div>
    </div>
  );
};

export default PublicReferralAgreement;