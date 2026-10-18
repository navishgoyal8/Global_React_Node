require('dotenv').config();
const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

// Only initialize if the keys exist, otherwise it will crash
const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

module.exports = client;