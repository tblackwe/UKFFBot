const { getLeague } = require('../services/sleeper.js');
const { saveLeague, getLeaguesByChannel } = require('../services/datastore.js');
const { handleCommandError, SUCCESS_MESSAGES } = require('../shared/messages.js');
const { parseLeagueId } = require('../shared/inputValidation.js');

/**
 * Handles the logic for the `register league` command.
 * It validates the league ID and registers it to the current channel.
 * @param {object} payload The payload from the Slack command.
 * @param {object} payload.command The command object.
 * @param {function} payload.say The function to send a message.
 */
const handleRegisterLeagueCommand = async ({ command, say, ack }) => {
    if (ack) await ack();
    const channelId = command.channel_id;
    const threadTs = command.ts; // Get the timestamp for threading
    
    // Create a threaded say function if we have a timestamp
    const threadedSay = async (message) => {
        if (threadTs) {
            return say({ text: message, thread_ts: threadTs });
        } else {
            return say(message);
        }
    };
    
    // Validate and parse league ID
    const { isValid, leagueId, errorMessage } = parseLeagueId(command.text);
    if (!isValid) {
        await threadedSay(errorMessage);
        return;
    }

    try {
        // Check for existing league registrations in this channel
        const existingLeagues = await getLeaguesByChannel(channelId);
        const existingLeague = existingLeagues.find(league => league.leagueId === leagueId);
        
        if (existingLeague) {
            await threadedSay(`⚠️ League "${existingLeague.leagueName}" (${leagueId}) is already registered to this channel.`);
            return;
        }

        // Fetch league data from Sleeper API to validate it exists
        const leagueData = await getLeague(leagueId);
        
        if (!leagueData) {
            await threadedSay(`❌ League with ID "${leagueId}" not found. Please check the league ID and try again.`);
            return;
        }

        // Save the league registration
        await saveLeague(leagueId, channelId, leagueData);
        
        // Send success message with league details
        const successMessage = [
            `✅ Successfully registered league to this channel!`,
            ``,
            `**League Details:**`,
            `• **Name:** ${leagueData.name}`,
            `• **Season:** ${leagueData.season}`,
            `• **Sport:** ${leagueData.sport.toUpperCase()}`,
            `• **Total Rosters:** ${leagueData.total_rosters}`,
            `• **Status:** ${leagueData.status}`,
            `• **League ID:** ${leagueId}`,
            ``,
            `This channel will now receive updates for this league! 🏈`
        ].join('\n');
        
        await threadedSay(successMessage);

    } catch (error) {
        console.error('Error in handleRegisterLeagueCommand:', error);
        await handleCommandError(threadedSay, error, 'registering league');
    }
};

module.exports = {
    handleRegisterLeagueCommand
};
