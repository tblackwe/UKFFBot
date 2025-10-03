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
            const noLeaguesMessage = {
                text: '📭 No leagues are registered to this channel. Use @UKFFBot register league [league_id] first to register a Sleeper league.',
                blocks: [
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: "📭 *No leagues are registered to this channel.*\n\nUse `@UKFFBot register league [league_id]` first to register a Sleeper league."
                        }
                    }
                ]
            };
            
            if (threadTs) {
                await say({ ...noLeaguesMessage, thread_ts: threadTs });
            } else {
                await say(noLeaguesMessage);
            }
            return;
        }

        // Show initial message
        const initialMessage = {
            text: '🔍 Analyzing rosters for issues... This may take a moment.',
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: "🔍 *Analyzing rosters for issues...*\nThis may take a moment."
                    }
                }
            ]
        };
        
        if (threadTs) {
            await say({ ...initialMessage, thread_ts: threadTs });
        } else {
            await say(initialMessage);
        }

        // Analyze each league
        for (const league of leagues) {
            try {
                const analysis = await analyzeLeagueRosters(league.leagueId);
                const messageData = formatAnalysisMessage(analysis);
                
                // Add league header and create blocks
                const leagueHeaderText = `**${league.leagueName}** (${league.season})`;
                const headerBlock = {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `*${league.leagueName}* (${league.season})`
                    }
                };
                
                // Send the message with blocks if in a thread
                if (threadTs) {
                    await say({ 
                        text: leagueHeaderText + '\n' + messageData.text,
                        blocks: [headerBlock, { type: "divider" }, ...messageData.blocks],
                        thread_ts: threadTs 
                    });
                } else {
                    await say({
                        text: leagueHeaderText + '\n' + messageData.text,
                        blocks: [headerBlock, { type: "divider" }, ...messageData.blocks]
                    });
                }
                
            } catch (error) {
                console.error(`Error analyzing league ${league.leagueId}:`, error);
                const errorMessage = {
                    text: `❌ Failed to analyze league "${league.leagueName}": ${error.message}`,
                    blocks: [
                        {
                            type: "section",
                            text: {
                                type: "mrkdwn",
                                text: `❌ *Failed to analyze league "${league.leagueName}"*\n${error.message}`
                            }
                        }
                    ]
                };
                
                if (threadTs) {
                    await say({ ...errorMessage, thread_ts: threadTs });
                } else {
                    await say(errorMessage);
                }
            }
        }

        // Add helpful footer
        const footerMessage = {
            text: 'Starting Lineup Check Tips: Empty slots, bye weeks, and injured players shown',
            blocks: [
                { type: "divider" },
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: "*Starting Lineup Check Tips:*\n• ❌ = Empty starting slots (fill immediately!)\n• ⚠️ = Starting players on bye (swap out!)\n• 🚑 = Starting injured players (OUT, DOUBTFUL, IR, etc. - excludes QUESTIONABLE)\n• Only starting lineup issues are shown - bench players excluded\n• Check back regularly as injury statuses change!"
                    }
                }
            ]
        };
        
        if (threadTs) {
            await say({ ...footerMessage, thread_ts: threadTs });
        } else {
            await say(footerMessage);
        }
        
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
        const validationMessage = {
            text: 'League ID should be numeric. Please check the ID and try again.',
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: "❌ *Invalid League ID*\nLeague ID should be numeric. Please check the ID and try again."
                    }
                }
            ]
        };
        
        if (threadTs) {
            await say({ ...validationMessage, thread_ts: threadTs });
        } else {
            await say(validationMessage);
        }
        return;
    }

    try {
        const analysisMessage = {
            text: '🔍 Analyzing league rosters... This may take a moment.',
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: "🔍 *Analyzing league rosters...*\nThis may take a moment."
                    }
                }
            ]
        };
        
        if (threadTs) {
            await say({ ...analysisMessage, thread_ts: threadTs });
        } else {
            await say(analysisMessage);
        }
        
        const analysis = await analyzeLeagueRosters(leagueId);
        const messageData = formatAnalysisMessage(analysis);
        
        if (threadTs) {
            await say({ 
                text: messageData.text,
                blocks: messageData.blocks,
                thread_ts: threadTs 
            });
        } else {
            await say({
                text: messageData.text,
                blocks: messageData.blocks
            });
        }

        // Add helpful footer
        const footerMessage = {
            text: 'Starting Lineup Check Tips: Empty slots, bye weeks, and injured players shown',
            blocks: [
                { type: "divider" },
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: "*Starting Lineup Check Tips:*\n• ❌ = Empty starting slots (fill immediately!)\n• ⚠️ = Starting players on bye (swap out!)\n• 🚑 = Starting injured players (OUT, DOUBTFUL, IR, etc. - excludes QUESTIONABLE)\n• Only starting lineup issues are shown - bench players excluded\n• Check back regularly as injury statuses change!"
                    }
                }
            ]
        };
        
        if (threadTs) {
            await say({ ...footerMessage, thread_ts: threadTs });
        } else {
            await say(footerMessage);
        }

    } catch (error) {
        console.error('Error in handleCheckLeagueRostersCommand:', error);
        
        if (error.message.includes('failed') || error.message.includes('404')) {
            const notFoundMessage = {
                text: `❌ League with ID "${leagueId}" not found. Please check the league ID and try again.`,
                blocks: [
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: `❌ *League not found*\nLeague with ID "${leagueId}" not found. Please check the league ID and try again.`
                        }
                    }
                ]
            };
            
            if (threadTs) {
                await say({ ...notFoundMessage, thread_ts: threadTs });
            } else {
                await say(notFoundMessage);
            }
        } else {
            await handleCommandError(threadedSay, error, 'checking league rosters');
        }
    }
};

module.exports = {
    handleCheckRostersCommand,
    handleCheckLeagueRostersCommand
};
