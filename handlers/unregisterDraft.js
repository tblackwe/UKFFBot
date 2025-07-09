const { getData, saveData } = require('../services/datastore.js');
const { handleCommandError, SUCCESS_MESSAGES, ERROR_MESSAGES } = require('../shared/messages.js');

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
            await say(SUCCESS_MESSAGES.DRAFT_UNREGISTERED(draftIdToRemove));
        } else {
            await say(ERROR_MESSAGES.NO_DRAFT_REGISTERED_SIMPLE);
        }
    } catch (error) {
        await handleCommandError('unregisterdraft', error, say);
    }
};

module.exports = { handleUnregisterDraftCommand };