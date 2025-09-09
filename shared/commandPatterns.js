const { handleLastPickCommand } = require('../handlers/lastpick.js');
const { handleRegisterDraftCommand } = require('../handlers/registerDraft.js');
const { handleRegisterPlayerCommand } = require('../handlers/registerPlayer.js');
const { handleRegisterLeagueCommand } = require('../handlers/registerLeague.js');
const { handleUsageCommand } = require('../handlers/handleUsageCommand.js');
const { handleUnregisterDraftCommand } = require('../handlers/unregisterDraft.js');
const { handleListDraftsCommand } = require('../handlers/listDrafts.js');
const { handleListLeaguesCommand } = require('../handlers/listLeagues.js');
const { handleUpdatePlayersCommand } = require('../handlers/updatePlayers.js');
const { handleCheckRostersCommand, handleCheckLeagueRostersCommand } = require('../handlers/checkRosters.js');
const { handleCacheStatusCommand, handleCacheRefreshCommand } = require('../handlers/cacheManagement.js');

/**
 * Creates a command payload object for consistency across handlers
 */
function createCommandPayload(remainingText, channelId, ts = null) {
  return { text: remainingText, channel_id: channelId, ts: ts };
}

/**
 * Creates the command patterns array for consistent command routing
 */
function createCommandPatterns(event, say, client = null) {
  return [
    { 
      pattern: /^(last\s+pick|latest)$/i, 
      handler: (remainingText) => {
        const commandPayload = createCommandPayload(remainingText, event.channel);
        return handleLastPickCommand({ command: commandPayload, say });
      }
    },
    { 
      pattern: /^register\sdraft(.+)$/i, 
      handler: (remainingText) => {
        const commandPayload = createCommandPayload(remainingText, event.channel);
        return handleRegisterDraftCommand({ command: commandPayload, say });
      }
    },
    { 
      pattern: /^register\sleague(.+)$/i, 
      handler: (remainingText) => {
        const commandPayload = createCommandPayload(remainingText, event.channel, event.ts);
        return handleRegisterLeagueCommand({ command: commandPayload, say });
      }
    },
    { 
      pattern: /^register\splayer(.+)$/i, 
      handler: (remainingText) => {
        const commandPayload = createCommandPayload(remainingText, event.channel);
        return handleRegisterPlayerCommand({ command: commandPayload, say, client });
      }
    },
    { 
      pattern: /^(usage|help)$/i, 
      handler: () => handleUsageCommand({ say })
    },
    { 
      pattern: /^unregister\sdraft(.+)$/i, 
      handler: (remainingText) => {
        const commandPayload = createCommandPayload(remainingText, event.channel);
        return handleUnregisterDraftCommand({ command: commandPayload, say });
      }
    },
    { 
      pattern: /^update\s+players$/i, 
      handler: () => say("For security, the `update players` command can only be used in a direct message with me.")
    },
    { 
      pattern: /^list\sdrafts$/i, 
      handler: () => say("For security, the `list drafts` command can only be used in a direct message with me.")
    },
    { 
      pattern: /^list\sleagues$/i, 
      handler: () => {
        const commandPayload = createCommandPayload('', event.channel, event.ts);
        return handleListLeaguesCommand({ command: commandPayload, say });
      }
    },
    { 
      pattern: /^check\srosters$/i, 
      handler: () => {
        const commandPayload = createCommandPayload('', event.channel, event.ts);
        return handleCheckRostersCommand({ command: commandPayload, say });
      }
    },
    { 
      pattern: /^check\sleague\srosters(.+)$/i, 
      handler: (remainingText) => {
        const commandPayload = createCommandPayload(remainingText, event.channel, event.ts);
        return handleCheckLeagueRostersCommand({ command: commandPayload, say });
      }
    },
    { 
      pattern: /^cache\sstatus$/i, 
      handler: () => {
        const params = { 
          ack: async () => {},
          respond: say,
          command: createCommandPayload('', event.channel),
          client
        };
        return handleCacheStatusCommand(params);
      }
    },
    { 
      pattern: /^cache\srefresh$/i, 
      handler: () => {
        const params = { 
          ack: async () => {},
          respond: say,
          command: createCommandPayload('', event.channel),
          client
        };
        return handleCacheRefreshCommand(params);
      }
    }
  ];
}

/**
 * Processes app_mention events with consistent command routing
 */
async function handleAppMention({ event, say, logger, client }) {
  try {
    // Remove the bot mention from the message text and trim whitespace
    const text = event.text.replace(/<@.*?>\s*/, '').trim();

    // If no text after mention, show help
    if (!text) {
      await handleUsageCommand({ say });
      return;
    }

    const commandPatterns = createCommandPatterns(event, say, client);

    // Find matching command pattern by testing the full text
    let matchedCommand = null;
    let remainingText = '';
    
    for (const { pattern, handler } of commandPatterns) {
      const match = text.match(pattern);
      if (match) {
        matchedCommand = { handler };
        // Extract remaining text after the command
        remainingText = match[1] ? match[1].trim() : '';
        break;
      }
    }
    
    if (matchedCommand) {
      await matchedCommand.handler(remainingText);
    } else {
      // Extract first word/phrase for error message
      const firstWord = text.split(/\s+/)[0] || text;
      await say(`Sorry, I don't understand the command \`${firstWord}\`.`);
      await handleUsageCommand({ say });
    }
  } catch (error) {
    logger.error("Error processing app_mention:", error);
    await say('An error occurred while processing your request.');
  }
}

/**
 * Handles direct message events consistently
 */
async function handleDirectMessage({ message, say, logger, client }) {
  // Only respond to direct messages or if bot is mentioned
  if (message.channel_type === 'im') {
    if (/list\s+drafts/i.test(message.text)) {
      const commandPayload = createCommandPayload('', message.channel);
      await handleListDraftsCommand({ command: commandPayload, say });
    } else if (/update\s+players/i.test(message.text)) {
      await handleUpdatePlayersCommand({ say, client });
    }
  }
}

module.exports = {
  createCommandPayload,
  createCommandPatterns,
  handleAppMention,
  handleDirectMessage
};
