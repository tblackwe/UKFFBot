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
                    "text": "*🏈 UKFF Slack Bot - Available Commands*"
                }
            },
            {
                "type": "divider"
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": "*Quick Actions:*\n• `@UKFFBot` _(no text)_ - Show registered players for this channel's draft"
                }
            },
            {
                "type": "section",
                "fields": [
                    {
                        "type": "mrkdwn",
                        "text": "*`last pick` or `latest`*\nFetches the most recent pick for the draft registered to this channel."
                    },
                    {
                        "type": "mrkdwn",
                        "text": "*`register draft [draft_name] [draft_id]`*\nRegisters a Sleeper draft to this channel."
                    },
                    {
                        "type": "mrkdwn",
                        "text": "*`register player [name] [draft_name]`*\nRegister yourself for a draft."
                    },
                    {
                        "type": "mrkdwn",
                        "text": "*`list players [draft_name]`*\nView all registered players for a draft."
                    },
                    {
                        "type": "mrkdwn",
                        "text": "*`unregister draft [draft_name]`*\nRemoves the draft registration from this channel."
                    },
                    {
                        "type": "mrkdwn",
                        "text": "*`list drafts`*\nShows all registered drafts _(DM only)_."
                    }
                ]
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": "*Examples:*\n`@UKFFBot` _(shows players in current channel)_\n`register draft MyLeague2025 987654321`\n`register player JohnDoe MyLeague2025`\n`list players MyLeague2025`"
                }
            }
        ],
        text: "UKFF Slack Bot - Available Commands"
    };

    await say(usageMessage);
};

module.exports = { handleUsageCommand };