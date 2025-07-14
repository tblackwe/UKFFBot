const { getDraftPicks, getDraft } = require('./sleeper.js');
const { 
  generatePickMessagePayload, 
  generateMultiPickMessagePayload,
  MULTI_PICK_CONFIG 
} = require('../handlers/lastpick.js');
const { getData, saveDraft } = require('./datastore.js');
const {
  validatePickData,
  getNewPicksSinceLastUpdate,
} = require("../shared/pickUtils.js");


/**
 * Checks the registered draft for new picks.
 * If a new pick is found, it posts an update to the registered Slack channel.
 * @param {object} app The Slack Bolt app instance.
 */
async function checkDraftForUpdates(app) {
    let data;
    try {
        data = await getData();
    } catch (error) {
        console.error("Draft Monitor: Could not read data.json.", error);
        return;
    }

    const draftsToMonitor = data.drafts;
    if (!draftsToMonitor || Object.keys(draftsToMonitor).length === 0) {
        // No draft is registered, so there's nothing to monitor.
        return;
    }

    // Track which drafts need to be updated
    const draftsToUpdate = [];

    // Use Promise.all to check all registered drafts concurrently.
    await Promise.all(Object.keys(draftsToMonitor).map(async (draftId) => {
        try {
            const draftInfo = draftsToMonitor[draftId];
            const [picks, draft] = await Promise.all([
                getDraftPicks(draftId),
                getDraft(draftId)
            ]);

            if (!picks || !draft) return;

            const currentPickCount = picks.length;
            const lastKnownPickCount = draftInfo.last_known_pick_count || 0;

            if (currentPickCount > lastKnownPickCount) {
                if (process.env.NODE_ENV === 'development') {
                    console.log(`Draft Monitor: New pick detected in draft ${draftId}! Pick count changed from ${lastKnownPickCount} to ${currentPickCount}.`);
                }

                // Determine display strategy using the same logic as lastpick handler
                let useMultiPickDisplay = false;
                let newPicksStartIndex = 0;

                // Only attempt multi-pick logic if the feature is enabled
                if (MULTI_PICK_CONFIG.ENABLE_MULTI_PICK && lastKnownPickCount !== null) {
                    // Validate the pick data
                    const validation = validatePickData(picks, lastKnownPickCount);

                    if (validation.isValid) {
                        try {
                            // Calculate new picks since last update
                            const pickRange = getNewPicksSinceLastUpdate(
                                picks,
                                lastKnownPickCount
                            );

                            // Use multi-pick display if there are multiple new picks
                            if (pickRange.hasNewPicks && pickRange.count > 1) {
                                useMultiPickDisplay = true;
                                newPicksStartIndex = pickRange.startIndex;
                                console.log(`Draft Monitor: Multi-pick display enabled for draft ${draftId}: ${pickRange.count} new picks found`);
                            } else if (pickRange.hasNewPicks) {
                                console.log(`Draft Monitor: Single new pick found for draft ${draftId}, using single-pick display`);
                            } else {
                                console.log(`Draft Monitor: No new picks found for draft ${draftId} since last update`);
                            }
                        } catch (error) {
                            console.warn(
                                `Draft Monitor: Error calculating new picks range for draft ${draftId}, falling back to single-pick display:`,
                                error
                            );
                            // useMultiPickDisplay remains false
                        }
                    } else {
                        console.warn(
                            `Draft Monitor: Pick data validation failed for draft ${draftId}, falling back to single-pick display:`,
                            validation.error
                        );
                        // useMultiPickDisplay remains false
                    }
                } else if (!MULTI_PICK_CONFIG.ENABLE_MULTI_PICK) {
                    console.log(`Draft Monitor: Multi-pick feature is disabled for draft ${draftId}, using single-pick display`);
                    // useMultiPickDisplay remains false
                } else {
                    console.warn(
                        `Draft Monitor: Missing or invalid last_known_pick_count for draft ${draftId}, falling back to single-pick display`
                    );
                    // useMultiPickDisplay remains false
                }

                // Generate appropriate message payload
                let messagePayload;
                if (useMultiPickDisplay) {
                    messagePayload = await generateMultiPickMessagePayload(
                        draft,
                        picks,
                        newPicksStartIndex,
                        data,
                        true // notifyNextPicker = true for draft monitor
                    );
                } else {
                    messagePayload = await generatePickMessagePayload(
                        draft,
                        picks,
                        data,
                        true // notifyNextPicker = true for draft monitor
                    );
                }

                // Post the message to the registered channel
                await app.client.chat.postMessage({
                    channel: draftInfo.slack_channel_id,
                    ...messagePayload
                });

                // Add to the list of drafts to update
                draftsToUpdate.push({
                    draftId,
                    slackChannelId: draftInfo.slack_channel_id,
                    pickCount: currentPickCount
                });
            }
        } catch (error) {
            console.error(`Draft Monitor: Error checking draft ${draftId}.`, error);
        }
    }));

    // Update all drafts that had new picks
    for (const { draftId, slackChannelId, pickCount } of draftsToUpdate) {
        await saveDraft(draftId, slackChannelId, pickCount);
    }
}

module.exports = { checkDraftForUpdates };