const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, 'subscriptions.json');
const raw = fs.readFileSync(srcPath, 'utf-8');
const data = JSON.parse(raw);

// Calculate metrics BEFORE migration
let subscribersBefore = 0;
let reportsBefore = 0;
let transactionsBefore = (data.transactions || []).length;
let pointsBefore = 0;

for (const [cid, sub] of Object.entries(data.subscriptions || {})) {
    subscribersBefore++;
    const pts = Number(sub.points != null ? sub.points : (sub.balance_points || 0));
    pointsBefore += pts;
    if (Array.isArray(sub.reports)) {
        reportsBefore += sub.reports.length;
    }
}

console.log('=== BEFORE MIGRATION METRICS ===');
console.log('Subscribers:', subscribersBefore);
console.log('Reports:', reportsBefore);
console.log('Transactions:', transactionsBefore);
console.log('Total Points:', pointsBefore);

// Create timestamped backup and static backup
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath1 = path.join(__dirname, 'subscriptions.backup.json');
const backupPath2 = path.join(__dirname, 'subscriptions.backup.' + timestamp + '.json');

fs.writeFileSync(backupPath1, raw, 'utf-8');
fs.writeFileSync(backupPath2, raw, 'utf-8');

console.log('Backed up to:', backupPath1);
console.log('Backed up to:', backupPath2);

// Save metrics for comparison
const metrics = {
    subscribersBefore,
    reportsBefore,
    transactionsBefore,
    pointsBefore,
    timestamp: new Date().toISOString()
};
fs.writeFileSync(path.join(__dirname, 'migration_pre_metrics.json'), JSON.stringify(metrics, null, 2), 'utf-8');
console.log('Pre-migration metrics saved.');
