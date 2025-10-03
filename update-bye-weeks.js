#!/usr/bin/env node
/**
 * Utility script to fetch and update NFL bye weeks for a given season using ESPN API
 * Usage: node update-bye-weeks.js [season]
 * Example: node update-bye-weeks.js 2025
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Complete ESPN team ID mapping (verified with ESPN API)
const ESPN_TEAM_ID_TO_ABBR = {
    1: 'ATL',   2: 'BUF',   3: 'CHI',   4: 'CIN',   5: 'CLE',   6: 'DAL',   7: 'DEN',   8: 'DET',
    9: 'GB',    10: 'TEN',  11: 'IND',  12: 'KC',   13: 'LV',   14: 'LAR',  15: 'MIA',  16: 'MIN',
    17: 'NE',   18: 'NO',   19: 'NYG',  20: 'NYJ',  21: 'PHI',  22: 'ARI',  23: 'PIT',  24: 'LAC',
    25: 'SF',   26: 'SEA',  27: 'TB',   28: 'WSH',  29: 'CAR',  30: 'JAX',  33: 'BAL',  34: 'HOU'
};

// Map ESPN abbreviations to Sleeper abbreviations (for consistency)
const ESPN_TO_SLEEPER_MAPPING = {
    'WSH': 'WAS'  // ESPN uses WSH, but Sleeper uses WAS
};

function makeRequest(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', reject);
    });
}

async function fetchByeWeeksForSeason(season) {
    console.log(`🏈 Fetching ${season} NFL Bye Weeks from ESPN API...\n`);
    
    const byeWeeksData = {};
    const weekResults = [];
    
    for (let week = 1; week <= 18; week++) {
        try {
            const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${season}/types/2/weeks/${week}`;
            const weekData = await makeRequest(url);
            
            const teamsOnBye = [];
            
            if (weekData.teamsOnBye && weekData.teamsOnBye.length > 0) {
                console.log(`Week ${week}: ${weekData.teamsOnBye.length} teams on bye`);
                
                for (const teamRef of weekData.teamsOnBye) {
                    const teamId = teamRef.$ref.match(/teams\/(\d+)/)?.[1];
                    if (teamId && ESPN_TEAM_ID_TO_ABBR[teamId]) {
                        let teamAbbr = ESPN_TEAM_ID_TO_ABBR[teamId];
                        
                        // Convert ESPN abbreviation to Sleeper format if needed
                        if (ESPN_TO_SLEEPER_MAPPING[teamAbbr]) {
                            console.log(`  - Team ID ${teamId}: ${teamAbbr} → ${ESPN_TO_SLEEPER_MAPPING[teamAbbr]} (Sleeper format)`);
                            teamAbbr = ESPN_TO_SLEEPER_MAPPING[teamAbbr];
                        } else {
                            console.log(`  - Team ID ${teamId}: ${teamAbbr}`);
                        }
                        
                        teamsOnBye.push(teamAbbr);
                    } else {
                        console.log(`  - Unknown team ID: ${teamId}`);
                    }
                }
            }
            
            weekResults.push({ week, teams: teamsOnBye });
            
            // Small delay to be respectful to the API
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            console.error(`Error fetching week ${week}:`, error.message);
            weekResults.push({ week, teams: [] });
        }
    }
    
    // Convert to bye weeks format
    weekResults.forEach(({ week, teams }) => {
        teams.forEach(team => {
            byeWeeksData[team] = week;
        });
    });
    
    return { byeWeeksData, weekResults };
}

function displayResults(season, byeWeeksData, weekResults) {
    console.log(`\n📊 ${season} NFL Bye Weeks Summary:`);
    console.log('='.repeat(70));
    
    // Group by week for display
    const byWeek = {};
    Object.entries(byeWeeksData).forEach(([team, week]) => {
        if (!byWeek[week]) byWeek[week] = [];
        byWeek[week].push(team);
    });
    
    Object.keys(byWeek).sort((a, b) => parseInt(a) - parseInt(b)).forEach(week => {
        const teams = byWeek[week].sort();
        console.log(`Week ${week.toString().padStart(2)} (${teams.length} teams): ${teams.join(', ')}`);
    });
    
    console.log(`\nTotal teams: ${Object.keys(byeWeeksData).length}`);
    
    console.log('\n📝 JavaScript Object Format:');
    console.log('='.repeat(70));
    console.log(`const NFL_BYE_WEEKS_${season} = {`);
    
    Object.keys(byWeek).sort((a, b) => parseInt(a) - parseInt(b)).forEach(week => {
        const teams = byWeek[week].sort();
        console.log(`    // Week ${week} byes`);
        const teamEntries = teams.map(team => `'${team}': ${week}`).join(', ');
        console.log(`    ${teamEntries},`);
    });
    
    console.log('};');
    
    // Validation
    console.log('\n🔍 Validation:');
    console.log('='.repeat(70));
    const allNflTeams = ['ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 
                        'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC', 'LV', 'LAC', 'LAR', 'MIA', 
                        'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SF', 'SEA', 'TB', 
                        'TEN', 'WAS'];
    
    const teamsWithByes = Object.keys(byeWeeksData).sort();
    const missingTeams = allNflTeams.filter(team => !teamsWithByes.includes(team));
    
    console.log(`Teams with bye weeks (${teamsWithByes.length}): ${teamsWithByes.join(', ')}`);
    if (missingTeams.length > 0) {
        console.log(`❌ Missing teams (${missingTeams.length}): ${missingTeams.join(', ')}`);
    } else {
        console.log('✅ All 32 NFL teams accounted for!');
    }
}

async function main() {
    const season = process.argv[2] || '2025';
    
    if (!/^\d{4}$/.test(season)) {
        console.error('❌ Invalid season format. Use 4-digit year (e.g., 2025)');
        process.exit(1);
    }
    
    try {
        const { byeWeeksData, weekResults } = await fetchByeWeeksForSeason(season);
        displayResults(season, byeWeeksData, weekResults);
        
        console.log(`\n✅ ${season} bye weeks fetching completed!`);
        console.log('\n📝 To update the code:');
        console.log('1. Copy the JavaScript object above');
        console.log('2. Update NFL_BYE_WEEKS_' + season + ' in services/nflDataCache.js');
        console.log('3. Clear the cache to use new data');
        
    } catch (error) {
        console.error('❌ Error fetching bye weeks:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { fetchByeWeeksForSeason };