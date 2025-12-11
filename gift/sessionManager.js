const fs = require('fs-extra');
const path = require('path');
const { useMultiFileAuthState, delay } = require("gifted-baileys");
const axios = require('axios');

class SessionManager {
    constructor() {
        this.sessionDir = path.join(__dirname, "gift", "session");
        this.activePairings = new Map();
        this.ensureDirectories();
    }

    ensureDirectories() {
        fs.ensureDirSync(this.sessionDir);
        fs.ensureDirSync(path.join(this.sessionDir, 'temp'));
    }

    async createPairingSession() {
        const sessionId = `pair_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const tempSessionDir = path.join(this.sessionDir, 'temp', sessionId);
        
        await fs.ensureDir(tempSessionDir);
        
        const { state, saveCreds } = await useMultiFileAuthState(tempSessionDir);
        
        this.activePairings.set(sessionId, {
            state,
            saveCreds,
            tempDir: tempSessionDir,
            createdAt: Date.now(),
            connected: false
        });
        
        // Clean up old sessions after 10 minutes
        setTimeout(() => {
            if (this.activePairings.has(sessionId) && !this.activePairings.get(sessionId).connected) {
                this.cleanupPairingSession(sessionId);
            }
        }, 10 * 60 * 1000);
        
        return { sessionId, state, saveCreds };
    }

    async saveSession(sessionId, phoneNumber = null) {
        const pairing = this.activePairings.get(sessionId);
        if (!pairing) {
            throw new Error('Pairing session not found');
        }

        try {
            // Wait a bit for session to stabilize
            await delay(3000);
            
            const credsPath = path.join(pairing.tempDir, "creds.json");
            if (!fs.existsSync(credsPath)) {
                throw new Error('No session data found');
            }

            // Read the session data
            const sessionData = fs.readFileSync(credsPath, 'utf8');
            
            // Save to main session directory
            const finalSessionPath = path.join(this.sessionDir, "creds.json");
            fs.writeFileSync(finalSessionPath, sessionData);
            
            // Mark as connected
            pairing.connected = true;
            
            console.log(`✅ Session saved for: ${phoneNumber || 'Unknown'}`);
            
            // Clean up temp directory after a delay
            setTimeout(() => {
                this.cleanupPairingSession(sessionId);
            }, 5000);
            
            return {
                success: true,
                phoneNumber: phoneNumber || this.extractPhoneNumber(sessionData),
                sessionData: JSON.parse(sessionData)
            };
            
        } catch (error) {
            console.error('Error saving session:', error);
            throw error;
        }
    }

    extractPhoneNumber(sessionData) {
        try {
            const sessionJson = JSON.parse(sessionData);
            if (sessionJson.me && sessionJson.me.id) {
                return sessionJson.me.id.split('@')[0];
            }
        } catch (e) {
            // Ignore
        }
        return null;
    }

    async cleanupPairingSession(sessionId) {
        const pairing = this.activePairings.get(sessionId);
        if (pairing && pairing.tempDir) {
            try {
                await fs.remove(pairing.tempDir);
            } catch (e) {
                console.error('Error cleaning up temp session:', e);
            }
        }
        this.activePairings.delete(sessionId);
    }

    hasActiveSession() {
        const mainSessionPath = path.join(this.sessionDir, "creds.json");
        return fs.existsSync(mainSessionPath);
    }

    getSessionData() {
        const mainSessionPath = path.join(this.sessionDir, "creds.json");
        if (fs.existsSync(mainSessionPath)) {
            try {
                const data = fs.readFileSync(mainSessionPath, 'utf8');
                return JSON.parse(data);
            } catch (e) {
                return null;
            }
        }
        return null;
    }
}

// Export singleton
const sessionManager = new SessionManager();
module.exports = sessionManager;
