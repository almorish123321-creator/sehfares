const { MongoClient } = require('mongodb');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI;
const dbPath = path.resolve(__dirname, 'database.sqlite');

let client;
let db;
let usersCollection;
let reportsCollection;
let sqliteDb;
const useMongo = Boolean(MONGODB_URI);

const getDatabaseName = () => {
    if (!MONGODB_URI) return 'seha_sickleave_app';
    try {
        const parsed = new URL(MONGODB_URI);
        if (parsed.pathname && parsed.pathname !== '/') {
            return parsed.pathname.substring(1);
        }
    } catch (e) {
        // URL parsing failed, fallback to default name
    }
    return process.env.MONGODB_DB_NAME || 'seha_sickleave_app';
};

const getDaysRemaining = (expiresAt) => {
    if (!expiresAt) return 0;
    const now = new Date();
    const expires = new Date(expiresAt);
    const diffMs = expires - now;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
};

const normalizeUser = (user) => {
    if (!user) return null;
    const subscriptionDays = getDaysRemaining(user.subscriptionExpires);
    return {
        chatId: user.chatId,
        username: user.username,
        points: user.points || 0,
        subscriptionDays,
        premiumPlan: user.premiumPlan || null,
        subscriptionExpires: user.subscriptionExpires || null,
        lastRenewDate: user.lastRenewDate || null,
        createdAt: user.createdAt || null,
        updatedAt: user.updatedAt || null
    };
};

const runSql = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        sqliteDb.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

const getSql = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        sqliteDb.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const allSql = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        sqliteDb.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const ensureSqliteColumn = (table, column, columnDef) => {
    return new Promise((resolve, reject) => {
        sqliteDb.all(`PRAGMA table_info(${table})`, [], (err, rows) => {
            if (err) {
                reject(err);
                return;
            }

            const hasColumn = rows.some(row => row.name === column);
            if (hasColumn) {
                resolve();
                return;
            }

            sqliteDb.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${columnDef}`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });
};

const initSqlite = async () => {
    return new Promise((resolve, reject) => {
        sqliteDb = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                reject(err);
                return;
            }

            sqliteDb.serialize(() => {
                sqliteDb.run(`CREATE TABLE IF NOT EXISTS users (
                    chatId TEXT PRIMARY KEY,
                    username TEXT,
                    points INTEGER DEFAULT 0,
                    subscriptionDays INTEGER DEFAULT 0,
                    subscriptionExpires TEXT,
                    premiumPlan TEXT,
                    lastRenewDate TEXT,
                    createdAt TEXT,
                    updatedAt TEXT
                )`, (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    sqliteDb.run(`CREATE TABLE IF NOT EXISTS reports (
                        id TEXT PRIMARY KEY,
                        chatId TEXT,
                        type TEXT,
                        patientName TEXT,
                        nationalId TEXT,
                        issueDate TEXT,
                        data TEXT
                    )`, (err) => {
                        if (err) {
                            reject(err);
                            return;
                        }

                        ensureSqliteColumn('users', 'username', 'TEXT')
                            .then(() => ensureSqliteColumn('users', 'subscriptionExpires', 'TEXT'))
                            .then(() => ensureSqliteColumn('users', 'premiumPlan', 'TEXT'))
                            .then(() => ensureSqliteColumn('users', 'lastRenewDate', 'TEXT'))
                            .then(() => ensureSqliteColumn('users', 'createdAt', 'TEXT'))
                            .then(() => ensureSqliteColumn('users', 'updatedAt', 'TEXT'))
                            .then(() => resolve())
                            .catch((schemaErr) => reject(schemaErr));
                    });
                });
            });
        });
    });
};

const connect = async (uri) => {
    if (uri) {
        client = new MongoClient(uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        await client.connect();
        const dbName = getDatabaseName();
        db = client.db(dbName);
        usersCollection = db.collection('users');
        reportsCollection = db.collection('reports');

        await usersCollection.createIndex({ chatId: 1 }, { unique: true });
        await usersCollection.createIndex({ username: 1 });
        await reportsCollection.createIndex({ id: 1 }, { unique: true });

        console.log(`Connected to MongoDB Atlas database: ${dbName}`);
    } else {
        await initSqlite();
        console.log('MONGODB_URI غير موجود، يتم استخدام SQLite المحلية كبديل.');
    }
};

const getUser = async (chatId) => {
    return getOrCreateUser(chatId.toString(), null);
};

const getOrCreateUser = async (chatId, username) => {
    const chatIdStr = chatId.toString();

    if (useMongo) {
        const existing = await usersCollection.findOne({ chatId: chatIdStr });
        if (existing) {
            if (username && !existing.username) {
                await usersCollection.updateOne({ chatId: chatIdStr }, { $set: { username, updatedAt: new Date().toISOString() } });
                existing.username = username;
            }
            return normalizeUser(existing);
        }

        const now = new Date().toISOString();
        const newUser = {
            chatId: chatIdStr,
            username: username || null,
            points: 0,
            subscriptionDays: 0,
            subscriptionExpires: null,
            premiumPlan: null,
            lastRenewDate: null,
            createdAt: now,
            updatedAt: now
        };

        await usersCollection.insertOne(newUser);
        return normalizeUser(newUser);
    }

    const existing = await getSql('SELECT * FROM users WHERE chatId = ?', [chatIdStr]);
    if (existing) {
        if (username && !existing.username) {
            await runSql('UPDATE users SET username = ?, updatedAt = ? WHERE chatId = ?', [username, new Date().toISOString(), chatIdStr]);
            existing.username = username;
        }
        return normalizeUser(existing);
    }

    const now = new Date().toISOString();
    await runSql(
        'INSERT INTO users (chatId, username, points, subscriptionDays, subscriptionExpires, premiumPlan, lastRenewDate, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [chatIdStr, username || null, 0, 0, null, null, null, now, now]
    );
    const newUser = await getSql('SELECT * FROM users WHERE chatId = ?', [chatIdStr]);
    return normalizeUser(newUser);
};

const getUserByUsername = async (username) => {
    if (!username) return null;
    const cleaned = username.replace(/^@/, '');

    if (useMongo) {
        const user = await usersCollection.findOne({ username: cleaned });
        return normalizeUser(user);
    }

    const user = await getSql('SELECT * FROM users WHERE username = ?', [cleaned]);
    return normalizeUser(user);
};

const updateUserPackage = async (chatId, points = 0, subscriptionDays = 0) => {
    const user = await getOrCreateUser(chatId.toString(), null);
    const now = new Date();
    const updateFields = {
        points: (user.points || 0) + (points || 0),
        updatedAt: now.toISOString()
    };

    if (subscriptionDays > 0) {
        const currentExpires = user.subscriptionExpires ? new Date(user.subscriptionExpires) : now;
        const baseDate = currentExpires > now ? currentExpires : now;
        const newExpires = new Date(baseDate.getTime() + subscriptionDays * 24 * 60 * 60 * 1000);
        updateFields.subscriptionExpires = newExpires.toISOString();
        updateFields.subscriptionDays = getDaysRemaining(updateFields.subscriptionExpires);
        updateFields.lastRenewDate = now.toISOString();
    }

    if (useMongo) {
        await usersCollection.updateOne({ chatId: user.chatId }, { $set: updateFields });
        const updated = await usersCollection.findOne({ chatId: user.chatId });
        return normalizeUser(updated);
    }

    const setParts = [];
    const params = [];
    Object.entries(updateFields).forEach(([key, value]) => {
        setParts.push(`${key} = ?`);
        params.push(value);
    });
    params.push(user.chatId);
    await runSql(`UPDATE users SET ${setParts.join(', ')} WHERE chatId = ?`, params);
    const updated = await getSql('SELECT * FROM users WHERE chatId = ?', [user.chatId]);
    return normalizeUser(updated);
};

const updateUserSubscriptionByUsername = async (username, days, planName = null) => {
    const cleaned = username.replace(/^@/, '');

    if (useMongo) {
        const user = await usersCollection.findOne({ username: cleaned });
        if (!user) return null;

        const now = new Date();
        const currentExpires = user.subscriptionExpires ? new Date(user.subscriptionExpires) : now;
        const baseDate = currentExpires > now ? currentExpires : now;
        const newExpires = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

        const update = {
            subscriptionExpires: newExpires.toISOString(),
            subscriptionDays: getDaysRemaining(newExpires.toISOString()),
            premiumPlan: planName || user.premiumPlan || 'premium',
            lastRenewDate: now.toISOString(),
            updatedAt: now.toISOString()
        };

        await usersCollection.updateOne({ username: cleaned }, { $set: update });
        const updated = await usersCollection.findOne({ username: cleaned });
        return normalizeUser(updated);
    }

    const user = await getSql('SELECT * FROM users WHERE username = ?', [cleaned]);
    if (!user) return null;

    const now = new Date();
    const currentExpires = user.subscriptionExpires ? new Date(user.subscriptionExpires) : now;
    const baseDate = currentExpires > now ? currentExpires : now;
    const newExpires = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
    const subscriptionExpires = newExpires.toISOString();
    const subscriptionDays = getDaysRemaining(subscriptionExpires);

    await runSql(
        'UPDATE users SET subscriptionExpires = ?, subscriptionDays = ?, premiumPlan = ?, lastRenewDate = ?, updatedAt = ? WHERE username = ?',
        [subscriptionExpires, subscriptionDays, planName || user.premiumPlan || 'premium', now.toISOString(), now.toISOString(), cleaned]
    );

    const updated = await getSql('SELECT * FROM users WHERE username = ?', [cleaned]);
    return normalizeUser(updated);
};

const saveReport = async (reportData, chatId) => {
    if (useMongo) {
        const report = {
            id: reportData.id,
            chatId: chatId.toString(),
            type: reportData.type,
            patientName: reportData.patientNameAr || reportData.patientNameEn || '',
            nationalId: reportData.nationalId,
            issueDate: reportData.issueDate,
            data: reportData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        await reportsCollection.insertOne(report);
        return report.id;
    }

    const report = {
        id: reportData.id,
        chatId: chatId.toString(),
        type: reportData.type,
        patientName: reportData.patientNameAr || reportData.patientNameEn || '',
        nationalId: reportData.nationalId,
        issueDate: reportData.issueDate,
        data: JSON.stringify(reportData)
    };
    await runSql(
        'INSERT INTO reports (id, chatId, type, patientName, nationalId, issueDate, data) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [report.id, report.chatId, report.type, report.patientName, report.nationalId, report.issueDate, report.data]
    );
    return report.id;
};

const getUserReports = async (chatId) => {
    if (useMongo) {
        const rows = await reportsCollection.find({ chatId: chatId.toString() }).sort({ issueDate: -1 }).toArray();
        return rows.map(r => r.data);
    }

    const rows = await allSql('SELECT data FROM reports WHERE chatId = ? ORDER BY issueDate DESC', [chatId.toString()]);
    return rows.map(r => JSON.parse(r.data));
};

const deleteReport = async (id, chatId) => {
    if (useMongo) {
        const result = await reportsCollection.deleteOne({ id, chatId: chatId.toString() });
        return result.deletedCount;
    }
    const result = await runSql('DELETE FROM reports WHERE id = ? AND chatId = ?', [id, chatId.toString()]);
    return result.changes;
};

const getReportById = async (id, nationalId) => {
    if (useMongo) {
        const report = await reportsCollection.findOne({ id, nationalId });
        return report ? report.data : null;
    }
    const report = await getSql('SELECT data FROM reports WHERE id = ? AND nationalId = ?', [id, nationalId]);
    return report ? JSON.parse(report.data) : null;
};

module.exports = {
    connect,
    getUser,
    getOrCreateUser,
    getUserByUsername,
    updateUser: updateUserPackage,
    updateUserPackage,
    updateUserSubscriptionByUsername,
    saveReport,
    getUserReports,
    deleteReport,
    getReportById
};
