const { savePlayer } = require('../services/datastore.js');
const { handleCommandError } = require('../shared/messages.js');
const { getUserByUsername } = require('../services/sleeper.js');
const { validateCommandArgs } = require('../shared/inputValidation.js');
const { resolveSlackUser } = require('../services/slackUserService.js');

/**
 * Handles the logic for the `register player` command.
 * It fetches the Sleeper user ID, resolves Slack user info, and saves the mapping.
 * @param {object} payload The payload from the Slack command.
 * @param {object} payload.command The command object.
 * @param {function} payload.say The function to send a message.
 * @param {object} payload.client The Slack Web API client (optional, for resolving usernames).
 */
const handleRegisterPlayerCommand = async ({ command, say, client }) => {
    const args = command.text.trim().split(/\s+/);
    const [sleeperUsername, slackUserInput] = args;

    // Validate input arguments
    const validation = validateCommandArgs(
        args, 
        2, 
        '`@YourBotName register player [sleeper_username] [@slack_user or slack_username]`'
    );
    
    if (!validation.isValid) {
        await say(validation.errorMessage);
        return;
    }

    try {
        // Fetch user information from Sleeper API
        const sleeperUser = await getUserByUsername(sleeperUsername);
        
        if (!sleeperUser) {
            await say(`❌ Could not find Sleeper user with username \`${sleeperUsername}\`. Please check the username and try again.`);
            return;
        }

        // Resolve Slack user information
        const { slackMemberId, slackName } = await resolveSlackUser(slackUserInput, client);

        // Save the player mapping
        await savePlayer(sleeperUser.user_id, slackMemberId, slackName);
        
        await say(`:white_check_mark: Successfully registered player. Sleeper username \`${sleeperUsername}\` (ID: \`${sleeperUser.user_id}\`) is now mapped to \`${slackName}\` (${slackMemberId}).`);
    } catch (error) {
        await handleCommandError('register player', error, say);
    }
};

module.exports = { handleRegisterPlayerCommand };