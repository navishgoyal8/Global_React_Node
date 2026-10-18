import { useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import FollowUpsSection from '../../components/Shared/FollowUpsSection';

const PALETTE = {
  primary: '#3b28cc',
  primaryDark: '#0f172a',
  primaryLight: '#eff6ff',
  border: '#e2e8f0',
  textMuted: '#64748b',
  textDark: '#0f172a',
};

const FollowUpsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { invoiceId } = useParams();

  const state = location.state || {};
  const leadPhone = state.leadPhone || '';
  const customerName = state.customerName || (state.lead && (state.lead.name || state.lead.display_name)) || '';

  const resolvedInvoiceId = invoiceId ? Number(invoiceId) : (state.invoiceId || null);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [location.key]);

  const goBack = () => {
    if (location.state?.from === 'assign' || location.state?.from === 'invoice') {
      navigate(-1);
    } else {
      navigate('/sales/crm/invoices');
    }
  };

  const title =
    (state.from === 'invoice' ? 'Invoice' : 'Lead') +
    (customerName ? ` — ${customerName}` : '');

  return (
    <div style={{ backgroundColor: '#f8fafc', minHeight: '100vh', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '24px 20px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
          <button
            onClick={goBack}
            style={{
              background: '#fff', border: `1px solid ${PALETTE.border}`, borderRadius: '8px',
              padding: '8px 14px', fontSize: '13px', fontWeight: 600, color: PALETTE.textMuted,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            ← Back
          </button>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: PALETTE.textDark }}>Follow-ups</div>
            <div style={{ fontSize: '13px', color: PALETTE.textMuted }}>{title}</div>
          </div>
        </div>

        <FollowUpsSection
          invoiceId={resolvedInvoiceId}
          leadPhone={leadPhone}
          collapsed={false}
          onToggle={() => {}}
        />
      </div>
    </div>
  );
};

export default FollowUpsPage;
