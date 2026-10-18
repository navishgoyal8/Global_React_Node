import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import DesignPreview from '../../components/Apparel/DesignPreview.jsx';

const CloseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6L6 18" /><path d="M6 6l12 12" />
  </svg>
);

export default function ApparelReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state } = useLocation();
  const { currentBgImage, logoUrl, design, area } = state || {};
  const [approved, setApproved] = useState(false);

  const missing = !currentBgImage || !logoUrl || !design || !area;

  useEffect(() => {
    if (missing) navigate(`/sales/crm/apparel/${id}`, { replace: true });
  }, [missing, id, navigate]);

  if (missing) return null;


  const goBack = () => navigate(-1); // back to the editor
  // TODO: change this to wherever "Continue" should go (cart / next step)
  const handleContinue = () => navigate(`/apparel/quantity/${id}`, { state });

  return (
    <div className="rv-page">
      <style>{`
        .rv-page { min-height: 100vh; min-height: 100dvh; display: grid; grid-template-columns: 1fr minmax(360px, 480px); background: #f3f3f3; font-family: 'Inter', sans-serif; color: #0f172a; }
        .rv-left { display: flex; align-items: center; justify-content: center; padding: 32px; }
        .rv-right { background: #fff; padding: 32px; display: flex; flex-direction: column; position: relative; }
        .rv-close { position: absolute; top: 16px; right: 16px; background: none; border: none; cursor: pointer; color: #0f172a; padding: 8px; display: flex; }
        .rv-title { margin: 24px 0 8px; font-size: 34px; font-weight: 800; line-height: 1.1; }
        .rv-sub { margin: 0 0 20px; font-size: 16px; }
        .rv-list { margin: 0 0 24px; padding-left: 20px; display: grid; gap: 12px; font-size: 16px; }
        .rv-note { background: #eef2f9; border-radius: 16px; padding: 20px; display: flex; gap: 12px; }
        .rv-note h3 { margin: 0 0 6px; font-size: 18px; font-weight: 800; }
        .rv-note p { margin: 0; font-size: 15px; line-height: 1.5; }
        .rv-actions { margin-top: auto; padding-top: 24px; display: grid; gap: 12px; background: #fff; }
        .rv-check { display: flex; gap: 12px; align-items: flex-start; font-size: 15px; cursor: pointer; line-height: 1.4; }
        .rv-check input { width: 22px; height: 22px; flex-shrink: 0; margin: 0; cursor: pointer; }
        .rv-btn { width: 100%; padding: 16px; border-radius: 8px; font-size: 16px; font-weight: 700; cursor: pointer; }
        .rv-primary { background: #6dd0f5; color: #0f172a; border: none; }
        .rv-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .rv-secondary { background: #fff; color: #0f172a; border: 1px solid #cbd5e1; }

        @media (max-width: 900px) {
          .rv-page { grid-template-columns: 1fr; }
          .rv-left { padding: 20px 16px 8px; }
          .rv-right { padding: 20px 20px 0; }
          .rv-title { font-size: 26px; margin-top: 8px; }
          .rv-actions { position: sticky; bottom: 0; padding: 16px 0 calc(16px + env(safe-area-inset-bottom, 0px)); box-shadow: 0 -8px 16px -12px rgba(0,0,0,0.15); }
        }
      `}</style>

      {/* Left: product preview + magnifier */}
      <div className="rv-left">
        <DesignPreview bgImage={currentBgImage} area={area} design={design} logoSrc={logoUrl} />
      </div>

      {/* Right: review panel */}
      <div className="rv-right">
        <button className="rv-close" onClick={goBack} aria-label="Close"><CloseIcon /></button>
        <h1 className="rv-title">Review your design</h1>
        <p className="rv-sub">Double-check the following details before you continue.</p>
        <ul className="rv-list">
          <li>Text is clear and easy to read</li>
          <li>Information is spelled correctly</li>
          <li>Images are sharp with no blurring</li>
        </ul>

        <div className="rv-note">
          <div>
            <h3>Perfecting your designs</h3>
            <p>Our design team will review your design to ensure optimal results. We'll send you the updated version via email.</p>
          </div>
        </div>

        <div className="rv-actions">
          <label className="rv-check">
            <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} />
            <span>I have authorization to use the design, I have reviewed and approve it.</span>
          </label>
          <button className="rv-btn rv-primary" disabled={!approved} onClick={handleContinue}>Continue</button>
          <button className="rv-btn rv-secondary" onClick={goBack}>Edit my design</button>
        </div>
      </div>
    </div>
  );
}