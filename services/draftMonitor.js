const { getDraftPicks, getDraft } = require('./sleeper.js');
const { generatePickMessagePayload } = require('../handlers/lastpick.js');
const { getData, saveData } = require('./datastore.js');


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

    let configWasUpdated = false;

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

                // Generate the message payload using the reusable function
                const messagePayload = generatePickMessagePayload(draft, picks, data, notifyNextPicker = true);

                // Post the message to the registered channel
                await app.client.chat.postMessage({
                    channel: draftInfo.slack_channel_id,
                    ...messagePayload
                });

                // Update the configuration with the new pick count
                draftInfo.last_known_pick_count = currentPickCount;
                configWasUpdated = true;
            }
        } catch (error) {
            console.error(`Draft Monitor: Error checking draft ${draftId}.`, error);
        }
    }));

    // If any draft state was updated, write the entire config file back to disk.
    if (configWasUpdated) {
        await saveData(data);
    }
}

module.exports = { checkDraftForUpdates };