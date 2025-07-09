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
                        "text": "*`register draft [draft_id]`*\nRegisters a Sleeper draft to this channel."
                    },
                    {
                        "type": "mrkdwn",
                        "text": "*`register player [sleeper_id] [slack_name]`*\nRegister a player mapping for Sleeper ID to Slack username."
                    },
                    {
                        "type": "mrkdwn",
                        "text": "*`unregister draft`*\nRemoves the draft registration from this channel."
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
                    "text": "*Examples:*\n`@UKFFBot help`\n`register draft 987654321`\n`register player 123456789 JohnDoe`\n`last pick`"
                }
            }
        ],
        text: "UKFF Slack Bot - Available Commands"
    };

    await say(usageMessage);
};

module.exports = { handleUsageCommand };