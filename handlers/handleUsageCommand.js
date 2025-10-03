/**
 * Handles the logic for the `usage` or `help` command.
 * It sends a message describing how to use the bot's commands.
 * @param {object} payload The payload from the Slack command.
 * @param {object} payload.command The command object.
 * @param {function} payload.say The function to send a message.
 */
const handleUsageCommand = async ({ command, say, ack }) => {
    if (ack) await ack();
    const threadTs = command?.ts; // Get the timestamp for threading
    
    // Create a threaded say function if we have a timestamp
    const threadedSay = async (message) => {
        if (threadTs) {
            return say({ ...message, thread_ts: threadTs });
        } else {
            return say(message);
        }
    };
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
                        "text": "*`check rosters`*\nAnalyzes starting lineups in all registered leagues for issues like bye weeks, injuries, and empty slots."
                    },
                    {
                        "type": "mrkdwn",
                        "text": "*`check league rosters [league_id]`*\nAnalyzes starting lineups in a specific league for issues."
                    },
                    {
                        "type": "mrkdwn",
                        "text": "*`list leagues`*\nShows all Sleeper leagues registered to this channel."
                    },
                    {
                        "type": "mrkdwn",
                        "text": "*`cache status`*\nShows the current status of NFL data caches (players and bye weeks)."
                    },
                    {
                        "type": "mrkdwn",
                        "text": "*`cache refresh`*\nForce refreshes the NFL data caches with fresh data from Sleeper API."
                    }
                ]
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": "*Examples:*\n`@UKFFBot help`\n`register draft 987654321`\n`register league 123456789`\n`register player john_doe JohnDoe`\n`check rosters`\n`list leagues`\n`cache status`\n`last pick`"
                }
            }
        ],
        text: "UKFF Slack Bot - Available Commands"
    };

    await threadedSay(usageMessage);
};

module.exports = { handleUsageCommand };