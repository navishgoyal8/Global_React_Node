import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import RefineSearchModal from '../../components/Inventory/RefineSearchModal';
import './AssignLeadModal.css';
import { API_BASE_URL } from '../../config';
import CrmQuickNav from '../../components/Navigation/CrmQuickNav';

const AVAILABLE_COLORS = [
  { name: 'white', hex: '#ffffff' },
  { name: 'black', hex: '#000000' },
  { name: 'gray', hex: '#9ca3af' }, // appears in inventory as GRY
  { name: 'orange', hex: '#f97316' },
  { name: 'yellow', hex: '#eab308' },
  { name: 'red', hex: '#ef4444' },
  { name: 'blue', hex: '#3b82f6' },
];

// Ad packages and their linked features are now fetched from the admin
// panel (sale_products type=3 "Ads" + package_ad_addons join), instead of
// being hardcoded here. See fetchAdsData() below.

// ── Inventory stores short codes (BLK, GRY, DIA, HEX, V...). Translate them
// to the display names/colors the rest of the UI already uses. Add codes
// here as you discover new ones in the inventory table. ──────────────────
const COLOR_CODE_MAP = {
  BLK: 'black', WHT: 'white', GRY: 'gray',
  ORG: 'orange', YLW: 'yellow', RED: 'red', BLU: 'blue',
};

const PATTERN_CODE_MAP = {
  DIA: 'Diamond', HEX: 'Hexagon', V: 'Chevron', // ⚠️ confirm "V" = Chevron with your data
  LEA: 'Leaf', CUS: 'Custom',
};

const swatchFor = (colorName) =>
  AVAILABLE_COLORS.find(c => c.name === colorName)?.hex || '#000';

const parseMoneyString = (str) => {
  const cleaned = (str || '').toString().replace(/[^0-9.]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
};

const AssignLeadPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // --- COMPONENT STATES ---
  const [collapsedPanels, setCollapsedPanels] = useState({
    contact: false,
    leadType: false,
    vehicle: false,
    listings: false,
    ads: false,
    products: false,
    service: false,
    call: false,
    followups: true
  });

  const togglePanel = (panelKey) => {
    setCollapsedPanels(prev => ({ ...prev, [panelKey]: !prev[panelKey] }));
  };

  // const { lead, createdInvoice } = location.state || {};

  const locationState = location.state || {};
  const createdInvoice = locationState.createdInvoice || null;
  const [lead, setLead] = useState(locationState.lead || null);
  const [modalTab, setModalTab] = useState('inventory'); // 'inventory' | 'custom'

  const CUSTOM_PATTERNS = ['Diamond', 'Hexagon', 'Chevron', 'Leaf', 'Custom'];
  const [customProductId, setCustomProductId] = useState('');
  const [customLeather, setCustomLeather] = useState('black');
  const [customStitch, setCustomStitch] = useState('black');
  const [customPattern, setCustomPattern] = useState('Diamond');
  const [customQty, setCustomQty] = useState(1);
  const [customDraftLines, setCustomDraftLines] = useState([]);
  const [customProductSearch, setCustomProductSearch] = useState(''); // NEW


  // NOTE: existingLeadData is now local state (not a one-time destructure from
  // location.state) so we can keep it in sync after a successful "Update Lead
  // Preferences" save without needing to navigate away and back.
  const [existingLeadData, setExistingLeadData] = useState(location.state?.existingLeadData || null);

  const [invoicedNumber, setInvoicedNumber] = useState(createdInvoice || null);
  const [invoicedId, setInvoicedId] = useState(null);

  const [activeTab, setActiveTab] = useState('messages');
  const [inputText, setInputText] = useState('');
  const [localHistory, setLocalHistory] = useState([]);
  const [isSending, setIsSending] = useState(false);

  // Form States
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedPhone, setSelectedPhone] = useState('');

  const [isCreating, setIsCreating] = useState(false);
  const [selectedLeadTypes, setSelectedLeadTypes] = useState([]);
  const [selectedListings, setSelectedListings] = useState([]);
  const [selectedMemberships, setSelectedMemberships] = useState([]);
  const [serviceType, setServiceType] = useState('SMS');

  const [serviceSubTab, setServiceSubTab] = useState('Text');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isCalling, setIsCalling] = useState(false);

  // Call Panel States
  const [callTab, setCallTab] = useState('Call');
  const [customPhone, setCustomPhone] = useState('');
  const [dialPadNumber, setDialPadNumber] = useState('');
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  const [contactMode, setContactMode] = useState('existing');
  const [contactSearchTerm, setContactSearchTerm] = useState('');
  const [showContactDropdown, setShowContactDropdown] = useState(false);

  const [systemUsers, setSystemUsers] = useState([]);
  const [availableCallingNumbers, setAvailableCallingNumbers] = useState([]);
  const [selectedCallingNumber, setSelectedCallingNumber] = useState('');

  // Advanced Audio & History States
  const audioRef = useRef(new Audio());
  const [callHistory, setCallHistory] = useState([]);
  const [playingUrl, setPlayingUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [isRefreshingHistory, setIsRefreshingHistory] = useState(false);

  const messagesEndRef = useRef(null);
  const historyScrollRef = useRef(null);
  const callHistoryRef = useRef(null);
  const skipNextVehiclePriceRef = useRef(false);

  const [vehicleSearchTerm, setVehicleSearchTerm] = useState('');
  const [vehicleResults, setVehicleResults] = useState([]);
  const [selectedVehicles, setSelectedVehicles] = useState([]);
  const [isRefineModalOpen, setIsRefineModalOpen] = useState(false);

  const [leadStatus, setLeadStatus] = useState('');
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);

  // DYNAMIC PRODUCT & QUOTE STATES
  const [availableProducts, setAvailableProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [vehiclePrice, setVehiclePrice] = useState(0);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [modalSearchTerm, setModalSearchTerm] = useState('');
  const [modalDraftProducts, setModalDraftProducts] = useState([]);

  // ── REAL INVENTORY VARIANTS ────────────────────────────────────────────
  // productVariantsMap: { [productId]: [ { inventoryId, sku, leatherColor, stitchColor, pattern, avail } ] }
  // This is populated from GET /products/:id/variants, which is backed by
  // the actual `inventory` table — so reps can only pick combos that are
  // really in stock, with real quantity limits.
  const [productVariantsMap, setProductVariantsMap] = useState({});
  const [loadingVariants, setLoadingVariants] = useState({});
  const [selectedAdPackage, setSelectedAdPackage] = useState(''); // '' | package id (string)
  const [adPackages, setAdPackages] = useState([]);
  const [adAddons, setAdAddons] = useState([]);
  const [loadingAdsData, setLoadingAdsData] = useState(true);

  // Listings/Memberships — fetched from admin panel (sale_products type=1/2),
  // same pattern as Ads packages. selectedListings/selectedMemberships now
  // store the real sale_products.id (as strings) instead of raw price text.
  const [listingPackages, setListingPackages] = useState([]);
  const [membershipPackages, setMembershipPackages] = useState([]);
  const [loadingListingsData, setLoadingListingsData] = useState(true);

  const activeAdPackage = adPackages.find(p => String(p.id) === String(selectedAdPackage)) || (adPackages.length === 1 ? adPackages[0] : null);
  const [selectedAdFeatures, setSelectedAdFeatures] = useState([]); // manually editable, seeded from package's linked add-ons  

  // ── AD AGREEMENT / LINK STATES ──────────────────────────────────────────
  // Fields for the customer-facing ad-package agreement (mirrors the
  // "Invoice Details" block shown on the shared link) plus link generation
  // and send-to-user state.
  const [agreementBillTo, setAgreementBillTo] = useState('');
  const [agreementPhone, setAgreementPhone] = useState('');
  const [agreementAltPhone, setAgreementAltPhone] = useState('');
  const [agreementDate, setAgreementDate] = useState('');
  const [agreementTerms, setAgreementTerms] = useState('6 months, then monthly');
  const [generatedAdLink, setGeneratedAdLink] = useState('');
  const [isGeneratingAdLink, setIsGeneratingAdLink] = useState(false);
  const [isSendingAdLink, setIsSendingAdLink] = useState(false);
  const [adLinkCopied, setAdLinkCopied] = useState(false);

  const [termsTemplateId, setTermsTemplateId] = useState('');
  const [termsData, setTermsData] = useState({
      terms: '',
      payment_terms: '',
      limited_liability: '',
      indemnification: '',
      governing_law: '',
      dispute_resolution: ''
  });

  // Editable overrides for the price shown on each Listing / Membership / Ads
  // line item in the quote summary. Keyed like 'listing:$79.99', 'ads:750'.
  const [priceOverrides, setPriceOverrides] = useState({});
  const updateExtraPrice = (key, value) => {
    setPriceOverrides(prev => ({ ...prev, [key]: value }));
  };

  const toggleAdFeature = (featureId) => {
    setSelectedAdFeatures(prev =>
      prev.includes(featureId) ? prev.filter(id => id !== featureId) : [...prev, featureId]
    );
  };
  // Guard so that when WE update existingLeadData ourselves (right after a
  // successful save), the big "initialize form from lead" useEffect below
  // doesn't stomp on what the user is currently looking at / editing.
  const skipNextResetRef = useRef(false);
  const skipNextAdDefaultRef = useRef(false);
  const skipNextShippingRef = useRef(false);

  // ── Fully editable quote totals — each defaults to the calculated value
  // but can be typed over directly; edits persist with the lead. ──────────
  const [taxAmount, setTaxAmount] = useState(0);
  const [shippingCost, setShippingCost] = useState(0);
  const [totalOverride, setTotalOverride] = useState(null); // null = auto-calculated
  const [seatCoversOverride, setSeatCoversOverride] = useState(null); // null = auto-summed from products

  const computedItemsSubtotal = selectedProducts.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const itemsSubtotal = seatCoversOverride !== null ? (parseFloat(seatCoversOverride) || 0) : computedItemsSubtotal;
  const totalProductQty = selectedProducts.reduce((sum, item) => sum + item.qty, 0);

  // ── Listings / Memberships / Ads as editable quote line items ──────────
  // selectedListings/selectedMemberships now hold real sale_products.id
  // values (as strings) instead of raw price text, so each line can carry
  // its actual package id through to the invoice/coupon logic.
  const listingLineItems = selectedListings.map(id => {
    const pkg = listingPackages.find(p => String(p.id) === String(id));
    const key = `listing:${id}`;
    const defaultAmount = pkg ? (parseFloat(pkg.price) > 0 ? pkg.price : pkg.org_price) : 0;
    return {
      key, type: 'listing', label: 'Listing', itemId: id,
      rawLabel: pkg ? (pkg.display_name || pkg.name) : `#${id}`,
      amount: priceOverrides[key] !== undefined ? priceOverrides[key] : defaultAmount,
    };
  });

  const membershipLineItems = selectedMemberships.map(id => {
    const pkg = membershipPackages.find(p => String(p.id) === String(id));
    const key = `membership:${id}`;
    const defaultAmount = pkg ? (parseFloat(pkg.price) > 0 ? pkg.price : pkg.org_price) : 0;
    return {
      key, type: 'membership', label: 'Membership', itemId: id,
      rawLabel: pkg ? (pkg.display_name || pkg.name) : `#${id}`,
      amount: priceOverrides[key] !== undefined ? priceOverrides[key] : defaultAmount,
    };
  });

  const adsLineItems = activeAdPackage ? [{
    key: `ads:${activeAdPackage.id}`,
    type: 'ads',
    label: 'Ads',
    itemId: activeAdPackage.id,
    rawLabel: activeAdPackage.display_name || activeAdPackage.name,
    amount: priceOverrides[`ads:${activeAdPackage.id}`] !== undefined
      ? priceOverrides[`ads:${activeAdPackage.id}`]
      : (parseFloat(activeAdPackage.price) > 0 ? activeAdPackage.price : activeAdPackage.org_price),
  }] : [];

  // Price of the selected ad package only (not the whole order total)
  const adPackagePrice = parseFloat(adsLineItems[0]?.amount || 0) || 0;

  const extraLineItems = [...listingLineItems, ...membershipLineItems, ...adsLineItems];
  const extrasTotal = extraLineItems.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);

  const removeExtraLineItem = (item) => {
    if (item.type === 'listing') setSelectedListings(prev => prev.filter(id => String(id) !== String(item.itemId)));
    if (item.type === 'membership') setSelectedMemberships(prev => prev.filter(id => String(id) !== String(item.itemId)));
    if (item.type === 'ads') setSelectedAdPackage('');
    setPriceOverrides(prev => {
      const next = { ...prev };
      delete next[item.key];
      return next;
    });
  };

  // Default shipping still auto-fills from the tiered table whenever qty
  // changes, but the rep can type over it — same pattern as Vehicle price.
  useEffect(() => {
    if (skipNextShippingRef.current) {
      skipNextShippingRef.current = false;
      return; // restoring saved data — don't clobber the saved manual shipping
    }
    let tieredShipping = 0.00;
    if (totalProductQty === 1) tieredShipping = 60.00;
    else if (totalProductQty === 2) tieredShipping = 80.00;
    else if (totalProductQty === 3) tieredShipping = 120.00;
    else if (totalProductQty === 4) tieredShipping = 150.00;
    else if (totalProductQty === 5) tieredShipping = 180.00;
    else if (totalProductQty === 6) tieredShipping = 190.00;
    else if (totalProductQty === 7) tieredShipping = 200.00;
    else if (totalProductQty >= 8) tieredShipping = 29.00 * totalProductQty;
    setShippingCost(tieredShipping);
  }, [totalProductQty]);

  const subtotal = (parseFloat(itemsSubtotal) || 0) + (parseFloat(extrasTotal) || 0);
  const computedTotal = (parseFloat(subtotal) || 0) + (parseFloat(taxAmount) || 0) + (parseFloat(shippingCost) || 0) + (parseFloat(vehiclePrice) || 0);
  const finalTotal = totalOverride !== null ? (parseFloat(totalOverride) || 0) : Math.max(0, computedTotal);

  // FETCH PRODUCTS AND CLEAN UP CLOUDINARY IMAGES
  const fetchProducts = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/products`);
      const data = await response.json();
      const items = data.data || data.products || data;

      if (items && Array.isArray(items)) {
        const formattedProducts = items.map(p => {
          let imgFilename = null;

          if (p.image && p.image !== '[]') {
            try {
              const parsed = JSON.parse(p.image);
              if (Array.isArray(parsed) && parsed.length > 0) {
                imgFilename = parsed[0];
              } else if (typeof parsed === 'string') {
                imgFilename = parsed;
              }
            } catch (e) {
              if (typeof p.image === 'string' && p.image.length > 4) {
                imgFilename = p.image;
              }
            }
          }

          if (imgFilename) {
            imgFilename = imgFilename.replace(/['"\[\]]+/g, '').trim();
          }

          let finalImgUrl = 'https://via.placeholder.com/60x80/e5e7eb/9ca3af?text=No+Img';
          if (imgFilename) {
            if (imgFilename.startsWith('http')) {
              finalImgUrl = imgFilename;
            } else {
              const SERVER_DOMAIN = "https://developer.globallimos.com/sales";
              const IMAGE_FOLDER = "/uploads/products/";
              finalImgUrl = `${SERVER_DOMAIN}${IMAGE_FOLDER}${imgFilename}`;
            }
          }

          return {
            id: p.id,
            name: p.display_name || p.name || 'Unknown Product',
            specs: `Pattern: ${p.stitching_pattern || 'Standard'} • Color: ${p.stitching_color || 'Standard'}`,
            price: parseFloat(p.dp || p.ndr || p.price || 185.00),
            avail: parseInt(p.qty || 0, 10),
            img: finalImgUrl
          };
        });

        setAvailableProducts(formattedProducts);
      }
    } catch (error) {
      console.error("Failed to fetch dynamic products:", error);
    }
  };

  const fetchAdsData = async () => {
    try {
      setLoadingAdsData(true);
      const response = await fetch(`${API_BASE_URL}/ads/ads-packages`);
      const data = await response.json();
      if (data.success) {
        setAdPackages(data.packages || []);
        setAdAddons(data.addons || []);
      }
    } catch (error) {
      console.error('Failed to fetch ads packages/add-ons:', error);
    } finally {
      setLoadingAdsData(false);
    }
  };

  const fetchListingsAndMemberships = async () => {
    try {
      setLoadingListingsData(true);
      const response = await fetch(`${API_BASE_URL}/users/listings-memberships`);
      const data = await response.json();
      if (data.success) {
        setListingPackages(data.listings || []);
        setMembershipPackages(data.memberships || []);
      }
    } catch (error) {
      console.error('Failed to fetch listings/memberships:', error);
    } finally {
      setLoadingListingsData(false);
    }
  };

  useEffect(() => {
    if (skipNextVehiclePriceRef.current) {
      skipNextVehiclePriceRef.current = false;
      return; // restoring saved data — don't clobber the saved manual price
    }
    const sum = selectedVehicles.reduce((total, car) => {
      // price comes from feature_value_txt as raw text — strip $ , and spaces before parsing
      const cleaned = (car.price ?? '').toString().replace(/[^0-9.]/g, '');
      const p = parseFloat(cleaned);
      return total + (isNaN(p) ? 0 : p);
    }, 0);
    setVehiclePrice(sum);
  }, [selectedVehicles]);

  useEffect(() => {
    window.scrollTo(0, 0);
    fetchProducts();
    fetchAdsData();
    fetchListingsAndMemberships();
  }, []);

  // ── FETCH REAL VARIANTS FOR A PRODUCT (from the `inventory` table) ────────
  // Cached per product so re-opening the modal doesn't re-fetch every time.
  const fetchProductVariants = async (productId) => {
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

  // ── OPEN MODAL — seed qty-per-variant from existing selections, then
  // fetch real stock variants for every product shown ────────────────────
  const openProductModal = () => {
    const draft = availableProducts.map(prod => {
      const existingLines = selectedProducts.filter(sp => sp.id === prod.id && !sp.isCustom);
      const selectedQtyByVariant = {};
      existingLines.forEach(l => {
        if (l.inventoryId != null) selectedQtyByVariant[l.inventoryId] = l.qty;
      });

      return {
        ...prod,
        selected: existingLines.length > 0,
        selectedQtyByVariant,
      };
    });
    setModalDraftProducts(draft);
    setModalSearchTerm('');

    // Seed Custom tab from any custom lines already on the quote
    setCustomDraftLines(selectedProducts.filter(sp => sp.isCustom));
    setCustomProductId('');
    setCustomLeather('black');
    setCustomStitch('black');
    setCustomPattern('Diamond');
    setCustomQty(1);
    setCustomProductSearch('');
    setModalTab('inventory');

    setIsProductModalOpen(true);
    availableProducts.forEach(prod => fetchProductVariants(prod.id));
  };

  // ── CHECKBOX: toggle product selected state ───────────────────────────────
  const handleModalCheckChange = (id, checked) => {
    setModalDraftProducts(prev => prev.map(p => {
      if (p.id !== id) return p;
      if (checked) {
        return { ...p, selected: true };
      }
      // Unchecking clears any quantities the rep had set for this product.
      return { ...p, selected: false, selectedQtyByVariant: {} };
    }));
  };

  // ── QTY change for a specific real inventory variant, capped at avail ──
  const updateModalVariantQty = (productId, inventoryId, delta, maxAvail) => {
    setModalDraftProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      const current = p.selectedQtyByVariant?.[inventoryId] || 0;
      const next = Math.max(0, Math.min(maxAvail, current + delta));
      const updatedMap = { ...p.selectedQtyByVariant, [inventoryId]: next };
      const anySelected = Object.values(updatedMap).some(q => q > 0);
      return { ...p, selectedQtyByVariant: updatedMap, selected: anySelected };
    }));
  };

  const addCustomLine = () => {
    if (!customProductId) return;
    const prod = availableProducts.find(p => p.id.toString() === customProductId.toString());
    if (!prod) return;

    const lineKey = `custom__${prod.id}__${customLeather}__${customStitch}__${customPattern}`;

    setCustomDraftLines(prev => {
      const existing = prev.find(l => l.lineKey === lineKey);
      if (existing) {
        return prev.map(l => l.lineKey === lineKey ? { ...l, qty: l.qty + customQty } : l);
      }
      return [...prev, {
        id: prod.id,
        inventoryId: null,
        lineKey,
        isCustom: true,
        name: prod.name,
        specs: prod.specs,
        price: prod.price,
        qty: customQty,
        img: prod.img,
        leatherColor: customLeather,
        stitchColor: customStitch,
        pattern: customPattern,
        sku: 'CUSTOM',
      }];
    });
    setCustomQty(1);
  };

  const removeCustomLine = (lineKey) => {
    setCustomDraftLines(prev => prev.filter(l => l.lineKey !== lineKey));
  };

  const updateCustomDraftQty = (lineKey, delta) => {
    setCustomDraftLines(prev => prev.map(l =>
      l.lineKey === lineKey ? { ...l, qty: Math.max(1, l.qty + delta) } : l
    ));
  };
  const saveProductSelections = () => {
    const newlySelected = [];
    modalDraftProducts.forEach(prod => {
      if (!prod.selected) return;
      const variants = productVariantsMap[prod.id] || [];
      variants.forEach(v => {
        const qty = prod.selectedQtyByVariant?.[v.inventoryId] || 0;
        if (qty <= 0) return;
        newlySelected.push({
          id: prod.id,
          inventoryId: v.inventoryId,
          lineKey: `${prod.id}__${v.inventoryId}`,
          isCustom: false,
          name: prod.name,
          specs: prod.specs,
          price: prod.price,
          qty,
          img: prod.img,
          leatherColor: v.leatherColor,
          stitchColor: v.stitchColor,
          pattern: v.pattern,
          sku: v.sku,
        });
      });
    });
    setSelectedProducts([...newlySelected, ...customDraftLines]);
    setIsProductModalOpen(false);
  };

  // ── REMOVE a line item by lineKey ─────────────────────────────────────────
  const removeProduct = (lineKey) => {
    setSelectedProducts(prev => prev.filter(p => p.lineKey !== lineKey));
  };

  // ── QTY change on main quote panel ───────────────────────────────────────
  const updateMainProductQty = (lineKey, delta) => {
    setSelectedProducts(prev => prev.map(p => {
      if (p.lineKey !== lineKey) return p;
      return { ...p, qty: Math.max(1, p.qty + delta) };
    }));
  };

  // ── PRICE change on main quote panel (seat cover / product price) ───────
  const updateMainProductPrice = (lineKey, newPrice) => {
    setSelectedProducts(prev => prev.map(p => {
      if (p.lineKey !== lineKey) return p;
      return { ...p, price: newPrice === '' ? 0 : parseFloat(newPrice) || 0 };
    }));
  };

  const LEAD_STATUSES = [
    { id: 'Intake', icon: '🔵' },
    { id: 'Qualified', icon: '✅' },
    { id: 'Converted', icon: '⭐' },
    { id: 'Lost', icon: '❌' },
    { id: 'Not Qualified', icon: '➖' }
  ];

  const dialKeys = [
    { num: '1', letters: '' }, { num: '2', letters: 'ABC' }, { num: '3', letters: 'DEF' },
    { num: '4', letters: 'GHI' }, { num: '5', letters: 'JKL' }, { num: '6', letters: 'MNO' },
    { num: '7', letters: 'PQRS' }, { num: '8', letters: 'TUV' }, { num: '9', letters: 'WXYZ' },
    { num: '*', letters: '' }, { num: '0', letters: '+' }, { num: '#', letters: '' }
  ];

  const handleToggle = (item, stateList, setStateFunc) => {
    if (stateList.includes(item)) {
      setStateFunc(stateList.filter(i => i !== item));
    } else {
      setStateFunc([...stateList, item]);
    }
  };

  const fetchSystemUsers = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/users/system-users`);
      const data = await response.json();
      if (data.success && data.users) {
        setSystemUsers(data.users);
      }
    } catch (error) {
      console.error("Failed to fetch system users", error);
    }
  };

  const fetchAssignedVehicles = async (leadId) => {
    try {
      const encodedLeadId = encodeURIComponent(leadId);
      const response = await fetch(`${API_BASE_URL}/leads/${encodedLeadId}/vehicles`);
      const data = await response.json();
      if (data.success) {
        setSelectedVehicles(data.data);
      }
    } catch (error) {
      console.error("Failed to load assigned vehicles", error);
    }
  };

  const fetchInvoiceStatus = async (preferenceId) => {
    try {
      const encodedId = encodeURIComponent(preferenceId);
      const response = await fetch(`${API_BASE_URL}/invoices/check/${encodedId}`);
      const data = await response.json();
      if (data.exists) {
        setInvoicedNumber(data.invoiceNumber);
        setInvoicedId(data.invoiceId);
      } else {
        setInvoicedNumber(null);
        setInvoicedId(null);
      }
    } catch (error) {
      console.error("Failed to check invoice status", error);
    }
  };

  const fetchCustomNumbers = async (leadId) => {
    try {
      const encodedLeadId = encodeURIComponent(leadId);
      const response = await fetch(`${API_BASE_URL}/leads/${encodedLeadId}/custom-numbers`);
      const data = await response.json();

      let allNumbers = [leadId];
      if (data.success) {
        allNumbers = Array.from(new Set([leadId, ...data.numbers]));
      }

      setAvailableCallingNumbers(allNumbers);
      fetchCallHistory(allNumbers);
    } catch (error) {
      setAvailableCallingNumbers([leadId]);
      fetchCallHistory([leadId]);
    }
  };

  const fetchCallHistory = async (numbersArray) => {
    if (!numbersArray || numbersArray.length === 0) return;
    setIsRefreshingHistory(true);
    try {
      const response = await fetch(`${API_BASE_URL}/twilio/lead-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numbers: numbersArray })
      });
      const data = await response.json();
      if (data.success) {
        setCallHistory(data.history);
      }
    } catch (error) {
      console.error("Failed to fetch custom call history:", error);
    } finally {
      setIsRefreshingHistory(false);
    }
  };

  useEffect(() => {
    if (!lead) return;
    const socket = io(`${API_BASE_URL}`);
    socket.on('new_incoming_message', (incomingMsg) => {
      const leadPhoneShort = lead.id ? lead.id.slice(-10) : '';
      const incomingPhoneShort = incomingMsg.customerPhone ? incomingMsg.customerPhone.slice(-10) : '';
      if (leadPhoneShort && incomingPhoneShort === leadPhoneShort) {
        setLocalHistory((prevHistory) => [...prevHistory, incomingMsg]);
      }
    });
    return () => { socket.disconnect(); };
  }, [lead]);

  useEffect(() => {
    let intervalId;
    if (callTab === 'History' && availableCallingNumbers.length > 0) {
      intervalId = setInterval(() => {
        fetchCallHistory(availableCallingNumbers);
      }, 10000);
    }
    return () => { if (intervalId) clearInterval(intervalId); };
  }, [callTab, availableCallingNumbers]);

  useEffect(() => {
    if (callTab === 'History' && callHistoryRef.current) {
      requestAnimationFrame(() => {
        if (callHistoryRef.current) callHistoryRef.current.scrollTop = callHistoryRef.current.scrollHeight;
      });
    }
  }, [callTab, callHistory]);

  useEffect(() => {
    const audio = audioRef.current;
    const handleTimeUpdate = () => {
      if (audio.duration) {
        setPlaybackProgress((audio.currentTime / audio.duration) * 100);
      }
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setPlaybackProgress(0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
    };
  }, []);

  const scrollToBottom = (scrollBehavior = 'smooth') => {
    if (historyScrollRef.current) {
      historyScrollRef.current.scrollTop = historyScrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    if (serviceSubTab === 'History' && !collapsedPanels.service) {
      requestAnimationFrame(() => { scrollToBottom('auto'); });
    }
  }, [serviceSubTab, collapsedPanels.service]);


  useEffect(() => {
    if (skipNextAdDefaultRef.current) {
      skipNextAdDefaultRef.current = false;
      return;
    }
    if (selectedAdPackage) {
      const pkg = adPackages.find(p => String(p.id) === String(selectedAdPackage));
      if (pkg) {
        const defaults = (pkg.addon_ids || []).map(id => String(id));
        setSelectedAdFeatures(defaults);
      }
    } else {
      setSelectedAdFeatures([]);
    }
  }, [selectedAdPackage, adPackages]);

  useEffect(() => { scrollToBottom('smooth'); }, [localHistory]);

  // ── Seed the ad-agreement fields from contact info whenever they're empty,
  // so the rep doesn't have to retype what's already on the lead. ─────────
  useEffect(() => {
    if (!agreementBillTo && (businessName || firstName || lastName)) {
      setAgreementBillTo(businessName || `${firstName} ${lastName}`.trim());
    }
    if (!agreementPhone && (selectedPhone || lead?.id)) {
      setAgreementPhone(selectedPhone || lead?.id || '');
    }
    if (!agreementDate) {
      setAgreementDate(new Date().toISOString().slice(0, 10));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessName, firstName, lastName, selectedPhone, lead?.id]);

  const togglePlay = (url) => {
    if (!url) return;
    const audio = audioRef.current;
    if (playingUrl === url) {
      if (isPlaying) { audio.pause(); setIsPlaying(false); }
      else { audio.play(); setIsPlaying(true); }
    } else {
      audio.pause();
      audio.src = url;
      audio.load();
      audio.play();
      setPlayingUrl(url);
      setIsPlaying(true);
      setPlaybackProgress(0);
    }
  };

  const getCallStyle = (type, status) => {
    const lType = (type || '').toLowerCase();
    const lStatus = (status || '').toLowerCase();
    if (lType.includes('missed') || lStatus.includes('missed') || lStatus.includes('no-answer') || lStatus.includes('failed') || lStatus.includes('busy')) {
      return { icon: '❌', color: '#dc2626' };
    }
    if (lType.includes('incoming') || lType.includes('inbound')) {
      return { icon: '↙️', color: '#2563eb' };
    }
    return { icon: '↗️', color: '#16a34a' };
  };

  useEffect(() => {
    // If this state change was triggered by our own post-save sync, skip the
    // full re-initialization so we don't disrupt whatever the user is doing.
    if (skipNextResetRef.current) {
      skipNextResetRef.current = false;
      return;
    }

    if (lead) {
      setLocalHistory(lead.fullHistory || []);

      const isReg = lead.user?.name !== "Un-registered";
      setContactMode(isReg ? 'existing' : 'new');

      const nameParts = lead.user?.name?.split(' ') || [];
      const parsedFirst = !isReg ? '' : (nameParts[0] || '');
      const parsedLast = !isReg ? '' : (nameParts.slice(1).join(' ') || '');

      setFirstName(parsedFirst);
      setLastName(parsedLast);
      setEmail(lead.user?.email === "No email provided" ? "" : (lead.user?.email || ''));
      setBusinessName(lead.user?.company || '');
      if (isReg && lead.user?.id) {
        setSelectedUserId(lead.user.id);
      } else if (lead.userId) {
        setSelectedUserId(lead.userId);
      }
      setInputText('');
      setActiveTab('messages');
      setServiceSubTab('Text');

      if (existingLeadData) {
        setSelectedLeadTypes(existingLeadData.leadTypes || []);
        setSelectedListings(existingLeadData.listings || []);
        setSelectedMemberships(existingLeadData.memberships || []);
        skipNextAdDefaultRef.current = true; // prevent the auto-fill effect from clobbering saved features
        setSelectedAdPackage(existingLeadData.adPackage || '');
        setSelectedAdFeatures(existingLeadData.adFeatures || []);
        setServiceType(existingLeadData.serviceType || 'SMS');
        setLeadStatus(existingLeadData.status || 'Intake');
        skipNextVehiclePriceRef.current = true;
        setVehiclePrice(existingLeadData.vehiclePrice || 0);
        setPriceOverrides(existingLeadData.priceOverrides || {});
        setTaxAmount(existingLeadData.taxAmount || 0);
        // Only lock in a saved shipping value; otherwise let the tiered
        // auto-calc effect fill it in once selectedProducts/qty are restored.
        if (existingLeadData.shippingCost !== undefined && existingLeadData.shippingCost !== null) {
          skipNextShippingRef.current = true;
          setShippingCost(existingLeadData.shippingCost);
        }
        setTotalOverride(existingLeadData.totalOverride ?? null);
        setSeatCoversOverride(existingLeadData.seatCoversOverride ?? null);

        // Restore any previously-saved ad agreement details / link.
        if (existingLeadData.adAgreement) {
          setAgreementBillTo(existingLeadData.adAgreement.billTo || '');
          setAgreementPhone(existingLeadData.adAgreement.phone || '');
          setAgreementAltPhone(existingLeadData.adAgreement.additionalPhone || '');
          setAgreementDate(existingLeadData.adAgreement.agreementDate || '');
          setAgreementTerms(existingLeadData.adAgreement.terms || '6 months, then monthly');
          setGeneratedAdLink(existingLeadData.adAgreement.link || '');
        }

        const savedProductsRaw = existingLeadData.selected_products || existingLeadData.selectedProducts;

        if (savedProductsRaw) {
          try {
            const parsedSavedProducts = typeof savedProductsRaw === 'string'
              ? JSON.parse(savedProductsRaw)
              : savedProductsRaw;
            // Ensure each saved product has a lineKey for compatibility.
            // Prefer the real inventoryId (new format); fall back to index
            // for any older rows saved before inventory-linking existed.
            const withLineKeys = parsedSavedProducts.map((p, i) => ({
              ...p,
              lineKey: p.lineKey || (p.inventoryId != null ? `${p.id}__${p.inventoryId}` : `${p.id}__${i}`),
            }));
            setSelectedProducts(withLineKeys);
          } catch (e) {
            console.error("Failed to parse saved products", e);
            setSelectedProducts([]);
          }
        } else {
          setSelectedProducts([]);
        }

        if (existingLeadData.id) {
          fetchAssignedVehicles(existingLeadData.id);
        }

        // If this preference row is already linked to a user, reflect that
        // in selectedUserId so the "Existing User" contact stays selected.
        if (existingLeadData.userId) {
          setSelectedUserId(existingLeadData.userId);
        }
      } else {
        setSelectedLeadTypes([]);
        setSelectedListings([]);
        setSelectedMemberships([]);
        skipNextAdDefaultRef.current = true;
        setSelectedAdPackage('');
        setSelectedAdFeatures([]);
        setServiceType('SMS');
        setLeadStatus('Intake');
        setSelectedVehicles([]);
        setSelectedProducts([]);
        setVehiclePrice(0);
        setPriceOverrides({});
        setTaxAmount(0);
        setShippingCost(0);
        setTotalOverride(null);
        setSeatCoversOverride(null);
        setGeneratedAdLink('');
        setAgreementAltPhone('');
        setAgreementTerms('6 months, then monthly');

        if (lead?.isCheckAvailability) {
          setSelectedLeadTypes(['Check Availability']);
        }
      }

      let targetPreferenceId = null;
      if (existingLeadData && existingLeadData.id) {
        targetPreferenceId = existingLeadData.id;
      } else if (lead && (!lead.pastInquiries || lead.pastInquiries.length === 0)) {
        targetPreferenceId = lead.id;
      }

      if (targetPreferenceId) {
        fetchInvoiceStatus(encodeURIComponent(targetPreferenceId));
      } else {
        setInvoicedNumber(null);
        setInvoicedId(null);
      }

      setCallTab('Call');
      setCustomPhone('');
      setDialPadNumber('');
      setUserSearchTerm('');
      setContactSearchTerm('');
      setShowContactDropdown(false);

      if (lead.id) {
        setSelectedCallingNumber(lead.id);
        fetchCustomNumbers(lead.id);
      }

      audioRef.current.pause();
      setIsPlaying(false);
      setPlayingUrl(null);
      setPlaybackProgress(0);

      fetchSystemUsers();
    }
  }, [lead, existingLeadData]);

  // ✅ FOOLPROOF AUTO-MATCHER: If we know they exist but the ID got lost, find it in the DB!
  useEffect(() => {
    // Only run if we have users loaded, no ID is selected yet, and we are in existing mode
    if (systemUsers.length > 0 && !selectedUserId && contactMode === 'existing') {

      const shortPhone = lead?.id ? lead.id.replace(/\D/g, '').slice(-10) : '';

      // Search the system users array for a matching email or phone
      const matchedUser = systemUsers.find(u =>
        (u.email && email && u.email.toLowerCase() === email.toLowerCase()) ||
        (u.phone && shortPhone && u.phone.replace(/\D/g, '').includes(shortPhone))
      );

      if (matchedUser) {
        setSelectedUserId(matchedUser.id);
        console.log("Successfully auto-matched existing user ID:", matchedUser.id);
      }
    }
  }, [systemUsers, email, lead?.id, selectedUserId, contactMode]);

  // ✅ PHONE SYNC HOOK: Whenever a user is selected or auto-matched, lock in their real database phone number
  useEffect(() => {
    if (selectedUserId && systemUsers.length > 0) {
      const foundUser = systemUsers.find(u => u.id === selectedUserId);
      if (foundUser && foundUser.phone) {
        setSelectedPhone(foundUser.phone);
        console.log("Locked in current database phone number for user:", foundUser.phone);
      }
    }
  }, [selectedUserId, systemUsers]);

  // ✅ AUTO-POPULATE SELLER & THEIR LISTINGS: For "Renew Listing for the Seller"
  // / "$15-featured for Buyer" leads, when an existing user is identified:
  //   (a) auto-load the vehicles that seller already has listed into the Vehicle
  //       panel (once per user, so manual removals are respected), and
  //   (b) whenever a selected vehicle carries a seller, fill the contact info
  //       with that seller. Only fills empty fields so rep-entered data is
  //       never clobbered.
  const autoLoadedListingsForRef = useRef(null);
  useEffect(() => {
    const renewalLead = selectedLeadTypes.some(t =>
      ['Renew Listing for the Seller', '$15-featured for Buyer'].includes(t)
    );
    if (!renewalLead) return;

    // (a) Auto-load the identified seller's existing listed vehicles.
    if (selectedUserId && autoLoadedListingsForRef.current !== selectedUserId) {
      autoLoadedListingsForRef.current = selectedUserId;
      (async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/users/${selectedUserId}/listings`);
          const data = await response.json();
          if (data.success && Array.isArray(data.data) && data.data.length > 0) {
            setSelectedVehicles(prev => {
              const existingIds = new Set(prev.map(v => String(v.id)));
              const fresh = data.data.filter(v => !existingIds.has(String(v.id)));
              return fresh.length ? [...prev, ...fresh] : prev;
            });
          }
        } catch (error) {
          console.error("Failed to auto-load seller listings", error);
        }
      })();
    }

    // (b) Fill contact info from the first selected vehicle that has a seller.
    const seller = selectedVehicles.find(v => v.seller && v.seller.id)?.seller;
    if (!seller) return;
    if (seller.firstname && !firstName) setFirstName(seller.firstname);
    if (seller.lastname && !lastName) setLastName(seller.lastname);
    if (seller.company && !businessName) setBusinessName(seller.company);
    if (seller.email && !email) setEmail(seller.email);
    if (seller.phone) setSelectedPhone(prev => prev || seller.phone);
  }, [selectedLeadTypes, selectedUserId, selectedVehicles, firstName, lastName, businessName, email]);

  if (!lead) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading lead data...</div>;

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;
    const messageToSend = inputText;
    setInputText('');

    const optimisticMsg = {
      id: Date.now(),
      direction: 'outgoing',
      text: messageToSend,
      time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    };
    setLocalHistory((prev) => [...prev, optimisticMsg]);

    try {
      setIsSending(true);
      const response = await fetch(`${API_BASE_URL}/twilio/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: lead.id, message: messageToSend })
      });
      if (!response.ok) throw new Error("Failed to send");
    } catch (error) {
      console.error("Send error:", error);
      alert("Failed to send message. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!firstName || !lastName || !email) {
      alert("⚠️ Please fill in First Name, Last Name, and Email to create an account.");
      return;
    }
    try {
      setIsCreating(true);
      const payload = {
        phone: lead.id,
        firstName, lastName, businessName, email,
        selectedVehicles, selectedProducts, agentId: 1
      };

      const response = await fetch(`${API_BASE_URL}/users/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to create account");
      alert("✅ Account created successfully!");
      navigate(-1);
    } catch (error) {
      console.error("Error creating account:", error);
      alert(`❌ ${error.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  // ── UPDATE LEAD PREFERENCES ─────────────────────────────────────────────
  const handleUpdateLead = async () => {
    if (!selectedUserId) {
      alert("⚠️ Cannot save preferences: No user linked! Please select an existing user from the dropdown, or click '+ Add User' to create an account for them first.");
      return;
    }

    try {
      setIsUpdating(true);
      const payload = {
        phone: lead.id,
        userId: selectedUserId,
        firstName,
        lastName,
        businessName,
        email,
        preferenceId: existingLeadData ? existingLeadData.id : null,
        leadTypes: selectedLeadTypes,
        leadStatus,
        listings: selectedListings,
        memberships: selectedMemberships,
        adPackage: selectedAdPackage,
        adFeatures: selectedAdFeatures,
        serviceType,
        selectedVehicles,
        selectedProducts,
        vehiclePrice,
        priceOverrides,
        taxAmount,
        shippingCost,
        totalOverride,
        seatCoversOverride,
        leadSource: lead?.isCheckAvailability ? 'check_availability' : null
      };

      const response = await fetch(`${API_BASE_URL}/users/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to update preferences");

      alert("✅ Lead preferences updated successfully!");

      // 1. Build the updated lead object
      const updatedLead = lead ? {
        ...lead,
        user: {
          ...lead.user,
          id: selectedUserId,
          name: `${firstName} ${lastName}`.trim(),
          email: email,
          company: businessName
        }
      } : null;

      // 2. Build the updated preferences object
      const updatedPref = {
        ...(existingLeadData || {}),
        id: data.preferenceId || data.id || existingLeadData?.id,
        userId: selectedUserId,
        leadTypes: selectedLeadTypes,
        status: leadStatus,
        listings: selectedListings,
        memberships: selectedMemberships,
        adPackage: selectedAdPackage,
        adFeatures: selectedAdFeatures,
        serviceType,
        selected_products: selectedProducts, // Pushes your new variant selections into state
        vehiclePrice,
        priceOverrides,
        taxAmount,
        shippingCost,
        totalOverride,
        seatCoversOverride,
        lead_source: lead?.isCheckAvailability ? 'check_availability' : null
      };

      // 3. Update the local screen state instantly
      setLead(updatedLead);
      skipNextResetRef.current = true;
      setExistingLeadData(updatedPref);

      if (data.userId) {
        setSelectedUserId(data.userId);
      }

      // 🚀 CRITICAL FIX: Overwrite the browser's hidden history cache!
      // If the user hits Refresh (F5) now, it will load this fresh data instead of the old data.
      navigate(location.pathname, {
        replace: true,
        state: {
          ...location.state,
          lead: updatedLead,
          existingLeadData: updatedPref
        }
      });

    } catch (error) {
      console.error("Error updating lead:", error);
      alert("❌ Failed to update lead preferences.");
    } finally {
      setIsUpdating(false);
    }
  };

  // ── GENERATE / VIEW INVOICE ─────────────────────────────────────────────
  // Shared by the "Generate Invoice" button inside the quote panel AND the
  // fixed bottom bar. If an invoice already exists for this lead it opens the
  // existing one for viewing/editing, otherwise it creates a fresh one.
  const handleOpenInvoice = () => {
    const invoiceState = {
      lead,
      existingLeadData,
      selectedListings,
      selectedMemberships,
      selectedAdPackage,
      selectedAdFeatures,
      leadStatus,
      selectedProducts,
      prefilledCustomer: { name: `${firstName} ${lastName}`.trim(), email, company: businessName, phone: selectedPhone || lead?.id, userId: selectedUserId },
      taxAmount,
      shippingCost,
      totalOverride,
      seatCoversOverride
    };
    if (invoicedNumber) {
      navigate('/sales/crm/create-invoice', {
        state: { ...invoiceState, invoiceIdFromCRM: invoicedId, existingInvoiceNumber: invoicedNumber }
      });
    } else {
      navigate('/sales/crm/create-invoice', { state: invoiceState });
    }
  };

  // ── GENERATE AD-PACKAGE AGREEMENT LINK ──────────────────────────────────
  // Sends the agreement details (bill-to, phone numbers, agreement date,
  // terms) plus the selected package/features to the backend, which returns
  // a shareable link the customer can open to review & confirm.
  // ── GENERATE AD-PACKAGE AGREEMENT LINK ──────────────────────────────────
  const handleGenerateAdLink = async () => {
    if (!activeAdPackage) {
      alert("⚠️ Please select an ad package above before generating a link.");
      return null;
    }
    try {
      setIsGeneratingAdLink(true);
      setAdLinkCopied(false);
      
      const payload = {
        leadPhone: lead.id,
        userId: selectedUserId,
        preferenceId: existingLeadData ? existingLeadData.id : null,
        billTo: agreementBillTo,
        phone: agreementPhone,
        additionalPhone: agreementAltPhone,
        agreementDate,
        terms: agreementTerms,
        adPackageId: activeAdPackage.id,
        adFeatures: selectedAdFeatures,
        
        // --- NEW DATA TO SATISFY BACKEND ---
        subtotal: adPackagePrice,
        discount: 0, // AssignLeadPage doesn't utilize discounts
        totalPrice: adPackagePrice, // Only the selected ad package price, not the full order
        termsTemplateId: termsTemplateId,
        termsJson: JSON.stringify(termsData)
      };

      const response = await fetch(`${API_BASE_URL}/ads/generate-agreement-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Failed to generate link");

      setGeneratedAdLink(data.link);
      return data.link;
    } catch (error) {
      console.error("Error generating ad agreement link:", error);
      alert(`❌ ${error.message}`);
      return null;
    } finally {
      setIsGeneratingAdLink(false);
    }
  };

  const handleCopyAdLink = async () => {
    if (!generatedAdLink) return;
    try {
      await navigator.clipboard.writeText(generatedAdLink);
      setAdLinkCopied(true);
      setTimeout(() => setAdLinkCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy link:", error);
    }
  };

  // ── SEND THE AGREEMENT LINK TO THE CUSTOMER VIA SMS ─────────────────────
  // Generates a link first if one doesn't exist yet, then fires it off
  // through the same /twilio/send endpoint used by the Text panel.
  const handleSendAdLinkToUser = async () => {
    try {
      setIsSendingAdLink(true);
      let link = generatedAdLink;
      if (!link) {
        link = await handleGenerateAdLink();
        if (!link) return;
      }

      const greetingName = firstName ? ` ${firstName}` : '';
      const message = `Hi${greetingName}, please review and confirm your ad package here: ${link}`;

      const response = await fetch(`${API_BASE_URL}/twilio/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: lead.id, message })
      });
      if (!response.ok) throw new Error("Failed to send link");

      alert("✅ Link sent to the customer via text!");
    } catch (error) {
      console.error("Error sending ad agreement link:", error);
      alert("❌ Failed to send the link to the customer.");
    } finally {
      setIsSendingAdLink(false);
    }
  };

  const handleCallNow = async (numberToCall) => {
    try {
      setIsCalling(true);
      let finalNumberToCall = numberToCall || selectedCallingNumber;

      if (finalNumberToCall && !availableCallingNumbers.includes(finalNumberToCall)) {
        const updatedNumbers = [...availableCallingNumbers, finalNumberToCall];
        setAvailableCallingNumbers(updatedNumbers);
        try {
          const encodedLeadId = encodeURIComponent(lead.id);
          await fetch(`${API_BASE_URL}/leads/${encodedLeadId}/custom-numbers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber: finalNumberToCall })
          });
        } catch (error) { console.error("Failed to save custom number to DB", error); }
      }
      if (finalNumberToCall) setSelectedCallingNumber(finalNumberToCall);

      const response = await fetch(`${API_BASE_URL}/twilio/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadPhone: finalNumberToCall })
      });
      if (!response.ok) throw new Error("Call failed");

      alert(`📞 Ringing your phone now! Please pick up to connect to ${finalNumberToCall}.`);
      setCustomPhone('');
      setDialPadNumber('');
      setUserSearchTerm('');
      setTimeout(() => fetchCallHistory(availableCallingNumbers), 5000);
    } catch (error) {
      console.error("Call error:", error);
      alert("❌ Failed to initiate the call. Check console for details.");
    } finally {
      setTimeout(() => setIsCalling(false), 3000);
    }
  };

  const getDotColor = (svc) => {
    switch (svc) {
      case 'SMS': return '#10b981';
      case 'W-App': return '#10b981';
      case 'RC': return '#f59e0b';
      case 'Apple': return '#3b82f6';
      default: return '#cbd5e1';
    }
  };

  const getUserInitials = (name) => {
    if (!name) return 'U';
    const parts = name.split(' ');
    return parts.length > 1 ? parts[0][0] + (parts[1] ? parts[1][0] : '') : parts[0][0];
  };

  const getUserColor = (index) => {
    const colors = [
      { bg: '#22c55e', color: '#ffffff' },
      { bg: '#3b82f6', color: '#ffffff' },
      { bg: '#a855f7', color: '#ffffff' },
      { bg: '#f97316', color: '#ffffff' }
    ];
    return colors[index % colors.length];
  };

  const filteredUsers = systemUsers.filter(u =>
    u.name?.toLowerCase().includes(userSearchTerm?.toLowerCase() || '') ||
    u.phone?.includes(userSearchTerm || '')
  );

  const filteredContacts = systemUsers.filter(u =>
    u.name?.toLowerCase().includes(contactSearchTerm?.toLowerCase() || '') ||
    u.email?.toLowerCase().includes(contactSearchTerm?.toLowerCase() || '')
  );



  const displayedModalProducts = modalDraftProducts.filter(p =>
    p.name.toLowerCase().includes(modalSearchTerm.toLowerCase()) ||
    p.specs.toLowerCase().includes(modalSearchTerm.toLowerCase())
  );

  const modalSelectedCount = modalDraftProducts.reduce((count, p) => {
    const variants = productVariantsMap[p.id] || [];
    return count + variants.filter(v => (p.selectedQtyByVariant?.[v.inventoryId] || 0) > 0).length;
  }, 0) + customDraftLines.length;

  const modalTotalPrice = modalDraftProducts.reduce((sum, p) => {
    const variants = productVariantsMap[p.id] || [];
    return sum + variants.reduce((s, v) => s + (p.price * (p.selectedQtyByVariant?.[v.inventoryId] || 0)), 0);
  }, 0) + customDraftLines.reduce((sum, l) => sum + (l.price * l.qty), 0);

  return (

    <>
      <CrmQuickNav />
      <div style={{ backgroundColor: '#f3f4f6', minHeight: '100vh', padding: '40px 20px', display: 'flex', justifyContent: 'center' }}>
        <style>{`
        .crm-page-container { background: #ffffff; border-radius: 12px; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05); width: 100%; max-width: 1200px; display: flex; flex-direction: column; overflow: hidden; }
        .crm-page-header { padding: 20px 24px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; background: #ffffff; }
        .crm-page-header h2 { margin: 0; font-size: 20px; color: #111827; }
        .btn-back { background: #2563eb; border: none; color: #ffffff; padding: 8px 16px; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: background 0.2s; }
        .btn-back:hover { background: #1d4ed8; }
        .panel-header { cursor: pointer; user-select: none; display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #f3f4f6; }
        .panel-header:hover { background-color: #f9fafb; }
        .collapse-icon { display: inline-block; transition: transform 0.3s ease; font-weight: bold; color: #6b7280; }
        .call-nav-tabs { display: flex; align-items: center; border-bottom: 1px solid #e5e7eb; padding: 0 16px; margin-bottom: 20px; }
        .call-nav-tab { padding: 12px 16px; font-size: 14px; font-weight: 600; color: #6b7280; cursor: pointer; border-bottom: 2px solid transparent; background: none; border-top: none; border-left: none; border-right: none; }
        .call-nav-tab:hover { color: #111827; }
        .call-nav-tab.active { color: #2563eb; border-bottom: 2px solid #2563eb; }
        .modern-input-box { width: 100%; padding: 12px; background-color: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 14px; outline: none; transition: border 0.2s; }
        .modern-input-box:focus { border-color: #3b82f6; background-color: #fff; }
        .btn-call-green { width: 100%; background-color: #059669; color: white; padding: 12px; border: none; border-radius: 6px; font-size: 14px; font-weight: bold; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 8px; transition: background 0.2s; }
        .btn-call-green:hover { background-color: #047857; }
        .btn-call-green:disabled { background-color: #6ee7b7; cursor: not-allowed; }
        .history-row { display: flex; align-items: center; padding: 12px 0; border-bottom: 1px solid #f3f4f6; }
        .history-icon-circle { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; border: 1px solid currentColor; margin-right: 12px; flex-shrink: 0; }
        .status-badge { font-size: 10px; font-weight: bold; color: #059669; border: 1px solid #059669; padding: 2px 6px; border-radius: 4px; margin-left: 8px; }
        .history-play-wrapper { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-left: auto; transition: transform 0.1s; background-color: #e5e7eb; }
        .history-play-wrapper:active { transform: scale(0.95); }
        .history-play-inner { width: 28px; height: 28px; background: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #3b82f6; font-size: 10px; border: 1px solid #e5e7eb; }
        .dial-pad-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; }
        .dial-key { width: 60px; height: 60px; border-radius: 50%; background: #ffffff; border: 1px solid #e5e7eb; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .dial-key:hover { background: #f3f4f6; border-color: #d1d5db; }
        .dial-key .num { font-size: 20px; font-weight: 500; color: #111827; line-height: 1; }
        .dial-key .letters { font-size: 10px; color: #6b7280; font-weight: 600; margin-top: 2px; }
        .user-dropdown-menu { position: absolute; top: 100%; left: 0; width: 100%; background: white; border: 1px solid #e5e7eb; border-radius: 6px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); z-index: 50; max-height: 250px; overflow-y: auto; margin-top: 4px; }
        .user-dropdown-item { display: flex; align-items: center; padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f3f4f6; transition: background 0.1s; }
        .user-dropdown-item:hover { background: #f9fafb; }
        .direct-call-btn { background: #10b981; color: white; border: none; border-radius: 50%; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 10px; opacity: 0; transition: opacity 0.2s; }
        .user-dropdown-item:hover .direct-call-btn { opacity: 1; }
        .direct-call-btn:hover { background: #059669; }
        .contact-toggle-row { display: flex; gap: 10px; margin-bottom: 20px; align-items: center; flex-wrap: wrap; }
        @media (max-width: 480px) { .contact-toggle-row { flex-direction: column; align-items: stretch; } }
        .existing-user-select { flex: 1; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; position: relative; color: #2563eb; font-weight: 500; font-size: 14px; background: white; min-width: 0; gap: 8px; }
        .add-user-btn { background: white; border: 1px solid #f97316; color: #f97316; border-radius: 6px; padding: 10px 16px; font-size: 14px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s; }
        .add-user-btn:hover { background: #fff7ed; }
        .add-user-btn.active { background: #f97316; color: white; }
        .contact-dropdown-menu { position: absolute; top: 100%; left: 0; width: 100%; background: white; border: 1px solid #e5e7eb; border-radius: 6px; box-shadow: 0 4px 15px rgba(0,0,0,0.15); z-index: 60; margin-top: 5px; max-height: 280px; overflow-y: auto; }
        .contact-search-box { padding: 10px; border-bottom: 1px solid #e5e7eb; position: sticky; top: 0; background: white; z-index: 2; }
        .contact-search-box input { width: 100%; padding: 8px 12px 8px 30px; border: 1px solid #e5e7eb; border-radius: 4px; font-size: 13px; outline: none; }
        .contact-dropdown-item { padding: 12px; display: flex; align-items: center; gap: 12px; cursor: pointer; border-bottom: 1px solid #f3f4f6; }
        .contact-dropdown-item:hover { background-color: #f9fafb; }
        .contact-avatar { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; flex-shrink: 0; }
        .contact-info { display: flex; flex-direction: column; overflow: hidden; }
        .contact-name { font-size: 14px; font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .contact-email { font-size: 12px; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .quote-qty-controls { display: flex; align-items: center; border: 1px solid #e5e7eb; border-radius: 20px; overflow: hidden; height: 32px; background: white; }
        .quote-qty-btn { width: 32px; height: 100%; display: flex; align-items: center; justify-content: center; background: transparent; border: none; cursor: pointer; font-size: 16px; color: #6b7280; transition: background 0.2s; }
        .quote-qty-btn:hover { background: #f3f4f6; color: #111827; }
        .quote-qty-btn:disabled { color: #d1d5db; cursor: not-allowed; }
        .quote-qty-val { width: 36px; text-align: center; font-size: 13px; font-weight: 600; color: #111827; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb; }
        .product-modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; justify-content: center; align-items: center; padding: 20px; }
        .product-modal-content { background: white; width: 100%; max-width: 580px; max-height: 90vh; border-radius: 16px; display: flex; flex-direction: column; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); overflow: hidden; }
        .agreement-field-group { margin-bottom: 12px; }
        .agreement-field-group label { display: block; font-size: 12px; font-weight: 600; color: #6b7280; margin-bottom: 5px; }
        .agreement-field-group input, .agreement-field-group select { width: 100%; padding: 9px 11px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; outline: none; background: #f9fafb; box-sizing: border-box; transition: border 0.2s, background 0.2s; }
        .agreement-field-group input:focus, .agreement-field-group select:focus { border-color: #2563eb; background: #fff; }
        .mobile-fixed-bottom { display: flex; gap: 10px; position: fixed; bottom: 0; left: 0; right: 0; z-index: 9998; background: white; border-top: 2px solid #e5e7eb; padding: 10px 12px; box-shadow: 0 -4px 12px rgba(0,0,0,0.1); }
        .mobile-fixed-bottom button { flex: 1; }
        .crm-page-container { padding-bottom: 80px !important; }
      `}</style>

        <div className="crm-page-container">

          {/* ── PAGE HEADER ── */}
          <div className="crm-page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
            <button className="btn-back" onClick={() => navigate(-1)}>← Back to CRM</button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap', flex: 1 }}>
              <h2 style={{ margin: 0, fontSize: '20px', color: '#111827', whiteSpace: 'nowrap' }}>Reply / Engage Lead</h2>

              {invoicedNumber && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '8px 12px', boxShadow: '0 2px 8px rgba(37,99,235,0.08)', flexShrink: 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
                    <span style={{ fontSize: '10px', fontWeight: '700', color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Invoice</span>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e3a8a', whiteSpace: 'nowrap' }}>{invoicedNumber}</span>
                  </div>
                  <button
                    onClick={() => navigate('/sales/crm/create-invoice', { state: { lead, existingLeadData, selectedListings, selectedMemberships, leadStatus, selectedProducts, invoiceIdFromCRM: invoicedId, existingInvoiceNumber: invoicedNumber, prefilledCustomer: { name: `${firstName} ${lastName}`.trim(), email, company: businessName, phone: selectedPhone || lead?.id, userId: selectedUserId }, taxAmount, shippingCost, totalOverride, seatCoversOverride } })}
                    style={{ padding: '7px 14px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '700', fontSize: '13px', color: 'white', backgroundColor: '#10b981', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}
                  >
                    ✅ View / Edit Invoice
                  </button>
                  <button
                    onClick={() => setInvoicedNumber(null)}
                    style={{ width: '26px', height: '26px', borderRadius: '50%', border: 'none', background: '#dbeafe', color: '#64748b', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="crm-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '24px', padding: '24px' }}>

            {/* ════════════ LEFT COLUMN ════════════ */}
            <div className="crm-col">

              {/* Contact Panel */}
              <div className="crm-panel">
                <div className="panel-header" onClick={() => togglePanel('contact')}>
                  <h3 style={{ margin: 0 }}>👤 Contact Information</h3>
                  <span className="collapse-icon" style={{ transform: collapsedPanels.contact ? 'rotate(180deg)' : 'rotate(0deg)' }}>^</span>
                </div>
                <div className="panel-body" style={{ display: collapsedPanels.contact ? 'none' : 'block' }}>
                  <div className="contact-toggle-row">
                    <div style={{ position: 'relative', flex: 1 }}>
                      <div className="existing-user-select" onClick={() => { setContactMode('existing'); setShowContactDropdown(!showContactDropdown); }} style={{ borderColor: contactMode === 'existing' ? '#3b82f6' : '#e5e7eb' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flex: 1, minWidth: 0 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            Existing User{(firstName || lastName) ? <span style={{ color: '#2563eb', fontWeight: 600 }}> {firstName} {lastName}</span> : ''}
                          </span>
                          {(firstName || lastName) && email && (
                            <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</span>
                          )}
                        </div>
                        <span style={{ color: '#9ca3af', fontSize: '12px', flexShrink: 0 }}>{showContactDropdown ? '▲' : '▼'}</span>
                      </div>
                      {showContactDropdown && contactMode === 'existing' && (
                        <div className="contact-dropdown-menu">
                          <div className="contact-search-box">
                            <span style={{ position: 'absolute', left: '18px', top: '18px', fontSize: '14px', color: '#9ca3af' }}>🔍</span>
                            <input type="text" placeholder="Search by name..." value={contactSearchTerm} onChange={(e) => setContactSearchTerm(e.target.value)} />
                          </div>
                          {filteredContacts.length === 0 ? (
                            <div style={{ padding: '15px', textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>No users found</div>
                          ) : (
                            filteredContacts.map((u, i) => {
                              const colors = getUserColor(i);
                              return (
                                <div key={u.id} className="contact-dropdown-item" onClick={() => { setFirstName(u.name.split(' ')[0] || ''); setLastName(u.name.split(' ').slice(1).join(' ') || ''); setEmail(u.email || ''); setBusinessName(u.company || ''); setSelectedUserId(u.id); setSelectedPhone(u.phone || ''); setShowContactDropdown(false); }} style={{ background: u.id === selectedUserId ? '#eff6ff' : 'white', borderLeft: u.id === selectedUserId ? '3px solid #2563eb' : '3px solid transparent' }}>
                                  <div className="contact-avatar" style={{ backgroundColor: colors.bg, color: colors.color }}>{getUserInitials(u.name)}</div>
                                  <div className="contact-info">
                                    <span className="contact-name">{u.name}</span>
                                    <span className="contact-email">{u.email || u.phone}</span>
                                  </div>
                                  {u.id === selectedUserId && <span style={{ marginLeft: 'auto', color: '#2563eb', fontSize: '14px', fontWeight: 700 }}>✓</span>}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                    <button className={`add-user-btn ${contactMode === 'new' ? 'active' : ''}`} onClick={() => { setContactMode('new'); setShowContactDropdown(false); setFirstName(''); setLastName(''); setEmail(''); setBusinessName(''); }}>
                      <span style={{ fontSize: '18px', lineHeight: 1, marginTop: '-2px' }}>+</span> Add User
                    </button>
                  </div>

                  <div className="form-row">
                    <div className="form-group"><label>First name</label><input type="text" placeholder="First name" onChange={(e) => setFirstName(e.target.value)} value={firstName} /></div>
                    <div className="form-group"><label>Last name</label><input type="text" placeholder="Last name" onChange={(e) => setLastName(e.target.value)} value={lastName} /></div>
                  </div>
                  <div className="form-group"><label>Business name</label><input type="text" placeholder="Transportation LLC" onChange={(e) => setBusinessName(e.target.value)} value={businessName} /></div>
                  <div className="form-group"><label>Email</label><input type="email" placeholder="email@example.com" onChange={(e) => setEmail(e.target.value)} value={email} /></div>
                </div>
              </div>

              {/* Lead Type Panel */}
              <div className="crm-panel" style={{ overflow: 'visible', position: 'relative', zIndex: 10 }}>
                <div className="panel-header" onClick={() => togglePanel('leadType')}>
                  <h3 style={{ margin: 0 }}>🏷️ Lead Type (select one or more)</h3>
                  <span className="collapse-icon" style={{ transform: collapsedPanels.leadType ? 'rotate(180deg)' : 'rotate(0deg)' }}>^</span>
                </div>
                <div className="panel-body" style={{ display: collapsedPanels.leadType ? 'none' : 'block' }}>
                  <div className="checkbox-grid">
                    {['Membership', 'Sell Listing to the Buyer', 'Renew Listing for the Seller', '$15-featured for Buyer', 'Ads', 'Check Availability', 'Buyer', 'Seller', 'Finance', 'Upholstery', 'Kits', 'Apparels'].map((type) => (
                      <label key={type}><input type="checkbox" checked={selectedLeadTypes.includes(type)} onChange={() => handleToggle(type, selectedLeadTypes, setSelectedLeadTypes)} /> {type}</label>
                    ))}
                  </div>
                  <div style={{ marginTop: '20px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '8px' }}>Lead Status</label>
                    <div className="status-dropdown-container">
                      <div className="status-dropdown-selected" onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}>
                        <span>{leadStatus ? `${LEAD_STATUSES.find(s => s.id === leadStatus)?.icon} ${leadStatus}` : <span style={{ color: '#9ca3af' }}>Select lead status</span>}</span>
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>{isStatusDropdownOpen ? '▲' : '▼'}</span>
                      </div>
                      {isStatusDropdownOpen && (
                        <div className="status-dropdown-menu">
                          {LEAD_STATUSES.map((status) => (
                            <div key={status.id} className="status-option" onClick={() => { setLeadStatus(status.id); setIsStatusDropdownOpen(false); }}>
                              <span>{status.icon}</span> <span>{status.id}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Vehicle Panel */}
              <div className="crm-panel">
                <div className="panel-header" onClick={() => togglePanel('vehicle')}>
                  <h3 style={{ margin: 0 }}>🚗 Vehicle</h3>
                  <span className="collapse-icon" style={{ transform: collapsedPanels.vehicle ? 'rotate(180deg)' : 'rotate(0deg)' }}>^</span>
                </div>
                <div className="panel-body" style={{ display: collapsedPanels.vehicle ? 'none' : 'block' }}>
                  <button onClick={() => setIsRefineModalOpen(true)} style={{ width: '100%', padding: '10px', backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '6px', color: '#4b5563', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '16px' }}>🔍</span> Search with seller name, year, & make...
                  </button>
                  <div className="selected-vehicles-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {selectedVehicles.map((car) => (
                      <div key={car.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', paddingBottom: '12px', borderBottom: '1px solid #f3f4f6' }}>
                        <button onClick={() => setSelectedVehicles(selectedVehicles.filter(v => v.id !== car.id))} style={{ background: '#fef2f2', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, marginTop: '2px', fontSize: '12px', fontWeight: 'bold' }} title="Remove Vehicle">✕</button>
                        <div style={{ background: '#16a34a', borderRadius: '4px', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0, marginTop: '3px' }}>✓</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '700', color: '#111827', fontSize: '14px', marginBottom: '2px' }}>{car.year} {car.make_name} {car.model_name}</div>
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>{car.mileage && !isNaN(Number(car.mileage)) && Number(car.mileage) !== 0 ? `${Number(car.mileage).toLocaleString()} miles` : 'N/A miles'} • {car.location || 'Location N/A'} • 200 miles away</div>
                        </div>
                        <button
                          onClick={() => setIsRefineModalOpen(true)}
                          style={{ background: '#eff6ff', border: '1px solid #93c5fd', color: '#2563eb', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
                          title="View / Edit Vehicles"
                        >
                          👁 View
                        </button>
                      </div>
                    ))}
                    {selectedVehicles.length === 0 && <div style={{ fontSize: '13px', color: '#9ca3af', fontStyle: 'italic' }}>No vehicles selected. Click the search bar above to add vehicles.</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', marginTop: '16px' }}>
                    <button className="text-link" onClick={() => window.open(`https://developer.globallimos.com/sales/all-listing`, '_blank')}>View all vehicles</button>
                  </div>
                </div>
              </div>

              {/* FOLLOW-UPS */}
              <div
                onClick={() => navigate('/sales/crm/followups', {
                  state: {
                    invoiceId: invoicedId,
                    leadPhone: selectedPhone || lead?.id,
                    customerName: `${firstName} ${lastName}`.trim() || businessName || '',
                    from: 'assign',
                    lead: lead || null,
                  },
                })}
                style={{
                  background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb',
                  marginBottom: 16, padding: '14px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>⏰</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Follow-ups</span>
                </div>
                <button
                  style={{
                    background: '#3b28cc', color: '#fff', border: 'none', borderRadius: '8px',
                    padding: '8px 16px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  Manage Follow-ups →
                </button>
              </div>

            </div>
            <div className="crm-col">

              <div className="crm-panel">
                <div className="panel-header" onClick={() => togglePanel('listings')}>
                  <h3 style={{ margin: 0 }}>📎 Listings / Memberships</h3>
                  <span className="collapse-icon" style={{ transform: collapsedPanels.listings ? 'rotate(180deg)' : 'rotate(0deg)' }}>^</span>
                </div>
                <div className="panel-body" style={{ display: collapsedPanels.listings ? 'none' : 'block' }}>
                  <p className="sub-label" style={{ margin: '0 0 10px 0' }}>Listings</p>
                  {loadingListingsData ? (
                    <div style={{ fontSize: '13px', color: '#9ca3af', padding: '8px 0' }}>Loading listings…</div>
                  ) : listingPackages.length === 0 ? (
                    <div style={{ fontSize: '13px', color: '#9ca3af', padding: '8px 0' }}>No listing packages configured yet.</div>
                  ) : (
                    <div className="price-grid">
                      {listingPackages.map((pkg) => {
                        const idStr = String(pkg.id);
                        const displayPrice = parseFloat(pkg.price) > 0 ? pkg.price : pkg.org_price;
                        return (
                          <label key={pkg.id}>
                            <input
                              type="checkbox"
                              checked={selectedListings.includes(idStr)}
                              onChange={() => handleToggle(idStr, selectedListings, setSelectedListings)}
                            />
                            {' '}${parseFloat(displayPrice).toLocaleString()}
                          </label>
                        );
                      })}
                    </div>
                  )}
                  <p className="sub-label" style={{ margin: '15px 0 10px 0' }}>Memberships</p>
                  {loadingListingsData ? (
                    <div style={{ fontSize: '13px', color: '#9ca3af', padding: '8px 0' }}>Loading memberships…</div>
                  ) : membershipPackages.length === 0 ? (
                    <div style={{ fontSize: '13px', color: '#9ca3af', padding: '8px 0' }}>No membership packages configured yet.</div>
                  ) : (
                    <div className="price-grid">
                      {membershipPackages.map((pkg) => {
                        const idStr = String(pkg.id);
                        const displayPrice = parseFloat(pkg.price) > 0 ? pkg.price : pkg.org_price;
                        return (
                          <label key={pkg.id}>
                            <input
                              type="checkbox"
                              checked={selectedMemberships.includes(idStr)}
                              onChange={() => handleToggle(idStr, selectedMemberships, setSelectedMemberships)}
                            />
                            {' '}${parseFloat(displayPrice).toLocaleString()}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Ads Package Panel */}
              <div className="crm-panel">
                <div className="panel-header" onClick={() => togglePanel('ads')}>
                  <h3 style={{ margin: 0 }}>📢 Ads Package</h3>
                  <span className="collapse-icon" style={{ transform: collapsedPanels.ads ? 'rotate(180deg)' : 'rotate(0deg)' }}>^</span>
                </div>
                <div className="panel-body" style={{ display: collapsedPanels.ads ? 'none' : 'block' }}>

                  {/* Package cards — fetched from admin panel (sale_products, type=Ads) */}
                  {loadingAdsData ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                      Loading ad packages…
                    </div>
                  ) : adPackages.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                      No ad packages configured yet. Add one in the admin panel under Packages.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                      {adPackages.map(pkg => {
                        const isSelected = String(selectedAdPackage) === String(pkg.id);
                        const displayPrice = parseFloat(pkg.price) > 0 ? pkg.price : pkg.org_price;
                        return (
                          <div
                            key={pkg.id}
                            onClick={() => setSelectedAdPackage(isSelected ? '' : String(pkg.id))}
                            style={{
                              border: `2px solid ${isSelected ? '#2563eb' : '#e5e7eb'}`,
                              borderRadius: '10px',
                              padding: '14px 16px',
                              cursor: 'pointer',
                              background: isSelected ? '#eff6ff' : '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              transition: 'all 0.15s',
                            }}
                          >
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
                            <div style={{ fontSize: '18px', fontWeight: 800, color: '#2563eb', whiteSpace: 'nowrap' }}>
                              ${parseFloat(displayPrice).toLocaleString()}<span style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280' }}>/mo</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Feature checklist — auto-checked based on this package's
                      linked add-ons (package_ad_addons), fully editable per-quote */}
                  <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '14px' }}>
                    <p className="sub-label" style={{ margin: '0 0 10px 0' }}>
                      {activeAdPackage ? `Features (auto-filled from ${activeAdPackage.display_name || activeAdPackage.name}, editable)` : 'Select a package to auto-fill features'}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {adAddons.map(feature => {
                        const featureId = String(feature.id);
                        const checked = selectedAdFeatures.includes(featureId);
                        const includedByPackage = activeAdPackage
                          ? (activeAdPackage.addon_ids || []).map(String).includes(featureId)
                          : false;
                        return (
                          <label
                            key={featureId}
                            onClick={() => toggleAdFeature(featureId)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '10px',
                              padding: '8px 10px', borderRadius: '8px', cursor: 'pointer',
                              background: checked ? '#f0f9ff' : '#fafafa',
                            }}
                          >
                            <div style={{
                              width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0,
                              background: checked ? '#2563eb' : '#fff',
                              border: `1.5px solid ${checked ? '#2563eb' : '#cbd5e1'}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '11px', color: '#fff', fontWeight: 800,
                            }}>
                              {checked ? '✓' : ''}
                            </div>
                            <span style={{ fontSize: '13px', color: '#374151', fontWeight: checked ? 600 : 400 }}>{feature.name}</span>
                            {activeAdPackage && !includedByPackage && (
                              <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: 700, color: '#6b7280', background: '#f3f4f6', padding: '2px 8px', borderRadius: '10px' }}>
                                Not in this package
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── AGREEMENT DETAILS + SHARE LINK ──────────────────────
                      Mirrors the "Invoice Details" block the customer sees
                      on the shared page: bill-to, phone numbers, agreement
                      date & terms — then lets the rep generate a link or
                      text it straight to the customer. */}
                  <div style={{ borderTop: '1px solid #f3f4f6', marginTop: '18px', paddingTop: '16px' }}>
                    <p className="sub-label" style={{ margin: '0 0 12px 0' }}>Agreement Details</p>

                    <div className="agreement-field-group">
                      <label>Bill to</label>
                      <input
                        type="text"
                        placeholder="Business or customer name"
                        value={agreementBillTo}
                        onChange={(e) => setAgreementBillTo(e.target.value)}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div className="agreement-field-group">
                        <label>Phone no.</label>
                        <input
                          type="text"
                          placeholder="(555) 123-4567"
                          value={agreementPhone}
                          onChange={(e) => setAgreementPhone(e.target.value)}
                        />
                      </div>
                      <div className="agreement-field-group">
                        <label>Additional phone no.</label>
                        <input
                          type="text"
                          placeholder="(555) 987-6543"
                          value={agreementAltPhone}
                          onChange={(e) => setAgreementAltPhone(e.target.value)}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div className="agreement-field-group">
                        <label>Agreement date</label>
                        <input
                          type="date"
                          value={agreementDate}
                          onChange={(e) => setAgreementDate(e.target.value)}
                        />
                      </div>
                      <div className="agreement-field-group">
                        <label>Terms</label>
                        <select
                          value={agreementTerms}
                          onChange={(e) => setAgreementTerms(e.target.value)}
                        >
                          <option value="Month to Month">Month to Month</option>
                          <option value="3 months, then monthly">3 months, then monthly</option>
                          <option value="6 months, then monthly">6 months, then monthly</option>
                          <option value="12 months, then monthly">12 months, then monthly</option>
                          <option value="Fixed 12-month term">Fixed 12-month term</option>
                        </select>
                      </div>
                    </div>

                    {generatedAdLink && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px', padding: '9px 10px', marginTop: '4px', marginBottom: '12px' }}>
                        <span style={{ fontSize: '12px', color: '#0369a1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{generatedAdLink}</span>
                        <button
                          onClick={handleCopyAdLink}
                          style={{ background: 'none', border: '1px solid #93c5fd', color: '#2563eb', borderRadius: '5px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
                        >
                          {adLinkCopied ? '✓ Copied' : 'Copy'}
                        </button>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '10px', marginTop: generatedAdLink ? 0 : '4px' }}>
                      <button
                        onClick={handleGenerateAdLink}
                        disabled={isGeneratingAdLink || !activeAdPackage}
                        style={{ flex: 1, padding: '11px', border: '1px solid #2563eb', borderRadius: '6px', background: '#fff', color: '#2563eb', fontSize: '13px', fontWeight: 700, cursor: (isGeneratingAdLink || !activeAdPackage) ? 'not-allowed' : 'pointer', opacity: (isGeneratingAdLink || !activeAdPackage) ? 0.5 : 1 }}
                      >
                        {isGeneratingAdLink ? '⏳ Generating…' : '🔗 Generate Link'}
                      </button>
                      <button
                        onClick={handleSendAdLinkToUser}
                        disabled={isSendingAdLink || !activeAdPackage}
                        style={{ flex: 1, padding: '11px', border: 'none', borderRadius: '6px', background: '#2563eb', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: (isSendingAdLink || !activeAdPackage) ? 'not-allowed' : 'pointer', opacity: (isSendingAdLink || !activeAdPackage) ? 0.5 : 1 }}
                      >
                        {isSendingAdLink ? '⏳ Sending…' : '✈ Send Link to User'}
                      </button>
                    </div>
                    {!activeAdPackage && (
                      <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '8px', fontStyle: 'italic' }}>Select an ad package above to enable link generation.</div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── PRODUCTS / QUOTE PANEL ── */}
              <div className="crm-panel">
                <div className="panel-header" onClick={() => togglePanel('products')}>
                  <h3 style={{ margin: 0 }}>🏷️ Seat Covers, Kits</h3>
                  <span className="collapse-icon" style={{ transform: collapsedPanels.products ? 'rotate(180deg)' : 'rotate(0deg)' }}>^</span>
                </div>

                <div className="panel-body" style={{ display: collapsedPanels.products ? 'none' : 'block', padding: '16px' }}>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px' }}>Product Category</label>
                    <select style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: '#f9fafb', fontSize: '14px', outline: 'none' }}>
                      <option>Seat Covers, Kits</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#6b7280' }}>Products</span>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button onClick={openProductModal} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>🔍 Search Products</button>
                      <button onClick={openProductModal} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>+ Add Product</button>
                    </div>
                  </div>

                  {/* ── SELECTED PRODUCTS LIST ── */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
                    {selectedProducts.map((prod) => (
                      <div key={prod.lineKey} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', paddingBottom: '16px', borderBottom: '1px solid #f3f4f6', position: 'relative' }}>
                        <img
                          src={prod.img}
                          alt={prod.name}
                          style={{ width: '50px', height: '65px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0, backgroundColor: '#f3f4f6' }}
                          onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/60x80/e5e7eb/9ca3af?text=No+Img'; }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                            <span style={{ fontSize: '14px', fontWeight: '700', color: '#111827' }}>{prod.name}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>${prod.price.toFixed(2)}</span>
                              <button onClick={() => removeProduct(prod.lineKey)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>✕</button>
                            </div>
                          </div>
                          {/* ── VARIANT BADGES (from the real inventory SKU that was picked) ── */}
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>

                            {/* Leather Badge */}
                            {prod.leatherColor && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', padding: '3px 8px', borderRadius: '5px', background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, backgroundColor: swatchFor(prod.leatherColor), border: prod.leatherColor === 'white' ? '1px solid #d1d5db' : 'none' }} />
                                Leather: <span style={{ textTransform: 'capitalize' }}>{prod.leatherColor}</span>
                              </span>
                            )}

                            {/* Stitch Badge */}
                            {prod.stitchColor && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', padding: '3px 8px', borderRadius: '5px', background: '#ecfdf5', color: '#047857', fontWeight: 600 }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, backgroundColor: swatchFor(prod.stitchColor), border: prod.stitchColor === 'white' ? '1px solid #d1d5db' : 'none' }} />
                                Stitch: <span style={{ textTransform: 'capitalize' }}>{prod.stitchColor}</span>
                              </span>
                            )}

                            {/* Pattern Badge */}
                            {prod.pattern && (
                              <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '5px', background: '#eff6ff', color: '#3b28cc', fontWeight: 600 }}>
                                ◈ {prod.pattern}
                              </span>
                            )}

                            {/* SKU (helps reps/warehouse confirm it against inventory) */}
                            {prod.sku && (
                              <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '5px', background: '#fafafa', color: '#9ca3af', fontWeight: 600, border: '1px solid #f1f5f9' }}>
                                SKU: {prod.sku}
                              </span>
                            )}

                            {prod.isCustom && (
                              <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '5px', background: '#f5f3ff', color: '#7c3aed', fontWeight: 700 }}>
                                🎨 Custom
                              </span>
                            )}

                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div className="quote-qty-controls">
                              <button className="quote-qty-btn" onClick={() => updateMainProductQty(prod.lineKey, -1)}>−</button>
                              <span className="quote-qty-val">{prod.qty}</span>
                              <button className="quote-qty-btn" onClick={() => updateMainProductQty(prod.lineKey, 1)}>+</button>
                            </div>
                            <span style={{ fontSize: '15px', fontWeight: '800', color: '#111827' }}>${(prod.price * prod.qty).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div onClick={openProductModal} style={{ border: '1px dashed #3b82f6', borderRadius: '8px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', backgroundColor: '#eff6ff', marginBottom: '24px' }}>
                    <div style={{ width: '32px', height: '32px', border: '1px dashed #3b82f6', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb', fontSize: '18px', background: 'white' }}>+</div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e3a8a', marginBottom: '2px' }}>Add Product from Lead / Invoice</div>
                      <div style={{ fontSize: '12px', color: '#60a5fa' }}>Browse products from existing leads or invoices</div>
                    </div>
                    <div style={{ marginLeft: 'auto', color: '#3b82f6' }}>›</div>
                  </div>

                  {/* Financial Summary */}
                  <div style={{ paddingTop: '16px', borderTop: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: '#4b5563' }}>
                      <span>Seat Covers ({selectedProducts.length})</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                        <span>$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={itemsSubtotal}
                          onChange={(e) => setSeatCoversOverride(e.target.value)}
                          style={{ width: '90px', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '13px', fontWeight: '600', textAlign: 'right', outline: 'none', color: '#111827' }}
                        />
                      </div>
                    </div>
                    {seatCoversOverride !== null && (
                      <div style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => setSeatCoversOverride(null)}
                          style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '11px', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                        >
                          Reset to sum of items
                        </button>
                      </div>
                    )}
                    {extraLineItems.map(item => (
                      <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: '#4b5563' }}>
                        <span>{item.label} <span style={{ color: '#9ca3af', fontSize: '12px' }}>({item.rawLabel})</span></span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.amount}
                            onChange={(e) => updateExtraPrice(item.key, e.target.value)}
                            style={{ width: '90px', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '13px', fontWeight: '600', textAlign: 'right', outline: 'none', color: '#111827' }}
                          />
                          <button onClick={() => removeExtraLineItem(item)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: 0 }}>✕</button>
                        </div>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: '#4b5563' }}>
                      <span>Vehicle</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                        <span>$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={vehiclePrice}
                          onChange={(e) => setVehiclePrice(e.target.value)}
                          style={{ width: '90px', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '13px', fontWeight: '600', textAlign: 'right', outline: 'none', color: '#111827' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: '#4b5563' }}>
                      <span>Tax</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                        <span>$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={taxAmount}
                          onChange={(e) => setTaxAmount(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                          style={{ width: '90px', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '13px', fontWeight: '600', textAlign: 'right', outline: 'none', color: '#111827' }}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: '#4b5563' }}>
                      <span>Shipping</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                        <span>$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={shippingCost}
                          onChange={(e) => setShippingCost(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                          style={{ width: '90px', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '13px', fontWeight: '600', textAlign: 'right', outline: 'none', color: '#111827' }}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '18px', fontWeight: '800', color: '#2563eb', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #f3f4f6' }}>
                      <span>Total</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                        <span>$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={finalTotal}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '' || val === null) {
                              setTotalOverride(null);
                            } else {
                              setTotalOverride(val);
                            }
                          }}
                          style={{ width: '120px', padding: '5px 8px', border: '1px solid #93c5fd', borderRadius: '4px', fontSize: '16px', fontWeight: '800', textAlign: 'right', outline: 'none', color: '#2563eb', background: '#eff6ff' }}
                        />
                      </div>
                    </div>
                    {totalOverride !== null && (
                      <div style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => setTotalOverride(null)}
                          style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '11px', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                        >
                          Reset to calculated total
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    style={{ width: '100%', marginTop: '24px', padding: '12px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: 'white', backgroundColor: invoicedNumber ? '#10b981' : '#2563eb' }}
                    onClick={handleOpenInvoice}
                  >
                    {invoicedNumber ? '✅ View / Edit Invoice' : '📄 Generate Invoice'}
                  </button>
                </div>
              </div>

              {/* Service Panel */}
              <div className="crm-panel">
                <div className="panel-header" onClick={() => togglePanel('service')}>
                  <h3 style={{ margin: 0 }}>💬 Text Messages</h3>
                  <span className="collapse-icon" style={{ transform: collapsedPanels.service ? 'rotate(180deg)' : 'rotate(0deg)' }}>^</span>
                </div>
                <div className="panel-body" style={{ padding: '0', display: collapsedPanels.service ? 'none' : 'block' }}>
                  <div style={{ padding: '15px' }}>
                    <div className="service-radio-row">
                      {['SMS', 'RC', 'Apple', 'W-App'].map((svc) => (
                        <label key={svc} className="service-radio-label"><input type="radio" name="svc" checked={serviceType === svc} onChange={() => setServiceType(svc)} /><span className="color-dot" style={{ backgroundColor: getDotColor(svc) }}></span>{svc}</label>
                      ))}
                    </div>
                    <div className="form-group" style={{ marginTop: '15px' }}>
                      <label style={{ fontSize: '13px', color: '#6b7280', fontWeight: '600' }}>Text From</label>
                      <select className="service-select"><option>+1 (323) 990-7701</option></select>
                    </div>
                  </div>
                  <div className="service-tabs">
                    <button className={serviceSubTab === 'Text' ? 'active' : ''} onClick={() => setServiceSubTab('Text')}>Text</button>
                    <button className={serviceSubTab === 'History' ? 'active' : ''} onClick={() => setServiceSubTab('History')}>History</button>
                  </div>
                  <div style={{ padding: '15px', backgroundColor: '#f8fafc', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px' }}>

                    {/* TEXT TAB */}
                    <div style={{ display: serviceSubTab === 'Text' ? 'block' : 'none' }}>
                      <div className="form-group">
                        <label style={{ fontSize: '13px', color: '#6b7280', fontWeight: '600', marginBottom: '6px' }}>Text Body</label>
                        <textarea className="service-textarea" placeholder="Type your message..." rows="4" value={inputText} onChange={(e) => setInputText(e.target.value)}></textarea>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '15px' }}>
                        <span style={{ fontSize: '12px', color: '#9ca3af' }}>{inputText.length} / 1600</span>
                      </div>
                      <button className="service-send-btn" onClick={handleSendMessage} disabled={isSending || !inputText.trim()}>Send ✈</button>

                      {localHistory && localHistory.length > 0 && (
                        <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: '#4b5563', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Recent Messages</span>
                            <button onClick={() => setServiceSubTab('History')} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '12px', cursor: 'pointer', padding: 0 }}>View All</button>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {localHistory.slice(-2).map((msg, idx) => (
                              <div key={`preview-${idx}`} className={`chat-bubble-wrapper ${msg.direction}`}>
                                {msg.direction === 'incoming' && <div className="chat-date-header">{msg.time} • Incoming</div>}
                                <div className={`chat-bubble ${msg.direction}`}>{msg.text}</div>
                                {msg.direction === 'outgoing' && <div className="chat-date-header" style={{ textAlign: 'right' }}>{msg.time} • Outgoing</div>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* HISTORY TAB */}
                    <div className="service-history-area" ref={historyScrollRef} style={{ display: serviceSubTab === 'History' ? 'flex' : 'none', maxHeight: '350px', overflowY: 'auto', paddingRight: '5px' }}>
                      <div style={{ textAlign: 'center', marginBottom: '10px' }}><button className="text-link" style={{ fontSize: '12px' }}>↺ Load older messages</button></div>
                      {localHistory?.map((msg, idx) => (
                        <div key={idx} className={`chat-bubble-wrapper ${msg.direction}`}>
                          {msg.direction === 'incoming' && <div className="chat-date-header">{msg.time} • Incoming</div>}
                          <div className={`chat-bubble ${msg.direction}`}>{msg.text}</div>
                          {msg.direction === 'outgoing' && <div className="chat-date-header" style={{ textAlign: 'right' }}>{msg.time} • Outgoing</div>}
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Call Panel */}
              <div className="crm-panel" style={{ padding: 0 }}>
                <div className="call-nav-tabs panel-header" style={{ paddingTop: '10px', marginBottom: 0 }} onClick={() => togglePanel('call')}>
                  <button className={`call-nav-tab ${callTab === 'Call' ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setCallTab('Call'); }}>📞 Call</button>
                  <button className={`call-nav-tab ${callTab === 'History' ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setCallTab('History'); }}>🕒 History</button>
                  <button className={`call-nav-tab ${callTab === 'Dial pad' ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setCallTab('Dial pad'); }}>🎛️ Dial pad</button>
                  <span className="collapse-icon" style={{ marginLeft: 'auto', transform: collapsedPanels.call ? 'rotate(0deg)' : 'rotate(180deg)' }}>^</span>
                </div>

                <div style={{ display: collapsedPanels.call ? 'none' : 'block' }}>
                  <div className="panel-body" style={{ padding: '0 20px 20px 20px' }}>

                    {callTab === 'Call' && (
                      <div className="call-tab-content">
                        <div className="form-group" style={{ marginBottom: '16px' }}><label style={{ fontSize: '13px', color: '#4b5563', fontWeight: '600', marginBottom: '8px', display: 'block' }}>Outgoing call from</label><select className="modern-input-box"><option>+1 (323) 990-7701</option></select></div>
                        <div className="form-group" style={{ marginBottom: '16px' }}>
                          <label style={{ fontSize: '13px', color: '#4b5563', fontWeight: '600', marginBottom: '8px', display: 'block' }}>Calling number</label>
                          <select className="modern-input-box" value={selectedCallingNumber} onChange={(e) => setSelectedCallingNumber(e.target.value)}>
                            {availableCallingNumbers.map((num, idx) => (<option key={idx} value={num}>{num}</option>))}
                          </select>
                        </div>
                        <input type="text" placeholder="Put a new no. to call (Optional)" value={customPhone} onChange={(e) => setCustomPhone(e.target.value)} className="modern-input-box" style={{ marginBottom: '24px' }} />
                        <button className="btn-call-green" onClick={() => handleCallNow(customPhone || selectedCallingNumber)} disabled={isCalling}>
                          {isCalling ? '📞 Dialing...' : '📞 Call Now'}
                        </button>
                      </div>
                    )}

                    {callTab === 'History' && (
                      <div className="call-tab-content">
                        <div className="form-group" style={{ marginBottom: '16px' }}><label style={{ fontSize: '13px', color: '#4b5563', fontWeight: '600', marginBottom: '8px', display: 'block' }}>View history for</label><select className="modern-input-box"><option>+1 (323) 990-7701</option></select></div>
                        <div className="history-list-container" ref={callHistoryRef} style={{ maxHeight: '250px', overflowY: 'auto' }}>
                          {callHistory.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280', fontSize: '14px' }}>No recent call history found.</div>
                          ) : (
                            callHistory.map((log, index) => {
                              const style = getCallStyle(log.type, log.status);
                              const isThisTrackPlaying = playingUrl === log.recordingUrl;
                              const progress = isThisTrackPlaying ? playbackProgress : 0;
                              return (
                                <div className="history-row" key={log.id || index}>
                                  <div className="history-icon-circle" style={{ color: style.color }}>{style.icon}</div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827', display: 'flex', alignItems: 'center' }}>{log.type || 'Call'}{log.status && <span className="status-badge" style={{ borderColor: style.color, color: style.color }}>{log.status}</span>}</div>
                                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.date} • {log.number} {log.duration && ` 🕒 ${log.duration}`}</div>
                                  </div>
                                  <div className="history-play-wrapper" style={{ background: isThisTrackPlaying ? `conic-gradient(#3b82f6 ${progress}%, #e5e7eb 0deg)` : '#e5e7eb', opacity: log.recordingUrl ? 1 : 0.4, cursor: log.recordingUrl ? 'pointer' : 'not-allowed' }} onClick={() => log.recordingUrl && togglePlay(log.recordingUrl)} title={log.recordingUrl ? (isThisTrackPlaying && isPlaying ? "Pause" : "Play") : "No Recording"}>
                                    <div className="history-play-inner">{isThisTrackPlaying && isPlaying ? '⏸' : '▶'}</div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                        <div style={{ textAlign: 'center', marginTop: '16px' }}>
                          <button className="text-link" onClick={() => fetchCallHistory(availableCallingNumbers)} disabled={isRefreshingHistory} style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', margin: '0 auto', opacity: isRefreshingHistory ? 0.5 : 1, cursor: isRefreshingHistory ? 'not-allowed' : 'pointer' }}>
                            {isRefreshingHistory ? '⏳ Refreshing...' : '↺ Refresh History'}
                          </button>
                        </div>
                      </div>
                    )}

                    {callTab === 'Dial pad' && (
                      <div className="call-tab-content">
                        <div className="form-group" style={{ marginBottom: '16px' }}><label style={{ fontSize: '13px', color: '#4b5563', fontWeight: '600', marginBottom: '8px', display: 'block' }}>Outgoing call from</label><select className="modern-input-box"><option>+1 (323) 990-7701</option></select></div>
                        <div style={{ position: 'relative', marginBottom: '8px' }}>
                          <input type="text" placeholder="🔍 Search user or type number" className="modern-input-box" value={userSearchTerm || dialPadNumber} onChange={(e) => { setUserSearchTerm(e.target.value); setDialPadNumber(e.target.value); }} onFocus={() => setShowUserDropdown(true)} onBlur={() => setTimeout(() => setShowUserDropdown(false), 200)} style={{ background: '#fff', paddingRight: '44px' }} />
                          {(dialPadNumber || userSearchTerm) && (
                            <button onMouseDown={(e) => e.preventDefault()} onClick={() => { const current = dialPadNumber || userSearchTerm; const trimmed = current.slice(0, -1); setDialPadNumber(trimmed); setUserSearchTerm(trimmed); }} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#9ca3af', display: 'flex', alignItems: 'center', padding: '4px', lineHeight: 1 }} title="Backspace">⌫</button>
                          )}
                          {showUserDropdown && (
                            <div className="user-dropdown-menu">
                              {filteredUsers.length === 0 ? (
                                <div className="user-dropdown-item" style={{ color: '#6b7280', justifyContent: 'center' }}>No users found</div>
                              ) : (
                                filteredUsers.map((u, i) => {
                                  const colors = getUserColor(i);
                                  return (
                                    <div key={u.id || i} className="user-dropdown-item" onClick={() => { setDialPadNumber(u.phone); setUserSearchTerm(u.phone); setShowUserDropdown(false); }}>
                                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: colors.bg, color: colors.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold', marginRight: '12px' }}>{getUserInitials(u.name)}</div>
                                      <div style={{ flex: 1, fontSize: '14px', color: '#111827', fontWeight: '500' }}>{u.name}</div>
                                      <div style={{ fontSize: '13px', color: '#6b7280', marginRight: '10px' }}>{u.phone}</div>
                                      <button className="direct-call-btn" onClick={(e) => { e.stopPropagation(); handleCallNow(u.phone); setShowUserDropdown(false); }} title="Call Instantly">📞</button>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                        <div style={{ position: 'relative', maxWidth: '220px', margin: '24px auto' }}>
                          <div className="dial-pad-grid" style={{ margin: '0' }}>
                            {dialKeys.map((key, i) => (
                              <div className="dial-key" key={i} onClick={() => { setDialPadNumber(prev => prev + key.num); setUserSearchTerm(prev => prev + key.num); }}>
                                <span className="num">{key.num}</span><span className="letters">{key.letters}</span>
                              </div>
                            ))}
                          </div>
                          {(dialPadNumber || userSearchTerm) && (
                            <button onClick={(e) => { e.preventDefault(); const current = dialPadNumber || userSearchTerm; const trimmed = current.slice(0, -1); setDialPadNumber(trimmed); setUserSearchTerm(trimmed); }} style={{ position: 'absolute', right: '-50px', bottom: '10px', background: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#9ca3af', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', transition: 'color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.color = '#ef4444'} onMouseOut={(e) => e.currentTarget.style.color = '#9ca3af'} title="Backspace">⌫</button>
                          )}
                        </div>
                        <button className="btn-call-green" onClick={() => handleCallNow(dialPadNumber)} disabled={isCalling || !dialPadNumber}>{isCalling ? '📞 Dialing...' : '📞 Call Now'}</button>
                      </div>
                    )}

                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        <RefineSearchModal
          isOpen={isRefineModalOpen}
          onClose={() => setIsRefineModalOpen(false)}
          initialSelectedVehicles={selectedVehicles}
          onSelectVehicles={(updatedVehiclesList) => { setSelectedVehicles(updatedVehiclesList); }}
        />

        {/* ══════════════════════════════════════════════════════
          SEARCH PRODUCTS MODAL — driven by REAL inventory rows
      ══════════════════════════════════════════════════════ */}
        {isProductModalOpen && (
          <div className="product-modal-overlay">
            <div className="product-modal-content">

              {/* Modal Header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ width: '24px' }}></div>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#111827' }}>Search Products</h3>
                <button onClick={() => setIsProductModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#9ca3af' }}>✕</button>
              </div>

              {/* Search */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
                <div style={{ position: 'relative', width: '100%' }}>
                  <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px', color: '#9ca3af' }}>🔍</span>
                  <input
                    type="text"
                    placeholder="Search seat covers, kits..."
                    value={modalSearchTerm}
                    onChange={(e) => setModalSearchTerm(e.target.value)}
                    style={{ width: '100%', padding: '12px 16px 12px 40px', borderRadius: '8px', border: '1px solid #d1d5db', outline: 'none', fontSize: '15px', boxSizing: 'border-box', backgroundColor: '#f9fafb' }}
                  />
                </div>
              </div>

              {/* Count + clear */}
              <div style={{ padding: '10px 20px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>{modalSelectedCount} variant(s) selected</span>
                <button
                  onClick={() => setModalDraftProducts(prev => prev.map(p => ({ ...p, selected: false, selectedQtyByVariant: {} })))}
                  style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                >
                  Clear All
                </button>
              </div>

              {/* Inventory / Custom Order tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', flexShrink: 0, padding: '0 20px' }}>
                <button
                  onClick={() => setModalTab('inventory')}
                  style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', color: modalTab === 'inventory' ? '#2563eb' : '#6b7280', borderBottom: modalTab === 'inventory' ? '2px solid #2563eb' : '2px solid transparent' }}
                >
                  📦 Inventory
                </button>
                <button
                  onClick={() => setModalTab('custom')}
                  style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', color: modalTab === 'custom' ? '#2563eb' : '#6b7280', borderBottom: modalTab === 'custom' ? '2px solid #2563eb' : '2px solid transparent' }}
                >
                  🎨 Custom Order
                </button>
              </div>

              {/* Product list */}
              {modalTab === 'inventory' && (
                <div style={{ overflowY: 'auto', flex: 1, padding: '0 20px' }}>
                  {displayedModalProducts.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                      No products found matching "{modalSearchTerm}"
                    </div>
                  ) : (
                    displayedModalProducts.map(prod => {
                      const variants = productVariantsMap[prod.id] || [];
                      const isLoading = loadingVariants[prod.id];

                      return (
                        <div key={prod.id} style={{ paddingBottom: '8px', borderBottom: '1px solid #f3f4f6' }}>

                          {/* Row 1: checkbox · image · name/specs/avail · price */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 0 8px 0' }}>
                            <input
                              type="checkbox"
                              checked={prod.selected}
                              onChange={(e) => handleModalCheckChange(prod.id, e.target.checked)}
                              style={{ width: '18px', height: '18px', accentColor: '#2563eb', cursor: 'pointer', flexShrink: 0 }}
                            />
                            <img
                              src={prod.img}
                              alt={prod.name}
                              style={{ width: '46px', height: '60px', objectFit: 'cover', borderRadius: '6px', backgroundColor: '#f3f4f6', flexShrink: 0 }}
                              onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/60x80/e5e7eb/9ca3af?text=No+Img'; }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{prod.name}</div>
                            </div>
                            <div style={{ width: '60px', textAlign: 'right', fontSize: '13px', fontWeight: '700', color: '#111827', flexShrink: 0 }}>
                              ${prod.price.toFixed(2)}
                            </div>
                          </div>

                          {/* Loading / empty states while we hit /products/:id/variants */}
                          {isLoading && (
                            <div style={{ marginLeft: '32px', marginBottom: '12px', fontSize: '12px', color: '#9ca3af' }}>
                              Loading available variants…
                            </div>
                          )}
                          {!isLoading && variants.length === 0 && (
                            <div style={{ marginLeft: '32px', marginBottom: '12px', fontSize: '12px', color: '#ef4444' }}>
                              No stock variants found for this product in inventory.
                            </div>
                          )}

                          {/* ── ONE ROW PER REAL INVENTORY SKU ── */}
                          {variants.map(v => {
                            const qty = prod.selectedQtyByVariant?.[v.inventoryId] || 0;
                            const outOfStock = v.avail <= 0;

                            return (
                              <div
                                key={v.inventoryId}
                                style={{
                                  marginTop: '8px',
                                  marginLeft: '32px',
                                  marginBottom: '8px',
                                  padding: '12px',
                                  borderRadius: '10px',
                                  background: qty > 0 ? '#f8faff' : '#fafafa',
                                  border: qty > 0 ? '1px solid #dbeafe' : '1px solid #f1f5f9',
                                  opacity: outOfStock ? 0.55 : 1,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '12px',
                                  flexWrap: 'wrap',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 600, color: '#475569' }}>
                                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: swatchFor(v.leatherColor), border: v.leatherColor === 'white' ? '1px solid #d1d5db' : 'none' }} />
                                    Leather: <span style={{ textTransform: 'capitalize' }}>{v.leatherColor}</span>
                                  </span>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 600, color: '#047857' }}>
                                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: swatchFor(v.stitchColor), border: v.stitchColor === 'white' ? '1px solid #d1d5db' : 'none' }} />
                                    Stitch: <span style={{ textTransform: 'capitalize' }}>{v.stitchColor}</span>
                                  </span>
                                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#3b28cc' }}>◈ {v.pattern}</span>
                                  <span style={{ fontSize: '11px', fontWeight: 600, color: outOfStock ? '#ef4444' : '#10b981' }}>
                                    {outOfStock ? 'Out of stock' : `Avail: ${v.avail}`}
                                  </span>
                                  <span style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af' }}>SKU: {v.sku}</span>
                                </div>

                                <div className="quote-qty-controls" style={{ height: '28px' }}>
                                  <button
                                    className="quote-qty-btn"
                                    disabled={outOfStock || qty <= 0}
                                    onClick={() => updateModalVariantQty(prod.id, v.inventoryId, -1, v.avail)}
                                  >−</button>
                                  <span className="quote-qty-val" style={{ width: '28px', fontSize: '12px' }}>{qty}</span>
                                  <button
                                    className="quote-qty-btn"
                                    disabled={outOfStock || qty >= v.avail}
                                    onClick={() => updateModalVariantQty(prod.id, v.inventoryId, 1, v.avail)}
                                  >+</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {modalTab === 'custom' && (
                <div style={{ overflowY: 'auto', flex: 1, padding: '20px' }}>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: '8px' }}>Product</label>

                    <div style={{ position: 'relative', marginBottom: '10px' }}>
                      <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#9ca3af' }}>🔍</span>
                      <input
                        type="text"
                        placeholder="Search seat covers…"
                        value={customProductSearch}
                        onChange={e => setCustomProductSearch(e.target.value)}
                        style={{ width: '100%', padding: '9px 12px 9px 32px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px', backgroundColor: '#f9fafb', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                        gap: '10px',
                        maxHeight: '220px',
                        overflowY: 'auto',
                        padding: '4px 2px',
                      }}
                    >
                      {availableProducts
                        .filter(p => p.name.toLowerCase().includes(customProductSearch.toLowerCase()))
                        .map(p => {
                          const isSelected = customProductId === p.id.toString();
                          return (
                            <div
                              key={p.id}
                              onClick={() => setCustomProductId(p.id.toString())}
                              style={{
                                border: `2px solid ${isSelected ? '#2563eb' : '#e5e7eb'}`,
                                borderRadius: '10px',
                                padding: '8px',
                                cursor: 'pointer',
                                background: isSelected ? '#eff6ff' : '#fff',
                                textAlign: 'center',
                                transition: 'all 0.15s',
                                position: 'relative',
                              }}
                            >
                              {isSelected && (
                                <div style={{ position: 'absolute', top: '4px', right: '4px', width: '18px', height: '18px', borderRadius: '50%', background: '#2563eb', color: '#fff', fontSize: '11px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  ✓
                                </div>
                              )}
                              <img
                                src={p.img}
                                alt={p.name}
                                style={{ width: '100%', height: '72px', objectFit: 'cover', borderRadius: '6px', backgroundColor: '#f3f4f6', marginBottom: '6px' }}
                                onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/60x80/e5e7eb/9ca3af?text=No+Img'; }}
                              />
                              <div style={{ fontSize: '11px', fontWeight: 700, color: '#111827', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {p.name}
                              </div>
                              <div style={{ fontSize: '11px', fontWeight: 600, color: '#2563eb', marginTop: '2px' }}>
                                ${p.price.toFixed(2)}
                              </div>
                            </div>
                          );
                        })}

                      {availableProducts.filter(p => p.name.toLowerCase().includes(customProductSearch.toLowerCase())).length === 0 && (
                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '20px', color: '#9ca3af', fontSize: '12px' }}>
                          No products found
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: '8px' }}>Leather Color</label>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {AVAILABLE_COLORS.map(c => (
                        <div
                          key={c.name}
                          onClick={() => setCustomLeather(c.name)}
                          title={c.name}
                          style={{ backgroundColor: c.hex, width: '30px', height: '30px', borderRadius: '50%', border: c.name === 'white' ? '1px solid #d1d5db' : '1px solid transparent', outline: customLeather === c.name ? '2px solid #2563eb' : 'none', outlineOffset: '3px', cursor: 'pointer' }}
                        />
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: '8px' }}>Stitch Color</label>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {AVAILABLE_COLORS.map(c => (
                        <div
                          key={c.name}
                          onClick={() => setCustomStitch(c.name)}
                          title={c.name}
                          style={{ backgroundColor: c.hex, width: '30px', height: '30px', borderRadius: '50%', border: c.name === 'white' ? '1px solid #d1d5db' : '1px solid transparent', outline: customStitch === c.name ? '2px solid #2563eb' : 'none', outlineOffset: '3px', cursor: 'pointer' }}
                        />
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: '8px' }}>Pattern</label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {CUSTOM_PATTERNS.map(pattern => (
                        <button
                          key={pattern}
                          onClick={() => setCustomPattern(pattern)}
                          style={{ padding: '8px 14px', border: '1.5px solid', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', borderColor: customPattern === pattern ? '#2563eb' : '#d1d5db', background: customPattern === pattern ? '#eff6ff' : '#fff', color: customPattern === pattern ? '#2563eb' : '#374151', fontWeight: customPattern === pattern ? 700 : 500 }}
                        >
                          {pattern}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280' }}>Quantity</span>
                    <div className="quote-qty-controls">
                      <button className="quote-qty-btn" onClick={() => setCustomQty(q => Math.max(1, q - 1))}>−</button>
                      <span className="quote-qty-val">{customQty}</span>
                      <button className="quote-qty-btn" onClick={() => setCustomQty(q => q + 1)}>+</button>
                    </div>
                    <button
                      onClick={addCustomLine}
                      disabled={!customProductId}
                      style={{ marginLeft: 'auto', padding: '10px 18px', background: customProductId ? '#2563eb' : '#cbd5e1', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: customProductId ? 'pointer' : 'not-allowed' }}
                    >
                      + Add to Quote
                    </button>
                  </div>

                  {customDraftLines.length > 0 && (
                    <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', marginBottom: '10px' }}>Custom lines on this quote</div>
                      {customDraftLines.map(line => (
                        <div key={line.lineKey} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '8px', background: '#faf5ff', border: '1px solid #ede9fe', marginBottom: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: '#111827' }}>{line.name}</span>
                          <span style={{ fontSize: '11px', color: '#6b7280' }}>{line.leatherColor} / {line.stitchColor} / {line.pattern}</span>
                          <div className="quote-qty-controls" style={{ marginLeft: 'auto' }}>
                            <button className="quote-qty-btn" onClick={() => updateCustomDraftQty(line.lineKey, -1)}>−</button>
                            <span className="quote-qty-val">{line.qty}</span>
                            <button className="quote-qty-btn" onClick={() => updateCustomDraftQty(line.lineKey, 1)}>+</button>
                          </div>
                          <button onClick={() => removeCustomLine(line.lineKey)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px' }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Modal Footer */}
              <div style={{ padding: '16px 20px', borderTop: '1px solid #e5e7eb', backgroundColor: 'white', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <span style={{ fontSize: '13px', color: '#6b7280' }}>{modalSelectedCount} variant(s) selected</span>
                  <span style={{ fontSize: '15px', fontWeight: '700', color: '#111827' }}>
                    Total: <span style={{ color: '#2563eb' }}>${modalTotalPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </span>
                </div>
                <button
                  onClick={saveProductSelections}
                  style={{ width: '100%', padding: '14px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', transition: 'background 0.2s' }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                >
                  Add Selected ({modalSelectedCount})
                </button>
              </div>

            </div>
          </div>
        )}

      </div>

      {/* Fixed bottom bar for mobile — always visible when scrolling */}
      <div className="mobile-fixed-bottom">
        <button
          className="create-account-btn"
          style={{
            backgroundColor: contactMode === 'existing' ? '#2b6cb0' : '#10b981',
            margin: 0,
            width: '100%',
            padding: '12px 16px',
            fontSize: '14px',
            fontWeight: '700',
            borderRadius: '8px',
          }}
          onClick={contactMode === 'existing' ? handleUpdateLead : handleCreateAccount}
          disabled={isUpdating || isCreating}
        >
          {contactMode === 'existing'
            ? (isUpdating ? 'Updating...' : 'Update Lead Preferences')
            : (isCreating ? 'Creating...' : 'Create Account')}
        </button>
        <button
          onClick={handleOpenInvoice}
          style={{
            backgroundColor: invoicedNumber ? '#10b981' : '#2563eb',
            margin: 0,
            width: '100%',
            padding: '12px 16px',
            fontSize: '14px',
            fontWeight: '700',
            borderRadius: '8px',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
          }}
        >
          {invoicedNumber ? '✅ View / Edit Invoice' : '📄 Generate Invoice'}
        </button>
      </div>

    </>
  );
};

export default AssignLeadPage;