const { getAllChannelsWithLeagues } = require('./services/datastore.js');
const { analyzeLeagueRosters, formatAnalysisMessage } = require('./services/rosterAnalyzer.js');
const { WebClient } = require('@slack/web-api');

// Initialize Slack client
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

/**
 * Lambda handler for scheduled roster checking
 * Automatically runs roster analysis on all registered leagues
 */
exports.handler = async (event) => {
    console.log('Starting scheduled roster check...', JSON.stringify(event, null, 2));
    
    try {
        // Get all channels that have registered leagues
        const channelsWithLeagues = await getAllChannelsWithLeagues();
        
        if (channelsWithLeagues.length === 0) {
            console.log('No channels with registered leagues found');
            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'No channels with leagues to check' })
            };
        }

        console.log(`Found ${channelsWithLeagues.length} channels with leagues`);

        // Process each channel
        for (const { channelId, leagues } of channelsWithLeagues) {
            try {
                await processChannelRosters(channelId, leagues);
            } catch (error) {
                console.error(`Error processing channel ${channelId}:`, error);
                // Continue with other channels even if one fails
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ 
                message: `Roster check completed for ${channelsWithLeagues.length} channels`
            })
        };

    } catch (error) {
        console.error('Error in scheduled roster check:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};

/**
 * Process roster analysis for a specific channel
 */
async function processChannelRosters(channelId, leagues) {
    console.log(`Processing rosters for channel ${channelId} with ${leagues.length} leagues`);

    try {
        // Send initial message
        const initialMessage = await slack.chat.postMessage({
            channel: channelId,
            text: '🔍 **Automated Roster Check** - Analyzing rosters for issues... This may take a moment.'
        });

        const threadTs = initialMessage.ts;

        // Analyze each league
        for (const league of leagues) {
            try {
                console.log(`Analyzing league ${league.leagueId} (${league.leagueName})`);
                
                const analysis = await analyzeLeagueRosters(league.leagueId);
                const message = formatAnalysisMessage(analysis);
                
                // Add league header
                const leagueHeader = `\n**${league.leagueName}** (${league.season})\n${'-'.repeat(40)}`;
                
                await slack.chat.postMessage({
                    channel: channelId,
                    thread_ts: threadTs,
                    text: leagueHeader + '\n' + message
                });
                
            } catch (error) {
                console.error(`Error analyzing league ${league.leagueId}:`, error);
                await slack.chat.postMessage({
                    channel: channelId,
                    thread_ts: threadTs,
                    text: `❌ Failed to analyze league "${league.leagueName}": ${error.message}`
                });
            }
        }

        // Send completion message
        await slack.chat.postMessage({
            channel: channelId,
            thread_ts: threadTs,
            text: '✅ Automated roster analysis complete!'
        });

    } catch (error) {
        console.error(`Error processing channel ${channelId}:`, error);
        
        // Try to send error message to channel if possible
        try {
            await slack.chat.postMessage({
                channel: channelId,
                text: `❌ Automated roster check failed: ${error.message}`
            });
        } catch (slackError) {
            console.error('Failed to send error message to Slack:', slackError);
        }
    }
}
