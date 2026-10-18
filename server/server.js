require('dotenv').config();

const path = require('path');
const cron = require('node-cron');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./src/config/db');
const { sendScheduledMessages } = require('./src/controllers/invoiceController');

const app = express();

const uploadRoutes = require('./src/routes/uploadRoutes');

app.use(cors());
// Upload router first: logo uploads need a larger body limit (15mb) than the
// global JSON parser below (100kb default).
app.use('/api/uploads', uploadRoutes);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded apparel logos (e.g. /uploads/apparel/<file>)
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));


const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

app.set('io', io);

io.on('connection', (socket) => {
  console.log('⚡ A user connected to live chat:', socket.id);

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
})

const chatRoutes = require('./src/routes/chatRoutes');
const userRoutes = require('./src/routes/userRoutes');
const inventoryRoutes = require('./src/routes/inventoryRoutes');
const leadRoutes = require('./src/routes/leadRoutes');
const invoiceRoutes = require('./src/routes/invoiceRoutes');
const authRoutes = require('./src/routes/authRoutes');
const productRoutes = require('./src/routes/productRoutes');
const orderRoutes = require('./src/routes/orderRoutes');
const adsPackageRoutes = require('./src/routes/adsPackageRoutes');
const emailRoutes = require('./src/routes/emailRoutes');
const followupRoutes = require('./src/routes/followupRoutes');
const consignmentRoutes = require('./src/routes/consignmentRoutes');
const referralRoutes = require('./src/routes/referralRoutes');
const { triggerReminders } = require('./src/controllers/followupController');
const twilioController = require('./src/controllers/twilioController');

app.use('/api', chatRoutes);
app.use('/api/users', userRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/ads', adsPackageRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/followups', followupRoutes);
app.use('/api/consignments', consignmentRoutes);
app.use('/api/referrals', referralRoutes);


cron.schedule('* * * * *', triggerReminders);
// Fire due scheduled invoice messages. Each row is claimed (send_status) before
// its Twilio call, so a failed send is recorded as 'failed' and never retried.
cron.schedule('* * * * *', sendScheduledMessages);
app.get('/', (req, res) => {
  res.send('GlobalLimos Node 14 Chat API is running.');
});

// Start Server

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Node 14 API Server running on port ${PORT}`);
});

// Warm the inbox snapshot in the background once the server is listening.
// The first sync has to walk the full Twilio message history, which is slow, so
// doing it here means the first /api/twilio-inbox request is normally served from
// the cache instead of waiting on it. Failures are ignored: the endpoint still
// builds a snapshot on demand.
twilioController
  .warmUpInboxSnapshot()
  .then((threads) => console.log(`📬 Inbox snapshot warmed with ${threads.length} threads`))
  .catch((error) => console.log('Inbox warm-up skipped:', error.message));