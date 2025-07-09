const { getData, saveData } = require('../services/datastore.js');
const { handleCommandError, SUCCESS_MESSAGES } = require('../shared/messages.js');

/**
 * Handles the logic for the `registerplayer` command.
 * It reads the existing data.json, adds a new user to the player_map,
 * and writes it back to the file.
 * @param {object} payload The payload from the Slack command.
 * @param {object} payload.command The command object.
 * @param {function} payload.say The function to send a message.
 */
const handleRegisterPlayerCommand = async ({ command, say }) => {
    const args = command.text.trim().split(/\s+/);
    const [sleeperId, slackName] = args;

    if (!sleeperId || !slackName) {
        await say('Please provide a Sleeper User ID and a Slack username. Usage: `@YourBotName registerplayer [sleeper_id] [slack_name]`');
        return;
    }

    try {
        const data = await getData();

        // Add or update the player in the map
        data.player_map[sleeperId] = slackName;

        await saveData(data);
        await say(SUCCESS_MESSAGES.PLAYER_REGISTERED(sleeperId, slackName));
    } catch (error) {
        await handleCommandError('/registerplayer', error, say);
    }
};

module.exports = { handleRegisterPlayerCommand };