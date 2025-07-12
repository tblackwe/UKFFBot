const { getData, saveData } = require('../services/datastore.js');
const { handleCommandError, SUCCESS_MESSAGES } = require('../shared/messages.js');
const { getUserByUsername } = require('../services/sleeper.js');

/**
 * Handles the logic for the `registerplayer` command.
 * It reads the existing data.json, fetches the Sleeper user ID using the username,
 * adds a new user to the player_map, and writes it back to the file.
 * @param {object} payload The payload from the Slack command.
 * @param {object} payload.command The command object.
 * @param {function} payload.say The function to send a message.
 */
const handleRegisterPlayerCommand = async ({ command, say }) => {
    const args = command.text.trim().split(/\s+/);
    const [sleeperUsername, slackName] = args;

    if (!sleeperUsername || !slackName) {
        await say('Please provide a Sleeper username and a Slack username. Usage: `@YourBotName registerplayer [sleeper_username] [slack_name]`');
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
        const data = await getData();

        // Add or update the player in the map using the user ID as the key
        data.player_map[sleeperId] = slackName;

        await saveData(data);
        await say(`:white_check_mark: Successfully registered player. Sleeper username \`${sleeperUsername}\` (ID: \`${sleeperId}\`) is now mapped to \`${slackName}\`.`);
    } catch (error) {
        await handleCommandError('/registerplayer', error, say);
    }
};

module.exports = { handleRegisterPlayerCommand };