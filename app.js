// require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { App } = require('@slack/bolt');
const { handleAppMention, handleDirectMessage } = require('./shared/commandPatterns.js');
const { checkDraftForUpdates } = require('./services/draftMonitor.js');

// Load local environment variables from local-env.json if it exists and we're in development
const localEnvPath = path.join(__dirname, 'local-env.json');
if (fs.existsSync(localEnvPath)) {
  try {
    const localEnv = JSON.parse(fs.readFileSync(localEnvPath, 'utf8'));
    
    // Merge local environment variables with process.env (don't override existing ones)
    Object.keys(localEnv).forEach(key => {
      if (!process.env[key]) {
        process.env[key] = localEnv[key];
      }
    });
    
    console.log('📁 Loaded local environment variables from local-env.json');
  } catch (error) {
    console.warn('⚠️  Warning: Could not parse local-env.json:', error.message);
  }
}

/**
 * This sample slack application can run in both traditional server mode and AWS Lambda mode.
 * 
 * Server mode: Use SocketMode for development
 * Lambda mode: Use HTTP mode with API Gateway (see lambda-handler.js)
 */

// Determine if we're running in Lambda environment
const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

console.log('🚀 Environment:', {
  isLambda,
  isDevelopment,
  nodeEnv: process.env.NODE_ENV,
  socketMode: !isLambda,
  hasSlackBotToken: !!process.env.SLACK_BOT_TOKEN,
  hasSlackSigningSecret: !!process.env.SLACK_SIGNING_SECRET,
  hasSlackAppToken: !!process.env.SLACK_APP_TOKEN,
  port: process.env.PORT || 3000
});

// Validate required environment variables
const requiredEnvVars = ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET'];
// Add SLACK_APP_TOKEN as required when not in Lambda (for socket mode)
if (!isLambda) {
  requiredEnvVars.push('SLACK_APP_TOKEN');
}

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars);
  console.error('💡 Please check your .env file or local-env.json file');
  if (!isLambda) {
    console.error('💡 For socket mode, you need SLACK_APP_TOKEN from your Slack app settings');
    process.exit(1);
  }
}

// Initializes your app with your bot token and signing secret
const appConfig = {
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  // Use Socket Mode when not in Lambda, HTTP mode for Lambda
  socketMode: !isLambda
};

// Add app token for socket mode
if (appConfig.socketMode) {
  appConfig.appToken = process.env.SLACK_APP_TOKEN;
}

const app = new App(appConfig);

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
