const db = require('../config/db');
const { createClient } = require('./whatsapp');
const QRCode = require('qrcode');

async function addNewSession(phoneNumber) {
    return new Promise(async (resolve, reject) => {
        try {
            const sessionName = `session_${phoneNumber.replace(/\D/g, '')}`;

            // Insert in DB if not exists
            await db.execute(
                'INSERT IGNORE INTO whatsapp_sessions (phone_number, session_name) VALUES (?, ?)',
                [phoneNumber, sessionName]
            );

            const client = createClient({ phone_number: phoneNumber }, true);

            // QR scan (first time only)
            client.once('qr', async qr => {
                const qrImage = await QRCode.toDataURL(qr);
                resolve(qrImage);
            });

            // Already authenticated → no QR
            client.once('ready', () => resolve(null));

        } catch (err) {
            reject(err);
        }
    });
}

module.exports = addNewSession;
