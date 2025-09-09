const { handler } = require('./lambda-roster-scheduler.js');

// Test the roster scheduler lambda
async function testRosterScheduler() {
    console.log('Testing roster scheduler...');
    
    try {
        const result = await handler({
            source: 'aws.events',
            'detail-type': 'Scheduled Event',
            time: new Date().toISOString()
        });
        
        console.log('Result:', result);
    } catch (error) {
        console.error('Error:', error);
    }
}

// Only run if this file is executed directly
if (require.main === module) {
    testRosterScheduler();
}

module.exports = { testRosterScheduler };
