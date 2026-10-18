import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';

const InvoiceGateway = () => {
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Fetch the invoice details using the ID from the URL
    fetch(`${API_BASE_URL}/invoices/details/${invoiceId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.invoice) {
          setInvoice(data.invoice);
        } else {
          setError("Invoice not found.");
        }
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError("Failed to load invoice.");
        setLoading(false);
      });
  }, [invoiceId]);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>Loading your secure order...</div>;
  if (error) return <div style={{ padding: '40px', textAlign: 'center', color: 'red', fontFamily: 'sans-serif' }}>{error}</div>;

  // Parse the items to see what they are buying
  const items = JSON.parse(invoice.items_json || '[]');
  const seatCovers = items.filter(i => i.type === 'P');
  const digitalServices = items.filter(i => i.type === 'M' || i.type === 'L');

  // THE MAGIC: Load Seat Covers into the Cart Page's LocalStorage!
  const handleCheckoutSeatCovers = () => {
    const formattedCartItems = seatCovers.map((item) => {
      // 1. Clean the ID so it matches the database ID (remove 'prod-')
      const rawId = item.id.replace('prod-', '');

      // 2. Set safe defaults that match your StoreFront.jsx perfectly
      const pattern = 'Diamond';
      const color = 'black';

      // 3. Generate the EXACT cartItemId string that StoreFront is looking for
      const exactCartItemId = `${rawId}-${color}-${pattern}`;

      return {
        cartItemId: exactCartItemId,
        id: rawId, // Storefront expects the clean ID
        name: item.name,
        price: item.price,
        qty: item.quantity,
        image: item.img || 'https://via.placeholder.com/150',
        selectedPattern: pattern,
        selectedColor: color
      };
    });

    // Inject into local storage so CartPage & StoreFront pick it up
    localStorage.setItem('seatcover_cart', JSON.stringify(formattedCartItems));
    
    // Redirect to your existing Cart Page
    navigate('/sales/crm/cart'); 
  };
  const handleCheckoutServices = () => {
    // Redirect to wherever your membership/listing checkout is
    alert("Redirecting to Membership/Listing checkout...");
  };

  return (
    <div style={{ maxWidth: '600px', margin: '40px auto', padding: '24px', fontFamily: "'Inter', sans-serif", backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)' }}>
      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: '24px', color: '#111827' }}>Complete Your Order</h1>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>Invoice #{invoice.invoice_number}</p>
      </div>

      <div style={{ backgroundColor: '#f9fafb', padding: '20px', borderRadius: '8px', marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '16px', color: '#374151' }}>Pending Checkouts</h3>

        {/* Action Button for Seat Covers */}
        {seatCovers.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb', marginBottom: '12px' }}>
            <div>
              <div style={{ fontWeight: '700', color: '#111827', fontSize: '15px' }}>Physical Products</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>{seatCovers.length} Item(s) • Requires Shipping</div>
            </div>
            <button onClick={handleCheckoutSeatCovers} style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}>
              Checkout Cart ➔
            </button>
          </div>
        )}

        {/* Action Button for Services */}
        {digitalServices.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <div>
              <div style={{ fontWeight: '700', color: '#111827', fontSize: '15px' }}>Digital Services</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>{digitalServices.length} Item(s) • Memberships/Listings</div>
            </div>
            <button onClick={handleCheckoutServices} style={{ backgroundColor: '#10b981', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}>
              Pay Services ➔
            </button>
          </div>
        )}
      </div>

      <p style={{ textAlign: 'center', fontSize: '12px', color: '#9ca3af' }}>🔒 Secure payments powered by Stripe</p>
    </div>
  );
};

export default InvoiceGateway;