const { getData, saveData, savePlayer } = require('../services/datastore.js');
const { handleCommandError, SUCCESS_MESSAGES } = require('../shared/messages.js');
const { getUserByUsername } = require('../services/sleeper.js');
const { resolveSlackUsername } = require('../services/slackUtils.js');

/**
 * Handles the logic for the `registerplayer` command.
 * It reads the existing data, fetches the Sleeper user ID using the username,
 * adds a new user to the player_map, and writes it back to the datastore.
 * @param {object} payload The payload from the Slack command.
 * @param {object} payload.command The command object.
 * @param {function} payload.say The function to send a message.
 * @param {object} payload.client The Slack Web API client (optional, for resolving usernames).
 */
const handleRegisterPlayerCommand = async ({ command, say, client }) => {
    const args = command.text.trim().split(/\s+/);
    const [sleeperUsername, slackUserInput] = args;

    if (!sleeperUsername || !slackUserInput) {
        await say('Please provide a Sleeper username and a Slack user. Usage: `@YourBotName register player [sleeper_username] [@slack_user or slack_username]`');
        return;
    }

    try {
        // Fetch user information from Sleeper API using the username
        const sleeperUser = await getUserByUsername(sleeperUsername);
        
        if (!sleeperUser) {
            await say(`❌ Could not find Sleeper user with username \`${sleeperUsername}\`. Please check the username and try again.`);
            return;
        }

        const sleeperId = sleeperUser.user_id;
        
        // Determine if input is a member ID (starts with <@U and ends with >) or username
        let slackMemberId = slackUserInput;
        let slackName = slackUserInput;
        
        // Check if it's a Slack mention format <@U1234567890> or <@U1234567890|username>
        const mentionMatch = slackUserInput.match(/^<@(U[A-Z0-9]+)(?:\|.*)?>/);
        if (mentionMatch) {
            slackMemberId = mentionMatch[1];
            // Try to resolve the username if we have a client
            if (client) {
                try {
                    const resolvedName = await resolveSlackUsername({ client }, slackMemberId);
                    slackName = resolvedName || slackMemberId;
                } catch (error) {
                    console.warn(`Could not resolve username for ${slackMemberId}:`, error);
                    slackName = slackMemberId;
                }
            }
        } else if (slackUserInput.startsWith('U') && slackUserInput.length === 11) {
            // Direct member ID format
            slackMemberId = slackUserInput;
            if (client) {
                try {
                    const resolvedName = await resolveSlackUsername({ client }, slackMemberId);
                    slackName = resolvedName || slackMemberId;
                } catch (error) {
                    console.warn(`Could not resolve username for ${slackMemberId}:`, error);
                    slackName = slackMemberId;
                }
            }
        }
        // If it's not a member ID format, treat it as a username and use it as both member ID and name

        // Save the player with both member ID and name
        await savePlayer(sleeperId, slackMemberId, slackName);
        
        await say(`:white_check_mark: Successfully registered player. Sleeper username \`${sleeperUsername}\` (ID: \`${sleeperId}\`) is now mapped to \`${slackName}\` (${slackMemberId}).`);
    } catch (error) {
        await handleCommandError('/registerplayer', error, say);
    }
};

module.exports = { handleRegisterPlayerCommand };