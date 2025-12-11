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
const PORT = process.env.PORT || 4420;

let Gifted;
logger.level = "silent";

// Use gift folder for everything
app.use(express.static("gift"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionDir = path.join(__dirname, "gift", "session");

loadSession();

let store; 
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 50;
const RECONNECT_DELAY = 5000;

// Simple helper functions
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

// WEB ROUTES FOR SESSION GENERATION
app.get("/", (req, res) => {
    res.sendFile(__dirname + "/gift/gifted.html");
});

// QR Code Route
app.get('/qr', async (req, res) => {
    const sessionId = getRandomId();
    const tempSessionDir = path.join(sessionDir, sessionId);
    
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
                            body { text-align: center; padding: 50px; font-family: Arial; }
                            .qr-code { width: 300px; height: 300px; margin: 20px auto; }
                            .qr-code img { width: 100%; height: 100%; }
                            h1 { color: #333; }
                        </style>
                    </head>
                    <body>
                        <h1>Scan QR Code</h1>
                        <div class="qr-code">
                            <img src="${qrImage}" alt="QR Code"/>
                        </div>
                        <p>Scan with WhatsApp > Linked Devices</p>
                        <a href="/">Back</a>
                    </body>
                    </html>
                `);
            }
            
            if (connection === "open") {
                // Wait for session to be ready
                await delay(5000);
                
                // Read session data
                const credsPath = path.join(tempSessionDir, "creds.json");
                if (fs.existsSync(credsPath)) {
                    const sessionData = fs.readFileSync(credsPath);
                    
                    // Generate final session ID
                    const finalSessionId = generateSessionId();
                    
                    // Save to main session directory
                    const finalSessionPath = path.join(sessionDir, "creds.json");
                    fs.writeFileSync(finalSessionPath, sessionData);
                    
                    // Send success message to user
                    const userMessage = `✅ *Session Generated Successfully!*\n\n` +
                                      `Your Session ID: \`${finalSessionId}\`\n\n` +
                                      `The bot is now connected and ready!\n` +
                                      `Type \`.menu\` to see available commands.`;
                    
                    await tempGifted.sendMessage(tempGifted.user.id, { text: userMessage });
                    
                    // Also send to bot owner
                    if (ownerNumber) {
                        await tempGifted.sendMessage(
                            `${ownerNumber.replace(/\D/g, '')}@s.whatsapp.net`,
                            { 
                                text: `📱 *New User Connected*\n\n` +
                                      `Session ID: ${finalSessionId}\n` +
                                      `User: ${tempGifted.user.id}\n` +
                                      `Time: ${new Date().toLocaleString()}`
                            }
                        );
                    }
                    
                    await delay(2000);
                    await tempGifted.ws.close();
                    
                    // Restart main bot with new session
                    setTimeout(() => {
                        console.log(`🔄 Restarting bot with new session: ${finalSessionId}`);
                        if (Gifted && Gifted.ws) {
                            Gifted.ws.close();
                        }
                        setTimeout(startGifted, 3000);
                    }, 1000);
                }
                
                // Cleanup temp session
                fs.removeSync(tempSessionDir);
            }
        });
        
        // Timeout after 2 minutes
        setTimeout(() => {
            if (!qrSent) {
                res.send("QR generation timeout. Please try again.");
                if (tempGifted.ws) tempGifted.ws.close();
                fs.removeSync(tempSessionDir);
            }
        }, 120000);
        
    } catch (error) {
        console.error("QR generation error:", error);
        res.status(500).send("Error generating QR code");
    }
});

// Pairing Code Route
app.get('/pair', async (req, res) => {
    const { number } = req.query;
    
    if (!number) {
        return res.json({ error: "Phone number required" });
    }
    
    const sessionId = getRandomId();
    const tempSessionDir = path.join(sessionDir, sessionId);
    
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
            
            res.json({ 
                code: code,
                message: "Enter this code in WhatsApp > Linked Devices"
            });
            
            // Listen for connection
            tempGifted.ev.on("connection.update", async (update) => {
                if (update.connection === "open") {
                    await delay(5000);
                    
                    // Read session data
                    const credsPath = path.join(tempSessionDir, "creds.json");
                    if (fs.existsSync(credsPath)) {
                        const sessionData = fs.readFileSync(credsPath);
                        
                        // Generate final session ID
                        const finalSessionId = generateSessionId();
                        
                        // Save to main session directory
                        const finalSessionPath = path.join(sessionDir, "creds.json");
                        fs.writeFileSync(finalSessionPath, sessionData);
                        
                        // Send success message
                        const userMessage = `✅ *WhatsApp Paired Successfully!*\n\n` +
                                          `Your Session ID: \`${finalSessionId}\`\n\n` +
                                          `Gifted-MD is now ready!\n` +
                                          `Type \`.menu\` for commands.`;
                        
                        await tempGifted.sendMessage(tempGifted.user.id, { text: userMessage });
                        
                        // Close temporary connection
                        await tempGifted.ws.close();
                        
                        // Restart main bot
                        setTimeout(() => {
                            console.log(`🔄 Restarting bot with paired session: ${finalSessionId}`);
                            if (Gifted && Gifted.ws) {
                                Gifted.ws.close();
                            }
                            setTimeout(startGifted, 3000);
                        }, 1000);
                    }
                    
                    // Cleanup
                    fs.removeSync(tempSessionDir);
                }
            });
        }
        
    } catch (error) {
        console.error("Pairing error:", error);
        res.json({ error: "Failed to generate pairing code" });
    }
});

// Status page
app.get('/status', (req, res) => {
    const status = {
        bot: Gifted ? "Connected" : "Disconnected",
        session: fs.existsSync(path.join(sessionDir, "creds.json")) ? "Active" : "None",
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

// YOUR EXISTING BOT CODE STARTS HERE (with minor modifications)
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
            setInterval(() => GiftedAutoBio(Gifted), 1000 * 60);
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

        // Message handling (YOUR EXISTING CODE CONTINUES...)
        // ... [Keep all your existing message handling code exactly as it is] ...
        
        // The rest of your existing code remains exactly the same
        // Only the beginning (web routes) and end (connection handling) were modified
        
        Gifted.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === "connecting") {
                console.log("🕗 Connecting Bot...");
                reconnectAttempts = 0;
            }

            if (connection === "open") {
                console.log("✅ Connection Instance is Online");
                reconnectAttempts = 0;
                
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
                
                if (reason === DisconnectReason.badSession) {
                    console.log("Bad session file, delete it and scan again");
                    try {
                        await fs.remove(__dirname + "/gift/session");
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
                        await fs.remove(__dirname + "/gift/session");
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
    startGifted().catch(err => {
        console.error("Initialization error:", err);
        reconnectWithRetry();
    });
}, 5000);
