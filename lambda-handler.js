const { App, AwsLambdaReceiver } = require('@slack/bolt');
const fs = require('fs').promises;

// Import all your existing handlers
const { handleLastPickCommand } = require('./handlers/lastpick.js');
const { handleRegisterDraftCommand } = require('./handlers/registerDraft.js');
const { handleRegisterPlayerCommand } = require('./handlers/registerPlayer.js');
const { handleUsageCommand } = require('./handlers/handleUsageCommand.js');
const { handleUnregisterDraftCommand } = require('./handlers/unregisterDraft.js');
const { handleListDraftsCommand } = require('./handlers/listDrafts.js');

// Initialize the AWS Lambda receiver
const awsLambdaReceiver = new AwsLambdaReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

// Initialize your app with the AWS Lambda receiver
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: awsLambdaReceiver,
  // The `processBeforeResponse` option is recommended for all FaaS environments
  processBeforeResponse: true,
});

/**
 * Listens for messages that @-mention the bot and routes them to the appropriate handler.
 */
app.event('app_mention', async ({ event, say, logger }) => {
  try {
    // Remove the bot mention from the message text and trim whitespace
    const text = event.text.replace(/<@.*?>\s*/, '').trim();

    // Define command patterns with regex for flexible matching (including multi-word commands)
    const commandPatterns = [
      { 
        pattern: /^latest.+$/i, 
        handler: (remainingText) => {
          const commandPayload = { text: remainingText, channel_id: event.channel };
          return handleLastPickCommand({ command: commandPayload, say });
        }
      },
      { 
        pattern: /^register\sdraft(.+)$/i, 
        handler: (remainingText) => {
          const commandPayload = { text: remainingText, channel_id: event.channel };
          return handleRegisterDraftCommand({ command: commandPayload, say });
        }
      },
      { 
        pattern: /^register\splayer(.+)$/i, 
        handler: (remainingText) => {
          const commandPayload = { text: remainingText, channel_id: event.channel };
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
          const commandPayload = { text: remainingText, channel_id: event.channel };
          return handleUnregisterDraftCommand({ command: commandPayload, say });
        }
      },
      { 
        pattern: /^list\sdrafts$/i, 
        handler: () => say("For security, the `list drafts` command can only be used in a direct message with me.")
      }
    ];

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
});

// Handle message events (if bot is added to channels)
app.message(async ({ message, logger }) => {
  // Only respond to direct messages or if bot is mentioned
  if (message.channel_type === 'im') {
    if (/list drafts/i.test(message.text))
      await handleListDraftsCommand({ command: commandPayload, say });
  }
});

// Handle team join events
app.event('team_join', async ({ event, logger }) => {
  logger.info('New team member joined');
});

// Handle channel join events
app.event('member_joined_channel', async ({ event, logger }) => {
  logger.info('Member joined channel');
});

// Add a global error handler for the Slack app
app.error(async (error) => {
  console.error('Slack app error:', error);
});

// Add a catch-all event handler for debugging
app.event(/.+/, async ({ event, logger }) => {
  logger.info(`Received unhandled event: ${event.type}`);
  // Don't process, just log for debugging
});

// AWS Lambda handler
module.exports.handler = async (event, context, callback) => {
  console.log('Lambda received event:', JSON.stringify(event, null, 2));

  try {
    const handler = await awsLambdaReceiver.start();
    return await handler(event, context, callback);
  } catch (error) {
    console.error('Lambda handler error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
