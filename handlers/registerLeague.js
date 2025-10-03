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
    
    // Validate and parse league ID
    const { isValid, leagueId, errorMessage } = parseLeagueId(command.text);
    if (!isValid) {
        const errorCard = {
            text: errorMessage,
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `❌ *Invalid League ID*\n${errorMessage}`
                    }
                }
            ]
        };
        
        if (threadTs) {
            await say({ ...errorCard, thread_ts: threadTs });
        } else {
            await say(errorCard);
        }
        return;
    }

    try {
        // Check for existing league registrations in this channel
        const existingLeagues = await getLeaguesByChannel(channelId);
        const existingLeague = existingLeagues.find(league => league.leagueId === leagueId);
        
        if (existingLeague) {
            const alreadyRegisteredCard = {
                text: `League "${existingLeague.leagueName}" is already registered to this channel.`,
                blocks: [
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: `⚠️ *League Already Registered*\nLeague "${existingLeague.leagueName}" (${leagueId}) is already registered to this channel.`
                        }
                    }
                ]
            };
            
            if (threadTs) {
                await say({ ...alreadyRegisteredCard, thread_ts: threadTs });
            } else {
                await say(alreadyRegisteredCard);
            }
            return;
        }

        // Fetch league data from Sleeper API to validate it exists
        const leagueData = await getLeague(leagueId);
        
        if (!leagueData) {
            const notFoundCard = {
                text: `League with ID "${leagueId}" not found.`,
                blocks: [
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: `❌ *League Not Found*\nLeague with ID "${leagueId}" not found. Please check the league ID and try again.`
                        }
                    }
                ]
            };
            
            if (threadTs) {
                await say({ ...notFoundCard, thread_ts: threadTs });
            } else {
                await say(notFoundCard);
            }
            return;
        }

        // Save the league registration
        await saveLeague(leagueId, channelId, leagueData);
        
        // Create a rich success card with league details
        const statusEmoji = {
            'in_season': '🏈',
            'pre_draft': '📝',
            'drafting': '🎯',
            'post_season': '🏆',
            'complete': '✅'
        }[leagueData.status] || '🏈';

        const successCard = {
            text: `Successfully registered league "${leagueData.name}" to this channel!`,
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `✅ *League Successfully Registered!*\nThis channel will now receive updates for this league.`
                    }
                },
                {
                    type: "divider"
                },
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `*${leagueData.name}*\n${statusEmoji} ${leagueData.status.replace('_', ' ').toUpperCase()} • ${leagueData.season} Season`
                    }
                },
                {
                    type: "section",
                    fields: [
                        {
                            type: "mrkdwn",
                            text: `*Sport*\n${leagueData.sport.toUpperCase()}`
                        },
                        {
                            type: "mrkdwn",
                            text: `*Total Rosters*\n${leagueData.total_rosters}`
                        },
                        {
                            type: "mrkdwn",
                            text: `*League Type*\n${leagueData.settings?.type === 2 ? 'Dynasty' : 'Redraft'}`
                        },
                        {
                            type: "mrkdwn",
                            text: `*League ID*\n\`${leagueId}\``
                        }
                    ]
                }
            ]
        };
        
        if (threadTs) {
            await say({ ...successCard, thread_ts: threadTs });
        } else {
            await say(successCard);
        }

    } catch (error) {
        console.error('Error in handleRegisterLeagueCommand:', error);
        
        const errorCard = {
            text: 'An error occurred while registering the league.',
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `❌ *Error Registering League*\nSorry, I couldn't complete the league registration. There was an error updating my configuration.`
                    }
                }
            ]
        };
        
        if (threadTs) {
            await say({ ...errorCard, thread_ts: threadTs });
        } else {
            await say(errorCard);
        }
    }
};

module.exports = {
    handleRegisterLeagueCommand
};
