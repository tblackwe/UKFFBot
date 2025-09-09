/**
 * Test script to manually verify roster analyzer functionality
 * Run this to test the roster analysis with real Sleeper data
 */

const { analyzeLeagueRosters, formatAnalysisMessage } = require('./services/rosterAnalyzer');

async function testRosterAnalysis() {
    try {
        // Example league ID - replace with a real one for testing
        const testLeagueId = '123456789'; // Replace with actual league ID
        
        console.log('🔍 Testing roster analysis...');
        console.log(`Analyzing league: ${testLeagueId}`);
        
        const analysis = await analyzeLeagueRosters(testLeagueId);
        const message = formatAnalysisMessage(analysis);
        
        console.log('\n📊 Analysis Results:');
        console.log('='.repeat(50));
        console.log(message);
        console.log('='.repeat(50));
        
        console.log('\n📈 Summary:');
        console.log(`Total rosters: ${analysis.totalRosters}`);
        console.log(`Rosters with issues: ${analysis.rostersWithIssues}`);
        console.log(`Current week: ${analysis.currentWeek}`);
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        
        if (error.message.includes('failed') || error.message.includes('404')) {
            console.log('💡 Try using a valid Sleeper league ID');
        }
    }
}

// Only run if called directly
if (require.main === module) {
    testRosterAnalysis();
}

module.exports = { testRosterAnalysis };
