// ==============================================
// Seha SickLeave - Auto GitHub Deploy Script
// Uploads all project files to GitHub via API
// ==============================================

const https = require('https');
const fs = require('fs');
const path = require('path');

// SECURITY: credentials and repo coordinates come from the environment only.
// Set GITHUB_TOKEN (a PAT with "repo" scope), GITHUB_USERNAME and REPO_NAME before running.
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_USERNAME = process.env.GITHUB_USERNAME || '';
const REPO_NAME = process.env.REPO_NAME || 'seha-sickleave-app';
const PROJECT_DIR = __dirname;

if (!GITHUB_TOKEN || !GITHUB_USERNAME) {
    console.error('\n\u274c GITHUB_TOKEN and GITHUB_USERNAME are required environment variables.\n');
    process.exit(1);
}

const FILES_TO_UPLOAD = [
    'server.js',
    'index.html',
    'style.css',
    'app.js',
    'package.json',
    '.gitignore',
    'default_logo.png'
];

function githubRequest(method, apiPath, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: apiPath,
            method: method,
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'User-Agent': 'SehaDeployScript',
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        reject(new Error(`GitHub API ${res.statusCode}: ${parsed.message || data}`));
                    }
                } catch (e) {
                    resolve(data);
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function createRepo() {
    console.log('\n[1/3] Creating GitHub repository...');
    try {
        const repo = await githubRequest('POST', '/user/repos', {
            name: REPO_NAME,
            description: 'Seha Medical Reports - Telegram Mini App Bot',
            private: true,
            auto_init: false
        });
        console.log(`  ✅ Repository created: ${repo.html_url}`);
        return true;
    } catch (err) {
        if (err.message.includes('already exists') || err.message.includes('name already exists')) {
            console.log('  ℹ️  Repository already exists, will update files.');
            return true;
        }
        console.error('  ❌ Error:', err.message);
        return false;
    }
}

async function uploadFile(fileName, isFirst) {
    const filePath = path.join(PROJECT_DIR, fileName);
    
    if (!fs.existsSync(filePath)) {
        console.log(`  ⚠️  ${fileName} - File not found, skipping`);
        return false;
    }

    const content = fs.readFileSync(filePath);
    const base64Content = content.toString('base64');
    const fileSize = (content.length / 1024).toFixed(1);

    // Check if file already exists to get its SHA
    let sha = null;
    try {
        const existing = await githubRequest('GET', `/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${fileName}`);
        sha = existing.sha;
    } catch (e) {
        // File doesn't exist yet, that's fine
    }

    const body = {
        message: sha ? `Update ${fileName}` : `Add ${fileName}`,
        content: base64Content
    };
    if (sha) body.sha = sha;

    try {
        await githubRequest('PUT', `/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${fileName}`, body);
        console.log(`  ✅ ${fileName} (${fileSize} KB)`);
        return true;
    } catch (err) {
        console.error(`  ❌ ${fileName} - Error: ${err.message}`);
        return false;
    }
}

async function main() {
    console.log('=============================================');
    console.log('  Seha SickLeave - Auto GitHub Deploy');
    console.log('=============================================');
    console.log(`  User: ${GITHUB_USERNAME}`);
    console.log(`  Repo: ${REPO_NAME}`);
    console.log(`  Files: ${FILES_TO_UPLOAD.length}`);

    // Step 1: Create repo
    const created = await createRepo();
    if (!created) {
        console.log('\n❌ Failed to create repository. Check your token permissions.');
        process.exit(1);
    }

    // Wait a moment for GitHub to initialize
    await new Promise(r => setTimeout(r, 2000));

    // Step 2: Upload files one by one
    console.log('\n[2/3] Uploading files to GitHub...');
    let successCount = 0;
    
    for (let i = 0; i < FILES_TO_UPLOAD.length; i++) {
        const success = await uploadFile(FILES_TO_UPLOAD[i], i === 0);
        if (success) successCount++;
        // Small delay between uploads to avoid rate limiting
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n  Uploaded: ${successCount}/${FILES_TO_UPLOAD.length} files`);

    // Step 3: Summary
    console.log('\n[3/3] DONE!');
    console.log('=============================================');
    console.log(`\n  ✅ GitHub Repo: https://github.com/${GITHUB_USERNAME}/${REPO_NAME}`);
    console.log('\n  📋 NEXT STEPS (Render Deployment):');
    console.log('  ─────────────────────────────────────');
    console.log('  1. Go to: https://render.com');
    console.log('  2. Sign in with GitHub');
    console.log('  3. Click: New > Web Service');
    console.log('  4. Connect repo: seha-sickleave-app');
    console.log('  5. Settings:');
    console.log('     - Build Command: npm install');
    console.log('     - Start Command: node server.js');
    console.log('     - Plan: Free');
    console.log('  6. Environment Variables:');
    console.log('     TELEGRAM_BOT_TOKEN = <paste your bot token here>');
    console.log('     WEB_APP_URL = https://<your-service>.onrender.com');
    console.log('     ADMIN_USERNAME = <your telegram username>');
    console.log('     TELEGRAM_CHANNEL_ID = <your channel id>');
    console.log('     ADMIN_CHAT_ID = <your numeric telegram chat id>');
    console.log('     ADMIN_MASTER_TOKEN = <strong random password>');
    console.log('     NODE_ENV = production');
    console.log('  7. Click: Create Web Service');
    console.log('');
    console.log('  After deploy, visit: https://seha-sickleave-app.onrender.com/setup');
    console.log('');
    console.log('  🔄 UptimeRobot (keep alive 24/7):');
    console.log('  1. Go to: https://uptimerobot.com');
    console.log('  2. Create free account');
    console.log('  3. Add Monitor: HTTP(s)');
    console.log('     URL: https://seha-sickleave-app.onrender.com');
    console.log('     Interval: 5 minutes');
    console.log('=============================================\n');
}

main().catch(err => {
    console.error('\n❌ Fatal error:', err.message);
    process.exit(1);
});
