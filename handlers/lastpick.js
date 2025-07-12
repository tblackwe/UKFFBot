const { getDraftPicks, getDraft } = require('../services/sleeper.js');
const { getData, getPlayer } = require('../services/datastore.js');
const { logError, ERROR_MESSAGES } = require('../shared/messages.js');
const { getDisplayName } = require('../services/slackUserService.js');


/**
 * Finds the user ID for a given draft slot from the draft_order object.
 * @param {number} slot The draft slot to find (e.g., 1, 2, 3...).
 * @param {object} draftOrder The draft_order object from the Sleeper draft details, mapping user_id to slot.
 * @toreturns {string|null} The user ID for the slot, or null if not found.
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
 * @param {object} data The application's configuration data (from datastore).
 * @param {boolean} notifyNextPicker Whether to use @ mention for next picker notification.
 * @returns {object} A Slack message payload object with `blocks` and `text`.
 */
async function generatePickMessagePayload(draft, picks, data, notifyNextPicker = false) {
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
    
    // Get player data from the datastore
    let nextPickerName = `User ID ${nextUserId}`;
    try {
      const playerData = await getPlayer(nextUserId);
      if (playerData) {
        nextPickerName = getDisplayName(playerData, notifyNextPicker);
      } else {
        // Fallback to old player_map format for backward compatibility
        const mappedName = data.player_map[nextUserId];
        if (mappedName) {
          nextPickerName = notifyNextPicker ? `<@${mappedName}>` : mappedName;
        }
      }
    } catch (error) {
      console.warn(`Could not get player data for ${nextUserId}:`, error);
      // Fallback to old player_map format
      const mappedName = data.player_map[nextUserId];
      if (mappedName) {
        nextPickerName = notifyNextPicker ? `<@${mappedName}>` : mappedName;
      }
    }
    nextPickerMessage = nextPickerName;
  }

  // Get the last picker's name using the new datastore structure
  let lastPickerName = `User ID ${lastPick.picked_by}`;
  try {
    const playerData = await getPlayer(lastPick.picked_by);
    if (playerData) {
      lastPickerName = getDisplayName(playerData, false); // Never use mention for last picker
    } else {
      // Fallback to old player_map format
      lastPickerName = data.player_map[lastPick.picked_by] || lastPickerName;
    }
  } catch (error) {
    console.warn(`Could not get player data for ${lastPick.picked_by}:`, error);
    // Fallback to old player_map format
    lastPickerName = data.player_map[lastPick.picked_by] || lastPickerName;
  }

  const playerName = `${lastPick.metadata.first_name} ${lastPick.metadata.last_name}`;
  const playerPosition = lastPick.metadata.position || 'N/A';

  // Calculate pick number within the round, e.g., 1.01, 4.12
  const pickInRound = ((lastPick.pick_no - 1) % totalTeams) + 1;
  const formattedPick = `${lastPick.round}.${String(pickInRound).padStart(2, '0')}`;

  // Create the fallback text for the message
  const fallbackText = picksMade < totalPicks 
    ? `Pick ${formattedPick}: ${playerName} (${playerPosition}) was selected by ${lastPickerName}. Next up: ${nextPickerMessage}`
    : `Pick ${formattedPick}: ${playerName} (${playerPosition}) was selected by ${lastPickerName}. The draft is complete!`;

  return {
    text: fallbackText, // This is the required fallback text
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
    ]
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

    const messagePayload = await generatePickMessagePayload(draft, picks, data, notifyNextPicker = false);
    await say(messagePayload);
  } catch (error) {
    logError('/lastpick', error);
    await say(ERROR_MESSAGES.API_ERROR);
  }
};

module.exports = { handleLastPickCommand, generatePickMessagePayload };