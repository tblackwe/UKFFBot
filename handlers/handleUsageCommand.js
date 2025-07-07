/**
 * Handles the logic for the `usage` or `help` command.
 * It sends a message describing how to use the bot's commands.
 * @param {object} payload The payload from the Slack command.
 * @param {function} payload.say The function to send a message.
 */
const handleUsageCommand = async ({ say }) => {
    const usageMessage = {
        blocks: [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": "Here's a list of my available commands:"
                }
            },
            {
                "type": "divider"
            },
            {
                "type": "section",
                "fields": [
                    {
                        "type": "mrkdwn",
                        "text": "*`lastpick`*\nFetches the most recent pick for the draft registered to this channel."
                    },
                    {
                        "type": "mrkdwn",
                        "text": "*`registerdraft [draft_id]`*\nRegisters a Sleeper draft ID for the bot to track against this channel."
                    },
                    {
                        "type": "mrkdwn",
                        "text": "*`registerplayer [sleeper_id] [slack_name]`*\nMaps a Sleeper user ID to a Slack username."
                    },
                    {
                        "type": "mrkdwn",
                        "text": "*`usage` or `help`*\nShows this help message."
                    }
                ]
            }
        ],
        text: "Here's a list of my commands: lastpick, registerdraft, registerplayer, usage."
    };

    await say(usageMessage);
};

module.exports = { handleUsageCommand };