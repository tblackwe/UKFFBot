const { getDatastore } = require('../services/datastore.js');
const { logError, ERROR_MESSAGES } = require('../shared/messages.js');

/**
 * Handles app mentions that list all registered players for the draft associated with the current channel
 * This is triggered when someone just mentions the bot without a specific command
 */
async function handleListChannelPlayersCommand({ event, say }) {
  try {
    const channelId = event.channel;
    
    const datastore = getDatastore();
    const data = await datastore.getAllData();
    
    // Find the draft associated with this channel
    let associatedDraft = null;
    let draftName = null;
    
    // Check in the old format (drafts object with draft IDs)
    if (data.drafts) {
      for (const [draftId, draftInfo] of Object.entries(data.drafts)) {
        if (draftInfo.slack_channel_id === channelId) {
          associatedDraft = { ...draftInfo, draftId };
          draftName = draftId;
          break;
        }
      }
    }
    
    // Check in the new format (draftRegistrations object with draft names)
    if (!associatedDraft && data.draftRegistrations) {
      for (const [name, draftInfo] of Object.entries(data.draftRegistrations)) {
        if (draftInfo.channelId === channelId) {
          associatedDraft = draftInfo;
          draftName = name;
          break;
        }
      }
    }
    
    if (!associatedDraft) {
      await say({
        text: "📋 No draft registered for this channel",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "👋 Hi there! This channel doesn't have a draft registered yet.\n\nTo get started:\n• Use `register draft <draft_name> <sleeper_draft_id>` to register a draft\n• Then players can use `register player <name> <draft_name>` to sign up"
            }
          }
        ]
      });
      return;
    }

    // Get registered players for this draft
    let registeredPlayers = {};
    let playerCount = 0;
    
    // Check for players in the new format
    if (associatedDraft.registeredPlayers) {
      registeredPlayers = associatedDraft.registeredPlayers;
      playerCount = Object.keys(registeredPlayers).length;
    }
    
    if (playerCount === 0) {
      await say({
        text: `📋 No players registered for this draft yet`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*📋 ${draftName}*\n\nNo players have registered for this draft yet.\n\nPlayers can register using:\n\`register player <player_name> ${draftName}\``
            }
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `Draft ID: \`${associatedDraft.draftId || 'Not set'}\``
              }
            ]
          }
        ]
      });
      return;
    }

    // Build the list of registered players
    const playerList = Object.entries(registeredPlayers)
      .map(([slackUserId, playerName], index) => {
        return `${index + 1}. ${playerName} (<@${slackUserId}>)`;
      })
      .join('\n');

    await say({
      text: `📋 ${playerCount} player${playerCount !== 1 ? 's' : ''} registered for this draft`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*📋 ${draftName} - Registered Players*\n\n${playerList}\n\n*Total:* ${playerCount} player${playerCount !== 1 ? 's' : ''}`
          }
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Draft ID: \`${associatedDraft.draftId || 'Not set'}\` | Channel: <#${channelId}>`
            }
          ]
        }
      ]
    });

    if (process.env.NODE_ENV === 'development') {
      console.log(`Listed ${playerCount} players for channel ${channelId}, draft: ${draftName}`);
    }

  } catch (error) {
    logError('listChannelPlayers', error);
    await say(ERROR_MESSAGES.GENERIC_ERROR);
  }
}

module.exports = { handleListChannelPlayersCommand };
