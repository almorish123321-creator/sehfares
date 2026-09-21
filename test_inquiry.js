const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.PORT = '3097';
const TEST_OWNER_ID = process.env.TEST_OWNER_ID || '100000000';
const TEST_OWNER_USERNAME = process.env.TEST_OWNER_USERNAME || 'test_admin';
process.env.ADMIN_CHAT_ID = TEST_OWNER_ID;
process.env.ADMIN_USERNAME = TEST_OWNER_USERNAME;
process.env.WEB_APP_URL = 'http://localhost:3097';

// Import server
const { serverPromise } = require('./server.js');

const BASE_URL = 'http://localhost:3097';

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

async function runTests() {
    console.log('====================================================');
    console.log('🧪 RUNNING COMPREHENSIVE INQUIRY & QR TESTS');
    console.log('====================================================\n');

    await serverPromise;
    await new Promise(r => setTimeout(r, 500));

    let passed = 0;
    let failed = 0;

    const testAssert = (cond, name) => {
        if (cond) {
            console.log(`  ✅ PASS: ${name}`);
            passed++;
        } else {
            console.error(`  ❌ FAIL: ${name}`);
            failed++;
        }
    };

    try {
        // Test Group 1: HTML Routes & Assets
        console.log('--- TEST GROUP 1: HTML ROUTES & ASSETS ---');
        const resInquiry = await request('GET', '/inquiry');
        testAssert(resInquiry.status === 200, 'GET /inquiry returns 200');
        testAssert(resInquiry.raw && resInquiry.raw.includes('الاستعلام عن الإجازات المرضية'), 'GET /inquiry contains page title');
        testAssert(resInquiry.raw && resInquiry.raw.includes('handleInquiry()'), 'GET /inquiry contains inquiry handler script');

        const resVerify = await request('GET', '/verify');
        testAssert(resVerify.status === 200, 'GET /verify returns 200');

        const resSlenquiry = await request('GET', '/inquiries/slenquiry');
        testAssert(resSlenquiry.status === 200, 'GET /inquiries/slenquiry returns 200');

        const resAsset = await request('GET', '/assets/Seha.png');
        testAssert(resAsset.status === 200, 'GET /assets/Seha.png returns 200');

        // Test Group 2: /api/inquiry API Logic
        console.log('\n--- TEST GROUP 2: /api/inquiry API LOGIC ---');
        
        // Missing parameters
        const resEmpty = await request('POST', '/api/inquiry', {});
        testAssert(resEmpty.data.success === false, 'POST /api/inquiry with empty body returns error');

        // Valid report lookup (exact match)
        const resValid = await request('POST', '/api/inquiry', {
            leaveId: 'GSL26091549804',
            nationalId: '1104101516'
        });
        testAssert(resValid.data.success === true, 'Valid inquiry returns success: true');
        testAssert(resValid.data.report.name === 'ريان أحمد الغامدي', `Report name matches: ${resValid.data?.report?.name}`);
        testAssert(resValid.data.report.issueDate === '2026-09-15', `Issue date matches: ${resValid.data?.report?.issueDate}`);
        testAssert(resValid.data.report.startDate === '2026-09-15', `Start date matches: ${resValid.data?.report?.startDate}`);
        testAssert(resValid.data.report.endDate === '2026-09-15', `End date matches: ${resValid.data?.report?.endDate}`);
        testAssert(resValid.data.report.duration === '1', `Duration matches: ${resValid.data?.report?.duration}`);
        testAssert(resValid.data.report.doctorName === 'أحمد عبدالله الحازمي', `Doctor name matches: ${resValid.data?.report?.doctorName}`);
        testAssert(resValid.data.report.jobTitle === 'طبيب عام', `Job title matches: ${resValid.data?.report?.jobTitle}`);

        // Case insensitivity & Arabic numeral normalization
        console.log('\n--- TEST GROUP 3: NORMALIZATION & EDGE CASES ---');
        const resNorm = await request('POST', '/api/inquiry', {
            leaveId: '  gsl26091549804  ',
            nationalId: '١١٠٤١٠١٥١٦' // Arabic numerals
        });
        testAssert(resNorm.data.success === true, 'Lowercase + Arabic digits correctly normalized');
        testAssert(resNorm.data.report.name === 'ريان أحمد الغامدي', 'Correct report returned for normalized query');

        // Mismatched National ID for existing Service Code
        const resMismatch = await request('POST', '/api/inquiry', {
            leaveId: 'GSL26091549804',
            nationalId: '9999999999'
        });
        testAssert(resMismatch.data.success === false, 'Mismatched national ID rejected');
        testAssert(resMismatch.data.error.includes('غير متطابقة'), 'Mismatch error message is specific');

        // Non-existent Service Code
        const resNotFound = await request('POST', '/api/inquiry', {
            leaveId: 'GSL99999999999',
            nationalId: '1104101516'
        });
        testAssert(resNotFound.data.success === false, 'Non-existent service code returns not found');
        testAssert(resNotFound.data.error.includes('لم يتم العثور'), 'Not found error message is accurate');

        // Test Group 4: Companion Review Report Creation & Inquiry
        console.log('\n--- TEST GROUP 4: COMPANION REVIEW REPORT & INQUIRY ---');
        const testCrId = 'CR' + Date.now();
        const saveCrRes = await request('POST', `/api/report/${TEST_OWNER_ID}`, {
            report: {
                id: testCrId,
                patientName: 'سعيد القحطاني',
                type: 'companion_review',
                issueDate: '2026-09-16',
                data: {
                    admission_date: '2026-09-16',
                    discharge_date: '2026-09-16',
                    duration: '1',
                    issue_date: '2026-09-16',
                    issue_time: '10:30',
                    national_id: '1088776655',
                    patient_name_ar: 'فهد القحطاني',
                    patient_name_en: 'FAHAD ALQAHTANI',
                    nationality: 'saudi',
                    employer: 'الشركة السعودية للكهرباء',
                    escort_name_ar: 'سعيد القحطاني',
                    escort_name_en: 'SAEED ALQAHTANI',
                    relation_ar: 'أخ',
                    relation_en: 'Brother',
                    doctor_name_ar: 'د. خالد العمري',
                    doctor_name_en: 'DR. KHALID ALOMARI',
                    job_title_ar: 'استشاري باطنية',
                    job_title_en: 'Internal Medicine Consultant',
                    hospital_ar: 'مستشفى الشميسي',
                    hospital_en: 'Shumaisi Hospital',
                    hospital_type: 'gov',
                    license_number: ''
                }
            }
        });
        testAssert(saveCrRes.data.success === true, 'Successfully saved companion_review report');

        const inqCrRes = await request('POST', '/api/inquiry', {
            leaveId: testCrId,
            nationalId: '1088776655'
        });
        testAssert(inqCrRes.data.report.patientName === 'فهد القحطاني', `Inquiry returned patient name: ${inqCrRes.data?.report?.patientName}`);
        testAssert(inqCrRes.data.report.companionName === 'سعيد القحطاني', `Inquiry returned companion name: ${inqCrRes.data?.report?.companionName}`);
        testAssert(inqCrRes.data.report.serviceCode === testCrId, 'Inquiry serviceCode matches');

        // Cleanup test report from subscriptions.json
        const dbRaw = JSON.parse(fs.readFileSync('./subscriptions.json', 'utf8'));
        if (dbRaw.subscriptions[TEST_OWNER_ID]?.reports) {
            dbRaw.subscriptions[TEST_OWNER_ID].reports = dbRaw.subscriptions[TEST_OWNER_ID].reports.filter(r => r.id !== testCrId);
            fs.writeFileSync('./subscriptions.json', JSON.stringify(dbRaw, null, 2), 'utf8');
        }
        testAssert(true, 'Cleaned up companion_review test report');

        console.log('\n====================================================');
        console.log(`📊 INQUIRY TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
        console.log('====================================================');

        process.exit(failed > 0 ? 1 : 0);
    } catch (err) {
        console.error('Test execution error:', err);
        process.exit(1);
    }
}

runTests();
