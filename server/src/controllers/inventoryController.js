const db = require('../config/db');

exports.getSearchFilters = async (req, res) => {
    try {
        const [makes] = await db.query('SELECT id, name FROM carmake_tbl WHERE status = 1');
        
        // Also ensured we only pull locations for active, non-deleted listings
        const [locations] = await db.query('SELECT DISTINCT state FROM global_limo_listing WHERE state IS NOT NULL AND state != "" AND is_deleted = 0 ORDER BY state ASC');
        
        const [types] = await db.query(`
            SELECT id, name 
            FROM global_limo_listing_type 
            WHERE status = 1 
            ORDER BY name ASC
        `);

        // ✅ FIX 1: Inner Join to the listing table to ensure we ONLY show Builders that have active, non-deleted vehicles
        const [builders] = await db.query(`
            SELECT DISTINCT TRIM(fl.feature_value_txt) AS name 
            FROM global_limo_features_to_listing fl
            INNER JOIN global_limo_listing l ON fl.listing_id = l.id
            WHERE fl.feature_id = 6 
              AND fl.feature_value_txt IS NOT NULL 
              AND TRIM(fl.feature_value_txt) != ''
              AND l.is_deleted = 0
            ORDER BY name ASC
        `);

        res.status(200).json({
            success: true,
            makes: makes,
            locations: locations.map(l => l.state), 
            vehicleTypes: types,
            builders: builders 
        });
    } catch (error) {
        console.error("Error fetching filters:", error);
        res.status(500).json({ success: false });
    }
};

exports.getFilteredVehicles = async (req, res) => {
    try {
        const { vehicleType, builder, make, location, minYear, maxYear, minPrice, maxPrice, searchTerm } = req.query;

        let sql = `
            SELECT DISTINCT
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

            LEFT JOIN global_limo_features_to_listing fl_builder ON fl_builder.listing_id = l.id AND fl_builder.feature_id = 6
            LEFT JOIN global_limo_user u ON l.userid = u.id
            LEFT JOIN phone_country_code pc ON u.phone_code = pc.id
            WHERE l.is_deleted = 0 
        `;
        
        const values = [];

        if (vehicleType && vehicleType !== '') {
            sql += ` AND lt.name = ?`; 
            values.push(vehicleType);
        }
        
        // ✅ FIX 2: Replaced the loose 'LIKE' search with an Exact Match using TRIM() to perfectly match the frontend dropdown
        if (builder && builder !== '') {
            sql += ` AND TRIM(fl_builder.feature_value_txt) = ?`; 
            values.push(builder.trim());
        }
        
        if (make && make !== '') {
            sql += ` AND mk.id = ?`; 
            values.push(make);
        }
        if (location && location !== '') {
            sql += ` AND l.state = ?`;
            values.push(location);
        }
        
        if (minYear && minYear !== '') {
            sql += ` AND l.year >= ?`;
            values.push(parseInt(minYear));
        }
        if (maxYear && maxYear !== '') {
            sql += ` AND l.year <= ?`;
            values.push(parseInt(maxYear));
        }
        if (minPrice && minPrice !== '') {
            sql += ` AND CAST(REPLACE(REPLACE(fl_price.feature_value_txt, ',', ''), '$', '') AS DECIMAL(10,2)) >= ?`;
            values.push(parseFloat(minPrice));
        }
        if (maxPrice && maxPrice !== '') {
            sql += ` AND CAST(REPLACE(REPLACE(fl_price.feature_value_txt, ',', ''), '$', '') AS DECIMAL(10,2)) <= ?`;
            values.push(parseFloat(maxPrice));
        }
        if (searchTerm && searchTerm !== '') {
            sql += ` AND (mk.name LIKE ? OR md.name LIKE ? OR l.year LIKE ?)`;
            const searchPattern = `%${searchTerm}%`;
            values.push(searchPattern, searchPattern, searchPattern);
        }

        sql += ` ORDER BY l.id DESC`;

        const [vehicles] = await db.query(sql, values);

        const formattedVehicles = vehicles.map(v => {
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

        res.status(200).json({ success: true, data: formattedVehicles });

    } catch (error) {
        console.error("Error fetching filtered vehicles:", error);
        res.status(500).json({ success: false, message: "Database error fetching vehicles" });
    }
};