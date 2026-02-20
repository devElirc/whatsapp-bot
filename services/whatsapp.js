const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const mime = require('mime-types');

const sessions = {}; // track session status

function createClient(session, returnQr = false) {
    const phone_number = session.phone_number;

    // clientId for LocalAuth: ONLY digits (LocalAuth adds session- automatically)
    const clientId = phone_number.replace(/\D/g, '');

    const client = new Client({
        authStrategy: new LocalAuth({
            clientId,
            dataPath: './sessions'
        }),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });

    sessions[phone_number] = { client, status: 'starting' };

    // ===== AUTH EVENTS =====
    client.on('qr', qr => {
        sessions[phone_number].status = 'qr_required';
        if (!returnQr) console.log(`\nScan QR for ${phone_number}:\n${qr}\n`);
    });

    client.on('authenticated', () => {
        sessions[phone_number].status = 'authenticated';
        console.log(`Session ${phone_number} authenticated`);
    });

    client.on('ready', async () => {
        sessions[phone_number].status = 'ready';
        console.log(`Session ${phone_number} READY`);
    });

    client.on('auth_failure', msg => {
        sessions[phone_number].status = 'auth_failed';
        console.error(`Auth failure for ${phone_number}:`, msg);
    });

    client.on('disconnected', reason => {
        sessions[phone_number].status = 'disconnected';
        console.log(`Session ${phone_number} disconnected: ${reason}`);
    });

    // ===== MESSAGE HANDLER =====
    client.on('message', async message => {
        try {
            const fromNumber = message.from.replace('@c.us', '');
            const toNumber = phone_number;
            const type = message.type;
            const providerMessageId = message.id.id;
            const timestamp = message.timestamp;
            const rawPayload = JSON.stringify(message);
            const textBody = message.body || null;

            let messageId;

            try {
                const [result] = await db.execute(
                    `INSERT INTO whatsapp_messages
                    (provider_message_id, from_number, to_number, message_type, text_body, timestamp, raw_payload)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [providerMessageId, fromNumber, toNumber, type, textBody, timestamp, rawPayload]
                );
                messageId = result.insertId;
            } catch (err) {
                if (err.code === 'ER_DUP_ENTRY') return;
                else throw err;
            }

            // ===== MEDIA HANDLING =====
            if (message.hasMedia) {
                const media = await message.downloadMedia();
                if (!media) return;

                const extension = mime.extension(media.mimetype) || 'bin';
                const filename = `${uuidv4()}.${extension}`;
                const mediaDir = path.join(__dirname, '..', 'media');
                if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
                const storagePath = path.join(mediaDir, filename);

                fs.writeFileSync(storagePath, media.data, { encoding: 'base64' });

                const fileSize = Buffer.from(media.data, 'base64').length;

                await db.execute(
                    `INSERT INTO whatsapp_files
                    (message_id, provider_media_id, filename, mime_type, file_size, storage_path)
                    VALUES (?, ?, ?, ?, ?, ?)`,
                    [messageId, null, filename, media.mimetype, fileSize, storagePath]
                );

                await message.reply(`file received: ${filename}`);
            } else {
                await message.reply(`message received: ${textBody || ''}`);
            }

        } catch (error) {
            console.error('Message handling error:', error.message);
        }
    });

    client.initialize();
    return client;
}

// ===== SESSION STATUS =====
function getSessionStatus(phone_number) {
    if (!sessions[phone_number]) return 'not_found';
    return sessions[phone_number].status;
}

module.exports = { createClient, getSessionStatus, sessions };
