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
                        "text": "*`register league [league_id]`*\nRegisters a Sleeper league to this channel for updates and tracking."
                    },
                    {
                        "type": "mrkdwn",
                        "text": "*`register player [sleeper_username] [@slack_user]`*\nRegister a player mapping for Sleeper username to Slack user. Ask Yukon for help if registration looks broken. Awaiting stimhack admin to fix permissions on username lookup."
                    },
                    {
                        "type": "mrkdwn",
                        "text": "*`unregister draft`*\nRemoves the draft registration from this channel."
                    },
                    {
                        "type": "mrkdwn",
                        "text": "*`list leagues`*\nShows all Sleeper leagues registered to this channel."
                    }
                ]
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": "*Examples:*\n`@UKFFBot help`\n`register draft 987654321`\n`register league 123456789`\n`register player john_doe JohnDoe`\n`list leagues`\n`last pick`"
                }
            }
        ],
        text: "UKFF Slack Bot - Available Commands"
    };

    await say(usageMessage);
};

module.exports = { handleUsageCommand };