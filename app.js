require('dotenv').config();
const data = require('./data.json');
const { App } = require('@slack/bolt');
const { getDraftPicks, getDraft } = require('./services/sleeper.js');

/**
 * This sample slack application uses SocketMode.
 * For the companion getting started setup guide, see:
 * https://tools.slack.dev/bolt-js/getting-started/
 */

// Initializes your app with your bot token and app token
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN
});

// Listens to incoming messages that contain "hello"
app.message('hello', async ({ message, say }) => {
  // say() sends a message to the channel where the event was triggered
  await say({
    blocks: [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `Hey there <@${message.user}>!`
        },
        "accessory": {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "Click Me"
          },
          "action_id": "button_click"
        }
      }
    ],
    text: `Hey there <@${message.user}>!`
  });
});

/**
 * Responds to the /lastpick slash command.
 * Takes a Sleeper Draft ID, fetches the draft's picks, and displays the last one.
 */
app.command('/lastpick', async ({ command, ack, say }) => {
  // Acknowledge command request immediately to avoid timeout errors
  await ack();

  const draftId = command.text.trim();

  if (!draftId) {
    await say('Please provide a Sleeper Draft ID. Usage: `/lastpick [draft_id]`');
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
      // Look up the user's name/handle from your data file, which maps user_id to name.
      const nextPickerName = data[nextUserId] || `User ID ${nextUserId}`;

      nextPickerMessage = `@${nextPickerName}, you're on the clock!`;
    }

    // The `data.json` file maps a user_id to a name.
    // The pick object's `picked_by` field contains the user_id of the picker.
    const lastPickerName = data[lastPick.picked_by] || `User ID ${lastPick.picked_by}`;
    const pickDetails = `*PICK ALERT!*\n• Round: ${lastPick.round} - Pick Number: ${lastPick.pick_no}\n• Player Drafted: \`${lastPick.metadata.first_name} ${lastPick.metadata.last_name}\`\n• Picked by: ${lastPickerName}\n• ${nextPickerMessage}`;

    await say({
      blocks: [
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": pickDetails
          }
        }
      ],
      text: `Last pick for draft ${draftId} was ${lastPick.metadata.first_name} ${lastPick.metadata.last_name}. ${nextPickerMessage}`
    });
  } catch (error) {
    console.error("Error in /lastpick command:", error);
    await say(`Sorry, I couldn't fetch the draft details. The Sleeper API might be down or the Draft ID \`${draftId}\` is invalid.`);
  }
});

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

(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);

  app.logger.info('⚡️ Bolt app is running!');
})();
