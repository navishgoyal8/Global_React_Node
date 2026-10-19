const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');

const OTP_TTL_MIN = 10;
const RESEND_COOLDOWN_SEC = 30;
const MAX_ATTEMPTS = 5;

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const digitsOnly = (v) => String(v || '').replace(/\D/g, '');

const normalizeId = (raw) => {
  const v = String(raw || '').trim();
  if (isEmail(v)) return { type: 'email', value: v.toLowerCase() };
  const d = digitsOnly(v);
  if (d.length >= 7) return { type: 'phone', value: d };
  return null;
};

const hashOtp = (identifier, otp) =>
  crypto.createHmac('sha256', process.env.OTP_SECRET).update(`${identifier}:${otp}`).digest('hex');

const findUser = async (id) => {
  if (id.type === 'email') {
    const [rows] = await db.query(
      'SELECT id, firstname, lastname, email, cellnumber, address FROM global_limo_user WHERE LOWER(email) = ? LIMIT 1',
      [id.value]
    );
    return rows[0] || null;
  }

  const tail = id.value.slice(-10);
  const [rows] = await db.query(
    `SELECT id, firstname, lastname, email, cellnumber, address FROM global_limo_user
     WHERE RIGHT(REGEXP_REPLACE(cellnumber, '[^0-9]', ''), 10) = ? LIMIT 1`,
    [tail]
  );
  return rows[0] || null;
};

const buildUserPayload = async (u) => {
  let city = '', state = '', zip = '', address = u.address || '';
  try {
    const [o] = await db.query(
      'SELECT order_address, order_city, order_state, order_zipcode FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 1',
      [u.id]
    );
    if (o[0]) {
      address = o[0].order_address || address;
      city = o[0].order_city || '';
      state = o[0].order_state || '';
      zip = o[0].order_zipcode || '';
    }
  } catch (e) { /* prefill is best-effort */ }
  return {
    id: u.id,
    firstName: u.firstname || '',
    lastName: u.lastname || '',
    email: u.email || '',
    phone: u.cellnumber || '',
    address, city, state, zip,
  };
};

const signSession = (u) =>
  jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET, { expiresIn: '7d' });

exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;

        const [users] = await db.query(
            "SELECT * FROM crm_users WHERE (username = ? OR email = ?) AND status = 1 AND is_deleted = 0 LIMIT 1", 
            [username, username]
        );

        if (users.length === 0) {
            return res.status(401).json({ success: false, message: "Invalid credentials or inactive account" });
        }

        const user = users[0];

        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Invalid username or password" });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role }, 
            process.env.JWT_SECRET || 'your_super_secret_key_123', 
            { expiresIn: '1d' }
        );

        res.status(200).json({ 
            success: true, 
            token, 
            user: { id: user.id, name: user.name, role: user.role } 
        });

    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ success: false, message: "Server error during login" });
    }
};

exports.sendOtp = async (req, res) => {

  const id = normalizeId(req.body.identifier);
  if (!id) return res.status(400).json({ success: false, message: 'Enter a valid email or phone number.' });

  try {
    
    const [recent] = await db.query(
      'SELECT created_on FROM auth_otps WHERE identifier = ? ORDER BY id DESC LIMIT 1',
      [id.value]
    );
    if (recent[0]) {
      const ageSec = (Date.now() - new Date(recent[0].created_on).getTime()) / 1000;
      if (ageSec < RESEND_COOLDOWN_SEC) {
        return res.status(429).json({ success: false, message: 'Please wait a moment before requesting another code.' });
      }
    }

    const user = await findUser(id);

    if (user) {
      const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      await db.query('UPDATE auth_otps SET used = 1 WHERE identifier = ? AND used = 0', [id.value]);
      await db.query(
        'INSERT INTO auth_otps (identifier, otp_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))',
        [id.value, hashOtp(id.value, otp), OTP_TTL_MIN]
      );

      if (id.type === 'email') {
        await mailer.sendMail({
          from: process.env.MAIL_FROM,
          to: user.email,
          subject: 'Your login code',
          text: `Your verification code is ${otp}. It expires in ${OTP_TTL_MIN} minutes. If you didn't request it, ignore this email.`,
        });
      } else if (twilioClient) {
        await twilioClient.messages.create({
          from: process.env.TWILIO_PHONE_NUMBER,
          to: `+${id.value}`,
          body: `Your verification code is ${otp}. It expires in ${OTP_TTL_MIN} minutes.`,
        });
      } else {
        console.warn('[auth] SMS requested but Twilio is not configured');
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('sendOtp error:', err);
    res.status(500).json({ success: false, message: 'Could not send the code. Please try again.' });
  }
};

exports.verifyOtp = async (req, res) => {
  const id = normalizeId(req.body.identifier);
  const otp = String(req.body.otp || '').trim();
  const genericFail = { success: false, message: 'Invalid or expired code.' };
  if (!id || !/^\d{6}$/.test(otp)) return res.status(400).json(genericFail);

  try {
    const [rows] = await db.query(
      `SELECT id, otp_hash, attempts FROM auth_otps
       WHERE identifier = ? AND used = 0 AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1`,
      [id.value]
    );
    const row = rows[0];
    if (!row) return res.status(400).json(genericFail);

    if (row.attempts >= MAX_ATTEMPTS) {
      await db.query('UPDATE auth_otps SET used = 1 WHERE id = ?', [row.id]);
      return res.status(429).json({ success: false, message: 'Too many attempts. Request a new code.' });
    }

    const given = Buffer.from(hashOtp(id.value, otp), 'hex');
    const stored = Buffer.from(row.otp_hash, 'hex');
    const ok = given.length === stored.length && crypto.timingSafeEqual(given, stored);

    if (!ok) {
      await db.query('UPDATE auth_otps SET attempts = attempts + 1 WHERE id = ?', [row.id]);
      return res.status(400).json(genericFail);
    }

    await db.query('UPDATE auth_otps SET used = 1 WHERE id = ?', [row.id]);

    const user = await findUser(id);
    if (!user) return res.status(400).json(genericFail);

    const payload = await buildUserPayload(user);
    res.json({ success: true, user: payload, token: signSession(payload) });
  } catch (err) {
    console.error('verifyOtp error:', err);
    res.status(500).json({ success: false, message: 'Verification failed. Please try again.' });
  }
};

exports.googleLogin = async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ success: false, message: 'Missing Google credential.' });

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const g = ticket.getPayload();
    if (!g || !g.email || !g.email_verified) {
      return res.status(401).json({ success: false, message: 'Google email is not verified.' });
    }

    const user = await findUser({ type: 'email', value: g.email.toLowerCase() });

    if (user) {
      const payload = await buildUserPayload(user);
      return res.json({ success: true, user: payload, token: signSession(payload) });
    }

    res.json({
      success: true,
      user: {
        id: null,
        firstName: g.given_name || '',
        lastName: g.family_name || '',
        email: g.email,
        phone: '', address: '', city: '', state: '', zip: '',
      },
    });
  } catch (err) {
    console.error('googleLogin error:', err);
    res.status(401).json({ success: false, message: 'Google sign-in failed.' });
  }
};