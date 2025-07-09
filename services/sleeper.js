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

module.exports = {
    getDraft,
    getDraftPicks,
    getTradedPicks,
    getUserDrafts,
};