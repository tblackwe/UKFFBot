/**
 * Service for resolving Slack user information
 */

const { resolveSlackUsername } = require('./slackUtils.js');

/**
 * Resolves a Slack user input to both member ID and display name
 * @param {string} userInput - The user input (mention, member ID, or username)
 * @param {object} client - Slack client for API calls
 * @returns {Promise<object>} - Object with slackMemberId and slackName
 */
async function resolveSlackUser(userInput, client = null) {
    const { parseSlackUserInput } = require('../shared/inputValidation.js');
    const { memberId, isValidMemberId } = parseSlackUserInput(userInput);
    
    let slackMemberId = memberId;
    let slackName = memberId;
    
    if (isValidMemberId && client) {
        try {
            const resolvedName = await resolveSlackUsername({ client }, memberId);
            slackName = resolvedName || memberId;
        } catch (error) {
            console.warn(`Could not resolve username for ${memberId}:`, error);
            slackName = memberId;
        }
    }
    
    return {
        slackMemberId,
        slackName
    };
}

/**
 * Gets display name for a user, preferring the resolved name over member ID
 * @param {object} playerData - Player data from datastore
 * @param {boolean} forNotification - Whether this is for a notification (use mention format)
 * @returns {string} - Formatted display name
 */
function getDisplayName(playerData, forNotification = false) {
    if (!playerData) {
        return 'Unknown User';
    }
    
    if (forNotification && playerData.slackMemberId) {
        return `<@${playerData.slackMemberId}>`;
    }
    
    return playerData.slackName || playerData.slackMemberId || 'Unknown User';
}

module.exports = {
    resolveSlackUser,
    getDisplayName
};
