const fs = require('fs').promises;
const path = require('path');
const { getDraftPicks, getDraft } = require('./sleeper.js');
const { generatePickMessagePayload } = require('../handlers/lastpick.js');

const dataFilePath = path.join(__dirname, '..', 'data.json');

/**
 * Checks the registered draft for new picks.
 * If a new pick is found, it posts an update to the registered Slack channel.
 * @param {object} app The Slack Bolt app instance.
 */
async function checkDraftForUpdates(app) {
    let data;
    try {
        const rawData = await fs.readFile(dataFilePath, 'utf8');
        data = JSON.parse(rawData);
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
                console.log(`Draft Monitor: New pick detected in draft ${draftId}! Pick count changed from ${lastKnownPickCount} to ${currentPickCount}.`);

                // Generate the message payload using the reusable function
                const messagePayload = generatePickMessagePayload(draft, picks, data);

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
        await fs.writeFile(dataFilePath, JSON.stringify(data, null, 4));
    }
}

module.exports = { checkDraftForUpdates };