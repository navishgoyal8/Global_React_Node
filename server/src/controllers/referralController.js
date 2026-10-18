const crypto = require('crypto');
const db = require('../config/db'); 
const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);
const MY_TWILIO_NUMBER = process.env.TWILIO_PHONE_NUMBER || '+13239907701';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ── Helpers ──
const sendSms = async (to, message) => { 
  console.log('[referral] Sending SMS ->', to, message); 
  try {
    await client.messages.create({ body: message, from: MY_TWILIO_NUMBER, to: to });
  } catch (error) {
    console.error('[referral] Twilio Send Error:', error);
    throw error;
  }
};

const sendEmail = async (to, subject, body) => { 
    // Replace with your actual email logic later
    console.log('[referral] EMAIL ->', to, subject); 
};

const getIp = (req) => (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim() || null;
const getUserId = (req) => req.user?.id || req.body?.agentId || null;

const parseForm = (v) => {
    if (v && typeof v === 'object') return v;
    try { return JSON.parse(v || '{}'); } catch { return {}; }
};
const stampOf = (d) => {
    const dt = new Date(d);
    return `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}`;
};

const toClient = (r) => ({
    id: r.id,
    vehicleKey: r.vehicle_key,
    form: parseForm(r.form_json),
    status: r.agreement_status,
    stamp: stampOf(r.created_on),
    sentAt: r.sent_at,
    signedAt: r.signed_at,
});

const signLink = (token) => `${FRONTEND_URL}/sales/crm/referral-agreement/${token}`;
const ACTIVE = 'is_deleted = 0 AND status = 1';

// ── CRM Agent Endpoints ──

// POST /referrals/send
exports.saveAndSendReferral = async (req, res) => {
    try {
        const { invoiceId, vehicleKey, form, sendMethod } = req.body || {};
        const method = ['sms', 'email', 'both', 'manual'].includes(sendMethod) ? sendMethod : 'both';
        
        if (!invoiceId || !vehicleKey || !form) {
            return res.status(400).json({ success: false, message: 'Missing required fields.' });
        }

        const cName = form.fullName || '';
        const cEmail = form.email || '';
        const cPhone = form.phone || '';

        const token = crypto.randomBytes(32).toString('hex');
        
        const isManual = method === 'manual' || form.sendTo === 'manual';
        const initialStatus = isManual ? 'manual' : 'sent';

        const [ins] = await db.query(
            `INSERT INTO vehicle_referrals
             (crm_invoice_id, vehicle_key, customer_name, customer_email, customer_phone, form_json,
              agreement_status, sign_token, sent_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [invoiceId, String(vehicleKey), cName, cEmail, cPhone, JSON.stringify(form), initialStatus, token]
        );

        let delivery = { sms: false, email: false };

        if (!isManual) {
            const text = `Hi ${cName.split(' ')[0]}, please review and sign your referral fee agreement: ${signLink(token)}`;
            
            if (method === 'sms' || method === 'both') {
                try { await sendSms(cPhone, text); delivery.sms = true; } 
                catch (e) { delivery.sms = false; }
            }
            if (method === 'email' || method === 'both') {
                try { await sendEmail(cEmail, `Referral Agreement - ${cName}`, text); delivery.email = true; } 
                catch (e) { delivery.email = false; }
            }
            
            if (!delivery.sms && !delivery.email) {
                return res.status(502).json({ success: false, message: 'Saved, but the agreement link could not be delivered.' });
            }
        }

        res.json({ success: true, referralId: ins.insertId, delivery, status: initialStatus });
    } catch (err) {
        console.error('saveAndSend referral error:', err);
        res.status(500).json({ success: false, message: 'Server error saving referral.' });
    }
};

// GET /referrals?invoiceId=123
exports.listByInvoice = async (req, res) => {
    try {
        const invoiceId = parseInt(req.query.invoiceId, 10);
        if (!invoiceId) return res.status(400).json({ success: false, message: 'invoiceId is required.' });
        const [rows] = await db.query(
            `SELECT * FROM vehicle_referrals WHERE crm_invoice_id = ? AND ${ACTIVE} ORDER BY id ASC`, [invoiceId]
        );
        res.json({ success: true, referrals: rows.map(toClient) });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// DELETE /referrals/:id
exports.remove = async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT agreement_status FROM vehicle_referrals WHERE id = ? AND is_deleted = 0`, [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Not found.' });
        if (rows[0].agreement_status === 'signed') {
            return res.status(409).json({ success: false, message: 'A signed agreement cannot be removed.' });
        }
        await db.query(
            'UPDATE vehicle_referrals SET is_deleted = 1, modified_by = ?, ip_address = ? WHERE id = ?',
            [getUserId(req), getIp(req), req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// POST /referrals/by-vehicle/void
exports.voidForVehicle = async (req, res) => {
    try {
        const { invoiceId, vehicleKey } = req.body || {};
        if (!invoiceId || !vehicleKey) return res.status(400).json({ success: false, message: 'invoiceId and vehicleKey are required.' });
        await db.query(
            `UPDATE vehicle_referrals SET is_deleted = 1, modified_by = ?, ip_address = ?
             WHERE crm_invoice_id = ? AND vehicle_key = ? AND agreement_status = 'sent' AND is_deleted = 0`,
            [getUserId(req), getIp(req), invoiceId, String(vehicleKey)]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// POST /referrals/upload-pdf
exports.uploadPdf = async (req, res) => {
    try {
        const { referralId, pdfData } = req.body || {};
        if (!referralId || !pdfData) return res.status(400).json({ success: false, message: 'Missing PDF data or ID.' });
        await db.query(`UPDATE vehicle_referrals SET signed_pdf_data = ? WHERE id = ?`, [pdfData, referralId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error saving PDF.' });
    }
};

// ── Public (Customer) Endpoints ──

// GET /referrals/public/:token
exports.getByToken = async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT * FROM vehicle_referrals WHERE sign_token = ? AND ${ACTIVE}`, [req.params.token]);
        const c = rows[0];
        if (!c) return res.status(404).json({ success: false, message: 'Agreement not found or no longer valid.' });
        res.json({
            success: true,
            agreement: {
                id: c.id,
                status: c.agreement_status,
                customerName: c.customer_name,
                form: parseForm(c.form_json),
                signedAt: c.signed_at,
                signedName: c.signed_name,
                signature: c.signature_image,
                customerDate: c.customer_date,
                dealerDate: c.dealer_date
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// POST /referrals/public/:token/sign
exports.sign = async (req, res) => {
    try {
        const { signedName, signature, signedDate, dealerDate, agree } = req.body || {};
        if (!agree || !String(signedName || '').trim() || !signature) {
            return res.status(400).json({ success: false, message: 'Please draw your signature, type your full name, and accept the agreement.' });
        }
        
        const ip = getIp(req);
        const ua = String(req.headers['user-agent'] || '').slice(0, 255);
        
        const [r] = await db.query(
            `UPDATE vehicle_referrals
             SET agreement_status = 'signed', signed_at = NOW(), signed_name = ?, signature_image = ?, 
                 customer_date = ?, dealer_date = ?, signed_ip = ?, signed_user_agent = ?, ip_address = ?
             WHERE sign_token = ? AND agreement_status = 'sent' AND ${ACTIVE}`,
            [String(signedName).trim(), signature, signedDate || null, dealerDate || null, ip, ua, ip, req.params.token]
        );
        
        if (!r.affectedRows) return res.status(409).json({ success: false, message: 'This agreement is already signed or no longer valid.' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};