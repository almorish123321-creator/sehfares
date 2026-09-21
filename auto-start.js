/**
 * auto-start.js
 * يشغّل السيرفر + ngrok تلقائياً ويحدّث الرابط
 */

const { spawn, execSync } = require('child_process');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const NGROK_API = 'http://localhost:4040/api/tunnels';

function log(msg) {
    console.log(`[AutoStart] ${msg}`);
}

function getNgrokUrl() {
    return new Promise((resolve, reject) => {
        http.get(NGROK_API, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    const tunnel = parsed.tunnels.find(t => t.proto === 'https');
                    if (tunnel) resolve(tunnel.public_url);
                    else reject(new Error('No HTTPS tunnel found'));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

function waitForNgrok(retries = 15) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const check = () => {
            attempts++;
            getNgrokUrl()
                .then(resolve)
                .catch(err => {
                    if (attempts >= retries) reject(err);
                    else {
                        log(`انتظار ngrok... (${attempts}/${retries})`);
                        setTimeout(check, 2000);
                    }
                });
        };
        setTimeout(check, 2000);
    });
}

async function main() {
    console.log('\n==========================================');
    console.log('   Seha SickLeave - Auto Launcher v2');
    console.log('==========================================\n');

    // Check if ngrok is available
    let ngrokAvailable = false;
    try {
        execSync('ngrok version', { stdio: 'ignore' });
        ngrokAvailable = true;
        log('✓ ngrok موجود');
    } catch (e) {
        log('⚠️  ngrok غير موجود - سيتم تشغيل التطبيق محلياً فقط');
    }

    let webAppUrl = process.env.WEB_APP_URL || 'https://seha-sickleave-1.onrender.com';

    log(`تشغيل السيرفر على المنفذ ${PORT}...`);
    log(`WEB_APP_URL = ${webAppUrl}`);

    const env = {
        ...process.env,
        WEB_APP_URL: webAppUrl,
        PORT: PORT.toString()
    };

    const serverProcess = spawn('node', ['server.js'], {
        cwd: __dirname,
        env: env,
        stdio: 'inherit'
    });

    serverProcess.on('error', err => {
        log(`خطأ في السيرفر: ${err.message}`);
    });

    serverProcess.on('exit', (code) => {
        log(`السيرفر توقف برمز: ${code}`);
    });

    setTimeout(() => {
        console.log('\n==========================================');
        console.log('  ✅ كل شيء جاهز!');
        console.log(`  🌐 رابط التطبيق: ${webAppUrl}`);
        if (ngrokAvailable && webAppUrl !== `http://localhost:${PORT}`) {
            console.log('  📱 افتح تيليجرام واضغط Open');
        } else {
            console.log(`  🖥️  افتح المتصفح: http://localhost:${PORT}`);
        }
        console.log('==========================================\n');
    }, 3000);
}

main().catch(err => {
    console.error('خطأ:', err.message);
    process.exit(1);
});
