const { getAllPlayers } = require('./services/sleeper');
const { extractEssentialPlayerData, expandMinimalPlayerData } = require('./services/nflDataCache');

async function testDefenseFix() {
    try {
        console.log('Testing defense name fix...');
        const players = await getAllPlayers('nfl');
        
        // Find a few DEF players
        const defPlayers = {};
        let count = 0;
        for (const [id, player] of Object.entries(players)) {
            if (player.active === true && player.fantasy_positions && player.fantasy_positions.includes('DEF') && count < 3) {
                defPlayers[id] = player;
                count++;
            }
        }
        
        console.log('Found', count, 'DEF players');
        
        console.log('\n=== ORIGINAL DEF PLAYERS ===');
        Object.entries(defPlayers).forEach(([id, player]) => {
            console.log(`${id}: full_name="${player.full_name}", first="${player.first_name}", last="${player.last_name}"`);
        });
        
        console.log('\n=== EXTRACTED MINIMAL ===');
        const minimal = extractEssentialPlayerData(defPlayers);
        console.log(JSON.stringify(minimal, null, 2));
        
        console.log('\n=== EXPANDED BACK ===');
        const expanded = expandMinimalPlayerData(minimal);
        console.log(JSON.stringify(expanded, null, 2));
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testDefenseFix();
