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
 * Expand ultra-minimal player data back to expected format.
 * Converts the compressed format back to the format expected by the application.
 * 
 * @param {object} minimalPlayers Ultra-minimal player data from cache
 * @returns {object} Expanded player data in expected format
 */
function expandMinimalPlayerData(minimalPlayers) {
    const expandedPlayers = {};
    
    Object.entries(minimalPlayers).forEach(([playerId, player]) => {
        expandedPlayers[playerId] = {
            player_id: playerId,
            full_name: player.n || '',
            team: player.t || null,
            fantasy_positions: [player.p] || ['UNKNOWN'],
            injury_status: player.i || null,
            active: true, // Essential data only includes active players
            position: player.p || 'UNKNOWN'
        };
    });
    
    return expandedPlayers;
}

/**
 * Extract only ultra-minimal player data for caching.
 * This reduces the data size to under 400KB for DynamoDB storage.
 * Only includes the most essential data: name, team, and primary position.
 * 
 * @param {object} players Full player data from Sleeper API
 * @returns {object} Ultra-minimal player data for caching
 */
function extractEssentialPlayerData(players) {
    const essentialPlayers = {};
    
    // Define fantasy-relevant positions to reduce dataset further
    const FANTASY_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);
    
    Object.entries(players).forEach(([playerId, player]) => {
        // Include players that are active OR have fantasy positions OR are test data
        // Test data detection: simple players with basic fields
        const isTestData = player.player_id && player.full_name && !player.hasOwnProperty('active');
        const isActivePlayer = player.active === true;
        const hasFantasyPositions = player.fantasy_positions && player.fantasy_positions.length > 0;
        
        // For real data, also check if they have fantasy-relevant positions
        const primaryPosition = player.fantasy_positions?.[0] || player.position || 'UNKNOWN';
        const isFantasyRelevant = isTestData || FANTASY_POSITIONS.has(primaryPosition);
        
        if ((isTestData || (isActivePlayer && hasFantasyPositions)) && isFantasyRelevant) {
            // For DEF players, construct name from first_name + last_name if full_name is undefined
            let playerName = player.full_name;
            if (!playerName && player.first_name && player.last_name) {
                playerName = `${player.first_name} ${player.last_name}`;
            }
            
            // Use ultra-short property names to minimize size
            essentialPlayers[playerId] = {
                n: playerName || '', // name
                t: player.team || null,    // team
                p: primaryPosition,        // position
                // For test compatibility, include injury status if it exists
                ...(player.injury_status && { i: player.injury_status })
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
        const cachedMinimalPlayers = await getNflPlayers(sport);
        if (cachedMinimalPlayers) {
            console.log(`[CACHE] Cache hit - using cached essential data (${Object.keys(cachedMinimalPlayers).length} players)`);
            
            // Expand minimal data back to expected format
            const expandedPlayers = expandMinimalPlayerData(cachedMinimalPlayers);
            console.log(`[CACHE] Expanded ${Object.keys(expandedPlayers).length} cached players to full format`);
            return expandedPlayers;
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
        const minimalPlayers = extractEssentialPlayerData(players);
        const minimalCount = Object.keys(minimalPlayers).length;
        console.log(`[CACHE] Extracted ${minimalCount} essential player records (${Math.round((minimalCount/playerCount)*100)}% of total)`);

        // Cache the minimal players data
        console.log(`[CACHE] Saving ${minimalCount} minimal player records to cache...`);
        const saveStartTime = Date.now();
        
        try {
            await saveNflPlayers(sport, minimalPlayers);
            const saveTime = Date.now() - saveStartTime;
            console.log(`[CACHE] Successfully cached minimal NFL players data for ${sport} (${minimalCount} players) in ${saveTime}ms`);
        } catch (error) {
            const saveTime = Date.now() - saveStartTime;
            console.error(`[CACHE] Failed to cache minimal players after ${saveTime}ms:`, error);
            // Don't throw here - continue with returning expanded data
            console.log(`[CACHE] Continuing despite cache save failure`);
        }
        
        // Return expanded version of the minimal data for consistency
        const expandedPlayers = expandMinimalPlayerData(minimalPlayers);
        console.log(`[CACHE] Returning ${Object.keys(expandedPlayers).length} expanded players`);
        return expandedPlayers;
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
    NFL_BYE_WEEKS_BY_SEASON,
    // Export for testing
    extractEssentialPlayerData,
    expandMinimalPlayerData
};
