const { getAllChannelsWithLeagues, releaseRosterCheck, markRosterCheckComplete } = require('./services/datastore.js');
const { evaluateRosterCheck } = require('./services/rosterScheduler.js');
const { analyzeLeagueRosters, formatAnalysisMessage } = require('./services/rosterAnalyzer.js');
const logger = require('./shared/logger.js');
const { WebClient } = require('@slack/web-api');

// Initialize Slack client
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

/**
 * AWS Lambda handler for scheduled roster checking.
 * EventBridge invokes this every 30 minutes; the gate posts to Slack at most
 * once per Eastern calendar day, 3 hours before that day's first kickoff.
 */
exports.handler = async (event) => {
    logger.info('Roster scheduler poll', { event });

    const decision = await evaluateRosterCheck();
    if (!decision.shouldRun) {
        logger.info('Roster check skipped', {
            reason: decision.reason,
            etDate: decision.etDate,
            firstKickoff: decision.firstKickoff
        });
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: `skipped: ${decision.reason}`,
                etDate: decision.etDate || null
            })
        };
    }

    logger.info('Roster check window open', {
        etDate: decision.etDate,
        firstKickoff: decision.firstKickoff && decision.firstKickoff.toISOString(),
        season: decision.season,
        week: decision.week
    });

    let postedAny = false;
    try {
        const channelsWithLeagues = await getAllChannelsWithLeagues();

        if (channelsWithLeagues.length === 0) {
            logger.info('No channels with registered leagues found');
            await markRosterCheckComplete(decision.etDate);
            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'No channels with leagues to check' })
            };
        }

        logger.info('Found channels with leagues', { count: channelsWithLeagues.length });

        for (const { channelId, leagues } of channelsWithLeagues) {
            try {
                const posted = await processChannelRosters(channelId, leagues);
                if (posted) {
                    postedAny = true;
                }
            } catch (error) {
                logger.error('Error processing channel before any Slack post', { channelId, error });
            }
        }

        if (!postedAny) {
            logger.error('Roster check posted nothing; releasing lock for retry', { etDate: decision.etDate });
            await releaseRosterCheck(decision.etDate);
            return {
                statusCode: 500,
                body: JSON.stringify({
                    error: 'Roster check posted nothing',
                    etDate: decision.etDate
                })
            };
        }

        await markRosterCheckComplete(decision.etDate);
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: `Roster check completed for ${channelsWithLeagues.length} channels`,
                etDate: decision.etDate
            })
        };
    } catch (error) {
        logger.error('Error in scheduled roster check', { error, etDate: decision.etDate });
        if (!postedAny) {
            try {
                await releaseRosterCheck(decision.etDate);
            } catch (releaseError) {
                logger.error('Failed to release roster-check lock after error', { error: releaseError, etDate: decision.etDate });
            }
        }
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};

/**
 * Process roster analysis for a specific channel.
 * @returns {Promise<boolean>} true if at least one Slack message was posted
 * @throws {Error} when nothing was posted (so the handler can retry the day)
 */
async function processChannelRosters(channelId, leagues) {
    logger.info('Processing rosters for channel', { channelId, leagueCount: leagues.length });
    let posted = false;

    try {
        await slack.chat.postMessage({
            channel: channelId,
            text: '🔍 Automated Roster Check - Analyzing rosters for issues...',
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: "🔍 *Automated Roster Check*\nAnalyzing rosters for issues... This may take a moment."
                    }
                }
            ]
        });
        posted = true;

        for (const league of leagues) {
            try {
                logger.info('Analyzing league', { leagueId: league.leagueId, leagueName: league.leagueName });

                const analysis = await analyzeLeagueRosters(league.leagueId);
                const messageData = formatAnalysisMessage(analysis);

                const leagueHeaderText = `**${league.leagueName}** (${league.season})`;

                const headerBlock = {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `*${league.leagueName}* (${league.season})`
                    }
                };

                await slack.chat.postMessage({
                    channel: channelId,
                    text: leagueHeaderText + '\n' + messageData.text,
                    blocks: [headerBlock, { type: "divider" }, ...messageData.blocks]
                });
            } catch (error) {
                logger.error('Error analyzing league', { leagueId: league.leagueId, error });
                await slack.chat.postMessage({
                    channel: channelId,
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
                });
            }
        }

        await slack.chat.postMessage({
            channel: channelId,
            text: '✅ Automated roster analysis complete!',
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: "✅ *Automated roster analysis complete!*"
                    }
                }
            ]
        });

        return true;
    } catch (error) {
        logger.error('Error processing channel', { channelId, error });

        try {
            await slack.chat.postMessage({
                channel: channelId,
                text: `❌ Automated roster check failed: ${error.message}`
            });
            posted = true;
        } catch (slackError) {
            logger.error('Failed to send error message to Slack', { error: slackError });
        }

        if (!posted) {
            throw error;
        }
        return true;
    }
}
