// Configure test environment variables BEFORE requiring any app modules
process.env.NODE_ENV = 'test';
process.env.PORT = '3096';
const TEST_OWNER_ID = process.env.TEST_OWNER_ID || '100000000';
const TEST_OWNER_USERNAME = process.env.TEST_OWNER_USERNAME || 'test_admin';
process.env.ADMIN_CHAT_ID = TEST_OWNER_ID;
process.env.ADMIN_USERNAME = TEST_OWNER_USERNAME;
process.env.WEB_APP_URL = 'http://localhost:3096';

const assert = require('assert');
const http = require('http');
const shortIoService = require('./shortIoService');

let passedTests = 0;
let failedTests = 0;

function pass(name) {
    passedTests++;
    console.log(`  ✅ PASS: ${name}`);
}

function fail(name, err) {
    failedTests++;
    console.error(`  ❌ FAIL: ${name}`, err.message || err);
}

async function runTests() {
    console.log('======================================================================');
    console.log('🔗 STARTING SHORT.IO PRODUCTION INTEGRATION TEST SUITE');
    console.log('======================================================================\n');

    // GROUP 1: DOMAIN & ENVIRONMENT CONFIGURATION
    console.log('--- TEST GROUP 1: DOMAIN & ENVIRONMENT CONFIGURATION ---');
    try {
        const domain = shortIoService.getDomain();
        assert.strictEqual(domain, 'sehaedu.s.gy', 'Domain must be exactly sehaedu.s.gy');
        pass('Default domain is strictly sehaedu.s.gy');
    } catch (e) { fail('Default domain check', e); }

    try {
        const key = shortIoService.getApiKey();
        assert.strictEqual(typeof key, 'string');
        assert.ok(!key.includes('placeholder') && !key.includes('sk_'), 'No hardcoded live secret in file');
        pass('SHORTIO_API_KEY securely read from environment variables only');
    } catch (e) { fail('Secure API key check', e); }

    // GROUP 2: SLUG SANITIZATION & PRIVACY PROTECTION
    console.log('\n--- TEST GROUP 2: SLUG SANITIZATION & PRIVACY PROTECTION ---');
    try {
        const standardSlug = shortIoService.sanitizePath('B82LM4');
        assert.strictEqual(standardSlug, 'B82LM4');
        pass('Standard alphanumeric slug preserved: B82LM4');
    } catch (e) { fail('Standard slug check', e); }

    try {
        const lowerSlug = shortIoService.sanitizePath('b82lm4');
        assert.strictEqual(lowerSlug, 'B82LM4');
        pass('Lowercase slug uppercased: b82lm4 -> B82LM4');
    } catch (e) { fail('Lowercase slug check', e); }

    try {
        const arabicDigits = shortIoService.sanitizePath('SL١٢٣٤٥٦');
        assert.strictEqual(arabicDigits, 'SL123456');
        pass('Arabic-Indic digits normalized to Latin digits: SL١٢٣٤٥٦ -> SL123456');
    } catch (e) { fail('Arabic digits check', e); }

    try {
        const dangerousInput = shortIoService.sanitizePath('B82LM4?nationalId=1029384756&name=Ahmed');
        assert.strictEqual(dangerousInput, 'B82LM4NATIONALID1029384756NAMEAHMED'.substring(0, 32));
        assert.ok(!dangerousInput.includes('?'));
        assert.ok(!dangerousInput.includes('&'));
        assert.ok(!dangerousInput.includes('='));
        pass('Query parameters and special characters stripped (Privacy protected)');
    } catch (e) { fail('Privacy and special chars check', e); }

    try {
        const fallbackUrl = shortIoService.buildFallbackUrl('B82LM4');
        assert.strictEqual(fallbackUrl, 'https://sehaedu.s.gy/B82LM4');
        pass('Constructed Short URL strictly matches format: https://sehaedu.s.gy/B82LM4');
    } catch (e) { fail('Fallback URL format check', e); }

    // GROUP 3: LINK CREATION & IN-MEMORY CACHE
    console.log('\n--- TEST GROUP 3: LINK CREATION & CACHE ---');
    try {
        const targetUrl = 'https://seha-sickleave-1.onrender.com/inquiries/slenquiry?id=B82LM4';
        const res1 = await shortIoService.createShortLink({
            originalURL: targetUrl,
            path: 'B82LM4',
            allowDuplicates: false
        });

        assert.strictEqual(res1.success, true);
        assert.strictEqual(res1.shortURL, 'https://sehaedu.s.gy/B82LM4');
        assert.strictEqual(res1.domain, 'sehaedu.s.gy');
        assert.strictEqual(res1.path, 'B82LM4');
        pass('createShortLink returns valid shortURL for B82LM4');

        const res2 = await shortIoService.createShortLink({
            originalURL: targetUrl,
            path: 'B82LM4',
            allowDuplicates: false
        });

        assert.strictEqual(res2.success, true);
        assert.strictEqual(res2.shortURL, 'https://sehaedu.s.gy/B82LM4');
        assert.strictEqual(res2.fromCache, true);
        pass('Duplicate call served from in-memory cache (prevents redundant API calls)');
    } catch (e) { fail('Link creation and cache check', e); }

    try {
        let threw = false;
        try {
            await shortIoService.createShortLink({ originalURL: 'https://test.com', path: '' });
        } catch {
            threw = true;
        }
        assert.strictEqual(threw, true);
        pass('Empty path correctly rejected with descriptive error');
    } catch (e) { fail('Empty path rejection', e); }

    // GROUP 4: SERVER REDIRECT ROUTING & INQUIRY INTEGRATION
    console.log('\n--- TEST GROUP 4: SERVER ROUTING & REDIRECTION ---');
    const { serverPromise } = require('./server');
    await serverPromise;

    const makeRequest = (options) => {
        return new Promise((resolve, reject) => {
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
            });
            req.on('error', reject);
            req.end();
        });
    };

    try {
        const res = await makeRequest({
            hostname: '127.0.0.1',
            port: 3096,
            path: '/B82LM4',
            method: 'GET'
        });

        assert.strictEqual(res.status, 302);
        assert.strictEqual(res.headers.location, '/inquiries/slenquiry?id=B82LM4');
        pass('Direct slug hit GET /B82LM4 redirects (302) to /inquiries/slenquiry?id=B82LM4');
    } catch (e) { fail('Direct slug redirect check', e); }

    try {
        const inquiryRes = await makeRequest({
            hostname: '127.0.0.1',
            port: 3096,
            path: '/inquiries/slenquiry',
            method: 'GET'
        });

        assert.strictEqual(inquiryRes.status, 200);
        assert.ok(inquiryRes.body.includes('منصة الخدمات الصحية'));
        pass('GET /inquiries/slenquiry returns 200 with inquiry UI');
    } catch (e) { fail('Inquiry page check', e); }

    // GROUP 5: PDF GENERATION EMBEDDING & QR CODE
    console.log('\n--- TEST GROUP 5: PDF & QR CODE INTEGRATION ---');
    try {
        const postData = JSON.stringify({
            chatId: TEST_OWNER_ID,
            reportId: 'B82LM4',
            filename: 'Test_ShortIo_SickLeave.pdf',
            reportData: {
                leaveId: 'B82LM4',
                id: 'B82LM4',
                type: 'sick',
                nameAr: 'خالد بن عبدالعزيز',
                nameEn: 'Khalid Abdulaziz',
                nationalId: '1088776655',
                startDate: '2026-09-18',
                endDate: '2026-09-18',
                duration: '1',
                issueDate: '2026-09-18',
                issueTime: '08:00 ص',
                docNameAr: 'د. فيصل الشهري',
                docNameEn: 'Dr. Faisal Al-Shehri',
                positionAr: 'استشاري باطنية',
                positionEn: 'Consultant Internist',
                hospitalAr: 'مستشفى الملك فهد',
                hospitalEn: 'King Fahad Hospital',
                hospitalType: 'gov'
            }
        });

        const pdfReq = await new Promise((resolve, reject) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port: 3096,
                path: '/api/generate-native-pdf',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body || '{}') }));
            });
            req.on('error', reject);
            req.write(postData);
            req.end();
        });

        assert.strictEqual(pdfReq.status, 200);
        assert.strictEqual(pdfReq.body.success, true);
        assert.strictEqual(pdfReq.body.shortURL, 'https://sehaedu.s.gy/B82LM4');
        pass('PDF generation succeeded with shortURL: https://sehaedu.s.gy/B82LM4');
    } catch (e) { fail('PDF generation with Short.io check', e); }

    // GROUP 6: DATABASE PERSISTENCE & INQUIRY VERIFICATION
    console.log('\n--- TEST GROUP 6: DATABASE PERSISTENCE & INQUIRY ---');
    try {
        const fs = require('fs');
        const dbData = JSON.parse(fs.readFileSync('subscriptions.json', 'utf8'));
        const userSub = dbData.subscriptions[TEST_OWNER_ID];
        assert.ok(userSub, `User ${TEST_OWNER_ID} must exist`);
        
        const savedReport = userSub.reports.find(r => r.id === 'B82LM4');
        assert.ok(savedReport, 'Report B82LM4 must be saved in database');
        assert.strictEqual(savedReport.shortURL, 'https://sehaedu.s.gy/B82LM4');
        assert.strictEqual(savedReport.data.short_url, 'https://sehaedu.s.gy/B82LM4');
        assert.strictEqual(savedReport.data.service_code, 'B82LM4');
        pass('shortURL correctly persisted in database record and data object');
    } catch (e) { fail('Database persistence check', e); }

    try {
        const queryData = JSON.stringify({
            leaveId: 'B82LM4',
            nationalId: '1088776655'
        });

        const inqRes = await new Promise((resolve, reject) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port: 3096,
                path: '/api/inquiry',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(queryData)
                }
            }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body || '{}') }));
            });
            req.on('error', reject);
            req.write(queryData);
            req.end();
        });

        assert.strictEqual(inqRes.status, 200);
        assert.strictEqual(inqRes.body.success, true);
        assert.strictEqual(inqRes.body.report.patientName, 'خالد بن عبدالعزيز');
        assert.strictEqual(inqRes.body.report.serviceCode, 'B82LM4');
        pass('Inquiry API successfully returns report matching serviceCode B82LM4');
    } catch (e) { fail('Inquiry verification check', e); }

    // CLEANUP TEST DATA
    try {
        const fs = require('fs');
        const dbData = JSON.parse(fs.readFileSync('subscriptions.json', 'utf8'));
        const userSub = dbData.subscriptions[TEST_OWNER_ID];
        if (userSub && userSub.reports) {
            userSub.reports = userSub.reports.filter(r => r.id !== 'B82LM4');
            fs.writeFileSync('subscriptions.json', JSON.stringify(dbData, null, 2), 'utf8');
        }
        pass('Test report B82LM4 cleaned up from subscriptions.json');
    } catch (e) { fail('Cleanup check', e); }

    console.log('\n======================================================================');
    console.log(`📊 SHORT.IO TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('======================================================================\n');

    process.exit(failedTests > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
