const { App, AwsLambdaReceiver } = require('@slack/bolt');
const { handleAppMention, handleDirectMessage } = require('./shared/commandPatterns.js');

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

// AWS Lambda handler
module.exports.handler = async (event, context, callback) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('Lambda received event:', JSON.stringify(event, null, 2));
  }

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
