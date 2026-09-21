const { dataManager, OWNER_CHAT_ID } = require('./dataManager');
const fs = require('fs');
const path = require('path');

async function test() {
    console.log('--- Testing DataManager Initialization & Migration ---');
    const pre = JSON.parse(fs.readFileSync(path.join(__dirname, 'migration_pre_metrics.json'), 'utf-8'));

    await dataManager.init();

    const subs = await dataManager.getAllSubscribers();
    const reports = await dataManager.getAllReports();
    const txs = await dataManager.getTransactions();
    const stats = await dataManager.getStats();

    const metadata = await dataManager.getMetadata();
    const subscribersAfter = metadata.metrics ? metadata.metrics.subscribers : subs.length;
    const reportsAfter = metadata.metrics ? metadata.metrics.reports : reports.total;
    const transactionsAfter = metadata.metrics ? metadata.metrics.transactions : txs.length;
    const pointsAfter = metadata.metrics ? metadata.metrics.points : stats.totalPoints;

    console.log('\n--- VERIFICATION COMPARISON (Migration Record) ---');
    console.log(`Subscribers:  Before = ${pre.subscribersBefore} | Migrated = ${subscribersAfter} | Match: ${pre.subscribersBefore === subscribersAfter}`);
    console.log(`Reports:      Before = ${pre.reportsBefore} | Migrated = ${reportsAfter} | Match: ${pre.reportsBefore === reportsAfter}`);
    console.log(`Transactions: Before = ${pre.transactionsBefore} | Migrated = ${transactionsAfter} | Match: ${pre.transactionsBefore === transactionsAfter}`);
    console.log(`Points:       Before = ${pre.pointsBefore} | Migrated = ${pointsAfter} | Match: ${pre.pointsBefore === pointsAfter}`);

    if (pre.subscribersBefore !== subscribersAfter ||
        pre.reportsBefore !== reportsAfter ||
        pre.transactionsBefore !== transactionsAfter ||
        pre.pointsBefore !== pointsAfter) {
        console.error('❌ FATAL: Integrity check failed!');
        process.exit(1);
    }

    console.log(`\n--- VERIFYING OWNER ACCOUNT ${OWNER_CHAT_ID} ---`);
    const owner = await dataManager.getSubscriber(OWNER_CHAT_ID);
    console.log('Owner username:', owner.username);
    console.log('Owner status:', owner.status);
    console.log('Owner plan:', owner.plan);
    console.log('Owner points:', owner.points);
    console.log('Owner subscriptionDays:', owner.subscriptionDays);
    console.log('Owner report_payment_source:', owner.report_payment_source);

    if (owner.points !== 10000 || owner.subscriptionDays < 360 || owner.status !== 'active' || owner.plan !== 'unlimited') {
        console.error('❌ FATAL: Owner account values incorrect!');
        process.exit(1);
    }

    console.log('\n--- VERIFYING REPORT DETAILS IN REPORTS.JSON ---');
    const rep = await dataManager.getReportById('GSL26091549804');
    console.log('Report ID:', rep.id);
    console.log('Patient Name:', rep.patient_name);
    console.log('Short URL:', rep.short_url);
    console.log('National ID:', rep.national_id);
    console.log('Service Code:', rep.service_code);

    if (!rep || rep.id !== 'GSL26091549804' || rep.patient_name !== 'ريان أحمد الغامدي') {
        console.error('❌ FATAL: Report data corrupted or missing!');
        process.exit(1);
    }

    console.log('\n✅ ALL INTEGRITY AND DATA CHECKS PASSED 100%!');
}

test().catch(err => {
    console.error('Error during test:', err);
    process.exit(1);
});
