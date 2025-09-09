const { getLeaguesByChannel } = require('../services/datastore.js');
const { analyzeLeagueRosters, formatAnalysisMessage } = require('../services/rosterAnalyzer.js');
const { handleCommandError } = require('../shared/messages.js');

/**
 * Handles the logic for the `check rosters` command.
 * Analyzes all rosters in registered leagues for issues like bye weeks and injuries.
 * @param {object} payload The payload from the Slack command.
 * @param {object} payload.command The command object.
 * @param {function} payload.say The function to send a message.
 */
const handleCheckRostersCommand = async ({ command, say, ack }) => {
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

    try {
        // Get leagues registered to this channel
        const leagues = await getLeaguesByChannel(channelId);
        
        if (leagues.length === 0) {
            await threadedSay('📭 No leagues are registered to this channel.\n\nUse `@UKFFBot register league [league_id]` first to register a Sleeper league.');
            return;
        }

        // Show initial message
        await threadedSay('🔍 Analyzing rosters for issues... This may take a moment.');

        // Analyze each league
        for (const league of leagues) {
            try {
                const analysis = await analyzeLeagueRosters(league.leagueId);
                const message = formatAnalysisMessage(analysis);
                
                // Add league header
                const leagueHeader = `\n**${league.leagueName}** (${league.season})\n${'-'.repeat(40)}`;
                await threadedSay(leagueHeader + '\n' + message);
                
            } catch (error) {
                console.error(`Error analyzing league ${league.leagueId}:`, error);
                await threadedSay(`❌ Failed to analyze league "${league.leagueName}": ${error.message}`);
            }
        }

        // Add helpful footer
        const footer = [
            '\n*Starting Lineup Check Tips:*',
            '• ❌ = Empty starting slots (fill immediately!)',
            '• ⚠️ = Starting players on bye (swap out!)',
            '• 🚑 = Starting injured players (OUT, DOUBTFUL, IR, etc. - excludes QUESTIONABLE)',
            '• Only starting lineup issues are shown - bench players excluded',
            '• Check back regularly as injury statuses change!'
        ].join('\n');
        
        await threadedSay(footer);
        
        console.log(`[CHECK_ROSTERS] ==> ROSTER ANALYSIS COMPLETED FOR ${leagues.length} LEAGUES <==`);

    } catch (error) {
        console.error('Error in handleCheckRostersCommand:', error);
        await handleCommandError(threadedSay, error, 'checking rosters');
    }
};

/**
 * Handles the logic for checking a specific league's rosters.
 * @param {object} payload The payload from the Slack command.
 * @param {object} payload.command The command object.
 * @param {function} payload.say The function to send a message.
 */
const handleCheckLeagueRostersCommand = async ({ command, say, ack }) => {
    if (ack) await ack();
    const channelId = command.channel_id;
    const threadTs = command.ts;
    const leagueId = command.text.trim();
    
    // Create a threaded say function if we have a timestamp
    const threadedSay = async (message) => {
        if (threadTs) {
            return say({ text: message, thread_ts: threadTs });
        } else {
            return say(message);
        }
    };

    if (!leagueId) {
        await threadedSay('Please provide a league ID. Usage: `@UKFFBot check league rosters [league_id]`');
        return;
    }

    // Basic validation - Sleeper league IDs are typically numeric
    if (!/^[0-9]+$/.test(leagueId)) {
        await threadedSay('League ID should be numeric. Please check the ID and try again.');
        return;
    }

    try {
        await threadedSay('🔍 Analyzing league rosters... This may take a moment.');
        
        const analysis = await analyzeLeagueRosters(leagueId);
        const message = formatAnalysisMessage(analysis);
        
        await threadedSay(message);

        // Add helpful footer
        const footer = [
            '\n*Starting Lineup Check Tips:*',
            '• ❌ = Empty starting slots (fill immediately!)',
            '• ⚠️ = Starting players on bye (swap out!)',
            '• 🚑 = Starting injured players (OUT, DOUBTFUL, IR, etc. - excludes QUESTIONABLE)',
            '• Only starting lineup issues are shown - bench players excluded',
            '• Check back regularly as injury statuses change!'
        ].join('\n');
        
        await threadedSay(footer);

    } catch (error) {
        console.error('Error in handleCheckLeagueRostersCommand:', error);
        
        if (error.message.includes('failed') || error.message.includes('404')) {
            await threadedSay(`❌ League with ID "${leagueId}" not found. Please check the league ID and try again.`);
        } else {
            await handleCommandError(threadedSay, error, 'checking league rosters');
        }
    }
};

module.exports = {
    handleCheckRostersCommand,
    handleCheckLeagueRostersCommand
};
