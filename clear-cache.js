/**
 * Script to clear the existing NFL player cache and start fresh with roster-based caching
 */

const { clearNflPlayersCache } = require('./services/nflDataCache.js');

async function clearCache() {
    console.log('🗑️  CLEARING NFL PLAYER CACHE');
    console.log('=' .repeat(40));
    
    try {
        console.log('\n📋 Why are we clearing the cache?');
        console.log('• Old cache contains ALL ~3,000+ NFL players');
        console.log('• New system only caches players on rosters (~100-200 players)');
        console.log('• Starting fresh ensures optimal performance\n');
        
        await clearNflPlayersCache('nfl');
        
        console.log('\n✅ SUCCESS!');
        console.log('📊 Cache is now empty and ready for roster-based caching');
        console.log('🎯 Next roster analysis will populate cache with only roster players');
        console.log('💰 Expected storage reduction: ~99%');
        
    } catch (error) {
        console.error('\n❌ ERROR clearing cache:', error.message);
        process.exit(1);
    }
}

clearCache();
