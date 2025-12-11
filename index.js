const { 
    default: giftedConnect, 
    isJidGroup, 
    jidNormalizedUser,
    isJidBroadcast,
    downloadMediaMessage, 
    downloadContentFromMessage,
    downloadAndSaveMediaMessage, 
    DisconnectReason, 
    getContentType,
    fetchLatestWaWebVersion, 
    useMultiFileAuthState, 
    makeCacheableSignalKeyStore,
    jidDecode,
    Browsers,
    delay
} = require("gifted-baileys");

const { 
    evt, 
    logger,
    emojis,
    gmdStore,
    commands,
    setSudo,
    delSudo,
    GiftedTechApi,
    GiftedApiKey,
    GiftedAutoReact,
    GiftedAntiLink,
    GiftedAutoBio,
    GiftedChatBot,
    loadSession,
    getMediaBuffer,
    getSudoNumbers,
    getFileContentType,
    bufferToStream,
    uploadToPixhost,
    uploadToImgBB,
    setCommitHash, 
    getCommitHash,
    gmdBuffer, gmdJson, 
    formatAudio, formatVideo,
    uploadToGithubCdn,
    uploadToGiftedCdn,
    uploadToPasteboard,
    uploadToCatbox,
    GiftedAnticall,
    createContext, 
    createContext2,
    verifyJidState,
    GiftedPresence,
    GiftedAntiDelete
} = require("./gift");

const { 
    Sticker, 
    createSticker, 
    StickerTypes 
} = require("wa-sticker-formatter");
const pino = require("pino");
const config = require("./config");
const axios = require("axios");
const googleTTS = require("google-tts-api");
const fs = require("fs-extra");
const path = require("path");
const { Boom } = require("@hapi/boom");
const express = require("express");
const QRCode = require('qrcode');
const zlib = require('zlib');
const { sendButtons } = require('gifted-btns');

const {
    MODE: botMode, 
    BOT_PIC: botPic, 
    FOOTER: botFooter, 
    CAPTION: botCaption, 
    VERSION: botVersion, 
    OWNER_NUMBER: ownerNumber, 
    OWNER_NAME: ownerName,  
    BOT_NAME: botName, 
    PREFIX: botPrefix,
    PRESENCE: botPresence,
    CHATBOT: chatBot,
    CHATBOT_MODE: chatBotMode,
    STARTING_MESSAGE: startMess,
    ANTIDELETE: antiDelete,
    ANTILINK: antiLink,
    ANTICALL: antiCall,
    TIME_ZONE: timeZone,
    BOT_REPO: giftedRepo,
    NEWSLETTER_JID: newsletterJid,
    NEWSLETTER_URL: newsletterUrl,
    AUTO_REACT: autoReact,
    AUTO_READ_STATUS: autoReadStatus,
    AUTO_LIKE_STATUS: autoLikeStatus,
    STATUS_LIKE_EMOJIS: statusLikeEmojis,
    AUTO_REPLY_STATUS: autoReplyStatus,
    STATUS_REPLY_TEXT: statusReplyText,
    AUTO_READ_MESSAGES: autoRead,
    AUTO_BLOCK: autoBlock,
    AUTO_BIO: autoBio } = config;

// Initialize Express App
const app = express();
const PORT = process.env.PORT || 10000;
const WEB_PORT = process.env.WEB_PORT || 10000;

let Gifted;
logger.level = "silent";

// Middleware
app.use(express.static("gift"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session directories
const sessionDir = path.join(__dirname, "gift", "session");
fs.ensureDirSync(sessionDir);

// Helper functions for session generation
function generateSessionId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `PRINCE-MDX~${result}`;
}

function getRandomId(length = 4) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Global variables
let store; 
let reconnectAttempts = 0;
let botStarted = false;
const MAX_RECONNECT_ATTEMPTS = 50;
const RECONNECT_DELAY = 5000;

// WEB ROUTES FOR SESSION GENERATION

// Main page
app.get("/", (req, res) => {
    const sessionExists = fs.existsSync(path.join(sessionDir, "creds.json"));
    
    if (sessionExists) {
        res.sendFile(__dirname + "/gift/gifted.html");
    } else {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Gifted-MD Setup</title>
                <style>
                    body { font-family: Arial; text-align: center; padding: 50px; background: #121212; color: white; }
                    .container { max-width: 500px; margin: 0 auto; }
                    h1 { color: #6e48aa; margin-bottom: 30px; }
                    .option { margin: 30px 0; padding: 20px; background: rgba(255,255,255,0.1); border-radius: 10px; }
                    button { background: #6e48aa; color: white; padding: 15px 30px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; }
                    input { padding: 12px; margin: 10px; width: 250px; border-radius: 5px; border: 1px solid #444; background: #222; color: white; }
                    .status { margin: 20px; padding: 15px; border-radius: 8px; display: none; }
                    .status.success { background: rgba(0,255,0,0.1); color: #0f0; }
                    .status.info { background: rgba(0,150,255,0.1); color: #09f; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🤖 Gifted-MD WhatsApp Setup</h1>
                    <p>No session found. Please create one:</p>
                    
                    <div class="option">
                        <h2>Option 1: QR Code</h2>
                        <p>Scan QR code with WhatsApp > Linked Devices</p>
                        <button onclick="window.location.href='/qr'">Generate QR Code</button>
                    </div>
                    
                    <div class="option">
                        <h2>Option 2: Pairing Code</h2>
                        <p>Enter your WhatsApp number with country code</p>
                        <input type="text" id="phone" placeholder="254712345678">
                        <button onclick="pair()">Get Pairing Code</button>
                    </div>
                    
                    <div id="result"></div>
                    <div class="status" id="status"></div>
                </div>
                
                <script>
                    function pair() {
                        const phone = document.getElementById('phone').value.trim();
                        if (!phone) {
                            alert('Please enter phone number');
                            return;
                        }
                        window.location.href = '/pair?number=' + phone;
                    }
                    
                    // Auto-check for session creation
                    setInterval(() => {
                        fetch('/status')
                            .then(res => res.json())
                            .then(data => {
                                if (data.bot === "Connected") {
                                    document.getElementById('status').className = 'status success';
                                    document.getElementById('status').style.display = 'block';
                                    document.getElementById('status').innerHTML = 
                                        '✅ Bot Connected Successfully!<br>Your WhatsApp is now linked.';
                                    
                                    // Redirect to main page after 3 seconds
                                    setTimeout(() => {
                                        window.location.href = '/';
                                    }, 3000);
                                }
                            });
                    }, 5000);
                </script>
            </body>
            </html>
        `);
    }
});

// QR Code Route
app.get('/qr', async (req, res) => {
    const sessionId = getRandomId();
    const tempSessionDir = path.join(sessionDir, 'temp_' + sessionId);
    
    try {
        const { version } = await fetchLatestWaWebVersion();
        const { state, saveCreds } = await useMultiFileAuthState(tempSessionDir);
        
        let qrSent = false;
        
        const tempGifted = giftedConnect({
            version,
            logger: pino({ level: "silent" }),
            browser: Browsers.macOS("Desktop"),
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            printQRInTerminal: false,
            connectTimeoutMs: 60000
        });
        
        tempGifted.ev.on('creds.update', saveCreds);
        
        tempGifted.ev.on("connection.update", async (update) => {
            const { connection, qr } = update;
            
            if (qr && !qrSent) {
                qrSent = true;
                const qrImage = await QRCode.toDataURL(qr);
                res.send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>GIFTED-MD | QR CODE</title>
                        <style>
                            body { text-align: center; padding: 50px; font-family: Arial; background: #121212; color: white; }
                            .container { max-width: 400px; margin: 0 auto; }
                            .qr-code { width: 300px; height: 300px; margin: 20px auto; padding: 10px; background: white; border-radius: 10px; }
                            .qr-code img { width: 100%; height: 100%; }
                            h1 { color: #6e48aa; }
                            a { color: #6e48aa; text-decoration: none; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h1>Scan QR Code</h1>
                            <div class="qr-code">
                                <img src="${qrImage}" alt="QR Code"/>
                            </div>
                            <p>Scan with WhatsApp > Linked Devices</p>
                            <p><a href="/">Back to Home</a></p>
                        </div>
                    </body>
                    </html>
                `);
            }
            
            if (connection === "open") {
                console.log("✅ User connected via QR");
                
                // Wait for session to be ready
                await delay(5000);
                
                // Read session data
                const credsPath = path.join(tempSessionDir, "creds.json");
                if (fs.existsSync(credsPath)) {
                    const sessionData = fs.readFileSync(credsPath);
                    
                    // Save to main session directory
                    const finalSessionPath = path.join(sessionDir, "creds.json");
                    fs.writeFileSync(finalSessionPath, sessionData);
                    
                    // Send success message to user
                    const finalSessionId = generateSessionId();
                    const phoneNumber = tempGifted.user?.id?.split(':')[0] || 'Unknown';
                    
                    const successMsg = `✅ *WhatsApp Successfully Connected!*\n\n` +
                                     `Your Session ID: \`${finalSessionId}\`\n` +
                                     `Phone: ${phoneNumber}\n\n` +
                                     `🤖 *Gifted-MD is now ready!*\n` +
                                     `Type \`.menu\` to see available commands.\n` +
                                     `Type \`.help\` for assistance.\n\n` +
                                     `> Powered by Gifted Tech`;
                    
                    await tempGifted.sendMessage(tempGifted.user.id, { 
                        text: successMsg 
                    });
                    
                    console.log(`✅ Session saved for: ${phoneNumber}`);
                    
                    // Close temporary connection
                    await tempGifted.ws.close();
                    
                    // Remove temp directory
                    fs.removeSync(tempSessionDir);
                    
                    // Restart main bot with new session
                    if (global.restartBot) {
                        global.restartBot();
                    } else {
                        console.log("⚠️ Bot restart function not available");
                    }
                }
            }
        });
        
        // Timeout after 3 minutes
        setTimeout(() => {
            if (!qrSent) {
                res.send("QR generation timeout. Please try again.");
                if (tempGifted.ws) tempGifted.ws.close();
                fs.removeSync(tempSessionDir);
            }
        }, 180000);
        
    } catch (error) {
        console.error("QR generation error:", error);
        res.status(500).send("Error generating QR code");
    }
});

// Pairing Code Route
app.get('/pair', async (req, res) => {
    const { number } = req.query;
    
    if (!number) {
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial; padding: 50px; text-align: center; }
                    .error { color: red; }
                </style>
            </head>
            <body>
                <div class="error">Phone number required</div>
                <p><a href="/">Back to Home</a></p>
            </body>
            </html>
        `);
    }
    
    const sessionId = getRandomId();
    const tempSessionDir = path.join(sessionDir, 'temp_' + sessionId);
    
    try {
        const { version } = await fetchLatestWaWebVersion();
        const { state, saveCreds } = await useMultiFileAuthState(tempSessionDir);
        
        const tempGifted = giftedConnect({
            version,
            logger: pino({ level: "silent" }),
            browser: Browsers.macOS("Safari"),
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            connectTimeoutMs: 60000
        });
        
        tempGifted.ev.on('creds.update', saveCreds);
        
        if (!tempGifted.authState.creds.registered) {
            await delay(1500);
            const cleanNumber = number.replace(/[^0-9]/g, '');
            
            // Generate pairing code
            const code = await tempGifted.requestPairingCode(cleanNumber);
            
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Pairing Code</title>
                    <style>
                        body { font-family: Arial; padding: 50px; text-align: center; background: #121212; color: white; }
                        .code { font-size: 24px; letter-spacing: 2px; background: #222; padding: 20px; border-radius: 10px; margin: 20px auto; max-width: 300px; }
                        .steps { text-align: left; max-width: 400px; margin: 0 auto; }
                        a { color: #6e48aa; }
                    </style>
                </head>
                <body>
                    <h1>Pairing Code Generated</h1>
                    <p>Enter this code in WhatsApp:</p>
                    <div class="code">${code.match(/.{1,4}/g).join('-')}</div>
                    <div class="steps">
                        <p><strong>Steps:</strong></p>
                        <ol>
                            <li>Open WhatsApp on your phone</li>
                            <li>Go to Settings → Linked Devices → Link a Device</li>
                            <li>Enter the code above</li>
                            <li>Wait for connection confirmation</li>
                        </ol>
                    </div>
                    <p><a href="/">Back to Home</a></p>
                    <div id="status" style="margin-top: 20px;"></div>
                </body>
                <script>
                    // Auto-check for connection
                    setInterval(() => {
                        fetch('/status')
                            .then(res => res.json())
                            .then(data => {
                                if (data.bot === "Connected") {
                                    document.getElementById('status').innerHTML = 
                                        '<div style="color: green; font-weight: bold;">✅ Connected! Redirecting...</div>';
                                    
                                    setTimeout(() => {
                                        window.location.href = '/';
                                    }, 2000);
                                }
                            });
                    }, 5000);
                </script>
                </html>
            `);
            
            // Listen for connection
            tempGifted.ev.on("connection.update", async (update) => {
                if (update.connection === "open") {
                    console.log("✅ User connected via pairing code");
                    
                    await delay(5000);
                    
                    // Read session data
                    const credsPath = path.join(tempSessionDir, "creds.json");
                    if (fs.existsSync(credsPath)) {
                        const sessionData = fs.readFileSync(credsPath);
                        
                        // Save to main session directory
                        const finalSessionPath = path.join(sessionDir, "creds.json");
                        fs.writeFileSync(finalSessionPath, sessionData);
                        
                        // Send success message
                        const finalSessionId = generateSessionId();
                        const phoneNumber = tempGifted.user?.id?.split(':')[0] || cleanNumber;
                        
                        const successMsg = `✅ *WhatsApp Paired Successfully!*\n\n` +
                                         `Your Session ID: \`${finalSessionId}\`\n` +
                                         `Phone: ${phoneNumber}\n\n` +
                                         `🤖 *Gifted-MD is now ready!*\n` +
                                         `Type \`.menu\` to see available commands.`;
                        
                        await tempGifted.sendMessage(tempGifted.user.id, { text: successMsg });
                        
                        // Close temporary connection
                        await tempGifted.ws.close();
                        
                        // Remove temp directory
                        fs.removeSync(tempSessionDir);
                        
                        // Restart main bot
                        if (global.restartBot) {
                            global.restartBot();
                        }
                    }
                }
            });
        }
        
    } catch (error) {
        console.error("Pairing error:", error);
        res.send(`
            <!DOCTYPE html>
            <html>
            <body>
                <div style="color: red; text-align: center; padding: 50px;">
                    <h1>Error</h1>
                    <p>Failed to generate pairing code: ${error.message}</p>
                    <p><a href="/">Try Again</a></p>
                </div>
            </body>
            </html>
        `);
    }
});

// Status endpoint
app.get('/status', (req, res) => {
    const sessionExists = fs.existsSync(path.join(sessionDir, "creds.json"));
    const status = {
        bot: Gifted ? "Connected" : (sessionExists ? "Ready to Connect" : "Setup Mode"),
        session: sessionExists ? "Active" : "None",
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    };
    res.json(status);
});

// Start web server
app.listen(PORT, () => {
    console.log(`🚀 Gifted-MD running on http://localhost:${PORT}`);
    console.log(`📱 QR Code: http://localhost:${PORT}/qr`);
    console.log(`🔗 Pairing: http://localhost:${PORT}/pair?number=YOUR_NUMBER`);
});

// Global restart function
global.restartBot = function() {
    console.log("🔄 Restarting WhatsApp bot with new session...");
    
    if (Gifted && Gifted.ws) {
        Gifted.ws.close();
    }
    
    setTimeout(() => {
        startGifted().catch(err => {
            console.error("Restart error:", err);
            reconnectWithRetry();
        });
    }, 3000);
};

// Modified initialization
async function initializeBot() {
    try {
        // Try to load session (won't throw error if no session)
        const sessionLoaded = loadSession();
        
        // Check if session file exists
        const sessionFile = path.join(sessionDir, "creds.json");
        const hasSession = fs.existsSync(sessionFile);
        
        if (hasSession) {
            console.log("🤖 Starting WhatsApp bot with existing session...");
            startGifted().catch(err => {
                console.error("Bot startup error:", err);
                reconnectWithRetry();
            });
        } else {
            console.log("📱 No session found. Bot will start when user creates one.");
            console.log("💡 Users can visit /qr or /pair to create a session");
        }
        
    } catch (error) {
        console.error("Initialization error:", error);
    }
}

// Your existing startGifted function (keep all your existing bot logic)
async function startGifted() {
    try {
        const { version, isLatest } = await fetchLatestWaWebVersion();
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        
        if (store) {
            store.destroy();
        }
        store = new gmdStore();
        
        const giftedSock = {
            version,
            logger: pino({ level: "silent" }),
            browser: ['GIFTED', "safari", "1.0.0"],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            getMessage: async (key) => {
                if (store) {
                    const msg = store.loadMessage(key.remoteJid, key.id);
                    return msg?.message || undefined;
                }
                return { conversation: 'Error occurred' };
            },
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            markOnlineOnConnect: true,
            syncFullHistory: false,
            generateHighQualityLinkPreview: false,
            patchMessageBeforeSending: (message) => {
                const requiresPatch = !!(
                    message.buttonsMessage ||
                    message.templateMessage ||
                    message.listMessage
                );
                if (requiresPatch) {
                    message = {
                        viewOnceMessage: {
                            message: {
                                messageContextInfo: {
                                    deviceListMetadataVersion: 2,
                                    deviceListMetadata: {},
                                },
                                ...message,
                            },
                        },
                    };
                }
                return message;
            }
        };

        Gifted = giftedConnect(giftedSock);
        
        store.bind(Gifted.ev);

        Gifted.ev.process(async (events) => {
            if (events['creds.update']) {
                await saveCreds();
            }
        });

        // Check if this is a new session
        const sessionFile = path.join(sessionDir, "creds.json");
        if (fs.existsSync(sessionFile)) {
            const sessionData = fs.readFileSync(sessionFile, 'utf8');
            const sessionJson = JSON.parse(sessionData);
            
            // Extract phone number
            let phoneNumber = "Unknown";
            if (sessionJson.me && sessionJson.me.id) {
                phoneNumber = sessionJson.me.id.split('@')[0];
            }
            
            console.log(`🤖 Bot connected for: ${phoneNumber}`);
            
            // Send welcome message for new sessions
            if (Gifted.user && startMess === 'true') {
                setTimeout(async () => {
                    const welcomeMsg = `✅ *Gifted-MD Connected Successfully!*\n\n` +
                                     `Phone: ${phoneNumber}\n` +
                                     `Prefix: ${botPrefix}\n` +
                                     `Mode: ${botMode}\n\n` +
                                     `Type \`.menu\` to see available commands!\n` +
                                     `Type \`.help\` for assistance.\n\n` +
                                     `> ${botFooter}`;
                    
                    await Gifted.sendMessage(Gifted.user.id, { text: welcomeMsg });
                }, 5000);
            }
        }

        // YOUR EXISTING AUTO-REACT CODE (keep all your existing functionality)
        if (autoReact === "true") {
            Gifted.ev.on('messages.upsert', async (mek) => {
                ms = mek.messages[0];
                try {
                    if (ms.key.fromMe) return;
                    if (!ms.key.fromMe && ms.message) {
                        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                        await GiftedAutoReact(randomEmoji, ms, Gifted);
                    }
                } catch (err) {
                    console.error('Error during auto reaction:', err);
                }
            });
        }

        // ... [Keep ALL your existing bot code from here on]
        // All your existing message handlers, anti-delete, chatbot, etc.
        // I'm showing the structure, but you should keep your exact code

        const groupCooldowns = new Map();

        function isGroupSpamming(jid) {
            const now = Date.now();
            const lastTime = groupCooldowns.get(jid) || 0;
            if (now - lastTime < 1500) return true;
            groupCooldowns.set(jid, now);
            return false;
        }
        
        // ... [Keep ALL your existing code exactly as it is]
        // Only modified the beginning (web routes) and session loading
        
        Gifted.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === "connecting") {
                console.log("🕗 Connecting Bot...");
                reconnectAttempts = 0;
            }

            if (connection === "open") {
                console.log("✅ Connection Instance is Online");
                reconnectAttempts = 0;
                botStarted = true;
                
                setTimeout(async () => {
                    try {
                        const totalCommands = commands.filter((command) => command.pattern).length;
                        console.log('💜 Connected to Whatsapp, Active!');
                            
                        if (startMess === 'true') {
                            const md = botMode === 'public' ? "public" : "private";
                            const connectionMsg = `
*${botName} 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃*

𝐏𝐫𝐞𝐟𝐢𝐱       : *[ ${botPrefix} ]*
𝐏𝐥𝐮𝐠𝐢𝐧𝐬      : *${totalCommands.toString()}*
𝐌𝐨𝐝𝐞        : *${md}*
𝐎𝐰𝐧𝐞𝐫       : *${ownerNumber}*
𝐓𝐮𝐭𝐨𝐫𝐢𝐚𝐥𝐬     : *${config.YT}*
𝐔𝐩𝐝𝐚𝐭𝐞𝐬      : *${newsletterUrl}*

> *${botCaption}*`;

                            await Gifted.sendMessage(
                                Gifted.user.id,
                                {
                                    text: connectionMsg,
                                    ...createContext(botName, {
                                        title: "BOT INTEGRATED",
                                        body: "Status: Ready for Use"
                                    })
                                },
                                {
                                    disappearingMessagesInChat: true,
                                    ephemeralExpiration: 300,
                                }
                            );
                        }
                    } catch (err) {
                        console.error("Post-connection setup error:", err);
                    }
                }, 5000);
            }

            if (connection === "close") {
                const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
                
                console.log(`Connection closed due to: ${reason}`);
                botStarted = false;
                
                if (reason === DisconnectReason.badSession) {
                    console.log("Bad session file, delete it and scan again");
                    try {
                        await fs.remove(sessionDir);
                    } catch (e) {
                        console.error("Failed to remove session:", e);
                    }
                    process.exit(1);
                } else if (reason === DisconnectReason.connectionClosed) {
                    console.log("Connection closed, reconnecting...");
                    setTimeout(() => reconnectWithRetry(), RECONNECT_DELAY);
                } else if (reason === DisconnectReason.connectionLost) {
                    console.log("Connection lost from server, reconnecting...");
                    setTimeout(() => reconnectWithRetry(), RECONNECT_DELAY);
                } else if (reason === DisconnectReason.connectionReplaced) {
                    console.log("Connection replaced, another new session opened");
                    process.exit(1);
                } else if (reason === DisconnectReason.loggedOut) {
                    console.log("Device logged out, delete session and scan again");
                    try {
                        await fs.remove(sessionDir);
                    } catch (e) {
                        console.error("Failed to remove session:", e);
                    }
                    process.exit(1);
                } else if (reason === DisconnectReason.restartRequired) {
                    console.log("Restart required, restarting...");
                    setTimeout(() => reconnectWithRetry(), RECONNECT_DELAY);
                } else if (reason === DisconnectReason.timedOut) {
                    console.log("Connection timed out, reconnecting...");
                    setTimeout(() => reconnectWithRetry(), RECONNECT_DELAY * 2);
                } else {
                    console.log(`Unknown disconnect reason: ${reason}, attempting reconnection...`);
                    setTimeout(() => reconnectWithRetry(), RECONNECT_DELAY);
                }
            }
        });

        const cleanup = () => {
            if (store) {
                store.destroy();
            }
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);

    } catch (error) {
        console.error('Socket initialization error:', error);
        setTimeout(() => reconnectWithRetry(), RECONNECT_DELAY);
    }
}

async function reconnectWithRetry() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('Max reconnection attempts reached. Exiting...');
        process.exit(1);
    }

    reconnectAttempts++;
    const delay = Math.min(RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1), 300000);
    
    console.log(`Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms...`);
    
    setTimeout(async () => {
        try {
            await startGifted();
        } catch (error) {
            console.error('Reconnection failed:', error);
            reconnectWithRetry();
        }
    }, delay);
}

// Start everything
setTimeout(() => {
    initializeBot();
}, 2000);
