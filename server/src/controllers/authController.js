const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/db'); 

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
