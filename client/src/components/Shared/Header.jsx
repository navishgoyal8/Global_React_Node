import { MenuIcon, CartIcon, HeartIcon } from './Icons'; // Removed Search and User icons

const Header = ({ cartCount, cartTotal, wishlistCount, onBrandClick, onCartClick, onWishlistClick }) => (
  <header className="store-header">
    <div className="header-left">
      <MenuIcon />
      <div className="brand" onClick={onBrandClick} style={{ cursor: 'pointer' }}>
        <div className="brand-icon"><CartIcon size={20} /></div>
        <div className="brand-text">
          <h1>Global Customs</h1>
          <span>Apparel &amp; Seat Covers</span>
        </div>
      </div>
    </div>
    
    {/* UPDATED: Increased gap to 24px and removed Search/User icons */}
    <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
      
      {/* UPDATED: Bolder, larger Wishlist Button matching the Cart icon's color */}
      <div 
        onClick={onWishlistClick} 
        style={{ 
          position: 'relative', cursor: 'pointer', display: 'flex', 
          alignItems: 'center', justifyContent: 'center', color: '#0f172a' 
        }}
      >
        <HeartIcon filled={false} size={24} strokeWidth={2.5} />
        {wishlistCount > 0 && (
          <span style={{ 
            position: 'absolute', top: '-6px', right: '-8px', background: '#ef4444', 
            color: '#fff', fontSize: '10px', fontWeight: 'bold', width: '16px', 
            height: '16px', borderRadius: '50%', display: 'flex', alignItems: 'center', 
            justifyContent: 'center', border: '2px solid #fff'
          }}>
            {wishlistCount}
          </span>
        )}
      </div>

      <div className="cart-summary" onClick={onCartClick} style={{ cursor: 'pointer' }}>
        <div className="cart-icon-wrapper">
          <CartIcon className="header-icon" />
          {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
        </div>
        <span className="cart-total">${cartTotal.toFixed(2)}</span>
      </div>
    </div>
  </header>
);

export default Header;