/**
 * Quick roster check for league 1255182004954075136
 */

const { analyzeLeagueRosters, formatAnalysisMessage } = require('./services/rosterAnalyzer.js');

async function checkRosters() {
    const leagueId = '1255182004954075136';
    
    console.log('🏈 Checking Rosters for League', leagueId);
    console.log(`⏰ ${new Date().toISOString()}\n`);
    
    try {
        const analysis = await analyzeLeagueRosters(leagueId);
        
        console.log('📊 ROSTER ANALYSIS RESULTS:');
        console.log('=' .repeat(50));
        console.log(`League ID: ${analysis.leagueId}`);
        console.log(`Season: ${analysis.currentSeason}`);
        console.log(`Current Week: ${analysis.currentWeek}`);
        console.log(`Total Rosters: ${analysis.totalRosters}`);
        console.log(`Active Rosters: ${analysis.activeRosters}`);
        console.log(`Rosters with Issues: ${analysis.rostersWithIssues}`);
        console.log(`Is Guillotine League: ${analysis.isGuillotineLeague ? 'Yes' : 'No'}`);
        
        if (analysis.rostersWithIssues === 0) {
            console.log('\n✅ All rosters look good! No lineup issues found.');
        } else {
            console.log('\n⚠️  ROSTER ISSUES FOUND:');
            console.log('=' .repeat(50));
            
            analysis.rosterAnalysis.forEach((roster, index) => {
                console.log(`\n${index + 1}. ${roster.owner} (Roster ID: ${roster.rosterId})`);
                
                const issues = roster.issues;
                
                if (issues.startingByeWeekPlayers.length > 0) {
                    console.log(`   🚫 Starting Bye Week Players (${issues.startingByeWeekPlayers.length}):`);
                    issues.startingByeWeekPlayers.forEach(player => {
                        console.log(`      • ${player.name} (${player.position}, ${player.team})`);
                    });
                }
                
                if (issues.startingInjuredPlayers.length > 0) {
                    console.log(`   🏥 Starting Injured Players (${issues.startingInjuredPlayers.length}):`);
                    issues.startingInjuredPlayers.forEach(player => {
                        console.log(`      • ${player.name} (${player.position}, ${player.team}) - ${player.injuryStatus}`);
                    });
                }
                
                if (issues.emptyStartingSlots.length > 0) {
                    console.log(`   📭 Empty Starting Slots (${issues.emptyStartingSlots.length}):`);
                    issues.emptyStartingSlots.forEach(slot => {
                        console.log(`      • Slot ${slot.slotIndex + 1}: ${slot.expectedPosition}`);
                    });
                }
            });
        }
        
        console.log(`\n📊 Summary: ${analysis.rostersWithIssues} out of ${analysis.activeRosters} rosters need attention`);
        
    } catch (error) {
        console.error('❌ Error checking rosters:', error);
    }
}

checkRosters();