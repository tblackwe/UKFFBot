const { App, AwsLambdaReceiver } = require('@slack/bolt');

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
  // Remove socketMode and related options as they're not needed for Lambda
});

/**
 * Listens for messages that @-mention the bot and routes them to the appropriate handler.
 */
app.event('app_mention', async ({ event, say, logger }) => {
  try {
    // Remove the bot mention from the message text and trim whitespace
    const text = event.text.replace(/<@.*?>\s*/, '').trim();
    const [commandName, ...args] = text.split(/\s+/);
    const commandArgs = args.join(' ');

    // Construct a "command-like" object to pass to handlers for consistency
    const commandPayload = {
      text: commandArgs,
      channel_id: event.channel,
    };

    if (commandName === 'last pick') {
      await handleLastPickCommand({ command: commandPayload, say });
    } else if (commandName === 'register draft') {
      await handleRegisterDraftCommand({ command: commandPayload, say });
    } else if (commandName === 'register player') {
      await handleRegisterPlayerCommand({ command: commandPayload, say });
    } else if (commandName === 'usage' || commandName === 'help') {
      await handleUsageCommand({ say });
    } else if (commandName === 'unregister draft') {
      await handleUnregisterDraftCommand({ command: commandPayload, say });
    } else if (commandName === 'list drafts') {
      await handleListDraftsCommand({ command: commandPayload, say });
    } else {
      await say(`Sorry, I don't understand the command \`${commandName}\`.`);
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
    logger.info('Received direct message, but not handling it');
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
