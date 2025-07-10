const { handleLastPickCommand } = require('../handlers/lastpick.js');
const { handleRegisterDraftCommand } = require('../handlers/registerDraft.js');
const { handleRegisterPlayerCommand } = require('../handlers/registerPlayer.js');
const { handleUsageCommand } = require('../handlers/handleUsageCommand.js');
const { handleUnregisterDraftCommand } = require('../handlers/unregisterDraft.js');
const { handleListDraftsCommand } = require('../handlers/listDrafts.js');

/**
 * Creates a command payload object for consistency across handlers
 */
function createCommandPayload(remainingText, channelId) {
  return { text: remainingText, channel_id: channelId };
}

/**
 * Creates the command patterns array for consistent command routing
 */
function createCommandPatterns(event, say) {
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
      pattern: /^register\splayer(.+)$/i, 
      handler: (remainingText) => {
        const commandPayload = createCommandPayload(remainingText, event.channel);
        return handleRegisterPlayerCommand({ command: commandPayload, say });
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
      pattern: /^list\sdrafts$/i, 
      handler: () => say("For security, the `list drafts` command can only be used in a direct message with me.")
    }
  ];
}

/**
 * Processes app_mention events with consistent command routing
 */
async function handleAppMention({ event, say, logger }) {
  try {
    // Remove the bot mention from the message text and trim whitespace
    const text = event.text.replace(/<@.*?>\s*/, '').trim();

    // If no text after mention, show help
    if (!text) {
      // await handleUsageCommand({ say });
      return;
    }

    const commandPatterns = createCommandPatterns(event, say);

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
    }
  } catch (error) {
    logger.error("Error processing app_mention:", error);
    await say('An error occurred while processing your request.');
  }
}

/**
 * Handles direct message events consistently
 */
async function handleDirectMessage({ message, say, logger }) {
  // Only respond to direct messages or if bot is mentioned
  if (message.channel_type === 'im') {
    if (/list drafts/i.test(message.text)) {
      const commandPayload = createCommandPayload('', message.channel);
      await handleListDraftsCommand({ command: commandPayload, say });
    }
  }
}

module.exports = {
  createCommandPayload,
  createCommandPatterns,
  handleAppMention,
  handleDirectMessage
};
