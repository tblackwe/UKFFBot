const { getData, saveData } = require('../services/datastore.js');
const { handleCommandError, SUCCESS_MESSAGES } = require('../shared/messages.js');

/**
 * Handles the logic for the /registerdraft slash command.
 * It reads the existing data.json, updates the draft information,
 * and writes it back to the file.
 * @param {object} payload The payload from the Slack command.
 * @param {object} payload.command The command object.
 * @param {function} payload.say The function to send a message.
 */
const handleRegisterDraftCommand = async ({ command, say }) => {
    const draftId = command.text.trim();
    const channelId = command.channel_id;

    if (!draftId) {
        await say('Please provide a Sleeper Draft ID. Usage: `@YourBotName registerdraft [draft_id]`');
        return;
    }

    try {
        const data = await getData();

        // Ensure the drafts object exists
        if (!data.drafts) {
            data.drafts = {};
        }

        // Remove any other draft that might be registered to this channel to avoid duplicates.
        for (const id in data.drafts) {
            if (data.drafts[id].slack_channel_id === channelId) {
                delete data.drafts[id];
            }
        }

        // Add the new draft, keyed by its ID.
        data.drafts[draftId] = {
            slack_channel_id: channelId,
            last_known_pick_count: 0
        };

        await saveData(data);
        await say(SUCCESS_MESSAGES.DRAFT_REGISTERED(draftId));
    } catch (error) {
        await handleCommandError('/registerdraft', error, say);
    }
};

module.exports = { handleRegisterDraftCommand };