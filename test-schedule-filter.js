const { hasTeamPlayedThisWeek } = require('./services/nflDataCache.js');

// Test the hasTeamPlayedThisWeek function
function testHasTeamPlayedThisWeek() {
    console.log('Testing hasTeamPlayedThisWeek function...');
    
    // Mock schedule data
    const mockSchedule = [
        {
            home_team: 'KC',
            away_team: 'DEN',
            status: 'final' // Game completed
        },
        {
            home_team: 'SF',
            away_team: 'LAR',
            status: 'scheduled' // Game not yet played
        }
    ];
    
    // Test cases
    console.log('KC has played:', hasTeamPlayedThisWeek('KC', mockSchedule)); // Should be true
    console.log('DEN has played:', hasTeamPlayedThisWeek('DEN', mockSchedule)); // Should be true
    console.log('SF has played:', hasTeamPlayedThisWeek('SF', mockSchedule)); // Should be false
    console.log('LAR has played:', hasTeamPlayedThisWeek('LAR', mockSchedule)); // Should be false
    console.log('CHI has played:', hasTeamPlayedThisWeek('CHI', mockSchedule)); // Should be false (not in schedule)
    console.log('No team:', hasTeamPlayedThisWeek(null, mockSchedule)); // Should be false
    console.log('No schedule:', hasTeamPlayedThisWeek('KC', null)); // Should be false
}

// Only run if this file is executed directly
if (require.main === module) {
    testHasTeamPlayedThisWeek();
}

module.exports = { testHasTeamPlayedThisWeek };
