
// SECURITY: admin token comes from the environment (never hardcoded).
// ENV_CHECK: set ADMIN_MASTER_TOKEN before running this script.
// Production Real-World Verification Script
// Direct verification against https://seha-sickleave-app.onrender.com

const BASE_URL = 'https://seha-sickleave-1.onrender.com';
const ADMIN_TOKEN = (process.env.ADMIN_MASTER_TOKEN || '');
const OWNER_CHAT_ID = process.env.ADMIN_CHAT_ID || '';

async function main() {
    console.log('====================================================');
    console.log('🚀 TESTING LIVE RENDER DEPLOYMENT:', BASE_URL);
    console.log('====================================================\n');

    // 1. Health check
    console.log('[STEP 1] Testing GET /health');
    try {
        const res = await fetch(`${BASE_URL}/health`);
        const ctype = res.headers.get('content-type') || '';
        const bodyText = await res.text();
        console.log(`  HTTP Status: ${res.status}`);
        console.log(`  Content-Type: ${ctype}`);
        console.log(`  Body: ${bodyText.trim()}`);
        let isJson = false;
        try {
            const parsed = JSON.parse(bodyText);
            isJson = true;
            console.log(`  Parsed JSON Status:`, parsed.status);
            console.log(`  Uptime:`, parsed.uptime);
            console.log(`  Timestamp:`, parsed.timestamp);
        } catch (e) {
            console.log(`  ❌ Response is NOT JSON!`);
        }
    } catch (e) {
        console.error('  Fetch failed:', e.message);
    }

    // 2. Index.html verification
    console.log('\n[STEP 2] Testing GET /index.html');
    try {
        const res = await fetch(`${BASE_URL}/index.html`);
        const html = await res.text();
        console.log(`  HTTP Status: ${res.status}`);
        console.log(`  HTML Length: ${html.length} bytes`);
        const hasAllReports = html.includes('سجل جميع التقارير');
        const hasOfflineBanner = html.includes('offline-banner');
        const scriptMatch = html.match(/app\.js\?v=(\d+)/);
        const vMatch = html.match(/vLabel\.innerText\s*=\s*'([^']+)'/);
        console.log(`  Includes "سجل جميع التقارير": ${hasAllReports}`);
        console.log(`  Includes "offline-banner": ${hasOfflineBanner}`);
        console.log(`  Script tag: ${scriptMatch ? scriptMatch[0] : 'None'}`);
        console.log(`  vLabel: ${vMatch ? vMatch[1] : 'None'}`);
    } catch (e) {
        console.error('  Fetch failed:', e.message);
    }

    // 3. Admin reports endpoint
    console.log('\n[STEP 3] Testing GET /api/admin/reports');
    try {
        const res = await fetch(`${BASE_URL}/api/admin/reports`, {
            headers: { 'x-admin-token': ADMIN_TOKEN }
        });
        console.log(`  HTTP Status: ${res.status}`);
        const text = await res.text();
        console.log(`  Body preview: ${text.slice(0, 300)}`);
    } catch (e) {
        console.error('  Fetch failed:', e.message);
    }

    // 4. File Protection (Must be 403)
    console.log('\n[STEP 4] Testing Security / File Protection (Must be 403)');
    const secPaths = [
        '/subscriptions.json',
        '/data/subscriptions.json',
        '/data/reports.json',
        '/data/transactions.json'
    ];
    for (const p of secPaths) {
        try {
            const res = await fetch(`${BASE_URL}${p}`);
            console.log(`  ${p} -> HTTP ${res.status} (Expected: 403)`);
        } catch (e) {
            console.error(`  ${p} error:`, e.message);
        }
    }

    // 5. Owner Account
    console.log(`\n[STEP 5] Testing Owner Account (${OWNER_CHAT_ID})`);
    try {
        const res = await fetch(`${BASE_URL}/api/user/${OWNER_CHAT_ID}`);
        console.log(`  HTTP Status: ${res.status}`);
        const data = await res.json();
        console.log(`  User Data:`, JSON.stringify(data.user, null, 2));
    } catch (e) {
        console.error('  Fetch failed:', e.message);
    }
}

main();
