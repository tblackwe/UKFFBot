#!/usr/bin/env node
/**
 * Manual tool to fetch NFL bye weeks for a season and print them in the format
 * used by the hardcoded fallback tables in services/nflDataCache.js.
 *
 * The bot fetches bye weeks from ESPN automatically at runtime (see
 * services/espn.js + getNflByeWeeksWithCache); this script is only needed to
 * regenerate the hardcoded fallback when you want a reviewed, committed copy.
 *
 * Usage: node update-bye-weeks.js [season]
 * Example: node update-bye-weeks.js 2026
 */

const { fetchNflByeWeeks } = require('./services/espn.js');

function displayResults(season, byeWeeksData) {
    console.log(`\n📊 ${season} NFL Bye Weeks Summary:`);
    console.log('='.repeat(70));

    // Group teams by bye week for display.
    const byWeek = {};
    Object.entries(byeWeeksData).forEach(([team, week]) => {
        if (!byWeek[week]) byWeek[week] = [];
        byWeek[week].push(team);
    });

    const sortedWeeks = Object.keys(byWeek).sort((a, b) => parseInt(a) - parseInt(b));
    sortedWeeks.forEach((week) => {
        const teams = byWeek[week].sort();
        console.log(`Week ${week.toString().padStart(2)} (${teams.length} teams): ${teams.join(', ')}`);
    });

    console.log(`\nTotal teams: ${Object.keys(byeWeeksData).length}`);

    console.log('\n📝 JavaScript Object Format (for nflDataCache.js fallback):');
    console.log('='.repeat(70));
    console.log(`const NFL_BYE_WEEKS_${season} = {`);
    sortedWeeks.forEach((week) => {
        const teams = byWeek[week].sort();
        console.log(`    // Week ${week} byes`);
        console.log(`    ${teams.map((team) => `'${team}': ${week}`).join(', ')},`);
    });
    console.log('};');
}

async function main() {
    const season = process.argv[2] || String(new Date().getFullYear());

    if (!/^\d{4}$/.test(season)) {
        console.error('❌ Invalid season format. Use a 4-digit year (e.g., 2026)');
        process.exit(1);
    }

    try {
        console.log(`🏈 Fetching ${season} NFL bye weeks from ESPN...`);
        const byeWeeksData = await fetchNflByeWeeks(season);
        displayResults(season, byeWeeksData);

        console.log(`\n✅ ${season} bye weeks fetched and validated (all 32 teams).`);
        console.log('\n📝 To refresh the hardcoded fallback:');
        console.log(`1. Copy the object above into NFL_BYE_WEEKS_${season} in services/nflDataCache.js`);
        console.log(`2. Register it in NFL_BYE_WEEKS_BY_SEASON`);
        console.log('(The bot already uses live ESPN data at runtime; this is only the fallback.)');
    } catch (error) {
        console.error(`❌ Error fetching bye weeks for ${season}:`, error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { fetchNflByeWeeks };
