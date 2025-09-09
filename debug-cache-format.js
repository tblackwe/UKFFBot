const { getNflPlayers } = require('./services/datastore');
const { expandMinimalPlayerData } = require('./services/nflDataCache');

async function debugCacheFormat() {
    try {
        console.log('Checking what format is being returned from cache...');
        
        const cachedPlayers = await getNflPlayers('nfl');
        if (!cachedPlayers) {
            console.log('No cached data found');
            return;
        }
        
        console.log('Cached data type:', typeof cachedPlayers);
        console.log('Cached data keys count:', Object.keys(cachedPlayers).length);
        
        // Check first player
        const firstPlayerId = Object.keys(cachedPlayers)[0];
        const firstPlayer = cachedPlayers[firstPlayerId];
        
        console.log('\n=== FIRST CACHED PLAYER ===');
        console.log('Player ID:', firstPlayerId);
        console.log('Player data:', JSON.stringify(firstPlayer, null, 2));
        
        // Check if it's in DynamoDB raw format
        if (firstPlayer && typeof firstPlayer === 'object' && firstPlayer.M) {
            console.log('\n⚠️  Data is in raw DynamoDB format!');
            console.log('Name from raw format:', firstPlayer.M?.n?.S);
            console.log('Team from raw format:', firstPlayer.M?.t?.S || firstPlayer.M?.t?.NULL);
            console.log('Position from raw format:', firstPlayer.M?.p?.S);
        } else if (firstPlayer && typeof firstPlayer === 'object' && firstPlayer.n) {
            console.log('\n✅ Data is in expected minimal format');
            console.log('Name:', firstPlayer.n);
            console.log('Team:', firstPlayer.t);
            console.log('Position:', firstPlayer.p);
            
            // Test expansion
            console.log('\n=== TESTING EXPANSION ===');
            const testData = { [firstPlayerId]: firstPlayer };
            const expanded = expandMinimalPlayerData(testData);
            console.log('Expanded player:', JSON.stringify(expanded[firstPlayerId], null, 2));
        } else {
            console.log('\n❓ Unexpected data format');
            console.log('Player structure:', Object.keys(firstPlayer || {}));
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

debugCacheFormat();
