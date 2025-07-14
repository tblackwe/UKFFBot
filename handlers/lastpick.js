const { getDraftPicks, getDraft } = require("../services/sleeper.js");
const { getData, getPlayer } = require("../services/datastore.js");
const { logError, ERROR_MESSAGES } = require("../shared/messages.js");
const { getDisplayName } = require("../services/slackUserService.js");
const {
  validatePickData,
  getNewPicksSinceLastUpdate,
} = require("../shared/pickUtils.js");

// Configuration constants for multi-pick display
const MULTI_PICK_CONFIG = {
  MAX_PICKS_TO_SHOW: 10, // Maximum picks to display to prevent message overflow
  ENABLE_MULTI_PICK: true, // Feature flag for multi-pick functionality
  FALLBACK_TO_SINGLE: true, // Enable graceful degradation to single-pick display
  MAX_MESSAGE_BLOCKS: 45, // Conservative Slack block limit (actual limit is 50)
  ESTIMATED_BLOCKS_PER_PICK: 2, // Each pick uses ~2 blocks (section + divider)
};

/**
 * Estimates the number of blocks that will be used for a given number of picks
 * @param {number} pickCount Number of picks to display
 * @returns {number} Estimated number of blocks
 */
function estimateBlockCount(pickCount) {
  // Base blocks: header (1) + count (1) + divider (1) + final divider (1) + next picker (1) = 5
  const baseBlocks = 5;
  // Each pick: section (1) + divider (1) = 2 blocks, but last pick doesn't have divider
  const pickBlocks = pickCount > 0 ? pickCount * 2 - 1 : 0;
  // Truncation message: divider (1) + section (1) = 2 blocks (if needed)
  const truncationBlocks = 2;

  return baseBlocks + pickBlocks + truncationBlocks;
}

/**
 * Calculates the maximum number of picks that can be safely displayed within Slack limits
 * @param {number} totalNewPicks Total number of new picks available
 * @returns {number} Maximum picks that can be displayed safely
 */
function calculateSafePickLimit(totalNewPicks) {
  // Handle edge case of zero picks
  if (totalNewPicks === 0) {
    return 0;
  }

  const configLimit = MULTI_PICK_CONFIG.MAX_PICKS_TO_SHOW;

  // Start with config limit and work backwards to find safe limit
  for (
    let pickCount = Math.min(configLimit, totalNewPicks);
    pickCount > 0;
    pickCount--
  ) {
    const estimatedBlocks = estimateBlockCount(pickCount);
    if (estimatedBlocks <= MULTI_PICK_CONFIG.MAX_MESSAGE_BLOCKS) {
      return pickCount;
    }
  }

  // If we can't fit any picks safely, return 1 as minimum
  return 1;
}

/**
 * Finds the user ID for a given draft slot from the draft_order object.
 * @param {number} slot The draft slot to find (e.g., 1, 2, 3...).
 * @param {object} draftOrder The draft_order object from the Sleeper draft details, mapping user_id to slot.
 * @toreturns {string|null} The user ID for the slot, or null if not found.
 */
function getUserForSlot(slot, draftOrder) {
  // Iterate over the draft order to find the user ID whose value matches the slot.
  for (const userId in draftOrder) {
    if (
      Object.prototype.hasOwnProperty.call(draftOrder, userId) &&
      draftOrder[userId] === slot
    ) {
      return userId;
    }
  }
  return null; // Should not happen in a valid draft
}

/**
 * Helper function to format a single pick for display
 * @param {object} pick The pick object from Sleeper API
 * @param {object} draft The full draft object from the Sleeper API
 * @param {object} data The application's configuration data (from datastore)
 * @returns {object} Formatted pick data with display information
 */
async function formatPickForDisplay(pick, draft, data) {
  const totalTeams = Object.keys(draft.draft_order).length;

  // Get the picker's name using the new datastore structure
  let pickerName = `User ID ${pick.picked_by}`;
  try {
    const playerData = await getPlayer(pick.picked_by);
    if (playerData) {
      pickerName = getDisplayName(playerData, false); // Never use mention for pick display
    } else {
      // Fallback to old player_map format
      pickerName = data.player_map[pick.picked_by] || pickerName;
    }
  } catch (error) {
    console.warn(`Could not get player data for ${pick.picked_by}:`, error);
    // Fallback to old player_map format
    pickerName = data.player_map[pick.picked_by] || pickerName;
  }

  const playerName = `${pick.metadata.first_name} ${pick.metadata.last_name}`;
  const playerPosition = pick.metadata.position || "N/A";

  // Calculate pick number within the round, e.g., 1.01, 4.12
  const pickInRound = ((pick.pick_no - 1) % totalTeams) + 1;
  const formattedPick = `${pick.round}.${String(pickInRound).padStart(2, "0")}`;

  return {
    formattedPick,
    playerName,
    playerPosition,
    pickerName,
  };
}

/**
 * Generates the Slack message payload for multiple picks since last update.
 * @param {object} draft The full draft object from the Sleeper API.
 * @param {object[]} picks The array of pick objects from the Sleeper API.
 * @param {number} newPicksStartIndex The index where new picks start in the picks array.
 * @param {object} data The application's configuration data (from datastore).
 * @param {boolean} notifyNextPicker Whether to use @ mention for next picker notification.
 * @returns {object} A Slack message payload object with `blocks` and `text`.
 */
async function generateMultiPickMessagePayload(
  draft,
  picks,
  newPicksStartIndex,
  data,
  notifyNextPicker = false
) {
  // Check if multi-pick feature is enabled
  if (!MULTI_PICK_CONFIG.ENABLE_MULTI_PICK) {
    // Fall back to single-pick display if feature is disabled
    return await generatePickMessagePayload(
      draft,
      picks,
      data,
      notifyNextPicker
    );
  }

  const allNewPicks = picks.slice(newPicksStartIndex);
  const totalNewPickCount = allNewPicks.length;

  // Calculate safe pick limit to prevent message overflow
  const maxPicksToShow = calculateSafePickLimit(totalNewPickCount);
  const newPicks = allNewPicks.slice(0, maxPicksToShow);
  const pickCount = newPicks.length;
  const hasMorePicks = totalNewPickCount > maxPicksToShow;

  // --- Logic to determine the next picker ---
  let nextPickerMessage = "The draft is complete!";
  const picksMade = picks.length;
  const totalTeams = Object.keys(draft.draft_order).length;
  const totalPicks = draft.settings.rounds * totalTeams;

  if (picksMade < totalPicks) {
    const nextPickRound = Math.floor(picksMade / totalTeams) + 1;
    const nextPickInRound = (picksMade % totalTeams) + 1;

    let draftSlotForNextPick = nextPickInRound;
    // Determine the slot for the next pick based on draft type (e.g., snake, 3RR)
    if (draft.type === "snake") {
      const reversalRound = draft.settings.reversal_round || 0;
      let isReversed = nextPickRound % 2 === 0;

      if (reversalRound > 0 && nextPickRound >= reversalRound) {
        isReversed = !isReversed;
      }

      if (isReversed) {
        draftSlotForNextPick = totalTeams - nextPickInRound + 1;
      }
    } else {
      draftSlotForNextPick = nextPickInRound;
    }

    const nextUserId = getUserForSlot(draftSlotForNextPick, draft.draft_order);

    let nextPickerName = `User ID ${nextUserId}`;
    try {
      const playerData = await getPlayer(nextUserId);
      if (playerData) {
        nextPickerName = getDisplayName(playerData, notifyNextPicker);
      } else {
        const mappedName = data.player_map[nextUserId];
        if (mappedName) {
          nextPickerName = notifyNextPicker ? `<@${mappedName}>` : mappedName;
        }
      }
    } catch (error) {
      console.warn(`Could not get player data for ${nextUserId}:`, error);
      const mappedName = data.player_map[nextUserId];
      if (mappedName) {
        nextPickerName = notifyNextPicker ? `<@${mappedName}>` : mappedName;
      }
    }
    nextPickerMessage = nextPickerName;
  }

  // Format all new picks for display
  const formattedPicks = await Promise.all(
    newPicks.map((pick) => formatPickForDisplay(pick, draft, data))
  );

  // Create fallback text
  const pickSummary = formattedPicks
    .map(
      (fp) =>
        `Pick ${fp.formattedPick}: ${fp.playerName} (${fp.playerPosition}) - ${fp.pickerName}`
    )
    .join("; ");

  const truncationText = hasMorePicks
    ? ` (and ${totalNewPickCount - maxPicksToShow} more)`
    : "";
  const fallbackText =
    picksMade < totalPicks
      ? `${totalNewPickCount} new picks since last update: ${pickSummary}${truncationText}. Next up: ${nextPickerMessage}`
      : `${totalNewPickCount} new picks since last update: ${pickSummary}${truncationText}. The draft is complete!`;

  // Build the blocks array
  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:rotating_light: *MULTIPLE PICKS ALERT!* :rotating_light:`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${totalNewPickCount} new picks since last update:*`,
      },
    },
    { type: "divider" },
  ];

  // Add each pick as a separate section with visual separators
  formattedPicks.forEach((pickData, index) => {
    blocks.push({
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Pick:* \`${pickData.formattedPick}\`` },
        {
          type: "mrkdwn",
          text: `*Player:* \`${pickData.playerName} - ${pickData.playerPosition}\``,
        },
        { type: "mrkdwn", text: `*Picked By:* ${pickData.pickerName}` },
      ],
    });

    // Add divider between picks (but not after the last pick)
    if (index < formattedPicks.length - 1) {
      blocks.push({ type: "divider" });
    }
  });

  // Add truncation message if there are more picks than shown
  if (hasMorePicks) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:point_right: *...and ${
          totalNewPickCount - maxPicksToShow
        } more picks*`,
      },
    });
  }

  // Add final divider and next picker info
  blocks.push({ type: "divider" });
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: `*On The Clock:* ${nextPickerMessage}` },
  });

  return {
    text: fallbackText,
    blocks: blocks,
  };
}

/**
 * Generates the Slack message payload for a pick update.
 * @param {object} draft The full draft object from the Sleeper API.
 * @param {object[]} picks The array of pick objects from the Sleeper API.
 * @param {object} data The application's configuration data (from datastore).
 * @param {boolean} notifyNextPicker Whether to use @ mention for next picker notification.
 * @returns {object} A Slack message payload object with `blocks` and `text`.
 */
async function generatePickMessagePayload(
  draft,
  picks,
  data,
  notifyNextPicker = false
) {
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
    if (draft.type === "snake") {
      // A reversal_round value indicates a draft like "3rd Round Reversal".
      const reversalRound = draft.settings.reversal_round || 0;

      // Standard snake behavior: even rounds are reversed.
      let isReversed = nextPickRound % 2 === 0;

      // For 3RR (or NRR), flip the snake pattern at and after the reversal round.
      if (reversalRound > 0 && nextPickRound >= reversalRound) {
        isReversed = !isReversed;
      }

      if (isReversed) {
        // Calculate the slot for a reversed (snaking) round.
        draftSlotForNextPick = totalTeams - nextPickInRound + 1;
      }
    } else {
      // Handles 'linear' or other non-snake draft types
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
  const playerPosition = lastPick.metadata.position || "N/A";

  // Calculate pick number within the round, e.g., 1.01, 4.12
  const pickInRound = ((lastPick.pick_no - 1) % totalTeams) + 1;
  const formattedPick = `${lastPick.round}.${String(pickInRound).padStart(
    2,
    "0"
  )}`;

  // Create the fallback text for the message
  const fallbackText =
    picksMade < totalPicks
      ? `Pick ${formattedPick}: ${playerName} (${playerPosition}) was selected by ${lastPickerName}. Next up: ${nextPickerMessage}`
      : `Pick ${formattedPick}: ${playerName} (${playerPosition}) was selected by ${lastPickerName}. The draft is complete!`;

  return {
    text: fallbackText, // This is the required fallback text
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:alarm_clock: *PICK ALERT!* :alarm_clock:`,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Pick:* \`${formattedPick}\`` },
          {
            type: "mrkdwn",
            text: `*Player:* \`${playerName} - ${playerPosition}\``,
          },
          { type: "mrkdwn", text: `*Picked By:* ${lastPickerName}` },
        ],
      },
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*On The Clock:* ${nextPickerMessage}` },
      },
    ],
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
    await say(
      "I couldn't read my configuration file (`data.json`). Please make sure I am set up correctly."
    );
    return;
  }

  // Find the draft registered to the channel where the command was used.
  const channelId = command.channel_id;
  let draftId = null;
  let draftInfo = null;

  if (data.drafts) {
    // Find the draft ID by matching the channel ID.
    const draftEntry = Object.entries(data.drafts).find(
      ([_id, info]) => info.slack_channel_id === channelId
    );
    if (draftEntry) {
      draftId = draftEntry[0];
      draftInfo = draftEntry[1];
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
      getDraft(draftId),
    ]);

    if (!picks || !draft) {
      await say(
        `Could not find a draft or picks for ID \`${draftId}\`. Please check the ID and try again.`
      );
      return;
    }

    if (draft.status === "pre_draft" || picks.length === 0) {
      await say(`The draft for ID \`${draftId}\` has not started yet.`);
      return;
    }

    // Get the last known pick count from draft info, with fallback handling
    let lastKnownPickCount = null;
    if (
      draftInfo &&
      typeof draftInfo.last_known_pick_count === "number" &&
      draftInfo.last_known_pick_count >= 0
    ) {
      lastKnownPickCount = draftInfo.last_known_pick_count;
    }

    // Validate pick data and determine display strategy
    let useMultiPickDisplay = false; // Initialize to false - only set to true when conditions are met
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
            console.log(`Multi-pick display enabled: ${pickRange.count} new picks found`);
          } else if (pickRange.hasNewPicks) {
            console.log(`Single new pick found, using single-pick display`);
          } else {
            console.log(`No new picks found since last update`);
          }
        } catch (error) {
          console.warn(
            "Error calculating new picks range, falling back to single-pick display:",
            error
          );
          // useMultiPickDisplay remains false
        }
      } else {
        console.warn(
          "Pick data validation failed, falling back to single-pick display:",
          validation.error
        );
        // useMultiPickDisplay remains false
      }
    } else if (!MULTI_PICK_CONFIG.ENABLE_MULTI_PICK) {
      console.log("Multi-pick feature is disabled, using single-pick display");
      // useMultiPickDisplay remains false
    } else {
      console.warn(
        "Missing or invalid last_known_pick_count, falling back to single-pick display"
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
        false
      );
    } else {
      messagePayload = await generatePickMessagePayload(
        draft,
        picks,
        data,
        false
      );
    }

    await say(messagePayload);
  } catch (error) {
    logError("/lastpick", error);
    await say(ERROR_MESSAGES.API_ERROR);
  }
};

module.exports = {
  handleLastPickCommand,
  generatePickMessagePayload,
  generateMultiPickMessagePayload,
  MULTI_PICK_CONFIG,
  estimateBlockCount,
  calculateSafePickLimit,
};
