// server/src/controllers/orderController.js
const db = require('../config/db');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const SHARED_SECRET = 'GlobalLimosSeatCoversSecret12345';

// Helper function to map frontend strings into your PHP Database Codes
const mapVariantCode = (val, type) => {
  if (!val) return '';
  const str = val.toLowerCase().trim();
  if (type === 'color') {
    const map = { 'black': 'BLK', 'grey': 'GRY', 'brown': 'BRN', 'beige': 'BEI', 'white': 'WHT', 'red': 'RED', 'navy': 'NVY', 'blue': 'BLU', 'gold': 'GLD', 'silver': 'SLV' };
    return map[str] || val;
  }
  if (type === 'pattern') {
    const map = { 'diamond': 'DIA', 'hexagon': 'HEX', 'v': 'V', 'plain': 'PLN', 'quilted': 'QLT' };
    return map[str] || val;
  }
  return val;
};

const fs = require('fs');
const path = require('path');

const APPAREL_UPLOAD_DIR = path.join(__dirname, '../../uploads/apparel');

// Base64 data URL -> file on disk, returns the public path.
// Normal URLs are returned as-is. SVG is intentionally not accepted (XSS risk when served).
const persistLogo = (logoUrl) => {
  if (!logoUrl) return null;
  const m = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/.exec(logoUrl);
  if (!m) {
    if (logoUrl.startsWith('data:')) throw new Error('Unsupported logo file type. Use PNG, JPG or WEBP.');
    return String(logoUrl).slice(0, 500);
  }
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  fs.mkdirSync(APPAREL_UPLOAD_DIR, { recursive: true });
  const fileName = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(APPAREL_UPLOAD_DIR, fileName), Buffer.from(m[2], 'base64'));
  return `/uploads/apparel/${fileName}`;
};

// Inserts the apparel detail row + one row per size. Runs inside the checkout transaction.
const insertApparelDetails = async (connection, { orderId, orderItemId, productId, item }) => {
  const cfg = item.apparel || {};

  const sizes = Object.entries(cfg.sizes || {})
    .map(([s, q]) => [String(s).trim().slice(0, 10), parseInt(q, 10) || 0])
    .filter(([s, q]) => s && q > 0);

  const totalPieces = sizes.reduce((t, [, q]) => t + q, 0);
  if (totalPieces === 0) throw new Error('Custom apparel must have at least one piece in a size.');

  const logoPath = persistLogo(cfg.logoUrl);
  const designJson = JSON.stringify({
    design: cfg.design || null,
    area: cfg.area || null,
    bgImage: cfg.bgImage || item.image || null
  }); // editState is intentionally not stored

  const [apparelResult] = await connection.query(
    `INSERT INTO order_item_apparel
     (order_id, order_item_id, product_id, color, decoration, placement, total_pieces,
      notes, design_json, logo_url, production_status, created_on)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW())`,
    [
      orderId, orderItemId, productId,
      String(cfg.color || 'Standard').slice(0, 50),
      String(cfg.decoration || '').slice(0, 50),
      String(cfg.placement || '').slice(0, 50),
      totalPieces,
      cfg.notes || null,
      designJson,
      logoPath
    ]
  );

  await connection.query(
    'INSERT INTO order_item_apparel_sizes (apparel_id, size, qty) VALUES ?',
    [sizes.map(([size, qty]) => [apparelResult.insertId, size, qty])]
  );
};

// =========================================================================
// PUBLIC CHECKOUT (STOREFRONT ROUTE)
// =========================================================================
exports.processCheckout = async (req, res) => {
  const { cart, paymentMethod, customerData } = req.body;
  // console.log("cart",cart)
  const ip_address = req.ip || req.connection.remoteAddress || '127.0.0.1';

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // ==========================================
    // 1. RESOLVE ACCOUNT
    // ==========================================
    let userId = null;
    if (customerData && customerData.email) {
      const [existingUsers] = await connection.query('SELECT id FROM global_limo_user WHERE email = ?', [customerData.email]);
      if (existingUsers.length > 0) {
        userId = existingUsers[0].id;
      } else {
        const generatedPassword = crypto.randomBytes(4).toString('hex');
        const hashedPassword = await bcrypt.hash(generatedPassword, 10);

        // FIXED: Added username (copies email) and set password_status = 1
        const [newUser] = await connection.query(
          `INSERT INTO global_limo_user 
          (firstname, lastname, email, username, cellnumber, address, password, group_id, lang_id, created_on, password_status, active, is_verified, acceptance) 
          VALUES (?, ?, ?, ?, ?, ?, ?, 4, 1, NOW(), 1, 1, 1, 1)`,
          [
            customerData.firstName || '',
            customerData.lastName || '',
            customerData.email,
            customerData.email, // Assign email to the username column
            customerData.phone || '',
            customerData.address || '',
            hashedPassword
          ]
        );
        userId = newUser.insertId;
      }
    }
    if (!userId) throw new Error("Could not resolve or create user account. Email is required.");

    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(SHARED_SECRET, 'utf8');
    const iv = crypto.randomBytes(16);
    const payload = `${userId}|${Date.now()}`;
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(payload, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const loginToken = `${iv.toString('hex')}:${encrypted}`;

    const orderReference = `ORD-${Date.now()}`;
    let physicalSubtotal = 0;
    let digitalSubtotal = 0;
    let totalPhysicalItems = 0;
    const physicalItems = [];
    const digitalItems = [];

    // ==========================================
    // 2. QUERY REAL DB PRODUCTS
    // ==========================================
    for (let item of cart) {
      const isDigital = (item.type === 'M' || item.type === 'L');
      if (isDigital) {
        const saleType = item.type === 'M' ? 2 : 1;
        const [saleProducts] = await connection.query(
          'SELECT id, display_name, price, listing_count, type FROM sale_products WHERE type = ? ORDER BY ABS(price - ?) ASC LIMIT 1',
          [saleType, item.price]
        );
        if (saleProducts.length > 0) {
          const product = saleProducts[0];
          digitalSubtotal += (parseFloat(product.price || 0) * item.qty);
          digitalItems.push({
            ...item,
            productId: product.id,
            dbName: product.display_name,
            actualPrice: parseFloat(product.price || 0),
            listingCount: product.listing_count || 0
          });
        }
      } else {
        const productId = item.isCustomApparel
          ? String(item.apparel?.productId || '').replace(/[^0-9]/g, '')
          : item.id.toString().replace(/[^0-9]/g, '');
        const [productRows] = await connection.query('SELECT id, display_name, name, qty, dp, ndr, category_id FROM products WHERE id = ? FOR UPDATE', [productId]);
       
        if (productRows.length === 0) {
           throw new Error(`Product not found for cart item "${item.id}" (looked up id "${productId}")`);
        }
       
          const product = productRows[0];
          // Custom apparel (tee configurator) keeps its own price and bundle qty;
          // it is not repriced from the seat-cover dp/ndr columns.
          const isApparel = !!item.isCustomApparel;
          const actualPrice = isApparel
            ? parseFloat(item.price || 0)
            : parseFloat(product.dp > 0 ? product.dp : (product.ndr || 0));
          physicalSubtotal += (actualPrice * item.qty);
          totalPhysicalItems += item.qty;
          physicalItems.push({
            ...item,
            productId: product.id,
            dbName: product.display_name || product.name,
            actualPrice: actualPrice,
            isCustomApparel: isApparel,
            stockAfter: isApparel ? null : product.qty - item.qty,
            categoryId: product.category_id || 0
          });
        }
      }
    
    if (physicalItems.length === 0 && digitalItems.length === 0) {
      throw new Error('No valid items found in cart.'); 
    }

    // Shipping Math
    let shipping = 0;
    if (totalPhysicalItems === 1) shipping = 60;
    else if (totalPhysicalItems === 2) shipping = 80;
    else if (totalPhysicalItems === 3) shipping = 120;
    else if (totalPhysicalItems === 4) shipping = 150;
    else if (totalPhysicalItems === 5) shipping = 180;
    else if (totalPhysicalItems === 6) shipping = 190;
    else if (totalPhysicalItems === 7) shipping = 200;
    else if (totalPhysicalItems >= 8) shipping = totalPhysicalItems * 29;

    const tax = physicalSubtotal * 0.08;
    const physicalOrderTotal = physicalSubtotal + tax + shipping;
    const trueOrderTotal = physicalSubtotal + digitalSubtotal;

    // ==========================================
    // 3. ACTIVATE MEMBERSHIPS & LISTINGS 
    // ==========================================
    for (let dItem of digitalItems) {
      const saleType = dItem.type === 'M' ? 2 : 1;
      const [saleOrderResult] = await connection.query(`
        INSERT INTO sale_order (user_id, type, firstname, lastname, email, cellnumber, total, payment_status, status, is_deleted, created_on, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 0, NOW(), ?)
      `, [userId, saleType, customerData.firstName || '', customerData.lastName || '', customerData.email || '', customerData.phone || '', dItem.actualPrice, userId]);

      const saleOrderId = saleOrderResult.insertId;

      await connection.query(`
        INSERT INTO sale_order_product (order_id, product_id, name, display_name, listing_count, price, created_on) 
        VALUES (?, ?, ?, ?, ?, ?, NOW())
      `, [saleOrderId, dItem.productId, dItem.dbName, dItem.dbName, dItem.listingCount, dItem.actualPrice]);

      if (dItem.type === 'M') {
        const [subResult] = await connection.query(`
          INSERT INTO user_subscription_package (user_id, order_id, product_id, amount, base_total, start_date, end_date, status, is_deleted, created_on) 
          VALUES (?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR), 1, 0, NOW())
        `, [userId, saleOrderId, dItem.productId, dItem.actualPrice, dItem.actualPrice]);

        await connection.query(`
          INSERT INTO user_subscription_payments (subscription_id, amount, status, payment_status, is_deleted, created_on) 
          VALUES (?, ?, 1, 1, 0, NOW())
        `, [subResult.insertId, dItem.actualPrice]);
      } else if (dItem.type === 'L') {
        await connection.query(`
          INSERT INTO user_subscription_package (user_id, order_id, product_id, amount, base_total, start_date, status, is_deleted, created_on) 
          VALUES (?, ?, ?, ?, ?, NOW(), 1, 0, NOW())
        `, [userId, saleOrderId, dItem.productId, dItem.actualPrice, dItem.actualPrice]);
      }
    }

    // ==========================================
    // 4. PROCESS PHYSICAL SEAT COVERS
    // ==========================================
    if (physicalItems.length > 0) {
      const busDetail = physicalItems.map(item => {
        if (item.isCustomApparel) {
          const cfg = item.apparel || {};
          const sizes = Object.entries(cfg.sizes || {})
            .filter(([, q]) => Number(q) > 0)
            .map(([s, q]) => `${s} x${q}`)
            .join(', ');
          const bits = ['Custom', cfg.color, cfg.decoration, item.qty === 1 && sizes].filter(Boolean);
          return `${item.dbName} x${item.qty} (${bits.join(' · ')})`;
        }
        return `${item.dbName} x${item.qty} (${item.selectedColor || 'Standard'} - ${item.selectedPattern || 'Standard'})`;
      }).join(' | ');

      const [orderResult] = await connection.query(
        `INSERT INTO orders 
        (user_id, type, business_name, firstname, lastname, email, phone_code, cellnumber, alt_phone,
         bus_detail, bus_detail_2, broker, city_id, state_id, country_id, city, state, country, 
         address, zipcode, order_city, order_state, order_country, order_zipcode, order_address, 
         total_price, order_amount, payment_status, paid_amount, order_from, website_id, orders_status, status, is_deleted, created_on, created_by, modified_on) 
        VALUES (?, 1, '', ?, ?, ?, 0, ?, 0, ?, ?, '', 0, 0, 0, ?, ?, '', ?, ?, ?, ?, '', ?, ?, ?, ?, 1, ?, 'website', 1, 1, 1, 0, NOW(), ?, NOW())`,
        [
          userId, customerData.firstName || '', customerData.lastName || '', customerData.email, customerData.phone || '',
          busDetail, busDetail, customerData.city || '', customerData.state || '', customerData.address || '', customerData.zip || '',
          customerData.city || '', customerData.state || '', customerData.zip || '', customerData.address || '',
          physicalSubtotal.toString(), physicalOrderTotal, physicalOrderTotal, userId
        ]
      );

      const physicalOrderId = orderResult.insertId;
      await connection.query(
  `UPDATE orders SET tax_amount = ?, shipping_amount = ?, discount_amount = 0 WHERE id = ?`,
  [tax, shipping, physicalOrderId]
);

      for (let item of physicalItems) {
        const totalValue = item.actualPrice * item.qty;

        let lColor, sColor, patternCode, description;
        if (item.isCustomApparel) {
          const cfg = item.apparel || {};
          // Short readable summary only; the full detail lives in order_item_apparel
          description = `Custom · ${cfg.color || 'Standard'} · ${cfg.decoration || 'Decoration'} · ${cfg.placement || ''}`.slice(0, 250);
          lColor = String(cfg.color || 'Standard').toLowerCase();
          sColor = String(cfg.decoration || '').toLowerCase();
          patternCode = String(cfg.placement || '').toLowerCase();
        } else {
          description = `${item.selectedColor || 'Standard'} - ${item.selectedPattern || 'Standard'}`;
          lColor = mapVariantCode(item.selectedColor, 'color');
          sColor = mapVariantCode(item.selectedStitching, 'color');
          patternCode = mapVariantCode(item.selectedPattern, 'pattern');
        }

        const [itemResult] = await connection.query(
          `INSERT INTO order_items 
    (order_id, category, product, leather_color, stitch_color, pattern, description, ndr, discount, disc_price, qty, total_price, created_at) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, NOW())`,
          [
            physicalOrderId, item.categoryId, item.productId,
            lColor, sColor, patternCode, description,
            Math.round(item.actualPrice), Math.round(item.actualPrice),
            item.qty, Math.round(totalValue)
          ]
        );

        if (item.isCustomApparel) {
          await insertApparelDetails(connection, {
            orderId: physicalOrderId,
            orderItemId: itemResult.insertId,
            productId: item.productId,
            item
          });
        } else {
          await connection.query(`UPDATE products SET qty = ?, modified_on = NOW() WHERE id = ?`, [item.stockAfter, item.productId]);
        }
      }
    }

    await connection.commit();
    res.status(200).json({ success: true, message: "Order processed successfully", orderId: orderReference, autoLoginToken: loginToken });

  } catch (error) {
    await connection.rollback();
    console.error("Checkout Error:", error);
    res.status(400).json({ success: false, message: error.message });
  } finally {
    connection.release();
  }
};

// =========================================================================
// CHARGE INVOICE (CRM ADMIN ROUTE)
// =========================================================================
exports.chargeInvoice = async (req, res) => {
  const { invoiceId, invoiceNumber, userId: reqUserId, customerData, cart, subtotal, discountAmount, shippingCost, totalDue, amountPaid, paymentType } = req.body;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // ==========================================
    // 1. RESOLVE ACCOUNT (STRICT EMAIL MATCHING)
    // ==========================================
    let userId = null;

    if (customerData && customerData.email) {
      const [existingUsers] = await connection.query('SELECT id FROM global_limo_user WHERE email = ?', [customerData.email]);

      if (existingUsers.length > 0) {
        userId = existingUsers[0].id;
      } else {
        const generatedPassword = crypto.randomBytes(4).toString('hex');
        const hashedPassword = await bcrypt.hash(generatedPassword, 10);

        // FIXED: Added username (copies email) and set password_status = 1
        const [newUser] = await connection.query(
          `INSERT INTO global_limo_user 
          (firstname, lastname, email, username, cellnumber, address, password, group_id, lang_id, created_on, password_status, active, is_verified, acceptance) 
          VALUES (?, ?, ?, ?, ?, ?, ?, 4, 1, NOW(), 1, 1, 1, 1)`,
          [
            customerData.firstName || '',
            customerData.lastName || '',
            customerData.email,
            customerData.email, // Assign email to the username column
            customerData.phone || '',
            customerData.address || '',
            hashedPassword
          ]
        );
        userId = newUser.insertId;
      }
    }

    if (!userId) userId = reqUserId;
    if (!userId) throw new Error("Could not resolve or create user account for this invoice.");

    const physicalItems = [];
    const digitalItems = [];

    for (let item of cart) {
      const isDigital = (item.type === 'M' || item.type === 'L');
      if (isDigital) {
        const saleType = item.type === 'M' ? 2 : 1;
        const [saleProducts] = await connection.query(
          'SELECT id, display_name, price, listing_count, type FROM sale_products WHERE type = ? ORDER BY ABS(price - ?) ASC LIMIT 1',
          [saleType, item.price]
        );
        if (saleProducts.length > 0) {
          const product = saleProducts[0];
          digitalItems.push({
            ...item,
            productId: product.id,
            dbName: product.display_name,
            actualPrice: parseFloat(product.price || 0),
            listingCount: product.listing_count || 0
          });
        }
      } else {
        const productId = item.id.toString().replace(/[^0-9]/g, '');
        const [productRows] = await connection.query('SELECT id, display_name, name, qty, dp, ndr, category_id FROM products WHERE id = ? FOR UPDATE', [productId]);
        if (productRows.length > 0) {
          const product = productRows[0];
          physicalItems.push({
            ...item,
            productId: product.id,
            dbName: product.display_name || product.name,
            actualPrice: parseFloat(product.dp > 0 ? product.dp : (product.ndr || 0)),
            stockAfter: product.qty - (item.quantity || item.qty || 1),
            categoryId: product.category_id || 0
          });
        }
      }
    }

    for (let dItem of digitalItems) {
      const saleType = dItem.type === 'M' ? 2 : 1;
      const [saleOrderResult] = await connection.query(`
        INSERT INTO sale_order (user_id, type, firstname, lastname, email, cellnumber, total, payment_status, status, is_deleted, created_on, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 0, NOW(), ?)
      `, [userId, saleType, customerData.firstName || '', customerData.lastName || '', customerData.email || '', customerData.phone || '', dItem.actualPrice, userId]);

      const saleOrderId = saleOrderResult.insertId;

      await connection.query(`
        INSERT INTO sale_order_product (order_id, product_id, name, display_name, listing_count, price, created_on) 
        VALUES (?, ?, ?, ?, ?, ?, NOW())
      `, [saleOrderId, dItem.productId, dItem.dbName, dItem.dbName, dItem.listingCount, dItem.actualPrice]);

      if (dItem.type === 'M') {
        const [subResult] = await connection.query(`
          INSERT INTO user_subscription_package (user_id, order_id, product_id, amount, base_total, start_date, end_date, status, is_deleted, created_on) 
          VALUES (?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR), 1, 0, NOW())
        `, [userId, saleOrderId, dItem.productId, dItem.actualPrice, dItem.actualPrice]);

        await connection.query(`
          INSERT INTO user_subscription_payments (subscription_id, amount, status, payment_status, is_deleted, created_on) 
          VALUES (?, ?, 1, 1, 0, NOW())
        `, [subResult.insertId, dItem.actualPrice]);
      } else if (dItem.type === 'L') {
        await connection.query(`
          INSERT INTO user_subscription_package (user_id, order_id, product_id, amount, base_total, start_date, status, is_deleted, created_on) 
          VALUES (?, ?, ?, ?, ?, NOW(), 1, 0, NOW())
        `, [userId, saleOrderId, dItem.productId, dItem.actualPrice, dItem.actualPrice]);
      }
    }

    if (physicalItems.length > 0) {
      const busDetail = physicalItems.map(item => `${item.dbName} x${item.quantity || item.qty || 1} (${item.selectedColor || 'Standard'} - ${item.selectedPattern || 'Standard'})`).join(' | ');
      const payStatus = paymentType === 'deposit' ? 2 : 1;

      const [orderResult] = await connection.query(
        `INSERT INTO orders 
        (user_id, type, business_name, firstname, lastname, email, phone_code, cellnumber, alt_phone,
         bus_detail, bus_detail_2, broker, city_id, state_id, country_id, city, state, country, 
         address, zipcode, order_city, order_state, order_country, order_zipcode, order_address, 
         total_price, order_amount, payment_status, paid_amount, order_from, website_id, orders_status, status, is_deleted, created_on, created_by, modified_on) 
        VALUES (?, 1, '', ?, ?, ?, 0, ?, 0, ?, ?, '', 0, 0, 0, ?, ?, '', ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, 'crm', 1, 1, 1, 0, NOW(), ?, NOW())`,
        [
          userId, customerData.firstName || '', customerData.lastName || '', customerData.email, customerData.phone || '',
          busDetail, busDetail, customerData.city || '', customerData.state || '', customerData.address || '', customerData.zip || '',
          customerData.city || '', customerData.state || '', customerData.zip || '', customerData.address || '',
          totalDue.toString(), totalDue, payStatus, amountPaid, userId
        ]
      );

      const physicalOrderId = orderResult.insertId;

      for (let item of physicalItems) {
        const qty = item.quantity || item.qty || 1;
        const totalValue = item.actualPrice * qty;
        const variantDesc = `${item.selectedColor || 'Standard'} - ${item.selectedPattern || 'Standard'}`;

        const lColor = mapVariantCode(item.selectedColor, 'color');
        const sColor = mapVariantCode(item.selectedStitching, 'color');
        const patternCode = mapVariantCode(item.selectedPattern, 'pattern');

        await connection.query(
          `INSERT INTO order_items 
          (order_id, category, product, leather_color, stitch_color, pattern, description, ndr, discount, disc_price, qty, total_price, created_at) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, NOW())`,
          [
            physicalOrderId,
            item.categoryId,
            item.productId,
            lColor,
            sColor,
            patternCode,
            variantDesc,
            Math.round(item.actualPrice),
            Math.round(item.actualPrice),
            qty,
            Math.round(totalValue)
          ]
        );

        await connection.query(`UPDATE products SET qty = ?, modified_on = NOW() WHERE id = ?`, [item.stockAfter, item.productId]);
      }
    }

    await connection.commit();
    res.status(200).json({ success: true, message: "Invoice successfully charged and distributed." });

  } catch (error) {
    await connection.rollback();
    console.error("Invoice Charge Error:", error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    connection.release();
  }
};