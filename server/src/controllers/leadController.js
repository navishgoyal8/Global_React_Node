const db = require('../config/db'); // Make sure this path is correct for your DB connection

// POST: Save assigned vehicles to a lead (SMART SYNC)
exports.saveAssignedVehicles = async (req, res) => {
    try {
        const { leadId } = req.params;
        const { vehicleIds } = req.body; // Array of IDs from React, e.g., [2368, 2369]

        const user_id = 1; 
        let ip_address = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
        if (ip_address === '::1') ip_address = '127.0.0.1';
        const now = new Date();

        // 1. Get currently active vehicles for this lead from the database
        const [currentRows] = await db.query(
            `SELECT listing_id FROM crm_lead_vehicles WHERE lead_id = ? AND is_deleted = 0`,
            [leadId]
        );
        const currentIds = currentRows.map(row => row.listing_id);

        const incomingIds = vehicleIds || [];

        // 2. Figure out exactly what changed (The Smart Sync Logic)
        // Cars that are in the DB, but NOT in the new React list -> Delete these
        const idsToDelete = currentIds.filter(id => !incomingIds.includes(id));
        
        // Cars that are in the React list, but NOT in the DB yet -> Insert these
        const idsToInsert = incomingIds.filter(id => !currentIds.includes(id));

        // 3. Perform Soft Deletes ONLY for the vehicles you clicked the red 'X' on
        if (idsToDelete.length > 0) {
            await db.query(
                `UPDATE crm_lead_vehicles 
                 SET is_deleted = 1, modified_on = ?, modified_by = ?, ip_address = ? 
                 WHERE lead_id = ? AND listing_id IN (?) AND is_deleted = 0`,
                [now, user_id, ip_address, leadId, idsToDelete]
            );
        }

        // 4. Perform Inserts ONLY for brand NEW vehicles you attached
        if (idsToInsert.length > 0) {
            const insertValues = idsToInsert.map(listingId => [
                leadId, listingId, 1, 0, now, user_id, now, user_id, ip_address
            ]);
            
            await db.query(
                `INSERT INTO crm_lead_vehicles 
                (lead_id, listing_id, status, is_deleted, created_on, created_by, modified_on, modified_by, ip_address) 
                VALUES ?`, 
                [insertValues]
            );
        }

        res.status(200).json({ success: true, message: "Vehicles synced successfully!" });

    } catch (error) {
        console.error("Error saving vehicles:", error);
        res.status(500).json({ success: false, message: "Failed to assign vehicles" });
    }
};
// GET: Fetch vehicles assigned to a specific lead
exports.getAssignedVehicles = async (req, res) => {
    try {
        const { leadId } = req.params;

        // ✅ Updated SQL: Pulls city/state and joins the mileage feature table
        const sql = `
            SELECT 
                l.id, 
                l.year, 
                fl_mileage.feature_value_txt AS mileage, /* ✅ Fetch mileage from features */
                l.primary_img, 
                l.city,  /* ✅ Added city */
                l.state, /* ✅ Added state */
                mk.name AS make_name, 
                md.name AS model_name,
                fl_price.feature_value_txt AS price
            FROM crm_lead_vehicles cv
            
            /* Join back to the legacy tables to get the car data */
            JOIN global_limo_listing l ON cv.listing_id = l.id
            LEFT JOIN carmake_tbl mk ON l.make = mk.id
            LEFT JOIN carmodal_tbl md ON l.modal = md.id
            
            /* Join for Price */
            LEFT JOIN global_limo_features f_price ON f_price.slug = 'price'
            LEFT JOIN global_limo_features_to_listing fl_price ON fl_price.listing_id = l.id AND fl_price.feature_id = f_price.id
            
            /* ✅ NEW: Join for Mileage */
            LEFT JOIN global_limo_features f_mileage ON f_mileage.slug = 'mileage'
            LEFT JOIN global_limo_features_to_listing fl_mileage ON fl_mileage.listing_id = l.id AND fl_mileage.feature_id = f_mileage.id
            
            WHERE cv.lead_id = ? AND cv.is_deleted = 0 AND cv.status = 1
        `;

        const [vehicles] = await db.query(sql, [leadId]);

        // Format the output exactly like we did in the search modal
        const formattedVehicles = vehicles.map(v => ({
            ...v,
            
            // ✅ Clean up mileage (strip commas so React Math works)
            mileage: v.mileage ? v.mileage.toString().replace(/,/g, '') : 0,
            
            // ✅ Format as "City, State" (e.g., "Ontario, California")
            location: (v.city && v.state) ? `${v.city}, ${v.state}` : (v.state || 'Location N/A'),

            image_url: v.primary_img 
                ? (v.primary_img.startsWith('http') ? v.primary_img : `https://developer.globallimos.com/sales/uploads/images/cars/${v.primary_img}`) 
                : 'https://via.placeholder.com/250x160?text=No+Image'
        }));

        res.status(200).json({ success: true, data: formattedVehicles });

    } catch (error) {
        console.error("Error fetching assigned vehicles:", error);
        res.status(500).json({ success: false, message: "Failed to load vehicles" });
    }
};

// GET: Fetch ALL leads (every row in user_preferences, across every user)
// Used by the standalone Leads list page.
exports.getAllLeads = async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT * FROM user_preferences ORDER BY id DESC`);

        // Several columns (lead_types, listings, memberships, ad_features,
        // selected_products) are stored as JSON text in the DB. Parse them
        // defensively so a malformed/legacy row doesn't crash the whole list.
        const parseJsonSafe = (val, fallback = []) => {
            if (val === null || val === undefined || val === '') return fallback;
            if (typeof val !== 'string') return val;
            try {
                return JSON.parse(val);
            } catch (e) {
                return fallback;
            }
        };

        const formatted = rows.map(row => ({
            ...row,
            lead_types: parseJsonSafe(row.lead_types, []),
            listings: parseJsonSafe(row.listings, []),
            memberships: parseJsonSafe(row.memberships, []),
            ad_features: parseJsonSafe(row.ad_features, []),
            selected_products: parseJsonSafe(row.selected_products, []),
        }));

        res.status(200).json({ success: true, leads: formatted });
    } catch (error) {
        console.error("Error fetching all leads:", error);
        res.status(500).json({ success: false, message: "Failed to fetch leads" });
    }
};

// GET: Fetch custom calling numbers for a lead
exports.getCustomNumbers = async (req, res) => {
    try {
        const { leadId } = req.params;
        // Only fetch numbers that aren't deleted
        const [rows] = await db.query(
            `SELECT phone_number FROM crm_lead_custom_numbers WHERE lead_id = ? AND is_deleted = 0 AND status = 1`, 
            [leadId]
        );
        const numbers = rows.map(row => row.phone_number);
        res.json({ success: true, numbers });
    } catch (error) {
        console.error("Error fetching custom numbers:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// GET: Fetch existing user preferences/inquiries by phone number
exports.getLeadByPhone = async (req, res) => {
  try {
    const { phone } = req.params;
    const shortPhone = phone.replace(/\D/g, '').slice(-10);

    const [userRows] = await db.query(
      `SELECT id, firstname, lastname FROM global_limo_user 
       WHERE cellnumber LIKE CONCAT('%', ?, '%') LIMIT 1`,
      [shortPhone]
    );

    if (userRows.length === 0) {
      return res.json({ success: true, data: null });
    }

    const user = userRows[0];

    const [prefRows] = await db.query(
      `SELECT id, lead_types, listings, memberships, ad_package, ad_features, 
              service_type, lead_status, selected_products,
              discount_amount, tax_amount, shipping_cost, total_override, seat_covers_override,
              created_on 
       FROM user_preferences 
       WHERE user_id = ? AND is_deleted = 0
       ORDER BY created_on DESC`,
      [user.id]
    );

    const parseJsonSafe = (val, fallback = []) => {
      if (val === null || val === undefined || val === '') return fallback;
      if (typeof val !== 'string') return val;
      try { return JSON.parse(val); } catch (e) { return fallback; }
    };

    const inquiries = prefRows.map(row => {
      const parsedListings = parseJsonSafe(row.listings);
      const parsedMemberships = parseJsonSafe(row.memberships);
      const parsedLeadTypes = parseJsonSafe(row.lead_types);
      const parsedAdFeatures = parseJsonSafe(row.ad_features);
      return {
        id: row.id,
        date: new Date(row.created_on).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        price: parsedListings[0] || parsedMemberships[0] || 'Custom',
        type: parsedLeadTypes[0] || 'Inquiry',
        status: row.lead_status || 'Intake',
        color: 'green',
        leadTypes: parsedLeadTypes,
        listings: parsedListings,
        memberships: parsedMemberships,
        adPackage: row.ad_package || '',
        adFeatures: parsedAdFeatures,
        serviceType: row.service_type || 'SMS',
        selectedProducts: row.selected_products || null,
        discountAmount: row.discount_amount || 0,
        taxAmount: row.tax_amount || 0,
        shippingCost: row.shipping_cost || 0,
        totalOverride: row.total_override ?? null,
        seatCoversOverride: row.seat_covers_override ?? null,
      };
    });

    const newest = prefRows[0] || null;
    const preferences = newest ? {
      lead_types: parseJsonSafe(newest.lead_types),
      listings: parseJsonSafe(newest.listings),
      memberships: parseJsonSafe(newest.memberships),
      ad_package: newest.ad_package || '',
      ad_features: parseJsonSafe(newest.ad_features),
      service_type: newest.service_type || 'SMS',
      lead_status: newest.lead_status || '',
    } : null;

    res.json({
      success: true,
      data: {
        userId: user.id,
        userName: `${user.firstname || ''} ${user.lastname || ''}`.trim(),
        preferenceId: newest ? newest.id : null,
        preferences,
        inquiries,
      }
    });
  } catch (error) {
    console.error("Error fetching lead by phone:", error);
    res.status(500).json({ success: false, message: "Failed to fetch lead" });
  }
};

// GET: Fetch check availability leads (replicating admin Leads.php query)
exports.getCheckAvailabilityLeads = async (req, res) => {
  try {
    const sql = `
      SELECT leads.id as lead_id, leads.name, leads.email, leads.zipcode, leads.phone, 
             leads.created_on, leads.listing_id, leads.notes,
             global_limo_listing.name as vehicle, global_limo_listing.slug, 
             global_limo_listing.expiry_date,
             global_limo_listing_type.name as category,
             global_limo_listing.userid as user_id,
             global_limo_user.firstname, global_limo_user.lastname,
             global_limo_user.acceptance,
             leads.lead_status,
             SUBSTRING_INDEX(GROUP_CONCAT(f.created_on ORDER BY f.id DESC),',',1) as last_followup_date,
             COALESCE(
               SUBSTRING_INDEX(GROUP_CONCAT(lr.created_on ORDER BY lr.id DESC SEPARATOR '@'),'@',1),
               global_limo_listing.created_on
             ) as last_active_date
      FROM leads
      INNER JOIN global_limo_listing ON leads.listing_id = global_limo_listing.id
      INNER JOIN global_limo_listing_type ON global_limo_listing.listing_type = global_limo_listing_type.id
      INNER JOIN global_limo_user ON global_limo_listing.userid = global_limo_user.id
      LEFT JOIN leads_followup f ON f.lead_id = leads.id
      LEFT JOIN listing_renews lr ON lr.listing_id = global_limo_listing.id
      WHERE type = 1
      GROUP BY leads.id
      ORDER BY leads.id DESC
    `;
    const [leads] = await db.query(sql);

    const parseJsonSafe = (val, fallback = []) => {
      if (val === null || val === undefined || val === '') return fallback;
      if (typeof val !== 'string') return val;
      try { return JSON.parse(val); } catch (e) { return fallback; }
    };

    const phoneToPrefs = {};
    // Many leads share a phone number, and this lookup is a full scan of
    // global_limo_user because cellnumber LIKE '%..%' cannot use an index. Memoize
    // per short number so each distinct phone costs one query instead of one per
    // lead. Same statement, same parameters, so results are unchanged.
    const userIdByPhone = {};
    const findUserId = async (shortPhone) => {
      if (Object.prototype.hasOwnProperty.call(userIdByPhone, shortPhone)) {
        return userIdByPhone[shortPhone];
      }
      let found = null;
      try {
        const [userRows] = await db.query(
          `SELECT id FROM global_limo_user WHERE cellnumber LIKE CONCAT('%', ?, '%') LIMIT 1`,
          [shortPhone]
        );
        if (userRows.length > 0) found = userRows[0].id;
      } catch (e) {
        found = null;
      }
      userIdByPhone[shortPhone] = found;
      return found;
    };

    for (const lead of leads) {
      const phone = lead.phone && lead.phone !== 'undefined' ? lead.phone : '';
      if (!phone) continue;
      const shortPhone = phone.replace(/\D/g, '').slice(-10);
      try {
        const userId = await findUserId(shortPhone);
        if (userId) {
          const [prefRows] = await db.query(
            `SELECT id, lead_types, listings, memberships, ad_package, ad_features,
                    service_type, lead_status, selected_products,
                    discount_amount, tax_amount, shipping_cost, total_override, seat_covers_override,
                    created_on
             FROM user_preferences
             WHERE user_id = ? AND is_deleted = 0
             ORDER BY created_on DESC`,
            [userId]
          );
          if (prefRows.length > 0) {
            const inquiries = prefRows.map(row => {
              const parsedListings = parseJsonSafe(row.listings);
              const parsedMemberships = parseJsonSafe(row.memberships);
              const parsedLeadTypes = parseJsonSafe(row.lead_types);
              return {
                id: row.id,
                date: new Date(row.created_on).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                price: parsedListings[0] || parsedMemberships[0] || 'Custom',
                type: parsedLeadTypes[0] || 'Inquiry',
                status: row.lead_status || 'Intake',
                color: 'green',
                leadTypes: parsedLeadTypes,
                listings: parsedListings,
                memberships: parsedMemberships,
              };
            });
            const newest = prefRows[0];
            phoneToPrefs[shortPhone] = {
              userId,
              inquiries,
              preferences: {
                lead_types: parseJsonSafe(newest.lead_types),
                listings: parseJsonSafe(newest.listings),
                memberships: parseJsonSafe(newest.memberships),
                ad_package: newest.ad_package || '',
                ad_features: parseJsonSafe(newest.ad_features),
                service_type: newest.service_type || 'SMS',
                lead_status: newest.lead_status || '',
              },
              preferenceId: newest.id,
            };
          }
        }
      } catch (e) {
        // skip if no user/prefs found
      }
    }

    const enrichedLeads = leads.map(lead => {
      const shortPhone = lead.phone && lead.phone !== 'undefined' ? lead.phone.replace(/\D/g, '').slice(-10) : '';
      const prefs = phoneToPrefs[shortPhone] || null;
      return {
        ...lead,
        pastInquiries: prefs ? prefs.inquiries : [],
        userPreferences: prefs ? prefs.preferences : null,
        preferenceUserId: prefs ? prefs.userId : null,
        preferenceId: prefs ? prefs.preferenceId : null,
      };
    });

    res.status(200).json({ success: true, data: enrichedLeads });
  } catch (error) {
    console.error("Error fetching check availability leads:", error);
    res.status(500).json({ success: false, message: "Failed to fetch leads" });
  }
};

// POST: Add a new custom calling number for a lead
exports.addCustomNumber = async (req, res) => {
    try {
        const { leadId } = req.params;
        const { phoneNumber } = req.body;

        // Setup Audit Fields
        const user_id = 1; // Assuming agent ID is 1
        let ip_address = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
        if (ip_address === '::1') ip_address = '127.0.0.1';
        const now = new Date();

        // Make sure it doesn't already exist to prevent duplicates
        const [existing] = await db.query(
            `SELECT id FROM crm_lead_custom_numbers WHERE lead_id = ? AND phone_number = ? AND is_deleted = 0`,
            [leadId, phoneNumber]
        );

        if (existing.length === 0) {
            await db.query(
                `INSERT INTO crm_lead_custom_numbers 
                (lead_id, phone_number, status, is_deleted, created_on, created_by, modified_on, modified_by, ip_address) 
                VALUES (?, ?, 1, 0, ?, ?, ?, ?, ?)`,
                [leadId, phoneNumber, now, user_id, now, user_id, ip_address]
            );
        }

        res.json({ success: true });
    } catch (error) {
        console.error("Error saving custom number:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};