const { updateAllPlayerSlackNames } = require('../services/slackUtils.js');
const { handleCommandError } = require('../shared/messages.js');
const datastore = require('../services/datastore.js');

/**
 * Handles the logic for the `updateplayers` command.
 * Updates all player slack names by resolving their member IDs to current usernames.
 * @param {object} payload The payload from the Slack command.
 * @param {object} payload.say The function to send a message.
 * @param {object} payload.client The Slack Web API client.
 */
const handleUpdatePlayersCommand = async ({ say, client, ack }) => {
    if (ack) await ack();
    try {
        await say('🔄 Updating player slack names...');
        
        const app = { client }; // Create app-like object for the utility function
        const updatedCount = await updateAllPlayerSlackNames(app, datastore);
        
        if (updatedCount > 0) {
            await say(`:white_check_mark: Successfully updated ${updatedCount} player slack names.`);
        } else {
            await say('✅ All player slack names are already up to date.');
        }
    } catch (error) {
        await handleCommandError('/updateplayers', error, say);
    }
};

module.exports = { handleUpdatePlayersCommand };
