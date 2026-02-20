const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const mime = require('mime-types');

const sessions = {};
const activeReplyLocks = {};

// ==============================
// Random Helpers
// ==============================

function randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ==============================
// Human Behavior Simulation
// ==============================

async function humanDelay() {
    let delay = randomBetween(1500, 5000);

    // 15% chance long delay
    if (Math.random() < 0.15) {
        delay = randomBetween(8000, 20000);
    }

    await wait(delay);
}

async function simulateTyping(client, chatId, messageLength = 10) {
    const typingTime = randomBetween(1500, 4000) + messageLength * 40;

    const chat = await client.getChatById(chatId);

    await client.sendPresenceAvailable();
    await chat.sendSeen();
    await chat.sendStateTyping();

    await wait(typingTime);

    await chat.clearState();
}

// ==============================
// Reply Pools
// ==============================

const textReplies = [
    "Got it 👍",
    "Okay 👌",
    "Thanks!",
    "Received 😊",
    "Alright 👍",
    "Noted.",
    "Sounds good.",
    "Understood 👍"
];

const imageReplies = [
    "Nice photo 👀",
    "Got your image 👍",
    "Looks good!",
    "Received the picture 😊",
    "Thanks for the image!"
];

const fileReplies = [
    "Got the file 👍",
    "Received your document.",
    "File downloaded 👌",
    "Thanks for sending this.",
    "Got it, checking now."
];

const audioReplies = [
    "Got your voice note 🎧",
    "Listening now 👍",
    "Received the audio.",
    "Thanks for the voice message!"
];

// ==============================
// Create Client
// ==============================

function createClient(session, returnQr = false) {
    const phone_number = session.phone_number;
    const clientId = phone_number.replace(/\D/g, '');

    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: clientId,
            dataPath: './sessions'
        }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled'
            ]
        }
    });

    sessions[phone_number] = {
        client,
        status: 'starting'
    };

    // ==============================
    // AUTH EVENTS
    // ==============================

    client.on('qr', qr => {
        sessions[phone_number].status = 'qr_required';
        if (!returnQr) {
            console.log(`\nScan QR for ${phone_number}:\n${qr}\n`);
        }
    });

    client.on('authenticated', () => {
        if (sessions[phone_number].status !== 'authenticated') {
            sessions[phone_number].status = 'authenticated';
            console.log(`Session ${phone_number} authenticated`);
        }
    });

    client.on('ready', () => {
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

    // ==============================
    // MESSAGE HANDLER (HUMAN MODE)
    // ==============================

    client.on('message', async message => {
        try {

            if (message.fromMe) return;

            // Prevent burst replies
            if (activeReplyLocks[message.from]) return;
            activeReplyLocks[message.from] = true;

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
                if (err.code === 'ER_DUP_ENTRY') {
                    activeReplyLocks[message.from] = false;
                    return;
                }
                throw err;
            }

            // 30% chance ignore (human style)
            if (Math.random() < 0.3) {
                activeReplyLocks[message.from] = false;
                return;
            }

            await humanDelay();
            await simulateTyping(client, message.from, textBody?.length || 10);

            // ==============================
            // MEDIA HANDLING
            // ==============================

            if (message.hasMedia) {

                const media = await message.downloadMedia();
                if (!media) {
                    activeReplyLocks[message.from] = false;
                    return;
                }

                const extension = mime.extension(media.mimetype) || 'bin';

                const filename = `${fromNumber}_${uuidv4()}.${extension}`;

                const mediaDir = path.join(__dirname, '..', 'media');

                if (!fs.existsSync(mediaDir)) {
                    fs.mkdirSync(mediaDir, { recursive: true });
                }

                const storagePath = path.join(mediaDir, filename);

                fs.writeFileSync(storagePath, media.data, { encoding: 'base64' });

                const fileSize = Buffer.from(media.data, 'base64').length;

                await db.execute(
                    `INSERT INTO whatsapp_files
                    (message_id, provider_media_id, filename, mime_type, file_size, storage_path)
                    VALUES (?, ?, ?, ?, ?, ?)`,
                    [messageId, null, filename, media.mimetype, fileSize, storagePath]
                );

                let replyText;

                if (media.mimetype.startsWith('image')) {
                    replyText = pickRandom(imageReplies);
                } else if (media.mimetype.startsWith('audio')) {
                    replyText = pickRandom(audioReplies);
                } else {
                    replyText = pickRandom(fileReplies);
                }

                await message.reply(replyText);

            } else {

                const replyText = pickRandom(textReplies);
                await message.reply(replyText);
            }

            // Cooldown after reply
            await wait(randomBetween(2000, 5000));

            activeReplyLocks[message.from] = false;

        } catch (error) {
            console.error('Message handling error:', error.message);
            activeReplyLocks[message.from] = false;
        }
    });

    client.initialize();
    return client;
}

// ==============================
// SESSION STATUS
// ==============================

function getSessionStatus(phone_number) {
    if (!sessions[phone_number]) return 'not_found';
    return sessions[phone_number].status;
}

module.exports = {
    createClient,
    getSessionStatus,
    sessions
};
