import React from 'react';

const Badge = ({ text }) => {
  if (!text) return null; // Don't render if there's no text

  return (
    <span style={{
      backgroundColor: '#EAECEF',
      color: '#555',
      padding: '4px 8px',
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: '600',
      display: 'inline-block',
      marginTop: '4px',
      whiteSpace: 'nowrap'
    }}>
      {text}
    </span>
  );
};

export default Badge;