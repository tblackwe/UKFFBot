/**
 * Cache Management Command Handler
 * 
 * Provides commands to manage and monitor the NFL data cache.
 * These commands are useful for debugging and manual cache management.
 */

const { getCacheStatus, refreshNflPlayersCache, refreshNflByeWeeksCache } = require('../services/nflDataCache.js');
const { getNflState } = require('../services/sleeper.js');

/**
 * Handle cache status command - shows current cache state
 * @param {object} params Command parameters
 * @param {object} params.client Slack Bolt client
 * @param {object} params.ack Slack acknowledgment function
 * @param {object} params.respond Slack response function
 * @param {object} params.command Slack command object
 * @returns {Promise<void>}
 */
async function handleCacheStatusCommand({ client, ack, respond, command }) {
    await ack();
    
    try {
        const cacheStatus = await getCacheStatus();
        
        const statusMessage = [
            '📊 **NFL Data Cache Status**\n',
            `**Bye Weeks (${cacheStatus.byeWeeks.season}):**`,
            `  • Cached: ${cacheStatus.byeWeeks.cached ? '✅' : '❌'}`,
            cacheStatus.byeWeeks.error ? `  • Error: ${cacheStatus.byeWeeks.error}` : '',
            '',
            `**Players (${cacheStatus.players.sport.toUpperCase()}):**`,
            `  • Cached: ${cacheStatus.players.cached ? '✅' : '❌'}`,
            cacheStatus.players.playerCount > 0 ? `  • Players: ${cacheStatus.players.playerCount.toLocaleString()}` : '',
            cacheStatus.players.error ? `  • Error: ${cacheStatus.players.error}` : '',
            '',
            cacheStatus.error ? `**Global Error:** ${cacheStatus.error}` : '',
            `*Checked at ${new Date().toLocaleString()}*`
        ].filter(line => line !== '').join('\n');

        await respond({
            text: statusMessage,
            response_type: 'in_channel'
        });

    } catch (error) {
        console.error('Error getting cache status:', error);
        await respond({
            text: `❌ Error checking cache status: ${error.message}`,
            response_type: 'ephemeral'
        });
    }
}

/**
 * Handle cache refresh command - refreshes NFL data caches
 * @param {object} params Command parameters
 * @param {object} params.client Slack Bolt client
 * @param {object} params.ack Slack acknowledgment function
 * @param {object} params.respond Slack response function
 * @param {object} params.command Slack command object
 * @returns {Promise<void>}
 */
async function handleCacheRefreshCommand({ client, ack, respond, command }) {
    await ack();
    
    try {
        // Show initial "working" message
        await respond({
            text: '🔄 Refreshing NFL data caches...',
            response_type: 'ephemeral'
        });

        // Get current season
        const nflState = await getNflState();
        const currentSeason = nflState.season;

        // Refresh both caches in parallel
        const [playersResult, byeWeeksResult] = await Promise.allSettled([
            refreshNflPlayersCache('nfl'),
            refreshNflByeWeeksCache(currentSeason)
        ]);

        const results = [];
        
        if (playersResult.status === 'fulfilled') {
            const playerCount = Object.keys(playersResult.value).length;
            results.push(`✅ **Players Cache:** Refreshed with ${playerCount.toLocaleString()} players`);
        } else {
            results.push(`❌ **Players Cache:** Failed - ${playersResult.reason.message}`);
        }

        if (byeWeeksResult.status === 'fulfilled') {
            const teamCount = Object.keys(byeWeeksResult.value).length;
            results.push(`✅ **Bye Weeks Cache:** Refreshed for ${currentSeason} season (${teamCount} teams)`);
        } else {
            results.push(`❌ **Bye Weeks Cache:** Failed - ${byeWeeksResult.reason.message}`);
        }

        const successMessage = [
            '🔄 **Cache Refresh Complete**\n',
            ...results,
            '',
            `*Completed at ${new Date().toLocaleString()}*`
        ].join('\n');

        await respond({
            text: successMessage,
            response_type: 'in_channel'
        });

    } catch (error) {
        console.error('Error refreshing cache:', error);
        await respond({
            text: `❌ Error refreshing cache: ${error.message}`,
            response_type: 'ephemeral'
        });
    }
}

module.exports = {
    handleCacheStatusCommand,
    handleCacheRefreshCommand
};
