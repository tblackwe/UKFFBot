const { getNflPlayers } = require('./services/datastore');
const { expandMinimalPlayerData } = require('./services/nflDataCache');

async function debugSpecificPlayer() {
    try {
        console.log('Checking player ID 111 (Marcedes Lewis)...');
        
        const cachedPlayers = await getNflPlayers('nfl');
        if (!cachedPlayers) {
            console.log('No cached data found');
            return;
        }
        
        const player111 = cachedPlayers['111'];
        
        console.log('\n=== PLAYER 111 ===');
        if (!player111) {
            console.log('❌ Player 111 not found in cache');
            console.log('Available player IDs (first 10):', Object.keys(cachedPlayers).slice(0, 10));
            
            // Check if there's a player with name containing "Marcedes"
            const marcedesPlayer = Object.entries(cachedPlayers).find(([id, player]) => 
                player.n && player.n.includes('Marcedes')
            );
            
            if (marcedesPlayer) {
                console.log('Found Marcedes player:', marcedesPlayer[0], ':', marcedesPlayer[1]);
            } else {
                console.log('No player found with name containing "Marcedes"');
            }
        } else {
            console.log('Player 111 raw data:', JSON.stringify(player111, null, 2));
            
            // Test expansion
            const testData = { '111': player111 };
            const expanded = expandMinimalPlayerData(testData);
            console.log('\nExpanded player 111:', JSON.stringify(expanded['111'], null, 2));
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

debugSpecificPlayer();
