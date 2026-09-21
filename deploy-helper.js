// Quick deploy helper - Run with: node deploy-helper.js
const https = require('https');
const fs = require('fs');
const path = require('path');

const PROJECT_DIR = __dirname;

console.log('\n=== Seha SickLeave - Deploy Helper ===\n');

// Check all required files exist
const requiredFiles = ['server.js', 'index.html', 'style.css', 'app.js', 'default_logo.png', 'package.json', 'subscriptions.json'];
let allFound = true;

requiredFiles.forEach(file => {
    const filePath = path.join(PROJECT_DIR, file);
    if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        console.log(`  ✅ ${file} (${(stats.size / 1024).toFixed(1)} KB)`);
    } else {
        console.log(`  ❌ ${file} - MISSING!`);
        allFound = false;
    }
});

console.log('');

if (!allFound) {
    console.log('❌ Some files are missing! Cannot deploy.');
    process.exit(1);
}

console.log('✅ All files present and ready for deployment!\n');
console.log('📁 Project location:', PROJECT_DIR);
console.log('');

// Test if server can start
console.log('🔄 Testing server startup...\n');

// Set environment for local testing
process.env.WEB_APP_URL = 'https://seha-sickleave-1.onrender.com';

try {
    require('./server.js');
} catch (err) {
    console.error('❌ Server failed to start:', err.message);
    process.exit(1);
}
