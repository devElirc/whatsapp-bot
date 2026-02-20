require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const db = require('./config/db');
const { createClient, getSessionStatus } = require('./services/whatsapp');
const addNewSession = require('./services/sessionManager');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// =============================
// Load all existing sessions on startup
// =============================
async function loadSessions() {
    try {
        const [rows] = await db.execute("SELECT * FROM whatsapp_sessions");

        for (const session of rows) {
            createClient(session); // restores session from /sessions
            console.log(`Restoring session for ${session.phone_number}`);
        }
    } catch (err) {
        console.error('Failed to load sessions:', err);
    }
}

loadSessions();

// =============================
// API to add a new session
// =============================
app.post('/api/add-session', async (req, res) => {
    try {
        const { phone_number } = req.body;

        if (!phone_number) return res.status(400).json({ message: 'Phone number required' });

        const qrCode = await addNewSession(phone_number); // returns QR image base64 or null
        res.json({ qr: qrCode });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to add session' });
    }
});

// =============================
// API to check session status
// =============================
app.get('/api/session-status/:phone', (req, res) => {
    const sessionName = `session_${req.params.phone.replace(/\D/g, '')}`;
    const status = getSessionStatus(sessionName);
    res.json({ status });
});

// =============================
// Start server
// =============================
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
