import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const NAV_HEIGHT = 56;
const NAV_HEIGHT_MOBILE = 50;

const TABS = [
  { key: 'textcalls', label: 'Text/Calls', icon: '💬', path: '/sales/crm/' },
  { key: 'invoices', label: 'Invoices', icon: '🧾', path: '/sales/crm/invoices' },
];

/**
 * Fixed top navigation bar shared across all CRM pages.
 * Drop this in as the very first thing returned by a page —
 * it renders the fixed bar AND a same-height spacer, so no
 * per-page padding/margin adjustments are needed.
 *
 * Usage:
 *   return (
 *     <>
 *       <CrmQuickNav />
 *       <div style={{ ...your existing page wrapper... }}>
 *         ...
 *       </div>
 *     </>
 *   );
 */
const CrmQuickNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const path = location.pathname;
  const isInvoices = path.startsWith('/sales/crm/invoices');
  // Anything else under /sales/crm/ (create-invoice, followups, etc.)
  // falls back to the Text/Calls tab, since that's the general engagement flow.
  const isTextCalls = !isInvoices;

  const activeKey = isInvoices ? 'invoices' : 'textcalls';

  return (
    <>
      <style>{`
        .crm-qnav-bar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: ${NAV_HEIGHT}px;
          background-color: #1e1b2e;
          border-bottom: none;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          z-index: 500;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 16px;
        }
        .crm-qnav-inner {
          display: flex;
          align-items: center;
          gap: 4px;
          width: 100%;
          max-width: 1200px;
        }
        .crm-qnav-tab {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          flex: 1;
          padding: 10px 18px;
          border-radius: 10px;
          border: none;
          background: transparent;
          color: #a89fc8;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .crm-qnav-tab:hover {
          background-color: rgba(255, 255, 255, 0.07);
          color: #e2dff0;
        }
        .crm-qnav-tab.active {
          background-color: #ffffff;
          color: #1e1b2e;
          font-weight: 700;
          box-shadow: none;
        }
        .crm-qnav-icon {
          font-size: 16px;
          line-height: 1;
        }
        .crm-qnav-spacer {
          height: ${NAV_HEIGHT}px;
        }

        @media (max-width: 640px) {
          .crm-qnav-bar {
            height: ${NAV_HEIGHT_MOBILE}px;
            padding: 8px 6px;
          }
          .crm-qnav-inner {
            gap: 4px;
          }
          .crm-qnav-tab {
            padding: 8px 12px;
            font-size: 13px;
            gap: 4px;
          }
          .crm-qnav-icon {
            font-size: 14px;
          }
          .crm-qnav-spacer {
            height: ${NAV_HEIGHT_MOBILE}px;
          }
        }

        @media (max-width: 380px) {
          .crm-qnav-tab span.crm-qnav-label {
            display: none;
          }
          .crm-qnav-tab {
            gap: 0;
          }
        }
      `}</style>

      <div className="crm-qnav-bar">
        <div className="crm-qnav-inner">
          {TABS.map(tab => (
            <button
              key={tab.key}
              className={`crm-qnav-tab ${activeKey === tab.key ? 'active' : ''}`}
              onClick={() => navigate(tab.path)}
            >
              <span className="crm-qnav-icon">{tab.icon}</span>
              <span className="crm-qnav-label">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Spacer so fixed bar doesn't cover page content */}
      <div className="crm-qnav-spacer" />
    </>
  );
};

export default CrmQuickNav;