const db = require('../config/db');
const twilio = require('twilio');
const { MessagingResponse } = require('twilio').twiml;

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);
const MY_TWILIO_NUMBER = '+13239907701'; // Make sure this matches your .env

// ── Inbox data sources ───────────────────────────────────────────────────────
// This endpoint used to redo the same expensive work on every single request.
// The inbox page polls it every 20 seconds, so the Twilio history fetch and the
// per-thread database lookups repeated over and over for the whole session.
//
// Two changes were made. Neither changes what the endpoint returns:
//   1. The Twilio snapshot is cached and refreshed in the background, so a
//      request stops waiting on the API once a snapshot exists.
//   2. global_limo_user has no index at all (not even a primary key), so the old
//      per-thread lookup was a full table scan, awaited one thread at a time.
//      It is now a single bulk read plus an in-memory match.

const INBOX_SNAPSHOT_TTL_MS = 15000; // Below the 20s client poll, so every poll still gets fresh data.
let inboxSnapshot = null;
let inboxSnapshotInflight = null;

// True when `a` ranks ahead of `b`, mirroring
//   ORDER BY (group_id = 4) DESC, (active = 1) DESC, (is_deleted = 0) DESC, id ASC
const ranksAheadOf = (a, b) => {
  const isSellerGroup = (u) => (parseInt(u.group_id, 10) === 4 ? 1 : 0);
  const isActive = (u) => (parseInt(u.active, 10) === 1 ? 1 : 0);
  const isNotDeleted = (u) => (parseInt(u.is_deleted, 10) === 0 ? 1 : 0);

  if (isSellerGroup(a) !== isSellerGroup(b)) return isSellerGroup(a) > isSellerGroup(b);
  if (isActive(a) !== isActive(b)) return isActive(a) > isActive(b);
  if (isNotDeleted(a) !== isNotDeleted(b)) return isNotDeleted(a) > isNotDeleted(b);
  return Number(a.id) < Number(b.id);
};

// Reads every user once and keeps only what the phone lookup needs.
// `e164` mirrors CONCAT('+', REPLACE(pc.phonecode, '+', ''), u.cellnumber) and
// stays null when phonecode is null, preserving the SQL's NULL propagation.
const loadUserIndex = async () => {
  const [rows] = await db.query(`
    SELECT u.id, u.firstname, u.lastname, u.email, u.company, u.group_id, u.active, u.is_deleted,
           u.cellnumber, pc.phonecode, g.name AS role_name
    FROM global_limo_user u
    LEFT JOIN phone_country_code pc ON u.phone_code = pc.id
    LEFT JOIN groups g ON u.group_id = g.id
  `);

  return rows.map((r) => ({
    id: r.id,
    firstname: r.firstname,
    lastname: r.lastname,
    email: r.email,
    company: r.company,
    group_id: r.group_id,
    active: r.active,
    is_deleted: r.is_deleted,
    role_name: r.role_name,
    cell: String(r.cellnumber),
    e164: r.phonecode == null ? null : `+${String(r.phonecode).replace(/\+/g, '')}${r.cellnumber}`,
  }));
};

// Finds the single best user for a phone number, reproducing the original query:
//
//   WHERE CONCAT('+', REPLACE(pc.phonecode, '+', ''), u.cellnumber) = ?
//      OR u.cellnumber = ?
//      OR u.cellnumber LIKE CONCAT('%', ?, '%')
//   ORDER BY (u.group_id = 4) DESC, (u.active = 1) DESC, (u.is_deleted = 0) DESC, u.id ASC
//   LIMIT 1
//
// where ? is the E.164 thread phone for the first argument and its last 10
// digits for the other two. Comparisons are case-insensitive to match the
// case-insensitive collation these columns use.
const findUserForPhone = (index, phone) => {
  const shortPhone = phone.slice(-10);
  const needle = shortPhone.toLowerCase();
  const target = phone.toLowerCase();

  let best = null;
  for (const user of index) {
    const cell = user.cell.toLowerCase();
    // Cheapest tests first; the substring test is the expensive one.
    const matches =
      (user.e164 != null && user.e164.toLowerCase() === target) ||
      cell === needle ||
      cell.includes(needle);
    if (!matches) continue;

    if (best === null || ranksAheadOf(user, best)) best = user;
  }
  return best;
};

// ── Per-thread message summary ────────────────────────────────────────────────
// The rendered inbox only ever needs three messages per thread: the most recent
// message overall, the most recent inbound, and the most recent outbound. The
// old code re-downloaded the entire message history (tens of thousands of
// messages, ~40s of pagination) on every poll just to derive those three.
//
// Twilio returns messages newest-first, so once every page has been read at
// least once, any message newer than what we already hold is guaranteed to be in
// the first page. So the first sync pages through everything, and every sync
// after that only needs page 1. A saturated first page falls back to a full walk
// so a burst larger than one page can never be missed.
const INBOX_PAGE_SIZE = 1000;
const threadSummary = new Map(); // customerPhone -> { inbound: msg|null, outbound: msg|null }
let historyFullySynced = false;
// Oldest SID covered by page 1 on the last incremental sync, per direction.
// Page 1 is complete as long as it still contains that SID. If it does not, more
// than a page of new messages arrived since the last sync and one page can no
// longer be proven complete, so that side falls back to a full walk.
const syncWatermark = { inbound: null, outbound: null };

const customerPhoneFor = (msg) => (msg.direction === 'inbound' ? msg.from : msg.to);

const considerMessage = (msg) => {
  const phone = customerPhoneFor(msg);
  if (!phone) return;

  const slot = msg.direction === 'inbound' ? 'inbound' : 'outbound';
  const sentAt = new Date(msg.dateSent).getTime();
  const current = threadSummary.get(phone);

  if (!current) {
    threadSummary.set(phone, { inbound: null, outbound: null, [slot]: msg });
    return;
  }
  if (!current[slot] || sentAt > new Date(current[slot].dateSent).getTime()) {
    current[slot] = msg;
  }
};

// Applies page 1 for one direction. Returns false when the page cannot be proven
// complete and the caller must fall back to walking every page.
const applyFirstPage = async (direction, listParams) => {
  const page = await client.messages.page({ ...listParams, pageSize: INBOX_PAGE_SIZE });
  const msgs = page.instances; // newest-first
  if (msgs.length === 0) return true;

  const watermark = syncWatermark[direction];
  if (watermark && !msgs.some((m) => m.sid === watermark)) return false;

  msgs.forEach(considerMessage);
  syncWatermark[direction] = msgs[msgs.length - 1].sid; // oldest in the page
  return true;
};

const syncMessages = async () => {
  if (historyFullySynced) {
    const [inboundOk, outboundOk] = await Promise.all([
      applyFirstPage('inbound', { to: MY_TWILIO_NUMBER }),
      applyFirstPage('outbound', { from: MY_TWILIO_NUMBER }),
    ]);
    if (inboundOk && outboundOk) return;

    // A gap was detected on at least one side; rebuild from a complete walk.
    threadSummary.clear();
    syncWatermark.inbound = null;
    syncWatermark.outbound = null;
    historyFullySynced = false;
  }

  // Cold path: walk every page once so no thread is missed. `.list()` without a
  // limit auto-paginates through the full history.
  const [inboundMsgs, outboundMsgs] = await Promise.all([
    client.messages.list({ to: MY_TWILIO_NUMBER, pageSize: INBOX_PAGE_SIZE }),
    client.messages.list({ from: MY_TWILIO_NUMBER, pageSize: INBOX_PAGE_SIZE }),
  ]);
  inboundMsgs.forEach(considerMessage);
  outboundMsgs.forEach(considerMessage);
  historyFullySynced = true;
};

// One pass over the data sources, producing the exact payload the client expects.
const buildInboxSnapshot = async () => {
  await syncMessages();

  // Calls and recordings are already capped at the newest 100 each, so these are
  // cheap enough to read on every refresh.
  const [inboundCalls, outboundCalls, recordings] = await Promise.all([
    client.calls.list({ to: MY_TWILIO_NUMBER, limit: 100 }),
    client.calls.list({ from: MY_TWILIO_NUMBER, limit: 100 }),
    client.recordings.list({ limit: 100 })
  ]);

  const calls = [...inboundCalls, ...outboundCalls].sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated));

  // Rebuild the per-thread message arrays from the summary. Each thread holds at
  // most its latest inbound and latest outbound, sorted oldest to newest, which
  // is exactly what the preview logic below reads.
  const threads = {};
  threadSummary.forEach((slot, phone) => {
    const msgs = [slot.inbound, slot.outbound].filter(Boolean)
      .sort((a, b) => new Date(a.dateSent) - new Date(b.dateSent));
    if (msgs.length > 0) threads[phone] = msgs;
  });

  const callsByPhone = {};
  calls.forEach(call => {
    const customerPhone = call.direction === 'inbound' ? call.from : call.to;
    if (customerPhone) {
      if (!callsByPhone[customerPhone]) callsByPhone[customerPhone] = [];
      callsByPhone[customerPhone].push(call);
    }
  });

  const recordingsByCallSid = {};
  recordings.forEach(rec => {
    recordingsByCallSid[rec.callSid] = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Recordings/${rec.sid}.mp3`;
  });

  const formattedInbox = [];

  // Merge phone numbers from BOTH messages and calls
  const allCustomerPhones = new Set([
    ...Object.keys(threads),
    ...Object.keys(callsByPhone)
  ]);

  // One bulk read of every user, matched in memory. Previously this ran a full
  // table scan of global_limo_user once per thread, sequentially. If the read
  // fails we fall back to an empty index, which marks every thread
  // "Un-registered" — the same result the old per-thread catch produced.
  let userIndex = [];
  try {
    userIndex = await loadUserIndex();
  } catch (e) {
    console.log('DB Lookup Error loading user index:', e.message);
    userIndex = [];
  }

  for (const phone of allCustomerPhones) {
    const msgs = threads[phone] || [];
    const userCalls = callsByPhone[phone] || [];

    // Sort messages oldest to newest for the preview logic
    msgs.sort((a, b) => new Date(a.dateSent) - new Date(b.dateSent));

    const lastMessage = msgs.length > 0 ? msgs[msgs.length - 1] : null;
    const lastCall = userCalls.length > 0 ? userCalls[0] : null;

    let isUnanswered = false;
    let latestDate = new Date(0);
    let lastDirection = 'inbound'; // ✅ NEW: Track the direction to fix the phone route

    if (lastMessage) {
      isUnanswered = lastMessage.direction === 'inbound';
      latestDate = new Date(lastMessage.dateSent);
      lastDirection = lastMessage.direction; // Grab message direction
    }
    if (lastCall && (!lastMessage || new Date(lastCall.dateCreated) > latestDate)) {
      isUnanswered = lastCall.direction === 'inbound' && lastCall.status !== 'completed';
      latestDate = new Date(lastCall.dateCreated);
      lastDirection = lastCall.direction; // Grab call direction if it's newer
    }

    // ✅ FIX: Dynamically generate the phone route based on who reached out last!
    const dynamicRoute = `${phone} -> ${MY_TWILIO_NUMBER}`;


    const previewArray = [];
    if (msgs.length > 0) {
      const lastInbound = [...msgs].reverse().find(m => m.direction === 'inbound');
      const lastOutbound = [...msgs].reverse().find(m => m.direction !== 'inbound');
      if (lastInbound) previewArray.push(lastInbound);
      if (lastOutbound) previewArray.push(lastOutbound);
      previewArray.sort((a, b) => new Date(a.dateSent) - new Date(b.dateSent));
    }

    let dbName = "Un-registered";
    let dbRole = "Unknown";
    let dbTag = "Web Lead";
    let dbLeadDesc = "Direct Communication";
    let dbEmail = "No email provided";
    let dbCompany = "";
    let dbPreferences = { lead_types: [], listings: [], memberships: [], ad_package: '', ad_features: [], service_type: 'SMS', lead_status: '' };
    let matchedRegisteredUser = null;

    // Match the thread to a registered user by their cell number, using the
    // in-memory index instead of a per-thread table scan.
    matchedRegisteredUser = findUserForPhone(userIndex, phone);
    if (matchedRegisteredUser) {
      const user = matchedRegisteredUser;
      dbName = `${user.firstname || ''} ${user.lastname || ''}`.trim();
      dbEmail = user.email || "No email provided";
      dbCompany = user.company || "";
      dbRole = user.role_name === 'Customer' ? 'Seller' : (user.role_name === 'Dealer' ? 'Buyer' : user.role_name);
      dbTag = "Registered";
    }

    // Registered leads (matched to global_limo_user) only show in the inbox
    // when they qualify (group_id = 4, active = 1, is_deleted = 0).
    // Truly unregistered leads stay visible; registered-but-qualifying ones
    // keep their "Registered" enrichment; registered but disqualified are
    // hidden entirely.
    if (matchedRegisteredUser) {
      const gid    = parseInt(matchedRegisteredUser.group_id, 10);
      const act    = parseInt(matchedRegisteredUser.active, 10);
      const del    = parseInt(matchedRegisteredUser.is_deleted, 10);
      if (gid !== 4 || act !== 1 || del !== 0) {
        continue;
      }
    }

    formattedInbox.push({
      id: phone,
      latestInteractionDate: latestDate,
      status: { isUnanswered: isUnanswered },
      user: {
        name: dbName,
        email: dbEmail,
        company: dbCompany,
        initials: dbName.charAt(0).toUpperCase(),
        role: dbRole,
        tag: dbTag,
        ourNumber: MY_TWILIO_NUMBER // ✅ frontend builds the route string per-tab using this + thread.id (customer phone)
      },
      lead: {
        date: lastMessage ? new Date(lastMessage.dateSent).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : new Date(lastCall?.dateCreated || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        description: dbLeadDesc
      },
      preferences: dbPreferences,
      pastInquiries: [],

      calls: userCalls.map(c => ({
        id: c.sid,
        date: new Date(c.dateCreated).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
        rawDate: c.dateCreated, // ✅ NEW
        duration: c.duration ? `${Math.floor(c.duration / 60)}m ${c.duration % 60}s` : '—',
        direction: c.direction,
        type: c.status === 'completed' ? (c.direction === 'inbound' ? 'incoming' : 'outgoing') : 'missed',
        recordingUrl: recordingsByCallSid[c.sid] || null
      })),
      previewMessages: previewArray.map(m => ({
        id: m.sid,
        direction: m.direction === 'inbound' ? 'incoming' : 'outgoing',
        text: m.body,
        time: new Date(m.dateSent).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      }))
      // NOTE: fullHistory is intentionally NOT shipped with every thread anymore.
      // Loading ALL messages for ALL threads each refresh blew up the browser's
      // connection/memory resources (net::ERR_INSUFFICIENT_RESOURCES on the
      // per-thread invoice calls). Full history is now fetched on demand for the
      // opened conversation via GET /api/chat/twilio/thread-history?phone=...
    });
  }

  formattedInbox.sort((a, b) => b.latestInteractionDate - a.latestInteractionDate);

  return formattedInbox;
};

// Fetches a fresh snapshot and stores it. Shared by the cold-start path and the
// background refresh, so only one Twilio fetch is ever in flight.
const refreshInboxSnapshot = async () => {
  const formatted = await buildInboxSnapshot();
  inboxSnapshot = { formatted, at: Date.now() };
  return formatted;
};

// Single owner of the in-flight fetch. The startup warm-up and the cold request
// path both go through here, so a request that arrives while the warm-up is
// still walking history waits on that fetch instead of starting a second one.
const ensureSnapshot = () => {
  if (!inboxSnapshotInflight) {
    inboxSnapshotInflight = refreshInboxSnapshot()
      .finally(() => { inboxSnapshotInflight = null; });
  }
  return inboxSnapshotInflight;
};

exports.getLiveTwilioInbox = async (req, res) => {
  // Cold start: nothing cached, so this first request has to wait for the data.
  if (!inboxSnapshot) {
    try {
      return res.json(await ensureSnapshot());
    } catch (error) {
      console.error("Controller Error:", error);
      return res.status(500).json({ error: error.message });
    }
  }

  // Warm: answer from the cached snapshot and refresh in the background, so the
  // next poll has fresh data without this request ever blocking on Twilio.
  if (Date.now() - inboxSnapshot.at >= INBOX_SNAPSHOT_TTL_MS) {
    ensureSnapshot().catch((error) =>
      console.error("Inbox background refresh failed:", error.message));
  }

  return res.json(inboxSnapshot.formatted);
};

// Builds the first snapshot ahead of the first request. Called once at startup so
// the first inbox load does not have to wait on the full history walk.
exports.warmUpInboxSnapshot = async () => {
  if (inboxSnapshot) return inboxSnapshot.formatted;
  return ensureSnapshot();
};

// Exposed for the equivalence/perf test only. Same function the handler calls.
exports.__test_buildInboxSnapshot = buildInboxSnapshot;

exports.getThreadHistory = async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Phone number is required.' });
    }

    // Complete history between our Twilio number and this customer, both directions.
    // Filtered by To+From so it returns EVERY message for this thread (not limited
    // to the newest N messages across the whole account).
    const [inbound, outbound] = await Promise.all([
      client.messages.list({ to: MY_TWILIO_NUMBER, from: phone, pageSize: 1000 }),
      client.messages.list({ from: MY_TWILIO_NUMBER, to: phone, pageSize: 1000 })
    ]);

    const messages = [...inbound, ...outbound]
      .sort((a, b) => new Date(a.dateSent) - new Date(b.dateSent))
      .map(m => ({
        id: m.sid,
        direction: m.direction === 'inbound' ? 'incoming' : 'outgoing',
        text: m.body,
        time: new Date(m.dateSent).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
        rawDate: m.dateSent
      }));

    res.json({ success: true, messages });
  } catch (error) {
    console.error('Thread History Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.sendTwilioMessage = async (req, res) => {
  try {
    const { to, message } = req.body;
    if (!to || !message) {
      return res.status(400).json({ error: "Phone number and message are required." });
    }
    const twilioResponse = await client.messages.create({
      body: message,
      from: MY_TWILIO_NUMBER,
      to: to
    });
    res.json({ success: true, messageSid: twilioResponse.sid });
  } catch (error) {
    console.error("Twilio Send Error:", error);
    res.status(500).json({ error: "Failed to send message via Twilio." });
  }
};

exports.receiveTwilioWebhook = async (req, res) => {
  try {
    const { From, Body } = req.body;
    console.log(`📩 New live text from ${From}: ${Body}`);

    const liveMessage = {
      id: Date.now(),
      direction: 'incoming',
      text: Body,
      time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      customerPhone: From
    };

    const io = req.app.get('io');
    io.emit('new_incoming_message', liveMessage);

    const twiml = new MessagingResponse();
    res.type('text/xml').send(twiml.toString());
  } catch (error) {
    console.error("Webhook Error:", error);
    res.status(500).send("Error processing webhook");
  }
};

exports.initiateCall = async (req, res) => {
  try {
    const { leadPhone } = req.body;
    if (!leadPhone) {
      return res.status(400).json({ error: "Lead phone number is required." });
    }

    const AGENT_CELL_NUMBER = process.env.AGENT_CELL_NUMBER;
    console.log(`📞 Calling agent ${AGENT_CELL_NUMBER} to connect to lead ${leadPhone}`);

    const call = await client.calls.create({
      twiml: `<Response><Dial callerId="${MY_TWILIO_NUMBER}">${leadPhone}</Dial></Response>`,
      to: AGENT_CELL_NUMBER,
      from: MY_TWILIO_NUMBER
    });

    res.json({ success: true, callSid: call.sid });
  } catch (error) {
    console.error("Twilio Call Error:", error);
    res.status(500).json({ error: "Failed to initiate call." });
  }
};

exports.getLeadCallHistory = async (req, res) => {
  try {
    const { numbers } = req.body;

    if (!numbers || !Array.isArray(numbers)) {
      return res.status(400).json({ error: "Phone numbers array is required." });
    }

    const calls = await client.calls.list({ limit: 500 });
    const recordings = await client.recordings.list({ limit: 500 });

    const recordingsByCallSid = {};
    recordings.forEach(rec => {
      recordingsByCallSid[rec.callSid] = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Recordings/${rec.sid}.mp3`;
    });

    const leadCalls = calls.filter(call => numbers.includes(call.from) || numbers.includes(call.to));

    const history = leadCalls.map(c => {
      let displayType = 'Call';
      let displayStatus = c.status;

      if (c.direction === 'inbound') {
        displayType = 'Incoming Call';
        displayStatus = c.status === 'completed' ? 'Answered' : c.status;
      } else {
        displayType = 'Outgoing Call';
      }

      if (c.status === 'no-answer' || c.status === 'canceled' || c.status === 'failed') {
        displayType = 'Missed Call';
      }

      return {
        id: c.sid,
        type: displayType,
        date: new Date(c.dateCreated).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
        duration: c.duration ? `${Math.floor(c.duration / 60)}m ${c.duration % 60}s` : '—',
        status: displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1),
        number: c.direction === 'inbound' ? c.from : c.to,
        recordingUrl: recordingsByCallSid[c.sid] || null
      };
    });

    res.json({ success: true, history });

  } catch (error) {
    console.error("Lead History Error:", error);
    res.status(500).json({ error: "Failed to fetch lead history" });
  }
};