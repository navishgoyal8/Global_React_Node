const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.mailgun.org',
  port: parseInt(process.env.SMTP_PORT, 10) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

const EMAIL_FROM = process.env.EMAIL_FROM || 'info@globallimos.com';
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'Global Limos';

// Sends a simple text/HTML email from the system (used for the "Email Link via
// System" option on the Secure Payment Link panel). Falls back to plain text
// when the body contains no HTML.
exports.sendEmail = async (req, res) => {
  try {
    const { to, subject, body } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({ success: false, message: 'Missing to, subject, or body' });
    }

    const isHtml = /<[a-z][\s\S]*>/i.test(body || '');

    await transporter.sendMail({
      from: `"${EMAIL_FROM_NAME}" <${EMAIL_FROM}>`,
      to,
      subject,
      text: isHtml ? (body || '').replace(/<[^>]+>/g, ' ') : body,
      html: isHtml ? body : undefined,
    });

    return res.json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    console.error('Email send error:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Failed to send email' });
  }
};