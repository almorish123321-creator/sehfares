const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
process.env.NTBA_FIX_319 = 1;
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs').promises;
const shortIoService = require('./shortIoService');

const crypto = require('crypto');
let currentAdminToken = null;

// -------------------------------------------------------------
// Configuration
//
// SECURITY: no secrets are hardcoded in this file.
// Every credential is read from the environment. On Render set these under
// your service -> Environment. For local runs use a .env file (never commit it).
// See .env.example for the complete list of supported variables.
// -------------------------------------------------------------
const REQUIRED_ENV = ['TELEGRAM_BOT_TOKEN', 'ADMIN_CHAT_ID', 'ADMIN_MASTER_TOKEN'];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k] || !String(process.env[k]).trim());
if (missingEnv.length > 0) {
    console.error('\n\u274c Missing required environment variables: ' + missingEnv.join(', '));
    console.error('   Set them in Render -> your service -> Environment, or in a local .env file.');
    console.error('   See .env.example for the full list.\n');
    process.exit(1);
}

const TOKEN = String(process.env.TELEGRAM_BOT_TOKEN).trim();
const PORT = process.env.PORT || 3000;
const WEB_APP_URL = process.env.RENDER_EXTERNAL_URL || process.env.WEB_APP_URL || ('http://localhost:' + PORT);
const WEB_APP_URL_CACHED = WEB_APP_URL + '?v=53';
// Target URL for PDF QR code & clickable link
const INQUIRY_URL = process.env.INQUIRY_URL || process.env.SHORT_URL || 'https://seha-sa.s.gy/inquiries';
const ADMIN_MASTER_TOKEN = String(process.env.ADMIN_MASTER_TOKEN).trim();
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || '').trim();
const ADMIN_CHAT_ID = String(process.env.ADMIN_CHAT_ID).trim();
const OWNER_CONTACT = ADMIN_USERNAME ? `https://t.me/${ADMIN_USERNAME}` : '';
const CHANNEL_ID = (process.env.TELEGRAM_CHANNEL_ID || '').trim();

// Telegram usernames allowed to use admin bot commands.
// Configure as a comma separated list, e.g. ADMIN_USERNAMES=first_admin,second_admin
const ADMIN_USERNAMES = [ADMIN_USERNAME, ...(process.env.ADMIN_USERNAMES || '').split(',')]
    .map((u) => String(u || '').trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
const isAdminUsername = (u) => Boolean(u) && ADMIN_USERNAMES.includes(String(u).toLowerCase().replace(/^@/, ''));

// DataManager: Persistent, Atomic, and Real-Time Storage
const { dataManager, normalizeSubscription, getRemainingDays, withDbLock, OWNER_CHAT_ID, OWNER_USERNAME } = require('./dataManager');

// Transaction logging helper (delegates to DataManager)
const logTransaction = async (dataOrEntry, entryDetails = null) => {
    const entry = entryDetails || dataOrEntry;
    return dataManager.logTransaction(entry);
};

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// SECURITY: Strict protection for sensitive JSON databases & persistent storage
app.use((req, res, next) => {
    const p = req.path.toLowerCase();
    if (p === '/subscriptions.json' || p.startsWith('/data') || p.startsWith('/.git') || p.endsWith('.sqlite')) {
        return res.status(403).json({ success: false, error: 'Access Denied: Private System File' });
    }
    next();
});

app.use(express.static(__dirname));
app.use('/assets', express.static(path.join(__dirname, 'الشعارات')));
app.use('/logos', express.static(path.join(__dirname, 'الشعارات')));

// Backward-compatibility storage adapters
const loadLocalSubscriptions = async () => {
    const subs = await dataManager.getAllSubscribers();
    const subMap = {};
    for (const s of subs) {
        subMap[s.chatId] = s;
        subMap[s.chatId].reports = await dataManager.getUserReports(s.chatId);
    }
    const txs = await dataManager.getTransactions();
    return { subscriptions: subMap, transactions: txs };
};

const saveLocalSubscriptions = async (data) => {
    if (data && data.subscriptions) {
        for (const [cid, u] of Object.entries(data.subscriptions)) {
            await dataManager.saveSubscriber(cid, u);
        }
    }
};

const bootstrapOwnerAccount = async () => {
    return dataManager.bootstrapOwnerAccount();
};

const findSubscription = async (chatId, username, referrerId = null) => {
    return dataManager.getSubscriber(chatId, username, referrerId);
};


// Add or renew subscription for Username
const addSubscriptionByUsername = async (username, days) => {
    const data = await loadLocalSubscriptions();
    const cleaned = username.replace(/^@/, '').toLowerCase();
    
    let foundChatId = null;
    let userSub = null;
    
    for (const [cid, sub] of Object.entries(data.subscriptions)) {
        if (sub.username && sub.username.toLowerCase() === cleaned) {
            userSub = sub;
            foundChatId = cid;
            break;
        }
    }
    
    const now = new Date();
    let baseDate = now;
    
    if (userSub) {
        userSub = normalizeSubscription(userSub);
        if (userSub.subscriptionExpires) {
            const currentExpires = new Date(userSub.subscriptionExpires);
            if (currentExpires > now) {
                baseDate = currentExpires;
            }
        }
    } else {
        userSub = {
            points: 0,
            subscriptionDays: 0,
            subscriptionExpires: null,
            username: cleaned,
            reports: [],
            referredBy: null,
            referralsCount: 0,
            referralPoints: 0,
            updatedAt: now.toISOString()
        };
        foundChatId = `pending_${cleaned}`;
    }
    
    const expires = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
    userSub.subscription_start_at = userSub.subscription_start_at || now.toISOString();
    userSub.subscription_end_at = expires.toISOString();
    userSub.subscriptionExpires = expires.toISOString();
    userSub.subscription_end_date = expires.toISOString();
    userSub.subscriptionDays = getDaysRemaining(userSub.subscription_end_at);
    userSub.status = 'active';
    userSub.plan = 'unlimited';
    userSub.report_payment_source = 'unlimited';
    userSub.updatedAt = now.toISOString();
    
    // Referral rewards!
    if (userSub.referredBy && !userSub.referralAwarded) {
        const referrerId = userSub.referredBy.toString();
        if (data.subscriptions[referrerId]) {
            // Determine reward points based on subscription days
            let rewardPoints = 0;
            if (days === 30) rewardPoints = 50;
            else if (days === 90) rewardPoints = 150;
            else if (days === 180) rewardPoints = 300;
            else if (days >= 365) rewardPoints = 600;
            
            if (rewardPoints > 0) {
                data.subscriptions[referrerId].referralPoints = (data.subscriptions[referrerId].referralPoints || 0) + rewardPoints;
                data.subscriptions[referrerId].points = (data.subscriptions[referrerId].points || 0) + rewardPoints;
                data.subscriptions[referrerId].updatedAt = now.toISOString();
                userSub.referralAwarded = true; // prevent multiple awards from the same user's first activation
                
                // Notify referrer
                try {
                    await bot.sendMessage(referrerId, `🎁 لقد حصلت على ${rewardPoints} نقطة مجانية كمكافأة لأن المستخدم @${username} الذي قمت بدعوته قام بالاشتراك!`);
                } catch (e) {
                    console.warn('Could not notify referrer:', e.message);
                }
            }
        }
    }
    
    data.subscriptions[foundChatId] = userSub;
    await saveLocalSubscriptions(data);
    
    return { chatId: foundChatId, ...userSub };
};

// Initialize Telegram Bot
// Consider the app to be in production when a proper WEB_APP_URL is provided
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

const isProduction = Boolean(WEB_APP_URL) && WEB_APP_URL.startsWith('https://') && !WEB_APP_URL.includes('localhost');
const bot = new TelegramBot(TOKEN, { 
    polling: !isProduction,
    request: {
        timeout: 30000 // 30 seconds to prevent ConnectTimeoutError crashes
    }
});

bot.on('polling_error', (error) => {
    console.error('Telegram polling error:', error.message);
});

bot.on('webhook_error', (error) => {
    console.error('Telegram webhook error:', error.message);
});

// Helper: Send User Status Message
const sendMyStatusMessage = async (chatId, username) => {
    const user = await findSubscription(chatId, username);
    const daysLeft = user.subscriptionDays || 0;
    const statusText = daysLeft > 0 ? `فعال (${daysLeft} يوم متبقي)` : 'غير فعال (0 يوم)';
    const subStatusIcon = daysLeft > 0 ? '✅' : '❌';

    const statusMsg = `📊 حالة حسابك في منصة صحة:

${subStatusIcon} حالة الاشتراك: ${statusText}
⏳ الأيام المتبقية: ${daysLeft} يوم

🌑 رصيد النقاط: ${user.points || 0} نقطة
• تكلفة إنشاء التقرير: 5 نقاط

💡 يمكنك استخدام النقاط لإنشاء التقارير دون الحاجة لاشتراك شهري، أو الاشتراك بالباقة اللامحدودة!`;

    await bot.sendMessage(chatId, statusMsg);
};

// Start Command Handler
const handleStartCommand = async (msg) => {
    const chatId = msg.chat.id.toString();
    const username = msg.from?.username;
    const displayName = msg.from?.first_name || (username ? `${username}` : 'مستخدم');

    const text = msg.text || '';
    const refMatch = text.match(/\/start\s+ref_(\d+)/i);
    let referrerId = null;
    if (refMatch) {
        referrerId = refMatch[1];
    }

    const user = await findSubscription(chatId, username || displayName, referrerId);

    // Force update Chat Menu Button (Open button) to Render URL on every /start
    configureChatMenuButton(chatId).catch(err => console.warn('Menu button configure notice:', err.message));

    // Message 1: Quick Access Reply Keyboard Configuration with direct WebApp button
    await bot.sendMessage(chatId, `⚡ تم تفعيل قائمة الوصول السريع أسفل الشاشة!`, {
        reply_markup: {
            keyboard: [
                [{ text: '🛒 متجر الباقات' }, { text: '🔗 كسب نقاط (الإحالات)' }],
                [{ text: '📊 حالة حسابي' }]
            ],
            resize_keyboard: true
        }
    });

    // Message 2: Dynamic status welcome message with full inline keyboard & direct links
    const daysLeft = user.subscriptionDays || 0;
    const statusIcon = daysLeft > 0 ? '✅' : '❌';
    const statusText = daysLeft > 0 ? `فعال - متبقي ${daysLeft} يوم` : `غير فعال - متبقي 0 يوم`;
    
    let adminNotice = '';
    if (user.isNewlyMigrated) {
        adminNotice = '🎉 <b>تم تفعيل اشتراكك يدوياً من قبل الإدارة!</b> 🥳\n\n';
        // Clean up flag so it doesn't stay in memory forever
        delete user.isNewlyMigrated;
        // Optionally save to remove the flag from disk if it got saved
        const data = await loadLocalSubscriptions();
        if (data.subscriptions[chatId]) {
            delete data.subscriptions[chatId].isNewlyMigrated;
            await saveLocalSubscriptions(data);
        }
    }
    
    const welcomeText = `${adminNotice}👋 أهلاً بعودتك ${displayName}!

${statusIcon} اشتراكك ${statusText}
🌑 رصيدك الحالي من النقاط: ${user.points || 0} نقطة
• تكلفة التقرير الواحد: 5 نقاط.

💡 يمكنك الاشتراك بالباقة الشهرية لإنشاء غير محدود، أو شحن النقاط للشراء بالتقرير!

اضغط على الأزرار أدناه لفتح التطبيق أو التصفح ⚡`;

    await bot.sendMessage(chatId, welcomeText, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Open', web_app: { url: WEB_APP_URL_CACHED } }],
                [{ text: 'دعوة صديق 🎁', callback_data: 'referrals' }],
                [{ text: 'باقات الاشتراك 💎', callback_data: 'packages' }],
                [{ text: 'حالة حسابي 📊', callback_data: 'mystatus' }]
            ]
        }
    });
};

bot.onText(/^\/start(\/verify)?(@\w+)?(\s.*)?$/i, handleStartCommand);

// /help command
bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id.toString();
    await bot.sendMessage(chatId, `مرحباً!\nاستخدم /start للبدء.\nإذا كنت مسؤولاً، يمكنك استخدام /addsub @username <days> لتفعيل الاشتراك.`);
});

// /buy command
bot.onText(/\/buy/, async (msg) => {
    const chatId = msg.chat.id.toString();
    await sendPackagesMessage(chatId);
});

// Command /myid to display numeric Chat ID
bot.onText(/\/myid/, async (msg) => {
    const chatId = msg.chat.id.toString();
    const isOwner = (chatId === ADMIN_CHAT_ID);
    const ownerNote = isOwner ? '\n\n👑 أنت المالك/المشرف المعتمد للنظام.' : '';
    await bot.sendMessage(chatId, `🆔 الـ Numeric Chat ID الخاص بك هو:\n<code>${chatId}</code>${ownerNote}`, { parse_mode: 'HTML' });
});

// /admin command
bot.onText(/\/admin/, async (msg) => {
    const chatId = msg.chat.id.toString();
    const username = msg.from?.username;
    const isAuthorized = (chatId === ADMIN_CHAT_ID || isAdminUsername(username));
    if (!isAuthorized) {
        await bot.sendMessage(chatId, 'عذراً، هذه القائمة للمسؤول فقط.');
        return;
    }
    
    currentAdminToken = crypto.randomBytes(16).toString('hex');
    const adminUrl = `${WEB_APP_URL}/index.html?screen=admin&token=${currentAdminToken}`;
    const inquiryUrl = `${WEB_APP_URL}/inquiry`;
    const inlineKeyboard = [
        [{ text: '⚙️ لوحة الإدارة (Admin Dashboard)', web_app: { url: adminUrl } }],
        [{ text: '🔍 الاستعلام عن تقرير (Inquiry)', web_app: { url: inquiryUrl } }]
    ];
    
    await bot.sendMessage(chatId, 'مرحباً بك يا مدير النظام! اضغط على الزر أدناه لفتح لوحة تحكم المشتركين:', {
        reply_markup: {
            inline_keyboard: inlineKeyboard
        }
    });
});

// Admin commands to add subscriptions
bot.onText(/\/addsub\s+@?(\w+)\s+(\d+)/i, async (msg, match) => {
    const chatId = msg.chat.id.toString();
    const username = msg.from?.username;
    
    const allowedAdmins = ADMIN_USERNAMES;
    if (!username || !allowedAdmins.includes(username.toLowerCase())) {
        await bot.sendMessage(chatId, 'ليس لديك صلاحية المسؤول لتنفيذ هذا الأمر.');
        return;
    }

    const targetUsername = match[1];
    const days = parseInt(match[2], 10);
    if (!targetUsername || isNaN(days) || days <= 0) {
        await bot.sendMessage(chatId, 'يرجى استخدام الصيغة الصحيحة: /addsub @username 30');
        return;
    }

    const result = await addSubscriptionByUsername(targetUsername, days);
    await bot.sendMessage(chatId, `✅ تم تفعيل الاشتراك بنجاح للمستخدم @${targetUsername} لمدة ${days} يوم.`);
    
    if (result.chatId && !result.chatId.startsWith('pending_')) {
        try {
            await bot.sendMessage(result.chatId, `🎉 تم تفعيل اشتراكك لامحدود لمدة ${days} يوم من قبل الإدارة!\nيمكنك الآن استخراج تقارير بلا حدود طوال فترة الاشتراك.\nافتح التطبيق عبر قائمة البوت.`);
        } catch (e) {
            console.warn('Could not send notification to user:', e.message);
        }
    }
});


// Admin command to add points
bot.onText(/\/addpoints\s+@?(\w+)\s+(\d+)/i, async (msg, match) => {
    const chatId = msg.chat.id.toString();
    const username = msg.from?.username;
    
    const allowedAdmins = ADMIN_USERNAMES;
    if (!username || !allowedAdmins.includes(username.toLowerCase())) {
        await bot.sendMessage(chatId, 'ليس لديك صلاحية المسؤول لتنفيذ هذا الأمر.');
        return;
    }

    const targetUsername = match[1];
    const pointsToAdd = parseInt(match[2], 10);
    if (!targetUsername || isNaN(pointsToAdd) || pointsToAdd <= 0) {
        await bot.sendMessage(chatId, 'يرجى استخدام الصيغة الصحيحة: /addpoints @username 50');
        return;
    }

    try {
        const data = await loadLocalSubscriptions();
        const cleaned = targetUsername.toLowerCase();
        
        let foundChatId = null;
        for (const [cid, sub] of Object.entries(data.subscriptions)) {
            if (sub.username && sub.username.toLowerCase() === cleaned) {
                foundChatId = cid;
                break;
            }
        }
        
        if (!foundChatId) {
            foundChatId = 'pending_' + cleaned;
            data.subscriptions[foundChatId] = {
                points: 0,
                subscriptionDays: 0,
                subscriptionExpires: null,
                username: cleaned,
                reports: [],
                updatedAt: new Date().toISOString()
            };
        }
        
        const user = data.subscriptions[foundChatId];
        user.points = (user.points || 0) + pointsToAdd;
        user.updatedAt = new Date().toISOString();
        
        await saveLocalSubscriptions(data);
        
        await bot.sendMessage(chatId, `✅ تم إضافة ${pointsToAdd} نقطة بنجاح للمستخدم @${targetUsername}. الرصيد الجديد: ${user.points} نقطة.`);
        
        if (!foundChatId.startsWith('pending_')) {
            try {
                await bot.sendMessage(foundChatId, `🎉 تم شحن رصيدك بـ ${pointsToAdd} نقطة من قبل الإدارة! 
رصيدك الحالي أصبح ${user.points} نقطة.
يمكنك استخراج التقارير الآن.`);
            } catch (e) {
                console.warn('Could not notify user of added points:', e.message);
            }
        }
    } catch(err) {
        await bot.sendMessage(chatId, '❌ حدث خطأ أثناء إضافة النقاط: ' + err.message);
    }
});


// /mysub command
bot.onText(/\/mysub/, async (msg) => {
    const chatId = msg.chat.id.toString();
    const username = msg.from?.username || msg.from?.first_name || 'مستخدم';
    const user = await findSubscription(chatId, username);
    const status = user.subscriptionDays > 0 ? `اشتراكك نشط، متبقي ${user.subscriptionDays} يوم.` : 'اشتراكك غير نشط أو انتهى. الرجاء التواصل لتفعيل الاشتراك.';
    await bot.sendMessage(chatId, status);
});

// Bottom Keyboard & Message Handlers
bot.on('message', async (msg) => {
    if (!msg.text) return;
    if (/^\/start/i.test(msg.text)) return; // Already handled
    if (/^\/mysub/i.test(msg.text)) return; // Already handled
    if (/^\/admin/i.test(msg.text)) return; // Already handled
    if (/^\/addsub/i.test(msg.text)) return; // Already handled
    if (/^\/help/i.test(msg.text)) return; // Already handled
    if (/^\/buy/i.test(msg.text)) return; // Already handled
    
    const chatId = msg.chat.id.toString();
    const username = msg.from?.username || msg.from?.first_name || 'مستخدم';
    
    if (msg.text === '📊 حالة حسابي') {
        await sendMyStatusMessage(chatId, username);
        return;
    }
    
    if (msg.text === '🔗 كسب نقاط (الإحالات)') {
        await sendReferralMessage(chatId, username);
        return;
    }
    
    if (msg.text === '🛒 متجر الباقات') {
        await sendPackagesMessage(chatId);
        return;
    }
    
    console.log(`Telegram bot message received: "${msg.text}" from ${msg.from?.username || msg.from?.first_name}`);
});

bot.on('photo', async (msg) => {
    const chatId = msg.chat.id.toString();
    const photo = msg.photo[msg.photo.length - 1]; // get highest resolution
    const fileId = photo.file_id;
    
    const inlineKeyboard = {
        inline_keyboard: [
            [{ text: "تعيين كشعار وزارة الصحة (MoH)", callback_data: `setlogo_moh_${fileId}` }],
            [{ text: "تعيين كشعار المستشفى", callback_data: `setlogo_hosp_${fileId}` }],
            [{ text: "إلغاء", callback_data: "cancel_logo" }]
        ]
    };
    
    await bot.sendMessage(chatId, "ماذا تريد أن تفعل بهذه الصورة؟", { reply_markup: inlineKeyboard });
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id.toString();
    const data = query.data;
    
    if (data === "cancel_logo") {
        await bot.deleteMessage(chatId, query.message.message_id);
        return;
    }
    
    if (data.startsWith('setlogo_')) {
        const parts = data.split('_');
        const type = parts[1]; // moh or hosp
        const fileId = parts.slice(2).join('_');
        
        try {
            const fileLink = await bot.getFileLink(fileId);
            
            const subs = await loadLocalSubscriptions();
            if (!subs.subscriptions[chatId]) {
                subs.subscriptions[chatId] = { points: 0, subscriptionDays: 0, reports: [] };
            }
            
            if (type === 'moh') {
                subs.subscriptions[chatId].mohLogo = fileLink;
                await bot.answerCallbackQuery(query.id, { text: "تم تعيين شعار وزارة الصحة بنجاح ✅" });
            } else if (type === 'hosp') {
                subs.subscriptions[chatId].hospitalLogo = fileLink;
                await bot.answerCallbackQuery(query.id, { text: "تم تعيين شعار المستشفى بنجاح ✅" });
            }
            
            await saveLocalSubscriptions(subs);
            await bot.deleteMessage(chatId, query.message.message_id);
            await bot.sendMessage(chatId, "تم حفظ الشعار في حسابك بنجاح! سيتم استخدامه في التقارير القادمة. ✅\nيرجى إعادة فتح التطبيق لتحديث الشعارات.");
        } catch (e) {
            console.error(e);
            await bot.answerCallbackQuery(query.id, { text: "حدث خطأ أثناء حفظ الشعار ❌" });
        }
    }
});


// Admin command to cancel subscription
bot.onText(/\/cancelsub\s+@?(\w+)/i, async (msg, match) => {
    const chatId = msg.chat.id.toString();
    const username = msg.from?.username;
    
    const allowedAdmins = ADMIN_USERNAMES;
    if (!username || !allowedAdmins.includes(username.toLowerCase())) return;

    const targetUsername = match[1].toLowerCase();
    try {
        const data = await loadLocalSubscriptions();
        let foundChatId = null;
        for (const [cid, sub] of Object.entries(data.subscriptions)) {
            if (sub.username && sub.username.toLowerCase() === targetUsername) {
                foundChatId = cid;
                break;
            }
        }
        
        if (!foundChatId) {
            await bot.sendMessage(chatId, '❌ المستخدم غير موجود في قاعدة البيانات.');
            return;
        }
        
        const user = data.subscriptions[foundChatId];
        user.subscriptionDays = 0;
        user.subscriptionExpires = null;
        user.updatedAt = new Date().toISOString();
        await saveLocalSubscriptions(data);
        
        await bot.sendMessage(chatId, `✅ تم إلغاء الاشتراك اللامحدود للمستخدم @${targetUsername} بنجاح.`);
        if (!foundChatId.startsWith('pending_')) {
            try {
                await bot.sendMessage(foundChatId, `⚠️ تم إلغاء اشتراكك اللامحدود من قبل الإدارة. يرجى تجديد الاشتراك للتمكن من استخراج التقارير.`);
            } catch(e){}
        }
    } catch(err) {
        await bot.sendMessage(chatId, '❌ خطأ: ' + err.message);
    }
});

// Admin command to remove points
bot.onText(/\/removepoints\s+@?(\w+)/i, async (msg, match) => {
    const chatId = msg.chat.id.toString();
    const username = msg.from?.username;
    
    const allowedAdmins = ADMIN_USERNAMES;
    if (!username || !allowedAdmins.includes(username.toLowerCase())) return;

    const targetUsername = match[1].toLowerCase();
    try {
        const data = await loadLocalSubscriptions();
        let foundChatId = null;
        for (const [cid, sub] of Object.entries(data.subscriptions)) {
            if (sub.username && sub.username.toLowerCase() === targetUsername) {
                foundChatId = cid;
                break;
            }
        }
        
        if (!foundChatId) {
            await bot.sendMessage(chatId, '❌ المستخدم غير موجود في قاعدة البيانات.');
            return;
        }
        
        const user = data.subscriptions[foundChatId];
        user.points = 0;
        user.updatedAt = new Date().toISOString();
        await saveLocalSubscriptions(data);
        
        await bot.sendMessage(chatId, `✅ تم تصفير نقاط المستخدم @${targetUsername} بنجاح.`);
        if (!foundChatId.startsWith('pending_')) {
            try {
                await bot.sendMessage(foundChatId, `⚠️ تم سحب نقاطك من قبل الإدارة. يرجى الشحن للتمكن من استخراج التقارير.`);
            } catch(e){}
        }
    } catch(err) {
        await bot.sendMessage(chatId, '❌ خطأ: ' + err.message);
    }
});

// Admin command to list subscribers
bot.onText(/\/subscribers/i, async (msg) => {
    const chatId = msg.chat.id.toString();
    const username = msg.from?.username;
    
    const allowedAdmins = ADMIN_USERNAMES;
    if (!username || !allowedAdmins.includes(username.toLowerCase())) return;

    try {
        const data = await loadLocalSubscriptions();
        let message = '📋 **قائمة المشتركين الفعالين:**\n\n';
        let count = 0;
        
        for (const [cid, sub] of Object.entries(data.subscriptions)) {
            const norm = normalizeSubscription(sub);
            if (norm.subscriptionDays > 0 || (norm.points && norm.points > 0)) {
                count++;
                message += `👤 @${norm.username || 'مجهول'} (${cid})\n`;
                if (norm.subscriptionDays > 0) message += ` └ 🗓 اشتراك: ${norm.subscriptionDays} يوم\n`;
                if (norm.points > 0) message += ` └ 🪙 نقاط: ${norm.points} نقطة\n`;
                message += '\n';
            }
        }
        
        if (count === 0) {
            message += 'لا يوجد مشتركين فعالين حالياً.';
        } else {
            message += `إجمالي الفعالين: ${count}`;
        }
        
        // If message is too long, split it or just send it (Telegram limit is 4096)
        if (message.length > 4000) {
            message = message.substring(0, 4000) + '... (مقطوع)';
        }
        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch(err) {
        await bot.sendMessage(chatId, '❌ خطأ: ' + err.message);
    }
});


// Helper: Send Referral Statistics & Link
const sendReferralMessage = async (chatId, username) => {
    const user = await findSubscription(chatId, username);
    const botInfo = await bot.getMe();
    const botUsername = botInfo.username || process.env.BOT_USERNAME || '';
    const referralLink = botUsername ? `https://t.me/${botUsername}?start=ref_${chatId}` : `${WEB_APP_URL}?start=ref_${chatId}`;

    // Calculate actual referrals
    const data = await loadLocalSubscriptions();
    let referralsCount = 0;
    for (const sub of Object.values(data.subscriptions)) {
        if (sub.referredBy === chatId) {
            referralsCount++;
        }
    }

    const referralMsg = `🔗 نظام الإحالات والمكافآت (Referral System)

شارك رابط إحالتك الفريد مع أصدقائك، واربح نقاطاً إضافية لإنشاء التقارير في كل مرة يقومون فيها بالاشتراك!

🔗 رابط إحالتك الخاص بك:
${referralLink}

📊 إحصائيات إحالتك:
• عدد الأشخاص المسجلين من خلالك: ${referralsCount} شخص
• رصيدك الحالي من نقاط الإحالة: ${user.referralPoints || 0} نقطة

🎁 كيف تربح النقاط؟
عندما يقوم شخص قمت بإحالته بأي عملية شراء، ستحصل أنت على المكافآت التالية تلقائياً في كل مرة يشتري فيها:
• خطة Month 1 (100.0 ريال) -> تربح 50 نقطة (10 تقارير مجاناً)
• خطة Months 3 (300.0 ريال) -> تربح 150 نقطة (30 تقرير مجاناً)
• خطة Months 6 (500.0 ريال) -> تربح 300 نقطة (60 تقرير مجاناً)
• خطة Year 1 (800.0 ريال) -> تربح 600 نقطة (120 تقرير مجاناً)
• خطة حزمة النقاط الأساسية (30 نقطة) (20.0 ريال) -> تربح 10 نقاط (2 تقرير مجاناً)
• خطة حزمة النقاط الموصى بها (100 نقطة) (50.0 ريال) -> تربح 25 نقطة (5 تقارير مجاناً)
• خطة حزمة النقاط المتقدمة (200 نقطة) (80.0 ريال) -> تربح 50 نقطة (10 تقارير مجاناً)

💡 ملاحظة: لا توجد صلاحية لانتهاء النقاط، ويمكنك استخدامها في أي وقت!`;

    await bot.sendMessage(chatId, referralMsg, {
        reply_markup: {
            inline_keyboard: [[
                { text: 'Open', web_app: { url: WEB_APP_URL_CACHED } }
            ]]
        }
    });
};

// Helper: Send Packages Store Menu
const sendPackagesMessage = async (chatId) => {
    const packagesMsg = `🛒 متجر الباقات والاشتراكات لإنشاء التقارير

شحن وتفعيل الباقات يتم يدوياً عبر الدعم الفني بشكل سهل وآمن وسريع.

⭐ حزم النقاط (بدون صلاحية انتهاء):
• حزمة النقاط الأساسية (30 نقطة): 30 نقطة -> السعر: 20.0 ريال سعودي
• حزمة النقاط الموصى بها (100 نقطة): 100 نقطة -> السعر: 50.0 ريال سعودي
• حزمة النقاط المتقدمة (200 نقطة): 200 نقطة -> السعر: 80.0 ريال سعودي

📅 الاشتراكات اللامحدودة (غير محدودة التقارير):
• خطة 30 يوم -> السعر: 100.0 ريال سعودي
• خطة 90 يوم -> السعر: 300.0 ريال سعودي
• خطة 180 يوم -> السعر: 500.0 ريال سعودي
• خطة 365 يوم -> السعر: 800.0 ريال سعودي

👇 اضغط على الباقة التي تريدها للتواصل وتفعيلها فوراً:`;

    const ownerLink = OWNER_CONTACT;
    const inlineKeyboard = [
        [{ text: '📅 خطة 30 يوم (100.0 ريال) ↗️', url: `${ownerLink}?text=${encodeURIComponent('مرحباً، أود تفعيل باقة: خطة 30 يوم (100 ريال) لحسابي.')}` }],
        [{ text: '📅 خطة 90 يوم (300.0 ريال) ↗️', url: `${ownerLink}?text=${encodeURIComponent('مرحباً، أود تفعيل باقة: خطة 90 يوم (300 ريال) لحسابي.')}` }],
        [{ text: '📅 خطة 180 يوم (500.0 ريال) ↗️', url: `${ownerLink}?text=${encodeURIComponent('مرحباً، أود تفعيل باقة: خطة 180 يوم (500 ريال) لحسابي.')}` }],
        [{ text: '📅 خطة 365 يوم (800.0 ريال) ↗️', url: `${ownerLink}?text=${encodeURIComponent('مرحباً، أود تفعيل باقة: خطة 365 يوم (800 ريال) لحسابي.')}` }],
        [{ text: '⭐ حزمة النقاط الأساسية (30 نقطة) (20.0 ريال) ↗️', url: `${ownerLink}?text=${encodeURIComponent('مرحباً، أود تفعيل باقة: حزمة النقاط الأساسية 30 نقطة (20 ريال) لحسابي.')}` }],
        [{ text: '⭐ حزمة النقاط الموصى بها (100 نقطة) (50.0 ريال) ↗️', url: `${ownerLink}?text=${encodeURIComponent('مرحباً، أود تفعيل باقة: حزمة النقاط الموصى بها 100 نقطة (50 ريال) لحسابي.')}` }],
        [{ text: '⭐ حزمة النقاط المتقدمة (200 نقطة) (80.0 ريال) ↗️', url: `${ownerLink}?text=${encodeURIComponent('مرحباً، أود تفعيل باقة: حزمة النقاط المتقدمة 200 نقطة (80 ريال) لحسابي.')}` }]
    ];

    await bot.sendMessage(chatId, packagesMsg, {
        reply_markup: {
            inline_keyboard: inlineKeyboard
        }
    });
};

// Callback Query Handler for Inline Buttons
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id.toString();
    const username = query.from?.username || query.from?.first_name || 'مستخدم';
    
    if (query.data === 'referrals') {
        await sendReferralMessage(chatId, username);
        await bot.answerCallbackQuery(query.id);
    } else if (query.data === 'packages') {
        await sendPackagesMessage(chatId);
        await bot.answerCallbackQuery(query.id);
    } else if (query.data === 'mystatus') {
        await sendMyStatusMessage(chatId, username);
        await bot.answerCallbackQuery(query.id);
    }
});

// API Endpoints

// Health Check Endpoint (Render & Monitoring)
app.get(['/health', '/api/health'], (req, res) => {
    res.status(200).json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        service: 'seha-sickleave-app',
        live: true
    });
});

// Admin: Add user securely
app.post('/api/admin/add-user', express.json(), async (req, res) => {
    try {
        const { token, targetUsername, points, days } = req.body;
        if (!currentAdminToken || token !== currentAdminToken) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        
        const data = await loadLocalSubscriptions();
        const cleaned = targetUsername.replace(/^@/, '').toLowerCase();
        
        // Find if user already exists
        let foundChatId = null;
        for (const [cid, sub] of Object.entries(data.subscriptions)) {
            if (sub.username && sub.username.toLowerCase() === cleaned) {
                foundChatId = cid;
                break;
            }
        }
        
        if (!foundChatId) {
            foundChatId = `pending_${cleaned}`;
            data.subscriptions[foundChatId] = {
                points: 0,
                subscriptionDays: 0,
                subscriptionExpires: null,
                username: cleaned,
                reports: [],
                updatedAt: new Date().toISOString()
            };
        }
        
        const user = data.subscriptions[foundChatId];
        user.points = (user.points || 0) + (parseInt(points) || 0);
        
        const addedDays = parseInt(days) || 0;
        if (addedDays > 0) {
            const now = new Date();
            let currentExpires = user.subscriptionExpires ? new Date(user.subscriptionExpires) : now;
            if (currentExpires < now) currentExpires = now;
            const newExpires = new Date(currentExpires.getTime() + addedDays * 24 * 60 * 60 * 1000);
            user.subscriptionExpires = newExpires.toISOString();
            user.subscriptionDays = getDaysRemaining(newExpires.toISOString());
        }
        
        await saveLocalSubscriptions(data);
        
        if (!foundChatId.startsWith('pending_')) {
            try {
                let notifyMsg = '🎉 تم تحديث اشتراكك من قبل الإدارة!\n';
                if (addedDays > 0) notifyMsg += `✅ تم تفعيل اشتراك لامحدود لمدة ${addedDays} يوم.\n`;
                if (parseInt(points) > 0) notifyMsg += `✅ تم إضافة ${points} نقطة لرصيدك.\n`;
                notifyMsg += 'يمكنك الآن الاستمتاع بخدمات البوت.';
                
                // Use a non-blocking message send
                bot.sendMessage(foundChatId, notifyMsg).catch(e => console.warn('Could not send to user from API:', e.message));
            } catch(e) {}
        }

        res.json({ success: true, message: 'تم التفعيل بنجاح!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});


// 1. Get User State (Server Time as Truth)
app.get('/api/user/:chatId', async (req, res) => {
    try {
        const { chatId } = req.params;
        const username = req.query.username;
        const user = await dataManager.getSubscriber(chatId, username);
        const reports = await dataManager.getUserReports(chatId);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.json({
            success: true,
            user,
            reports,
            points: user.points,
            subscriptionDays: user.daysRemaining,
            status: user.status,
            plan: user.plan
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 1.2 Get User Reports (Strict Backend Isolation - Rule 4)
app.get('/api/user/:chatId/reports', async (req, res) => {
    try {
        const { chatId } = req.params;
        const reports = await dataManager.getUserReports(chatId);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.json({ success: true, reports });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 1.5 Generate PDF / Save Report Draft
app.post('/api/generate', async (req, res) => {
    try {
        const { chatId, report } = req.body;
        if (!chatId || !report) return res.status(400).json({ success: false, error: 'Invalid data' });

        const data = await loadLocalSubscriptions();
        const chatIdStr = chatId.toString();

        if (!data.subscriptions[chatIdStr]) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const userSub = data.subscriptions[chatIdStr];
        const normalized = normalizeSubscription(userSub);

        if (!userSub.reports) {
            userSub.reports = [];
        }

        const index = userSub.reports.findIndex(r => r.id === report.id);
        const isUpdate = (index >= 0);
        
        if (isUpdate) {
            const existingReport = userSub.reports[index];
            if (existingReport.issueDate) {
                const issueDateObj = new Date(existingReport.issueDate);
                const now = new Date();
                if ((now - issueDateObj) > (2 * 24 * 60 * 60 * 1000)) {
                    return res.status(403).json({ success: false, error: 'لا يمكن تعديل التقرير بعد مرور يومين من تاريخ إصداره.' });
                }
            }
        }

        if (!isUpdate) {
            // New report validation
            if (normalized.subscriptionDays <= 0 && (normalized.points || 0) < 5) {
                return res.status(403).json({ success: false, error: 'عذراً، رصيدك غير كافٍ. تحتاج 5 نقاط لإصدار تقرير جديد.' });
            }
            if (normalized.subscriptionDays <= 0) {
                userSub.points = (userSub.points || 0) - 5;
            }
        }

        if (isUpdate) {
            userSub.reports[index] = report;
        } else {
            userSub.reports.push(report);
        }

        userSub.updatedAt = new Date().toISOString();
        await saveLocalSubscriptions(data);
        res.json({ success: true, report, generatedAt: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin Authentication Middleware / Helper
const verifyAdmin = (req) => {
    // 1. Check initData header, query, or body
    const initData = req.headers['x-telegram-init-data'] || req.query.initData || req.body?.initData;
    if (initData) {
        try {
            const urlParams = new URLSearchParams(initData);
            const hash = urlParams.get('hash');
            urlParams.delete('hash');
            
            const params = [];
            for (const [key, val] of urlParams.entries()) {
                params.push(`${key}=${val}`);
            }
            params.sort();
            const dataCheckString = params.join('\n');
            
            const secretKey = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
            const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
            
            if (calculatedHash === hash) {
                const userObj = JSON.parse(urlParams.get('user') || '{}');
                const uid = String(userObj.id || '');
                if (uid === ADMIN_CHAT_ID) {
                    return { authorized: true, adminId: uid };
                }
            }
        } catch (e) {
            console.error('Error validating initData:', e.message);
        }
    }
    
    // 2. Check admin token (generated via /admin bot command)
    const token = req.headers['x-admin-token'] || req.query.token || req.body?.token;
    if (currentAdminToken && token && token === currentAdminToken) {
        return { authorized: true, adminId: ADMIN_CHAT_ID };
    }
    
    // 3. Manual admin login token (compared against the server-side secret only)
    if (token && ADMIN_MASTER_TOKEN && token === ADMIN_MASTER_TOKEN) {
        return { authorized: true, adminId: ADMIN_CHAT_ID };
    }
    
    return { authorized: false };
};

// -------------------------------------------------------------
// ADMIN WEB APIS
// -------------------------------------------------------------

// -------------------------------------------------------------
// Admin login: verifies the master password SERVER-SIDE and returns a
// short-lived session token. The password itself never reaches the browser.
// Brute-force protection: max 5 attempts per IP per 15 minutes.
// -------------------------------------------------------------
const adminLoginAttempts = new Map();
const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_LOGIN_MAX_ATTEMPTS = 5;

const adminLoginRateLimited = (ip) => {
    const now = Date.now();
    const rec = adminLoginAttempts.get(ip);
    if (!rec || now - rec.first > ADMIN_LOGIN_WINDOW_MS) {
        adminLoginAttempts.set(ip, { count: 0, first: now });
        return false;
    }
    return rec.count >= ADMIN_LOGIN_MAX_ATTEMPTS;
};

const recordAdminLoginFailure = (ip) => {
    const now = Date.now();
    const rec = adminLoginAttempts.get(ip);
    if (!rec || now - rec.first > ADMIN_LOGIN_WINDOW_MS) {
        adminLoginAttempts.set(ip, { count: 1, first: now });
        return;
    }
    rec.count += 1;
};

// Constant-time string comparison to avoid timing leaks
const safeEqual = (a, b) => {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
};

// -------------------------------------------------------------
// Public (non-secret) configuration for the web client.
// Exposes ONLY values that are already visible to end users
// (support contact + owner username). No tokens, no chat ids.
// -------------------------------------------------------------
app.get('/api/public-config', (req, res) => {
    res.json({
        success: true,
        ownerContact: OWNER_CONTACT || '',
        ownerUsername: ADMIN_USERNAME || '',
        webAppUrl: WEB_APP_URL
    });
});

app.post('/api/admin/login', express.json(), async (req, res) => {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';

    if (adminLoginRateLimited(ip)) {
        return res.status(429).json({ success: false, error: 'محاولات كثيرة خاطئة. حاول بعد 15 دقيقة.' });
    }

    const password = (req.body && req.body.password) || '';
    if (!password) {
        recordAdminLoginFailure(ip);
        return res.status(400).json({ success: false, error: 'الرجاء إدخال رمز المشرف' });
    }

    const isOwnerLogin = ADMIN_MASTER_TOKEN && safeEqual(password, ADMIN_MASTER_TOKEN);
    if (!isOwnerLogin) {
        recordAdminLoginFailure(ip);
        return res.status(401).json({ success: false, error: 'الرمز السري غير صحيح' });
    }

    adminLoginAttempts.delete(ip);
    currentAdminToken = crypto.randomBytes(16).toString('hex');
    return res.json({ success: true, token: currentAdminToken, expiresIn: 3600 });
});

// Admin Statistics Endpoint (Dynamic Server Time Calculation)
app.get('/api/admin/web/stats', async (req, res) => {
    const auth = verifyAdmin(req);
    if (!auth.authorized) {
        return res.status(401).json({ success: false, error: 'غير مصرح لك بالوصول (Admin Only)' });
    }
    
    try {
        const stats = await dataManager.getStats();
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.json({ success: true, stats });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin Users List Endpoint
app.get('/api/admin/web/users', async (req, res) => {
    const auth = verifyAdmin(req);
    if (!auth.authorized) {
        return res.status(401).json({ success: false, error: 'غير مصرح لك بالوصول (Admin Only)' });
    }
    
    try {
        const users = await dataManager.getAllSubscribers();
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin All Reports History Endpoint (Rule 3: Search, Date Filter, User Filter)
app.get('/api/admin/reports', async (req, res) => {
    const auth = verifyAdmin(req);
    if (!auth.authorized) {
        return res.status(401).json({ success: false, error: 'غير مصرح لك بالوصول (Admin Only)' });
    }
    
    try {
        const { search, fromDate, toDate, userFilter, page, limit } = req.query;
        const result = await dataManager.getAllReports({
            search,
            fromDate,
            toDate,
            userFilter,
            page: parseInt(page) || 1,
            limit: parseInt(limit) || 50
        });
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin Diagnostic Endpoint for Persistent Storage Inspection
app.get('/api/admin/diagnostics', async (req, res) => {
    const auth = verifyAdmin(req);
    if (!auth.authorized) {
        return res.status(401).json({ success: false, error: 'غير مصرح لك بالوصول (Admin Only)' });
    }
    
    try {
        const fsSync = require('fs');
        const { execSync } = require('child_process');

        const inspectDir = (dirPath) => {
            if (!dirPath || !fsSync.existsSync(dirPath)) return { exists: false };
            try {
                const files = fsSync.readdirSync(dirPath);
                const fileStats = {};
                for (const f of files) {
                    try {
                        const s = fsSync.statSync(path.join(dirPath, f));
                        fileStats[f] = { size: s.size, isDirectory: s.isDirectory(), modified: s.mtime };
                    } catch (e) {
                        fileStats[f] = { error: e.message };
                    }
                }
                return { exists: true, path: dirPath, files: fileStats };
            } catch (e) {
                return { exists: true, path: dirPath, error: e.message };
            }
        };

        let dfOutput = '';
        let mountOutput = '';
        if (process.platform !== 'win32') {
            try { dfOutput = execSync('df -h /data / 2>&1').toString(); } catch (e) { dfOutput = e.message; }
            try { mountOutput = execSync('mount 2>&1 | grep -iE "data|render" || true').toString(); } catch (e) { mountOutput = e.message; }
        }

        const diag = {
            platform: process.platform,
            nodeVersion: process.version,
            env_DATA_DIR: process.env.DATA_DIR || null,
            dataManager_baseDir: dataManager.baseDir,
            storage_locations: {
                configured_baseDir: inspectDir(dataManager.baseDir),
                slash_data: inspectDir('/data'),
                slash_var_data: inspectDir('/var/data'),
                local_app_data: inspectDir(path.join(__dirname, 'data'))
            },
            disk_info: {
                df: dfOutput.trim(),
                mount: mountOutput.trim()
            },
            dataManager_stats: await dataManager.getStats()
        };

        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.json({ success: true, diagnostics: diag });
    } catch (err) {
        console.error('Diagnostics error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin Safe Data Merge Endpoint (Zero Overwrite of Existing Live Data)
app.post('/api/admin/storage/merge-data', express.json({ limit: '10mb' }), async (req, res) => {
    const auth = verifyAdmin(req);
    if (!auth.authorized) {
        return res.status(401).json({ success: false, error: 'غير مصرح لك بالوصول (Admin Only)' });
    }

    try {
        const { reports = {}, subscribers = {}, transactions = [] } = req.body;
        const crypto = require('crypto');
        const fsSync = require('fs');

        const result = await dataManager.mergeDataSafe({ reports, subscribers, transactions });

        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.json({
            success: true,
            message: 'Data merged safely without overwriting live production records.',
            ...result
        });
    } catch (err) {
        console.error('Merge Data Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin Add Subscriber Endpoint (Persistent Database Write - Rule 8 & 9)
app.post('/api/admin/web/user/add', async (req, res) => {
    const auth = verifyAdmin(req);
    if (!auth.authorized) {
        return res.status(401).json({ success: false, error: 'غير مصرح لك بالوصول (Admin Only)' });
    }
    
    try {
        const { chatId, username, name, subscriptionDays, plan, balance_points, report_payment_source } = req.body;
        const cleanChatId = String(chatId || '').trim();
        if (!cleanChatId) {
            return res.status(400).json({ success: false, error: 'يجب إدخال الـ Chat ID' });
        }
        
        const days = parseInt(subscriptionDays) || 0;
        const pts = parseInt(balance_points) || 0;
        const now = new Date();
        const start = now.toISOString();
        const end = days > 0 ? new Date(now.getTime() + days * 86400000).toISOString() : null;
        
        const cleanUser = username ? String(username).replace(/^@/, '').trim().toLowerCase() : '';
        const subType = plan === 'unlimited' ? 'unlimited' : 'points';
        const paySrc = report_payment_source === 'unlimited' ? 'unlimited' : 'points';
        
        const newUser = {
            username: cleanUser,
            name: name || (cleanUser ? `@${cleanUser}` : `مستخدم ${cleanChatId}`),
            status: 'active',
            plan: subType,
            report_payment_source: paySrc,
            points: pts,
            balance_points: pts,
            subscriptionDays: days,
            subscription_start_at: start,
            subscription_end_at: end,
            subscription_start_date: start,
            subscription_end_date: end,
            subscriptionExpires: end,
            reports: [],
            reportsCount: 0,
            referredBy: null,
            referralsCount: 0,
            referralPoints: 0,
            createdAt: start,
            updatedAt: start
        };
        
        const saved = await dataManager.saveSubscriber(cleanChatId, newUser);
        
        await dataManager.logTransaction({
            admin_chat_id: auth.adminId,
            target_chat_id: cleanChatId,
            operation: 'add_user',
            amount: pts,
            new_value: `${days} days, ${pts} points, ${paySrc}`,
            details: `إضافة مشترك جديد Chat ID: ${cleanChatId}`
        });
        
        res.json({
            success: true,
            message: 'تم إضافة المشترك بنجاح وحفظه في قاعدة البيانات الدائمة',
            user: saved
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin Update Subscriber Endpoint
app.post('/api/admin/web/user/update', async (req, res) => {
    const auth = verifyAdmin(req);
    if (!auth.authorized) {
        return res.status(401).json({ success: false, error: 'غير مصرح لك بالوصول (Admin Only)' });
    }
    
    try {
        const { chatId, action, amount, days, paymentSource, status } = req.body;
        const cleanChatId = String(chatId || '').trim();
        if (!cleanChatId) {
            return res.status(400).json({ success: false, error: 'Chat ID مطلوب' });
        }
        
        let message = 'تم تحديث بيانات المشترك بنجاح';
        
        const updated = await dataManager.updateSubscriber(cleanChatId, (user) => {
            if (action === 'add_points') {
                const amt = parseInt(amount) || 0;
                if (amt <= 0) throw new Error('عدد النقاط يجب أن يكون أكبر من 0');
                const prev = user.points || 0;
                user.points = prev + amt;
                user.balance_points = user.points;
                dataManager.logTransaction({
                    admin_chat_id: auth.adminId,
                    target_chat_id: cleanChatId,
                    operation: 'add_points',
                    amount: amt,
                    previous_value: prev,
                    new_value: user.points,
                    details: `إضافة ${amt} نقطة إلى رصيد المشترك`
                });
                message = `تم إضافة ${amt} نقطة بنجاح (الرصيد الجديد: ${user.points})`;
            } else if (action === 'remove_points') {
                const amt = parseInt(amount) || 0;
                if (amt <= 0) throw new Error('عدد النقاط يجب أن يكون أكبر من 0');
                const current = user.points || 0;
                if (amt > current) {
                    throw new Error(`رصيد المشترك (${current}) غير كافٍ لخصم ${amt} نقطة`);
                }
                user.points = current - amt;
                user.balance_points = user.points;
                dataManager.logTransaction({
                    admin_chat_id: auth.adminId,
                    target_chat_id: cleanChatId,
                    operation: 'remove_points',
                    amount: amt,
                    previous_value: current,
                    new_value: user.points,
                    details: `خصم ${amt} نقطة من رصيد المشترك`
                });
                message = `تم خصم ${amt} نقطة بنجاح (الرصيد الجديد: ${user.points})`;
            } else if (action === 'set_payment_source') {
                if (!['points', 'unlimited'].includes(paymentSource)) {
                    throw new Error('مصدر الدفع غير صالح');
                }
                const prev = user.report_payment_source || 'points';
                user.report_payment_source = paymentSource;
                dataManager.logTransaction({
                    admin_chat_id: auth.adminId,
                    target_chat_id: cleanChatId,
                    operation: 'payment_source_changed',
                    previous_value: prev,
                    new_value: paymentSource,
                    details: `تغيير مصدر دفع التقارير إلى ${paymentSource === 'unlimited' ? 'غير محدود' : 'بالنقاط'}`
                });
                message = `تم تغيير مصدر الدفع إلى: ${paymentSource === 'unlimited' ? '♾️ غير محدود' : '🪙 بالنقاط'}`;
            } else if (action === 'set_status') {
                if (!['active', 'suspended'].includes(status)) {
                    throw new Error('حالة غير صالحة');
                }
                const prev = user.status || 'active';
                user.status = status;
                const op = status === 'active' ? 'subscription_activate' : 'subscription_suspend';
                dataManager.logTransaction({
                    admin_chat_id: auth.adminId,
                    target_chat_id: cleanChatId,
                    operation: op,
                    previous_value: prev,
                    new_value: status,
                    details: `تغيير حالة المشترك إلى ${status === 'active' ? 'فعال' : 'موقوف'}`
                });
                message = `تم تغيير حالة المشترك إلى: ${status === 'active' ? '🟢 فعال' : '⏸️ موقوف'}`;
            } else if (action === 'renew') {
                const addDays = parseInt(days) || 0;
                if (addDays <= 0) throw new Error('عدد الأيام يجب أن يكون أكبر من 0');
                const now = new Date();
                let baseDate = now;
                if (user.subscription_end_at && new Date(user.subscription_end_at) > now) {
                    baseDate = new Date(user.subscription_end_at);
                }
                const newEnd = new Date(baseDate.getTime() + addDays * 86400000);
                const prev = user.subscription_end_at;
                user.subscription_start_at = user.subscription_start_at || now.toISOString();
                user.subscription_end_at = newEnd.toISOString();
                user.subscriptionExpires = newEnd.toISOString();
                user.subscription_end_date = newEnd.toISOString();
                user.status = 'active'; // Always reactivate on renewal
                dataManager.logTransaction({
                    admin_chat_id: auth.adminId,
                    target_chat_id: cleanChatId,
                    operation: 'subscription_renew',
                    amount: addDays,
                    previous_value: prev,
                    new_value: newEnd.toISOString(),
                    details: `تجديد الاشتراك لمدة ${addDays} يوم`
                });
                message = `تم تجديد الاشتراك بنجاح لمدة ${addDays} يوم`;
            } else if (action === 'cancel') {
                // Rule 35: Cancel = status change only. Never delete user, points, or reports!
                const prev = user.status;
                user.status = 'cancelled';
                dataManager.logTransaction({
                    admin_chat_id: auth.adminId,
                    target_chat_id: cleanChatId,
                    operation: 'subscription_cancel',
                    previous_value: prev,
                    new_value: 'cancelled',
                    details: 'إلغاء الاشتراك نهائياً'
                });
                message = 'تم إلغاء الاشتراك بنجاح (سيبقى الحساب وسجل التقارير محفوظاً)';
            } else {
                throw new Error('إجراء غير معروف');
            }
            return user;
        });
        
        res.json({
            success: true,
            message,
            user: updated
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// Admin Get Reports for User
app.get('/api/admin/web/user/:id/reports', async (req, res) => {
    const auth = verifyAdmin(req);
    if (!auth.authorized) {
        return res.status(401).json({ success: false, error: 'غير مصرح لك بالوصول (Admin Only)' });
    }
    
    try {
        const reports = await dataManager.getUserReports(req.params.id);
        res.json({
            success: true,
            reports
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin Get Transaction Logs for User
app.get('/api/admin/web/user/:id/logs', async (req, res) => {
    const auth = verifyAdmin(req);
    if (!auth.authorized) {
        return res.status(401).json({ success: false, error: 'غير مصرح لك بالوصول (Admin Only)' });
    }
    
    try {
        const targetId = String(req.params.id);
        const logs = await dataManager.getTransactions(targetId);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.json({
            success: true,
            logs
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin Get All Transaction Logs (Audit Log - Rule 20)
app.get('/api/admin/logs', async (req, res) => {
    const auth = verifyAdmin(req);
    if (!auth.authorized) {
        return res.status(401).json({ success: false, error: 'غير مصرح لك بالوصول (Admin Only)' });
    }
    
    try {
        const logs = await dataManager.getTransactions();
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.json({
            success: true,
            logs
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Legacy /api/admin/package compatibility endpoint
app.post('/api/admin/package', async (req, res) => {
    const auth = verifyAdmin(req);
    if (!auth.authorized) {
        return res.status(401).json({ success: false, error: 'غير مصرح لك (Unauthorized)' });
    }
    try {
        const { chatId, points, subscriptionDays } = req.body;
        const cleanChatId = String(chatId || '').trim();
        if (!cleanChatId) return res.status(400).json({ success: false, error: 'Chat ID مطلوب' });
        
        await withDbLock(async () => {
            const data = await loadLocalSubscriptions();
            let user = data.subscriptions[cleanChatId];
            const days = parseInt(subscriptionDays) || 0;
            const pts = parseInt(points) || 0;
            const now = new Date();
            
            if (!user) {
                user = {
                    username: '',
                    name: `مستخدم ${cleanChatId}`,
                    status: 'active',
                    plan: days > 0 ? 'unlimited' : 'points',
                    report_payment_source: days > 0 ? 'unlimited' : 'points',
                    points: pts,
                    balance_points: pts,
                    subscriptionDays: days,
                    subscription_start_date: now.toISOString(),
                    subscription_end_date: days > 0 ? new Date(now.getTime() + days * 86400000).toISOString() : null,
                    subscriptionExpires: days > 0 ? new Date(now.getTime() + days * 86400000).toISOString() : null,
                    reports: [],
                    referredBy: null,
                    referralsCount: 0,
                    referralPoints: 0,
                    updatedAt: now.toISOString()
                };
                data.subscriptions[cleanChatId] = user;
                logTransaction(data, {
                    admin_chat_id: auth.adminId,
                    target_chat_id: cleanChatId,
                    operation: 'add_user',
                    amount: pts,
                    details: 'تمت الإضافة عبر /api/admin/package'
                });
            } else {
                normalizeSubscription(user);
                user.points = (user.points || 0) + pts;
                user.balance_points = user.points;
                if (days > 0) {
                    let base = now;
                    if (user.subscription_end_date && new Date(user.subscription_end_date) > now) {
                        base = new Date(user.subscription_end_date);
                    }
                    const newEnd = new Date(base.getTime() + days * 86400000);
                    user.subscription_end_date = newEnd.toISOString();
                    user.subscriptionExpires = newEnd.toISOString();
                }
                user.status = 'active';
                user.updatedAt = now.toISOString();
                logTransaction(data, {
                    admin_chat_id: auth.adminId,
                    target_chat_id: cleanChatId,
                    operation: 'update_user',
                    amount: pts,
                    details: 'تحديث الحساب عبر /api/admin/package'
                });
            }
            await saveLocalSubscriptions(data);
            res.json({
                success: true,
                points: user.points,
                subscriptionDays: user.subscriptionDays,
                user: normalizeSubscription(user)
            });
        });
    } catch (err) {
        if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
    }
});

// Admin endpoint to inspect & force-update Telegram Menu Button
app.get('/api/admin/menu-button', async (req, res) => {
    try {
        const https = require('https');
        const getMenuBtn = (chatIdVal = null) => {
            return new Promise((resolve) => {
                const body = chatIdVal ? JSON.stringify({ chat_id: chatIdVal.toString() }) : '{}';
                const req = https.request({
                    hostname: 'api.telegram.org',
                    path: `/bot${TOKEN}/getChatMenuButton`,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(body)
                    }
                }, (response) => {
                    let d = '';
                    response.on('data', c => d += c);
                    response.on('end', () => {
                        try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); }
                    });
                });
                req.on('error', e => resolve({ error: e.message }));
                req.write(body);
                req.end();
            });
        };

        const defaultBtn = await getMenuBtn(null);
        const ownerBtn = await getMenuBtn(ADMIN_CHAT_ID);
        res.json({
            success: true,
            configured_url: WEB_APP_URL_CACHED,
            default_menu_button: defaultBtn,
            owner_menu_button: ownerBtn
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/admin/menu-button/sync', async (req, res) => {
    try {
        await configureChatMenuButton();
        if (ADMIN_CHAT_ID) await configureChatMenuButton(ADMIN_CHAT_ID);
        res.json({ success: true, message: 'Menu button synced', url: WEB_APP_URL_CACHED });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- Inquiry Endpoints ---
app.get(['/inquiry', '/verify', '/inquiries/slenquiry', '/slenquiry'], (req, res) => {
    res.sendFile(path.join(__dirname, 'inquiry.html'));
});

app.post('/api/inquiry', async (req, res) => {
    try {
        const rawLeaveId = req.body.leaveId || req.body.service_code || req.body.id || req.body.serviceCode || '';
        const rawNationalId = req.body.nationalId || req.body.national_id || req.body.nin || req.body.nid || '';
        
        const cleanDigits = (s) => String(s || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).trim();
        const cleanCode = (s) => cleanDigits(s).toUpperCase().replace(/\s+/g, '');

        const leaveId = cleanCode(rawLeaveId);
        const nationalId = cleanDigits(rawNationalId);

        if (!leaveId || !nationalId) {
            return res.json({ success: false, error: 'الرجاء إدخال رمز الخدمة ورقم الهوية.' });
        }

        let foundLeaveIdMatch = false;
        let foundReport = null;

        // 1. Search via DataManager (Persistent Storage)
        const rep = await dataManager.getReportByServiceCode(leaveId);
        if (rep) {
            foundLeaveIdMatch = true;
            const rNid = cleanDigits(rep.national_id || (rep.data && (rep.data.national_id || rep.data.nationalId)));
            if (rNid === nationalId) {
                foundReport = rep;
            }
        }

        // 2. Fallback search via subscriptions
        if (!foundReport) {
            const data = await loadLocalSubscriptions();
            for (const chatId in data.subscriptions) {
                const sub = data.subscriptions[chatId];
                if (sub.reports && Array.isArray(sub.reports)) {
                    for (const r of sub.reports) {
                        const rId = cleanCode(r.id || r.leaveId || (r.data && (r.data.id || r.data.leaveId || r.data.service_code)));
                        if (rId === leaveId) {
                            foundLeaveIdMatch = true;
                            const rNid = cleanDigits((r.data && (r.data.national_id || r.data.nationalId)) || r.nationalId || r.national_id);
                            if (rNid === nationalId) {
                                foundReport = r;
                                break;
                            }
                        }
                    }
                }
                if (foundReport) break;
            }
        }

        if (foundReport) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            const rData = foundReport.data || {};
            const isCompanion = (foundReport.type === 'companion' || foundReport.type === 'companion_review' || (rData.escort_name_ar && rData.escort_name_ar.trim().length > 0));
            const formatted = {
                id: foundReport.id || leaveId,
                serviceCode: foundReport.id || leaveId,
                nationalId: rData.national_id || foundReport.national_id || nationalId,
                type: foundReport.type || (isCompanion ? 'companion' : 'sickleave'),
                name: rData.patient_name_ar || foundReport.patient_name || foundReport.patientName || rData.patient_name_en || '',
                patientName: rData.patient_name_ar || foundReport.patient_name || foundReport.patientName || '',
                companionName: rData.escort_name_ar || foundReport.companionName || '',
                relation: rData.relation_ar || foundReport.relation || '',
                issueDate: rData.issue_date || foundReport.issue_date || foundReport.issueDate || '',
                startDate: rData.admission_date || rData.start_date || rData.admissionG || foundReport.startDate || '',
                endDate: rData.discharge_date || rData.end_date || rData.dischargeG || foundReport.endDate || '',
                duration: String(rData.duration || foundReport.duration || '1'),
                doctorName: rData.doctor_name_ar || rData.doctor_name || rData.doctorAr || foundReport.doctorName || '',
                jobTitle: rData.job_title_ar || rData.position || rData.job_title || foundReport.jobTitle || 'طبيب عام',
                hospital: rData.hospital_ar || foundReport.hospital || '',
                data: rData
            };
            res.json({ success: true, report: formatted });
        } else if (foundLeaveIdMatch) {
            res.json({ success: false, error: 'بيانات الاستعلام غير متطابقة (رقم الهوية غير مطابق لرمز الخدمة).' });
        } else {
            res.json({ success: false, error: 'لم يتم العثور على تقرير إجازة بهذا الرمز.' });
        }
    } catch (err) {
        console.error("Inquiry Error:", err);
        res.status(500).json({ 
            success: false, 
            error: 'حدث خطأ مؤقت أثناء الاستعلام، يرجى المحاولة مرة أخرى.', 
            details: err.message 
        });
    }
});

app.post('/api/admin/package', async (req, res) => {
    try {
        const { token, chatId, points, subscriptionDays } = req.body;
        
        // Allow either the dynamic token or the master secret password
        if (token !== currentAdminToken && token !== ADMIN_MASTER_TOKEN) {
            return res.status(401).json({ success: false, error: 'الرمز السري غير صحيح!' });
        }
        
        const data = await loadLocalSubscriptions();
        const chatIdStr = chatId.toString();
        
        if (!data.subscriptions[chatIdStr]) {
            data.subscriptions[chatIdStr] = {
                points: 0,
                subscriptionDays: 0,
                subscriptionExpires: null,
                username: null,
                reports: [],
                updatedAt: new Date().toISOString()
            };
        }
        
        const userSub = data.subscriptions[chatIdStr];
        const normalized = normalizeSubscription(userSub);
        
        if (subscriptionDays > 0) {
            const now = new Date();
            let currentExpires = normalized.subscriptionExpires ? new Date(normalized.subscriptionExpires) : now;
            if (currentExpires < now) currentExpires = now;
            currentExpires.setDate(currentExpires.getDate() + subscriptionDays);
            normalized.subscriptionExpires = currentExpires.toISOString();
            normalized.subscriptionDays = subscriptionDays;
        }
        
        normalized.points = (normalized.points || 0) + (points || 0);
        normalized.updatedAt = new Date().toISOString();
        
        // Write back
        data.subscriptions[chatIdStr] = normalized;
        await saveLocalSubscriptions(data);
        
        res.json({ success: true, points: normalized.points, subscriptionDays: normalized.subscriptionDays });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/user/:chatId/package', async (req, res) => {
    try {
        const { chatId } = req.params;
        const { points, subscriptionDays } = req.body;
        
        const data = await loadLocalSubscriptions();
        const chatIdStr = chatId.toString();
        
        if (!data.subscriptions[chatIdStr]) {
            data.subscriptions[chatIdStr] = {
                points: 0,
                subscriptionDays: 0,
                subscriptionExpires: null,
                username: null,
                reports: [],
                updatedAt: new Date().toISOString()
            };
        }
        
        const userSub = data.subscriptions[chatIdStr];
        const normalized = normalizeSubscription(userSub);
        
        if (subscriptionDays > 0) {
            const now = new Date();
            const baseDate = normalized.subscriptionExpires ? new Date(normalized.subscriptionExpires) : now;
            const start = baseDate > now ? baseDate : now;
            const expires = new Date(start.getTime() + subscriptionDays * 24 * 60 * 60 * 1000);
            normalized.subscriptionExpires = expires.toISOString();
            normalized.subscriptionDays = getDaysRemaining(normalized.subscriptionExpires);
        }
        
        normalized.points = (normalized.points || 0) + (points || 0);
        normalized.updatedAt = new Date().toISOString();
        
        await saveLocalSubscriptions(data);
        res.json({ success: true, points: normalized.points, subscriptionDays: normalized.subscriptionDays });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. Save Report
app.post('/api/report/:chatId', async (req, res) => {
    try {
        const { chatId } = req.params;
        const reportData = req.body.report;
        const chatIdStr = chatId.toString();
        
        await withDbLock(async () => {
            const data = await loadLocalSubscriptions();
            if (!data.subscriptions[chatIdStr]) {
                return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
            }
            
            const userSub = data.subscriptions[chatIdStr];
            const normalized = normalizeSubscription(userSub);
            
            if (normalized.status === 'suspended') {
                return res.status(403).json({ success: false, error: '❌ حسابك موقوف مؤقتاً. يرجى التواصل مع الإدارة.' });
            }
            if (normalized.status === 'cancelled') {
                return res.status(403).json({ success: false, error: '❌ اشتراكك ملغي. يرجى التواصل مع الإدارة.' });
            }
            if (normalized.subscriptionDays <= 0) {
                return res.status(403).json({ success: false, error: '❌ انتهت صلاحية اشتراكك. يرجى التجديد لإصدار التقارير.' });
            }
            
            if (!userSub.reports) {
                userSub.reports = [];
            }
            
            const index = userSub.reports.findIndex(r => r.id === reportData.id);
            const isUpdate = (index >= 0);
            
            if (isUpdate) {
                const existingReport = userSub.reports[index];
                if (existingReport.issueDate) {
                    const issueDateObj = new Date(existingReport.issueDate);
                    const now = new Date();
                    if ((now - issueDateObj) > (2 * 24 * 60 * 60 * 1000)) {
                        return res.status(403).json({ success: false, error: 'لا يمكن تعديل التقرير بعد مرور يومين من تاريخ إصداره.' });
                    }
                }
            }
            
            const paySource = userSub.report_payment_source || 'points';
            if (!isUpdate) {
                if (paySource === 'points') {
                    if ((userSub.points || 0) < 5) {
                        return res.status(403).json({ success: false, error: 'عذراً، رصيدك غير كافٍ. تحتاج 5 نقاط لإصدار تقرير جديد.' });
                    }
                    const prevPts = userSub.points || 0;
                    userSub.points = prevPts - 5;
                    userSub.balance_points = userSub.points;
                    logTransaction(data, {
                        admin_chat_id: 'system',
                        target_chat_id: chatIdStr,
                        operation: 'report_deduction',
                        amount: 5,
                        previous_value: prevPts,
                        new_value: userSub.points,
                        details: `خصم 5 نقاط لإصدار تقرير ${reportData.id || ''}`
                    });
                } else {
                    logTransaction(data, {
                        admin_chat_id: 'system',
                        target_chat_id: chatIdStr,
                        operation: 'report_created',
                        amount: 0,
                        new_value: 'unlimited',
                        details: `إصدار تقرير ${reportData.id || ''} (اشتراك غير محدود)`
                    });
                }
            }
            
            // Ensure Short.io shortURL is generated and attached
            const leaveId = shortIoService.sanitizePath(reportData.id || (reportData.data && (reportData.data.leaveId || reportData.data.service_code)));
            if (leaveId) {
                if (!reportData.shortURL) {
                    try {
                        const originalInquiryUrl = `${WEB_APP_URL}/inquiries/slenquiry?id=${encodeURIComponent(leaveId)}`;
                        const shortRes = await shortIoService.createShortLink({
                            originalURL: originalInquiryUrl,
                            path: leaveId,
                            allowDuplicates: false
                        });
                        reportData.shortURL = shortRes.shortURL;
                    } catch (e) {
                        reportData.shortURL = shortIoService.buildFallbackUrl(leaveId);
                    }
                }
                if (reportData.data) {
                    reportData.data.leaveId = reportData.data.leaveId || leaveId;
                    reportData.data.service_code = reportData.data.service_code || leaveId;
                    reportData.data.short_url = reportData.data.short_url || reportData.shortURL;
                }
            }

            if (isUpdate) {
                userSub.reports[index] = reportData;
            } else {
                userSub.reports.push(reportData);
            }
            
            userSub.updatedAt = new Date().toISOString();
            await saveLocalSubscriptions(data);

            // Persist to DataManager (reports.json)
            try {
                await dataManager.saveReport({
                    id: reportData.id,
                    report_id: reportData.id,
                    chat_id: chatIdStr,
                    username: userSub.username,
                    patient_name: reportData.patientName || (reportData.data && (reportData.data.patient_name_ar || reportData.data.patient_name_en)) || '',
                    national_id: (reportData.data && reportData.data.national_id) || reportData.nationalId || '',
                    issue_date: reportData.issueDate || (reportData.data && reportData.data.issue_date) || new Date().toISOString().slice(0, 10),
                    issue_time: (reportData.data && reportData.data.issue_time) || '',
                    type: reportData.type || 'sick',
                    service_code: leaveId || reportData.id,
                    inquiry_url: reportData.shortURL || '',
                    short_url: reportData.shortURL || '',
                    payment_type: paySource,
                    points_deducted: paySource === 'points' && !isUpdate ? 5 : 0,
                    status: 'issued',
                    data: reportData.data || {}
                });
            } catch (dmErr) {
                console.warn('DataManager saveReport warning in /api/report:', dmErr.message);
            }

            res.json({ success: true, points: userSub.points, shortURL: reportData.shortURL });
        });
    } catch (err) {
        if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
    }
});

// 4. Delete Report
app.delete('/api/report/:chatId/:id', async (req, res) => {
    try {
        const { chatId, id } = req.params;
        const data = await loadLocalSubscriptions();
        const chatIdStr = chatId.toString();
        
        if (data.subscriptions[chatIdStr] && data.subscriptions[chatIdStr].reports) {
            data.subscriptions[chatIdStr].reports = data.subscriptions[chatIdStr].reports.filter(r => r.id !== id);
            data.subscriptions[chatIdStr].updatedAt = new Date().toISOString();
            await saveLocalSubscriptions(data);
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, error: 'Report not found' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

const appLogs = [];
function addLog(msg) {
    appLogs.push(`[${new Date().toISOString()}] ${msg}`);
    if (appLogs.length > 50) appLogs.shift();
    console.log(msg);
}

// 5. Send PDF via Telegram
app.post('/api/send-pdf', async (req, res) => {
    try {
        const { chatId, pdfBase64, filename, reportId } = req.body;
        addLog(`send-pdf called for chatId: ${chatId}, pdf length: ${pdfBase64 ? pdfBase64.length : 0}`);
        
        if (!chatId || !pdfBase64) {
            addLog('Missing chatId or pdfBase64');
            return res.status(400).json({ success: false, error: 'Missing chatId or pdf content' });
        }

        const pdfBuffer = Buffer.from(pdfBase64.split('base64,')[1], 'base64');
        addLog(`Buffer created, size: ${pdfBuffer.length} bytes`);
        
        // Send document via Telegram Bot
        const message = await bot.sendDocument(chatId, pdfBuffer, {
            caption: '📄 تقرير الإجازة المرضية الخاص بك'
        }, {
            filename: filename || 'sickLeaves.pdf',
            contentType: 'application/pdf'
        });
        
        addLog(`Telegram sent doc successfully. fileId: ${message.document?.file_id}`);

        const fileId = message.document?.file_id;
        
        if (fileId && reportId) {
            const data = await loadLocalSubscriptions();
            const userSub = data.subscriptions[chatId.toString()];
            if (userSub && userSub.reports) {
                const report = userSub.reports.find(r => r.id === reportId);
                if (report) {
                    report.fileId = fileId;
                    userSub.updatedAt = new Date().toISOString();
                    await saveLocalSubscriptions(data);
                }
            }
            
            // Forward to channel for backup if channel ID is defined
            if (CHANNEL_ID) {
                try {
                    await bot.sendDocument(CHANNEL_ID, fileId);
                } catch (err) {
                    addLog('Could not forward to Telegram Channel: ' + err.message);
                }
            }
        }

        res.json({ success: true, fileId });
    } catch (err) {
        addLog(`Error sending PDF: ${err.message}`);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 6. Generate Native PDF via Puppeteer
app.post('/api/generate-native-pdf', async (req, res) => {
    let browser = null;
    try {
        const { chatId, reportData, filename, reportId } = req.body;
        addLog(`generate-native-pdf called for chatId: ${chatId}`);
        
        if (!chatId || !reportData) {
            return res.status(400).json({ success: false, error: 'Missing chatId or reportData' });
        }
        
        // --- STRICT BLOCKING & ELIGIBILITY LOGIC ---
        const chatIdStr = chatId.toString();
        const userSub = await dataManager.getSubscriber(chatIdStr);
        if (!userSub) {
            return res.status(403).json({ success: false, error: '❌ حسابك غير موجود. يرجى تفعيل الاشتراك من البوت.' });
        }
        
        if (userSub.status === 'suspended') {
            return res.status(403).json({ success: false, error: '❌ تم إيقاف حسابك مؤقتاً. يرجى التواصل مع الإدارة.' });
        }
        if (userSub.status === 'cancelled') {
            return res.status(403).json({ success: false, error: '❌ تم إلغاء اشتراكك. يرجى التواصل مع الإدارة لإعادة التفعيل.' });
        }

        // Idempotency: check if report already issued
        const currentRepId = reportId || reportData.leaveId || reportData.id || ('SL' + Math.random().toString(36).substring(2, 8).toUpperCase());
        const existingRep = await dataManager.getReportById(currentRepId);
        const isUpdate = !!existingRep;

        const isUnlimitedActive = (userSub.report_payment_source === 'unlimited' || userSub.plan === 'unlimited') && userSub.daysRemaining > 0;
        let pointsToDeduct = 0;

        if (!isUpdate) {
            if (isUnlimitedActive) {
                pointsToDeduct = 0;
            } else {
                if ((userSub.points || 0) < 5) {
                    return res.status(403).json({ success: false, error: '❌ عذراً، رصيدك غير كافٍ. تحتاج إلى 5 نقاط أو اشتراك فعال لإصدار هذا التقرير.' });
                }
                pointsToDeduct = 5;
            }
        }
        // -------------------------------------------


        // Helper: read local image as base64 data URI
        const imgToBase64 = async (filePath) => {
            try {
                const abs = path.join(__dirname, filePath);
                const buf = await fs.readFile(abs);
                const ext = path.extname(filePath).toLowerCase().replace('.', '');
                const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : 'image/png';
                return `data:${mime};base64,${buf.toString('base64')}`;
            } catch {
                return '';
            }
        };

        // Pre-load images as base64
        const sehaLogo = await imgToBase64('الشعارات/seha_logo_clean.png') || await imgToBase64('الشعارات/Seha.png');
        const ksaCalligraphy = await imgToBase64('الشعارات/ksa_emblem_clean.png') || await imgToBase64('الشعارات/ksa_calligraphy.png');
        const mohLogo = await imgToBase64('الشعارات/moh_logo_clean.png') || await imgToBase64('الشعارات/Saudi_Ministry_of_Health.JPG');
        const nhicLogo = await imgToBase64('الشعارات/dfhZfyJM_400x400 (1).jpg');

        const d = reportData;
        // 1. Ensure unique Leave ID / Service Code
        if (!d.leaveId) {
            d.leaveId = reportId || ('SL' + Math.random().toString(36).substring(2, 8).toUpperCase());
        }
        const sanitizedLeaveId = shortIoService.sanitizePath(d.leaveId);

        // 2. Prepare educational inquiry original URL for this record
        const originalInquiryUrl = `${WEB_APP_URL}/inquiries/slenquiry?id=${encodeURIComponent(sanitizedLeaveId)}`;

        // 3. Obtain Short.io URL (uses official API with timeout/retry or graceful fallback)
        let shortURL = d.shortURL || d.short_url;
        if (!shortURL) {
            try {
                const shortResult = await shortIoService.createShortLink({
                    originalURL: originalInquiryUrl,
                    path: sanitizedLeaveId,
                    allowDuplicates: false
                });
                shortURL = shortResult.shortURL;
            } catch (shortErr) {
                console.error('[ShortIoService] Error creating short link:', shortErr.message);
                shortURL = shortIoService.buildFallbackUrl(sanitizedLeaveId);
            }
        }
        d.shortURL = shortURL;

        let formattedDurationAr = d.durationAr || '';
        if (formattedDurationAr && !formattedDurationAr.includes('<span dir="ltr">')) {
            formattedDurationAr = formattedDurationAr.replace(/(\d{2,4}-\d{2}-\d{2,4})/g, '<span dir="ltr">$1</span>');
        }
        const isCompanion = !!(d.relationAr || d.relationEn || d.type === 'companion' || d.type === 'companion_review');
        const footerMarginTop = '12px';

        // Build self-contained HTML matching Sehaty platform exactly
        const html = `<!DOCTYPE html>
<html lang="ar" dir="ltr">
<head>
<meta charset="UTF-8">
</head>
<body>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap');
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; user-select: text; -webkit-user-select: text; }
  html { background: #fff !important; }
  body { margin: 0; padding: 0; background: #fff !important; width: 794px; height: 1123px; overflow: hidden; direction: ltr; user-select: text; -webkit-user-select: text; }
  @page { size: 794px 1123px; margin: 0; }
  table { border-spacing: 0; direction: ltr; border-collapse: collapse; width: 100%; text-align: center; table-layout: fixed; }
  .table-wrapper { width: 724px; border-radius: 12px; overflow: hidden; border: 1.3px solid #cccccc; }
  tr { height: 40px; }
  td { font-family: 'Tajawal', 'Arial', sans-serif; vertical-align: middle !important; text-align: center !important; user-select: text; -webkit-user-select: text; }
  .label-en { border: 1.3px solid #cccccc; padding: 5px 6px; font-weight: bold; color: #316DB5; font-size: 13px; width: 150px; }
  .label-ar { border: 1.3px solid #cccccc; padding: 5px 6px; font-weight: bold; color: #316DB5; font-size: 13.5px; width: 150px; }
  .val-en { border: 1.3px solid #cccccc; padding: 5px 6px; font-family: 'Arial', sans-serif; font-size: 12px; font-weight: normal; color: #293C73; word-break: keep-all; }
  .val-en-name { border: 1.3px solid #cccccc; padding: 5px 6px; font-family: 'Arial', sans-serif; font-size: 12px; font-weight: normal; letter-spacing: 0.2px; text-transform: uppercase; color: #293C73; word-break: keep-all; }
  .val-ar { border: 1.3px solid #cccccc; padding: 5px 6px; font-family: 'Tajawal', sans-serif; font-size: 13px; font-weight: 500; color: #293C73; word-break: keep-all; }
  .val-date { border: 1.3px solid #cccccc; padding: 5px 6px; font-family: 'Arial', sans-serif; font-size: 12.5px; font-weight: normal; color: #293C73; word-break: keep-all; }
  .val-id { border: 1.3px solid #cccccc; padding: 5px 6px; font-family: 'Arial', sans-serif; font-size: 13.2px; font-weight: bold; color: #293C73; white-space: nowrap; letter-spacing: normal; user-select: text; -webkit-user-select: text; word-break: keep-all; }
  .val-nid { border: 1.3px solid #cccccc; padding: 5px 6px; font-family: 'Arial', sans-serif; font-size: 13.2px; font-weight: bold; color: #293C73; white-space: nowrap; letter-spacing: normal; user-select: text; -webkit-user-select: text; word-break: keep-all; }
  .dur-row td { background-color: #1F3864 !important; color: white; border: 1.3px solid #cccccc; padding: 5px 4px; white-space: nowrap; }
  .dur-label { font-weight: bold; font-size: 13px; }
  tr:nth-child(even):not(.dur-row) td { background-color: #f7f7f7; }
</style>
<div style="width:794px;height:1123px;background:#fff;font-family:'Tajawal','Arial',sans-serif;position:relative;overflow:hidden;direction:ltr;">
  
  <!-- Header: Seha Logo (left) -->
  <img src="${sehaLogo}" style="position:absolute;top:32px;left:38px;width:155px;height:auto;">

  <!-- Header: Geometric graphic (right) -->
  <svg width="195" height="92" viewBox="0 0 408 192" style="position:absolute;top:38px;right:30px;opacity:0.8;">
    <path d="M 0,0 L 44,28 L 56,109 L 91,2 L 116,59 L 56,109 M 56,109 L 113,124 L 116,59 M 116,59 L 154,1 M 116,59 L 229,44 L 327,96 M 116,59 L 201,74 L 327,96 M 113,124 L 201,74 L 229,44 M 213,1 L 229,44 M 241,1 L 327,96 M 324,1 L 327,96 M 327,96 L 386,1 L 404,190 L 327,96" stroke="#9cb1cd" stroke-width="1.6" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>
  
  <!-- Header: KSA Calligraphy (center) -->
  <img src="${ksaCalligraphy}" style="position:absolute;top:68px;left:50%;transform:translateX(-50%);width:190px;height:auto;">
  
  <!-- Header: Arabic & English Titles -->
  <div style="position:absolute;top:168px;left:0;width:794px;text-align:center;">
    <h1 style="color:#316DB5;font-size:21px;font-weight:bold;font-family:'Tajawal',sans-serif;margin:0 0 3px 0;line-height:1.2;">${d.titleAr || 'تقرير إجازة مرضية'}</h1>
    <h2 style="color:#293C73;font-size:16.5px;font-weight:bold;font-family:'Times New Roman',Georgia,serif;margin:0;letter-spacing:0.2px;line-height:1.2;">${d.titleEn || 'Sick Leave Report'}</h2>
  </div>

  <!-- Data Table & Footer Container -->
  <div style="position:absolute;top:226px;left:35px;width:724px;">
  <div class="table-wrapper">
  <table style="width:100%;border-collapse:collapse;text-align:center;table-layout:fixed;">
    <tr>
      <td class="label-en" style="width:150px;">Leave ID</td>
      <td class="val-id" colspan="2" style="width:424px;">${d.leaveId || ''}</td>
      <td class="label-ar" style="width:150px;">رمز الإجازة</td>
    </tr>
    <tr class="dur-row">
      <td class="dur-label" style="width:150px;">Leave Duration</td>
      <td style="width:212px; font-family:'Arial',sans-serif; font-size:11.8px; font-weight:normal;">${d.durationEn || ''}</td>
      <td dir="rtl" style="width:212px; font-family:'Tajawal',sans-serif; font-size:12.5px; font-weight:500;">${formattedDurationAr}</td>
      <td class="dur-label" style="width:150px;">مدة الإجازة</td>
    </tr>
    <tr>
      <td class="label-en">Admission Date</td>
      <td class="val-date">${d.admissionG || ''}</td>
      <td class="val-date">${d.admissionH || ''}</td>
      <td class="label-ar">تاريخ الدخول</td>
    </tr>
    <tr>
      <td class="label-en">Discharge Date</td>
      <td class="val-date">${d.dischargeG || ''}</td>
      <td class="val-date">${d.dischargeH || ''}</td>
      <td class="label-ar">تاريخ الخروج</td>
    </tr>
    <tr>
      <td class="label-en">Issue Date</td>
      <td class="val-date" colspan="2">${d.issueDate || ''}</td>
      <td class="label-ar">تاريخ إصدار التقرير</td>
    </tr>
    <tr>
      <td class="label-en">${d.nameLabelEn || 'Name'}</td>
      <td class="val-en-name">${d.nameEn || ''}</td>
      <td class="val-ar" dir="rtl">${d.nameAr || ''}</td>
      <td class="label-ar">${d.nameLabelAr || 'الاسم'}</td>
    </tr>
    <tr>
      <td class="label-en">National ID / Iqama</td>
      <td class="val-nid" colspan="2">${d.nationalId || ''}</td>
      <td class="label-ar">رقم الهوية/الاقامه</td>
    </tr>
    <tr>
      <td class="label-en">Nationality</td>
      <td class="val-en">${d.nationalityEn || 'Saudi Arabia'}</td>
      <td class="val-ar" dir="rtl">${d.nationalityAr || 'السعودية'}</td>
      <td class="label-ar">الجنسية</td>
    </tr>
    ${(d.relationEn || d.relationAr) ? `<tr>
      <td class="label-en">Relation</td>
      <td class="val-en">${d.relationEn || ''}</td>
      <td class="val-ar" dir="rtl">${d.relationAr || ''}</td>
      <td class="label-ar">صلة القرابة</td>
    </tr>` : ''}
    <tr>
      <td class="label-en">Employer</td>
      <td class="val-en">${d.employerEn || ''}</td>
      <td class="val-ar" dir="rtl">${d.employerAr || ''}</td>
      <td class="label-ar">جهة العمل</td>
    </tr>
    <tr>
      <td class="label-en">${d.docLabelEn || 'Practitioner Name'}</td>
      <td class="val-en-name">${d.doctorEn || ''}</td>
      <td class="val-ar" dir="rtl">${d.doctorAr || ''}</td>
      <td class="label-ar">${d.docLabelAr || 'اسم الممارس'}</td>
    </tr>
    <tr>
      <td class="label-en">Position</td>
      <td class="val-en">${d.positionEn || ''}</td>
      <td class="val-ar" dir="rtl">${d.positionAr || ''}</td>
      <td class="label-ar">المسمى الوظيفى</td>
    </tr>
  </table>
  </div>

  <!-- ===== FOOTER ===== -->
  <div style="margin-top:${footerMarginTop};">
    
    <!-- Top Footer Row: QR/Text | Divider | MOH/Hospital -->
    <div style="display:flex; justify-content:center; align-items:flex-start; min-height:165px;">
      
      <!-- Left: QR Code + Text (Top container 110px aligns text with hospital name) -->
      <div style="width:340px; display:flex; flex-direction:column; align-items:center; padding-right:15px;">
        <div style="height:110px; display:flex; align-items:flex-start; justify-content:center; padding-top:4px;">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=72x72&data=${encodeURIComponent(shortURL)}" style="width:72px;height:72px;">
        </div>
        <p style="font-size:11.5px;font-weight:bold;font-family:'Tajawal',sans-serif;text-align:center;margin:0 0 4px 0;line-height:1.4;">للتحقق من بيانات التقرير يرجى التأكد من زيارة موقع منصة صحة<br>الرسمي</p>
        <p style="font-size:9px;color:#222;font-weight:bold;text-align:center;margin:0 0 3px 0;font-style:italic; font-family: 'Arial', sans-serif;">To check the report please visit Seha's offical website</p>
        <p style="font-size:10px;font-weight:bold;text-align:center;margin:0;"><a href="${shortURL}" style="color:#0000EE;text-decoration:underline;">www.seha.sa/#/inquiries/slenquiry</a></p>
      </div>

      <!-- Center Vertical Divider -->
      <div style="width:2px; background-color:#cccccc; height:165px; margin-top: 5px;"></div>

      <!-- Right: MOH Logo & Hospital (Top container 110px aligns text with barcode text on exact same line) -->
      <div style="width:340px; display:flex; flex-direction:column; align-items:center; padding-left:25px;">
        <div style="height:110px; display:flex; align-items:flex-start; justify-content:center; padding-top:4px;">
          <img src="${d.hospitalLogoBase64 || mohLogo}" style="height:90px;object-fit:contain;">
        </div>
        <h3 style="font-size:13.5px;font-weight:bold;font-family:'Tajawal',sans-serif;margin:0 0 4px 0;color:#000;text-align:center;max-width:240px;word-wrap:break-word;line-height:1.4;">${d.hospitalAr || ''}</h3>
        <h4 style="font-size:11px;font-weight:bold;font-family:'Arial',sans-serif;margin:0 0 3px 0;color:#000;text-align:center;max-width:240px;word-wrap:break-word;line-height:1.4;">${d.hospitalEn || ''}</h4>
        ${d.licenseNumber ? `<p style="font-size:13px;font-weight:bold;color:#000;margin:0;">رقم الترخيص : ${d.licenseNumber}</p>` : ''}
      </div>

    </div>

    <!-- Bottom Footer Row: Time/Date & NHIC Logo (margin-right: -10px aligns NHIC to exact 30px page edge) -->
    <div style="display:flex; justify-content:space-between; align-items:flex-start; padding: 0; margin-top:8px; margin-right:-10px;">
      
      <!-- Left: Time / Date -->
      <div style="font-weight:bold;font-size:12px;color:#000;font-family:'Arial',sans-serif; padding-top:42px;">
        <p style="margin:0 0 26px 0; line-height:1.2;">${d.time || ''}</p>
        <p style="margin:0; line-height:1.2;">${d.dayDate || d.date || ''}</p>
      </div>

      <!-- Right: NHIC Logo -->
      <div style="display:flex; flex-direction:column; align-items:center;">
        <div style="width: 75px; height: 55px; overflow: hidden; position: relative; margin-bottom: 2px;">
          <img src="${nhicLogo}" style="width: 75px; height: 75px; position: absolute; top: 0; left: 0; object-fit: cover; object-position: top;">
        </div>
        <h4 style="font-size:11.5px; font-weight:bold; font-family:'Tajawal',sans-serif; color:#4ABABD; margin:0; line-height:1.2; text-align:center;">المركز الوطني للمعلومات الصحية</h4>
        <h5 style="font-size:7px; font-weight:bold; font-family:'Arial',sans-serif; color:#313473; margin:2px 0 0 0; line-height:1.2; text-align:center; letter-spacing:0.8px;">NATIONAL HEALTH INFORMATION CENTER</h5>
      </div>
      
    </div>
    
  </div>

  </div>
</div>
</body>
</html>`;

        
        addLog('Launching puppeteer...');
        const launchOptions = {
            headless: 'new',
            timeout: 90000,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none']
        };
        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        } else if (process.platform === 'win32') {
            const fsSync = require('fs');
            const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
            const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
            if (fsSync.existsSync(edgePath)) {
                launchOptions.executablePath = edgePath;
            } else if (fsSync.existsSync(chromePath)) {
                launchOptions.executablePath = chromePath;
            }
        }
        const browser = await puppeteer.launch(launchOptions);
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'load', timeout: 90000 });
        
        addLog('Generating PDF via Puppeteer...');
        const pdfResult = await page.pdf({
            printBackground: true,
            width: '794px',
            height: '1123px',
            pageRanges: '1'
        });
        await browser.close();
        
        // CRITICAL FIX: Puppeteer > v22 returns a Uint8Array instead of a Buffer.
        // node-telegram-bot-api (via request/form-data) attempts to deeply stringify Uint8Array
        // treating it as a standard object, causing 'Maximum call stack size exceeded' and crashing Node!
        // We MUST convert it back to a standard Node Buffer.
        const pdfBuffer = Buffer.isBuffer(pdfResult) ? pdfResult : Buffer.from(pdfResult);

        addLog('Sending PDF to Telegram...');
        const docCaption = d.titleAr ? `📄 ${d.titleAr} الخاص بك` : '📄 تقرير الإجازة المرضية الخاص بك';
        const docFileName = filename || (d.type === 'companion' ? 'Patient_Companion_Report.pdf' : (d.type === 'companion_review' ? 'Companion_Attendance_Certificate.pdf' : 'sickLeaves.pdf'));
        let message;
        try {
            message = await bot.sendDocument(chatId, pdfBuffer, {
                caption: docCaption
            }, {
                filename: docFileName,
                contentType: 'application/pdf'
            });
        } catch (sendErr) {
            console.warn('Telegram send failed in generate-native-pdf:', sendErr.message);
            if (process.env.NODE_ENV === 'test') {
                message = { document: { file_id: 'test_file_id_' + Date.now() } };
            } else {
                throw sendErr;
            }
        }
        
        // Atomic Points Deduction & Transaction Logging (Rule 1 & Rule 14)
        if (!isUpdate && pointsToDeduct > 0) {
            await dataManager.updateSubscriber(chatIdStr, (u) => {
                u.points = Math.max(0, (u.points || 0) - pointsToDeduct);
                u.balance_points = u.points;
                return u;
            });
            await dataManager.logTransaction({
                admin_chat_id: 'system',
                target_chat_id: chatIdStr,
                operation: 'report_deduction',
                amount: pointsToDeduct,
                previous_value: userSub.points,
                new_value: userSub.points - pointsToDeduct,
                details: `خصم ${pointsToDeduct} نقاط لإصدار تقرير ${currentRepId}`
            });
        } else if (!isUpdate) {
            await dataManager.logTransaction({
                admin_chat_id: 'system',
                target_chat_id: chatIdStr,
                operation: 'report_created',
                amount: 0,
                new_value: 'unlimited',
                details: `إصدار تقرير ${currentRepId} (اشتراك غير محدود)`
            });
        }

        // Persist report permanently into dataManager (reports.json)
        const savedReport = await dataManager.saveReport({
            id: currentRepId,
            report_id: currentRepId,
            chat_id: chatIdStr,
            username: userSub.username,
            patient_name: d.nameAr || d.patient_name_ar || ((d.type === 'companion' || d.type === 'companion_review') ? d.escort_name_ar : ''),
            national_id: d.nationalId || d.national_id || '',
            issue_date: d.issueDate || d.issue_date || new Date().toISOString().slice(0, 10),
            issue_time: d.issueTime || d.issue_time || '',
            type: d.type || 'sick',
            service_code: sanitizedLeaveId,
            inquiry_url: shortURL,
            short_url: shortURL,
            payment_type: pointsToDeduct > 0 ? 'points' : 'unlimited',
            points_deducted: pointsToDeduct,
            pdf_ref: message.document?.file_id,
            file_id: message.document?.file_id,
            status: 'issued',
            data: {
                admission_date: d.startDate || d.admission_date,
                discharge_date: d.endDate || d.discharge_date,
                duration: d.duration || '1',
                issue_date: d.issueDate || d.issue_date,
                issue_time: d.issueTime || d.issue_time,
                national_id: d.nationalId || d.national_id,
                patient_name_ar: d.nameAr || d.patient_name_ar,
                patient_name_en: d.nameEn || d.patient_name_en,
                escort_name_ar: d.escort_name_ar || '',
                escort_name_en: d.escort_name_en || '',
                relation_ar: d.relation_ar || '',
                relation_en: d.relation_en || '',
                doctor_name_ar: d.docNameAr || d.doctor_name_ar,
                doctor_name_en: d.docNameEn || d.doctor_name_en,
                job_title_ar: d.positionAr || d.job_title_ar,
                job_title_en: d.positionEn || d.job_title_en,
                hospital_ar: d.hospitalAr || d.hospital_ar,
                hospital_en: d.hospitalEn || d.hospital_en,
                hospital_type: d.hospitalType || d.hospital_type,
                license_number: d.licenseNumber || d.license_number,
                leaveId: sanitizedLeaveId,
                service_code: sanitizedLeaveId,
                short_url: shortURL
            }
        });

        // Forward to channel for backup if configured
        if (typeof CHANNEL_ID !== 'undefined' && CHANNEL_ID && message.document?.file_id) {
            try {
                await bot.sendDocument(CHANNEL_ID, message.document.file_id);
            } catch (chanErr) {
                console.warn('Channel backup forward skipped:', chanErr.message);
            }
        }

        const updatedUser = await dataManager.getSubscriber(chatIdStr);
        res.json({
            success: true,
            fileId: message.document.file_id,
            reportId: currentRepId,
            serviceCode: sanitizedLeaveId,
            shortURL: shortURL,
            points: updatedUser.points,
            daysRemaining: updatedUser.daysRemaining,
            report: savedReport
        });

    } catch (err) {
        addLog(`Error generating HTML for PDF: ${err.message}`);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 6.5 Send Client-Generated PDF
app.post('/api/send-generated-pdf', async (req, res) => {
    try {
        const { chatId, pdfBase64, filename, reportId } = req.body;
        if (!chatId || !pdfBase64) return res.status(400).json({ error: 'Missing data' });
        
        const base64Data = pdfBase64.includes(',') ? pdfBase64.split(',').pop() : pdfBase64;
        const pdfBuffer = Buffer.from(base64Data, 'base64');
        
        const message = await bot.sendDocument(chatId, pdfBuffer, {
            caption: '📄 تقرير الإجازة المرضية الخاص بك'
        }, {
            filename: filename || 'sickLeaves.pdf',
            contentType: 'application/pdf'
        });
        
        addLog(`Telegram sent generated doc successfully. fileId: ${message.document?.file_id}`);
        const fileId = message.document?.file_id;
        
        if (fileId && reportId) {
            const data = await loadLocalSubscriptions();
            const userSub = data.subscriptions[chatId.toString()];
            if (userSub && userSub.reports) {
                const report = userSub.reports.find(r => r.id === reportId);
                if (report) {
                    report.fileId = fileId;
                    userSub.updatedAt = new Date().toISOString();
                    await saveLocalSubscriptions(data);
                }
            }
            
            if (typeof CHANNEL_ID !== 'undefined' && CHANNEL_ID) {
                try {
                    await bot.sendDocument(CHANNEL_ID, fileId);
                } catch (err) {
                    addLog('Could not forward to Telegram Channel: ' + err.message);
                }
            }
        }
        
        res.json({ success: true, fileId });
    } catch (err) {
        console.error('Error sending generated PDF:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/logs', (req, res) => {
    if (req.query.msg) {
        addLog(`CLIENT LOG: ${req.query.msg}`);
    }
    res.json(appLogs);
});


// 6. Send Existing PDF via file_id
app.post('/api/send-existing-pdf', async (req, res) => {
    try {
        const { chatId, reportId } = req.body;
        const data = await loadLocalSubscriptions();
        const userSub = data.subscriptions[chatId.toString()];
        if (!userSub || !userSub.reports) {
            return res.status(404).json({ success: false, error: 'User or reports not found' });
        }
        
        const report = userSub.reports.find(r => r.id === reportId);
        if (!report) {
            return res.status(404).json({ success: false, error: 'Report not found' });
        }
        
        if (!report.fileId) {
            return res.status(400).json({ success: false, error: 'No PDF generated for this report yet.' });
        }
        
        await bot.sendDocument(chatId, report.fileId);
        res.json({ success: true });
    } catch (err) {
        console.error('Error sending existing PDF:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 7. Public Verify Endpoint
app.get('/api/verify', async (req, res) => {
    try {
        const { id, nid } = req.query;
        const data = await loadLocalSubscriptions();
        
        let foundReport = null;
        for (const user of Object.values(data.subscriptions)) {
            if (user.reports) {
                const report = user.reports.find(r => r.id === id && r.nationalId === nid);
                if (report) {
                    foundReport = report;
                    break;
                }
            }
        }
        
        if (foundReport) {
            res.json({ success: true, report: foundReport });
        } else {
            res.json({ success: false, error: 'Not found' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Sync all reports in database to Short.io and configure domain redirects
const syncAllReportsToShortIo = async () => {
    if (!shortIoService.isConfigured()) {
        console.log('[ShortIoService] Startup sync skipped: SHORTIO_API_KEY not configured');
        return { success: false, reason: 'SHORTIO_API_KEY not configured' };
    }
    try {
        const inquiryUrl = `${WEB_APP_URL}/inquiries/slenquiry`;
        
        // 1. Auto-configure root and 404 redirects on Short.io custom domain
        const domainConfigRes = await shortIoService.configureDomainRedirects(inquiryUrl).catch(e => ({ success: false, error: e.message }));
        console.log('[ShortIoService] Domain redirects configured:', domainConfigRes);

        // 2. Scan database and ensure every existing report has a valid short link
        let syncedCount = 0;
        let checkedCount = 0;
        await withDbLock(async () => {
            const data = await loadLocalSubscriptions();
            let changed = false;

            for (const chatId of Object.keys(data.subscriptions || {})) {
                const user = data.subscriptions[chatId];
                if (user && Array.isArray(user.reports)) {
                    for (const rep of user.reports) {
                        checkedCount++;
                        const leaveId = shortIoService.sanitizePath(rep.id || (rep.data && (rep.data.leaveId || rep.data.service_code)));
                        if (leaveId) {
                            try {
                                const originalInquiryUrl = `${WEB_APP_URL}/inquiries/slenquiry?id=${encodeURIComponent(leaveId)}`;
                                const shortRes = await shortIoService.createShortLink({
                                    originalURL: originalInquiryUrl,
                                    path: leaveId,
                                    allowDuplicates: false
                                });
                                if (shortRes && shortRes.shortURL && (!rep.shortURL || rep.shortURL !== shortRes.shortURL)) {
                                    rep.shortURL = shortRes.shortURL;
                                    if (rep.data) {
                                        rep.data.short_url = shortRes.shortURL;
                                        rep.data.leaveId = rep.data.leaveId || leaveId;
                                        rep.data.service_code = rep.data.service_code || leaveId;
                                    }
                                    changed = true;
                                    syncedCount++;
                                    console.log(`[ShortIoService] Synced report ${leaveId} -> ${shortRes.shortURL}`);
                                }
                            } catch (e) {
                                console.warn(`[ShortIoService] Could not sync report ${leaveId}:`, e.message);
                            }
                        }
                    }
                }
            }

            if (changed) {
                await saveLocalSubscriptions(data);
                console.log(`[ShortIoService] Synced and saved ${syncedCount} reports to local database.`);
            }
        });

        return {
            success: true,
            domainConfig: domainConfigRes,
            reportsChecked: checkedCount,
            reportsSynced: syncedCount
        };
    } catch (err) {
        console.warn('[ShortIoService] Error during sync:', err.message);
        return { success: false, error: err.message };
    }
};

// Endpoint to trigger manual sync of all reports & domain redirects
app.get('/api/shortio/sync', async (req, res) => {
    try {
        const result = await syncAllReportsToShortIo();
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Diagnostic endpoint for Short.io
app.get('/api/shortio/debug', async (req, res) => {
    const key = shortIoService.getApiKey();
    const domain = shortIoService.getDomain();
    
    if (!key) {
        const existingEnvKeys = Object.keys(process.env).filter(k => 
            k.toUpperCase().includes('SHORT') || 
            k.toUpperCase().includes('KEY') || 
            k.toUpperCase().includes('IO') ||
            k.toUpperCase().includes('TOKEN')
        );
        return res.json({
            status: 'MISSING_KEY',
            message: 'SHORTIO_API_KEY is not defined in environment variables on this server',
            matchingEnvKeysFound: existingEnvKeys
        });
    }

    try {
        const testPath = (req.query.path ? shortIoService.sanitizePath(req.query.path) : null) || ('T' + Math.random().toString(36).substring(2, 7).toUpperCase());
        const response = await fetch('https://api.short.io/links', {
            method: 'POST',
            headers: {
                'Authorization': key,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                domain: domain,
                originalURL: `${WEB_APP_URL}/inquiries/slenquiry?id=${testPath}`,
                path: testPath,
                allowDuplicates: true
            })
        });

        const status = response.status;
        const text = await response.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch(e) { parsed = text; }

        const domains = await shortIoService.getDomains().catch(() => []);

        res.json({
            keyConfigured: true,
            keyLength: key.length,
            keyPrefix: key.substring(0, 4) + '***' + key.substring(key.length - 2),
            domain: domain,
            domainsInAccount: domains.map(d => ({ id: d.id, domain: d.hostname || d.domain, rootRedirect: d.rootRedirect, notFoundRedirect: d.notFoundRedirect })),
            shortIoHttpStatus: status,
            shortIoResponse: parsed
        });
    } catch (err) {
        res.json({
            status: 'ERROR',
            error: err.message
        });
    }
});

// Direct Slug Redirect Route (e.g. /B82LM4 -> /inquiries/slenquiry?id=B82LM4)
app.get('/:slug([A-Za-z0-9_-]{4,32})', (req, res, next) => {
    const rawSlug = req.params.slug;
    const slug = shortIoService.sanitizePath(rawSlug);
    const reservedRoutes = ['api', 'admin', 'assets', 'verify', 'inquiry', 'inquiries', 'setup', 'health', 'slenquiry', 'favicon.ico'];
    if (slug && !rawSlug.includes('.') && !reservedRoutes.includes(rawSlug.toLowerCase())) {
        return res.redirect(`/inquiries/slenquiry?id=${encodeURIComponent(slug)}`);
    }
    next();
});

// Direct Telegram Webhook Handler (Top-level Registration)
app.post(`/webhook/${TOKEN}`, (req, res) => {
    try {
        bot.processUpdate(req.body);
        res.sendStatus(200);
    } catch (e) {
        console.error('Webhook processing error:', e.message);
        res.sendStatus(500);
    }
});

// Background Task Scheduler (Rule 24, Rule 29, Rule 30)
let schedulerInterval = null;
const startBackgroundScheduler = () => {
    if (schedulerInterval) return;
    const fsSync = require('fs');
    schedulerInterval = setInterval(async () => {
        try {
            // Clean up orphaned .tmp files in data directory older than 15 minutes
            const dataDir = dataManager.baseDir;
            if (fsSync.existsSync(dataDir)) {
                const files = await fs.readdir(dataDir);
                const now = Date.now();
                for (const f of files) {
                    if (f.endsWith('.tmp')) {
                        const fp = path.join(dataDir, f);
                        try {
                            const stat = await fs.stat(fp);
                            if (now - stat.mtimeMs > 15 * 60 * 1000) {
                                await fs.unlink(fp);
                                console.log(`[Scheduler] Cleaned orphaned temp file: ${f}`);
                            }
                        } catch (e) {}
                    }
                }
            }
        } catch (schedErr) {
            console.warn('[Scheduler] Periodic maintenance notice:', schedErr.message);
        }
    }, 60000);
    if (schedulerInterval.unref) schedulerInterval.unref();
    console.log('✓ Background scheduler running (every 60s)');
};

// Ensure SPA routes always return index.html instead of Not Found
app.get('*', (req, res) => {
    if (req.path.startsWith('/api') || req.path.startsWith(`/webhook/${TOKEN}`)) {
        return res.status(404).json({ success: false, error: 'Route not found' });
    }
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Set Telegram Chat Menu Button (Open button)
const configureChatMenuButton = async (targetChatId = null) => {
    try {
        const https = require('https');
        const sendReq = (chatIdVal = null) => {
            const bodyObj = {
                menu_button: {
                    type: 'web_app',
                    text: 'Open', web_app: { url: WEB_APP_URL_CACHED }
                }
            };
            if (chatIdVal) {
                bodyObj.chat_id = chatIdVal.toString();
            }
            const payload = JSON.stringify(bodyObj);

            return new Promise((resolve) => {
                const req = https.request({
                    hostname: 'api.telegram.org',
                    path: `/bot${TOKEN}/setChatMenuButton`,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payload)
                    }
                }, (res) => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => {
                        try {
                            const parsed = JSON.parse(body);
                            if (parsed.ok) {
                                console.log(`✓ Bot Menu Button "Open" set to: ${WEB_APP_URL}${chatIdVal ? ' for chat ' + chatIdVal : ' (default)'}`);
                            }
                        } catch (e) {}
                        resolve();
                    });
                });
                req.on('error', resolve);
                req.write(payload);
                req.end();
            });
        };

        if (targetChatId) {
            await sendReq(targetChatId);
        }
        await sendReq(null);
    } catch (e) {
        console.warn('Could not set ChatMenuButton:', e.message);
    }
};

// Start Server
const startServer = async () => {
    try {
        // 1. Initialize Persistent Data Storage & Safe Migration
        await dataManager.init();
        await bootstrapOwnerAccount();
        startBackgroundScheduler();

        // 2. Start HTTP Server immediately so Render health check & port detector pass
        const srv = await new Promise((resolve) => {
            const serverInstance = app.listen(PORT, () => {
                console.log(`\n=== SEHA Sick Leave App ===`);
                console.log(`✓ Server running at http://localhost:${PORT}`);
                console.log(`✓ WEB_APP_URL = ${WEB_APP_URL}`);
                console.log(`✓ Bot mode: ${isProduction ? 'Webhook (Production/Render)' : 'Polling (Local)'}`);
                console.log(`✓ Database: Persistent DataManager\n`);
                resolve(serverInstance);
            });
        });

        // 3. Configure Webhook safely (does not abort server if Telegram has a temporary error)
        if (isProduction) {
            try {
                const webhookUrl = `${WEB_APP_URL}/webhook/${TOKEN}`;
                await bot.setWebHook(webhookUrl);
                console.log(`✓ Webhook set to: ${webhookUrl}`);
            } catch (whErr) {
                console.warn('⚠️ Webhook setup notice:', whErr.message);
            }
        }

        // 4. Configure Open menu button safely
        try {
            await configureChatMenuButton();
        } catch (mbErr) {
            console.warn('⚠️ ChatMenuButton setup notice:', mbErr.message);
        }

        return srv;
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
};

// Manual setup endpoint - visit /setup to re-configure webhook & menu button (admin use)
app.get('/setup', async (req, res) => {
    try {
        await configureChatMenuButton();
        if (isProduction) {
            const webhookUrl = `${WEB_APP_URL}/webhook/${TOKEN}`;
            await bot.setWebHook(webhookUrl);
            res.json({
                success: true,
                message: `Webhook and Menu Button configured successfully`,
                webhookUrl,
                webAppUrl: WEB_APP_URL_CACHED
            });
        } else {
            res.json({
                success: true,
                message: 'Menu Button configured (local polling mode)',
                webAppUrl: WEB_APP_URL_CACHED
            });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Start server and bootstrap Owner
const serverPromise = startServer().then(async (srv) => {
    try {
        await bootstrapOwnerAccount();
        syncAllReportsToShortIo().catch(e => console.warn('Startup Short.io sync error:', e.message));
    } catch (e) {
        console.error('Owner bootstrap error:', e.message);
    }
    return srv;
});

module.exports = { app, startServer, serverPromise, bootstrapOwnerAccount };
