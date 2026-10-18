import React from 'react';

const FloatingButton = () => {
  return (
    <button className="floating-action-button" style={styles.fab}>
      ✏️
    </button>
  );
};

const styles = {
  fab: {
    position: 'fixed',
    bottom: '60px', // Sits just above the search bar
    right: '20px',
    width: '50px',
    height: '50px',
    borderRadius: '25px',
    backgroundColor: '#0056FF', // Standard Action Blue
    color: 'white',
    border: 'none',
    boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
    fontSize: '20px',
    cursor: 'pointer',
    zIndex: 101,
  }
};

export default FloatingButton;