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
};