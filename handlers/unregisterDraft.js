const { getData, saveData } = require('../services/datastore.js');

/**
 * Handles the logic for the `unregisterdraft` command.
 * It finds and removes a draft registration associated with the current channel.
 * @param {object} payload The payload from the Slack command.
 * @param {object} payload.command The command object.
 * @param {function} payload.say The function to send a message.
 */
const handleUnregisterDraftCommand = async ({ command, say }) => {
    const channelId = command.channel_id;

    try {
        const data = await getData();

        const draftIdToRemove = Object.keys(data.drafts || {}).find(
            id => data.drafts[id].slack_channel_id === channelId
        );

        if (draftIdToRemove) {
            delete data.drafts[draftIdToRemove];
            await saveData(data);
            await say(`:white_check_mark: Successfully unregistered draft \`${draftIdToRemove}\` from this channel.`);
        } else {
            await say('There is no draft registered for this channel.');
        }
    } catch (error) {
        console.error("Error in unregisterdraft command:", error);
        await say(`:x: Sorry, I couldn't unregister the draft. There was an error updating my configuration.`);
    }
};

module.exports = { handleUnregisterDraftCommand };