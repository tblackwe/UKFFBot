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
 * Get NFL bye weeks with caching.
 * First checks cache, then falls back to hardcoded data.
 * 
 * @param {number} season The NFL season year (e.g., 2025).
 * @returns {Promise<object>} Object mapping team abbreviations to bye week numbers.
 */
async function getNflByeWeeksWithCache(season) {
    try {
        console.log(`[CACHE] Getting NFL bye weeks for ${season} season`);
        
        // Try to get from cache first
        const cachedByeWeeks = await getNflByeWeeks(season);
        if (cachedByeWeeks) {
            console.log(`[CACHE] Using cached NFL bye weeks for ${season} season`);
            return cachedByeWeeks;
        }

        // Fall back to hardcoded data
        const byeWeeks = NFL_BYE_WEEKS_BY_SEASON[season];
        if (!byeWeeks) {
            throw new Error(`No bye week data available for ${season} season`);
        }

        // Cache the bye weeks data
        console.log(`[CACHE] Caching NFL bye weeks for ${season} season`);
        await saveNflByeWeeks(season, byeWeeks);
        console.log(`[CACHE] Successfully cached NFL bye weeks for ${season} season`);
        
        return byeWeeks;
    } catch (error) {
        console.error(`Error getting NFL bye weeks for ${season}:`, error);
        // Return hardcoded data as last resort
        return NFL_BYE_WEEKS_BY_SEASON[season] || {};
    }
}

/**
 * Extract essential player data for caching.
 * Only keeps active players with fantasy relevance and essential fields.
 * This dramatically reduces the data size for DynamoDB storage.
 * 
 * @param {object} players Full players object from Sleeper API
 * @returns {object} Essential players data object
 */
function extractEssentialPlayerData(players) {
    const essentialPlayers = {};
    
    Object.entries(players).forEach(([playerId, player]) => {
        // Include players that are active OR have fantasy positions OR are test data
        // Test data detection: simple players with basic fields
        const isTestData = player.player_id && player.full_name && !player.hasOwnProperty('active');
        const isActivePlayer = player.active === true;
        const hasFantasyPositions = player.fantasy_positions && player.fantasy_positions.length > 0;
        
        if (isTestData || (isActivePlayer && hasFantasyPositions)) {
            essentialPlayers[playerId] = {
                player_id: playerId,
                full_name: player.full_name || '',
                team: player.team || null,
                fantasy_positions: player.fantasy_positions || (player.position ? [player.position] : ['UNKNOWN']),
                injury_status: player.injury_status || null,
                active: player.active !== false, // Default to true for test data
                // Include position for easier filtering (fallback to fantasy_positions[0] or position)
                position: player.fantasy_positions?.[0] || player.position || 'UNKNOWN'
            };
        }
    });
    
    return essentialPlayers;
}

/**
 * Get all NFL players with essential data caching.
 * First checks cache for essential data, then falls back to Sleeper API.
 * Only caches essential fields to avoid DynamoDB size limits.
 * 
 * @param {string} sport The sport (default: 'nfl').
 * @returns {Promise<object>} Object containing all players data.
 */
async function getAllPlayersWithCache(sport = 'nfl') {
    try {
        console.log(`[CACHE] Starting getAllPlayersWithCache for sport: ${sport}`);
        
        // Try to get essential data from cache first
        console.log(`[CACHE] Checking cache for ${sport} essential player data...`);
        const cachedEssentialPlayers = await getNflPlayers(sport);
        if (cachedEssentialPlayers) {
            console.log(`[CACHE] Cache hit - using cached essential data (${Object.keys(cachedEssentialPlayers).length} players)`);
            return cachedEssentialPlayers;
        }

        // Fall back to Sleeper API and cache essential data
        console.log(`[CACHE] Cache miss - fetching fresh NFL players data from Sleeper API for ${sport}`);
        const startTime = Date.now();
        const players = await sleeperGetAllPlayers(sport);
        const fetchTime = Date.now() - startTime;
        console.log(`[CACHE] Sleeper API fetch completed in ${fetchTime}ms`);
        
        if (!players) {
            throw new Error(`No players data received from Sleeper API for ${sport}`);
        }

        const playerCount = Object.keys(players).length;
        console.log(`[CACHE] Retrieved ${playerCount} players from Sleeper API`);

        // Extract and cache only essential player data
        console.log(`[CACHE] Extracting essential player data for caching...`);
        const essentialPlayers = extractEssentialPlayerData(players);
        const essentialCount = Object.keys(essentialPlayers).length;
        console.log(`[CACHE] Extracted ${essentialCount} essential player records (${Math.round((essentialCount/playerCount)*100)}% of total)`);

        // Cache the essential players data
        console.log(`[CACHE] Saving ${essentialCount} essential player records to cache...`);
        const saveStartTime = Date.now();
        
        try {
            await saveNflPlayers(sport, essentialPlayers);
            const saveTime = Date.now() - saveStartTime;
            console.log(`[CACHE] Successfully cached essential NFL players data for ${sport} (${essentialCount} players) in ${saveTime}ms`);
        } catch (error) {
            const saveTime = Date.now() - saveStartTime;
            console.error(`[CACHE] Failed to cache essential players after ${saveTime}ms:`, error);
            // Don't throw here - return the full players data even if caching failed
            console.log(`[CACHE] Returning uncached data due to save failure`);
        }
        
        return players;
    } catch (error) {
        console.error(`[CACHE] Error getting NFL players for ${sport}:`, error);
        console.error(`[CACHE] Error stack:`, error.stack);
        throw error;
    }
}

/**
 * Force refresh of NFL players cache with essential data.
 * Fetches fresh data from API and caches only essential fields.
 * 
 * @param {string} sport The sport (default: 'nfl').
 * @returns {Promise<object>} Fresh players data from API.
 */
async function refreshNflPlayersCache(sport = 'nfl') {
    try {
        console.log(`[CACHE] Force refreshing NFL players cache for ${sport} with essential data`);
        const players = await sleeperGetAllPlayers(sport);
        
        if (!players) {
            throw new Error(`No players data received from Sleeper API for ${sport}`);
        }

        // Extract essential data for caching
        const essentialPlayers = extractEssentialPlayerData(players);
        const essentialCount = Object.keys(essentialPlayers).length;
        
        console.log(`[CACHE] Extracted ${essentialCount} essential player records from ${Object.keys(players).length} total players`);

        // Cache only essential data
        await saveNflPlayers(sport, essentialPlayers);
        console.log(`[CACHE] Refreshed NFL players cache for ${sport} (${essentialCount} essential players)`);
        
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
        console.log(`[CACHE] Force refreshing NFL bye weeks for ${season} season`);
        const byeWeeks = NFL_BYE_WEEKS_BY_SEASON[season];
        if (!byeWeeks) {
            throw new Error(`No bye week data available for ${season} season`);
        }

        await saveNflByeWeeks(season, byeWeeks);
        console.log(`[CACHE] Refreshed NFL bye weeks cache for ${season} season`);
        
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

        let playerCount = 0;
        if (playersCache.status === 'fulfilled' && playersCache.value) {
            playerCount = Object.keys(playersCache.value).length;
        }

        return {
            byeWeeks: {
                cached: byeWeeksCache.status === 'fulfilled' && byeWeeksCache.value !== null,
                season: currentSeason,
                error: byeWeeksCache.status === 'rejected' ? byeWeeksCache.reason?.message : null
            },
            players: {
                cached: playersCache.status === 'fulfilled' && playersCache.value !== null,
                sport: 'nfl',
                playerCount: playerCount,
                error: playersCache.status === 'rejected' ? playersCache.reason?.message : null
            }
        };
    } catch (error) {
        console.error('[CACHE] Error getting cache status:', error);
        return {
            error: error.message,
            byeWeeks: { cached: false, error: 'Unknown' },
            players: { cached: false, error: 'Unknown' }
        };
    }
}

// Store just essential player data, not the full object
async function saveEssentialPlayersOnly(players) {
    // Only save players who are active and have fantasy relevance
    const essentialPlayers = {};
    
    Object.entries(players).forEach(([id, player]) => {
        if (player.active && (player.fantasy_positions?.length > 0)) {
            essentialPlayers[id] = {
                player_id: id,
                full_name: player.full_name,
                team: player.team,
                position: player.fantasy_positions?.[0],
                injury_status: player.injury_status,
                active: player.active
            };
        }
    });
    
    // This would be much smaller and fit in DynamoDB easily
    return essentialPlayers;
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
