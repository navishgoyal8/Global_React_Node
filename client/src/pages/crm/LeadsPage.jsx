import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import CrmQuickNav from '../../components/Navigation/CrmQuickNav';
import { API_BASE_URL } from '../../config';

const LEAD_STATUS_STYLE = {
  Intake: { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe', icon: '🔵' },
  Qualified: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0', icon: '✅' },
  Converted: { bg: '#fefce8', color: '#b45309', border: '#fde68a', icon: '⭐' },
  Lost: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', icon: '❌' },
  'Not Qualified': { bg: '#f9fafb', color: '#6b7280', border: '#e5e7eb', icon: '➖' },
};
const getStatusStyle = (status) => LEAD_STATUS_STYLE[status] || LEAD_STATUS_STYLE['Not Qualified'];

const getUserInitials = (name) => {
  if (!name) return '?';
  const parts = name.split(' ');
  return parts.length > 1 ? parts[0][0] + (parts[1] ? parts[1][0] : '') : parts[0][0];
};

const getUserColor = (index) => {
  const colors = [
    { bg: '#22c55e', color: '#ffffff' },
    { bg: '#3b82f6', color: '#ffffff' },
    { bg: '#a855f7', color: '#ffffff' },
    { bg: '#f97316', color: '#ffffff' },
  ];
  return colors[index % colors.length];
};

const LeadsPage = () => {
  const navigate = useNavigate();

  const [leads, setLeads] = useState([]);
  const [systemUsers, setSystemUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [leadTypeFilter, setLeadTypeFilter] = useState('All');

  const fetchLeads = async () => {
    try {
      setIsLoading(true);
      setLoadError('');
      const response = await fetch(`${API_BASE_URL}/leads/all`);
      const data = await response.json();
      if (data.success) {
        setLeads(data.leads || []);
      } else {
        setLoadError(data.message || 'Failed to load leads');
      }
    } catch (error) {
      console.error('Failed to fetch leads:', error);
      setLoadError('Failed to load leads. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSystemUsers = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/users/system-users`);
      const data = await response.json();
      if (data.success && data.users) {
        setSystemUsers(data.users);
      }
    } catch (error) {
      console.error('Failed to fetch system users:', error);
    }
  };

  useEffect(() => {
    fetchLeads();
    fetchSystemUsers();
  }, []);

  // Map user_id -> system user record for quick lookup
  const userMap = useMemo(() => {
    const map = {};
    systemUsers.forEach(u => { map[u.id] = u; });
    return map;
  }, [systemUsers]);

  const enrichedLeads = useMemo(() => {
    return leads.map(lead => {
      const matchedUser = lead.user_id ? userMap[lead.user_id] : null;
      return {
        ...lead,
        displayName: matchedUser?.name || 'Unregistered Lead',
        displayEmail: matchedUser?.email || '',
        displayPhone: lead.lead_phone || matchedUser?.phone || '',
        displayCompany: matchedUser?.company || '',
      };
    });
  }, [leads, userMap]);

  const filteredLeads = useMemo(() => {
    return enrichedLeads.filter(lead => {
      const matchesStatus = statusFilter === 'All' || lead.lead_status === statusFilter;
      const matchesLeadType = leadTypeFilter === 'All' || (lead.lead_types || []).includes(leadTypeFilter);
      const term = searchTerm.toLowerCase();
      const matchesSearch = !term ||
        lead.displayName.toLowerCase().includes(term) ||
        lead.displayPhone?.toLowerCase().includes(term) ||
        lead.displayEmail?.toLowerCase().includes(term) ||
        lead.displayCompany?.toLowerCase().includes(term);
      return matchesStatus && matchesLeadType && matchesSearch;
    });
  }, [enrichedLeads, statusFilter, leadTypeFilter, searchTerm]);

  const handleAddLead = () => {
  const blankLead = {
    id: '',
    user: {
      id: null,
      name: 'Un-registered', // triggers "Add User" mode in AssignLeadPage, same as any fresh unregistered lead
      email: 'No email provided',
      company: '',
    },
    userId: null,
    fullHistory: [],
    pastInquiries: [],
  };

  navigate('/sales/crm/assign', {
    state: { lead: blankLead, existingLeadData: null }
  });
};

  const handleOpenLead = (lead) => {
    // Best-effort lead object matching what AssignLeadPage expects.
    // Full SMS/call history isn't pre-loaded here — it'll populate as
    // new messages come in via the socket connection on that page.
    const leadObject = {
      id: lead.displayPhone,
      user: {
        id: lead.user_id,
        name: lead.displayName,
        email: lead.displayEmail || 'No email provided',
        company: lead.displayCompany,
      },
      userId: lead.user_id,
      fullHistory: [],
      pastInquiries: [],
    };

    const existingLeadData = {
      id: lead.id,
      userId: lead.user_id,
      leadTypes: lead.lead_types || [],
      status: lead.lead_status,
      listings: lead.listings || [],
      memberships: lead.memberships || [],
      adPackage: lead.ad_package || '',
      adFeatures: lead.ad_features || [],
      serviceType: lead.service_type || 'SMS',
      selected_products: lead.selected_products || [],
      discountAmount: lead.discount_amount || 0,
      taxAmount: lead.tax_amount || 0,
      shippingCost: lead.shipping_cost || 0,
      totalOverride: lead.total_override ?? null,
      seatCoversOverride: lead.seat_covers_override ?? null,
    };

    navigate('/sales/crm/assign', {
      state: { lead: leadObject, existingLeadData }
    });
  };

  const statusCounts = useMemo(() => {
    const counts = { All: enrichedLeads.length };
    enrichedLeads.forEach(l => {
      const key = l.lead_status || 'Not Qualified';
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [enrichedLeads]);

  const statusTabs = ['All', 'Intake', 'Qualified', 'Converted', 'Lost', 'Not Qualified'];

  const allLeadTypes = useMemo(() => {
    // Canonical list (matches the Lead Type checkboxes in AssignLeadPage) plus
    // any additional types found in actual lead data.
    const KNOWN_LEAD_TYPES = [
      'Membership',
      'Sell Listing to the Buyer',
      'Renew Listing for the Seller',
      '$15-featured for Buyer',
      'Ads',
      'Check Availability',
      'Buyer',
      'Seller',
      'Finance',
      'Upholstery',
      'Kits',
      'Apparels',
    ];
    const set = new Set(KNOWN_LEAD_TYPES);
    enrichedLeads.forEach(l => (l.lead_types || []).forEach(t => set.add(t)));
    return ['All', ...Array.from(set)];
  }, [enrichedLeads]);

  const leadTypeCounts = useMemo(() => {
    const counts = { All: enrichedLeads.length };
    allLeadTypes.forEach(t => { if (t !== 'All') counts[t] = 0; });
    enrichedLeads.forEach(l => {
      (l.lead_types || []).forEach(t => {
        counts[t] = (counts[t] || 0) + 1;
      });
    });
    return counts;
  }, [enrichedLeads, allLeadTypes]);

  return (
    <>
      <CrmQuickNav />
      <div style={{ backgroundColor: '#f3f4f6', minHeight: '100vh', padding: '24px 16px' }}>
        <style>{`
          .leads-wrap { max-width: 1200px; margin: 0 auto; }
          .leads-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
          .leads-title { font-size: 22px; font-weight: 800; color: #111827; margin: 0; }
          .leads-subtitle { font-size: 13px; color: #6b7280; margin-top: 4px; }
          .leads-toolbar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 16px; }
          .leads-search { flex: 1; min-width: 220px; padding: 10px 14px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; outline: none; background: white; box-sizing: border-box; }
          .leads-search:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
          .status-tab-row { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
          .status-tab-row::-webkit-scrollbar { display: none; }
          .status-tab { flex-shrink: 0; padding: 7px 14px; border-radius: 20px; border: 1px solid #e5e7eb; background: white; color: #4b5563; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.15s; }
          .status-tab:hover { background: #f9fafb; }
          .status-tab.active { background: #111827; color: white; border-color: #111827; }

          /* ===== DESKTOP TABLE ===== */
          .leads-table-card { background: white; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
          .leads-table { width: 100%; border-collapse: collapse; font-size: 13px; }
          .leads-table th { text-align: left; padding: 12px 16px; background: #f9fafb; color: #6b7280; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em; border-bottom: 1px solid #e5e7eb; white-space: nowrap; }
          .leads-table td { padding: 14px 16px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
          .leads-table tr:last-child td { border-bottom: none; }
          .leads-table tr.clickable { cursor: pointer; transition: background 0.1s; }
          .leads-table tr.clickable:hover { background: #f9fafb; }

          .lead-name-cell { display: flex; align-items: center; gap: 10px; }
          .lead-avatar { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
          .lead-name-text { font-weight: 700; color: #111827; }
          .lead-phone-text { font-size: 12px; color: #6b7280; }

          .chip-row { display: flex; flex-wrap: wrap; gap: 4px; }
          .chip { font-size: 11px; padding: 2px 8px; border-radius: 10px; background: #f3f4f6; color: #374151; font-weight: 600; white-space: nowrap; }
          .empty-chip { font-size: 12px; color: #d1d5db; }

          .status-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 20px; white-space: nowrap; flex-shrink: 0; }

          .ca-badge { display: inline-flex; align-items: center; gap: 4px; margin-top: 3px; font-size: 10px; font-weight: 700; color: #b45309; background: #fef3c7; border: 1px solid #fde68a; padding: 2px 8px; border-radius: 10px; white-space: nowrap; }
          .ca-badge-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

          .leads-empty-state { text-align: center; padding: 60px 20px; color: #6b7280; }
          .leads-empty-icon { font-size: 40px; margin-bottom: 12px; }

          /* ===== MOBILE CARD LIST ===== */
          .leads-mobile-list { display: none; flex-direction: column; gap: 10px; }
          .lead-mobile-card { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px; cursor: pointer; transition: box-shadow 0.15s, border-color 0.15s; box-shadow: 0 1px 2px rgba(0,0,0,0.03); }
          .lead-mobile-card:active { background: #f9fafb; }
          .lead-mobile-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
          .lead-mobile-identity { display: flex; align-items: center; gap: 10px; min-width: 0; }
          .lead-mobile-avatar { width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }
          .lead-mobile-name { font-weight: 700; color: #111827; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .lead-mobile-phone { font-size: 12px; color: #6b7280; margin-top: 1px; }
          .lead-mobile-section-label { font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; margin-top: 8px; }
          .lead-mobile-meta-row { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding-top: 10px; border-top: 1px solid #f3f4f6; font-size: 12px; color: #6b7280; }
          .lead-mobile-meta-item { display: flex; align-items: center; gap: 4px; }

          .leads-mobile-empty { text-align: center; padding: 50px 16px; color: #6b7280; background: white; border: 1px solid #e5e7eb; border-radius: 12px; }

          @media (max-width: 900px) {
            .leads-table th:nth-child(3), .leads-table td:nth-child(3),
            .leads-table th:nth-child(4), .leads-table td:nth-child(4) { display: none; }
          }

          @media (max-width: 640px) {
            .leads-table-card { display: none; }
            .leads-mobile-list { display: flex; }
            .leads-title { font-size: 19px; }
            .leads-toolbar { margin-bottom: 12px; }
            .leads-search { min-width: 0; font-size: 14px; padding: 10px 12px; }
            .status-tab { padding: 6px 12px; font-size: 12px; }
          }

          @media (max-width: 380px) {
            .leads-header { gap: 8px; }
          }
        `}</style>

        <div className="leads-wrap">
          <div className="leads-header">
            <div>
              <h2 className="leads-title">📋 All Leads</h2>
              <div className="leads-subtitle">
                {isLoading ? 'Loading...' : `${filteredLeads.length} of ${enrichedLeads.length} leads`}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
              <button
                onClick={handleAddLead}
                style={{ background: '#2563eb', border: 'none', color: 'white', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                + Add Lead
              </button>
              <button
                onClick={() => { fetchLeads(); fetchSystemUsers(); }}
                style={{ background: 'white', border: '1px solid #d1d5db', color: '#374151', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
              >
                ↺ Refresh
              </button>
            </div>
          </div>

          <div className="leads-toolbar">
            <input
              type="text"
              className="leads-search"
              placeholder="🔍 Search by name, phone, email, or company..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select
              value={leadTypeFilter}
              onChange={(e) => setLeadTypeFilter(e.target.value)}
              style={{ padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', fontWeight: '600', background: 'white', color: '#374151', cursor: 'pointer', outline: 'none' }}
            >
              {allLeadTypes.map(type => (
                <option key={type} value={type}>
                  {type === 'All' ? 'All Lead Types' : type}{type !== 'All' && leadTypeCounts[type] ? ` (${leadTypeCounts[type]})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="status-tab-row" style={{ marginBottom: '16px' }}>
            {statusTabs.map(status => (
              <button
                key={status}
                className={`status-tab ${statusFilter === status ? 'active' : ''}`}
                onClick={() => setStatusFilter(status)}
              >
                {status} {statusCounts[status] ? `(${statusCounts[status]})` : status === 'All' ? '(0)' : ''}
              </button>
            ))}
          </div>

          {/* ================= DESKTOP / TABLET TABLE ================= */}
          <div className="leads-table-card">
            {isLoading ? (
              <div className="leads-empty-state">
                <div className="leads-empty-icon">⏳</div>
                Loading leads...
              </div>
            ) : loadError ? (
              <div className="leads-empty-state">
                <div className="leads-empty-icon">⚠️</div>
                {loadError}
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="leads-empty-state">
                <div className="leads-empty-icon">🔍</div>
                No leads found matching your filters.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="leads-table">
                  <thead>
                    <tr>
                      <th>Lead</th>
                      <th>Lead Types</th>
                      <th>Listings</th>
                      <th>Memberships</th>
                      <th>Ad Package</th>
                      <th>Service</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map((lead, index) => {
                      const colors = getUserColor(index);
                      const statusStyle = getStatusStyle(lead.lead_status);
                      return (
                        <tr key={lead.id} className="clickable" onClick={() => handleOpenLead(lead)}>
                          <td>
                            <div className="lead-name-cell">
                              <div className="lead-avatar" style={{ backgroundColor: colors.bg, color: colors.color }}>
                                {getUserInitials(lead.displayName)}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div className="ca-badge-row">
                                  <span className="lead-name-text">{lead.displayName}</span>
                                  {lead.lead_source === 'check_availability' && (
                                    <span className="ca-badge">✓ Check Availability</span>
                                  )}
                                </div>
                                <div className="lead-phone-text">{lead.displayPhone || '—'}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            {lead.lead_types?.length > 0 ? (
                              <div className="chip-row">
                                {lead.lead_types.map((t, i) => <span key={i} className="chip">{t}</span>)}
                              </div>
                            ) : <span className="empty-chip">—</span>}
                          </td>
                          <td>
                            {lead.listings?.length > 0 ? (
                              <div className="chip-row">
                                {lead.listings.map((l, i) => <span key={i} className="chip">{l}</span>)}
                              </div>
                            ) : <span className="empty-chip">—</span>}
                          </td>
                          <td>
                            {lead.memberships?.length > 0 ? (
                              <div className="chip-row">
                                {lead.memberships.map((m, i) => <span key={i} className="chip">{m}</span>)}
                              </div>
                            ) : <span className="empty-chip">—</span>}
                          </td>
                          <td>{lead.ad_package ? <span className="chip">${lead.ad_package}</span> : <span className="empty-chip">—</span>}</td>
                          <td>{lead.service_type || '—'}</td>
                          <td>
                            <span className="status-badge" style={{ background: statusStyle.bg, color: statusStyle.color, border: `1px solid ${statusStyle.border}` }}>
                              {statusStyle.icon} {lead.lead_status || 'Not Qualified'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ================= MOBILE CARD LIST ================= */}
          <div className="leads-mobile-list">
            {isLoading ? (
              <div className="leads-mobile-empty">⏳ Loading leads...</div>
            ) : loadError ? (
              <div className="leads-mobile-empty">⚠️ {loadError}</div>
            ) : filteredLeads.length === 0 ? (
              <div className="leads-mobile-empty">🔍 No leads found matching your filters.</div>
            ) : (
              filteredLeads.map((lead, index) => {
                const colors = getUserColor(index);
                const statusStyle = getStatusStyle(lead.lead_status);
                const hasListings = lead.listings?.length > 0;
                const hasMemberships = lead.memberships?.length > 0;
                const hasLeadTypes = lead.lead_types?.length > 0;

                return (
                  <div key={lead.id} className="lead-mobile-card" onClick={() => handleOpenLead(lead)}>
                    <div className="lead-mobile-top">
                      <div className="lead-mobile-identity">
                        <div className="lead-mobile-avatar" style={{ backgroundColor: colors.bg, color: colors.color }}>
                          {getUserInitials(lead.displayName)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className="ca-badge-row">
                            <span className="lead-mobile-name">{lead.displayName}</span>
                            {lead.lead_source === 'check_availability' && (
                              <span className="ca-badge">✓ Check Availability</span>
                            )}
                          </div>
                          <div className="lead-mobile-phone">{lead.displayPhone || '—'}</div>
                        </div>
                      </div>
                      <span className="status-badge" style={{ background: statusStyle.bg, color: statusStyle.color, border: `1px solid ${statusStyle.border}` }}>
                        {statusStyle.icon} {lead.lead_status || 'Not Qualified'}
                      </span>
                    </div>

                    {hasLeadTypes && (
                      <>
                        <div className="lead-mobile-section-label">Lead Types</div>
                        <div className="chip-row">
                          {lead.lead_types.map((t, i) => <span key={i} className="chip">{t}</span>)}
                        </div>
                      </>
                    )}

                    {(hasListings || hasMemberships) && (
                      <>
                        <div className="lead-mobile-section-label">Listings / Memberships</div>
                        <div className="chip-row">
                          {hasListings && lead.listings.map((l, i) => <span key={`l-${i}`} className="chip">{l}</span>)}
                          {hasMemberships && lead.memberships.map((m, i) => <span key={`m-${i}`} className="chip">{m}</span>)}
                        </div>
                      </>
                    )}

                    <div className="lead-mobile-meta-row">
                      <span className="lead-mobile-meta-item">
                        {lead.ad_package ? `📢 $${lead.ad_package} pkg` : '📢 No ad package'}
                      </span>
                      <span className="lead-mobile-meta-item">
                        💬 {lead.service_type || '—'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default LeadsPage;