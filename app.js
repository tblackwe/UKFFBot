require('dotenv').config();
const { App } = require('@slack/bolt');
const { handleLastPickCommand } = require('./handlers/lastpick.js');
const { handleRegisterDraftCommand } = require('./handlers/registerDraft.js');
const { handleRegisterPlayerCommand } = require('./handlers/registerPlayer.js');
const { handleUsageCommand } = require('./handlers/handleUsageCommand.js');
const { handleUnregisterDraftCommand } = require('./handlers/unregisterDraft.js');
const { handleListDraftsCommand } = require('./handlers/listDrafts.js');
const { checkDraftForUpdates } = require('./services/draftMonitor.js');

/**
 * This sample slack application uses SocketMode.
 * For the companion getting started setup guide, see:
 * https://tools.slack.dev/bolt-js/getting-started/
 */

// Initializes your app with your bot token and signing secret
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  // Use HTTP mode instead of Socket Mode for better reliability
  socketMode: false
});

// Handle socket mode connection issues
app.client.on('error', (error) => {
  console.error('Slack client error:', error);
});

// Add connection retry logic
const startAppWithRetry = async (maxRetries = 5, delay = 5000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await app.start(process.env.PORT || 3000);
      app.logger.info('⚡️ Bolt app is running!');
      return; // Success, exit retry loop
    } catch (error) {
      app.logger.error(`Attempt ${attempt} failed:`, error);
      
      if (attempt === maxRetries) {
        app.logger.error('Max retry attempts reached. Exiting...');
        process.exit(1);
      }
      
      app.logger.info(`Retrying in ${delay/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

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

(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);

  app.logger.info('⚡️ Bolt app is running!');

  // Start the draft monitor job to check for new picks periodically.
  const monitorIntervalMs = 60 * 1000; // 1 minute
  setInterval(() => checkDraftForUpdates(app), monitorIntervalMs);
  app.logger.info(`Draft monitor started. Checking for new picks every ${monitorIntervalMs / 1000} seconds.`);
})();
