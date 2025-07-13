const { getData, saveDraft } = require('../services/datastore.js');
const { handleCommandError, SUCCESS_MESSAGES } = require('../shared/messages.js');
const { parseDraftId } = require('../shared/inputValidation.js');

/**
 * Handles the logic for the `register draft` command.
 * It validates the draft ID and registers it to the current channel.
 * @param {object} payload The payload from the Slack command.
 * @param {object} payload.command The command object.
 * @param {function} payload.say The function to send a message.
 */
const handleRegisterDraftCommand = async ({ command, say }) => {
    const channelId = command.channel_id;
    
    // Validate and parse draft ID
    const { isValid, draftId, errorMessage } = parseDraftId(command.text);
    if (!isValid) {
        await say(errorMessage);
        return;
    }

    try {
        // Check for existing draft registration in this channel
        const data = await getData();
        let existingDraftId = null;
        
        if (data.drafts) {
            for (const id in data.drafts) {
                if (data.drafts[id].slack_channel_id === channelId) {
                    existingDraftId = id;
                    break;
                }
            }
        }

        // Save the new draft registration
        await saveDraft(draftId, channelId, 0);
        
        const message = existingDraftId 
            ? `:white_check_mark: Successfully registered draft \`${draftId}\` to this channel (replaced previous draft \`${existingDraftId}\`).`
            : SUCCESS_MESSAGES.DRAFT_REGISTERED(draftId);
        
        await say(message);
    } catch (error) {
        await handleCommandError('register draft', error, say);
    }
};

module.exports = { handleRegisterDraftCommand };