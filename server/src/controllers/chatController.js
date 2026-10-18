const db = require('../config/db');
const twilioClient = require('../config/twilio');

const chatController = {
    getInbox: async (req, res) => {
        try {
            // ✅ CHANGE 1: Added u.id AS user_id and u.email to the SELECT query
            const [activeLeads] = await db.query(`
                SELECT 
                    l.id AS lead_id, 
                    l.created_on AS lead_date, 
                    l.notes AS lead_description, 
                    l.name AS full_name, 
                    l.phone AS cellnumber,
                    g.is_vendor,
                    g.name AS group_name,
                    u.id AS user_id, 
                    u.email AS user_email
                FROM leads l
                /* Match the phone numbers, ignoring the +1 country code */
                LEFT JOIN global_limo_user u 
                    ON u.cellnumber != '' 
                    AND l.phone LIKE CONCAT('%', u.cellnumber)
                LEFT JOIN groups g ON u.group_id = g.id
                ORDER BY l.created_on DESC
                LIMIT 20 
            `);

            const formattedThreads = [];

            for (const lead of activeLeads) {
                
                const initials = lead.full_name ? lead.full_name.charAt(0).toUpperCase() : '?';

                const dateObj = new Date(lead.lead_date);
                const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });

                let role = "Buyer"; // Default

                if (lead.is_vendor === 1) {
                    role = "Vendor";
                } else if (lead.group_name === "Dealer" || lead.group_name === "Admin") {
                    role = "Seller";
                }

                let formattedMessages = [];
                let isUnanswered = false;

                try {
                    const [recentMessages] = await db.query(`
                        SELECT id, body AS text, created_at AS time, direction 
                        FROM messages 
                        WHERE lead_id = ? 
                        ORDER BY created_at DESC 
                        LIMIT 2
                    `, [lead.lead_id]);

                    formattedMessages = recentMessages.reverse().map(msg => {
                        const msgDate = new Date(msg.time);
                        return {
                            id: msg.id,
                            text: msg.text,
                            time: msgDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
                            direction: msg.direction
                        };
                    });

                    if (formattedMessages.length > 0) {
                        isUnanswered = formattedMessages[formattedMessages.length - 1].direction === 'incoming';
                    }
                } catch (msgErr) {
                    console.error(`Error fetching messages for lead ${lead.lead_id}:`, msgErr);
                }

                // ✅ CHANGE 2: Fetch past inquiries for this user
                let pastInquiries = [];
                if (lead.user_id) {
                    try {
                        const [inquiries] = await db.query(`
                            SELECT * FROM inquiries 
                            WHERE global_limo_user_id = ? AND is_deleted = 0 
                            ORDER BY created_on DESC
                        `, [lead.user_id]);

                        // Map them exactly how the React frontend expects them
                        pastInquiries = inquiries.map((inq) => ({
                            id: inq.id,
                            date: new Date(inq.created_on).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                            vehicle: inq.vehicle_name,
                            price: inq.price ? `$${inq.price}` : 'N/A',
                            type: inq.type,
                            icon: inq.type === 'Listing' ? '🔥' : '🚫',
                            color: inq.type === 'Listing' ? 'green' : 'gray'
                        }));
                    } catch (inqErr) {
                        console.error(`Error fetching inquiries for user ${lead.user_id}:`, inqErr);
                    }
                }

                formattedThreads.push({
                    id: `thread_${lead.lead_id}`,
                    user: { 
                        name: lead.full_name || "Unknown Sender", 
                        email: lead.user_email || "", // Passing email to React
                        role: role, 
                        tag: "Web Lead", 
                        initials: initials, 
                        phoneRoute: lead.cellnumber || "No Phone Provided" 
                    },
                    lead: { 
                        date: formattedDate, 
                        description: lead.lead_description || "Interested in vehicle", 
                        isHot: false 
                    },
                    status: { 
                        isUnanswered: isUnanswered, 
                        assignment: "Assign Lead" 
                    },
                    previewMessages: formattedMessages, // ✅ Renamed slightly to match React props
                    pastInquiries: pastInquiries // ✅ CHANGE 3: Sent to React
                });
            }

            res.json({ status: 'success', data: { threads: formattedThreads } });

        } catch (error) {
            console.error("Inbox Database Error:", error);
            res.status(500).json({ status: 'error', message: 'Failed to fetch inbox data' });
        }
    },

    getChatHistory: async (req, res) => {
        try {
            const { lead_id } = req.params;

            const [leads] = await db.query('SELECT * FROM leads WHERE lead_id = ?', [lead_id]);
            if (leads.length === 0) return res.status(404).json({ error: 'Lead not found' });
            const lead = leads[0];

            const [users] = await db.query(`
                SELECT u.id, u.firstname, u.lastname, u.cellnumber, g.name AS group_name, g.is_vendor 
                FROM global_limo_user u 
                JOIN groups g ON u.group_id = g.id 
                WHERE u.id = ?
            `, [lead.user_id]); 

            const user = users[0];

            let computedRole = "Buyer"; 
            if (user.is_vendor === 1) {
                computedRole = "Vendor";
            } else if (user.id === lead.user_id) { 
                computedRole = "Seller";
            }

            res.json({
                status: 'success',
                data: {
                    contact: {
                        name: `${user.firstname} ${user.lastname}`,
                        phone: user.cellnumber,
                        role: computedRole,
                        groupName: user.group_name
                    },
                    leadDetails: lead,
                    messages: [] 
                }
            });

        } catch (error) {
            console.error("Error in getChatHistory:", error);
            res.status(500).json({ error: 'Database error' });
        }
    },

    receiveIncomingMessage: async (req, res) => {
        try {
            const { From, To, Body, MessageSid } = req.body; // Data sent by Twilio

            console.log(`New message from ${From}: ${Body}`);

            const twiml = new (require('twilio').twiml.MessagingResponse)();
            res.type('text/xml').send(twiml.toString());
            
        } catch (error) {
            console.error("Webhook Error:", error);
            res.status(500).send('Error processing webhook');
        }
    },

    sendOutgoingMessage: async (req, res) => {
        try {
            const { toPhoneNumber, messageBody, lead_id } = req.body;

            const message = await twilioClient.messages.create({
                body: messageBody,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: toPhoneNumber
            });
            
            res.json({ status: 'success', messageSid: message.sid });

        } catch (error) {
            console.error("Error sending message:", error);
            res.status(500).json({ error: 'Failed to send message via Twilio' });
        }
    }
};

module.exports = chatController;