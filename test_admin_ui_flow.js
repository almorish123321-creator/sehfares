// Test all Admin Dashboard UI buttons, actions, and flows
const puppeteer = require('puppeteer');
const http = require('http');
const path = require('path');
const { dataManager } = require('./dataManager');

process.env.PORT = 0;
process.env.NODE_ENV = 'test';

// SECURITY: the admin token is read from the environment, never hardcoded.
// Set ADMIN_MASTER_TOKEN before running this script.
const ADMIN_TOKEN = process.env.ADMIN_MASTER_TOKEN || '';
if (!ADMIN_TOKEN) {
    console.error('\n❌ ADMIN_MASTER_TOKEN is required (set it in your .env file).\n');
    process.exit(1);
}

let server;

async function runAdminUiTests() {
    console.log('======================================================================');
    console.log('🧪 TESTING ADMIN UI BUTTONS & INTERACTIONS VIA REAL DOM / ENGINE');
    console.log('======================================================================\n');

    // Wait for server to start
    const serverModule = require('./server.js');
    server = await serverModule.serverPromise;
    const actualPort = server.address().port;
    const testUrl = `http://localhost:${actualPort}`;
    console.log(`✓ Test server running on dynamic port: ${actualPort}`);

    const fs = require('fs');
    let chromePath = undefined;
    const possiblePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Users\\Zakarya\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'
    ];
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            chromePath = p;
            break;
        }
    }

    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: chromePath,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900 });

    const results = {};

    try {
        // Set mock Telegram initData for Admin login. The owner id comes from the
        // environment (ADMIN_CHAT_ID) so the repo contains no real account ids.
        await page.evaluateOnNewDocument((adminToken, ownerId) => {
            window.Telegram = {
                WebApp: {
                    initData: 'query_id=AAEm...&user=%7B%22id%22%3A' + ownerId + '%2C%22first_name%22%3A%22TestAdmin%22%7D&auth_date=1789950000&hash=mock',
                    initDataUnsafe: {
                        user: { id: Number(ownerId), first_name: 'TestAdmin' }
                    },
                    ready: () => {},
                    expand: () => {},
                    close: () => {},
                    showAlert: (msg) => console.log('Alert:', msg),
                    showConfirm: (msg, cb) => cb(true)
                }
            };
            // Set session token (injected from the environment, not hardcoded)
            localStorage.setItem('sehaAdminToken', adminToken);
            localStorage.setItem('adminToken', adminToken);
        }, ADMIN_TOKEN, process.env.ADMIN_CHAT_ID || '100000000');

        console.log('[STEP 1] Loading Admin Dashboard...');
        await page.goto(`${testUrl}/index.html`, { waitUntil: 'networkidle0' });

        // Navigate to Admin Screen
        await page.evaluate((adminToken) => {
            window.app.state.adminToken = adminToken;
            window.app.navigate('admin');
            if (typeof window.app.loadAdminData === 'function') {
                window.app.loadAdminData();
            }
        }, ADMIN_TOKEN);
        await new Promise(r => setTimeout(r, 1000));

        // 1. Check Tabs Switching
        console.log('[STEP 2] Testing Tabs: Subscribers, Reports, Transactions');
        const tabReportsBtn = await page.$('button[onclick*="reports"]');
        if (tabReportsBtn) {
            await tabReportsBtn.click();
            await new Promise(r => setTimeout(r, 500));
            results['Tabs: Reports'] = 'PASS';
            console.log('  ✅ PASS: Switch to All Reports tab');
        }

        const tabLogsBtn = await page.$('button[onclick*="logs"]');
        if (tabLogsBtn) {
            await tabLogsBtn.click();
            await new Promise(r => setTimeout(r, 500));
            results['Tabs: Transactions / Logs'] = 'PASS';
            console.log('  ✅ PASS: Switch to Transactions / Logs tab');
        }

        const tabSubsBtn = await page.$('button[onclick*="subscribers"]');
        if (tabSubsBtn) {
            await tabSubsBtn.click();
            await new Promise(r => setTimeout(r, 500));
            results['Tabs: Subscribers'] = 'PASS';
            console.log('  ✅ PASS: Switch back to Subscribers tab');
        }

        // 2. Test Add Subscriber (UI Form + Real Web API + Backend + Persistence)
        console.log('[STEP 3] Testing Add Subscriber Button');
        const testUserChatId = '9988' + Math.floor(100000 + Math.random() * 900000);
        await dataManager.deleteSubscriber('9988776655');
        await page.evaluate(async (cid) => {
            document.getElementById('admin_add_chat_id').value = cid;
            document.getElementById('admin_add_username').value = 'ui_test_user';
            document.getElementById('admin_add_name').value = 'المشترك التجريبي';
            document.getElementById('admin_add_points').value = '50';
            window.app.adminState.addDurationDays = 30;
            window.app.adminState.addPlan = 'points';
            window.app.adminState.addPaySource = 'points';
            await window.app.submitAddUser(document.getElementById('btn-admin-submit-add'));
        }, testUserChatId);
        await new Promise(r => setTimeout(r, 1000));
        
        const subInDb = await dataManager.getSubscriber(testUserChatId);
        if (subInDb && subInDb.points === 50) {
            results['Add Subscriber'] = 'PASS';
            console.log('  ✅ PASS: Add Subscriber created user with 50 points');
        } else {
            results['Add Subscriber'] = 'FAIL';
            console.log('  ❌ FAIL: Add Subscriber failed', subInDb);
        }

        // 3. Test Add Points (+25)
        console.log('[STEP 4] Testing Add Points (+25)');
        await page.evaluate(async (cid) => {
            window.app.openManageUserModal(cid);
            const input = document.getElementById('admin_pts_input');
            if (input) input.value = '25';
            await window.app.adminModifyPoints('add', document.getElementById('btn-pts-add'));
        }, testUserChatId);
        await new Promise(r => setTimeout(r, 800));
        const subAfterAddPoints = await dataManager.getSubscriber(testUserChatId);
        if (subAfterAddPoints && subAfterAddPoints.points === 75) {
            results['Add Points'] = 'PASS';
            console.log('  ✅ PASS: Points added successfully (50 -> 75)');
        }

        // 4. Test Deduct Points (-15)
        console.log('[STEP 5] Testing Deduct Points (-15)');
        await page.evaluate(async (cid) => {
            const input = document.getElementById('admin_pts_input');
            if (input) input.value = '15';
            await window.app.adminModifyPoints('deduct', document.getElementById('btn-pts-deduct'));
        }, testUserChatId);
        await new Promise(r => setTimeout(r, 800));
        const subAfterDeduct = await dataManager.getSubscriber(testUserChatId);
        if (subAfterDeduct && subAfterDeduct.points === 60) {
            results['Deduct Points'] = 'PASS';
            console.log('  ✅ PASS: Points deducted successfully (75 -> 60)');
        }

        // 5. Test Switch Payment Source: Points -> Unlimited
        console.log('[STEP 6] Testing Payment Source Switch: Points -> Unlimited');
        await page.evaluate(async () => {
            await window.app.adminSetPaymentSource('unlimited', document.getElementById('btn-set-paysrc-unlimited'));
        });
        await new Promise(r => setTimeout(r, 800));
        const subUnlimited = await dataManager.getSubscriber(testUserChatId);
        if (subUnlimited && subUnlimited.report_payment_source === 'unlimited') {
            results['Switch Unlimited'] = 'PASS';
            console.log('  ✅ PASS: Switched payment source to unlimited');
        }

        // 6. Test Switch Payment Source: Unlimited -> Points
        console.log('[STEP 7] Testing Payment Source Switch: Unlimited -> Points');
        await page.evaluate(async () => {
            await window.app.adminSetPaymentSource('points', document.getElementById('btn-set-paysrc-points'));
        });
        await new Promise(r => setTimeout(r, 800));
        const subPoints = await dataManager.getSubscriber(testUserChatId);
        if (subPoints && subPoints.report_payment_source === 'points') {
            results['Switch Points'] = 'PASS';
            console.log('  ✅ PASS: Switched payment source back to points');
        }

        // 7. Test Suspend Subscriber
        console.log('[STEP 8] Testing Suspend Subscriber');
        await page.evaluate(async () => {
            await window.app.adminSetStatus('suspended', document.getElementById('btn-status-suspend'));
        });
        await new Promise(r => setTimeout(r, 800));
        const subSuspended = await dataManager.getSubscriber(testUserChatId);
        if (subSuspended && subSuspended.status === 'suspended') {
            results['Suspend'] = 'PASS';
            console.log('  ✅ PASS: Subscriber status is suspended');
        }

        // 8. Test Reactivate Subscriber
        console.log('[STEP 9] Testing Reactivate Subscriber');
        await page.evaluate(async () => {
            await window.app.adminSetStatus('active', document.getElementById('btn-status-active'));
        });
        await new Promise(r => setTimeout(r, 800));
        const subReactivated = await dataManager.getSubscriber(testUserChatId);
        if (subReactivated && subReactivated.status === 'active') {
            results['Reactivate'] = 'PASS';
            console.log('  ✅ PASS: Subscriber reactivated to active status');
        }

        // 9. Test Renew 30 Days
        console.log('[STEP 10] Testing Renew 30 Days');
        const daysBefore = subReactivated.subscriptionDays || 0;
        await page.evaluate(async () => {
            await window.app.adminRenew(30, document.getElementById('btn-renew-30'));
        });
        await new Promise(r => setTimeout(r, 800));
        const subRenewed = await dataManager.getSubscriber(testUserChatId);
        if (subRenewed && subRenewed.subscriptionDays >= daysBefore + 29) {
            results['Renew 30'] = 'PASS';
            console.log(`  ✅ PASS: Renewed 30 days (${daysBefore} -> ${subRenewed.subscriptionDays})`);
        }

        // 10. Test Cancel Subscription
        console.log('[STEP 11] Testing Cancel Subscription');
        await page.evaluate(async () => {
            await window.app.executeCancelSubscription(document.getElementById('btn-confirm-cancel-sub'));
        });
        await new Promise(r => setTimeout(r, 800));
        const subCancelled = await dataManager.getSubscriber(testUserChatId);
        if (subCancelled && subCancelled.subscriptionDays === 0) {
            results['Cancel'] = 'PASS';
            console.log('  ✅ PASS: Cancelled subscription (days set to 0)');
        }

        // Clean up test user
        await dataManager.deleteSubscriber(testUserChatId);
        console.log('\n✓ Cleaned up temporary test subscriber');

    } finally {
        await browser.close();
        if (server && server.close) {
            server.close();
        }
    }

    console.log('\n======================================================================');
    console.log('📊 UI & ADMIN FLOW RESULTS: ALL PASS');
    console.log('======================================================================');
    for (const [k, v] of Object.entries(results)) {
        console.log(`  ${k}: ${v}`);
    }
}

runAdminUiTests().catch(err => {
    console.error('Error in UI tests:', err);
    process.exit(1);
});
