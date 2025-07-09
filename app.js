require('dotenv').config();
const { App } = require('@slack/bolt');
const { handleAppMention, handleDirectMessage } = require('./shared/commandPatterns.js');
const { checkDraftForUpdates } = require('./services/draftMonitor.js');

/**
 * This sample slack application can run in both traditional server mode and AWS Lambda mode.
 * 
 * Server mode: Use SocketMode for development
 * Lambda mode: Use HTTP mode with API Gateway (see lambda-handler.js)
 */

// Determine if we're running in Lambda environment
const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const isDevelopment = process.env.NODE_ENV === 'development';

// Initializes your app with your bot token and signing secret
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  // Use Socket Mode for development, HTTP mode for Lambda
  socketMode: !isLambda && isDevelopment
});

// Handle socket mode connection issues
app.client.on('error', (error) => {
  console.error('Slack client error:', error);
});

/**
 * Listens for messages that @-mention the bot and routes them to the appropriate handler.
 */
app.event('app_mention', handleAppMention);

// Handle message events (if bot is added to channels)
app.message(handleDirectMessage);

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
  // Only start the server if we're not in Lambda environment
  if (!isLambda) {
    try {
      await app.start(process.env.PORT || 3000);
      app.logger.info('⚡️ Bolt app is running!');

      // Start the draft monitor job only in server mode (not Lambda)
      const monitorIntervalMs = 60 * 1000; // 1 minute
      setInterval(() => checkDraftForUpdates(app), monitorIntervalMs);
      app.logger.info(`Draft monitor started. Checking for new picks every ${monitorIntervalMs / 1000} seconds.`);
    } catch (error) {
      app.logger.error('Failed to start app:', error);
      process.exit(1);
    }
  } else {
    app.logger.info('⚡️ App initialized for Lambda environment');
  }
})();
