const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// Determine Persistent Data Directory
// On Render, DATA_DIR can be set to the mount path of a Persistent Disk (e.g. /data or /var/data)
// In local development or fallback, it defaults to path.join(__dirname, 'data')
let persistentDir = process.env.DATA_DIR;
if (!persistentDir && process.platform !== 'win32') {
    if (fsSync.existsSync('/data')) persistentDir = '/data';
    else if (fsSync.existsSync('/var/data')) persistentDir = '/var/data';
}
const baseDir = persistentDir ? path.resolve(persistentDir) : path.join(__dirname, 'data');

const subscriptionsFile = path.join(baseDir, 'subscriptions.json');
const reportsFile = path.join(baseDir, 'reports.json');
const transactionsFile = path.join(baseDir, 'transactions.json');
const metadataFile = path.join(baseDir, 'metadata.json');

// Legacy fallback path in project root
const legacySubscriptionsFile = path.join(__dirname, 'subscriptions.json');

const { AsyncLocalStorage } = require('async_hooks');
const lockStorage = new AsyncLocalStorage();

// Mutex Lock for Safe Concurrency (Re-entrant via AsyncLocalStorage)
let dbMutex = Promise.resolve();
const withDbLock = (fn) => {
    if (lockStorage.getStore()) {
        return fn();
    }
    const next = dbMutex.then(() => lockStorage.run(true, () => fn())).catch(err => {
        console.error('dbMutex error in dataManager:', err);
        throw err;
    });
    dbMutex = next.catch(() => {});
    return next;
};

// Safe Atomic File Write (write to .tmp then rename)
const atomicWriteJson = async (filePath, data) => {
    const dir = path.dirname(filePath);
    if (!fsSync.existsSync(dir)) {
        await fs.mkdir(dir, { recursive: true });
    }
    const tempFile = `${filePath}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const jsonStr = JSON.stringify(data, null, 2);
    try {
        await fs.writeFile(tempFile, jsonStr, 'utf-8');
        await fs.rename(tempFile, filePath);
    } catch (err) {
        try {
            if (fsSync.existsSync(tempFile)) {
                await fs.unlink(tempFile);
            }
        } catch (cleanupErr) {}
        console.error(`Atomic write failed for ${filePath}:`, err.message);
        throw err;
    }
};

const readJsonSafe = async (filePath, defaultValue) => {
    try {
        if (!fsSync.existsSync(filePath)) return defaultValue;
        const content = await fs.readFile(filePath, 'utf-8');
        if (!content || !content.trim()) return defaultValue;
        return JSON.parse(content);
    } catch (err) {
        console.warn(`Warning reading ${filePath}: ${err.message}. Using default.`);
        return defaultValue;
    }
};

// Precise Real-Time Subscription Calculations (Server UTC)
const getRemainingDays = (endIso) => {
    if (!endIso) return 0;
    const now = Date.now();
    const end = new Date(endIso).getTime();
    if (isNaN(end)) return 0;
    const diffMs = end - now;
    return diffMs > 0 ? Math.ceil(diffMs / (1000 * 60 * 60 * 24)) : 0;
};

const normalizeSubscription = (user) => {
    if (!user) return null;
    const now = new Date();

    // Preserve points balance
    user.points = Number(user.points != null ? user.points : (user.balance_points != null ? user.balance_points : 0));
    user.balance_points = user.points;

    // Status: active, suspended, cancelled
    user.status = user.status || 'active';

    // Ensure ISO timestamps
    if (!user.subscription_start_at && user.subscription_start_date) {
        user.subscription_start_at = user.subscription_start_date;
    }
    if (!user.subscription_end_at && (user.subscription_end_date || user.subscriptionExpires)) {
        user.subscription_end_at = user.subscription_end_date || user.subscriptionExpires;
    }

    // If subscriptionDays was set but no end_at date, calculate from now
    if (user.subscriptionDays > 0 && !user.subscription_end_at) {
        const end = new Date(now.getTime() + user.subscriptionDays * 86400000);
        user.subscription_start_at = user.subscription_start_at || now.toISOString();
        user.subscription_end_at = end.toISOString();
    }

    // Dynamic days remaining computed from real server UTC time
    user.daysRemaining = getRemainingDays(user.subscription_end_at);
    user.subscriptionDays = user.daysRemaining;

    // Dynamic days used
    if (user.subscription_start_at) {
        const start = new Date(user.subscription_start_at).getTime();
        user.daysUsed = isNaN(start) ? 0 : Math.max(0, Math.floor((now.getTime() - start) / 86400000));
    } else {
        user.daysUsed = 0;
    }

    // Plan and payment source
    user.plan = user.plan || (user.daysRemaining > 0 ? 'unlimited' : 'points');
    user.report_payment_source = user.report_payment_source || (user.plan === 'unlimited' ? 'unlimited' : 'points');

    return user;
};

// Owner Account Constants
// SECURITY: read from environment only. Configure ADMIN_CHAT_ID and ADMIN_USERNAME in Render.
const OWNER_CHAT_ID = String(process.env.ADMIN_CHAT_ID || '').trim();
const OWNER_USERNAME = String(process.env.ADMIN_USERNAME || '').trim().replace(/^@/, '');

if (!OWNER_CHAT_ID) {
    console.error('\n\u274c dataManager: ADMIN_CHAT_ID environment variable is required (owner account).');
    console.error('   Set it in Render -> your service -> Environment.\n');
    process.exit(1);
}

class DataManager {
    constructor() {
        this.baseDir = baseDir;
        this.initialized = false;
    }

    async init() {
        return withDbLock(async () => {
            if (this.initialized) return;

            // Ensure storage directory exists
            if (!fsSync.existsSync(this.baseDir)) {
                await fs.mkdir(this.baseDir, { recursive: true });
                console.log(`✓ Created persistent storage directory: ${this.baseDir}`);
            }

            // Check metadata to see if migration is needed
            let metadata = await readJsonSafe(metadataFile, { migration_version: 0 });

            if (!metadata || metadata.migration_version < 1) {
                console.log('🔄 Performing one-time safe data migration...');
                await this.performMigration();
            } else {
                console.log(`✓ Data store already at migration_version: ${metadata.migration_version}`);
            }

            // Always ensure owner account is active, 365 days, 10,000 points, unlimited
            await this.bootstrapOwnerAccount();

            this.initialized = true;
            console.log(`✅ DataManager initialized on directory: ${this.baseDir}`);
        });
    }

    // One-Time Safe Migration
    async performMigration() {
        let legacyData = { subscriptions: {}, transactions: [] };

        // 1. Check if legacy subscriptions.json exists
        if (fsSync.existsSync(legacySubscriptionsFile)) {
            try {
                const raw = await fs.readFile(legacySubscriptionsFile, 'utf-8');
                legacyData = JSON.parse(raw);
            } catch (err) {
                console.warn('Could not read legacy subscriptions.json:', err.message);
            }
        }

        // Also check if subscriptionsFile exists in baseDir with legacy format
        if (fsSync.existsSync(subscriptionsFile)) {
            try {
                const raw = await fs.readFile(subscriptionsFile, 'utf-8');
                const parsed = JSON.parse(raw);
                if (parsed.subscriptions) {
                    legacyData.subscriptions = { ...legacyData.subscriptions, ...parsed.subscriptions };
                }
                if (parsed.transactions && parsed.transactions.length > 0) {
                    legacyData.transactions = [...legacyData.transactions, ...parsed.transactions];
                }
            } catch (err) {}
        }

        // 2. Pre-migration Counts
        let subscribersBefore = 0;
        let reportsBefore = 0;
        let transactionsBefore = (legacyData.transactions || []).length;
        let pointsBefore = 0;

        for (const [cid, user] of Object.entries(legacyData.subscriptions || {})) {
            subscribersBefore++;
            const pts = Number(user.points != null ? user.points : (user.balance_points || 0));
            pointsBefore += pts;
            if (Array.isArray(user.reports)) {
                reportsBefore += user.reports.length;
            }
        }

        console.log(`[Migration] Pre-check: ${subscribersBefore} subscribers, ${reportsBefore} reports, ${transactionsBefore} tx, ${pointsBefore} points.`);

        // 3. Transform to New Separated Structure
        const newSubscriptions = {};
        const newReports = {};
        const newTransactions = Array.isArray(legacyData.transactions) ? [...legacyData.transactions] : [];

        for (const [cid, rawUser] of Object.entries(legacyData.subscriptions || {})) {
            const user = normalizeSubscription({ ...rawUser });
            const userReports = Array.isArray(rawUser.reports) ? rawUser.reports : [];

            // Extract reports into newReports collection
            for (const rep of userReports) {
                const repId = rep.id || rep.data?.leaveId || ('GSL_' + Math.random().toString(36).substring(2, 9));
                const serviceCode = rep.data?.service_code || rep.data?.leaveId || repId;
                const shortURL = rep.shortURL || rep.data?.short_url || '';
                
                newReports[repId] = {
                    id: repId,
                    report_id: repId,
                    chat_id: String(cid),
                    username: user.username || null,
                    patient_name: rep.patientName || rep.data?.patient_name_ar || rep.data?.patient_name_en || '',
                    national_id: rep.data?.national_id || '',
                    issue_date: rep.issueDate || rep.data?.issue_date || new Date().toISOString().slice(0, 10),
                    issue_time: rep.data?.issue_time || '',
                    type: rep.type || 'sick',
                    service_code: serviceCode,
                    inquiry_url: shortURL,
                    short_url: shortURL,
                    payment_type: user.report_payment_source || (user.plan === 'unlimited' ? 'unlimited' : 'points'),
                    points_deducted: 0,
                    pdf_ref: rep.fileId || null,
                    file_id: rep.fileId || null,
                    status: 'issued',
                    created_at: rep.data?.issue_date ? new Date(rep.data.issue_date).toISOString() : new Date().toISOString(),
                    data: rep.data || {}
                };
            }

            // Save user in subscriptions without large embedded report data
            user.reportsCount = userReports.length;
            user.reports = userReports.map(r => r.id); // store IDs reference only
            newSubscriptions[cid] = user;
        }

        // 4. Atomic writes for all new stores
        await atomicWriteJson(subscriptionsFile, newSubscriptions);
        await atomicWriteJson(reportsFile, newReports);
        await atomicWriteJson(transactionsFile, newTransactions);

        // 5. Post-migration Verification
        let subscribersAfter = Object.keys(newSubscriptions).length;
        let reportsAfter = Object.keys(newReports).length;
        let transactionsAfter = newTransactions.length;
        let pointsAfter = Object.values(newSubscriptions).reduce((sum, u) => sum + (u.points || 0), 0);

        console.log(`[Migration] Post-check: ${subscribersAfter} subscribers, ${reportsAfter} reports, ${transactionsAfter} tx, ${pointsAfter} points.`);

        const isExactMatch = (
            subscribersBefore === subscribersAfter &&
            reportsBefore === reportsAfter &&
            transactionsBefore === transactionsAfter &&
            pointsBefore === pointsAfter
        );

        if (!isExactMatch) {
            console.error('❌ MIGRATION MISMATCH DETECTED!');
            console.error(`Subscribers: ${subscribersBefore} -> ${subscribersAfter}`);
            console.error(`Reports: ${reportsBefore} -> ${reportsAfter}`);
            console.error(`Transactions: ${transactionsBefore} -> ${transactionsAfter}`);
            console.error(`Points: ${pointsBefore} -> ${pointsAfter}`);
            throw new Error('Migration data count mismatch. Halting to preserve data.');
        }

        // 6. Save migration flag in metadata.json
        const metadata = {
            migration_version: 1,
            migrated_at: new Date().toISOString(),
            metrics: {
                subscribers: subscribersAfter,
                reports: reportsAfter,
                transactions: transactionsAfter,
                points: pointsAfter
            }
        };
        await atomicWriteJson(metadataFile, metadata);
        console.log('✅ Migration 1 completed with 100% verification match and metadata written.');
    }

    // Bootstrap Owner Account (from ADMIN_CHAT_ID)
    async bootstrapOwnerAccount() {
        const subs = await readJsonSafe(subscriptionsFile, {});
        const now = new Date();
        const start = new Date('2026-09-15T00:00:00.000Z');
        const end = new Date('2027-09-17T23:59:59.999Z');

        let owner = subs[OWNER_CHAT_ID];
        let needsSave = false;

        if (!owner) {
            owner = {
                username: OWNER_USERNAME,
                name: 'Zakaria Mohammed',
                status: 'active',
                plan: 'unlimited',
                report_payment_source: 'unlimited',
                points: 10000,
                balance_points: 10000,
                subscriptionDays: 365,
                subscription_start_at: start.toISOString(),
                subscription_end_at: end.toISOString(),
                subscription_start_date: start.toISOString(),
                subscription_end_date: end.toISOString(),
                reports: [],
                reportsCount: 0,
                referredBy: null,
                referralsCount: 0,
                referralPoints: 0,
                updatedAt: now.toISOString()
            };
            subs[OWNER_CHAT_ID] = owner;
            needsSave = true;
            console.log(`✓ Initialized Owner Account ${OWNER_CHAT_ID}`);
        } else {
            // Guarantee 10,000 points, 365 days, active, unlimited
            if ((owner.points || 0) < 10000) {
                owner.points = 10000;
                owner.balance_points = 10000;
                needsSave = true;
            }
            if (owner.status !== 'active') {
                owner.status = 'active';
                needsSave = true;
            }
            if (owner.plan !== 'unlimited') {
                owner.plan = 'unlimited';
                needsSave = true;
            }
            if (owner.report_payment_source !== 'unlimited') {
                owner.report_payment_source = 'unlimited';
                needsSave = true;
            }
            if (!owner.subscription_end_at || new Date(owner.subscription_end_at) < end) {
                owner.subscription_start_at = start.toISOString();
                owner.subscription_end_at = end.toISOString();
                owner.subscription_start_date = start.toISOString();
                owner.subscription_end_date = end.toISOString();
                needsSave = true;
            }
            owner.username = OWNER_USERNAME;
            subs[OWNER_CHAT_ID] = normalizeSubscription(owner);
        }

        // Clean up pending owner alias if present
        if (subs['pending_' + OWNER_USERNAME]) {
            delete subs['pending_' + OWNER_USERNAME];
            needsSave = true;
        }

        if (needsSave) {
            await atomicWriteJson(subscriptionsFile, subs);
            console.log(`✅ Owner Account ${OWNER_CHAT_ID} verified: ACTIVE, 365 DAYS, 10000 POINTS, UNLIMITED`);
        }
    }

    // Subscriber Operations
    async getSubscriber(chatId, username = null, referrerId = null) {
        return withDbLock(async () => {
            const subs = await readJsonSafe(subscriptionsFile, {});
            const chatIdStr = String(chatId);
            const cleanedUsername = username ? String(username).replace(/^@/, '').toLowerCase() : null;

            let user = null;
            let foundChatId = chatIdStr;

            // 1. Search by Username
            if (cleanedUsername) {
                for (const [cid, s] of Object.entries(subs)) {
                    if (s.username && s.username.toLowerCase() === cleanedUsername) {
                        user = s;
                        foundChatId = cid;
                        break;
                    }
                }
            }

            // 2. Search by Chat ID
            if (!user && subs[chatIdStr]) {
                user = subs[chatIdStr];
                foundChatId = chatIdStr;
            }

            // 3. If exists, normalize and return
            if (user) {
                user = normalizeSubscription(user);
                if (cleanedUsername && user.username !== cleanedUsername) {
                    user.username = cleanedUsername;
                }

                // If found under a pending username, migrate to active numeric chatId
                if (foundChatId !== chatIdStr) {
                    subs[chatIdStr] = user;
                    delete subs[foundChatId];
                    await atomicWriteJson(subscriptionsFile, subs);
                }
                return { chatId: chatIdStr, ...user };
            }

            // 4. Create new user if not found
            // Rule 7 & 8: New users start with 0 points, unsubscribed (or standard default)
            const now = new Date();
            user = {
                username: cleanedUsername,
                name: cleanedUsername ? `@${cleanedUsername}` : `مستخدم ${chatIdStr}`,
                status: 'active',
                plan: 'points',
                report_payment_source: 'points',
                points: 0,
                balance_points: 0,
                subscriptionDays: 0,
                subscription_start_at: null,
                subscription_end_at: null,
                reportsCount: 0,
                reports: [],
                referredBy: referrerId ? String(referrerId) : null,
                referralsCount: 0,
                referralPoints: 0,
                createdAt: now.toISOString(),
                updatedAt: now.toISOString()
            };

            // Referral bonus hook
            if (referrerId && subs[String(referrerId)]) {
                subs[String(referrerId)].referralsCount = (subs[String(referrerId)].referralsCount || 0) + 1;
            }

            subs[chatIdStr] = normalizeSubscription(user);
            await atomicWriteJson(subscriptionsFile, subs);
            return { chatId: chatIdStr, ...subs[chatIdStr] };
        });
    }

    async getAllSubscribers() {
        return withDbLock(async () => {
            const subs = await readJsonSafe(subscriptionsFile, {});
            const list = [];
            for (const [cid, u] of Object.entries(subs)) {
                list.push({ chatId: cid, ...normalizeSubscription(u) });
            }
            return list;
        });
    }

    async saveSubscriber(chatId, userData) {
        return withDbLock(async () => {
            const subs = await readJsonSafe(subscriptionsFile, {});
            const chatIdStr = String(chatId);
            const normalized = normalizeSubscription(userData);
            normalized.updatedAt = new Date().toISOString();
            subs[chatIdStr] = normalized;
            await atomicWriteJson(subscriptionsFile, subs);
            return { chatId: chatIdStr, ...normalized };
        });
    }

    async deleteSubscriber(chatId) {
        return withDbLock(async () => {
            const cleanId = String(chatId).trim();
            if (cleanId === OWNER_CHAT_ID) return false;
            const subs = await readJsonSafe(subscriptionsFile, {});
            if (subs[cleanId]) {
                delete subs[cleanId];
                await atomicWriteJson(subscriptionsFile, subs);
                return true;
            }
            return false;
        });
    }

    async updateSubscriber(chatId, updateFn) {
        return withDbLock(async () => {
            const subs = await readJsonSafe(subscriptionsFile, {});
            const chatIdStr = String(chatId);
            if (!subs[chatIdStr]) {
                throw new Error(`المشترك ${chatIdStr} غير موجود.`);
            }
            const current = normalizeSubscription(subs[chatIdStr]);
            const updated = updateFn(current);
            const normalized = normalizeSubscription(updated || current);
            normalized.updatedAt = new Date().toISOString();
            subs[chatIdStr] = normalized;
            await atomicWriteJson(subscriptionsFile, subs);
            return { chatId: chatIdStr, ...normalized };
        });
    }

    // Reports Operations
    async saveReport(report) {
        return withDbLock(async () => {
            const reports = await readJsonSafe(reportsFile, {});
            const repId = report.id || report.report_id || report.data?.leaveId || ('GSL_' + Math.random().toString(36).substring(2, 9));
            const chatIdStr = String(report.chat_id || report.chatId);
            const now = new Date().toISOString();

            const record = {
                id: repId,
                report_id: repId,
                chat_id: chatIdStr,
                username: report.username || null,
                patient_name: report.patient_name || report.patientName || report.data?.patient_name_ar || '',
                national_id: report.national_id || report.data?.national_id || '',
                issue_date: report.issue_date || report.issueDate || report.data?.issue_date || now.slice(0, 10),
                issue_time: report.issue_time || report.data?.issue_time || '',
                type: report.type || 'sick',
                service_code: report.service_code || report.data?.service_code || repId,
                inquiry_url: report.inquiry_url || report.short_url || report.shortURL || '',
                short_url: report.short_url || report.shortURL || report.inquiry_url || '',
                payment_type: report.payment_type || 'points',
                points_deducted: report.points_deducted != null ? Number(report.points_deducted) : 0,
                pdf_ref: report.pdf_ref || report.file_id || report.fileId || null,
                file_id: report.file_id || report.fileId || report.pdf_ref || null,
                status: report.status || 'issued',
                created_at: report.created_at || now,
                updated_at: now,
                data: report.data || {}
            };

            reports[repId] = record;
            await atomicWriteJson(reportsFile, reports);

            // Update user's report reference in subscriptions.json
            const subs = await readJsonSafe(subscriptionsFile, {});
            if (subs[chatIdStr]) {
                if (!Array.isArray(subs[chatIdStr].reports)) {
                    subs[chatIdStr].reports = [];
                }
                if (!subs[chatIdStr].reports.includes(repId)) {
                    subs[chatIdStr].reports.push(repId);
                }
                subs[chatIdStr].reportsCount = subs[chatIdStr].reports.length;
                subs[chatIdStr].updatedAt = now;
                await atomicWriteJson(subscriptionsFile, subs);
            }

            // Backward-compatibility mirror to root subscriptions.json if it exists
            if (fsSync.existsSync(legacySubscriptionsFile)) {
                try {
                    const legacy = await readJsonSafe(legacySubscriptionsFile, { subscriptions: {} });
                    if (legacy && legacy.subscriptions && legacy.subscriptions[chatIdStr]) {
                        if (!Array.isArray(legacy.subscriptions[chatIdStr].reports)) {
                            legacy.subscriptions[chatIdStr].reports = [];
                        }
                        const rIdx = legacy.subscriptions[chatIdStr].reports.findIndex(r => (typeof r === 'string' ? r : r.id) === repId);
                        const legacyRepObj = {
                            id: repId,
                            leaveId: repId,
                            patientName: record.patient_name,
                            type: record.type,
                            issueDate: record.issue_date,
                            shortURL: record.short_url,
                            data: {
                                ...record.data,
                                short_url: record.short_url,
                                service_code: record.service_code || repId
                            }
                        };
                        if (rIdx >= 0) {
                            legacy.subscriptions[chatIdStr].reports[rIdx] = legacyRepObj;
                        } else {
                            legacy.subscriptions[chatIdStr].reports.push(legacyRepObj);
                        }
                        await atomicWriteJson(legacySubscriptionsFile, legacy);
                    }
                } catch (legacyErr) {
                    console.warn('Legacy subscriptions.json mirror notice:', legacyErr.message);
                }
            }

            return record;
        });
    }

    async getReportById(reportId) {
        return withDbLock(async () => {
            const reports = await readJsonSafe(reportsFile, {});
            return reports[reportId] || null;
        });
    }

    async getReportByServiceCode(code) {
        return withDbLock(async () => {
            const reports = await readJsonSafe(reportsFile, {});
            const cleanCode = String(code || '').trim().toLowerCase();
            for (const rep of Object.values(reports)) {
                if (rep.service_code && rep.service_code.toLowerCase() === cleanCode) {
                    return rep;
                }
                if (rep.id && rep.id.toLowerCase() === cleanCode) {
                    return rep;
                }
                if (rep.data && (rep.data.leaveId?.toLowerCase() === cleanCode || rep.data.service_code?.toLowerCase() === cleanCode)) {
                    return rep;
                }
            }
            return null;
        });
    }

    // Subscriber Report History (Strict backend isolation)
    async getUserReports(chatId) {
        return withDbLock(async () => {
            const reports = await readJsonSafe(reportsFile, {});
            const chatIdStr = String(chatId);
            const userReports = [];

            for (const rep of Object.values(reports)) {
                if (String(rep.chat_id) === chatIdStr) {
                    userReports.push(rep);
                }
            }

            // Sort by created_at or issue_date descending
            userReports.sort((a, b) => new Date(b.created_at || b.issue_date) - new Date(a.created_at || a.issue_date));
            return userReports;
        });
    }

    // Admin Report History (Search, Filter, Pagination)
    async getAllReports({ search = '', fromDate = '', toDate = '', userFilter = '', page = 1, limit = 50 } = {}) {
        return withDbLock(async () => {
            const reports = await readJsonSafe(reportsFile, {});
            let list = Object.values(reports);

            // Filter by search query (patient name, national id, service code, report id)
            if (search) {
                const s = search.trim().toLowerCase();
                list = list.filter(r => 
                    (r.id && r.id.toLowerCase().includes(s)) ||
                    (r.service_code && r.service_code.toLowerCase().includes(s)) ||
                    (r.patient_name && r.patient_name.toLowerCase().includes(s)) ||
                    (r.national_id && r.national_id.includes(s)) ||
                    (r.username && r.username.toLowerCase().includes(s)) ||
                    (r.chat_id && r.chat_id.includes(s))
                );
            }

            // Filter by User (chatId or username)
            if (userFilter) {
                const uf = userFilter.trim().toLowerCase();
                list = list.filter(r => 
                    (r.chat_id && r.chat_id.toLowerCase() === uf) ||
                    (r.username && r.username.toLowerCase() === uf)
                );
            }

            // Filter by Date Range
            if (fromDate) {
                list = list.filter(r => (r.issue_date || r.created_at) >= fromDate);
            }
            if (toDate) {
                list = list.filter(r => (r.issue_date || r.created_at) <= toDate);
            }

            // Sort descending by date
            list.sort((a, b) => new Date(b.created_at || b.issue_date) - new Date(a.created_at || a.issue_date));

            const total = list.length;
            const p = Math.max(1, parseInt(page) || 1);
            const l = Math.max(1, parseInt(limit) || 50);
            const paginated = list.slice((p - 1) * l, p * l);

            return {
                reports: paginated,
                total,
                page: p,
                totalPages: Math.ceil(total / l)
            };
        });
    }

    // Transactions Log
    async logTransaction(entry) {
        return withDbLock(async () => {
            const txs = await readJsonSafe(transactionsFile, []);
            const tx = {
                id: 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                timestamp: new Date().toISOString(),
                admin_chat_id: String(entry.admin_chat_id || 'system'),
                target_chat_id: String(entry.target_chat_id || ''),
                operation: String(entry.operation),
                amount: entry.amount !== null && entry.amount !== undefined ? Number(entry.amount) : null,
                previous_value: entry.previous_value !== null && entry.previous_value !== undefined ? String(entry.previous_value) : null,
                new_value: entry.new_value !== null && entry.new_value !== undefined ? String(entry.new_value) : null,
                details: String(entry.details || '')
            };
            txs.unshift(tx);
            if (txs.length > 5000) {
                txs.length = 5000;
            }
            await atomicWriteJson(transactionsFile, txs);
            return tx;
        });
    }

    async getTransactions(targetChatId = null) {
        return withDbLock(async () => {
            const txs = await readJsonSafe(transactionsFile, []);
            if (!targetChatId) return txs;
            const cid = String(targetChatId);
            return txs.filter(tx => tx.target_chat_id === cid || tx.admin_chat_id === cid);
        });
    }

    // Global Statistics (Server-Computed)
    async getStats() {
        return withDbLock(async () => {
            const subs = await readJsonSafe(subscriptionsFile, {});
            const reports = await readJsonSafe(reportsFile, {});

            let totalSubscribers = 0;
            let activeSubscribers = 0;
            let suspendedSubscribers = 0;
            let expiredSubscribers = 0;
            let pointsSubscribers = 0;
            let unlimitedSubscribers = 0;
            let totalPoints = 0;

            for (const user of Object.values(subs)) {
                totalSubscribers++;
                const norm = normalizeSubscription(user);
                totalPoints += norm.points || 0;

                if (norm.status === 'suspended') {
                    suspendedSubscribers++;
                } else if (norm.status === 'cancelled') {
                    expiredSubscribers++;
                } else if (norm.daysRemaining > 0) {
                    activeSubscribers++;
                } else {
                    expiredSubscribers++;
                }

                if (norm.report_payment_source === 'unlimited') {
                    unlimitedSubscribers++;
                } else {
                    pointsSubscribers++;
                }
            }

            return {
                totalSubscribers,
                activeSubscribers,
                suspendedSubscribers,
                expiredSubscribers,
                totalReports: Object.keys(reports).length,
                totalPoints,
                pointsSubscribers,
                unlimitedSubscribers,
                serverTime: new Date().toISOString()
            };
        });
    }

    async mergeDataSafe({ reports = {}, subscribers = {}, transactions = [] }) {
        return withDbLock(async () => {
            const currentReports = await readJsonSafe(reportsFile, {});
            const currentSubs = await readJsonSafe(subscriptionsFile, {});
            const currentTxs = await readJsonSafe(transactionsFile, []);

            const reportsCountBefore = Object.keys(currentReports).length;
            const subsCountBefore = Object.keys(currentSubs).length;
            const txsCountBefore = currentTxs.length;

            let addedReports = 0;
            let mergedSubs = 0;
            let addedTxs = 0;

            // 1. Merge Reports (Strict Non-Destructive: never overwrite existing live report)
            for (const [repId, repData] of Object.entries(reports)) {
                if (!currentReports[repId]) {
                    currentReports[repId] = repData;
                    addedReports++;
                }
            }

            // 2. Merge Subscribers (Never reduce points, never cancel active, preserve live generated reports)
            for (const [cid, incomingUser] of Object.entries(subscribers)) {
                if (!currentSubs[cid]) {
                    currentSubs[cid] = normalizeSubscription(incomingUser);
                    mergedSubs++;
                } else {
                    const liveUser = currentSubs[cid];
                    // Keep max points
                    liveUser.points = Math.max(Number(liveUser.points || 0), Number(incomingUser.points || 0));
                    liveUser.balance_points = liveUser.points;

                    // If owner, ensure 10000 and active
                    if (cid === OWNER_CHAT_ID) {
                        liveUser.points = Math.max(10000, liveUser.points);
                        liveUser.balance_points = liveUser.points;
                        liveUser.status = 'active';
                        liveUser.plan = 'unlimited';
                        liveUser.report_payment_source = 'unlimited';
                    }

                    // Merge reports array (union of IDs)
                    const liveRepIds = new Set(Array.isArray(liveUser.reports) ? liveUser.reports.map(r => typeof r === 'string' ? r : r.id) : []);
                    const incomingRepIds = Array.isArray(incomingUser.reports) ? incomingUser.reports.map(r => typeof r === 'string' ? r : r.id) : [];
                    for (const id of incomingRepIds) {
                        if (id) liveRepIds.add(id);
                    }
                    liveUser.reports = Array.from(liveRepIds);
                    liveUser.reportsCount = liveUser.reports.length;

                    // Keep active status if either was active
                    if (incomingUser.status === 'active') liveUser.status = 'active';
                    if (incomingUser.plan === 'unlimited') {
                        liveUser.plan = 'unlimited';
                        liveUser.report_payment_source = 'unlimited';
                    }

                    currentSubs[cid] = normalizeSubscription(liveUser);
                    mergedSubs++;
                }
            }

            // 3. Merge Transactions
            const existingTxIds = new Set(currentTxs.map(t => t.id));
            for (const tx of transactions) {
                if (tx && tx.id && !existingTxIds.has(tx.id)) {
                    currentTxs.push(tx);
                    existingTxIds.add(tx.id);
                    addedTxs++;
                }
            }

            // Write all atomically
            await atomicWriteJson(reportsFile, currentReports);
            await atomicWriteJson(subscriptionsFile, currentSubs);
            await atomicWriteJson(transactionsFile, currentTxs);

            const reportsCountAfter = Object.keys(currentReports).length;
            const subsCountAfter = Object.keys(currentSubs).length;
            const txsCountAfter = currentTxs.length;

            const crypto = require('crypto');
            const fsSync = require('fs');
            const raw = fsSync.readFileSync(reportsFile);
            const reportsHash = crypto.createHash('sha256').update(raw).digest('hex');

            return {
                reports: { before: reportsCountBefore, after: reportsCountAfter, added: addedReports },
                subscribers: { before: subsCountBefore, after: subsCountAfter, merged: mergedSubs },
                transactions: { before: txsCountBefore, after: txsCountAfter, added: addedTxs },
                reportsSha256: reportsHash,
                ownerStatus: {
                    chatId: OWNER_CHAT_ID,
                    points: currentSubs[OWNER_CHAT_ID]?.points,
                    status: currentSubs[OWNER_CHAT_ID]?.status,
                    plan: currentSubs[OWNER_CHAT_ID]?.plan
                }
            };
        });
    }

    async getMetadata() {
        return withDbLock(async () => {
            return readJsonSafe(metadataFile, { migration_version: 0 });
        });
    }
}

const dataManager = new DataManager();

module.exports = {
    dataManager,
    normalizeSubscription,
    getRemainingDays,
    withDbLock,
    OWNER_CHAT_ID,
    OWNER_USERNAME
};
