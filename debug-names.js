const { getAllPlayers } = require('./services/sleeper');

async function checkForBadNames() {
    try {
        console.log('Checking for players with missing names...');
        const players = await getAllPlayers('nfl');
        
        let badNameCount = 0;
        const FANTASY_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
        
        for (const [id, player] of Object.entries(players)) {
            if (player.active === true && player.fantasy_positions && player.fantasy_positions.length > 0) {
                const primaryPosition = player.fantasy_positions[0];
                if (FANTASY_POSITIONS.includes(primaryPosition)) {
                    if (!player.full_name || player.full_name.trim() === '') {
                        badNameCount++;
                        console.log('Player with empty name:');
                        console.log('  ID:', id);
                        console.log('  full_name:', JSON.stringify(player.full_name));
                        console.log('  first_name:', player.first_name);
                        console.log('  last_name:', player.last_name);
                        console.log('  team:', player.team);
                        console.log('  position:', primaryPosition);
                        console.log('---');
                        
                        if (badNameCount >= 5) break;
                    }
                }
            }
        }
        
        console.log('Total players with empty names:', badNameCount);
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

checkForBadNames();
