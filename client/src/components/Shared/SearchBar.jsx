import React from 'react';

const SearchBar = () => {
  return (
    <div className="bottom-search-bar" style={styles.container}>
      <span style={styles.icon}>🔍</span>
      <input 
        type="text" 
        placeholder="Search conversations or phone numbers" 
        style={styles.input}
      />
    </div>
  );
};

// Using inline styles here for brevity, but move this to App.css ideally!
const styles = {
  container: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    width: '100%',
    backgroundColor: '#fff',
    borderTop: '1px solid #eaeaea',
    padding: '10px 20px',
    display: 'flex',
    alignItems: 'center',
    zIndex: 100,
  },
  icon: { marginRight: '10px', color: '#888' },
  input: {
    width: '100%',
    border: 'none',
    outline: 'none',
    fontSize: '14px',
    padding: '8px 0'
  }
};

export default SearchBar;