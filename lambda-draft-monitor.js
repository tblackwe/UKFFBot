const { App } = require('@slack/bolt');
const { checkDraftForUpdates } = require('./services/draftMonitor.js');

// Initialize the app for sending messages
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

/**
 * AWS Lambda handler for draft monitoring
 * This function is triggered by EventBridge (CloudWatch Events) on a schedule
 */
exports.handler = async (event, context) => {
  console.log('Draft monitor Lambda triggered:', JSON.stringify(event, null, 2));
  
  try {
    // Check for draft updates
    await checkDraftForUpdates(app);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Draft monitoring completed successfully',
        timestamp: new Date().toISOString()
      })
    };
  } catch (error) {
    console.error('Draft monitoring failed:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Draft monitoring failed',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};
