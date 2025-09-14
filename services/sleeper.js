/**
 * This module provides functions for interacting with the Sleeper API for read operations.
 * It uses the global fetch API, which is available in Node.js v18+ (maintained for compatibility).
 * If you are using an older version of Node.js, you may need to install a polyfill like 'node-fetch'.
 */

const API_BASE_URL = 'https://api.sleeper.app/v1';

/**
 * A helper function to fetch data from the Sleeper API.
 * @param {string} endpoint The API endpoint to call, starting with a '/'.
 * @returns {Promise<any>} The JSON response from the API.
 * @throws {Error} if the API request fails.
 */
async function sleeperRequest(endpoint) {
    const url = `${API_BASE_URL}${endpoint}`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Sleeper API request failed: ${response.status} ${response.statusText} - ${errorBody}`);
        }
        // The Sleeper API can return `null` for not-found resources with a 200 OK status.
        // response.json() will correctly parse this into a null value.
        return await response.json();
    } catch (error) {
        console.error(`Error fetching from ${url}:`, error);
        throw error; // Re-throw the error to be handled by the caller
    }
}

/**
 * Get a specific draft by its ID.
 * See: https://docs.sleeper.com/#get-a-specific-draft
 * @param {string} draftId The ID of the draft to retrieve.
 * @returns {Promise<object|null>} A draft object, or null if not found.
 */
const getDraft = (draftId) => {
    return sleeperRequest(`/draft/${draftId}`);
};

/**
 * Get all picks in a specific draft.
 * See: https://docs.sleeper.com/#get-all-picks-in-a-draft
 * @param {string} draftId The ID of the draft.
 * @returns {Promise<object[]>} An array of pick objects.
 */
const getDraftPicks = (draftId) => {
    return sleeperRequest(`/draft/${draftId}/picks`);
};

/**
 * Get all traded picks in a draft.
 * See: https://docs.sleeper.com/#get-all-traded-picks-in-a-draft
 * @param {string} draftId The ID of the draft.
 * @returns {Promise<object[]>} An array of traded pick objects.
 */
const getTradedPicks = (draftId) => {
    return sleeperRequest(`/draft/${draftId}/traded_picks`);
};

/**
 * Get all drafts for a user in a given sport and season.
 * See: https://docs.sleeper.com/#get-all-drafts-for-a-user
 * @param {string} userId The ID of the user.
 * @param {string} sport The sport (e.g., 'nfl').
 * @param {string} season The season year (e.g., '2024').
 * @returns {Promise<object[]>} An array of draft objects.
 */
const getUserDrafts = (userId, sport, season) => {
    return sleeperRequest(`/user/${userId}/drafts/${sport}/${season}`);
};

/**
 * Get user information by username.
 * See: https://docs.sleeper.com/#fetch-user
 * @param {string} username The username of the user to retrieve.
 * @returns {Promise<object|null>} A user object, or null if not found.
 */
const getUserByUsername = (username) => {
    return sleeperRequest(`/user/${username}`);
};

/**
 * Get league information by league ID.
 * See: https://docs.sleeper.com/#get-a-specific-league
 * @param {string} leagueId The ID of the league to retrieve.
 * @returns {Promise<object|null>} A league object, or null if not found.
 */
const getLeague = (leagueId) => {
    return sleeperRequest(`/league/${leagueId}`);
};

/**
 * Get all users in a league.
 * See: https://docs.sleeper.com/#get-users-in-a-league
 * @param {string} leagueId The ID of the league.
 * @returns {Promise<object[]>} An array of user objects in the league.
 */
const getLeagueUsers = (leagueId) => {
    return sleeperRequest(`/league/${leagueId}/users`);
};

/**
 * Get all rosters in a league.
 * See: https://docs.sleeper.com/#get-rosters-in-a-league
 * @param {string} leagueId The ID of the league.
 * @returns {Promise<object[]>} An array of roster objects in the league.
 */
const getLeagueRosters = (leagueId) => {
    return sleeperRequest(`/league/${leagueId}/rosters`);
};

/**
 * Get all players data from Sleeper.
 * See: https://docs.sleeper.com/#players
 * @param {string} sport The sport (e.g., 'nfl').
 * @returns {Promise<object>} Object containing all players data.
 */
const getAllPlayers = (sport = 'nfl') => {
    return sleeperRequest(`/players/${sport}`);
};

/**
 * Get current NFL state (week, season, etc.).
 * See: https://docs.sleeper.com/#get-nfl-state
 * @returns {Promise<object>} Object containing current NFL state.
 */
const getNflState = () => {
    return sleeperRequest('/state/nfl');
};

/**
 * Maps Sleeper team abbreviations to ESPN team abbreviations.
 * @param {string} sleeperTeam The team abbreviation from Sleeper.
 * @returns {string} The corresponding ESPN team abbreviation.
 */
function mapSleeperToEspnTeam(sleeperTeam) {
    const teamMap = {
        'WAS': 'WSH',  // Washington
        // Add other mappings if needed
    };
    return teamMap[sleeperTeam] || sleeperTeam;
}

/**
 * Get NFL schedule for a specific week and season using ESPN API.
 * @param {string|number} season The season year (e.g., '2025' or 2025).
 * @param {number} week The week number.
 * @returns {Promise<object[]>} Array of game objects for the week.
 */
const getNflSchedule = async (season, week) => {
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2&year=${season}`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`ESPN API request failed: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Transform ESPN data to our expected format
        const games = data.events?.map(event => {
            const competition = event.competitions?.[0];
            if (!competition) return null;
            
            // ESPN has competitors array where [0] is typically home, [1] is away
            // But we need to check the homeAway property to be sure
            const homeTeam = competition.competitors?.find(c => c.homeAway === 'home');
            const awayTeam = competition.competitors?.find(c => c.homeAway === 'away');
            
            // Map ESPN status to our expected format
            let status = 'scheduled';
            const espnStatus = competition.status?.type?.name;
            if (espnStatus === 'STATUS_FINAL' || espnStatus === 'STATUS_COMPLETED') {
                status = 'final';
            } else if (espnStatus === 'STATUS_IN_PROGRESS') {
                status = 'in_progress';
            }
            
            return {
                home_team: homeTeam?.team?.abbreviation,
                away_team: awayTeam?.team?.abbreviation,
                status: status,
                // Include additional useful data
                home_score: homeTeam?.score || 0,
                away_score: awayTeam?.score || 0,
                game_id: event.id,
                start_time: event.date
            };
        }).filter(game => game && game.home_team && game.away_team) || [];
        
        console.log(`Fetched ${games.length} games from ESPN API for ${season} week ${week}`);
        return games;
        
    } catch (error) {
        console.error(`Error fetching NFL schedule from ESPN API for ${season} week ${week}:`, error);
        throw error;
    }
};

module.exports = {
    getDraft,
    getDraftPicks,
    getTradedPicks,
    getUserDrafts,
    getUserByUsername,
    getLeague,
    getLeagueUsers,
    getLeagueRosters,
    getAllPlayers,
    getNflState,
    getNflSchedule,
};