const { getDraftPicks, getDraft } = require('../services/sleeper.js');
const { getData } = require('../services/datastore.js');
const { logError, ERROR_MESSAGES } = require('../shared/messages.js');


/**
 * Finds the user ID for a given draft slot from the draft_order object.
 * @param {number} slot The draft slot to find (e.g., 1, 2, 3...).
 * @param {object} draftOrder The draft_order object from the Sleeper draft details, mapping user_id to slot.
 * @returns {string|null} The user ID for the slot, or null if not found.
 */
function getUserForSlot(slot, draftOrder) {
  // Iterate over the draft order to find the user ID whose value matches the slot.
  for (const userId in draftOrder) {
    if (Object.prototype.hasOwnProperty.call(draftOrder, userId) && draftOrder[userId] === slot) {
      return userId;
    }
  }
  return null; // Should not happen in a valid draft
}

/**
 * Generates the Slack message payload for a pick update.
 * @param {object} draft The full draft object from the Sleeper API.
 * @param {object[]} picks The array of pick objects from the Sleeper API.
 * @param {object} data The application's configuration data (from data.json).
 * @returns {object} A Slack message payload object with `blocks` and `text`.
 */
function generatePickMessagePayload(draft, picks, data, notifyNextPicker = false) {
  // Get the last pick from the array of picks
  const lastPick = picks[picks.length - 1];

  // --- Logic to determine the next picker ---
  let nextPickerMessage = "The draft is complete!";
  const picksMade = picks.length;
  const totalTeams = Object.keys(draft.draft_order).length; // Number of teams in the draft
  // Calculate the total number of picks based on rounds and teams
  const totalPicks = draft.settings.rounds * totalTeams;
  if (picksMade < totalPicks) {
    const nextPickRound = Math.floor(picksMade / totalTeams) + 1;
    const nextPickInRound = (picksMade % totalTeams) + 1;

    let draftSlotForNextPick = nextPickInRound;
    // Determine the slot for the next pick based on draft type (e.g., snake, 3RR)
    if (draft.type === 'snake') {
      // A reversal_round value indicates a draft like "3rd Round Reversal".
      const reversalRound = draft.settings.reversal_round || 0;

      // Standard snake behavior: even rounds are reversed.
      let isReversed = (nextPickRound % 2 === 0);

      // For 3RR (or NRR), flip the snake pattern at and after the reversal round.
      if (reversalRound > 0 && nextPickRound >= reversalRound) {
        isReversed = !isReversed;
      }

      if (isReversed) {
        // Calculate the slot for a reversed (snaking) round.
        draftSlotForNextPick = totalTeams - nextPickInRound + 1;
      }
    } else { // Handles 'linear' or other non-snake draft types
      draftSlotForNextPick = nextPickInRound;
    }
    // Find the user ID for the determined draft slot
    const nextUserId = getUserForSlot(draftSlotForNextPick, draft.draft_order);
    // Look up the user's name/handle from your data file's player_map.
    const nextPickerName = data.player_map[nextUserId] || `User ID ${nextUserId}`;

    nextPickerMessage = notifyNextPicker ? `<@${nextPickerName}>` : nextPickerName;
  }

  // The `data.json` file's player_map maps a user_id to a name.
  // The pick object's `picked_by` field contains the user_id of the picker.
  const lastPickerName = data.player_map[lastPick.picked_by] || `User ID ${lastPick.picked_by}`;
  const playerName = `${lastPick.metadata.first_name} ${lastPick.metadata.last_name}`;
  const playerPosition = lastPick.metadata.position || 'N/A';

  // Calculate pick number within the round, e.g., 1.01, 4.12
  const pickInRound = ((lastPick.pick_no - 1) % totalTeams) + 1;
  const formattedPick = `${lastPick.round}.${String(pickInRound).padStart(2, '0')}`;

  return {
    blocks: [
      {
        "type": "section",
        "text": { "type": "mrkdwn", "text": `:alarm_clock: *PICK ALERT!* :alarm_clock:` }
      },
      {
        "type": "section",
        "fields": [
          { "type": "mrkdwn", "text": `*Pick:* \`${formattedPick}\`` },
          { "type": "mrkdwn", "text": `*Player:* \`${playerName} - ${playerPosition}\`` },
          { "type": "mrkdwn", "text": `*Picked By:* ${lastPickerName}` }
        ]
      },
      { "type": "divider" },
      {
        "type": "section",
        "text": { "type": "mrkdwn", "text": `*On The Clock:* ${nextPickerMessage}` }
      }
    ],
    text: `Pick ${formattedPick}: ${playerName} was selected. ${nextPickerMessage}`
  };
}

/**
 * Handles the logic for the /lastpick slash command.
 * @param {object} payload The payload from the Slack command.
 * @param {object} payload.command The command object.
 * @param {function} payload.say The function to send a message.
 */
const handleLastPickCommand = async ({ command, say }) => {
  let data;
  try {
    data = await getData();
  } catch (error) {
    console.error("Error reading data.json in lastpick handler:", error);
    await say("I couldn't read my configuration file (`data.json`). Please make sure I am set up correctly.");
    return;
  }

  // Find the draft registered to the channel where the command was used.
  const channelId = command.channel_id;
  let draftId = null;

  if (data.drafts) {
    // Find the draft ID by matching the channel ID.
    const draftEntry = Object.entries(data.drafts).find(
      ([_id, draftInfo]) => draftInfo.slack_channel_id === channelId
    );
    if (draftEntry) {
      draftId = draftEntry[0];
    }
  }

  if (!draftId) {
    await say(ERROR_MESSAGES.NO_DRAFT_REGISTERED);
    return;
  }
  try {
    // Fetch draft picks and the full draft details concurrently for efficiency
    const [picks, draft] = await Promise.all([
      getDraftPicks(draftId),
      getDraft(draftId)
    ]);

    if (!picks || !draft) {
      await say(`Could not find a draft or picks for ID \`${draftId}\`. Please check the ID and try again.`);
      return;
    }

    if (draft.status === 'pre_draft' || picks.length === 0) {
      await say(`The draft for ID \`${draftId}\` has not started yet.`);
      return;
    }

    const messagePayload = generatePickMessagePayload(draft, picks, data, notifyNextPicker = false);
    await say(messagePayload);
  } catch (error) {
    logError('/lastpick', error);
    await say(ERROR_MESSAGES.API_ERROR);
  }
};

module.exports = { handleLastPickCommand, generatePickMessagePayload };