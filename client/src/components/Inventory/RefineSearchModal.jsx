import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './RefineSearchModal.css';
import { API_BASE_URL } from '../../config';

const RefineSearchModal = ({ isOpen, onClose, onSelectVehicles, initialSelectedVehicles = [] }) => {

  const [make, setMake] = useState('');
  const [minYear, setMinYear] = useState('');
  const [maxYear, setMaxYear] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  
  const [makeOptions, setMakeOptions] = useState([]);
  const [builder, setBuilder] = useState('');
  const [builderOptions, setBuilderOptions] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState('');
  const [locationOptions, setLocationOptions] = useState([]);
  const [vehicleType, setVehicleType] = useState('');
  const [vehicleTypeOptions, setVehicleTypeOptions] = useState([]);
  
  const [selectedCars, setSelectedCars] = useState([]);

  const [currentPage, setCurrentPage] = useState(1);
  const carsPerPage = 12; 
  
  const topOfResultsRef = useRef(null); 
  const initialSelectedIdsRef = useRef(new Set());

  const getOptimizedImage = (url) => {
    if (!url) return 'https://via.placeholder.com/250x160?text=No+Image';
    if (url.includes('cloudinary.com')) {
      return url.replace('/upload/', '/upload/w_300,h_200,c_fill,q_auto,f_auto/');
    }
    return url;
  };

  const fetchFilters = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/inventory/filters`);
      const data = await res.json();
      if (data.success) {
        setMakeOptions(data.makes);
        setLocationOptions(data.locations);
        setVehicleTypeOptions(data.vehicleTypes); 
        setBuilderOptions(data.builders);
      }
    } catch (error) {
      console.error("Failed to load filters", error);
    }
  };

  const fetchFilteredVehicles = async () => {
    setLoading(true);
    setCurrentPage(1); 
    try {
      const query = new URLSearchParams({
        vehicleType, builder, make, location, minYear, maxYear, minPrice, maxPrice
      }).toString();

      const response = await fetch(`${API_BASE_URL}/inventory/search-vehicles?${query}`);
      const result = await response.json();
      
      if (result.success) {
        setVehicles(sortWithSelectedFirst(result.data));
      }
    } catch (error) {
      console.error("Failed to fetch vehicles:", error);
    } finally {
      setLoading(false);
    }
  };

useEffect(() => {
  if (isOpen) {
    initialSelectedIdsRef.current = new Set(initialSelectedVehicles.map(v => v.id)); // NEW
    fetchFilters(); 
    fetchFilteredVehicles();
    setSelectedCars(initialSelectedVehicles); 
  }
}, [isOpen]);

  const sortWithSelectedFirst = (list) => {
  const selectedIds = initialSelectedIdsRef.current;
  return [...list].sort((a, b) => {
    const aSelected = selectedIds.has(a.id) ? 0 : 1;
    const bSelected = selectedIds.has(b.id) ? 0 : 1;
    return aSelected - bSelected; // 0 (selected) sorts before 1 (not selected), order otherwise preserved
  });
};

  const toggleSelection = (carObject) => {
    const isAlreadySelected = selectedCars.some(c => c.id === carObject.id);
    if (isAlreadySelected) {
      setSelectedCars(selectedCars.filter(c => c.id !== carObject.id));
    } else {
      setSelectedCars([...selectedCars, carObject]);
    }
  };

  const handleClearFilters = async () => {
    setVehicleType(''); setBuilder(''); setMake(''); setLocation('');
    setMinYear(''); setMaxYear(''); setMinPrice(''); setMaxPrice('');
    setCurrentPage(1); 

    setLoading(true);
    try {
      const query = new URLSearchParams({
        vehicleType: '', builder: '', make: '', location: '', minYear: '', maxYear: '', minPrice: '', maxPrice: ''
      }).toString();

      const response = await fetch(`${API_BASE_URL}/inventory/search-vehicles?${query}`);
      const result = await response.json();
      
      if (result.success) {
        setVehicles(sortWithSelectedFirst(result.data));
      }
    } catch (error) {
      console.error("Failed to fetch vehicles:", error);
    } finally {
      setLoading(false);
    }
  };

  const indexOfLastCar = currentPage * carsPerPage;
  const indexOfFirstCar = indexOfLastCar - carsPerPage;
  const currentCars = vehicles.slice(indexOfFirstCar, indexOfLastCar);
  const totalPages = Math.ceil(vehicles.length / carsPerPage);

  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
    setTimeout(() => {
      if (topOfResultsRef.current) {
        topOfResultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="refine-modal-backdrop" onClick={onClose}>
      <style>{`
        .pagination-container {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
          margin-top: 24px;
          padding-bottom: 24px;
        }
        .page-btn {
          padding: 8px 14px;
          border: 1px solid #d1d5db;
          background: white;
          border-radius: 6px;
          cursor: pointer;
          color: #374151;
          font-weight: 600;
          font-size: 14px;
          transition: all 0.2s;
        }
        .page-btn:hover:not(:disabled) {
          background: #f3f4f6;
          border-color: #9ca3af;
        }
        .page-btn.active {
          background: #2563eb;
          color: white;
          border-color: #2563eb;
        }
        .page-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .page-info {
          font-size: 14px;
          color: #6b7280;
          margin: 0 12px;
          font-weight: 500;
        }
      `}</style>
      
      <div className="refine-modal-container" onClick={e => e.stopPropagation()}>
        
        <div className="refine-header">
          <h2>Refine Your Searches</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="refine-content">
          <div className="filters-grid">
            
            <div className="filter-group">
              <label>Vehicle Type</label>
              <select className="filter-select" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
                <option value="">All Types</option>
                {vehicleTypeOptions?.map((type, idx) => (
                  <option key={idx} value={type.name}>{type.name}</option> 
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Make</label>
              <select className="filter-select" value={make} onChange={(e) => setMake(e.target.value)}>
                <option value="">All Makes</option>
                {makeOptions.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Location (State)</label>
              <select className="filter-select" value={location} onChange={(e) => setLocation(e.target.value)}>
                <option value="">All Locations</option>
                {locationOptions.map((zip, idx) => (
                  <option key={idx} value={zip}>{zip}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Builders</label>
              <select className="filter-select" value={builder} onChange={(e) => setBuilder(e.target.value)}>
                <option value="">All Builders</option>
                {builderOptions?.map((bld, idx) => (
                  <option key={idx} value={bld.name}>{bld.name}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Year Range</label>
              <div className="range-inputs">
                <input type="number" placeholder="Min Year" value={minYear} onChange={e => setMinYear(e.target.value)} />
                <span>—</span>
                <input type="number" placeholder="Max Year" value={maxYear} onChange={e => setMaxYear(e.target.value)} />
              </div>
            </div>

            <div className="filter-group">
              <label>Price Range</label>
              <div className="range-inputs">
                <input type="number" placeholder="Min Price" value={minPrice} onChange={e => setMinPrice(e.target.value)} />
                <span>—</span>
                <input type="number" placeholder="Max Price" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} />
              </div>
            </div>

          </div>

          <div className="refine-actions">
            <button className="btn-clear" onClick={handleClearFilters}>
              Clear Filters 🚫
            </button>
            <button className="btn-view" onClick={fetchFilteredVehicles}>
              Search Inventory 🔍
            </button>
          </div>

          <div className="results-scroll-area">
            
            <div ref={topOfResultsRef} style={{ position: 'relative', top: '-10px' }}></div>

            <div style={{ padding: '0 24px 12px 24px', fontSize: '15px', fontWeight: '600', color: '#374151' }}>
              Showing {vehicles.length > 0 ? `${indexOfFirstCar + 1} - ${Math.min(indexOfLastCar, vehicles.length)} of ` : ''} {vehicles.length} listings
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                Loading inventory... ⏳
              </div>
            ) : vehicles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚘</div>
                <h3 style={{ margin: '0 0 8px 0', color: '#111827', fontSize: '18px' }}>No vehicles found</h3>
                <p style={{ margin: 0, fontSize: '14px' }}>Try adjusting or clearing your filters to see more results.</p>
              </div>
            ) : (
              <>
                <div className="vehicles-grid">
                  {currentCars.map(car => {
                    const isSelected = selectedCars.some(c => c.id === car.id);
                    
                    return (
                      <div 
                        key={car.id} 
                        className={`vehicle-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => toggleSelection(car)} 
                      >
                        <div className="card-image-wrapper">
                          <input 
                            type="checkbox" 
                            className="card-checkbox"
                            checked={isSelected}
                            onChange={() => {}} 
                          />
                          <img 
                            src={getOptimizedImage(car.image_url)} 
                            alt={`${car.make_name} ${car.model_name}`} 
                            style={{ width: '100%', height: '160px', objectFit: 'cover' }}
                            onError={(e) => {
                              e.target.onerror = null; 
                              e.target.src = 'https://via.placeholder.com/250x160?text=Image+Missing';
                            }}
                          />
                        </div>
                        <div className="card-details">
                          <h4>{car.year} {car.make_name} {car.model_name}</h4>
                          <div className="card-meta">
                            {/* ✅ Added !isNaN check to gracefully handle text disguised as numbers */}
                            <span className="price">
                              {car.price && !isNaN(Number(car.price)) && Number(car.price) !== 0 
                                ? `$${Number(car.price).toLocaleString()}` 
                                : '$ N/A'}
                            </span>
                            <span className="mileage">
                              {car.mileage && !isNaN(Number(car.mileage)) && Number(car.mileage) !== 0 
                                ? `${Number(car.mileage).toLocaleString()} mi` 
                                : 'N/A mi'}
                            </span>
                          </div>
                          <div className="card-location">
                            📍 {car.location} • 200 miles from buyer
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {totalPages > 1 && (
                  <div className="pagination-container">
                    <button 
                      className="page-btn" 
                      disabled={currentPage === 1} 
                      onClick={() => handlePageChange(currentPage - 1)}
                    >
                      ← Prev
                    </button>
                    
                    <span className="page-info">
                      Page {currentPage} of {totalPages}
                    </span>

                    <button 
                      className="page-btn" 
                      disabled={currentPage === totalPages} 
                      onClick={() => handlePageChange(currentPage + 1)}
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        
        {selectedCars.length > 0 && (
          <div className="refine-footer" style={{ display: 'flex', gap: '10px', padding: '16px 24px', background: '#fff', borderTop: '1px solid #e5e7eb' }}>
            <button 
              className="btn-apply" 
              style={{ background: '#10b981', flex: 1, border: 'none', padding: '14px', borderRadius: '8px', color: 'white', fontWeight: 'bold', cursor: 'pointer', fontSize: '15px' }}
              onClick={() => {
                if (onSelectVehicles) {
                  onSelectVehicles(selectedCars);
                }
                onClose();
              }}
            >
              Attach {selectedCars.length} Selected Vehicles
            </button>
          </div>
        )}

      </div>
    </div>,
    document.body
  );
};

export default RefineSearchModal;