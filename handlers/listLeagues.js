const { getLeaguesByChannel } = require('../services/datastore.js');
const { handleCommandError } = require('../shared/messages.js');

/**
 * Handles the logic for the `list leagues` command.
 * It shows all leagues registered to the current channel.
 * @param {object} payload The payload from the Slack command.
 * @param {object} payload.command The command object.
 * @param {function} payload.say The function to send a message.
 */
const handleListLeaguesCommand = async ({ command, say }) => {
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
    
    try {
        const leagues = await getLeaguesByChannel(channelId);
        
        if (leagues.length === 0) {
            await threadedSay('📭 No leagues are currently registered to this channel.\n\nUse `@UKFFBot register league [league_id]` to register a Sleeper league.');
            return;
        }

        // Build the response message
        const leagueList = leagues.map((league, index) => {
            return [
                `**${index + 1}. ${league.leagueName}**`,
                `   • **Season:** ${league.season}`,
                `   • **Sport:** ${league.sport ? league.sport.toUpperCase() : 'NFL'}`,
                `   • **Rosters:** ${league.totalRosters || 'Unknown'}`,
                `   • **Status:** ${league.status || 'Unknown'}`,
                `   • **League ID:** ${league.leagueId}`,
                `   • **Registered:** ${league.registeredAt ? new Date(league.registeredAt).toLocaleDateString() : 'Unknown'}`
            ].join('\n');
        }).join('\n\n');

        const message = [
            `🏈 **Leagues registered to this channel:**`,
            ``,
            leagueList
        ].join('\n');
        
        await threadedSay(message);

    } catch (error) {
        console.error('Error in handleListLeaguesCommand:', error);
        await handleCommandError(threadedSay, error, 'listing leagues');
    }
};

module.exports = {
    handleListLeaguesCommand
};
