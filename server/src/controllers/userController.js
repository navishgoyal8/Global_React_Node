const db = require('../config/db');

exports.createUser = async (req, res) => {
    try {
        const { phone, firstName, lastName, businessName, email, agentId, selectedVehicles, selectedProducts } = req.body;
        const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';

        if (!firstName || !lastName || !email) {
            return res.status(400).json({ 
                success: false, 
                message: "Required fields missing: firstName, lastName, email" 
            });
        }

        let phoneCode = '1';
        let cellNumber = phone ? phone.replace(/\D/g, '') : '';

        if (cellNumber.length === 11 && cellNumber.startsWith('1')) {
            cellNumber = cellNumber.slice(1);
        } else if (cellNumber.length > 10) {
            phoneCode = cellNumber.slice(0, cellNumber.length - 10);
            cellNumber = cellNumber.slice(-10);
        }

        const sql = `
            INSERT INTO global_limo_user 
            (firstname, lastname, company, email, phone_code, cellnumber, lang_id, group_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const values = [
            firstName, lastName, businessName || null, email, phoneCode, cellNumber, 1, 4
        ];

        const [result] = await db.query(sql, values);
        const newUserId = result.insertId;

        console.log("Account successfully saved! ID:", newUserId);

        // ✅ NEW: Save Products & get Preference ID upon account creation
        let newPrefId = null;
        const productsStr = JSON.stringify(selectedProducts || []);
        
        const [prefResult] = await db.query(`
            INSERT INTO user_preferences 
            (user_id, selected_products, status, is_deleted, created_on, ip_address) 
            VALUES (?, ?, 1, 0, NOW(), ?)
        `, [newUserId, productsStr, ipAddress]);
        
        newPrefId = prefResult.insertId;

        // ✅ FIX: Save Vehicles to inquiries AND crm_lead_vehicles
        if (selectedVehicles && selectedVehicles.length > 0) {
            for (const vehicle of selectedVehicles) {
                const vehicleName = `${vehicle.year} ${vehicle.make_name} ${vehicle.model_name}`;
                const vehiclePrice = vehicle.price || null; // Fix empty price

                // 1. Save to inquiries
                const inquiryQuery = `
                    INSERT INTO inquiries 
                    (global_limo_user_id, vehicle_name, price, type, created_by, modified_by, ip_address)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `;
                await db.query(inquiryQuery, [
                    newUserId, vehicleName, vehiclePrice, 'Listing', agentId || 1, agentId || 1, ipAddress
                ]);

                // 2. Save to crm_lead_vehicles so they appear on UI reload
                if (vehicle.id && newPrefId) {
                    await db.query(`
                        INSERT INTO crm_lead_vehicles 
                        (lead_id, listing_id, created_by, modified_by, ip_address)
                        VALUES (?, ?, ?, ?, ?)
                    `, [newPrefId.toString(), vehicle.id, agentId || 1, agentId || 1, ipAddress]);
                }
            }
        }

        return res.status(201).json({
            success: true,
            message: "Account, Inquiries, and Preferences created successfully",
            userId: newUserId
        });

    } catch (error) {
        console.error("MySQL Error:", error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ 
                success: false, 
                message: "User with this email or phone already exists." 
            });
        }
        return res.status(500).json({ success: false, message: "Database insertion failed." });
    }
};

exports.updateLeadPreferences = async (req, res) => {
    try {
        const { 
    phone, userId, preferenceId, leadTypes, leadStatus, listings, 
    memberships, adPackage, adFeatures, serviceType, agentId, selectedVehicles, selectedProducts,
    discountAmount, taxAmount, shippingCost, totalOverride, seatCoversOverride,
    leadSource
} = req.body;
        
        const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
        const shortPhone = phone ? phone.replace(/\D/g, '').slice(-10) : null;

        if (!shortPhone) {
            return res.status(400).json({ success: false, message: "Lead phone number is required." });
        }

        let finalUserId = userId || null; 

        if (!finalUserId) {
             return res.status(400).json({ 
                 success: false, 
                 message: "Missing required field: userId." 
             });
        }

        if (!finalUserId) {
            const shortPhone = phone.slice(-10);
            const [userRows] = await db.query(
                `SELECT id FROM global_limo_user WHERE cellnumber = ? OR cellnumber LIKE CONCAT('%', ?, '%') LIMIT 1`,
                [shortPhone, shortPhone]
            );

            if (userRows.length === 0) {
                return res.status(404).json({ success: false, message: "User not found. Create account first." });
            }
            finalUserId = userRows[0].id;
        }

        const leadTypesStr = JSON.stringify(leadTypes || []);
        const listingsStr = JSON.stringify(listings || []);
        const membershipsStr = JSON.stringify(memberships || []);
        const productsStr = JSON.stringify(selectedProducts || []);
        const adFeaturesStr = JSON.stringify(adFeatures || []);   
        const adPackageVal = adPackage || null; 

        let finalPreferenceId = preferenceId;

        if (finalPreferenceId) {
            // Explicitly updating an existing lead (frontend sends existingLeadData.id).
            // Only touch THIS preference — never match by phone number.
            await db.query(`
    UPDATE user_preferences 
    SET user_id = ?, lead_phone = ?, lead_types = ?, listings = ?, memberships = ?, ad_package = ?, ad_features = ?,
        service_type = ?, lead_status = ?, selected_products = ?, ip_address = ?, modified_on = NOW(),
        lead_source = COALESCE(?, lead_source),
        discount_amount = ?, tax_amount = ?, shipping_cost = ?, total_override = ?, seat_covers_override = ?
    WHERE id = ?
`, [
    finalUserId, shortPhone, leadTypesStr, listingsStr, membershipsStr, adPackageVal, adFeaturesStr,
    serviceType, leadStatus, productsStr, ipAddress,
    leadSource || null,
    discountAmount || 0, taxAmount || 0, shippingCost || 0,
    totalOverride !== undefined && totalOverride !== null ? totalOverride : null,
    seatCoversOverride !== undefined && seatCoversOverride !== null ? seatCoversOverride : null,
    finalPreferenceId
]);
        } else {
            // Creating a NEW lead — always insert a fresh row. Never match/update
            // an existing lead by phone number.
            const [prefInsertResult] = await db.query(`
    INSERT INTO user_preferences 
    (user_id, lead_phone, lead_types, listings, memberships, ad_package, ad_features, service_type, lead_status, selected_products, ip_address,
     lead_source,
     discount_amount, tax_amount, shipping_cost, total_override, seat_covers_override,
     status, is_deleted, created_on) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, NOW())
`, [
    finalUserId, shortPhone, leadTypesStr, listingsStr, membershipsStr, adPackageVal, adFeaturesStr,
    serviceType, leadStatus, productsStr, ipAddress,
    leadSource || null,
    discountAmount || 0, taxAmount || 0, shippingCost || 0,
    totalOverride !== undefined && totalOverride !== null ? totalOverride : null,
    seatCoversOverride !== undefined && seatCoversOverride !== null ? seatCoversOverride : null
]);
            finalPreferenceId = prefInsertResult.insertId;
        }

        // ✅ FIX: Handle vehicles for both inquiries AND crm_lead_vehicles
        // First, soft-delete ALL existing active vehicles for this lead so that
        // any vehicles the agent removed stay deleted after refresh.
        if (finalPreferenceId) {
            await db.query(
                `UPDATE crm_lead_vehicles SET is_deleted = 1, modified_on = NOW(), modified_by = ? WHERE lead_id = ? AND is_deleted = 0`,
                [agentId || 1, finalPreferenceId.toString()]
            );
        }
        if (finalUserId) {
            await db.query(
                `UPDATE inquiries SET is_deleted = 1, modified_on = NOW(), modified_by = ? WHERE global_limo_user_id = ? AND type = 'Listing' AND is_deleted = 0`,
                [agentId || 1, finalUserId]
            );
        }

        if (selectedVehicles && selectedVehicles.length > 0) {
            for (const vehicle of selectedVehicles) {
                const vehicleName = `${vehicle.year} ${vehicle.make_name} ${vehicle.model_name}`;
                const vehiclePrice = vehicle.price || null;
                
                // 1. Save to crm_lead_vehicles so it loads in AssignLeadPage
                if (vehicle.id && finalPreferenceId) {
                    await db.query(`
                        INSERT INTO crm_lead_vehicles 
                        (lead_id, listing_id, created_by, modified_by, ip_address)
                        VALUES (?, ?, ?, ?, ?)
                    `, [finalPreferenceId.toString(), vehicle.id, agentId || 1, agentId || 1, ipAddress]);
                }

                // 2. Save to inquiries
                await db.query(`
                    INSERT INTO inquiries 
                    (global_limo_user_id, vehicle_name, price, type, lead_status, created_by, modified_by, ip_address)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    finalUserId, 
                    vehicleName, 
                    vehiclePrice, 
                    'Listing', 
                    leadStatus || 'Intake', 
                    agentId || 1, 
                    agentId || 1, 
                    ipAddress
                ]);
            }
        }

        res.json({ 
            success: true, 
            message: "Lead, products, and vehicle preferences updated successfully!" ,
            preferenceId: finalPreferenceId,   // ✅ also worth returning this —
            userId: finalUserId 
        });
    } catch (error) {
        console.error("Update Preferences Error:", error);
        res.status(500).json({ 
            success: false, 
            message: "Database error while updating." 
        });
    }
};

exports.getAllSystemUsers = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT u.id, u.firstname, u.lastname, u.email, u.company, 
                    pc.phonecode as actual_dial_code, u.cellnumber 
             FROM global_limo_user u 
             LEFT JOIN phone_country_code pc ON u.phone_code = pc.id 
             WHERE u.cellnumber IS NOT NULL AND u.cellnumber != ''
               AND u.group_id = 4 AND u.active = 1 AND u.is_deleted = 0`
        );
        
        const users = rows.map(u => {
            let dialCode = u.actual_dial_code || '1';
            dialCode = dialCode.toString().replace(/\D/g, '');
            const cleanCell = (u.cellnumber || '').toString().replace(/\D/g, '');

            return {
                id: u.id,
                name: `${u.firstname || ''} ${u.lastname || ''}`.trim() || 'Unknown User',
                email: u.email || '',
                company: u.company || '',
                phone: `+${dialCode}${cleanCell}`
            };
        });

        res.json({ success: true, users });
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// GET /users/:id/listings
// Vehicles (listings) that a given user/seller has posted. Used to auto-fill
// the Vehicle panel for "Renew Listing for the Seller" / "$15-featured for
// Buyer" leads. Formatted identically to the inventory search results.
exports.getUserListings = async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }

    const [rows] = await db.query(
      `SELECT DISTINCT
         l.id,
         l.year,
         fl_mileage.feature_value_txt AS mileage,
         l.primary_img,
         l.city,
         l.state,
         mk.name AS make_name,
         md.name AS model_name,
         fl_price.feature_value_txt AS price,
         lt.name AS type_name,
         l.userid AS seller_id,
         u.firstname AS seller_firstname,
         u.lastname AS seller_lastname,
         u.email AS seller_email,
         u.company AS seller_company,
         u.cellnumber AS seller_cellnumber,
         pc.phonecode AS seller_dial_code
       FROM global_limo_listing l
       LEFT JOIN carmake_tbl mk ON l.make = mk.id
       LEFT JOIN carmodal_tbl md ON l.modal = md.id
       LEFT JOIN global_limo_listing_type lt ON l.listing_type = lt.id
       LEFT JOIN global_limo_features f_price ON f_price.slug = 'price'
       LEFT JOIN global_limo_features_to_listing fl_price ON fl_price.listing_id = l.id AND fl_price.feature_id = f_price.id
       LEFT JOIN global_limo_features f_mileage ON f_mileage.slug = 'mileage'
       LEFT JOIN global_limo_features_to_listing fl_mileage ON fl_mileage.listing_id = l.id AND fl_mileage.feature_id = f_mileage.id
       LEFT JOIN global_limo_user u ON l.userid = u.id
       LEFT JOIN phone_country_code pc ON u.phone_code = pc.id
       WHERE l.userid = ? AND l.is_deleted = 0
       ORDER BY l.id DESC`,
      [userId]
    );

    const formattedVehicles = rows.map(v => {
      let seller = null;
      if (v.seller_id) {
        const dialCode = (v.seller_dial_code || '1').toString().replace(/\D/g, '');
        const cleanCell = (v.seller_cellnumber || '').toString().replace(/\D/g, '');
        const firstname = v.seller_firstname || '';
        const lastname = v.seller_lastname || '';
        seller = {
          id: v.seller_id,
          name: `${firstname} ${lastname}`.trim() || null,
          firstname,
          lastname,
          email: v.seller_email || '',
          company: v.seller_company || '',
          phone: cleanCell ? `+${dialCode}${cleanCell}` : ''
        };
      }
      return {
        id: v.id,
        year: v.year,
        make_name: v.make_name || 'Unknown Make',
        model_name: v.model_name || 'Unknown Model',
        mileage: v.mileage ? v.mileage.toString().replace(/,/g, '') : 0,
        price: v.price || 0,
        location: (v.city && v.state) ? `${v.city}, ${v.state}` : (v.state || 'Location N/A'),
        image_url: v.primary_img
          ? (v.primary_img.startsWith('http') ? v.primary_img : `https://developer.globallimos.com/sales/uploads/images/cars/${v.primary_img}`)
          : 'https://via.placeholder.com/250x160?text=No+Image',
        seller
      };
    });

    res.json({ success: true, data: formattedVehicles });
  } catch (error) {
    console.error('Failed to fetch user listings:', error);
    res.status(500).json({ success: false, message: 'Failed to load user listings' });
  }
};

// GET /packages/listings-memberships
exports.getListingsAndMemberships = async (req, res) => {
  try {
    const [listings] = await db.query(
      `SELECT id, name, display_name, org_price, price, short_description, listing_count, sort_order
       FROM sale_products
       WHERE type = 1 AND status = 1 AND is_deleted = 0
       ORDER BY sort_order ASC`
    );
    const [memberships] = await db.query(
      `SELECT id, name, display_name, org_price, price, short_description, sort_order
       FROM sale_products
       WHERE type = 2 AND status = 1 AND is_deleted = 0
       ORDER BY sort_order ASC`
    );
    const [renewals] = await db.query(
      `SELECT id, name, display_name, org_price, price, short_description, sort_order
       FROM sale_products
       WHERE type = 6 AND status = 1 AND is_deleted = 0
       ORDER BY sort_order ASC`
    );
    res.json({ success: true, listings, memberships, renewals });
  } catch (error) {
    console.error('Failed to fetch listings/memberships:', error);
    res.status(500).json({ success: false, message: 'Failed to load listings/memberships' });
  }
};