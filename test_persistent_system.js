
// SECURITY: admin token comes from the environment (never hardcoded).
// ENV_CHECK: set ADMIN_MASTER_TOKEN before running this script.
const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.PORT = '3099';
const TEST_OWNER_ID = process.env.TEST_OWNER_ID || '100000000';
const TEST_OWNER_USERNAME = process.env.TEST_OWNER_USERNAME || 'test_admin';
process.env.ADMIN_CHAT_ID = TEST_OWNER_ID;
process.env.ADMIN_USERNAME = TEST_OWNER_USERNAME;
process.env.WEB_APP_URL = 'http://localhost:3099';

const { serverPromise, bootstrapOwnerAccount } = require('./server.js');
const { dataManager, OWNER_CHAT_ID, OWNER_USERNAME, normalizeSubscription, getRemainingDays } = require('./dataManager');

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
                    resolve({ status: res.statusCode, data: parsed, headers: res.headers });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: data, headers: res.headers });
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

async function runPersistentSystemTests() {
    console.log('======================================================================');
    console.log('🛡️ RUNNING COMPREHENSIVE PERSISTENT SYSTEM & REAL-TIME TESTS');
    console.log('======================================================================\n');

    await serverPromise;
    await new Promise(r => setTimeout(r, 600));

    let passed = 0;
    let failed = 0;

    const testAssert = (cond, name, detail = '') => {
        if (cond) {
            console.log(`  ✅ PASS: ${name}`);
            passed++;
        } else {
            console.error(`  ❌ FAIL: ${name} ${detail ? '(' + detail + ')' : ''}`);
            failed++;
        }
    };

    try {
        // --- 1. MIGRATION INTEGRITY & PRE-METRICS ---
        console.log('--- TEST GROUP 1: MIGRATION INTEGRITY & PRE-METRICS MATCH (Rule 2 & 3) ---');
        const preMetricsFile = path.join(__dirname, 'migration_pre_metrics.json');
        assert.ok(fs.existsSync(preMetricsFile), 'Pre-metrics file must exist');
        const pre = JSON.parse(fs.readFileSync(preMetricsFile, 'utf8'));

        const metadata = await dataManager.getMetadata();
        const metrics = metadata.metrics || {};
        testAssert(metadata.migration_version >= 1, 'Migration version is 1 or higher');
        testAssert(metrics.subscribers === pre.subscribersBefore, `Subscribers match: ${metrics.subscribers} === ${pre.subscribersBefore}`);
        testAssert(metrics.reports === pre.reportsBefore, `Reports match: ${metrics.reports} === ${pre.reportsBefore}`);
        testAssert(metrics.transactions === pre.transactionsBefore, `Transactions match: ${metrics.transactions} === ${pre.transactionsBefore}`);
        testAssert(metrics.points === pre.pointsBefore, `Points match: ${metrics.points} === ${pre.pointsBefore}`);

        // Post metrics verification
        const currentSubs = await dataManager.getAllSubscribers();
        let totalCurrentPoints = 0;
        let totalCurrentReports = 0;
        for (const s of currentSubs) {
            totalCurrentPoints += Number(s.points || 0);
            totalCurrentReports += (s.reportsCount || (Array.isArray(s.reports) ? s.reports.length : 0));
        }
        testAssert(currentSubs.length >= metrics.subscribers, `Subscribers count preserved: ${currentSubs.length} >= ${metrics.subscribers}`);
        testAssert(totalCurrentPoints >= metrics.points, `Total points preserved: ${totalCurrentPoints} >= ${metrics.points}`);

        // --- 2. OWNER ACCOUNT PRESERVATION ---
        console.log('\n--- TEST GROUP 2: OWNER ACCOUNT STRICT PRESERVATION (Rule 4 & 5) ---');
        const owner = await dataManager.getSubscriber(OWNER_CHAT_ID);
        testAssert(owner !== null, 'Owner account exists in persistent storage');
        testAssert(String(owner.chatId) === TEST_OWNER_ID, `Owner Chat ID is strictly ${TEST_OWNER_ID}`);
        testAssert(owner.username?.toLowerCase() === TEST_OWNER_USERNAME, `Owner username is strictly @${TEST_OWNER_USERNAME}`);
        testAssert(owner.status === 'active', `Owner status is strictly active (got: ${owner.status})`);
        testAssert(owner.points === 10000, `Owner points strictly 10,000 (got: ${owner.points})`);
        testAssert(owner.daysRemaining >= 360, `Owner remaining days strictly >= 360 (got: ${owner.daysRemaining})`);
        testAssert(owner.report_payment_source === 'unlimited', `Owner payment source is unlimited (got: ${owner.report_payment_source})`);

        // --- 3. DYNAMIC UTC REMAINING DAYS CALCULATION ---
        console.log('\n--- TEST GROUP 3: DYNAMIC UTC REMAINING DAYS CALCULATION (Rule 6) ---');
        const now = new Date();
        const endIn30Days = new Date(now.getTime() + 30 * 86400000);
        const calcDays = getRemainingDays(endIn30Days.toISOString(), now);
        testAssert(calcDays === 30, `Remaining days calculated dynamically: 30 days expected, got ${calcDays}`);

        const endYesterday = new Date(now.getTime() - 86400000);
        const expiredDays = getRemainingDays(endYesterday.toISOString(), now);
        testAssert(expiredDays === 0, `Expired subscription calculates to 0 days (got: ${expiredDays})`);

        // --- 4. DATA SECURITY & ROUTE PROTECTION ---
        console.log('\n--- TEST GROUP 4: DATA SECURITY & FILE ACCESS PROTECTION (Rule 18 & 39) ---');
        const resRootDb = await request('GET', '/subscriptions.json');
        testAssert(resRootDb.status === 403, 'GET /subscriptions.json returns 403 Forbidden');

        const resDataDir = await request('GET', '/data/subscriptions.json');
        testAssert(resDataDir.status === 403, 'GET /data/subscriptions.json returns 403 Forbidden');

        const resReportsDb = await request('GET', '/data/reports.json');
        testAssert(resReportsDb.status === 403, 'GET /data/reports.json returns 403 Forbidden');

        // --- 5. SUBSCRIBER REPORT ISOLATION ---
        console.log('\n--- TEST GROUP 5: SUBSCRIBER REPORT ISOLATION & CACHE CONTROL (Rule 3, 22, 23) ---');
        const resUserApi = await request('GET', `/api/user/${OWNER_CHAT_ID}`);
        testAssert(resUserApi.status === 200, 'GET /api/user/:chatId returns 200');
        testAssert(resUserApi.data.user.points === 10000, 'API returns correct points for user');
        testAssert(resUserApi.headers['cache-control']?.includes('no-store'), 'GET /api/user/:chatId includes Cache-Control: no-store');

        const resUserReports = await request('GET', `/api/user/${OWNER_CHAT_ID}/reports`);
        testAssert(resUserReports.status === 200, 'GET /api/user/:chatId/reports returns 200');
        testAssert(Array.isArray(resUserReports.data.reports), 'User reports returned as array');
        testAssert(resUserReports.headers['cache-control']?.includes('no-store'), 'GET /api/user/:chatId/reports includes Cache-Control: no-store');

        // Isolation: Random user gets only their own empty reports
        const randomChatId = '9876543210';
        const resIsolated = await request('GET', `/api/user/${randomChatId}/reports`);
        testAssert(resIsolated.data.reports.length === 0, 'Isolated user cannot view other users reports');

        // --- 6. ATOMIC PDF GENERATION & DEDUCTION ---
        console.log('\n--- TEST GROUP 6: ATOMIC PDF GENERATION & NO OVER-DEDUCTION (Rule 1, 14, 15) ---');
        // Create a test subscriber with 20 points
        const testUserChatId = '7771234567';
        await dataManager.saveSubscriber(testUserChatId, {
            chatId: testUserChatId,
            username: 'point_tester',
            name: 'Point Tester',
            status: 'active',
            plan: 'points',
            report_payment_source: 'points',
            points: 20,
            balance_points: 20,
            subscriptionDays: 0,
            subscription_start_at: null,
            subscription_end_at: null
        });

        const testReportId = 'TEST_REP_' + Date.now();
        const genRes = await request('POST', '/api/generate-native-pdf', {
            chatId: testUserChatId,
            reportId: testReportId,
            filename: 'test_report.pdf',
            reportData: {
                leaveId: testReportId,
                nameAr: 'أحمد فهد الدوسري',
                nameEn: 'Ahmed Fahad',
                nationalId: '1099887766',
                startDate: '2026-09-21',
                endDate: '2026-09-21',
                duration: '1',
                issueDate: '2026-09-21',
                issueTime: '09:00 ص',
                type: 'sick',
                docNameAr: 'د. خالد العمري',
                docNameEn: 'Dr. Khalid Al-Omari',
                positionAr: 'طبيب عام',
                positionEn: 'General Practitioner',
                hospitalAr: 'مستشفى الملك فيصل',
                hospitalEn: 'King Faisal Hospital',
                hospitalType: 'gov'
            }
        });

        testAssert(genRes.status === 200 && genRes.data.success === true, 'PDF generation succeeded');
        testAssert(genRes.data.points === 15, `Points deducted by 5 (20 -> 15, got: ${genRes.data?.points})`);

        // Verify report persisted in reports.json
        const repInDb = await dataManager.getReportById(testReportId);
        testAssert(repInDb !== null, 'Report permanently saved in data/reports.json');
        testAssert(repInDb.service_code === testReportId, 'Service code preserved in report');

        // Inquiry lookup works immediately for this report
        const inqTestRes = await request('POST', '/api/inquiry', {
            leaveId: testReportId,
            nationalId: '1099887766'
        });
        testAssert(inqTestRes.data.success === true, 'Immediate inquiry for newly issued report succeeds');
        testAssert(inqTestRes.data.report.patientName === 'أحمد فهد الدوسري', 'Inquiry returned correct patient name');

        // Duplicate call with same reportId does NOT deduct points again (Idempotency)
        const dupRes = await request('POST', '/api/generate-native-pdf', {
            chatId: testUserChatId,
            reportId: testReportId,
            filename: 'test_report.pdf',
            reportData: {
                leaveId: testReportId,
                nameAr: 'أحمد فهد الدوسري',
                nationalId: '1099887766',
                issueDate: '2026-09-21'
            }
        });
        testAssert(dupRes.data.success === true, 'Duplicate PDF generation accepted');
        const userAfterDup = await dataManager.getSubscriber(testUserChatId);
        testAssert(userAfterDup.points === 15, `Points NOT double-deducted on duplicate generation (still 15, got: ${userAfterDup.points})`);

        // --- 7. ADMIN REPORTS & AUDIT LOG ENDPOINTS ---
        console.log('\n--- TEST GROUP 7: ADMIN REPORTS & AUDIT LOG ENDPOINTS (Rule 19, 20, 21) ---');
        const adminHeaders = {
            'x-admin-token': (process.env.ADMIN_MASTER_TOKEN || '')
        };

        const resAdminReports = await request('GET', '/api/admin/reports', null, adminHeaders);
        testAssert(resAdminReports.status === 200 && resAdminReports.data.success === true, 'GET /api/admin/reports returns 200');
        testAssert(Array.isArray(resAdminReports.data.reports), 'Admin reports list returned as array');
        testAssert(resAdminReports.data.total >= 1, `Admin reports count >= 1 (got: ${resAdminReports.data.total})`);

        // Search in admin reports
        const resAdminSearch = await request('GET', `/api/admin/reports?search=${encodeURIComponent(testReportId)}`, null, adminHeaders);
        testAssert(resAdminSearch.data.reports.length === 1, 'Search by report ID returns exact report');
        testAssert(resAdminSearch.data.reports[0].id === testReportId, 'Search returned correct report ID');

        // Admin audit logs
        const resAdminLogs = await request('GET', '/api/admin/logs', null, adminHeaders);
        testAssert(resAdminLogs.status === 200 && resAdminLogs.data.success === true, 'GET /api/admin/logs returns 200');
        testAssert(Array.isArray(resAdminLogs.data.logs), 'Audit transactions returned as array');

        // Clean up test user
        await dataManager.updateSubscriber(testUserChatId, (u) => {
            u.status = 'cancelled';
            return u;
        });

        console.log('\n======================================================================');
        console.log(`📊 PERSISTENT SYSTEM TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
        console.log('======================================================================');

        if (failed > 0) {
            process.exit(1);
        } else {
            process.exit(0);
        }

    } catch (err) {
        console.error('Fatal test execution error:', err);
        process.exit(1);
    }
}

runPersistentSystemTests();
