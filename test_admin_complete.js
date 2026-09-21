
// SECURITY: admin token comes from the environment (never hardcoded).
// ENV_CHECK: set ADMIN_MASTER_TOKEN before running this script.
const http = require('http');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.PORT = '3099';
const TEST_OWNER_ID = process.env.TEST_OWNER_ID || '100000000';
const TEST_OWNER_USERNAME = process.env.TEST_OWNER_USERNAME || 'test_admin';
process.env.ADMIN_CHAT_ID = TEST_OWNER_ID;
process.env.ADMIN_USERNAME = TEST_OWNER_USERNAME;
process.env.WEB_APP_URL = 'http://localhost:3099';

// Import server
const { serverPromise } = require('./server.js');

const ADMIN_TOKEN = (process.env.ADMIN_MASTER_TOKEN || '');
const BASE_URL = 'http://localhost:3099';

const request = (method, endpoint, body = null, headers = {}) => {
    return new Promise((resolve, reject) => {
        const url = new URL(endpoint, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        });

        req.on('error', reject);
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
};

const runTests = async () => {
    console.log('======================================================================');
    console.log('🚀 STARTING COMPREHENSIVE PRODUCTION ADMIN DASHBOARD TESTS');
    console.log('======================================================================\n');

    let passed = 0;
    let failed = 0;

    const assert = (condition, title) => {
        if (condition) {
            console.log(`  ✅ PASS: ${title}`);
            passed++;
        } else {
            console.error(`  ❌ FAIL: ${title}`);
            failed++;
        }
    };

    await serverPromise;
    await new Promise(r => setTimeout(r, 500));

    try {
        console.log('--- TEST GROUP 1: OWNER ACCOUNT INTEGRITY ---');
        const dbPath = path.join(__dirname, 'subscriptions.json');
        const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        const owner = dbData.subscriptions[TEST_OWNER_ID];

        assert(owner !== undefined, `Owner account ${TEST_OWNER_ID} exists in subscriptions.json`);
        assert(owner.username.toLowerCase() === TEST_OWNER_USERNAME, `Owner username is ${TEST_OWNER_USERNAME}`);
        assert(owner.status === 'active', 'Owner status is active');
        assert(owner.subscriptionDays >= 365, `Owner subscriptionDays is >= 365 (actual: ${owner.subscriptionDays})`);
        assert(owner.points >= 10000, `Owner points is >= 10000 (actual: ${owner.points})`);
        assert(owner.report_payment_source === 'unlimited', 'Owner payment source is unlimited');
        assert(owner.plan === 'unlimited', 'Owner plan is unlimited');

        console.log('\n--- TEST GROUP 2: SECURITY & AUTHENTICATION ---');
        const noAuth = await request('GET', '/api/admin/web/stats');
        assert(noAuth.status === 401, 'Unauthorized request to /api/admin/web/stats returns 401');

        const badAuth = await request('GET', '/api/admin/web/stats', null, { 'x-admin-token': 'INVALID_TOKEN' });
        assert(badAuth.status === 401, 'Invalid token to /api/admin/web/stats returns 401');

        const goodAuth = await request('GET', '/api/admin/web/stats', null, { 'x-admin-token': ADMIN_TOKEN });
        assert(goodAuth.status === 200 && goodAuth.data.success === true, 'Authorized request with admin token returns 200');

        console.log('\n--- TEST GROUP 3: 8 STATISTICS METRICS ---');
        const stats = goodAuth.data.stats;
        assert(stats.totalSubscribers >= 1, `Total subscribers metric: ${stats.totalSubscribers}`);
        assert(stats.activeSubscribers >= 1, `Active subscribers metric: ${stats.activeSubscribers}`);
        assert(typeof stats.suspendedSubscribers === 'number', `Suspended subscribers metric: ${stats.suspendedSubscribers}`);
        assert(typeof stats.expiredSubscribers === 'number', `Expired/cancelled metric: ${stats.expiredSubscribers}`);
        assert(typeof stats.totalReports === 'number', `Total reports metric: ${stats.totalReports}`);
        assert(stats.totalPoints >= 10000, `Total points metric: ${stats.totalPoints}`);
        assert(typeof stats.pointsSubscribers === 'number', `Points subscribers metric: ${stats.pointsSubscribers}`);
        assert(stats.unlimitedSubscribers >= 1, `Unlimited subscribers metric: ${stats.unlimitedSubscribers}`);

        console.log('\n--- TEST GROUP 4: SUBSCRIBER CREATION & DUPLICATE BLOCKING ---');
        const testChatId = '999888777';
        const addRes = await request('POST', '/api/admin/web/user/add', {
            chatId: testChatId,
            username: 'test_auto_user',
            name: 'مستخدم تجريبي',
            subscriptionDays: 30,
            plan: 'points',
            balance_points: 50,
            report_payment_source: 'points'
        }, { 'x-admin-token': ADMIN_TOKEN });

        assert(addRes.status === 200 && addRes.data.success === true, 'Successfully added test subscriber 999888777');
        assert(addRes.data.user.points === 50, 'Initial points is 50');
        assert(addRes.data.user.subscriptionDays === 30, 'Initial days is 30');
        assert(addRes.data.user.report_payment_source === 'points', 'Initial payment source is points');

        const dupRes = await request('POST', '/api/admin/web/user/add', {
            chatId: testChatId,
            username: 'test_auto_user',
            subscriptionDays: 30
        }, { 'x-admin-token': ADMIN_TOKEN });
        assert(dupRes.status === 400 && dupRes.data.success === false, 'Duplicate Chat ID correctly rejected with 400');

        console.log('\n--- TEST GROUP 5: POINTS MANAGEMENT & NEGATIVE BALANCE GUARD ---');
        const addPtsRes = await request('POST', '/api/admin/web/user/update', {
            chatId: testChatId,
            action: 'add_points',
            amount: 100
        }, { 'x-admin-token': ADMIN_TOKEN });
        assert(addPtsRes.data.success === true && addPtsRes.data.user.points === 150, 'Added 100 points: balance updated to 150');

        const excessiveRes = await request('POST', '/api/admin/web/user/update', {
            chatId: testChatId,
            action: 'remove_points',
            amount: 200
        }, { 'x-admin-token': ADMIN_TOKEN });
        assert(excessiveRes.status === 400 && excessiveRes.data.success === false, 'Excessive points deduction correctly rejected');

        const validDedRes = await request('POST', '/api/admin/web/user/update', {
            chatId: testChatId,
            action: 'remove_points',
            amount: 50
        }, { 'x-admin-token': ADMIN_TOKEN });
        assert(validDedRes.data.success === true && validDedRes.data.user.points === 100, 'Deducted 50 points: balance updated to 100');

        console.log('\n--- TEST GROUP 6: PAYMENT SOURCE TOGGLE ---');
        const setUnlRes = await request('POST', '/api/admin/web/user/update', {
            chatId: testChatId,
            action: 'set_payment_source',
            paymentSource: 'unlimited'
        }, { 'x-admin-token': ADMIN_TOKEN });
        assert(setUnlRes.data.user.report_payment_source === 'unlimited', 'Payment source set to unlimited');

        const setPtsRes = await request('POST', '/api/admin/web/user/update', {
            chatId: testChatId,
            action: 'set_payment_source',
            paymentSource: 'points'
        }, { 'x-admin-token': ADMIN_TOKEN });
        assert(setPtsRes.data.user.report_payment_source === 'points', 'Payment source set to points');

        console.log('\n--- TEST GROUP 7: STATUS TOGGLE & RENEWAL ---');
        const suspRes = await request('POST', '/api/admin/web/user/update', {
            chatId: testChatId,
            action: 'set_status',
            status: 'suspended'
        }, { 'x-admin-token': ADMIN_TOKEN });
        assert(suspRes.data.user.status === 'suspended', 'User status set to suspended');

        const blockedReportRes = await request('POST', '/api/generate-native-pdf', {
            chatId: testChatId,
            reportData: { id: 'test_rep_1', leaveId: 'SL12345' }
        });
        assert(blockedReportRes.status === 403, 'Report generation blocked for suspended user with 403');

        const actRes = await request('POST', '/api/admin/web/user/update', {
            chatId: testChatId,
            action: 'set_status',
            status: 'active'
        }, { 'x-admin-token': ADMIN_TOKEN });
        assert(actRes.data.user.status === 'active', 'User status reactivated to active');

        const renewRes = await request('POST', '/api/admin/web/user/update', {
            chatId: testChatId,
            action: 'renew',
            days: 30
        }, { 'x-admin-token': ADMIN_TOKEN });
        assert(renewRes.data.success === true && renewRes.data.user.daysRemaining >= 59, 'Subscription renewed by 30 days');

        console.log('\n--- TEST GROUP 8: CANCELLATION & AUDIT PERSISTENCE ---');
        const cancelRes = await request('POST', '/api/admin/web/user/update', {
            chatId: testChatId,
            action: 'cancel'
        }, { 'x-admin-token': ADMIN_TOKEN });
        assert(cancelRes.data.success === true && cancelRes.data.user.status === 'cancelled', 'User cancelled: status is cancelled');

        const allUsersRes = await request('GET', '/api/admin/web/users', null, { 'x-admin-token': ADMIN_TOKEN });
        const foundCancelled = allUsersRes.data.users.find(u => u.chatId === testChatId);
        assert(foundCancelled !== undefined && foundCancelled.status === 'cancelled', 'Cancelled user remains in database and searchable');

        console.log('\n--- TEST GROUP 9: TRANSACTION AUDIT LOGS ---');
        const logsRes = await request('GET', `/api/admin/web/user/${testChatId}/logs`, null, { 'x-admin-token': ADMIN_TOKEN });
        assert(logsRes.data.success === true && logsRes.data.logs.length >= 5, `Audit log recorded ${logsRes.data.logs.length} operations`);
        const opTypes = logsRes.data.logs.map(l => l.operation);
        assert(opTypes.includes('add_user'), 'Audit log contains add_user');
        assert(opTypes.includes('add_points'), 'Audit log contains add_points');
        assert(opTypes.includes('remove_points'), 'Audit log contains remove_points');
        assert(opTypes.includes('payment_source_changed'), 'Audit log contains payment_source_changed');
        assert(opTypes.includes('subscription_cancel'), 'Audit log contains subscription_cancel');

        console.log('\n--- TEST GROUP 10: CLEANUP & FINAL INTEGRITY ---');
        const finalDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        delete finalDb.subscriptions[testChatId];
        finalDb.transactions = finalDb.transactions.filter(tx => tx.target_chat_id !== testChatId);
        fs.writeFileSync(dbPath, JSON.stringify(finalDb, null, 2), 'utf8');

        const finalOwner = finalDb.subscriptions[TEST_OWNER_ID];
        assert(finalOwner.points >= 10000, 'Owner points verified at 10,000+ points');
        assert(finalOwner.status === 'active', 'Owner status verified active');
        assert(finalOwner.report_payment_source === 'unlimited', 'Owner payment source verified unlimited');

        console.log('\n======================================================================');
        console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
        console.log('======================================================================');

        process.exit(failed > 0 ? 1 : 0);
    } catch (err) {
        console.error('Unexpected test failure:', err);
        process.exit(1);
    }
};

runTests();
