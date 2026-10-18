const db = require('../config/db');

exports.getAllProducts = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const [rows] = await connection.query(`
      SELECT 
        p.*, 
        sp.name AS pattern_name, 
        sc.name AS color_name,
        pc.name AS category_name,
        pm.name AS manufacturer_name,
        asub.name AS subcategory_name,
        ab.name   AS brand_name,
        am.name   AS material_name,
        asu.name  AS supplier_name,
        pf.id AS fitment_id,
        pf.make_id AS fitment_make_id,
        pf.model_id AS fitment_model_id,
        pf.year_start AS fitment_year_start,
        pf.year_end AS fitment_year_end,
        pf.builder_name AS fitment_builder_name,
        cmk.name AS fitment_make_name,
        cm.name AS fitment_model_name,
        ppa.id AS pa_id,
        ppa.label AS pa_label,
        ppa.view AS pa_view,
        ppa.x AS pa_x,
        ppa.y AS pa_y,
        ppa.w AS pa_w,
        ppa.h AS pa_h,
        ppa.extra_fee AS pa_extra_fee,
        ppa.image AS pa_image
      FROM products p
      LEFT JOIN stitching_pattern sp ON p.stitching_pattern = sp.id
      LEFT JOIN stitching_color sc ON p.stitching_color = sc.id
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      LEFT JOIN product_manufectures pm ON p.made_by = pm.id
      LEFT JOIN apparel_subcategories asub ON p.subcategory1 = asub.id
      LEFT JOIN apparel_brands ab ON p.brand = ab.id
      LEFT JOIN apparel_materials am ON p.material = am.id
      LEFT JOIN apparel_suppliers asu ON p.supplier_id = asu.id
      LEFT JOIN product_fitments pf ON pf.product_id = p.id
      LEFT JOIN carmake_tbl cmk ON cmk.id = pf.make_id
      LEFT JOIN carmodal_tbl cm ON cm.id = pf.model_id
      LEFT JOIN product_print_areas ppa ON ppa.product_id = p.id
      WHERE p.status = 1 AND p.is_deleted = 0
    `);

    const productsMap = new Map();
        // colors + per-size stock, read live from product_colors / product_variants
    const ids = Array.from(productsMap.keys());
    if (ids.length) {
      const [colorRows] = await connection.query(
        `SELECT id, product_id, name, hex, front_image, back_image
         FROM product_colors WHERE product_id IN (?) ORDER BY sort_order, id`, [ids]);
      const [variantRows] = await connection.query(
        `SELECT product_id, color_id, size, qty
         FROM product_variants WHERE product_id IN (?)`, [ids]);

      const stockByColor = {};
      for (const v of variantRows) {
        (stockByColor[v.color_id] = stockByColor[v.color_id] || {})[v.size] = Number(v.qty);
      }
      const colorsByProduct = {};
      for (const c of colorRows) {
        (colorsByProduct[c.product_id] = colorsByProduct[c.product_id] || []).push({
          name: c.name, hex: c.hex,
          front_image: c.front_image, back_image: c.back_image,
          stock: stockByColor[c.id] || {},
        });
      }
      for (const [pid, product] of productsMap) {
        // a JSON string, because ApparelSection's firstColor() does JSON.parse(String(...))
        if (colorsByProduct[pid]) product.colors = JSON.stringify(colorsByProduct[pid]);
      }
    }
    for (const row of rows) {
      if (!productsMap.has(row.id)) {
        const {
          fitment_id, fitment_make_id, fitment_model_id,
          fitment_year_start, fitment_year_end, fitment_builder_name,
          fitment_make_name, fitment_model_name,
          pa_id, pa_label, pa_view, pa_x, pa_y, pa_w, pa_h, pa_extra_fee, pa_image,
          ...productFields
        } = row;
        
        productFields.fitments = [];
        productFields.print_areas = []; // Initialize empty array
        productsMap.set(row.id, productFields);
      }
      
      const product = productsMap.get(row.id);

      // 1. Push Fitments (prevent duplicates)
      if (row.fitment_id && !product.fitments.some(f => f.id === row.fitment_id)) {
        product.fitments.push({
          id: row.fitment_id,
          make_id: row.fitment_make_id,
          make_name: row.fitment_make_name,
          model_id: row.fitment_model_id,
          model_name: row.fitment_model_name,
          year_start: row.fitment_year_start,
          year_end: row.fitment_year_end,
          builder_name: row.fitment_builder_name
        });
      }

      // 2. Push Print Areas (prevent duplicates)
      if (row.pa_id && !product.print_areas.some(pa => pa.id === row.pa_id)) {
        product.print_areas.push({
          id: row.pa_id,
          label: row.pa_label,
          view: row.pa_view,
          x: row.pa_x,
          y: row.pa_y,
          w: row.pa_w,
          h: row.pa_h,
          extra_fee: row.pa_extra_fee,
          image: row.pa_image
        });
      }
    }

    res.json({ success: true, data: Array.from(productsMap.values()) });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ success: false, message: "Failed to fetch products" });
  } finally {
    connection.release()
  }
};

exports.getStoreFilters = async (req, res) => {
  const connection = await db.getConnection();
  try {
      const [makes]      = await connection.query('SELECT id, name FROM carmake_tbl WHERE status = 1');
      const [models]     = await connection.query('SELECT id, makeid, name FROM carmodal_tbl WHERE status = 1');
      // CHANGED: was global_limo_listing_type — now matches the table products.category_id actually points to
      const [categories] = await connection.query('SELECT id, name FROM product_categories WHERE status = 1 AND is_deleted = 0');
      // CHANGED: was hardcoded [] — now sourced from the manufacturer table used as "Builder" in the storefront
      const [builders] = await connection.query(`
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
          makes, 
          models, 
          categories, 
          builders 
      });
  } catch (error) {
      console.error("Filter Fetch Error:", error);
      res.status(500).json({ success: false, message: "Failed to load filters" });
  } finally {
      connection.release();
  }
};

// GET /products/:id/variants
exports.getProductVariants = async (req, res) => {
  try {
    const { id } = req.params;
    const [variants] = await db.query(
      `SELECT id, sku, leather_color, stitch_color, pattern, qty
       FROM inventory
       WHERE product_id = ? AND is_deleted = 0 AND status = 1
       ORDER BY leather_color, stitch_color, pattern`,
      [id]
    );
    res.json({ success: true, variants });
  } catch (error) {
    console.error('Failed to fetch product variants:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.getProductById = async (req, res) => {
  req.query.__id = req.params.id;
  // call the same logic as getAllProducts, then pick the one product
  const fakeRes = {
    json: (payload) => {
      const item = (payload.data || []).find(p => String(p.id) === String(req.params.id));
      if (!item) return res.status(404).json({ success: false, message: 'Not found' });
      res.json({ success: true, data: item });
    },
    status: (code) => res.status(code),
  };
  return exports.getAllProducts(req, fakeRes);
};