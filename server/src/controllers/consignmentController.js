const crypto = require('crypto');
const db = require('../config/db'); 
const twilio = require('twilio');
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);
const MY_TWILIO_NUMBER = '+13239907701'

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Wire these to your existing Twilio / email code (e.g. emailController helpers)
const sendSms = async (to, message) => { 
  
  try {
    await client.messages.create({
      body: message,
      from: MY_TWILIO_NUMBER,
      to: to
    });
  } catch (error) {
    console.error('[consignment] Twilio Send Error:', error);
    throw error; // Throwing this error allows saveAndSend to catch it and mark delivery.sms = false
  }
};

const sendEmail = async (to, subject, body) => { console.log('[consignment] EMAIL ->', to, subject); };

const getIp = (req) =>
    (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim() || null;
const getUserId = (req) => req.user?.id || req.body?.agentId || null;

const parseForm = (v) => {
    if (v && typeof v === 'object') return v;
    try { return JSON.parse(v || '{}'); } catch { return {}; }
};
const stampOf = (d) => {
    const dt = new Date(d);
    return `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}`;
};
// Frontend still reads `status` as 'sent' | 'signed', so map agreement_status onto it.
const toClient = (r) => ({
    id: r.id,
    vehicleKey: r.vehicle_key,
    form: parseForm(r.form_json),
    status: r.agreement_status,
    stamp: stampOf(r.created_on),
    sentAt: r.sent_at,
    signedAt: r.signed_at,
});
const signLink = (token) => `${FRONTEND_URL}/sales/crm/consignment-agreement/${token}`;

const ACTIVE = 'is_deleted = 0 AND status = 1';

// POST /consignments
exports.saveAndSend = async (req, res) => {
    try {
        const { invoiceId, vehicleKey, consignmentId, form, seller, sendMethod } = req.body || {};
        const method = ['sms', 'email', 'both'].includes(sendMethod) ? sendMethod : 'both';
        const wantSms = method !== 'email';
        const wantEmail = method !== 'sms';

        if (!invoiceId || !vehicleKey || !form) {
            return res.status(400).json({ success: false, message: 'invoiceId, vehicleKey and form are required.' });
        }
        const [inv] = await db.query('SELECT id FROM crm_invoices WHERE id = ?', [invoiceId]);
        if (!inv.length) return res.status(404).json({ success: false, message: 'Invoice not found.' });

        const sName = (seller?.name || '').trim() || null;
        const sEmail = (seller?.email || '').trim() || null;
        const sPhone = (seller?.phone || '').trim() || null;

        if (wantSms && !sPhone) {
            return res.status(400).json({ success: false, message: 'No phone number found for this customer. Add one in the Customer section, or send via email.' });
        }
        if (wantEmail && !sEmail) {
            return res.status(400).json({ success: false, message: 'No email found for this customer. Add one in the Customer section, or send via SMS.' });
        }

        const ip = getIp(req);
        const userId = getUserId(req);
        let id;

        if (consignmentId) {
            const [rows] = await db.query(
                `SELECT id, agreement_status FROM vehicle_consignments WHERE id = ? AND crm_invoice_id = ? AND ${ACTIVE}`,
                [consignmentId, invoiceId]
            );
            if (!rows.length) return res.status(404).json({ success: false, message: 'Consignment not found.' });
            if (rows[0].agreement_status === 'signed') {
                return res.status(409).json({ success: false, message: 'This agreement is already signed and can no longer be edited.' });
            }
            await db.query(
                `UPDATE vehicle_consignments
            SET form_json = ?, seller_name = ?, seller_email = ?, seller_phone = ?,
                agreement_status = 'sent', sent_at = NOW(), modified_by = ?, ip_address = ?
          WHERE id = ?`,
                [JSON.stringify(form), sName, sEmail, sPhone, userId, ip, consignmentId]
            );
            id = consignmentId;
        } else {
            const token = crypto.randomBytes(32).toString('hex'); // 64 hex chars
            const [ins] = await db.query(
                `INSERT INTO vehicle_consignments
           (crm_invoice_id, vehicle_key, seller_name, seller_email, seller_phone, form_json,
            agreement_status, sign_token, sent_at, modified_by, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, 'sent', ?, NOW(), ?, ?)`,
                [invoiceId, String(vehicleKey), sName, sEmail, sPhone, JSON.stringify(form), token, userId, ip]
            );
            id = ins.insertId;
        }

        const [fresh] = await db.query('SELECT * FROM vehicle_consignments WHERE id = ?', [id]);
        const c = fresh[0];

        const vehicleLabel = [form.year, form.make, form.model].filter(Boolean).join(' ') || 'your vehicle';
        const text = `Hi${sName ? ' ' + sName.split(' ')[0] : ''}, please review and sign the consignment agreement for ${vehicleLabel}: ${signLink(c.sign_token)}`;
        const delivery = { sms: null, email: null };
        if (wantSms) {
            try { await sendSms(sPhone, text); delivery.sms = true; } catch (e) { delivery.sms = false; console.error('SMS failed', e); }
        }
        if (wantEmail) {
            try { await sendEmail(sEmail, `Consignment agreement - ${vehicleLabel}`, text); delivery.email = true; } catch (e) { delivery.email = false; console.error('Email failed', e); }
        }

        if (delivery.sms !== true && delivery.email !== true) {
            return res.status(502).json({ success: false, message: 'Saved, but the agreement link could not be delivered. Please try again.' });
        }

        const delivered = delivery.sms === true || delivery.email === true;
        res.json({ 
            success: true, 
            consignment: toClient(c), 
            delivery, 
            warning: delivered ? null : 'Saved, but the agreement link could not be delivered. Please try again.'
        });
    } catch (err) {
        console.error('saveAndSend consignment error:', err);
        res.status(500).json({ success: false, message: 'Server error while saving the consignment.' });
    }
};

// GET /consignments?invoiceId=123
exports.listByInvoice = async (req, res) => {
    try {
        const invoiceId = parseInt(req.query.invoiceId, 10);
        if (!invoiceId) return res.status(400).json({ success: false, message: 'invoiceId is required.' });
        const [rows] = await db.query(
            `SELECT * FROM vehicle_consignments WHERE crm_invoice_id = ? AND ${ACTIVE} ORDER BY id ASC`,
            [invoiceId]
        );
        res.json({ success: true, consignments: rows.map(toClient) });
    } catch (err) {
        console.error('list consignments error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// DELETE /consignments/:id  (soft delete; signed agreements cannot be removed)
exports.remove = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT agreement_status FROM vehicle_consignments WHERE id = ? AND is_deleted = 0`, [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'Not found.' });
        if (rows[0].agreement_status === 'signed') {
            return res.status(409).json({ success: false, message: 'A signed agreement cannot be removed.' });
        }
        await db.query(
            'UPDATE vehicle_consignments SET is_deleted = 1, modified_by = ?, ip_address = ? WHERE id = ?',
            [getUserId(req), getIp(req), req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('remove consignment error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// POST /consignments/by-vehicle/void  { invoiceId, vehicleKey }  (vehicle left the cart)
exports.voidForVehicle = async (req, res) => {
    try {
        const { invoiceId, vehicleKey } = req.body || {};
        if (!invoiceId || !vehicleKey) return res.status(400).json({ success: false, message: 'invoiceId and vehicleKey are required.' });
        await db.query(
            `UPDATE vehicle_consignments SET is_deleted = 1, modified_by = ?, ip_address = ?
        WHERE crm_invoice_id = ? AND vehicle_key = ? AND agreement_status = 'sent' AND is_deleted = 0`,
            [getUserId(req), getIp(req), invoiceId, String(vehicleKey)]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// ── PUBLIC (seller) endpoints, token based ───────────────────────────────────

// GET /consignments/public/:token
exports.getByToken = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT * FROM vehicle_consignments WHERE sign_token = ? AND ${ACTIVE}`, [req.params.token]
        );
        const c = rows[0];
        if (!c) return res.status(404).json({ success: false, message: 'Agreement not found or no longer valid.' });
        res.json({
            success: true,
            agreement: {
                id: c.id,
                status: c.agreement_status,
                sellerName: c.seller_name,
                sellerEmail: c.seller_email,
                sellerPhone: c.seller_phone,
                form: parseForm(c.form_json),
                signedAt: c.signed_at,
                signedName: c.signed_name,
                signature: c.signature_image,
                ownerDate: c.owner_date,
                dealerDate: c.dealer_date,
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// POST /consignments/public/:token/sign  { signedName, agree: true }
exports.sign = async (req, res) => {
    try {
        const { signedName,signature,signedDate,dealerDate, agree } = req.body || {};
        if (!agree || !String(signedName || '').trim() || !signature) {
            return res.status(400).json({ success: false, message: 'Please type your full name and accept the agreement.' });
        }

        const ip = getIp(req);
        const ua = String(req.headers['user-agent'] || '').slice(0, 255);

        const [r] = await db.query(
            `UPDATE vehicle_consignments
             SET agreement_status = 'signed', 
                 signed_at = NOW(), 
                 signed_name = ?, 
                 signature_image = ?, 
                 owner_date = ?, 
                 dealer_date = ?, 
                 signed_ip = ?,
                 signed_user_agent = ?, 
                 ip_address = ?
             WHERE sign_token = ? AND agreement_status = 'sent' AND ${ACTIVE}`,
            [
                String(signedName).trim(), 
                signature, 
                signedDate || null, 
                dealerDate || null, 
                ip, 
                ua, 
                ip, 
                req.params.token
            ]
        );

        if (!r.affectedRows) {
            return res.status(409).json({ 
                success: false, 
                message: 'This agreement is already signed or no longer valid.' });
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('sign consignment error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};