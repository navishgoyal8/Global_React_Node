import React from 'react';
import { useNavigate } from 'react-router-dom';
import './TopNav.css'; 

const TopNav = ({ activeFilter, setActiveFilter }) => {
  const navigate = useNavigate();
  
  const tabs = [
    { id: 'All', icon: '👥', label: 'All' },
    { id: 'Buyer', icon: '👤', label: 'Buyer' },
    { id: 'Seller', icon: '👤', label: 'Seller' },
    { id: 'Vendor', icon: '🚚', label: 'Vendor' },
    { id: 'Check Avail', icon: '📅', label: 'Check Avail' },
    { id: 'Un-registered', icon: '❓', label: 'Un-registered' },
    { id: 'Finance', icon: '💰', label: 'Finance' },
  ];

  return (
    <div className="top-nav-container">

      {/* Tabs — horizontally scrollable, no visible scrollbar */}
      <div className="top-nav-tabs-scroll">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`nav-item ${activeFilter === tab.id ? 'active-tab' : ''}`}
            onClick={() => setActiveFilter(tab.id)}
          >
            <span className="nav-icon">{tab.icon}</span>
            <span className="nav-label">{tab.label}</span>
          </div>
        ))}
      </div>

      {/* Invoices button — right side, collapses to icon on mobile */}
      <div className="invoices-btn-wrapper">
        <button
          className="invoices-nav-btn"
          onClick={() => navigate('/sales/crm/invoices')}
        >
          <span className="invoices-btn-icon">📄</span>
          <span className="invoices-btn-label">Invoices</span>
        </button>
      </div>

    </div>
  );
};

export default TopNav;