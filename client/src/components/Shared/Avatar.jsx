import React from 'react';

const Avatar = ({ initial, color }) => {
  return (
    <div style={{
      width: '45px',
      height: '45px',
      borderRadius: '50%',
      backgroundColor: color || '#ccc',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 'bold',
      fontSize: '20px',
      flexShrink: 0,
      marginRight: '12px'
    }}>
      {initial}
    </div>
  );
};

export default Avatar;