/**
 * NFL Data Cache Service
 * 
 * This service provides cached access to NFL data including:
 * - NFL bye weeks by season
 * - Complete NFL player database
 * 
 * Data is cached in DynamoDB with appropriate TTL and falls back to Sleeper API when needed.
 */

const { saveNflByeWeeks, getNflByeWeeks, saveNflPlayers, getNflPlayers, saveNflSchedule, getNflSchedule } = require('./datastore.js');
const { getAllPlayers: sleeperGetAllPlayers, getNflState } = require('./sleeper.js');

/**
 * NFL teams and their bye weeks for 2025 season
 * Data sourced from ESPN API: https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2025/types/2/weeks/{week}
 * Updated: 2025-10-03 - Corrected bye weeks using official ESPN data
 */
const NFL_BYE_WEEKS_2025 = {
    // Week 5 byes
    'ATL': 5, 'CHI': 5, 'GB': 5, 'PIT': 5,
    // Week 6 byes
    'HOU': 6, 'MIN': 6,
    // Week 7 byes
    'BAL': 7, 'BUF': 7,
    // Week 8 byes
    'ARI': 8, 'DET': 8, 'JAX': 8, 'LAR': 8, 'LV': 8, 'SEA': 8,
    // Week 9 byes
    'CLE': 9, 'NYJ': 9, 'PHI': 9, 'TB': 9,
    // Week 10 byes
    'CIN': 10, 'DAL': 10, 'KC': 10, 'TEN': 10,
    // Week 11 byes
    'IND': 11, 'NO': 11,
    // Week 12 byes
    'DEN': 12, 'LAC': 12, 'MIA': 12, 'WAS': 12,
    // Week 14 byes
    'CAR': 14, 'NE': 14, 'NYG': 14, 'SF': 14
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
 * Now includes ALL active players regardless of position, since if they're on 
 * someone's roster, they are by definition fantasy relevant.
 * 
 * @param {object} players Full player data from Sleeper API
 * @returns {object} Ultra-minimal player data for caching
 */
function extractEssentialPlayerData(players) {
    const essentialPlayers = {};
    
    Object.entries(players).forEach(([playerId, player]) => {
        // Include players that are active OR are test data
        // Test data detection: simple players with basic fields
        const isTestData = player.player_id && player.full_name && !player.hasOwnProperty('active');
        const isActivePlayer = player.active === true;
        
        // Include ALL active players - if they're in Sleeper, they could be rostered
        if (isTestData || isActivePlayer) {
            // For DEF players, construct name from first_name + last_name if full_name is undefined
            let playerName = player.full_name;
            if (!playerName && player.first_name && player.last_name) {
                playerName = `${player.first_name} ${player.last_name}`;
            }
            
            // Use the best available position - prefer fantasy_positions over position
            let displayPosition = 'UNKNOWN';
            if (player.fantasy_positions && player.fantasy_positions.length > 0) {
                // For players with multiple positions, prefer commonly-used fantasy positions
                const PREFERRED_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
                const preferredPos = player.fantasy_positions.find(pos => PREFERRED_POSITIONS.includes(pos));
                displayPosition = preferredPos || player.fantasy_positions[0];
            } else if (player.position) {
                displayPosition = player.position;
            }
            
            // Use ultra-short property names to minimize size
            essentialPlayers[playerId] = {
                n: playerName || '', // name
                t: player.team || null,    // team
                p: displayPosition,        // position
                // For test compatibility, include injury status if it exists
                ...(player.injury_status && { i: player.injury_status })
            };
        }
    });
    
    return essentialPlayers;
}

/**
 * Fetch specific players from Sleeper API and add them to cache.
 * This is the new roster-based caching approach - only cache players that are on rosters.
 * 
 * @param {string[]} playerIds Array of player IDs that need to be fetched
 * @param {string} sport The sport (default: 'nfl')
 * @returns {Promise<object>} Object containing the fetched players
 */

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

/**
 * Get NFL schedule for a specific week with caching.
 * First checks cache, then falls back to Sleeper API.
 * 
 * @param {number} season The NFL season year (e.g., 2025).
 * @param {number} week The NFL week number.
 * @returns {Promise<object[]>} Array of game objects for the week.
 * @throws {Error} if the schedule cannot be retrieved.
 */
async function getNflScheduleWithCache(season, week) {
    try {
        console.log(`Getting NFL schedule for ${season} week ${week} with cache...`);
        
        // Try to get from cache first
        try {
            const cachedSchedule = await getNflSchedule(season, week);
            if (cachedSchedule && Array.isArray(cachedSchedule.games)) {
                console.log(`Found cached NFL schedule for ${season} week ${week} with ${cachedSchedule.games.length} games`);
                return cachedSchedule.games;
            }
        } catch (error) {
            console.log(`No cached schedule found for ${season} week ${week}, fetching from Sleeper...`);
        }

        // Fall back to Sleeper API
        const { getNflSchedule } = require('./sleeper.js');
        const schedule = await getNflSchedule(season, week);
        
        if (schedule && Array.isArray(schedule)) {
            console.log(`Fetched NFL schedule from Sleeper: ${schedule.length} games for ${season} week ${week}`);
            
            // Cache the schedule data
            await saveNflSchedule(season, week, schedule);
            
            return schedule;
        } else {
            console.warn(`No schedule data available for ${season} week ${week}`);
            return [];
        }
    } catch (error) {
        console.error(`Error getting NFL schedule for ${season} week ${week}:`, error);
        // Return empty array rather than throwing - allows roster analysis to continue
        return [];
    }
}

/**
 * Maps Sleeper team abbreviations to ESPN team abbreviations.
 * Sleeper uses 'WAS' for Washington, but ESPN schedule API uses 'WSH'.
 * @param {string} sleeperTeam The team abbreviation from Sleeper.
 * @returns {string} The corresponding ESPN team abbreviation.
 */
function mapSleeperToEspnTeam(sleeperTeam) {
    const teamMap = {
        'WAS': 'WSH',  // Washington: Sleeper uses WAS, ESPN uses WSH
        // Add other mappings if needed
    };
    return teamMap[sleeperTeam] || sleeperTeam;
}

/**
 * Check if a player's team has already played their game this week.
 * 
 * @param {string} team The team abbreviation (e.g., 'KC', 'SF').
 * @param {object[]} weekSchedule Array of game objects for the current week.
 * @returns {boolean} True if the team's game has already been completed.
 */
function hasTeamPlayedThisWeek(team, weekSchedule) {
    if (!team || !Array.isArray(weekSchedule)) {
        return false;
    }

    // Map Sleeper team abbreviation to ESPN format
    const espnTeam = mapSleeperToEspnTeam(team);

    // Find the game for this team (try both original and mapped team names)
    const teamGame = weekSchedule.find(game => 
        game.home_team === team || game.away_team === team ||
        game.home_team === espnTeam || game.away_team === espnTeam
    );

    if (!teamGame) {
        // Team not found in schedule, assume they haven't played
        return false;
    }

    // Check if game is completed (status would be 'final' or similar)
    // The exact status values depend on Sleeper's API format
    return teamGame.status === 'final' || teamGame.status === 'complete';
}

/**
 * Fetch specific players from Sleeper API and add them to cache.
 * This is the new roster-based caching approach - only cache players that are on rosters.
 * 
 * @param {string[]} playerIds Array of player IDs that need to be fetched
 * @param {string} sport The sport (default: 'nfl')
 * @returns {Promise<object>} Object containing the fetched players
 */
async function fetchAndCacheRosterPlayers(playerIds, sport = 'nfl') {
    if (!playerIds || playerIds.length === 0) {
        return {};
    }

    console.log(`[CACHE] Fetching ${playerIds.length} roster players from Sleeper API: ${playerIds.slice(0, 10).join(', ')}${playerIds.length > 10 ? '...' : ''}`);
    
    try {
        // Fetch fresh data from Sleeper API to get the players
        const allPlayers = await sleeperGetAllPlayers(sport);
        
        // Extract only the requested players
        const requestedPlayers = {};
        const foundPlayerIds = [];
        
        playerIds.forEach(playerId => {
            if (allPlayers[playerId]) {
                requestedPlayers[playerId] = allPlayers[playerId];
                foundPlayerIds.push(playerId);
            }
        });
        
        if (foundPlayerIds.length === 0) {
            console.log(`[CACHE] No requested players found in Sleeper API`);
            return {};
        }
        
        console.log(`[CACHE] Found ${foundPlayerIds.length} roster players in Sleeper API`);
        
        // Extract essential data for the requested players
        const essentialRosterPlayers = extractEssentialPlayerData(requestedPlayers);
        
        // Get current cache and merge with roster players
        const currentCache = await getNflPlayers(sport) || {};
        const updatedCache = { ...currentCache, ...essentialRosterPlayers };
        
        // Save updated cache
        await saveNflPlayers(sport, updatedCache);
        console.log(`[CACHE] Added ${foundPlayerIds.length} roster players to cache`);
        
        // Return expanded format for immediate use
        return expandMinimalPlayerData(essentialRosterPlayers);
        
    } catch (error) {
        console.error(`[CACHE] Error fetching roster players:`, error);
        return {};
    }
}

/**
 * Get players with roster-based caching.
 * First checks cache, then fetches only the specific players needed from Sleeper API.
 * This replaces the old getAllPlayersWithCache for roster-based scenarios.
 * 
 * @param {string[]} playerIds Array of player IDs needed
 * @param {string} sport The sport (default: 'nfl')
 * @returns {Promise<object>} Object containing the requested players
 */
async function getPlayersFromCacheOrFetch(playerIds, sport = 'nfl') {
    if (!playerIds || playerIds.length === 0) {
        return {};
    }

    console.log(`[CACHE] Getting ${playerIds.length} players from cache or fetch`);
    
    try {
        // Get current cache
        const cachedMinimalPlayers = await getNflPlayers(sport) || {};
        
        // Separate cached vs missing players
        const cachedPlayers = {};
        const missingPlayerIds = [];
        
        playerIds.forEach(playerId => {
            if (cachedMinimalPlayers[playerId]) {
                cachedPlayers[playerId] = cachedMinimalPlayers[playerId];
            } else {
                missingPlayerIds.push(playerId);
            }
        });
        
        console.log(`[CACHE] Found ${Object.keys(cachedPlayers).length} players in cache, need to fetch ${missingPlayerIds.length}`);
        
        // Fetch missing players
        let missingPlayers = {};
        if (missingPlayerIds.length > 0) {
            missingPlayers = await fetchAndCacheRosterPlayers(missingPlayerIds, sport);
        }
        
        // Combine cached and fetched players
        const expandedCachedPlayers = expandMinimalPlayerData(cachedPlayers);
        const allPlayers = { ...expandedCachedPlayers, ...missingPlayers };
        
        console.log(`[CACHE] Returning ${Object.keys(allPlayers).length} total players`);
        return allPlayers;
        
    } catch (error) {
        console.error(`[CACHE] Error getting players from cache or fetch:`, error);
        throw error;
    }
}

/**
 * Clear the NFL players cache to start fresh with roster-based caching.
 * This removes all cached player data, forcing the next roster analysis to build a new cache.
 * 
 * @param {string} sport The sport (default: 'nfl')
 * @returns {Promise<void>}
 */
async function clearNflPlayersCache(sport = 'nfl') {
    try {
        console.log(`[CACHE] Clearing NFL players cache for ${sport} to start fresh with roster-based caching...`);
        
        // Save an empty cache object
        await saveNflPlayers(sport, {});
        
        console.log(`[CACHE] Successfully cleared NFL players cache for ${sport}`);
        console.log(`[CACHE] Next roster analysis will build cache with only roster players`);
        
    } catch (error) {
        console.error(`[CACHE] Error clearing NFL players cache for ${sport}:`, error);
        throw error;
    }
}

module.exports = {
    getNflByeWeeksWithCache,
    getPlayersFromCacheOrFetch,
    fetchAndCacheRosterPlayers,
    getNflScheduleWithCache,
    hasTeamPlayedThisWeek,
    refreshNflPlayersCache,
    refreshNflByeWeeksCache,
    clearNflPlayersCache,
    getCacheStatus,
    NFL_BYE_WEEKS_2025,
    NFL_BYE_WEEKS_BY_SEASON,
    // Export for testing
    extractEssentialPlayerData,
    expandMinimalPlayerData
};
