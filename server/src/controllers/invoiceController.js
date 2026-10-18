const crypto = require('crypto');
const db = require('../config/db');
const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Base URL used when building secure checkout links. Override in server/.env
// with PAYMENT_LINK_BASE_URL when running against a different host (e.g. localhost).
const CHECKOUT_BASE_URL = (process.env.PAYMENT_LINK_BASE_URL || 'https://developer.globallimos.com/sales').replace(/\/+$/, '');

const resolveGlobalLimoUserId = async ({ email, firstName, lastName, phone }) => {
  if (!email) return null;

  const [existing] = await db.query('SELECT id FROM global_limo_user WHERE email = ?', [email]);
  if (existing.length > 0) return existing[0].id;

  const crypto = require('crypto');
  const bcrypt = require('bcrypt');
  const generatedPassword = crypto.randomBytes(4).toString('hex');
  const hashedPassword = await bcrypt.hash(generatedPassword, 10);

  const [newUser] = await db.query(
    `INSERT INTO global_limo_user (firstname, lastname, email, cellnumber, password, group_id, lang_id, created_on, password_status)
         VALUES (?, ?, ?, ?, ?, 4, 1, NOW(), 0)`,
    [firstName || '', lastName || '', email, phone || '', hashedPassword]
  );
  return newUser.insertId;
};

const generatePayLinkToken = async ({ amount, email, firstName, lastName, phone, agentId, ipAddress, expiryDays = null, cartPayload = null, invoiceId = null }) => {
  const globalLimoUserId = await resolveGlobalLimoUserId({ email, firstName, lastName, phone });
  if (!globalLimoUserId) throw new Error('Could not resolve a customer account for this payment link.');

  const token = crypto.randomBytes(40).toString('hex');
  const expiryDate = expiryDays != null ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000) : null;

  await db.query(`
        INSERT INTO crm_payment_links 
        (token, invoice_id, global_limo_user_id, total_amount, cart_items, expires_at, status, is_deleted, created_on, created_by, modified_on, modified_by, ip_address) 
        VALUES (?, ?, ?, ?, ?, ?, 1, 0, NOW(), ?, NOW(), ?, ?)
    `, [token, invoiceId || null, globalLimoUserId, amount, cartPayload ? JSON.stringify(cartPayload) : JSON.stringify([]), expiryDate, agentId || 0, agentId || 0, ipAddress]);

  return `${CHECKOUT_BASE_URL}/packages/pay_transaction/${token}`;
};

const splitCartByType = (items) => {
  const listing = (items || []).filter(i => String(i.type) === 'L');
  const membership = (items || []).filter(i => String(i.type) === 'M');
  return { listing, membership };
};

const groupSubtotal = (items) => items.reduce(
  (sum, i) => sum + (parseFloat(i.price) || 0) * (parseInt(i.quantity, 10) || 1),
  0
);

// Strip any previously embedded checkout URL / placeholder out of a message so
// we never send a stale link or duplicate links to the customer.
const stripCheckoutUrls = (message) => (message || '')
  .replace(/Listing Payment Link:\s*https?:\/\/\S+/g, '')
  .replace(/Membership Payment Link:\s*https?:\/\/\S+/g, '')
  .replace(/Listing link:\s*https?:\/\/\S+/g, '')
  .replace(/Membership Link:\s*https?:\/\/\S+/g, '')
  .replace(/Ads link:\s*https?:\/\/\S+/g, '')
  .replace(/Pay securely here:\s*https?:\/\/\S+/g, '')
  .replace(/Secure Payment Link:\s*\[[^\]]*\]/g, '')
  .replace(/\[Secure payment link will be (generated|added) automatically\]/g, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

// Mint (or update) ONE secure hex-token checkout link PER product type (listing
// vs membership) so the customer gets a separate link for each and lands on the
// correct checkout layout on buy_package.php.
//
// Per-type scheduled discounts (listingScheduledDiscount / membershipScheduledDiscount)
// let each link carry ITS OWN scheduled discount value. When an existing token is
// passed for a group, the SAME crm_payment_links row is UPDATED (cart_items totals +
// discount breakdown) instead of minting a new token, so the original URL reflects
// discount changes after it was sent.
// Returns { listingLink, membershipLink, listingToken, membershipToken }.
const mintCheckoutLinks = async ({ items, subtotal, customDiscount, customDiscounts, listingCustomDiscount, membershipCustomDiscount, couponDiscount, scheduledDiscount, listingScheduledDiscount, membershipScheduledDiscount, couponCode, offerExpiry, email, firstName, lastName, phone, agentId, ipAddress, expiresIn, listingToken, membershipToken, invoiceId }) => {
  const globalLimoUserId = await resolveGlobalLimoUserId({ email, firstName, lastName, phone });
  if (!globalLimoUserId) throw new Error('Could not resolve a customer account for this payment link.');

  const baseSubtotal = parseFloat(subtotal) || groupSubtotal(items || []);
  
  // Multiple custom discounts: `customDiscounts` is an array of entries, each an
  // amount (legacy) or { amount, title }. Every entry is stamped with its own
  // "date given". If the array isn't provided (legacy callers), fall back to the
  // single `customDiscount` amount.
  const customList = Array.isArray(customDiscounts)
    ? customDiscounts
        .map((entry, idx) => {
          const obj = (entry && typeof entry === 'object') ? entry : { amount: entry };
          const amt = Math.round((parseFloat(obj.amount) || 0) * 100) / 100;
          if (amt <= 0) return null;
          const rawTitle = String(obj.title || '').trim();
          return { amount: amt, title: rawTitle !== '' ? rawTitle : `Custom ${idx + 1}` };
        })
        .filter(Boolean)
    : [];
  const baseCustom = customList.length > 0
    ? customList.reduce((s, v) => s + v.amount, 0)
    : Math.round((parseFloat(customDiscount) || 0) * 100) / 100;
  const baseSched = parseFloat(scheduledDiscount) || 0;
  // Default link expiry is 7 days. If a custom expiresIn is passed (e.g. "30
  // days"), honor it; otherwise every minted link expires 7 days from now.
  const days = parseInt(String(expiresIn === 'No Limit' ? '7' : expiresIn).split(' ')[0]) || 7;
  const expiryDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const ip = ipAddress || 'Unknown';

  const { listing, membership } = splitCartByType(items || []);

  const upsertPaymentLink = async ({ existingToken, totalAmount, cartPayload, productId, productType }) => {
    // Reuse the SAME secure token for this package type instead of minting a
    // brand-new one, so an invoice never ends up with duplicate links that each
    // carry a different token. A row is reused when (1) the caller passes an
    // existing token, or (2) an active row already exists for this invoice +
    // package type (one listing link, one membership link per invoice).
    let targetToken = existingToken || null;
    if (targetToken) {
      const [rows] = await db.query('SELECT id FROM crm_payment_links WHERE token = ? AND is_deleted = 0', [targetToken]);
      if (rows.length === 0) targetToken = null;
    }
    if (!targetToken && invoiceId && productType != null) {
      const [rows] = await db.query(
        'SELECT token FROM crm_payment_links WHERE invoice_id = ? AND product_type = ? AND is_deleted = 0 ORDER BY id DESC LIMIT 1',
        [invoiceId, productType]
      );
      if (rows.length > 0) targetToken = rows[0].token;
    }
    if (targetToken) {
      await db.query(
        `UPDATE crm_payment_links SET invoice_id = ?, global_limo_user_id = ?, product_id = ?, product_type = ?, total_amount = ?, cart_items = ?, expires_at = ?, modified_on = NOW(), modified_by = ? WHERE token = ?`,
        [invoiceId || null, globalLimoUserId, productId || null, productType || null, totalAmount, JSON.stringify(cartPayload), expiryDate, agentId || 0, targetToken]
      );
      return { url: `${CHECKOUT_BASE_URL}/packages/pay_transaction/${targetToken}`, token: targetToken };
    }
    const newToken = crypto.randomBytes(40).toString('hex');
    await db.query(`
          INSERT INTO crm_payment_links 
          (token, invoice_id, global_limo_user_id, product_id, product_type, total_amount, cart_items, expires_at, status, is_deleted, created_on, created_by, modified_on, modified_by, ip_address) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, NOW(), ?, NOW(), ?, ?)
      `, [newToken, invoiceId || null, globalLimoUserId, productId || null, productType || null, totalAmount, JSON.stringify(cartPayload), expiryDate, agentId || 0, agentId || 0, ip]);
    return { url: `${CHECKOUT_BASE_URL}/packages/pay_transaction/${newToken}`, token: newToken };
  };

  // Local timestamp "YYYY-MM-DD HH:MM:SS" capturing when a discount was set.
  const stamp = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };

  const mint = async (groupItems, perTypeSched, perTypeCustom, existingToken, type) => {
    const groupSub = groupSubtotal(groupItems);
    // product_id = the sale_products id of the package in this group; the link is
    // per-type (listing vs membership) so the product_type maps to 1 / 2.
    const firstItem = groupItems[0] || {};
    const productId = firstItem.itemId || firstItem.id || null;
    const productType = type === 'listing' ? 1 : type === 'membership' ? 2 : null;
    const share = baseSubtotal > 0 ? groupSub / baseSubtotal : 0;
    const groupSched = perTypeSched != null
      ? Math.round((parseFloat(perTypeSched) || 0) * 100) / 100
      : Math.round(baseSched * share * 100) / 100;
    // The combined custom discount is applied in FULL to every group (listing,
    // membership, ads, etc.) — it is NOT pro-rated by subtotal share. The
    // per-item custom discount (listing / membership) rides only on ITS OWN link.
    const combinedVal = Math.round(baseCustom * 100) / 100;
    const perTypeVal = Math.round((parseFloat(perTypeCustom) || 0) * 100) / 100;
    const customDisc = Math.min(groupSub, combinedVal + perTypeVal);
    // Coupon discount is NOT baked into the total: the coupon code travels in
    // the link and is auto-applied on the checkout page via apply_coupon, so it
    // uses the coupon's own rules per product (no pro-rating).
    const groupDisc = Math.min(groupSub, customDisc + groupSched);
    const groupTotal = Math.max(0, Math.round((groupSub - groupDisc) * 100) / 100);

    // Load the previous payload (if regenerating an existing link) so each
    // discount date only updates when THAT discount's value actually changed —
    // changing the listing discount must NOT refresh the custom-discount date.
    let oldPayload = null;
    if (existingToken) {
      const [rows] = await db.query('SELECT cart_items FROM crm_payment_links WHERE token = ? AND is_deleted = 0', [existingToken]);
      if (rows.length > 0) {
        try { oldPayload = JSON.parse(rows[0].cart_items || 'null'); } catch (e) { oldPayload = null; }
      }
    }
    const num = (v) => (v === null || v === undefined || v === '' ? 0 : Math.round(parseFloat(v) * 100) / 100);
    const oldDate = (d) => (d && String(d).trim() !== '' ? String(d) : null);
    const perTypeKey = type === 'listing' ? 'listingDiscount' : 'membershipDiscount';
    const perTypeDateKey = `${perTypeKey}Date`;
    const oldCombined = oldPayload ? num(oldPayload.customDiscount) : null;
    const oldPerType = oldPayload ? num(oldPayload[perTypeKey]) : null;
    const now = stamp();
    const perTypeDate = perTypeVal > 0
      ? (oldPayload && oldPerType === perTypeVal ? oldDate(oldPayload[perTypeDateKey]) : now)
      : null;
    // Resolve the "date given" for EACH custom discount entry. An entry keeps
    // its original date when nothing about its AMOUNT changed (position + amount
    // match) — title-only edits don't refresh the date; the new title is applied.
    const oldCustoms = oldPayload && Array.isArray(oldPayload.customDiscounts) ? oldPayload.customDiscounts : null;
    const customEntries = customList.length > 0
      ? customList.map((ce, i) => {
          if (oldCustoms && oldCustoms[i] && num(oldCustoms[i].amount) === ce.amount) {
            return { amount: ce.amount, title: ce.title, date: oldDate(oldCustoms[i].date) || now };
          }
          if (!oldCustoms && i === 0 && oldPayload && oldCombined === ce.amount) {
            return { amount: ce.amount, title: ce.title, date: oldDate(oldPayload.customDiscountDate) || now };
          }
          return { amount: ce.amount, title: ce.title, date: now };
        })
      : [];
    const customDate = customEntries.length > 0
      ? customEntries[customEntries.length - 1].date
      : (combinedVal > 0 ? (oldPayload && oldCombined === combinedVal ? oldDate(oldPayload.customDiscountDate) : now) : null);
    const cartPayload = {
      items: groupItems.map(i => ({
        name: i.name || '',
        type: i.type || null,
        itemId: i.itemId || i.id || null,
        price: parseFloat(i.price) || 0,
        quantity: parseInt(i.quantity, 10) || 1,
      })),
      subtotal: Math.round(groupSub * 100) / 100,
      // Combined discount and per-type (listing / membership) discount stored
      // separately. The combined discount is stored as an ARRAY (customDiscounts)
      // so each custom discount keeps its own "date given"; `customDiscount`
      // stays as the total sum for legacy compatibility.
      customDiscounts: customEntries,
      customDiscount: combinedVal,
      customDiscountDate: customDate,
      listingDiscount: type === 'listing' ? perTypeVal : 0,
      listingDiscountDate: type === 'listing' ? perTypeDate : null,
      membershipDiscount: type === 'membership' ? perTypeVal : 0,
      membershipDiscountDate: type === 'membership' ? perTypeDate : null,
      couponDiscount: 0,
      couponCode: couponCode || null,
      scheduledDiscount: groupSched,
      offerExpiry: offerExpiry || null,
      shipping: 0,
      tax: 0,
      total: groupTotal,
    };
    return upsertPaymentLink({ existingToken: existingToken || null, totalAmount: groupTotal, cartPayload, productId, productType });
  };

  const links = {};
  if (listing.length > 0) {
    const { url, token } = await mint(listing, listingScheduledDiscount, listingCustomDiscount, listingToken, 'listing');
    links.listingLink = url;
    links.listingToken = token;
  }
  if (membership.length > 0) {
    const { url, token } = await mint(membership, membershipScheduledDiscount, membershipCustomDiscount, membershipToken, 'membership');
    links.membershipLink = url;
    links.membershipToken = token;
  }
  return links;
};

exports.generateAndSendPayLink = async (req, res) => {
  try {
    const { email, firstName, lastName, phone, amount, items, deliveryMethod, customMessage, expiresIn, agentId, subtotal, customDiscount, customDiscounts, listingCustomDiscount, membershipCustomDiscount, couponDiscount, scheduledDiscount, listingScheduledDiscount, membershipScheduledDiscount, listingToken, membershipToken, shipping, tax, couponCode, offerExpiry, adLink, invoiceId } = req.body;
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';

    const globalLimoUserId = await resolveGlobalLimoUserId({ email, firstName, lastName, phone });
    if (!globalLimoUserId) {
      return res.status(400).json({ success: false, message: 'Could not resolve customer account (email required).' });
    }

    // Does this cart contain seat covers (physical items)? If so, the
    // frontend already put the correct cart link inside customMessage —
    // don't mint a second buy_package token link on top of it.
    const hasPhysical = (items || []).some(i => i.type === 'P' || !i.type);

    let checkoutUrl = null;
    let finalMessage = customMessage;
    let links = {};

    if (!hasPhysical) {
      // Mint ONE secure hex-token checkout link per product type (listing vs
      // membership) so the customer lands on the correct checkout layout and
      // never sees an email address in the URL.
      links = await mintCheckoutLinks({
        items, subtotal, customDiscount, customDiscounts, listingCustomDiscount, membershipCustomDiscount,
        couponDiscount, scheduledDiscount,
        listingScheduledDiscount, membershipScheduledDiscount, couponCode,
        offerExpiry,
        listingToken, membershipToken,
        email, firstName, lastName, phone, agentId, ipAddress, expiresIn, invoiceId,
      });
      const linksText = [
        links.listingLink && `Listing link: ${links.listingLink}`,
        links.membershipLink && `Membership Link: ${links.membershipLink}`,
        adLink && `Ads link: ${adLink}`,
      ].filter(Boolean).join('\n');
      checkoutUrl = linksText;
      finalMessage = `${stripCheckoutUrls(customMessage)}\n\n${linksText}`;
    }
    if (deliveryMethod.includes('SMS') && phone) {
      await client.messages.create({
        body: finalMessage,
        from: process.env.TWILIO_PHONE_NUMBER || '+14155189121',
        to: phone
      });
    }

    res.json({ success: true, link: checkoutUrl, links });

  } catch (error) {
    console.error("Error generating pay link:", error);
    res.status(500).json({ success: false, message: error.message || "Server error" });
  }
};

// Generate separate secure hex-token checkout links (listing + membership) WITHOUT
// sending them. Used by the frontend for the "Copy Payment Link" action and for
// embedding real links into scheduled message bodies.
exports.generateCheckoutLinks = async (req, res) => {
  try {
    const { email, firstName, lastName, phone, items, subtotal, customDiscount, customDiscounts, listingCustomDiscount, membershipCustomDiscount, couponDiscount, scheduledDiscount, listingScheduledDiscount, membershipScheduledDiscount, listingToken, membershipToken, shipping, tax, couponCode, offerExpiry, expiresIn, agentId, invoiceId } = req.body;
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';

    const links = await mintCheckoutLinks({
      items, subtotal, customDiscount, customDiscounts, listingCustomDiscount, membershipCustomDiscount,
      couponDiscount, scheduledDiscount,
      listingScheduledDiscount, membershipScheduledDiscount, couponCode,
      offerExpiry,
      listingToken, membershipToken,
      email, firstName, lastName, phone, agentId, ipAddress, expiresIn, invoiceId,
    });

    res.json({
      success: true,
      listingLink: links.listingLink || null,
      membershipLink: links.membershipLink || null,
      listingToken: links.listingToken || null,
      membershipToken: links.membershipToken || null,
    });
  } catch (error) {
    console.error("Error generating checkout links:", error);
    res.status(500).json({ success: false, message: error.message || "Server error" });
  }
};

// ── Helper: Generate a secure pay link token and save it to crm_payment_links ──
// Returns the full checkout URL so it can be appended to any message.
// const generatePayLinkToken = async ({ amount, invoiceId, agentId, ipAddress, expiryDays = 7 }) => {
//     const token = crypto.randomBytes(40).toString('hex');

//     const expiryDate = new Date();
//     expiryDate.setDate(expiryDate.getDate() + expiryDays);

//     await db.query(`
//         INSERT INTO crm_payment_links 
//         (token, global_limo_user_id, total_amount, cart_items, expires_at, status, is_deleted, created_on, created_by, modified_on, modified_by, ip_address) 
//         VALUES (?, ?, ?, ?, ?, 1, 0, NOW(), ?, NOW(), ?, ?)
//     `, [
//         token,
//         invoiceId,           // tie the link to this invoice
//         amount,
//         JSON.stringify([]),   // no individual cart items needed here — amount covers it
//         expiryDate,
//         agentId || 0,
//         agentId || 0,
//         ipAddress
//     ]);

//     return `https://developer.globallimos.com/sales/packages/buy_package/${token}`;
// };

exports.checkInvoiceStatus = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId || userId === 'null') {
      return res.json({ exists: false });
    }

    // Match on user_id (current) OR preference_id (legacy) so both the
    // invoice page (passes user_id) and the inbox/lead-selection flows
    // (still pass a preference id) resolve the same contact.
    const [rows] = await db.query(
      "SELECT id, invoice_number FROM crm_invoices WHERE (user_id = ? OR preference_id = ?) AND is_deleted = 0 AND status = 1 LIMIT 1",
      [userId, userId]
    );

    if (rows.length > 0) {
      res.json({ exists: true, invoiceId: rows[0].id, invoiceNumber: rows[0].invoice_number });
    } else {
      res.json({ exists: false });
    }
  } catch (error) {
    console.error("Check Invoice Error:", error);
    res.status(500).json({ exists: false, message: "Database error" });
  }
};

const generateInvoiceNumber = async () => {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const [rows] = await db.query('SELECT MAX(id) as maxId FROM crm_invoices');
  const nextId = (rows[0].maxId || 0) + 1;
  const sequentialNumber = nextId.toString().padStart(5, '0');
  return `${prefix}${sequentialNumber}`;
};

exports.getInvoiceDetails = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const [rows] = await db.query("SELECT * FROM crm_invoices WHERE id = ? AND is_deleted = 0 LIMIT 1", [invoiceId]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }
    res.json({ success: true, invoice: rows[0] });
  } catch (error) {
    console.error("Fetch Invoice Details Error:", error);
    res.status(500).json({ success: false, message: "Database error" });
  }
};

const formatTimeForDB = (timeStr) => {
  if (!timeStr) return '10:00:00';
  if (timeStr.split(':').length === 3) return timeStr;
  return `${timeStr}:00`;
};

// MariaDB/MySQL: ADD COLUMN IF NOT EXISTS is supported on MariaDB.
const ensureScheduledMessagesColumns = async () => {
  try {
    await db.query(`ALTER TABLE crm_scheduled_messages ADD COLUMN IF NOT EXISTS discount_details LONGTEXT NULL AFTER discount_offered`);

    // Delivery state for a scheduled send.
    //   send_status NULL     -> never attempted, still eligible for the cron
    //   send_status 'sending'-> claimed by a run; a crash here leaves it stuck
    //                         rather than risking a duplicate text to the customer
    //   send_status 'sent'   -> handed to Twilio successfully
    //   send_status 'failed' -> attempted once and failed, NEVER retried
    await db.query(`ALTER TABLE crm_scheduled_messages ADD COLUMN IF NOT EXISTS send_status VARCHAR(20) NULL DEFAULT NULL AFTER is_sent`);
    await db.query(`ALTER TABLE crm_scheduled_messages ADD COLUMN IF NOT EXISTS failure_reason VARCHAR(255) NULL DEFAULT NULL AFTER send_status`);
    await db.query(`ALTER TABLE crm_scheduled_messages ADD COLUMN IF NOT EXISTS attempted_on DATETIME NULL DEFAULT NULL AFTER failure_reason`);
  } catch (error) {
    console.error('ensureScheduledMessagesColumns error:', error.message);
  }
};

// Mirrors sale_products.type so invoices can be matched to Listing (1),
// Membership (2), Ads (3), Seat covers/apparel (5), Renewal (6) or
// Vehicles/consignment (7).
const ensureInvoiceTypeColumn = async () => {
  try {
    await db.query(`ALTER TABLE crm_invoices ADD COLUMN IF NOT EXISTS type INT(11) NULL DEFAULT NULL AFTER order_id`);
  } catch (error) {
    console.error('ensureInvoiceTypeColumn error:', error.message);
  }
};

// Map a cart item's internal type letter to the sale_products.type code.
// 'V' (consigned vehicles) is invoice type 7.
const ITEM_TYPE_TO_SALE_TYPE = { L: 1, M: 2, A: 3, P: 5, R: 6, V: 7 };

const deriveInvoiceType = (items) => {
  if (!Array.isArray(items) || items.length === 0) return null;
  const present = [...new Set((items || []).map(i => i && i.type).filter(Boolean))];
  if (present.length === 0) return null;
  // Prefer in order: Vehicles, Listing, Membership, Ads, Renewal, Seat covers
  // (apparel). Vehicles come first because an invoice is either a vehicle
  // (consignment) invoice OR a package invoice - the two are mutually exclusive
  // in the UI - so if a legacy/mixed cart somehow carries both, the attached
  // vehicle is what the invoice is actually about.
  const priority = ['V', 'L', 'M', 'A', 'R', 'P'];
  for (const kind of priority) {
    if (present.includes(kind)) return ITEM_TYPE_TO_SALE_TYPE[kind];
  }
  const firstKind = present[0];
  return ITEM_TYPE_TO_SALE_TYPE[firstKind] != null ? ITEM_TYPE_TO_SALE_TYPE[firstKind] : null;
};

exports.createInvoice = async (req, res) => {
  try {
    const {
      invoiceId, invoiceNumber, userId, phone, name, email,
      subtotal, discountAmount, discountType, discountDetails, notes,
      totalDue, items, scheduledTexts, scheduledEmails, skipScheduledMessages
    } = req.body;

    const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '127.0.0.1';
    const agentId = 1;

    await ensureScheduledMessagesColumns();
    await ensureInvoiceTypeColumn();

    // Derive the invoice's package type (Listing=1, Membership=2, Ads=3,
    // Seat covers=5, Renewal=6, Vehicles=7) from its cart items, mirroring
    // sale_products.type.
    const invoiceType = deriveInvoiceType(items);

    let targetInvoiceId = invoiceId;
    let finalInvoiceNumber = invoiceNumber;
    let insertId = null;

    // ── UPDATE MODE ──────────────────────────────────────────────────
    if (invoiceId) {
      await db.query(`
                UPDATE crm_invoices SET 
                    user_id = ?, lead_phone = ?, customer_name = ?, customer_email = ?, 
                    subtotal = ?, discount_amount = ?, discount_type = ?, discount_details = ?, total_due = ?, items_json = ?, notes = ?, type = ?,
                    modified_on = NOW(), modified_by = ?, ip_address = ?
                WHERE id = ?
            `, [
        userId || null, phone, name, email,
        subtotal, discountAmount, discountType || 'flat',
        discountDetails || null,
        totalDue, JSON.stringify(items), notes || '',
        invoiceType,
        agentId, ipAddress, invoiceId
      ]);

      if (!skipScheduledMessages) {
        await db.query(`DELETE FROM crm_scheduled_messages WHERE invoice_id = ? AND is_sent = 0`, [invoiceId]);
      }
    }
    // ── CREATE MODE ──────────────────────────────────────────────────
    else {
      finalInvoiceNumber = await generateInvoiceNumber();

      const [result] = await db.query(`
                INSERT INTO crm_invoices (
                    invoice_number, user_id, type, lead_phone, customer_name, customer_email, 
                    subtotal, discount_amount, discount_type, discount_details, total_due, items_json, notes, 
                    status, is_deleted, created_on, created_by, ip_address
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, NOW(), ?, ?)
            `, [
        finalInvoiceNumber, userId || null, invoiceType, phone, name, email,
        subtotal, discountAmount, discountType || 'flat',
        discountDetails || null,
        totalDue, JSON.stringify(items), notes || '',
        agentId, ipAddress
      ]);

      insertId = result.insertId;
      targetInvoiceId = result.insertId;
    }

    if (!targetInvoiceId) {
      // A falsy targetInvoiceId almost always means the INSERT succeeded but
      // MySQL had no AUTO_INCREMENT to draw an id from, so it silently stored
      // id = 0. Log the real numbers instead of a generic message, otherwise
      // this failure is impossible to diagnose from the log alone.
      console.error(
        `createInvoice: no usable invoice id (mode=${invoiceId ? 'update' : 'create'}, ` +
        `invoiceId=${invoiceId}, insertId=${insertId}, invoiceNumber=${finalInvoiceNumber}). ` +
        'If insertId is 0, crm_invoices.id is missing AUTO_INCREMENT and the row was saved with id=0.'
      );
      throw new Error(
        invoiceId
          ? `Invoice ${invoiceId} could not be read back after the update.`
          : 'The invoice row was written but the database generated no id. crm_invoices.id needs AUTO_INCREMENT.'
      );
    }

    // ── FIX: Save scheduled messages including attach_pay_link + pay_link_amount ──
const insertScheduledMessage = async (msgArray, type) => {
    if (!msgArray || msgArray.length === 0) return;

    for (const msg of msgArray) {
        if (msg.is_sent === 1 || msg.is_sent === true) continue;

        const attachPayLink = msg.attachPayLink || msg.attach_pay_link || false;
        const payLinkAmount = (msg.payLinkAmount ?? msg.pay_link_amount ?? null);

        // Per-type scheduled discount amounts (listing/membership/ads) for this
        // specific message, so each link carries its own discount value.
        const discountDetails = msg.discountDetails
          || msg.discount_details
          || (msg.discountAmounts ? JSON.stringify(msg.discountAmounts) : null);

        // Store the clean message. The actual secure pay link (with the full cart
        // + coupon) is minted exactly once at send time by sendScheduledMessages.
        let messageBody = (msg.messageBody || msg.message_body || '')
            .replace(/Pay securely here:\s*https?:\/\/\S+/g, '')
            .replace(/Secure Payment Link:\s*\[Secure payment link will be added automatically\]/g, '')
            .replace(/\[Secure payment link will be added automatically\]/g, '')
            .trim();

        await db.query(`
            INSERT INTO crm_scheduled_messages (
                invoice_id, message_type, send_date, send_time, message_body, discount_offered,
                discount_details,
                attach_pay_link, pay_link_amount,
                is_sent, status, is_deleted, created_on, created_by, ip_address
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 0, NOW(), ?, ?)
        `, [
            targetInvoiceId,
            type,
            msg.date || msg.send_date,
            formatTimeForDB(msg.time || msg.send_time),
            messageBody,
            msg.discount || msg.discount_offered || 0,
            discountDetails || null,
            attachPayLink ? 1 : 0,
            payLinkAmount ?? null,
            agentId,
            ipAddress
        ]);
    }
};

    if (!skipScheduledMessages) {
      await insertScheduledMessage(scheduledTexts, 'sms');
      await insertScheduledMessage(scheduledEmails, 'email');
    }

    res.status(200).json({ success: true, invoiceNumber: finalInvoiceNumber, invoiceId: targetInvoiceId });

  } catch (error) {
    console.error("Create/Edit Invoice Error:", error);
    res.status(500).json({ success: false, message: "Server error processing invoice" });
  }
};

exports.getScheduledMessages = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const [messages] = await db.query(
      // send_date (DATE) and send_time (TIME) come back from the driver as JS
      // Dates, so res.json() ships them as UTC ISO strings and the browser
      // re-reads them in its own zone - a 02:09 send on 2026-09-20 renders as
      // 2026-09-19 for anyone east of UTC. The invoice page builds the
      // ad_contracts.discounts_json "Scheduled Discount (Sep 20, 26 2:09AM)"
      // label from these, so the raw values are also exposed as pre-formatted
      // strings. Additive: send_date / send_time keep their original shape for
      // every other consumer of this endpoint.
      `SELECT *,
              DATE_FORMAT(send_date, '%Y-%m-%d') AS send_date_iso,
              TIME_FORMAT(send_time, '%H:%i') AS send_time_str
       FROM crm_scheduled_messages WHERE invoice_id = ? AND is_deleted = 0`,
      [invoiceId]
    );
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching messages" });
  }
};

exports.getAllInvoices = async (req, res) => {
  try {
    // ORDER BY id DESC so the newest invoice (highest primary key) is always
    // first. created_on can tie across several rows inserted in the same
    // second, which made the top of the list non-deterministic.
    //
    // created_on_raw is the literal wall-clock string as stored in MySQL.
    // created_on (a DATETIME) is parsed by the driver using THIS server's
    // timezone and then serialized as a UTC ISO string, so a browser in a
    // different timezone renders a shifted — sometimes future — time. The raw
    // string lets the client display exactly what is in the database.
    const [rows] = await db.query(`
      SELECT *, DATE_FORMAT(created_on, '%Y-%m-%d %H:%i:%s') AS created_on_raw
      FROM crm_invoices
      WHERE is_deleted = 0
      ORDER BY id DESC
    `);
    const [links] = await db.query(
      "SELECT invoice_id, id, token, total_amount, status, expires_at, created_on FROM crm_payment_links WHERE is_deleted = 0"
    );
    const invoices = rows.map(inv => ({
      ...inv,
      payment_links: (links || []).filter(l => l.invoice_id && l.invoice_id === inv.id),
    }));
    res.json({ success: true, invoices });
  } catch (error) {
    console.error("Fetch All Invoices Error:", error);
    res.status(500).json({ success: false, message: "Database error fetching invoices" });
  }
};

// ── Soft delete an invoice ────────────────────────────────────────────────
// Only flips crm_invoices.is_deleted to 1; the row and all of its items_json
// stay in the table so the record can be restored or audited later. Any
// still-unsent scheduled SMS/email rows for the invoice are cancelled too —
// otherwise the cron would keep firing them for an invoice the user just
// deleted. Already-sent messages are left alone for the audit trail.
exports.deleteInvoice = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const id = Number(invoiceId);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: "Invalid invoice id" });
    }

    const [existing] = await db.query(
      "SELECT id, invoice_number FROM crm_invoices WHERE id = ? AND is_deleted = 0 LIMIT 1",
      [id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '127.0.0.1';
    const agentId = 1;

    // Both writes run in one transaction: a half-applied delete (invoice hidden
    // but its messages still armed) is worse than a clean failure.
    // NOTE: crm_scheduled_messages has no modified_by column (only created_by),
    // so it gets modified_on only — same as the sendScheduledMessages update.
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        "UPDATE crm_invoices SET is_deleted = 1, modified_on = NOW(), modified_by = ?, ip_address = ? WHERE id = ?",
        [agentId, ipAddress, id]
      );

      const [cancelled] = await connection.query(
        "UPDATE crm_scheduled_messages SET is_deleted = 1, modified_on = NOW() WHERE invoice_id = ? AND is_sent = 0 AND is_deleted = 0",
        [id]
      );

      await connection.commit();

      res.json({
        success: true,
        invoiceId: id,
        invoiceNumber: existing[0].invoice_number,
        cancelledMessages: cancelled.affectedRows || 0,
      });
    } catch (txError) {
      await connection.rollback();
      throw txError;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Delete Invoice Error:", error);
    res.status(500).json({ success: false, message: "Database error deleting invoice" });
  }
};

// ── Cron job handler: called by your scheduler to fire pending messages ──
// Wire this up to node-cron or similar: runs every minute to check due messages.
//
//   const cron = require('node-cron');
//   const { sendScheduledMessages } = require('./controllers/invoiceController');
//   cron.schedule('* * * * *', sendScheduledMessages);
//
// Every due message is CLAIMED (send_status) before the Twilio call, not after.
// The previous version only set is_sent=1 on success, so a send that failed -
// an unsupported destination number, a bad 'from' number, a Twilio outage - left
// is_sent=0 and the next cron tick picked the same row up again, retrying every
// minute forever. Claiming first gives at-most-once delivery: a failure is
// recorded as send_status='failed' and the message is never attempted again.
exports.sendScheduledMessages = async () => {
  await ensureScheduledMessagesColumns();

  try {
    // is_sent = 0 keeps rows that were already delivered before send_status
    // existed from being re-sent. send_status IS NULL restricts this to rows
    // that have never been attempted at all.
    const [dueMsgs] = await db.query(`
        SELECT sm.*, ci.lead_phone, ci.customer_email, ci.customer_name, ci.id AS inv_id,
               ci.items_json, ci.discount_details AS invoice_discount_details, ci.subtotal, ci.total_due
        FROM crm_scheduled_messages sm
        JOIN crm_invoices ci ON ci.id = sm.invoice_id
        WHERE sm.is_sent = 0
          AND sm.send_status IS NULL
          AND sm.is_deleted = 0
          AND ci.is_deleted = 0
          AND CONCAT(sm.send_date, ' ', sm.send_time) <= NOW()
    `);

    for (const msg of dueMsgs) {
      // Atomic claim. If another run (or a second server) already took this row
      // the affected count is 0 and we skip it, so a message can never be sent
      // twice even if two cron ticks overlap.
      const [claim] = await db.query(
        `UPDATE crm_scheduled_messages
         SET send_status = 'sending', attempted_on = NOW()
         WHERE id = ? AND is_sent = 0 AND send_status IS NULL AND is_deleted = 0`,
        [msg.id]
      );
      if (claim.affectedRows !== 1) continue;

      const markFailed = async (reason) => {
        const text = String(reason && reason.message ? reason.message : reason).slice(0, 255);
        console.error(`Failed to send scheduled message id=${msg.id}: ${text}`);
        await db.query(
          `UPDATE crm_scheduled_messages
           SET is_sent = 0, send_status = 'failed', failure_reason = ?, modified_on = NOW()
           WHERE id = ?`,
          [text, msg.id]
        );
      };

      try {
      let bodyToSend = (msg.message_body || '')
        .replace(/Pay securely here:\s*https?:\/\/\S+/g, '')
        .replace(/Secure Payment Link:\s*\[Secure payment link will be added automatically\]/g, '')
        .replace(/\[Secure payment link will be added automatically\]/g, '')
        .trim();

      const needsPayLink = msg.attach_pay_link === 1 || msg.attach_pay_link === true;
      if (needsPayLink && msg.pay_link_amount != null) {
      let cartItems = [];
      let hasPhysical = false;
      let disc = {};
      let msgDisc = null;
      try {
        cartItems = JSON.parse(msg.items_json || '[]');
        hasPhysical = cartItems.some(i => i.type === 'P' || !i.type);
        disc = (() => { try { return JSON.parse(msg.invoice_discount_details || '{}'); } catch (e) { return {}; } })();
        msgDisc = (() => { try { return JSON.parse(msg.discount_details || 'null'); } catch (e) { return null; } })();
      } catch (e) { /* ignore */ }

      // Per-type scheduled discounts stored on THIS message. When present they
      // take precedence over the legacy proportional split of the whole
      // cumulative discount. Existing tokens are reused so the SAME checkout
      // URLs reflect updated discounts instead of minting brand new links.
      const hasPerType = msgDisc && msgDisc !== true
        && (msgDisc.listing !== undefined || msgDisc.membership !== undefined || msgDisc.ads !== undefined);
      const listingSchedDisc = hasPerType ? (parseFloat(msgDisc.listing) || 0) : null;
      const membershipSchedDisc = hasPerType ? (parseFloat(msgDisc.membership) || 0) : null;

      // Per-item custom discounts (listing / membership) persisted on the invoice —
      // each rides only on ITS OWN checkout link.
      const pid = disc.perItemDiscounts || {};
      const perItemCustomAmount = (type) => {
        const cfg = pid[type] || {};
        const v = parseFloat(cfg.value) || 0;
        const typeItems = cartItems.filter(i => i.type === type);
        const base = typeItems.reduce((sum, i) => sum + ((parseFloat(i.price) || 0) * (parseInt(i.quantity, 10) || 1)), 0);
        return cfg.type === 'percent' ? base * (v / 100) : Math.min(base, v);
      };
      const listingCustomDiscount = perItemCustomAmount('L');
      const membershipCustomDiscount = perItemCustomAmount('M');

      // Mint ONE secure hex-token link per product type (listing vs membership).
      // For physical (seat-cover) carts the real link is already embedded, so skip.
      // Also skip when a real payment link was already embedded at schedule time,
      // so we never replace the correct link with duplicate random-token links.
      if (!hasPhysical && !/https?:\/\/\S+/.test(bodyToSend)) {
        const nameParts = (msg.customer_name || '').trim().split(' ');
        const links = await mintCheckoutLinks({
          items: cartItems,
          subtotal: parseFloat(msg.subtotal) || 0,
          customDiscount: parseFloat(disc.customValue) || 0,
          listingCustomDiscount,
          membershipCustomDiscount,
          couponDiscount: parseFloat(disc.couponDiscount) || 0,
          couponCode: disc.couponCode || null,
          scheduledDiscount: parseFloat(disc.cumulativeScheduledDiscount) || 0,
          listingScheduledDiscount: listingSchedDisc,
          membershipScheduledDiscount: membershipSchedDisc,
          listingToken: disc.listingLinkToken || null,
          membershipToken: disc.membershipLinkToken || null,
          offerExpiry: disc.offerExpiry || null,
          email: msg.customer_email,
          firstName: nameParts[0] || '',
          lastName: nameParts.slice(1).join(' ') || '',
          phone: msg.lead_phone,
          agentId: 1,
          ipAddress: '127.0.0.1',
          expiresIn: '7 Days',
        });
        const linksText = [
          links.listingLink && `Listing link: ${links.listingLink}`,
          links.membershipLink && `Membership Link: ${links.membershipLink}`,
        ].filter(Boolean).join('\n');
        bodyToSend = `${bodyToSend}\n\n${linksText}`;
      }
      }

      if (msg.message_type === 'sms') {
        if (!msg.lead_phone) throw new Error('No lead phone number on this invoice');
        // Catch obviously malformed numbers before spending a Twilio call.
        if (!/^\+[1-9]\d{6,14}$/.test(String(msg.lead_phone).trim())) {
          throw new Error(`Invalid destination number "${msg.lead_phone}"`);
        }
        await client.messages.create({
          body: bodyToSend,
          from: process.env.TWILIO_PHONE_NUMBER || '+14155189121',
          to: msg.lead_phone,
        });
      } else {
        // Email delivery is not wired up yet. Previously this fell through and
        // marked the row is_sent=1, which showed "Sent" for a message that was
        // never actually delivered. Report it as failed instead.
        throw new Error(`Scheduled ${msg.message_type} delivery is not implemented yet`);
      }

      await db.query(
        `UPDATE crm_scheduled_messages
         SET is_sent = 1, send_status = 'sent', failure_reason = NULL, modified_on = NOW()
         WHERE id = ?`,
        [msg.id]
      );

      } catch (sendErr) {
        // Recorded as failed and left alone: this message is never retried.
        // Contained so a DB error while logging cannot abort the rest of the
        // batch - the other due messages still get their own attempt.
        try {
          await markFailed(sendErr);
        } catch (logErr) {
          console.error(`Failed to record failure for scheduled message id=${msg.id}:`, logErr.message);
        }
      }
    }

  } catch (error) {
    console.error("sendScheduledMessages cron error:", error);
  }
};

exports.chargeInvoice = async (req, res) => {
  const { invoiceId, invoiceNumber, userId: reqUserId, customerData, cart, subtotal, discountAmount, shippingCost, totalDue, amountPaid, paymentType } = req.body;

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // ==========================================
    // 1. RESOLVE ACCOUNT (STRICT EMAIL MATCHING)
    // ==========================================
    let userId = null;

    // ALWAYS lookup by email first to ensure the purchase is tied to the correct billing customer
    if (customerData.email) {
      const [existingUsers] = await connection.query('SELECT id FROM global_limo_user WHERE email = ?', [customerData.email]);

      if (existingUsers.length > 0) {
        userId = existingUsers[0].id; // This will correctly grab 1550
      } else {
        const generatedPassword = crypto.randomBytes(4).toString('hex');
        const hashedPassword = await bcrypt.hash(generatedPassword, 10);

        const [newUser] = await connection.query(
          `INSERT INTO global_limo_user (firstname, lastname, email, cellnumber, address, password, group_id, lang_id, created_on, password_status) VALUES (?, ?, ?, ?, ?, ?, 4, 1, NOW(), 0)`,
          [customerData.firstName, customerData.lastName, customerData.email, customerData.phone, customerData.address, hashedPassword]
        );
        userId = newUser.insertId;
      }
    }

    // Fallback if no email was provided (highly unlikely)
    if (!userId) {
      userId = reqUserId;
    }

    if (!userId) throw new Error("Could not resolve or create user account for this invoice.");

    // ==========================================
    // 2. SEPARATE CART & QUERY REAL DB PRODUCTS
    // ==========================================
    const physicalItems = [];
    const digitalItems = [];

    for (let item of cart) {
      const isDigital = (item.type === 'M' || item.type === 'L');

      if (isDigital) {
        const saleType = item.type === 'M' ? 2 : 1; // 2 = Membership, 1 = Listing

        // Lookup real product ID and listing count using closest price match
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
        // Physical Items
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

    // ==========================================
    // 3. ACTIVATE MEMBERSHIPS & LISTINGS
    // ==========================================
    for (let dItem of digitalItems) {
      const saleType = dItem.type === 'M' ? 2 : 1;

      // Insert Header Row with STRICT status flags and is_deleted = 0
      const [saleOrderResult] = await connection.query(`
        INSERT INTO sale_order 
        (user_id, type, firstname, lastname, email, cellnumber, total, payment_status, status, is_deleted, created_on, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 0, NOW(), ?)
      `, [userId, saleType, customerData.firstName || '', customerData.lastName || '', customerData.email || '', customerData.phone || '', dItem.actualPrice, userId]);

      const saleOrderId = saleOrderResult.insertId;

      // Insert Bridge Row with REAL Product ID and Listing Count
      await connection.query(`
        INSERT INTO sale_order_product 
        (order_id, product_id, name, display_name, listing_count, price, created_on) 
        VALUES (?, ?, ?, ?, ?, ?, NOW())
      `, [saleOrderId, dItem.productId, dItem.dbName, dItem.dbName, dItem.listingCount, dItem.actualPrice]);

      if (dItem.type === 'M') {
        const [subResult] = await connection.query(`
          INSERT INTO user_subscription_package 
          (user_id, order_id, product_id, amount, base_total, start_date, end_date, status, is_deleted, created_on) 
          VALUES (?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR), 1, 0, NOW())
        `, [userId, saleOrderId, dItem.productId, dItem.actualPrice, dItem.actualPrice]);

        await connection.query(`
          INSERT INTO user_subscription_payments 
          (subscription_id, amount, status, payment_status, is_deleted, created_on) 
          VALUES (?, ?, 1, 1, 0, NOW())
        `, [subResult.insertId, dItem.actualPrice]);
      } else if (dItem.type === 'L') {
        await connection.query(`
          INSERT INTO user_subscription_package 
          (user_id, order_id, product_id, amount, base_total, start_date, status, is_deleted, created_on) 
          VALUES (?, ?, ?, ?, ?, NOW(), 1, 0, NOW())
        `, [userId, saleOrderId, dItem.productId, dItem.actualPrice, dItem.actualPrice]);
      }
    }

    // ==========================================
    // 4. PROCESS PHYSICAL SEAT COVERS
    // ==========================================
    if (physicalItems.length > 0) {
      const busDetail = physicalItems.map(item =>
        `${item.dbName} x${item.quantity || item.qty || 1} (${item.selectedColor || 'Standard'} - ${item.selectedPattern || 'Standard'})`
      ).join(' | ');

      const payStatus = paymentType === 'deposit' ? 2 : 1;

      const [orderResult] = await connection.query(
        `INSERT INTO orders 
        (user_id, type, business_name, firstname, lastname, email, phone_code, cellnumber, alt_phone,
         bus_detail, bus_detail_2, broker, city_id, state_id, country_id, city, state, country, 
         address, zipcode, order_city, order_state, order_country, order_zipcode, order_address, 
         total_price, order_amount, payment_status, paid_amount, 
         order_from, website_id, orders_status, status, is_deleted, created_on, created_by, modified_on) 
        VALUES (?, 1, '', ?, ?, ?, 0, ?, 0, ?, ?, '', 0, 0, 0, ?, ?, '', ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, 'crm', 0, 1, 1, 0, NOW(), ?, NOW())`,
        [
          userId, customerData.firstName, customerData.lastName, customerData.email, customerData.phone,
          busDetail, busDetail, customerData.city, customerData.state, customerData.address, customerData.zip,
          customerData.city, customerData.state, customerData.zip, customerData.address,
          totalDue.toString(), totalDue, payStatus, amountPaid, userId
        ]
      );

      const physicalOrderId = orderResult.insertId;

      for (let item of physicalItems) {
        const qty = item.quantity || item.qty || 1;
        const totalValue = item.actualPrice * qty;
        const variantDesc = `${item.selectedColor || 'Standard'} - ${item.selectedPattern || 'Standard'}`;

        await connection.query(
          `INSERT INTO order_items (order_id, category, product, description, ndr, discount, disc_price, qty, total_price, created_at) 
          VALUES (?, 0, ?, ?, ?, 0, ?, ?, ?, NOW())`,
          [physicalOrderId, item.productId, variantDesc, Math.round(item.actualPrice), Math.round(item.actualPrice), qty, Math.round(totalValue)]
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

// GET /invoices/coupon/:code
exports.getCouponDetails = async (req, res) => {
  const code = (req.params.code || '').trim().toUpperCase();
  if (!code) {
    return res.json({ success: false, message: 'No coupon code provided' });
  }

  try {
    const [rows] = await db.query(
      `SELECT id, code, type, discount, end_date, association_id
       FROM sale_order_coupon
       WHERE UPPER(code) = ?
         AND status = 1
         AND is_deleted = 0
       LIMIT 1`,
      [code]
    );

    if (!rows.length) {
      return res.json({ success: false, message: 'Invalid or expired coupon code' });
    }

    const coupon = rows[0];

    // Check expiry
    if (coupon.end_date && coupon.end_date !== '0000-00-00') {
      const today = new Date().toISOString().slice(0, 10);
      if (coupon.end_date < today) {
        return res.json({ success: false, message: 'This coupon has expired' });
      }
    }

    // ── NEW: fetch per-sale_product discount overrides for this coupon ──
    // coupon_items.item_id -> sale_products.id (Listing / Membership / Ads package)
    const [itemRows] = await db.query(
      `SELECT item_id, discount_type, discount
       FROM coupon_items
       WHERE coupon_id = ?
         AND status = 1
         AND is_deleted = 0`,
      [coupon.id]
    );

    const items = itemRows.map(r => ({
      itemId: r.item_id,
      // normalize whatever label is stored ("Flat Amount", "Fixed", "Percentage"...) into flat|percent
      discountType: /percent/i.test(r.discount_type) ? 'percent' : 'flat',
      discount: Number(r.discount) || 0,
    }));

    return res.json({
      success: true,
      code: coupon.code,
      discountType: Number(coupon.type) === 1 ? 'percent' : 'flat', // fallback for whole-cart use
      discountValue: Number(coupon.discount) || 0,
      items, // per sale_products.id overrides — used when cart contains a matching listing/membership/ads
      associationId: coupon.association_id || null,
    });
  } catch (err) {
    console.error('Coupon lookup failed:', err);
    return res.json({ success: false, message: 'Failed to validate coupon' });
  }
};

// ── GET all invoices that belong to a contact (matched by userId, preferenceIds,
//    phone number, or email). Used by the inbox "Assign Lead" popup to show all
//    invoices for the current thread. ────────────────────────────────────────
exports.getInvoicesByContact = async (req, res) => {
  try {
    const { userId, preferenceIds, phone, email } = req.query || {};

    const conditions = [];
    const params = [];

    // Match by global_limo_user.id
    if (userId && userId !== 'null') {
      conditions.push('user_id = ?');
      params.push(Number(userId));
    }

    // Match by preference_id (legacy user_preferences.id)
    if (preferenceIds) {
      const ids = String(preferenceIds).split(',').map(Number).filter(Boolean);
      if (ids.length > 0) {
        conditions.push(`preference_id IN (${ids.map(() => '?').join(',')})`);
        params.push(...ids);
      }
    }

    // Match by phone (last 10 digits, with or without + prefix)
    if (phone && phone !== 'null') {
      const short = phone.replace(/\D/g, '').slice(-10);
      if (short.length >= 7) {
        conditions.push('REPLACE(lead_phone, "+", "") LIKE ?');
        params.push(`%${short}`);
      }
    }

    // Match by customer email
    if (email && email !== 'null' && email !== 'No email provided') {
      conditions.push('customer_email = ?');
      params.push(email);
    }

    if (conditions.length === 0) {
      return res.json({ success: true, invoices: [] });
    }

    const [rows] = await db.query(
      `SELECT * FROM crm_invoices WHERE is_deleted = 0 AND (${conditions.join(' OR ')}) ORDER BY created_on DESC`,
      params
    );

    res.json({ success: true, invoices: rows });
  } catch (error) {
    console.error("Fetch Invoices By Contact Error:", error);
    res.status(500).json({ success: false, message: "Database error" });
  }
};