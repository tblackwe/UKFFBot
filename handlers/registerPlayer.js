const { getData, saveData } = require('../services/datastore.js');

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
        await say(`:white_check_mark: Successfully registered player. Sleeper ID \`${sleeperId}\` is now mapped to \`${slackName}\`.`);
    } catch (error) {
        console.error("Error in /registerplayer command:", error);
        await say(`:x: Sorry, I couldn't register the player. There was an error updating my configuration.`);
    }
};

module.exports = { handleRegisterPlayerCommand };