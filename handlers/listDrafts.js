const { getData } = require('../services/datastore.js');
const { handleCommandError } = require('../shared/messages.js');

/**
 * Handles the logic for the `listdrafts` command.
 * It lists all registered drafts and the channels they are linked to.
 * This command will only respond when used in a direct message with the bot.
 * @param {object} payload The payload from the Slack command.
 * @param {function} payload.say The function to send a message.
 */
const handleListDraftsCommand = async ({ say, ack }) => {
    if (ack) await ack();
    try {
        const data = await getData();
        const drafts = data.drafts || {};
        const draftIds = Object.keys(drafts);

        if (draftIds.length === 0) {
            await say("There are currently no drafts registered.");
            return;
        }

        let messageText = "*Here are all the currently registered drafts:*\n";
        draftIds.forEach(id => {
            const channel = drafts[id].slack_channel_id;
            // Format the channel ID as a clickable link e.g., #fantasy-football
            messageText += `• Draft \`${id}\` is registered to <#${channel}>\n`;
        });

        await say(messageText);
    } catch (error) {
        await handleCommandError('listdrafts', error, say, ':x: Sorry, I couldn\'t list the drafts. There was an error reading my configuration.');
    }
};

module.exports = { handleListDraftsCommand };