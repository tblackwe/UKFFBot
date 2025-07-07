const fs = require('fs').promises;
const path = require('path');

// Construct the path to data.json relative to this file's location
const dataFilePath = path.join(__dirname, '..', 'data.json');

/**
 * Handles the logic for the /registerdraft slash command.
 * It reads the existing data.json, updates the draft information,
 * and writes it back to the file.
 * @param {object} payload The payload from the Slack command.
 * @param {object} payload.command The command object.
 * @param {function} payload.ack The acknowledgement function.
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
        const rawData = await fs.readFile(dataFilePath, 'utf8');
        const data = JSON.parse(rawData);

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

        await fs.writeFile(dataFilePath, JSON.stringify(data, null, 4));
        await say(`:white_check_mark: Successfully registered draft \`${draftId}\` to this channel.`);
    } catch (error) {
        console.error("Error in /registerdraft command:", error);
        await say(`:x: Sorry, I couldn't register the draft. There was an error updating my configuration.`);
    }
};

module.exports = { handleRegisterDraftCommand };