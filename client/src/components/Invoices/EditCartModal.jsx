import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

const AVAILABLE_COLORS = [
  { name: 'white', hex: '#ffffff' },
  { name: 'black', hex: '#000000' },
  { name: 'gray', hex: '#9ca3af' },
  { name: 'orange', hex: '#f97316' },
  { name: 'yellow', hex: '#eab308' },
  { name: 'red', hex: '#ef4444' },
  { name: 'blue', hex: '#3b82f6' },
];

const COLOR_CODE_MAP = {
  BLK: 'black', WHT: 'white', GRY: 'gray',
  ORG: 'orange', YLW: 'yellow', RED: 'red', BLU: 'blue',
};

const PATTERN_CODE_MAP = {
  DIA: 'Diamond', HEX: 'Hexagon', V: 'Chevron',
  LEA: 'Leaf', CUS: 'Custom',
};

const swatchFor = (colorName) =>
  AVAILABLE_COLORS.find(c => c.name === colorName)?.hex || '#000';

const TYPE_LABELS = { P: 'Seat Cover', L: 'Listing', M: 'Membership', A: 'Ads Package', V: 'Vehicle' };

const PACKAGE_TYPES = ['L', 'M', 'A'];

const EditCartModal = ({ isOpen, onClose, onSave, cartItems, adPackages, listingPackages, membershipPackages, API_BASE_URL }) => {
  const [activeTab, setActiveTab] = useState('items');
  const [editItems, setEditItems] = useState([]);

  const packagePresent = PACKAGE_TYPES.some(t => editItems.some(i => i.type === t));
  const vehiclePresent = editItems.some(i => i.type === 'V');
  const vehicleLocked = packagePresent;
  // Vehicles and packages are mutually exclusive both ways: a package locks the
  // vehicle search, and an attached vehicle locks every package picker (this
  // invoice becomes a type 7 Vehicle invoice).
  const packagesLocked = vehiclePresent;

  const [availableProducts, setAvailableProducts] = useState([]);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [productVariantsMap, setProductVariantsMap] = useState({});
  const [loadingVariants, setLoadingVariants] = useState({});
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [selectedLeather, setSelectedLeather] = useState('black');
  const [selectedStitch, setSelectedStitch] = useState('black');
  const [selectedPattern, setSelectedPattern] = useState('Diamond');
  const [addQty, setAddQty] = useState(1);

  const [selectedListingIds, setSelectedListingIds] = useState([]);
  const [selectedMembershipIds, setSelectedMembershipIds] = useState([]);
  const [selectedAdPkgId, setSelectedAdPkgId] = useState('');

  const [vehicles, setVehicles] = useState([]);
  const [vehicleSearchTerm, setVehicleSearchTerm] = useState('');
  const [loadingVehicles, setLoadingVehicles] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setEditItems(cartItems.map(item => ({ ...item })));
      setSelectedListingIds(cartItems.filter(i => i.type === 'L').map(i => i.itemId).filter(Boolean));
      setSelectedMembershipIds(cartItems.filter(i => i.type === 'M').map(i => i.itemId).filter(Boolean));
      const adsItem = cartItems.find(i => i.type === 'A');
      setSelectedAdPkgId(adsItem?.itemId ? String(adsItem.itemId) : '');
      setActiveTab('items');
      setSelectedProductId(null);
      setProductSearchTerm('');
      setAddQty(1);
      setVehicleSearchTerm('');
      fetchProducts();
      fetchVehicles();
    }
  }, [isOpen, cartItems]);

  const fetchProducts = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/products`);
      const data = await response.json();
      const items = data.data || data.products || data;
      if (items && Array.isArray(items)) {
        const formatted = items.map(p => {
          let imgFilename = null;
          if (p.image && p.image !== '[]') {
            try {
              const parsed = JSON.parse(p.image);
              if (Array.isArray(parsed) && parsed.length > 0) imgFilename = parsed[0];
              else if (typeof parsed === 'string') imgFilename = parsed;
            } catch (e) {
              if (typeof p.image === 'string' && p.image.length > 4) imgFilename = p.image;
            }
          }
          if (imgFilename) imgFilename = imgFilename.replace(/['"\[\]]+/g, '').trim();
          let finalImgUrl = 'https://via.placeholder.com/60x80/e5e7eb/9ca3af?text=No+Img';
          if (imgFilename) {
            if (imgFilename.startsWith('http')) finalImgUrl = imgFilename;
            else finalImgUrl = `https://developer.globallimos.com/sales/uploads/products/${imgFilename}`;
          }
          return {
            id: p.id,
            name: p.display_name || p.name || 'Unknown Product',
            price: parseFloat(p.dp || p.ndr || p.price || 185.00),
            img: finalImgUrl,
          };
        });
        setAvailableProducts(formatted);
        formatted.forEach(prod => fetchVariants(prod.id));
      }
    } catch (error) {
      console.error("Failed to fetch products", error);
    }
  };

  const fetchVariants = async (productId) => {
    if (productVariantsMap[productId] || loadingVariants[productId]) return;
    setLoadingVariants(prev => ({ ...prev, [productId]: true }));
    try {
      const response = await fetch(`${API_BASE_URL}/products/${productId}/variants`);
      const data = await response.json();
      if (data.success) {
        const mapped = (data.variants || []).map(v => ({
          inventoryId: v.id,
          sku: v.sku,
          leatherColor: COLOR_CODE_MAP[v.leather_color] || (v.leather_color || '').toLowerCase(),
          stitchColor: COLOR_CODE_MAP[v.stitch_color] || (v.stitch_color || '').toLowerCase(),
          pattern: PATTERN_CODE_MAP[v.pattern] || v.pattern,
          avail: v.qty,
        }));
        setProductVariantsMap(prev => ({ ...prev, [productId]: mapped }));
      } else {
        setProductVariantsMap(prev => ({ ...prev, [productId]: [] }));
      }
    } catch (error) {
      console.error(`Failed to fetch variants for product ${productId}:`, error);
      setProductVariantsMap(prev => ({ ...prev, [productId]: [] }));
    } finally {
      setLoadingVariants(prev => ({ ...prev, [productId]: false }));
    }
  };

  const handleRemoveItem = (index) => {
    setEditItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdatePrice = (index, newPrice) => {
    setEditItems(prev => prev.map((item, i) =>
      i === index ? { ...item, price: newPrice === '' ? 0 : parseFloat(newPrice) || 0 } : item
    ));
  };

  const handleUpdateQty = (index, delta) => {
    setEditItems(prev => prev.map((item, i) =>
      i === index ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
    ));
  };

  const toggleListing = (id) => {
    if (packagesLocked) return;
    setSelectedMembershipIds([]);
    setSelectedAdPkgId('');
    setSelectedListingIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleMembership = (id) => {
    if (packagesLocked) return;
    setSelectedListingIds([]);
    setSelectedAdPkgId('');
    setSelectedMembershipIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const fetchVehicles = async (searchTerm) => {
    setLoadingVehicles(true);
    try {
      const query = new URLSearchParams({ searchTerm: searchTerm || '' }).toString();
      const response = await fetch(`${API_BASE_URL}/inventory/search-vehicles?${query}`);
      const result = await response.json();
      if (result.success) {
        setVehicles(result.data || []);
      } else {
        setVehicles([]);
      }
    } catch (error) {
      console.error("Failed to fetch vehicles", error);
      setVehicles([]);
    } finally {
      setLoadingVehicles(false);
    }
  };

  const getOptimizedImage = (url) => {
    if (!url) return 'https://via.placeholder.com/120x90/e5e7eb/9ca3af?text=No+Image';
    if (url.includes('cloudinary.com')) {
      return url.replace('/upload/', '/upload/w_300,h_200,c_fill,q_auto,f_auto/');
    }
    return url;
  };

  const cleanVehiclePrice = (raw) => {
    const v = parseFloat(String(raw || '').replace(/[^0-9.]/g, ''));
    return isNaN(v) ? 0 : v;
  };

  const toggleVehicle = (vehicle) => {
    if (vehicleLocked) return;
    setEditItems(prev => {
      const inCart = prev.some(i => i.type === 'V' && String(i.itemId) === String(vehicle.id));
      if (inCart) {
        return prev.filter(i => !(i.type === 'V' && String(i.itemId) === String(vehicle.id)));
      }
      const title = [vehicle.year, vehicle.make_name, vehicle.model_name].filter(Boolean).join(' ').trim() || 'Vehicle';
      return [...prev, {
        id: `veh-${vehicle.id}`,
        itemId: vehicle.id,
        name: title,
        price: cleanVehiclePrice(vehicle.price),
        quantity: 1,
        type: 'V',
        img: vehicle.primary_img,
        location: [vehicle.city, vehicle.state].filter(Boolean).join(', '),
        vehicleData: {
          year: vehicle.year,
          make: vehicle.make_name,
          model: vehicle.model_name,
          type: vehicle.type_name,
          mileage: vehicle.mileage,
        },
      }];
    });
  };

  const handleAddProductVariant = (variant) => {
    const prod = availableProducts.find(p => p.id === selectedProductId);
    if (!prod) return;

    const lineKey = `prod-${prod.id}-${variant.inventoryId}-${Date.now()}`;
    setEditItems(prev => [...prev, {
      id: lineKey,
      itemId: variant.inventoryId,
      name: prod.name,
      price: prod.price,
      quantity: addQty,
      type: 'P',
      img: prod.img,
      leatherColor: variant.leatherColor,
      stitchColor: variant.stitchColor,
      pattern: variant.pattern,
      sku: variant.sku,
      inventoryId: variant.inventoryId,
    }]);
  };

  const handleSave = () => {
    let items = [...editItems];

    const listingIdsInCart = new Set(items.filter(i => i.type === 'L').map(i => String(i.itemId)));
    const membershipIdsInCart = new Set(items.filter(i => i.type === 'M').map(i => String(i.itemId)));

    selectedListingIds.forEach(id => {
      if (!listingIdsInCart.has(String(id))) {
        const pkg = listingPackages.find(p => String(p.id) === String(id));
        const price = pkg ? (parseFloat(pkg.price) > 0 ? pkg.price : pkg.org_price) : 0;
        items.push({
          id: `list-${id}`, itemId: id, name: pkg ? (pkg.display_name || pkg.name) : 'Listing',
          price: parseFloat(price) || 0, quantity: 1, type: 'L',
        });
      }
    });
    items = items.filter(i => i.type !== 'L' || selectedListingIds.includes(String(i.itemId)));

    selectedMembershipIds.forEach(id => {
      if (!membershipIdsInCart.has(String(id))) {
        const pkg = membershipPackages.find(p => String(p.id) === String(id));
        const price = pkg ? (parseFloat(pkg.price) > 0 ? pkg.price : pkg.org_price) : 0;
        items.push({
          id: `mem-${id}`, itemId: id, name: pkg ? (pkg.display_name || pkg.name) : 'Membership',
          price: parseFloat(price) || 0, quantity: 1, type: 'M',
        });
      }
    });
    items = items.filter(i => i.type !== 'M' || selectedMembershipIds.includes(String(i.itemId)));

    if (selectedAdPkgId) {
      const adsInCart = items.some(i => i.type === 'A');
      if (!adsInCart) {
        const pkg = adPackages.find(p => String(p.id) === String(selectedAdPkgId));
        const price = pkg ? (parseFloat(pkg.price) > 0 ? pkg.price : pkg.org_price) : 0;
        items.push({
          id: 'ads-package', itemId: selectedAdPkgId,
          name: pkg ? (pkg.display_name || pkg.name) : 'Ads Package',
          price: parseFloat(price) || 0, quantity: 1, type: 'A',
        });
      }
    }
    items = items.filter(i => i.type !== 'A' || (selectedAdPkgId && String(i.itemId) === String(selectedAdPkgId)));

    // Only ONE package kind (L / M / A) per invoice. Prefer the kind with the
    // most items so mixed legacy carts collapse to the dominant package type.
    const kindsPresent = PACKAGE_TYPES.filter(t => items.some(i => i.type === t));
    if (kindsPresent.length > 1) {
      const dominant = kindsPresent.reduce((a, b) =>
        (items.filter(i => i.type === a).length >= items.filter(i => i.type === b).length) ? a : b
      );
      items = items.filter(i => !PACKAGE_TYPES.includes(i.type) || i.type === dominant);
    }

    // Vehicles and packages are mutually exclusive, and the vehicle wins: an
    // attached vehicle makes this a Vehicle invoice (type 7), which can never
    // carry a listing / membership / ads line. The package pickers are locked
    // while a vehicle is in the cart, so a package here only survives from a
    // cart that was already mixed.
    if (items.some(i => i.type === 'V')) {
      items = items.filter(i => !PACKAGE_TYPES.includes(i.type));
    }

    onSave(items);
    onClose();
  };

  const filteredProducts = availableProducts.filter(p =>
    p.name.toLowerCase().includes(productSearchTerm.toLowerCase())
  );

  const selectedProductData = availableProducts.find(p => p.id === selectedProductId);

  if (!isOpen) return null;

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'white', width: '100%', maxWidth: '700px', maxHeight: '90vh',
        borderRadius: '16px', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#111827' }}>Edit Cart</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#9ca3af' }}>✕</button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', flexShrink: 0, padding: '0 20px' }}>
          {['items', 'products', 'vehicles', 'listings', 'ads'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: '10px 14px', fontSize: '13px', fontWeight: 700, background: 'none',
              border: 'none', cursor: 'pointer',
              color: activeTab === tab ? '#2563eb' : '#6b7280',
              borderBottom: activeTab === tab ? '2px solid #2563eb' : '2px solid transparent',
            }}>
              {tab === 'items' ? '📋 Items' : tab === 'products' ? '🧵 Products' : tab === 'vehicles' ? '🚐 Vehicles' : tab === 'listings' ? '📎 Listings' : '📢 Ads'}
            </button>
          ))}
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px' }}>

          {activeTab === 'items' && (
            <div>
              {editItems.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>No items in cart. Add items from the other tabs.</div>
              ) : (
                editItems.map((item, index) => (
                  <div key={item.id || index} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 12px', borderRadius: '8px',
                    background: index % 2 === 0 ? '#fafafa' : 'white',
                    borderBottom: '1px solid #f3f4f6',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>
                        {item.name}
                        <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 400, marginLeft: '6px' }}>
                          {TYPE_LABELS[item.type] || item.type}
                        </span>
                      </div>
                      {(item.leatherColor || item.pattern) && (
                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                          {item.leatherColor && <span style={{ textTransform: 'capitalize' }}>{item.leatherColor}</span>}
                          {item.stitchColor && <span> / {item.stitchColor}</span>}
                          {item.pattern && <span> / {item.pattern}</span>}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {item.type === 'P' && (
                        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden' }}>
                          <button onClick={() => handleUpdateQty(index, -1)} style={{ background: '#f9fafb', border: 'none', padding: '4px 8px', cursor: 'pointer', fontSize: '12px' }}>−</button>
                          <span style={{ padding: '4px 8px', fontSize: '12px', fontWeight: 600, borderLeft: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb' }}>{item.quantity}</span>
                          <button onClick={() => handleUpdateQty(index, 1)} style={{ background: '#f9fafb', border: 'none', padding: '4px 8px', cursor: 'pointer', fontSize: '12px' }}>+</button>
                        </div>
                      )}
                      <div style={{ position: 'relative', width: '80px' }}>
                        <span style={{ position: 'absolute', left: '6px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: '#6b7280' }}>$</span>
                        <input type="number" min="0" step="0.01" value={item.price} onChange={e => handleUpdatePrice(index, e.target.value)} style={{
                          width: '100%', padding: '5px 6px 5px 18px', border: '1px solid #d1d5db', borderRadius: '6px',
                          fontSize: '12px', fontWeight: 600, textAlign: 'right', outline: 'none', color: '#111827', boxSizing: 'border-box',
                        }} />
                      </div>
                      <button onClick={() => handleRemoveItem(index)} style={{
                        background: '#fef2f2', border: '1px solid #fecaca', color: '#ef4444',
                        borderRadius: '6px', width: '28px', height: '28px', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '14px', flexShrink: 0,
                      }}>✕</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'products' && (
            <div>
              <div style={{ position: 'relative', marginBottom: '14px' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#9ca3af' }}>🔍</span>
                <input type="text" placeholder="Search products..." value={productSearchTerm} onChange={e => setProductSearchTerm(e.target.value)} style={{
                  width: '100%', padding: '10px 12px 10px 34px', borderRadius: '8px', border: '1px solid #d1d5db',
                  fontSize: '14px', outline: 'none', boxSizing: 'border-box', background: '#f9fafb',
                }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px', marginBottom: '16px' }}>
                {filteredProducts.map(prod => {
                  const isSelected = selectedProductId === prod.id;
                  return (
                    <div key={prod.id} onClick={() => { setSelectedProductId(prod.id); setSelectedLeather('black'); setSelectedStitch('black'); setSelectedPattern('Diamond'); setAddQty(1); }}
                      style={{
                        border: `2px solid ${isSelected ? '#2563eb' : '#e5e7eb'}`, borderRadius: '10px',
                        padding: '8px', cursor: 'pointer', background: isSelected ? '#eff6ff' : '#fff',
                        textAlign: 'center',
                      }}>
                      {isSelected && <div style={{ position: 'absolute', top: '4px', right: '4px', width: '16px', height: '16px', borderRadius: '50%', background: '#2563eb', color: '#fff', fontSize: '10px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>}
                      <img src={prod.img} alt={prod.name} style={{ width: '100%', height: '60px', objectFit: 'cover', borderRadius: '6px', marginBottom: '4px', background: '#f3f4f6' }}
                        onError={e => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/60x80/e5e7eb/9ca3af?text=No+Img'; }} />
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{prod.name}</div>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#2563eb' }}>${prod.price.toFixed(2)}</div>
                    </div>
                  );
                })}
              </div>

              {selectedProductData && (
                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#111827', marginBottom: '10px' }}>
                    Add: {selectedProductData.name}
                  </div>

                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '4px' }}>Leather</label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {AVAILABLE_COLORS.map(c => (
                          <div key={c.name} onClick={() => setSelectedLeather(c.name)} title={c.name} style={{
                            backgroundColor: c.hex, width: '26px', height: '26px', borderRadius: '50%',
                            border: c.name === 'white' ? '1px solid #d1d5db' : 'none',
                            outline: selectedLeather === c.name ? '2px solid #2563eb' : 'none',
                            outlineOffset: '2px', cursor: 'pointer',
                          }} />
                        ))}
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '4px' }}>Stitch</label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {AVAILABLE_COLORS.map(c => (
                          <div key={c.name} onClick={() => setSelectedStitch(c.name)} title={c.name} style={{
                            backgroundColor: c.hex, width: '26px', height: '26px', borderRadius: '50%',
                            border: c.name === 'white' ? '1px solid #d1d5db' : 'none',
                            outline: selectedStitch === c.name ? '2px solid #2563eb' : 'none',
                            outlineOffset: '2px', cursor: 'pointer',
                          }} />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '4px' }}>Pattern</label>
                      <select value={selectedPattern} onChange={e => setSelectedPattern(e.target.value)} style={{
                        padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', outline: 'none',
                      }}>
                        {['Diamond', 'Hexagon', 'Chevron', 'Leaf', 'Custom'].map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '4px' }}>Qty</label>
                      <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: '6px', overflow: 'hidden' }}>
                        <button onClick={() => setAddQty(q => Math.max(1, q - 1))} style={{ background: '#f9fafb', border: 'none', padding: '4px 10px', cursor: 'pointer' }}>−</button>
                        <span style={{ padding: '4px 10px', fontSize: '13px', fontWeight: 600 }}>{addQty}</span>
                        <button onClick={() => setAddQty(q => q + 1)} style={{ background: '#f9fafb', border: 'none', padding: '4px 10px', cursor: 'pointer' }}>+</button>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {(productVariantsMap[selectedProductId] || []).filter(v =>
                      v.leatherColor === selectedLeather && v.stitchColor === selectedStitch && v.pattern === selectedPattern
                    ).map(v => (
                      <button key={v.inventoryId} onClick={() => handleAddProductVariant(v)}
                        disabled={v.avail <= 0}
                        style={{
                          padding: '8px 14px', border: '1px solid #2563eb', borderRadius: '8px',
                          background: '#eff6ff', color: '#2563eb', fontWeight: 600, fontSize: '12px',
                          cursor: v.avail > 0 ? 'pointer' : 'not-allowed', opacity: v.avail <= 0 ? 0.5 : 1,
                        }}>
                        {v.avail > 0 ? `+ Add (Avail: ${v.avail})` : 'Out of Stock'}
                      </button>
                    ))}
                    {(!productVariantsMap[selectedProductId] || productVariantsMap[selectedProductId].length === 0) && !loadingVariants[selectedProductId] && (
                      <div style={{ fontSize: '12px', color: '#9ca3af', padding: '8px 0' }}>No matching stock variants found.</div>
                    )}
                    {loadingVariants[selectedProductId] && (
                      <div style={{ fontSize: '12px', color: '#9ca3af', padding: '8px 0' }}>Loading variants…</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'vehicles' && (
            <div>
              {vehicleLocked && (
                <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: 600, marginBottom: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px 10px' }}>
                  ⚠ Vehicles can't be combined with a package — remove the package to add vehicles.
                </div>
              )}
              <div style={{ position: 'relative', marginBottom: '14px' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#9ca3af' }}>🔍</span>
                <input type="text" placeholder="Search vehicles by make, model or year..."
                  value={vehicleSearchTerm}
                  disabled={vehicleLocked}
                  onChange={e => { setVehicleSearchTerm(e.target.value); fetchVehicles(e.target.value); }}
                  style={{
                    width: '100%', padding: '10px 12px 10px 34px', borderRadius: '8px', border: '1px solid #d1d5db',
                    fontSize: '14px', outline: 'none', boxSizing: 'border-box', background: vehicleLocked ? '#f3f4f6' : '#f9fafb',
                    opacity: vehicleLocked ? 0.6 : 1, cursor: vehicleLocked ? 'not-allowed' : 'text',
                  }} />
              </div>

              {loadingVehicles ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Loading vehicles…</div>
              ) : vehicles.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>No vehicles found.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                  {vehicles.map(v => {
                    const isInCart = editItems.some(i => i.type === 'V' && String(i.itemId) === String(v.id));
                    const title = [v.year, v.make_name, v.model_name].filter(Boolean).join(' ').trim() || 'Vehicle';
                    const price = cleanVehiclePrice(v.price);
                    return (
                      <div key={v.id} onClick={() => toggleVehicle(v)} style={{
                        border: `2px solid ${isInCart ? '#2563eb' : '#e5e7eb'}`,
                        borderRadius: '10px', padding: '8px', cursor: vehicleLocked ? 'not-allowed' : 'pointer',
                        background: isInCart ? '#eff6ff' : '#fff', textAlign: 'center', position: 'relative',
                        opacity: vehicleLocked ? 0.5 : 1,
                      }}>
                        {isInCart && <div style={{ position: 'absolute', top: '4px', right: '4px', width: '18px', height: '18px', borderRadius: '50%', background: '#2563eb', color: '#fff', fontSize: '11px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>✓</div>}
                        <img src={getOptimizedImage(v.primary_img)} alt={title} style={{ width: '100%', height: '90px', objectFit: 'cover', borderRadius: '6px', marginBottom: '6px', background: '#f3f4f6' }}
                          onError={e => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/120x90/e5e7eb/9ca3af?text=No+Image'; }} />
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#111827' }}>{title}</div>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                          {[v.type_name, [v.city, v.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: price > 0 ? '#2563eb' : '#9ca3af', marginTop: '4px' }}>
                          {price > 0 ? `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : 'Price on request'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'listings' && (
            <div>
              {packagesLocked && (
                <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: 600, marginBottom: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px 10px' }}>
                  ⚠ Packages can't be combined with a vehicle — remove the vehicle to add a listing or membership.
                </div>
              )}
              <p style={{ fontSize: '13px', fontWeight: 700, color: '#374151', margin: '0 0 10px' }}>Listings</p>
              {listingPackages.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#9ca3af', padding: '8px 0' }}>No listing packages configured.</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
                  {listingPackages.map(pkg => {
                    const idStr = String(pkg.id);
                    const checked = selectedListingIds.includes(idStr);
                    const price = parseFloat(pkg.price) > 0 ? pkg.price : pkg.org_price;
                    return (
                      <div key={pkg.id} onClick={() => toggleListing(idStr)} style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '10px 14px', borderRadius: '8px',
                        cursor: packagesLocked ? 'not-allowed' : 'pointer',
                        opacity: packagesLocked ? 0.5 : 1,
                        background: checked ? '#eff6ff' : '#f9fafb',
                        border: `1.5px solid ${checked ? '#2563eb' : '#e5e7eb'}`,
                        fontSize: '13px', fontWeight: checked ? 600 : 400,
                      }}>
                        <input type="checkbox" checked={checked} readOnly style={{ accentColor: '#2563eb', pointerEvents: 'none' }} />
                        <span>{pkg.display_name || pkg.name}</span>
                        <span style={{ color: '#2563eb', fontWeight: 700 }}>${parseFloat(price).toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <p style={{ fontSize: '13px', fontWeight: 700, color: '#374151', margin: '0 0 10px' }}>Memberships</p>
              {membershipPackages.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#9ca3af', padding: '8px 0' }}>No membership packages configured.</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {membershipPackages.map(pkg => {
                    const idStr = String(pkg.id);
                    const checked = selectedMembershipIds.includes(idStr);
                    const price = parseFloat(pkg.price) > 0 ? pkg.price : pkg.org_price;
                    return (
                      <div key={pkg.id} onClick={() => toggleMembership(idStr)} style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '10px 14px', borderRadius: '8px',
                        cursor: packagesLocked ? 'not-allowed' : 'pointer',
                        opacity: packagesLocked ? 0.5 : 1,
                        background: checked ? '#eff6ff' : '#f9fafb',
                        border: `1.5px solid ${checked ? '#2563eb' : '#e5e7eb'}`,
                        fontSize: '13px', fontWeight: checked ? 600 : 400,
                      }}>
                        <input type="checkbox" checked={checked} readOnly style={{ accentColor: '#2563eb', pointerEvents: 'none' }} />
                        <span>{pkg.display_name || pkg.name}</span>
                        <span style={{ color: '#2563eb', fontWeight: 700 }}>${parseFloat(price).toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'ads' && (
            <div>
              {packagesLocked && (
                <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: 600, marginBottom: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px 10px' }}>
                  ⚠ Ads can't be combined with a vehicle — remove the vehicle to add an ads package.
                </div>
              )}
              {adPackages.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>No ad packages configured.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {adPackages.map(pkg => {
                    const idStr = String(pkg.id);
                    const isSelected = selectedAdPkgId === idStr;
                    const price = parseFloat(pkg.price) > 0 ? pkg.price : pkg.org_price;
                    return (
                      <div key={pkg.id} onClick={() => {
                        if (packagesLocked) return;
                        if (selectedAdPkgId === idStr) { setSelectedAdPkgId(''); return; }
                        setSelectedListingIds([]);
                        setSelectedMembershipIds([]);
                        setSelectedAdPkgId(idStr);
                      }} style={{
                        border: `2px solid ${isSelected ? '#2563eb' : '#e5e7eb'}`,
                        borderRadius: '10px', padding: '12px 16px',
                        cursor: packagesLocked ? 'not-allowed' : 'pointer',
                        opacity: packagesLocked ? 0.5 : 1,
                        background: isSelected ? '#eff6ff' : '#fff',
                        display: 'flex', alignItems: 'center', gap: '12px',
                      }}>
                        <div style={{
                          width: '20px', height: '20px', borderRadius: '50%',
                          border: `2px solid ${isSelected ? '#2563eb' : '#cbd5e1'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          {isSelected && <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#2563eb' }} />}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: '14px', color: '#111827' }}>{pkg.display_name || pkg.name}</div>
                          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{pkg.short_description}</div>
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#2563eb' }}>
                          ${parseFloat(price).toLocaleString()}<span style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280' }}>/mo</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>

        <div style={{ padding: '14px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: 'white' }}>
          <button onClick={onClose} style={{
            padding: '10px 20px', border: '1.5px solid #d1d5db', borderRadius: '8px',
            background: 'white', color: '#374151', fontWeight: 600, fontSize: '14px', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleSave} style={{
            padding: '10px 24px', border: 'none', borderRadius: '8px',
            background: '#2563eb', color: 'white', fontWeight: 700, fontSize: '14px', cursor: 'pointer',
          }}>✓ Save Changes</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default EditCartModal;
