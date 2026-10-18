const crypto = require('crypto');
const db = require('../config/db');

const getAdsData = async (req, res) => {
  try {
    const [packages] = await db.query(
      `SELECT id, name, display_name, org_price, price, short_description, sort_order
       FROM sale_products
       WHERE type = 3 AND status = 1 AND is_deleted = 0
       ORDER BY sort_order ASC`
    );

    const [addons] = await db.query(
      `SELECT id, name, sort_order
       FROM ad_addons
       WHERE status = 1 AND is_deleted = 0
       ORDER BY sort_order ASC`
    );

    const [links] = await db.query(`SELECT package_id, addon_id FROM package_ad_addons`);

    const packagesWithAddons = packages.map(pkg => ({
      ...pkg,
      addon_ids: links
        .filter(l => l.package_id === pkg.id)
        .map(l => l.addon_id),
    }));

    return res.json({
      success: true,
      packages: packagesWithAddons,
      addons,
    });
  } catch (error) {
    console.error('Failed to fetch ads packages/add-ons:', error);
    return res.status(500).json({ success: false, message: 'Failed to load ad packages' });
  }
};

// Ad contracts live in their own `ad_contracts` table (see
// server/src/migrations/ad_contracts_migration.sql). This safety-net ensures
// the discount/link columns exist before writes, in case the migration has not
// been applied yet. MariaDB/MySQL: ADD COLUMN IF NOT EXISTS is MariaDB only.
const ensureAdContractColumns = async () => {
  try {
    await db.query(`ALTER TABLE ad_contracts ADD COLUMN IF NOT EXISTS discount_details LONGTEXT NULL AFTER total_price`);
    await db.query(`ALTER TABLE ad_contracts ADD COLUMN IF NOT EXISTS discounts_json LONGTEXT NULL AFTER total_price`);
    await db.query(`ALTER TABLE ad_contracts ADD COLUMN IF NOT EXISTS crm_invoice_id INT(11) NULL AFTER order_id`);
  } catch (error) {
    console.error('ensureAdContractColumns error:', error.message);
  }
};

// Builds the itemized discount breakdown that is persisted so the customer-facing
// ad agreement page can render it (custom discount + coupon + SMS/email scheduled).
// NOTE: `couponDiscount` is stored as metadata for the customer page to auto-apply
// in its coupon field — it is NOT included in `totalDiscount`/`totalPrice`.
const buildDiscountDetails = ({ subtotal, discountType, discountValue, customDiscount, adsCustomDiscount, paymentTermMonths, couponDiscount, couponCode, scheduledDiscounts, totalDiscount, totalPrice, offerExpiry = null }) => JSON.stringify({
  subtotal: parseFloat(subtotal) || 0,
  discountType: discountType || 'flat',
  discountValue: parseFloat(discountValue) || 0,
  customDiscount: parseFloat(customDiscount) || 0,
  adsCustomDiscount: parseFloat(adsCustomDiscount) || 0,
  paymentTermMonths: parseInt(paymentTermMonths, 10) > 0 ? parseInt(paymentTermMonths, 10) : null,
  couponDiscount: parseFloat(couponDiscount) || 0,
  couponCode: couponCode || null,
  scheduledDiscounts: (scheduledDiscounts || []).map(d => ({
    type: d.type || 'sms',
    label: d.label || null,
    amount: parseFloat(d.amount) || 0,
  })),
  totalDiscount: parseFloat(totalDiscount) || 0,
  totalPrice: parseFloat(totalPrice) || 0,
  offerExpiry: offerExpiry || null,
});

// Canonical discounts_json entry shape, e.g.
// [{"label":"Custom Discount 1","amount":12,"date":null,"active":true},
//  {"type":"coupon","label":"Coupon Discount (GC2026)","amount":200,"active":true,"couponCode":"GC2026"}]
// The writer (buildDiscountsJson) and the reader (parseDiscountsJson) both go
// through normaliseDiscountEntry so a stored row is always returned exactly as
// it was saved. couponCode is preserved deliberately: the agreement page shows
// the coupon's amount but needs the code to re-apply the coupon itself.
const normaliseDiscountEntry = (d) => {
  if (!d || typeof d !== 'object') return null;
  const entry = {
    label: String(d.label || 'Discount'),
    amount: parseFloat(d.amount) || 0,
    date: d.date || null,
    active: d.active !== false,
  };
  if (d.type) entry.type = String(d.type);
  if (d.couponCode) entry.couponCode = String(d.couponCode);
  return entry;
};

// Persists the itemized discount breakdown on ad_contracts.discounts_json.
const buildDiscountsJson = (discountsJson) => {
  if (!Array.isArray(discountsJson)) return '[]';
  return JSON.stringify(discountsJson.map(normaliseDiscountEntry).filter(Boolean));
};

// Reads ad_contracts.discounts_json back into that same array. The column is
// LONGTEXT and may be NULL, '' or hand-edited, so any parse failure degrades to
// an empty list instead of failing the whole agreement response.
const parseDiscountsJson = (raw) => {
  if (!raw) return [];
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    console.error('parseDiscountsJson: invalid discounts_json, ignoring:', e.message);
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normaliseDiscountEntry).filter(Boolean);
};

// ad_contracts.paid_term is stored in one fixed shape:
//   'monthly'          - rolling month-to-month, nothing committed up front
//   'N_then_monthly'   - N months committed up front, then rolling monthly
// Callers may send that canonical form, a bare number, or the display text
// ("4 months and then monthly"), so normalise here instead of trusting each
// caller. readPaidTerm() is the exact inverse used by the invoice page.
const normalisePaidTerm = (displayTerm, paidTerm, upfrontMonths) => {
  const raw = String(paidTerm || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (raw === 'monthly') return 'monthly';
  const alreadyCanonical = raw.match(/^(\d+)_then/);
  if (alreadyCanonical) return `${Math.min(12, Math.max(2, parseInt(alreadyCanonical[1], 10)))}_then_monthly`;
  // A bare month count is an N-month commitment too.
  const bareCount = raw.match(/^(\d+)$/);
  if (bareCount) return `${Math.min(12, Math.max(2, parseInt(bareCount[1], 10)))}_then_monthly`;

  // Fall back to the leading month count of the display text
  // ("4 months and then monthly" -> 4). A bare "Monthly" has no count, so it
  // falls through to the credit-card charge frequency, which is how the reader
  // interprets that pairing too.
  const leading = String(displayTerm || '').trim().toLowerCase().match(/^(\d+)/);
  const stated = parseInt(upfrontMonths, 10);
  const n = leading ? parseInt(leading[1], 10) : (Number.isInteger(stated) ? stated : 0);
  if (Number.isInteger(n) && n > 1) return `${Math.min(12, n)}_then_monthly`;
  return 'monthly';
};

// ad_contracts.upfront_months stores the credit-card charge frequency as an
// integer month count. Anything unparseable is stored as NULL rather than 0, so
// "not stated" stays distinguishable from "charged every month".
const toUpfrontMonths = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? Math.min(12, n) : null;
};

// ad_contracts.term_type is one of the three TERM_TYPE_OPTIONS values; anything
// unrecognised (including the legacy free text the admin panel used to write)
// falls back to 'paid', which is the only type currently implemented.
const toTermType = (value) => {
  const v = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!v) return 'paid';
  if (v.includes('comp')) {
    return /then|and_pay|after|plus/.test(v) ? 'complimentary_then_pay' : 'complimentary';
  }
  return 'paid';
};

// Computes total discount (capped at subtotal) and the discounted total.
// `applyCoupon` controls whether the coupon discount is included in the applied
// total. The ads agreement link keeps it false so the coupon is NOT baked into
// the price — the customer page auto-applies it in its coupon field instead.
const computeDiscount = ({ subtotal, customDiscount, couponDiscount, scheduledDiscounts, applyCoupon = true }) => {
  const base = parseFloat(subtotal) || 0;
  const scheduledTotal = (scheduledDiscounts || []).reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
  const coupon = applyCoupon ? (parseFloat(couponDiscount) || 0) : 0;
  const totalDiscount = Math.min(Math.max(0, base), Math.max(0, (parseFloat(customDiscount) || 0) + coupon + scheduledTotal));
  return {
    totalDiscount,
    totalPrice: Math.max(0, base - totalDiscount),
  };
};

// If the CRM didn't pass a coupon (e.g. the agent applied it after the ad link
// was generated, or the link was auto-generated before the coupon was restored
// from the saved invoice), inherit the coupon from the linked CRM invoice so the
// contract's discount_details always carries it. Mirrors the PHP customer-page
// inheritance so the coupon auto-applies on the sent link even then.
const resolveCouponFromInvoice = async (crmInvoiceId, couponCode, couponDiscount, productId) => {
  let resolvedCode = couponCode;
  let resolvedDiscount = parseFloat(couponDiscount) || 0;
  if (!resolvedCode && crmInvoiceId) {
    const [invRows] = await db.query('SELECT discount_details FROM crm_invoices WHERE id = ?', [crmInvoiceId]);
    if (invRows.length > 0 && invRows[0].discount_details) {
      try {
        const inv = JSON.parse(invRows[0].discount_details);
        if (inv && typeof inv === 'object' && inv.couponCode) {
          resolvedCode = inv.couponCode;
          let couponDisc = parseFloat(inv.couponDiscount) || 0;
          if (inv.couponItemDiscountMap && productId) {
            const item = inv.couponItemDiscountMap[String(productId)];
            if (item && typeof item === 'object') {
              const base = parseFloat(inv.subtotal) || 0;
              couponDisc = /percent/i.test(String(item.discountType || ''))
                ? base * ((parseFloat(item.discount) || 0) / 100)
                : (parseFloat(item.discount) || 0);
            }
          }
          resolvedDiscount = couponDisc;
        }
      } catch (e) {
        console.error('resolveCouponFromInvoice: failed to parse invoice discount_details', e.message);
      }
    }
  }
  return { couponCode: resolvedCode || null, couponDiscount: Math.max(0, resolvedDiscount) };
};

const generateAgreementLink = async (req, res) => {
  try {
    const {
      leadPhone,     // lead.id (phone number)
      userId,        // global_limo_user.id (encrypted or raw)
      preferenceId,  // existingLeadData.id (optional)
      billTo,
      phone,
      additionalPhone,
      agreementDate,
      terms,         // 'Month to Month' dropdown value
      // -- AD AGREEMENT COLUMNS (ad_contracts) --
      // term_type        - 'paid' | 'complimentary' | 'complimentary_then_pay'
      // paid_term        - 'monthly' | 'N_then_monthly'  (see normalisePaidTerm)
      // collection_type  - always 'monthly' for CRM-generated ad agreements
      // upfront_months   - credit-card charge frequency, integer months
      termType = null,
      paidTerm = null,
      collectionType = null,
      upfrontMonths = null,
      complimentaryMonths = null,
      paymentTermMonths = null,
      adPackageId,
      adFeatures,    // array of addon_ids
      email = null,  // real customer email from the CRM invoice page
      // -- NEW INCOMING DATA --
      subtotal = 0,
      discount = 0,
      totalPrice = 0,
      termsTemplateId = null,
      termsJson = '{}',
      crmInvoiceId = null,
      discountType = 'flat',
      discountValue = 0,
      customDiscount = 0,
      adsCustomDiscount = 0,
      couponDiscount = 0,
      couponCode = null,
      scheduledDiscounts = [],
      discountsJson = [],
      offerExpiry = null
    } = req.body;

    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';

    if (!adPackageId) {
      return res.status(400).json({ success: false, message: 'Missing adPackageId' });
    }

    // 1. Look up the package
    const [pkgRows] = await db.query(
      'SELECT id, name, display_name, price, type FROM sale_products WHERE id = ? AND status = 1',
      [adPackageId]
    );
    if (pkgRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ad package not found' });
    }
    const pkg = pkgRows[0];

    // Inherit the coupon from the linked CRM invoice if the agent applied it on
    // the invoice after this ad link was first generated.
    const resolvedCoupon = await resolveCouponFromInvoice(crmInvoiceId, couponCode, couponDiscount, adPackageId);
    const effectiveCouponCode = resolvedCoupon.couponCode;
    const effectiveCouponDiscount = resolvedCoupon.couponDiscount;

    // Itemized discount list the customer-facing ad agreement page renders.
    const discountsJsonStr = buildDiscountsJson(discountsJson);

    // Ad-agreement columns, normalised once and reused by every write below so
    // the INSERT and the "reuse existing contract" UPDATE can never disagree.
    // paymentTermMonths is the credit-card charge frequency the CRM form
    // selected, so it is the source for upfront_months when the caller did not
    // send upfrontMonths explicitly.
    const adTermType = toTermType(termType);
    const adPaidTerm = normalisePaidTerm(terms, paidTerm, upfrontMonths ?? paymentTermMonths);
    const adCollectionType = 'monthly';
    const adUpfrontMonths = toUpfrontMonths(upfrontMonths ?? paymentTermMonths);
    const adComplimentaryMonths = toUpfrontMonths(complimentaryMonths);

    // 2. Look up or Create User
    let realUserId = null;
    let userRow = null;
    if (userId) {
      const [users] = await db.query('SELECT id, firstname, lastname, email, cellnumber, phone_code FROM global_limo_user WHERE id = ?', [userId]);
      if (users.length > 0) {
        realUserId = users[0].id;
        userRow = users[0];
      }
    }

    if (!realUserId && email) {
      const [users] = await db.query(
        'SELECT id, firstname, lastname, email, cellnumber, phone_code FROM global_limo_user WHERE email = ? LIMIT 1',
        [email]
      );
      if (users.length > 0) {
        realUserId = users[0].id;
        userRow = users[0];
      }
    }

    if (!realUserId && leadPhone) {
      const cleanPhone = leadPhone.replace(/[^0-9]/g, '');
      const [users] = await db.query(
        `SELECT id, firstname, lastname, email, cellnumber, phone_code
         FROM global_limo_user
         WHERE REPLACE(REPLACE(REPLACE(REPLACE(cellnumber, '-', ''), '(', ''), ')', ''), ' ', '') = ?
            OR cellnumber = ?
         LIMIT 1`,
        [cleanPhone, leadPhone]
      );
      if (users.length > 0) {
        realUserId = users[0].id;
        userRow = users[0];
      }
    }

    if (!userRow) {
      const generatedPassword = crypto.randomBytes(4).toString('hex');
      const bcrypt = require('bcrypt');
      const hashedPassword = await bcrypt.hash(generatedPassword, 10);
      const nameParts = (billTo || '').trim().split(' ');
      const userEmail = email || (phone || leadPhone || '') + '@temp.globallimos.com';
      const [newUser] = await db.query(
        `INSERT INTO global_limo_user (firstname, lastname, email, cellnumber, password, group_id, lang_id, created_on, password_status)
         VALUES (?, ?, ?, ?, ?, 4, 1, NOW(), 0)`,
        [nameParts[0] || '', nameParts.slice(1).join(' ') || '', userEmail, phone || leadPhone || '', hashedPassword]
      );
      realUserId = newUser.insertId;
      userRow = { id: realUserId, firstname: nameParts[0] || '', lastname: nameParts.slice(1).join(' ') || '', email: userEmail, cellnumber: phone || leadPhone || '', phone_code: null };
    }

    // 2b. --- REUSE existing contract for this invoice (idempotent) ---
    // Re-opening the invoice page auto-refreshes the ads link; this prevents a
    // brand-new sale_order + contract from being created every time.
    if (crmInvoiceId) {
      const [existingRows] = await db.query(
        `SELECT * FROM ad_contracts WHERE crm_invoice_id = ? AND is_deleted = 0 AND active = 1 ORDER BY id DESC LIMIT 1`,
        [crmInvoiceId]
      );
      if (existingRows.length > 0) {
        const existing = existingRows[0];
        const pkgSubtotal2 = parseFloat(subtotal) || parseFloat(existing.total_price) || parseFloat(pkg.price) || 0;
        const totalCustom2 = (parseFloat(customDiscount) || 0) + (parseFloat(adsCustomDiscount) || 0);
        const { totalDiscount: td2, totalPrice: ft2 } = computeDiscount({ subtotal: pkgSubtotal2, customDiscount: totalCustom2, couponDiscount: effectiveCouponDiscount, scheduledDiscounts, applyCoupon: false });
        const ddJson2 = buildDiscountDetails({ subtotal: pkgSubtotal2, discountType, discountValue, customDiscount, adsCustomDiscount, paymentTermMonths, couponDiscount: effectiveCouponDiscount, couponCode: effectiveCouponCode, scheduledDiscounts, totalDiscount: td2, totalPrice: ft2, offerExpiry });

        // A DRAFT contract - created by updateAgreementDiscount so discounts_json
        // could be persisted before any ad link existed - has no sale_order and no
        // signing token. Upgrade it IN PLACE here: build the order and mint the
        // token so that generating the link later yields a real working link on
        // the SAME row, rather than returning a null URL (the old code returned
        // existing.sign_contract_url unconditionally) or creating a duplicate.
        let orderId2 = existing.order_id || null;
        if (!orderId2) {
          const reuseAdminId = req.user ? req.user.id : 0;
          const reuseIp = (req.headers && req.headers['x-forwarded-for']) || (req.socket && req.socket.remoteAddress) || req.ip || null;
          // sale_order.id is a plain `int NOT NULL` with NO auto_increment (legacy
          // MyISAM), so omitting it writes id = 0 and insertId comes back 0 - which
          // wrote order_id = 0 onto the contract and skipped every order-total
          // update. MySQL also refuses to read the insert target (error 1093), so
          // the next id is read first; MyISAM's table-level write lock makes the
          // read-then-insert pair safe here.
          const [maxOrder2] = await db.query('SELECT COALESCE(MAX(id), 0) AS m FROM sale_order');
          const newOrderId2 = (parseInt(maxOrder2[0].m, 10) || 0) + 1;
          await db.query(
            `INSERT INTO sale_order (
               id, user_id, type, firstname, lastname, email, cellnumber,
               sub_total, discount_amount, discount, discount_type, total, payment_status, status,
               created_on, created_by, ip_address
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, NOW(), ?, ?)`,
            [newOrderId2, realUserId, pkg.type || 3, userRow.firstname, userRow.lastname, userRow.email, userRow.cellnumber || phone, pkgSubtotal2, td2, td2, td2 > 0 ? (discountType === 'percent' ? 1 : 2) : 0, ft2, reuseAdminId, reuseIp]
          );
          orderId2 = newOrderId2;
          const [maxProd2] = await db.query('SELECT COALESCE(MAX(id), 0) AS m FROM sale_order_product');
          await db.query(
            `INSERT INTO sale_order_product (
               id, order_id, product_id, name, display_name, qty, price, status, created_on, created_by, ip_address
             ) VALUES (?, ?, ?, ?, ?, 1, ?, 1, NOW(), ?, ?)`,
            [(parseInt(maxProd2[0].m, 10) || 0) + 1, orderId2, pkg.id, pkg.name, pkg.display_name, ft2, reuseAdminId, reuseIp]
          );
        }

        // Only mint a token when there isn't one, so re-generating a link for a
        // contract that is already signed keeps its original URL and token.
        let signToken2 = existing.sign_token;
        let signUrl2 = existing.sign_contract_url;
        if (!signToken2) {
          signToken2 = crypto.randomBytes(32).toString('hex');
          const baseUrl2 = process.env.FRONTEND_BASE_URL || 'https://developer.globallimos.com/sales';
          signUrl2 = `${baseUrl2}/advertising-contract/${signToken2}`;
        }

        await db.query(
          `UPDATE ad_contracts SET total_price = ?, discount_details = ?, discounts_json = ?, email = ?, phone = ?, bill_to = ?, bill_phone = ?, bill_phone_alt = ?, agreement_date = ?, agreement_terms = ?, term_type = ?, paid_term = ?, collection_type = ?, upfront_months = ?, complimentary_months = ?, order_id = COALESCE(?, order_id), sign_token = COALESCE(?, sign_token), sign_contract_url = COALESCE(?, sign_contract_url), updated_on = NOW() WHERE id = ?`,
          [
            ft2, ddJson2, discountsJsonStr,
            userRow.email || existing.email || '',
            userRow.cellnumber || existing.phone || '',
            billTo || existing.bill_to || null,
            phone || existing.bill_phone || null,
            additionalPhone || existing.bill_phone_alt || null,
            agreementDate || null,
            terms || existing.agreement_terms || null,
            adTermType,
            adPaidTerm,
            adCollectionType,
            adUpfrontMonths,
            adComplimentaryMonths,
            orderId2,
            signToken2,
            signUrl2,
            existing.id,
          ]
        );

        if (orderId2) {
          await db.query(
            `UPDATE sale_order SET sub_total = ?, discount_amount = ?, discount = ?, discount_type = ?, total = ?, modified_on = NOW() WHERE id = ?`,
            [pkgSubtotal2, td2, td2, td2 > 0 ? (discountType === 'percent' ? 1 : 2) : 0, ft2, orderId2]
          );
          await db.query(`UPDATE sale_order_product SET price = ? WHERE order_id = ?`, [ft2, orderId2]);
        }

        console.log(`[AdsContract] Reusing existing contract ${existing.id} for invoice ${crmInvoiceId} → ${signUrl2}`);
        return res.json({
          success: true,
          link: signUrl2,
          contractId: existing.id,
          signToken: signToken2,
          totalPrice: ft2,
          totalDiscount: td2,
          reused: true,
        });
      }
    }

    // 3. --- NEW: Create Pending Sale Order ---
    const adminId = req.user ? req.user.id : 0; // Grab from auth middleware if available

    const pkgSubtotal = parseFloat(subtotal) || parseFloat(pkg.price) || 0;
    // Coupon is NOT applied to the contract total — it is passed to the customer
    // page (stored in discount_details) so the customer auto-applies it in its
    // coupon code field. Only custom + ads per-item + scheduled discounts are
    // applied here.
    const totalCustom = (parseFloat(customDiscount) || 0) + (parseFloat(adsCustomDiscount) || 0);
    const { totalDiscount, totalPrice: finalTotalPrice } = computeDiscount({ subtotal: pkgSubtotal, customDiscount: totalCustom, couponDiscount: effectiveCouponDiscount, scheduledDiscounts, applyCoupon: false });
    const discountDetailsJson = buildDiscountDetails({ subtotal: pkgSubtotal, discountType, discountValue, customDiscount, adsCustomDiscount, paymentTermMonths, couponDiscount: effectiveCouponDiscount, couponCode: effectiveCouponCode, scheduledDiscounts, totalDiscount, totalPrice: finalTotalPrice, offerExpiry });

    await ensureAdContractColumns();

    // sale_order.id / sale_order_product.id are plain `int NOT NULL` with NO
    // auto_increment (legacy MyISAM), so an INSERT that omits id silently writes
    // id = 0 and insertId reports 0 - which then wrote order_id = 0 onto the
    // contract and skipped every order-total update. MySQL also refuses to read
    // the insert target (error 1093), so the next id is read first; MyISAM's
    // table-level write lock makes the read-then-insert pair safe here.
    const [maxOrder] = await db.query('SELECT COALESCE(MAX(id), 0) AS m FROM sale_order');
    const orderId = (parseInt(maxOrder[0].m, 10) || 0) + 1;
    await db.query(`
      INSERT INTO sale_order (
        id, user_id, type, firstname, lastname, email, cellnumber,
        sub_total, discount_amount, discount, discount_type, total, payment_status, status,
        created_on, created_by, ip_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, NOW(), ?, ?)
    `, [orderId, realUserId, pkg.type || 3, userRow.firstname, userRow.lastname, userRow.email, userRow.cellnumber || phone, pkgSubtotal, totalDiscount, totalDiscount, totalDiscount > 0 ? (discountType === 'percent' ? 1 : 2) : 0, finalTotalPrice, adminId, ipAddress]);

    // Create Order Product Line Item
    const [maxProd] = await db.query('SELECT COALESCE(MAX(id), 0) AS m FROM sale_order_product');
    await db.query(`
      INSERT INTO sale_order_product (
        id, order_id, product_id, name, display_name, qty, price, status, created_on, created_by, ip_address
      ) VALUES (?, ?, ?, ?, ?, 1, ?, 1, NOW(), ?, ?)
    `, [(parseInt(maxProd[0].m, 10) || 0) + 1, orderId, pkg.id, pkg.name, pkg.display_name, finalTotalPrice, adminId, ipAddress]);

    // 4. Generate secure token & URLs
    const signToken = crypto.randomBytes(32).toString('hex');
    const baseUrl = process.env.FRONTEND_BASE_URL || 'https://developer.globallimos.com/sales';
    const signUrl = `${baseUrl}/advertising-contract/${signToken}`;

    // 5. Insert into ad_contracts table (Now includes order_id)
    const contractSql = `INSERT INTO ad_contracts (
        order_id, crm_invoice_id, firstname, lastname, email, phone_code, phone, total_price,
        bill_to, bill_phone, bill_phone_alt, agreement_date, agreement_terms,
        term_type, paid_term, collection_type, upfront_months, complimentary_months,
        sign_contract_url, sign_token, is_signed, active, is_deleted,
        created_by, created_on, ip_address, discount_details, discounts_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 0, 'admin', NOW(), ?, ?, ?)`;

    const contractParams = [
      orderId, // Added orderId
      crmInvoiceId || null,
      userRow.firstname || '',
      userRow.lastname || '',
      userRow.email || '',
      userRow.phone_code || null,
      userRow.cellnumber || phone || leadPhone || '',
      finalTotalPrice,
      billTo || null,
      phone || null,
      additionalPhone || null,
      agreementDate || null,
      terms || null,
      adTermType,
      adPaidTerm,
      adCollectionType,
      adUpfrontMonths,
      adComplimentaryMonths,
      signUrl,
      signToken,
      ipAddress,
      discountDetailsJson,
      discountsJsonStr,
    ];

    const [localResult] = await db.query(contractSql, contractParams);
    const contractId = localResult.insertId;

    // Write to global.ad_contracts (Silent fail wrapper as in original)
    try {
      await db.query(`INSERT INTO global.ad_contracts (...) VALUES (...)`, contractParams); // Add your full global query string here like before
    } catch (globalErr) {
      console.error('[AdsContract] Failed to write to global.ad_contracts:', globalErr.message);
    }

    // 6. Save Ad-ons
    if (adFeatures && adFeatures.length > 0) {
      const addonRows = adFeatures.map(addonId => [contractId, addonId]);
      await db.query('INSERT INTO contract_ad_addons (contract_id, addon_id) VALUES ?', [addonRows]);
    }

    // 7. --- NEW: Save Legal Terms (Replicating PHP Logic) ---
    const parsedTerms = JSON.parse(termsJson);
    const hasLegalTerms = Object.values(parsedTerms).some(v => v && String(v).trim() !== '');

    if (contractId && hasLegalTerms) {
      const billToResolved = billTo || '[Advertiser Name]';
      const processedTerms = {};
      
      // Mimic PHP's str_replace('{{BILL_TO}}', ...)
      for (const [key, val] of Object.entries(parsedTerms)) {
        processedTerms[key] = String(val || '').replace(/{{BILL_TO}}/g, billToResolved);
      }

      await db.query(`
        INSERT INTO contract_terms (
          contract_id, template_id, terms, payment_terms, limited_liability,
          indemnification, governing_law, dispute_resolution, created_on
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `, [
        contractId,
        termsTemplateId || null,
        processedTerms.terms || '',
        processedTerms.payment_terms || '',
        processedTerms.limited_liability || '',
        processedTerms.indemnification || '',
        processedTerms.governing_law || '',
        processedTerms.dispute_resolution || ''
      ]);
    }

    console.log(`[AdsContract] Generated link for user ${realUserId}, package ${adPackageId}: ${signUrl}`);

    return res.json({
      success: true,
      link: signUrl,
      contractId,
      signToken,
      totalPrice: finalTotalPrice,
      totalDiscount,
    });
  } catch (error) {
    console.error('Failed to generate ad agreement link:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to generate link' });
  }
};

// Updates the discount stored on an already-generated ad agreement contract.
// Called by the CRM whenever the invoice discount changes so the SAME link
// (advertising-contract/:token) reflects the latest discount when opened.
const updateAgreementDiscount = async (req, res) => {
  try {
    const {
      contractId, signToken, crmInvoiceId,
      subtotal = 0,
      discountType = 'flat',
      discountValue = 0,
      customDiscount = 0,
      adsCustomDiscount = 0,
      paymentTermMonths = null,
      couponDiscount = 0,
      couponCode = null,
      scheduledDiscounts = [],
      discountsJson = [],
      agreementDate = null,
      agreementTerms = null,
      // Ad-agreement columns. This endpoint is also called for discount-only
      // saves, so every one of these is applied with COALESCE below: a caller
      // that omits them leaves the stored agreement untouched instead of
      // blanking it.
      billTo = null,
      phone = null,
      additionalPhone = null,
      termType = null,
      paidTerm = null,
      collectionType = null,
      upfrontMonths = null,
      complimentaryMonths = null,
      offerExpiry = null,
    } = req.body;

    await ensureAdContractColumns();

    let contract = null;
    if (contractId) {
      const [rows] = await db.query('SELECT * FROM ad_contracts WHERE id = ? AND is_deleted = 0 LIMIT 1', [contractId]);
      contract = rows[0] || null;
    }
    if (!contract && signToken) {
      const [rows] = await db.query('SELECT * FROM ad_contracts WHERE sign_token = ? AND is_deleted = 0 LIMIT 1', [signToken]);
      contract = rows[0] || null;
    }
    if (!contract && crmInvoiceId) {
      const [rows] = await db.query('SELECT * FROM ad_contracts WHERE crm_invoice_id = ? AND is_deleted = 0 ORDER BY id DESC LIMIT 1', [crmInvoiceId]);
      contract = rows[0] || null;
    }

    // No contract yet: create a DRAFT one so the itemized breakdown is persisted
    // immediately. Previously this 404'd and the agent had to generate the ad link
    // before ANY discount reached ad_contracts, which meant a scheduled message's
    // ads discount never showed on the admin panel for invoices whose link was
    // never sent. The draft carries no order_id / sign_token / sign_contract_url,
    // so it is inert: generateAgreementLink picks it up by crm_invoice_id and
    // backfills the token, URL and sale_order onto this same row.
    // Guarded on crmInvoiceId because without it there is nothing to key the row.
    if (!contract && crmInvoiceId) {
      // Customer identity comes from the invoice so the admin panel shows a name
      // rather than a blank contract. crm_invoices spells these customer_name /
      // customer_email / lead_phone.
      const [invRows] = await db.query('SELECT customer_name, customer_email, lead_phone FROM crm_invoices WHERE id = ? LIMIT 1', [crmInvoiceId]);
      const inv = invRows[0] || {};
      const parts = String(inv.customer_name || '').trim().split(/\s+/).filter(Boolean);
      const [created] = await db.query(
        `INSERT INTO ad_contracts (
           crm_invoice_id, firstname, lastname, email, phone, total_price,
           is_signed, active, is_deleted, created_by, created_on, ip_address
         ) VALUES (?, ?, ?, ?, ?, ?, 0, 1, 0, 'crm', NOW(), ?)`,
        [
          crmInvoiceId,
          parts[0] || '',
          parts.slice(1).join(' '),
          inv.customer_email || '',
          inv.lead_phone || '',
          parseFloat(subtotal) || 0,
          (req.headers && req.headers['x-forwarded-for']) || (req.socket && req.socket.remoteAddress) || req.ip || null,
        ]
      );
      const [newRows] = await db.query('SELECT * FROM ad_contracts WHERE id = ? LIMIT 1', [created.insertId]);
      contract = newRows[0];
      console.log(`[AdsContract] Created draft contract ${contract.id} for invoice ${crmInvoiceId} to persist discounts_json`);
    }

    if (!contract) {
      return res.status(404).json({ success: false, message: 'No ad agreement contract found for this invoice, and no crmInvoiceId was supplied to create one.' });
    }

    const pkgSubtotal = parseFloat(subtotal) || parseFloat(contract.total_price) || 0;
    // Coupon is NOT applied here either — stored as metadata for the customer
    // page to auto-apply in its coupon field. Only custom + ads per-item +
    // scheduled discounts are applied here.
    // Inherit the coupon from the linked CRM invoice if not passed directly, so
    // the contract always carries it even when the link was generated earlier.
    let productId = null;
    if (contract.order_id) {
      const [opRows] = await db.query('SELECT product_id FROM sale_order_product WHERE order_id = ? LIMIT 1', [contract.order_id]);
      productId = opRows.length > 0 ? opRows[0].product_id : null;
    }
    const resolvedCoupon = await resolveCouponFromInvoice(crmInvoiceId || contract.crm_invoice_id, couponCode, couponDiscount, productId);
    const effectiveCouponCode = resolvedCoupon.couponCode;
    const effectiveCouponDiscount = resolvedCoupon.couponDiscount;
    const totalCustom = (parseFloat(customDiscount) || 0) + (parseFloat(adsCustomDiscount) || 0);
    const { totalDiscount, totalPrice: finalTotalPrice } = computeDiscount({ subtotal: pkgSubtotal, customDiscount: totalCustom, couponDiscount: effectiveCouponDiscount, scheduledDiscounts, applyCoupon: false });
    const discountDetailsJson = buildDiscountDetails({ subtotal: pkgSubtotal, discountType, discountValue, customDiscount, adsCustomDiscount, paymentTermMonths, couponDiscount: effectiveCouponDiscount, couponCode: effectiveCouponCode, scheduledDiscounts, totalDiscount, totalPrice: finalTotalPrice, offerExpiry });
    const discountsJsonStr = buildDiscountsJson(discountsJson);

    // Only overwrite the agreement columns the caller actually supplied.
    const adTermType = termType ? toTermType(termType) : null;
    const adPaidTerm = (paidTerm || agreementTerms || upfrontMonths)
      ? normalisePaidTerm(agreementTerms, paidTerm, upfrontMonths ?? contract.upfront_months)
      : null;
    // collection_type is a fixed 'monthly' for CRM-generated ad agreements.
    const adCollectionType = (collectionType || paidTerm || agreementTerms || upfrontMonths) ? 'monthly' : null;
    const adUpfrontMonths = (upfrontMonths || paidTerm || agreementTerms)
      ? toUpfrontMonths(upfrontMonths ?? contract.upfront_months)
      : null;
    const adComplimentaryMonths = complimentaryMonths ? toUpfrontMonths(complimentaryMonths) : null;

    await db.query(
      `UPDATE ad_contracts SET total_price = ?, discount_details = ?, discounts_json = ?,
         crm_invoice_id = COALESCE(?, crm_invoice_id),
         bill_to = COALESCE(?, bill_to),
         bill_phone = COALESCE(?, bill_phone),
         bill_phone_alt = COALESCE(?, bill_phone_alt),
         agreement_date = COALESCE(?, agreement_date),
         agreement_terms = COALESCE(?, agreement_terms),
         term_type = COALESCE(?, term_type),
         paid_term = COALESCE(?, paid_term),
         collection_type = COALESCE(?, collection_type),
         upfront_months = COALESCE(?, upfront_months),
         complimentary_months = COALESCE(?, complimentary_months),
         updated_on = NOW() WHERE id = ?`,
      [
        finalTotalPrice, discountDetailsJson, discountsJsonStr,
        crmInvoiceId || null,
        billTo || null, phone || null, additionalPhone || null,
        agreementDate || null, agreementTerms || null,
        adTermType, adPaidTerm, adCollectionType, adUpfrontMonths, adComplimentaryMonths,
        contract.id,
      ]
    );

    if (contract.order_id) {
      await db.query(
        `UPDATE sale_order SET sub_total = ?, discount_amount = ?, discount = ?, discount_type = ?, total = ?, modified_on = NOW() WHERE id = ?`,
        [pkgSubtotal, totalDiscount, totalDiscount, totalDiscount > 0 ? (discountType === 'percent' ? 1 : 2) : 0, finalTotalPrice, contract.order_id]
      );
      await db.query(`UPDATE sale_order_product SET price = ? WHERE order_id = ?`, [finalTotalPrice, contract.order_id]);
    }

    console.log(`[AdsContract] Updated discount for contract ${contract.id} → total ${finalTotalPrice} (discount ${totalDiscount})`);

    return res.json({ success: true, contractId: contract.id, signToken: contract.sign_token, totalPrice: finalTotalPrice, totalDiscount, discountDetails: JSON.parse(discountDetailsJson) });
  } catch (error) {
    console.error('Failed to update ad agreement discount:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to update discount' });
  }
};

// ── Read the ad agreement details straight off the contract ──────────────────
// The CRM keeps its own copy of the agreement fields inside
// crm_invoices.discount_details, but a contract created or edited from the
// legacy admin panel (ad_contracts.source = 'admin') never writes that copy —
// so the invoice page would show stale bill-to / phone / term values. This
// endpoint returns the contract row's own values so the UI can show what the
// contract actually says.
//
// Resolution order matches updateAgreementDiscount:
//   contractId -> signToken -> crmInvoiceId (newest active contract).
const getAgreementDetails = async (req, res) => {
  try {
    const { contractId, signToken, crmInvoiceId } = req.query || {};

    // agreement_date is a DATETIME, so the driver hands back a JS Date and
    // String(...) would yield "Sat Sep 26" - useless for <input type="date">.
    // Format it in SQL instead, which is also timezone-safe.
    const SELECT_CONTRACT = "SELECT *, DATE_FORMAT(agreement_date, '%Y-%m-%d') AS agreement_date_iso FROM ad_contracts";

    // Guard the numeric lookups: MySQL coerces 'abc' to 0, so an unvalidated id
    // would silently match whatever contract happens to sit at id = 0.
    const toId = (v) => {
      if (v === undefined || v === null || v === '' || v === 'undefined' || v === 'null') return null;
      const n = Number(v);
      return Number.isInteger(n) && n > 0 ? n : null;
    };
    const contractIdNum = toId(contractId);
    const crmInvoiceIdNum = toId(crmInvoiceId);
    const token = (typeof signToken === 'string' && signToken && signToken !== 'undefined' && signToken !== 'null')
      ? signToken
      : null;

    let contract = null;

    if (contractIdNum) {
      const [rows] = await db.query(`${SELECT_CONTRACT} WHERE id = ? AND is_deleted = 0 LIMIT 1`, [contractIdNum]);
      contract = rows[0] || null;
    }
    if (!contract && token) {
      const [rows] = await db.query(`${SELECT_CONTRACT} WHERE sign_token = ? AND is_deleted = 0 LIMIT 1`, [token]);
      contract = rows[0] || null;
    }
    if (!contract && crmInvoiceIdNum) {
      const [rows] = await db.query(
        `${SELECT_CONTRACT} WHERE crm_invoice_id = ? AND is_deleted = 0 ORDER BY id DESC LIMIT 1`,
        [crmInvoiceIdNum]
      );
      contract = rows[0] || null;
    }

    // No contract yet is a normal state (the link hasn't been generated), so
    // report it as empty rather than a 404.
    if (!contract) {
      return res.json({ success: true, found: false, agreement: null });
    }

    return res.json({
      success: true,
      found: true,
      agreement: {
        id: contract.id,
        source: contract.source || null,
        signToken: contract.sign_token || null,
        signContractUrl: contract.sign_contract_url || null,
        isSigned: contract.is_signed === 1 || contract.is_signed === true,
        totalPrice: contract.total_price,
        billTo: contract.bill_to || '',
        billPhone: contract.bill_phone || '',
        billPhoneAlt: contract.bill_phone_alt || '',
        agreementDate: contract.agreement_date_iso || '',
        agreementTerms: contract.agreement_terms || '',
        termType: contract.term_type || '',
        collectionType: contract.collection_type || '',
        upfrontMonths: contract.upfront_months === null || contract.upfront_months === undefined
          ? null
          : parseInt(contract.upfront_months, 10),
        paidTerm: contract.paid_term || '',
        complimentaryMonths: contract.complimentary_months === null || contract.complimentary_months === undefined
          ? null
          : parseInt(contract.complimentary_months, 10),
        // Itemized discounts exactly as stored, e.g.
        // [{"label":"Custom Discount 1","amount":12,"date":null,"active":true},
        //  {"type":"coupon","label":"Coupon Discount (GC2026)","amount":200,"active":true,"couponCode":"GC2026"}]
        discounts: parseDiscountsJson(contract.discounts_json),
      },
    });
  } catch (error) {
    console.error('Failed to fetch ad agreement details:', error);
    return res.status(500).json({ success: false, message: 'Failed to load ad agreement details' });
  }
};

module.exports = { getAdsData, generateAgreementLink, updateAgreementDiscount, getAgreementDetails };
