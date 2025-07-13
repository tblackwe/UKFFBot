/**
 * Utility functions for working with Slack users and resolving member IDs to usernames.
 */

/**
 * Resolves a Slack member ID to a username using the Slack Web API.
 * @param {object} app The Slack Bolt app instance.
 * @param {string} memberId The Slack member ID (e.g., 'U1234567890').
 * @returns {Promise<string|null>} The username or null if not found.
 */
async function resolveSlackUsername(app, memberId) {
    try {
        const result = await app.client.users.info({
            user: memberId
        });
        
        if (result.ok && result.user) {
            // Return display name if available, otherwise fall back to real name or username
            return result.user.profile?.display_name || 
                   result.user.profile?.real_name || 
                   result.user.name || 
                   memberId;
        }
        
        return null;
    } catch (error) {
        console.error(`Error resolving username for member ID ${memberId}:`, error);
        return null;
    }
}

/**
 * Resolves multiple Slack member IDs to usernames in batch.
 * @param {object} app The Slack Bolt app instance.
 * @param {Array<string>} memberIds Array of Slack member IDs.
 * @returns {Promise<Map<string, string>>} Map of member ID to username.
 */
async function resolveSlackUsernames(app, memberIds) {
    const usernameMap = new Map();
    
    // Process in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < memberIds.length; i += batchSize) {
        const batch = memberIds.slice(i, i + batchSize);
        const promises = batch.map(async (memberId) => {
            const username = await resolveSlackUsername(app, memberId);
            if (username) {
                usernameMap.set(memberId, username);
            }
        });
        
        await Promise.all(promises);
        
        // Add a small delay between batches to be respectful of rate limits
        if (i + batchSize < memberIds.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    return usernameMap;
}

/**
 * Updates all player slack names in the database using their member IDs.
 * @param {object} app The Slack Bolt app instance.
 * @param {object} datastore The datastore module.
 * @returns {Promise<number>} Number of players updated.
 */
async function updateAllPlayerSlackNames(app, datastore) {
    try {
        const players = await datastore.getAllPlayers();
        const memberIds = players
            .map(player => player.slackMemberId)
            .filter(memberId => memberId && memberId.startsWith('U')); // Valid Slack member IDs start with 'U'
        
        if (memberIds.length === 0) {
            console.log('No valid member IDs found to update');
            return 0;
        }
        
        console.log(`Resolving usernames for ${memberIds.length} member IDs...`);
        const usernameMap = await resolveSlackUsernames(app, memberIds);
        
        let updatedCount = 0;
        for (const player of players) {
            if (player.slackMemberId && usernameMap.has(player.slackMemberId)) {
                const newUsername = usernameMap.get(player.slackMemberId);
                if (newUsername !== player.slackName) {
                    await datastore.updatePlayerSlackName(player.sleeperId, newUsername);
                    console.log(`Updated player ${player.sleeperId}: ${player.slackName} -> ${newUsername}`);
                    updatedCount++;
                }
            }
        }
        
        console.log(`Updated ${updatedCount} player slack names`);
        return updatedCount;
    } catch (error) {
        console.error('Error updating player slack names:', error);
        throw error;
    }
}

module.exports = {
    resolveSlackUsername,
    resolveSlackUsernames,
    updateAllPlayerSlackNames
};
