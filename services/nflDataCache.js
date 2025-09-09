/**
 * NFL Data Cache Service
 * 
 * This service provides cached access to NFL data including:
 * - NFL bye weeks by season
 * - Complete NFL player database
 * 
 * Data is cached in DynamoDB with appropriate TTL and falls back to Sleeper API when needed.
 */

const { saveNflByeWeeks, getNflByeWeeks, saveNflPlayers, getNflPlayers } = require('./datastore.js');
const { getAllPlayers: sleeperGetAllPlayers, getNflState } = require('./sleeper.js');

/**
 * NFL teams and their bye weeks for 2025 season
 * This is the source of truth for bye weeks - can be updated manually
 * or potentially fetched from an external source in the future
 */
const NFL_BYE_WEEKS_2025 = {
    // Week 5 byes
    'DET': 5, 'LAC': 5, 'PHI': 5, 'TEN': 5,
    // Week 6 byes  
    'KC': 6, 'LAR': 6, 'MIA': 6, 'MIN': 6,
    // Week 7 byes
    'CHI': 7, 'DAL': 7,
    // Week 9 byes
    'CLE': 9, 'GB': 9, 'LV': 9, 'SEA': 9,
    // Week 10 byes
    'ATL': 10, 'DEN': 10, 'IND': 10, 'NE': 10,
    // Week 11 byes
    'BAL': 11, 'HOU': 11, 'WAS': 11, 'NYJ': 11,
    // Week 12 byes
    'ARI': 12, 'CAR': 12, 'NYG': 12, 'TB': 12,
    // Week 14 byes
    'BUF': 14, 'CIN': 14, 'JAX': 14, 'NO': 14, 'PIT': 14, 'SF': 14
};

/**
 * Future seasons can be added here as they become available
 */
const NFL_BYE_WEEKS_BY_SEASON = {
    2025: NFL_BYE_WEEKS_2025
    // 2026: NFL_BYE_WEEKS_2026 - to be added when available
};

/**
 * Get NFL bye weeks for a specific season with caching.
 * First checks cache, then falls back to hardcoded data.
 * 
 * @param {number} season The NFL season year (e.g., 2025).
 * @returns {Promise<object>} Object mapping team abbreviations to bye week numbers.
 */
async function getNflByeWeeksWithCache(season) {
    try {
        // Try to get from cache first
        const cachedByeWeeks = await getNflByeWeeks(season);
        if (cachedByeWeeks) {
            console.log(`Using cached NFL bye weeks for ${season} season`);
            return cachedByeWeeks;
        }

        // Fall back to hardcoded data
        const byeWeeks = NFL_BYE_WEEKS_BY_SEASON[season];
        if (!byeWeeks) {
            throw new Error(`No bye week data available for ${season} season`);
        }

        // Cache the bye weeks data
        await saveNflByeWeeks(season, byeWeeks);
        console.log(`Cached NFL bye weeks for ${season} season`);
        
        return byeWeeks;
    } catch (error) {
        console.error(`Error getting NFL bye weeks for ${season}:`, error);
        // Return hardcoded data as last resort
        return NFL_BYE_WEEKS_BY_SEASON[season] || {};
    }
}

/**
 * Get all NFL players with caching.
 * First checks cache, then falls back to Sleeper API.
 * 
 * @param {string} sport The sport (default: 'nfl').
 * @returns {Promise<object>} Object containing all players data.
 */
async function getAllPlayersWithCache(sport = 'nfl') {
    try {
        // Try to get from cache first
        const cachedPlayers = await getNflPlayers(sport);
        if (cachedPlayers) {
            console.log(`Using cached NFL players data for ${sport}`);
            return cachedPlayers;
        }

        // Fall back to Sleeper API
        console.log(`Fetching fresh NFL players data from Sleeper API for ${sport}`);
        const players = await sleeperGetAllPlayers(sport);
        
        if (!players) {
            throw new Error(`No players data received from Sleeper API for ${sport}`);
        }

        // Cache the players data
        await saveNflPlayers(sport, players);
        console.log(`Cached NFL players data for ${sport} (${Object.keys(players).length} players)`);
        
        return players;
    } catch (error) {
        console.error(`Error getting NFL players for ${sport}:`, error);
        throw error;
    }
}

/**
 * Force refresh of NFL players cache.
 * Useful for manual cache invalidation or scheduled updates.
 * 
 * @param {string} sport The sport (default: 'nfl').
 * @returns {Promise<object>} Fresh players data from API.
 */
async function refreshNflPlayersCache(sport = 'nfl') {
    try {
        console.log(`Force refreshing NFL players cache for ${sport}`);
        const players = await sleeperGetAllPlayers(sport);
        
        if (!players) {
            throw new Error(`No players data received from Sleeper API for ${sport}`);
        }

        await saveNflPlayers(sport, players);
        console.log(`Refreshed NFL players cache for ${sport} (${Object.keys(players).length} players)`);
        
        return players;
    } catch (error) {
        console.error(`Error refreshing NFL players cache for ${sport}:`, error);
        throw error;
    }
}

/**
 * Force refresh of NFL bye weeks cache.
 * Useful for manual cache invalidation or when bye weeks change.
 * 
 * @param {number} season The NFL season year.
 * @returns {Promise<object>} Bye weeks data.
 */
async function refreshNflByeWeeksCache(season) {
    try {
        const byeWeeks = NFL_BYE_WEEKS_BY_SEASON[season];
        if (!byeWeeks) {
            throw new Error(`No bye week data available for ${season} season`);
        }

        await saveNflByeWeeks(season, byeWeeks);
        console.log(`Refreshed NFL bye weeks cache for ${season} season`);
        
        return byeWeeks;
    } catch (error) {
        console.error(`Error refreshing NFL bye weeks cache for ${season}:`, error);
        throw error;
    }
}

/**
 * Get cache status for debugging/monitoring.
 * @returns {Promise<object>} Cache status information.
 */
async function getCacheStatus() {
    try {
        const currentSeason = 2025; // Could be derived from getNflState()
        
        const [byeWeeksCache, playersCache] = await Promise.allSettled([
            getNflByeWeeks(currentSeason),
            getNflPlayers('nfl')
        ]);

        return {
            byeWeeks: {
                cached: byeWeeksCache.status === 'fulfilled' && byeWeeksCache.value !== null,
                season: currentSeason,
                error: byeWeeksCache.status === 'rejected' ? byeWeeksCache.reason?.message : null
            },
            players: {
                cached: playersCache.status === 'fulfilled' && playersCache.value !== null,
                sport: 'nfl',
                playerCount: playersCache.status === 'fulfilled' && playersCache.value ? 
                    Object.keys(playersCache.value).length : 0,
                error: playersCache.status === 'rejected' ? playersCache.reason?.message : null
            }
        };
    } catch (error) {
        console.error('Error getting cache status:', error);
        return {
            error: error.message,
            byeWeeks: { cached: false, error: 'Unknown' },
            players: { cached: false, error: 'Unknown' }
        };
    }
}

module.exports = {
    getNflByeWeeksWithCache,
    getAllPlayersWithCache,
    refreshNflPlayersCache,
    refreshNflByeWeeksCache,
    getCacheStatus,
    NFL_BYE_WEEKS_2025,
    NFL_BYE_WEEKS_BY_SEASON
};
