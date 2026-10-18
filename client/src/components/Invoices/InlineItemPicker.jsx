import React, { useState, useEffect } from 'react';
import RefineSearchModal from '../Inventory/RefineSearchModal';

const cleanVehiclePrice = (raw) => {
  const v = parseFloat(String(raw || '').replace(/[^0-9.]/g, ''));
  return isNaN(v) ? 0 : v;
};

const vehicleFromCartItem = (item) => ({
  id: item.itemId,
  year: item.vehicleData?.year,
  make_name: item.vehicleData?.make,
  model_name: item.vehicleData?.model,
  type_name: item.vehicleData?.type,
  mileage: item.vehicleData?.mileage,
  price: item.price,
  primary_img: item.img,
  city: item.location ? String(item.location).split(',')[0].trim() : '',
  state: item.location ? String(item.location).split(',').slice(1).join(',').trim() : '',
  location: item.location,
});

const pkgPrice = (pkg) => parseFloat(pkg?.price) > 0 ? pkg.price : (pkg?.org_price || 0);

const InlineItemPicker = ({ cartItems, onChange, adPackages, listingPackages, membershipPackages, renewalPackages = [] }) => {
  const [pickCollapsed, setPickCollapsed] = useState(true);
  const [subCollapsed, setSubCollapsed] = useState({ listings: false, ads: false, renewals: false, vehicles: false });
  const [isRefineModalOpen, setIsRefineModalOpen] = useState(false);
  const [selectedVehicles, setSelectedVehicles] = useState([]);

  useEffect(() => {
    const stateIds = new Set(selectedVehicles.map(v => String(v.id)));
    const inCartNotInState = cartItems.filter(i => i.type === 'V' && !stateIds.has(String(i.itemId)));
    if (inCartNotInState.length > 0) {
      setSelectedVehicles(prev => [...prev, ...inCartNotInState.map(vehicleFromCartItem)]);
    }
  }, [cartItems]);

  const PACKAGE_TYPES = ['L', 'M', 'A', 'R'];

  const listingSelected = new Set(cartItems.filter(i => i.type === 'L').map(i => String(i.itemId)));
  const membershipSelected = new Set(cartItems.filter(i => i.type === 'M').map(i => String(i.itemId)));
  const adItem = cartItems.find(i => i.type === 'A');
  const adSelected = adItem ? String(adItem.itemId) : '';
  const renewalItem = cartItems.find(i => i.type === 'R');
  const renewalSelected = renewalItem ? String(renewalItem.itemId) : '';

  const activePackageType = (() => {
    const present = PACKAGE_TYPES.find(t => cartItems.some(i => i.type === t));
    return present || null;
  })();

  // Vehicles are exclusive BOTH ways: a package blocks the vehicle search, and
  // an attached vehicle blocks every package kind. Whichever side is already
  // in the cart wins, so the agent is never offered a combination that the
  // invoice cannot represent (a vehicle invoice is saved as type 7 and can
  // never carry a listing / membership / ads / renewal line).
  const vehiclesLocked = Boolean(activePackageType);
  const packagesLocked = cartItems.some(i => i.type === 'V');

  const toggleSubPanel = (key) => setSubCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  // Only ONE package kind (Listing / Membership / Ads / Renewal) is allowed per
  // invoice, and neither a package nor vehicles can be combined with the other.
  // Selecting an item of one kind automatically removes items of the others.
  const setTypeItem = (type, id, builder, single) => {
    if (packagesLocked) return;
    const alreadySelected = cartItems.some(i => i.type === type && String(i.itemId) === String(id));
    let base;
    if (single) {
      base = cartItems.filter(i => i.type !== type);
    } else {
      base = cartItems.filter(i => !(i.type === type && String(i.itemId) === String(id)));
    }
    if (!alreadySelected && PACKAGE_TYPES.includes(type)) {
      base = base.filter(i => !(PACKAGE_TYPES.includes(i.type) && i.type !== type));
      base = base.filter(i => i.type !== 'V');
      setSelectedVehicles([]);
    }
    onChange(alreadySelected ? base : [...base, builder(id)]);
  };

  const buildListing = (id) => {
    const pkg = listingPackages.find(p => String(p.id) === String(id));
    return {
      id: `list-${id}`, itemId: id,
      name: pkg ? (pkg.display_name || pkg.name) : 'Listing',
      price: parseFloat(pkgPrice(pkg)) || 0, quantity: 1, type: 'L',
    };
  };

  const buildMembership = (id) => {
    const pkg = membershipPackages.find(p => String(p.id) === String(id));
    return {
      id: `mem-${id}`, itemId: id,
      name: pkg ? (pkg.display_name || pkg.name) : 'Membership',
      price: parseFloat(pkgPrice(pkg)) || 0, quantity: 1, type: 'M',
    };
  };

  const buildAd = (id) => {
    const pkg = adPackages.find(p => String(p.id) === String(id));
    return {
      id: 'ads-package', itemId: id,
      name: pkg ? (pkg.display_name || pkg.name) : 'Ads Package',
      price: parseFloat(pkgPrice(pkg)) || 0, quantity: 1, type: 'A',
    };
  };

  const buildRenewal = (id) => {
    const pkg = renewalPackages.find(p => String(p.id) === String(id));
    return {
      id: `renew-${id}`, itemId: id,
      name: pkg ? (pkg.display_name || pkg.name) : 'Renewal',
      price: parseFloat(pkgPrice(pkg)) || 0, quantity: 1, type: 'R',
    };
  };

  const buildVehicle = (vehicle) => {
    const title = [vehicle.year, vehicle.make_name, vehicle.model_name].filter(Boolean).join(' ').trim() || 'Vehicle';
    return {
      id: `veh-${vehicle.id}`,
      itemId: vehicle.id,
      name: title,
      price: cleanVehiclePrice(vehicle.price),
      quantity: 1,
      type: 'V',
      img: vehicle.primary_img,
      location: [vehicle.city, vehicle.state].filter(Boolean).join(', ') || vehicle.location,
      vehicleData: {
        year: vehicle.year,
        make: vehicle.make_name,
        model: vehicle.model_name,
        type: vehicle.type_name,
        mileage: vehicle.mileage,
      },
    };
  };

  const handleSelectVehicles = (updatedVehiclesList) => {
    if (vehiclesLocked) return;
    setSelectedVehicles(updatedVehiclesList);
    const existingV = cartItems.filter(i => i.type === 'V');
    const nextV = (updatedVehiclesList || []).map(v => {
      const prev = existingV.find(i => String(i.itemId) === String(v.id));
      return prev ? { ...buildVehicle(v), quantity: prev.quantity, price: prev.price } : buildVehicle(v);
    });
    onChange([...cartItems.filter(i => i.type !== 'V'), ...nextV]);
  };

  const removeVehicle = (id) => {
    setSelectedVehicles(prev => prev.filter(v => String(v.id) !== String(id)));
    onChange(cartItems.filter(i => !(i.type === 'V' && String(i.itemId) === String(id))));
  };

  const vehicleMiles = (car) =>
    car.mileage && !isNaN(Number(car.mileage)) && Number(car.mileage) !== 0 ? `${Number(car.mileage).toLocaleString()} miles` : 'N/A miles';

  return (
    <div className="ci-panel" style={{ overflow: 'visible' }}>
      <div className="ci-panel-hdr" style={{ cursor: 'pointer' }} onClick={() => setPickCollapsed(prev => !prev)}>
        <h3 className="ci-panel-title">➕ Add Items</h3>
        <span className={`ci-chevron ${!pickCollapsed ? 'open' : ''}`}>▲</span>
      </div>
      {!pickCollapsed && (
        <>
          <style>{`
            .ii-picker { padding-top: 12px; }
            .ii-picker .crm-panel {
              background: #ffffff;
              border-radius: 8px;
              border: 1px solid #e1e4e8;
              overflow: visible;
              margin: 0 14px 14px 14px;
            }
            .ii-picker .panel-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 12px 16px;
              background: #ffffff;
              border-bottom: 1px solid #f0f0f0;
              font-size: 14px;
              font-weight: 600;
              color: #333;
              cursor: pointer;
              user-select: none;
            }
            .ii-picker .panel-header:hover { background-color: #f9fafb; }
            .ii-picker .panel-header h3 { margin: 0; font-size: 14px; }
            .ii-picker .collapse-icon {
              display: inline-block;
              transition: transform 0.3s ease;
              font-weight: bold;
              color: #6b7280;
            }
            .ii-picker .panel-body { padding: 16px; }
            .ii-picker .sub-label { font-size: 12px; font-weight: 600; margin: 0 0 8px 0; color: #555; }
            .ii-picker .price-grid {
              display: flex;
              gap: 12px;
              flex-wrap: wrap;
            }
            .ii-picker .price-grid label {
              font-size: 13px;
              display: flex;
              align-items: center;
              gap: 8px;
              color: #333;
              padding: 8px 12px;
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              background: #f9fafb;
              cursor: pointer;
              user-select: none;
            }
            .ii-picker .price-grid label:has(input:checked) {
              background: #eff6ff;
              border-color: #2563eb;
              font-weight: 600;
            }
            .ii-picker .price-grid input[type="checkbox"] { accent-color: #2563eb; }
          `}</style>

          <div className="ii-picker">
            {/* Listings & Memberships — checkbox grid */}
            <div className="crm-panel">
              <div className="panel-header" onClick={() => toggleSubPanel('listings')}>
                <h3>📎 Listings & Memberships</h3>
                <span className="collapse-icon" style={{ transform: subCollapsed.listings ? 'rotate(180deg)' : 'rotate(0deg)' }}>^</span>
              </div>
              <div className="panel-body" style={{ display: subCollapsed.listings ? 'none' : 'block' }}>
                {packagesLocked && (
                  <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: 600, marginBottom: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px 10px' }}>
                    ⚠ Packages can't be combined with a vehicle — remove the vehicle to add a listing or membership.
                  </div>
                )}
                <p className="sub-label" style={{ margin: '0 0 10px 0' }}>Listings</p>
                {listingPackages.length === 0 ? (
                  <div style={{ fontSize: '13px', color: '#9ca3af', padding: '8px 0' }}>No listing packages configured yet.</div>
                ) : (
                  <div className="price-grid">
                    {listingPackages.map(pkg => {
                      const idStr = String(pkg.id);
                      const displayPrice = pkgPrice(pkg);
                      const disabled = packagesLocked || (activePackageType && activePackageType !== 'L');
                      return (
                        <label key={pkg.id} style={disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined} title={disabled ? (packagesLocked ? "Packages can't be combined with a vehicle" : 'Only one package type allowed per invoice') : undefined}>
                          <input
                            type="checkbox"
                            checked={listingSelected.has(idStr)}
                            disabled={disabled}
                            onChange={() => setTypeItem('L', idStr, buildListing, false)}
                          />
                          <span>{pkg.display_name || pkg.name}</span>
                          <span style={{ color: '#2563eb', fontWeight: 700 }}>${parseFloat(displayPrice).toLocaleString()}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

              <p className="sub-label" style={{ margin: '15px 0 10px 0' }}>Memberships</p>
                {membershipPackages.length === 0 ? (
                  <div style={{ fontSize: '13px', color: '#9ca3af', padding: '8px 0' }}>No membership packages configured yet.</div>
                ) : (
                  <div className="price-grid">
                    {membershipPackages.map(pkg => {
                      const idStr = String(pkg.id);
                      const displayPrice = pkgPrice(pkg);
                      const disabled = packagesLocked || (activePackageType && activePackageType !== 'M');
                      return (
                        <label key={pkg.id} style={disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined} title={disabled ? (packagesLocked ? "Packages can't be combined with a vehicle" : 'Only one package type allowed per invoice') : undefined}>
                          <input
                            type="checkbox"
                            checked={membershipSelected.has(idStr)}
                            disabled={disabled}
                            onChange={() => setTypeItem('M', idStr, buildMembership, false)}
                          />
                          <span>{pkg.display_name || pkg.name}</span>
                          <span style={{ color: '#2563eb', fontWeight: 700 }}>${parseFloat(displayPrice).toLocaleString()}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Ads Package — single select */}
            <div className="crm-panel">
              <div className="panel-header" onClick={() => toggleSubPanel('ads')}>
                <h3>📢 Ads Package</h3>
                <span className="collapse-icon" style={{ transform: subCollapsed.ads ? 'rotate(180deg)' : 'rotate(0deg)' }}>^</span>
              </div>
              <div className="panel-body" style={{ display: subCollapsed.ads ? 'none' : 'block' }}>
                {adPackages.length === 0 ? (
                  <div style={{ fontSize: '13px', color: '#9ca3af', padding: '8px 0' }}>No ad packages configured.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {adPackages.map(pkg => {
                      const idStr = String(pkg.id);
                      const isSelected = adSelected === idStr;
                      const disabled = packagesLocked || (activePackageType && activePackageType !== 'A');
                      return (
                        <div key={pkg.id} onClick={disabled ? undefined : () => setTypeItem('A', idStr, buildAd, true)}
                          style={{
                            border: `2px solid ${isSelected ? '#2563eb' : '#e5e7eb'}`,
                            borderRadius: '10px', padding: '12px 16px',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            background: isSelected ? '#eff6ff' : '#fff',
                            opacity: disabled ? 0.5 : 1,
                            display: 'flex', alignItems: 'center', gap: '12px',
                          }}
                          title={disabled ? (packagesLocked ? "Packages can't be combined with a vehicle" : 'Only one package type allowed per invoice') : undefined}>
                          <div style={{
                            width: '20px', height: '20px', borderRadius: '50%',
                            border: `2px solid ${isSelected ? '#2563eb' : '#cbd5e1'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            {isSelected && <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#2563eb' }} />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: '14px', color: '#111827' }}>{pkg.display_name || pkg.name}</div>
                            {pkg.short_description && <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{pkg.short_description}</div>}
                          </div>
                          <div style={{ fontSize: '16px', fontWeight: 800, color: '#2563eb' }}>
                            ${parseFloat(pkgPrice(pkg)).toLocaleString()}<span style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280' }}>/mo</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Renewals — only shown while a renewal is the active package type */}
            {activePackageType === 'R' && (
              <div className="crm-panel">
                <div className="panel-header" onClick={() => toggleSubPanel('renewals')}>
                  <h3>🔁 Renewals</h3>
                  <span className="collapse-icon" style={{ transform: subCollapsed.renewals ? 'rotate(180deg)' : 'rotate(0deg)' }}>^</span>
                </div>
                <div className="panel-body" style={{ display: subCollapsed.renewals ? 'none' : 'block' }}>
                  {renewalPackages.length === 0 ? (
                    <div style={{ fontSize: '13px', color: '#9ca3af', padding: '8px 0' }}>No renewal packages configured.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {renewalPackages.map(pkg => {
                        const idStr = String(pkg.id);
                        const isSelected = renewalSelected === idStr;
                        return (
                          <div key={pkg.id} onClick={() => setTypeItem('R', idStr, buildRenewal, true)}
                            style={{
                              border: `2px solid ${isSelected ? '#2563eb' : '#e5e7eb'}`,
                              borderRadius: '10px', padding: '12px 16px',
                              cursor: 'pointer',
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
                              {pkg.short_description && <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{pkg.short_description}</div>}
                            </div>
                            <div style={{ fontSize: '16px', fontWeight: 800, color: '#2563eb' }}>
                              ${parseFloat(pkgPrice(pkg)).toLocaleString()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Vehicles — popup refine search */}
            <div className="crm-panel">
              <div className="panel-header" onClick={() => toggleSubPanel('vehicles')}>
                <h3>🚗 Vehicle</h3>
                <span className="collapse-icon" style={{ transform: subCollapsed.vehicles ? 'rotate(180deg)' : 'rotate(0deg)' }}>^</span>
              </div>
              <div className="panel-body" style={{ display: subCollapsed.vehicles ? 'none' : 'block' }}>
                {vehiclesLocked && (
                  <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: 600, marginBottom: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px 10px' }}>
                    ⚠ Vehicles can't be combined with a package — remove the package to add vehicles.
                  </div>
                )}
                <button
                  onClick={() => { if (!vehiclesLocked) setIsRefineModalOpen(true); }}
                  disabled={vehiclesLocked}
                  style={{ width: '100%', padding: '10px', backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '6px', color: '#4b5563', fontWeight: '600', cursor: vehiclesLocked ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', opacity: vehiclesLocked ? 0.5 : 1 }}
                >
                  <span style={{ fontSize: '16px' }}>🔍</span> Search with seller name, year, & make...
                </button>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {selectedVehicles.map((car) => (
                    <div key={car.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', paddingBottom: '12px', borderBottom: '1px solid #f3f4f6' }}>
                      <button onClick={() => removeVehicle(car.id)} style={{ background: '#fef2f2', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, marginTop: '2px', fontSize: '12px', fontWeight: 'bold' }} title="Remove Vehicle">✕</button>
                      <div style={{ background: '#16a34a', borderRadius: '4px', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0, marginTop: '3px' }}>✓</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '700', color: '#111827', fontSize: '14px', marginBottom: '2px' }}>{car.year} {car.make_name} {car.model_name}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>{vehicleMiles(car)} • {car.location || 'Location N/A'}</div>
                      </div>
                      <button
                        onClick={() => { if (!vehiclesLocked) setIsRefineModalOpen(true); }}
                        disabled={vehiclesLocked}
                        style={{ background: '#eff6ff', border: '1px solid #93c5fd', color: '#2563eb', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', fontWeight: '600', cursor: vehiclesLocked ? 'not-allowed' : 'pointer', flexShrink: 0, whiteSpace: 'nowrap', opacity: vehiclesLocked ? 0.5 : 1 }}
                        title={vehiclesLocked ? "Vehicles can't be combined with a package" : 'View / Edit Vehicles'}
                      >
                        👁 View
                      </button>
                    </div>
                  ))}
                  {selectedVehicles.length === 0 && <div style={{ fontSize: '13px', color: '#9ca3af', fontStyle: 'italic' }}>No vehicles selected. Click the search bar above to add vehicles.</div>}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      <RefineSearchModal
        isOpen={isRefineModalOpen}
        onClose={() => setIsRefineModalOpen(false)}
        initialSelectedVehicles={selectedVehicles}
        onSelectVehicles={handleSelectVehicles}
      />
    </div>
  );
};

export default InlineItemPicker;