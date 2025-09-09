const { App, AwsLambdaReceiver } = require('@slack/bolt');
const { handleAppMention, handleDirectMessage } = require('./shared/commandPatterns.js');
const { handleRegisterPlayerCommand } = require('./handlers/registerPlayer.js');
const { handleRegisterDraftCommand } = require('./handlers/registerDraft.js');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

// Initialize DynamoDB client for event deduplication
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'UKFFBot';

// Load view templates
const appHomeView = require('./views/appHome.json');
const registerPlayerModal = require('./views/registerPlayerModal.json');
const registerDraftModal = require('./views/registerDraftModal.json');

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

// Handle direct message events only (not channel messages)
app.message(async ({ message, say, logger, client }) => {
  // Only process direct messages, not channel messages
  if (message.channel_type === 'im') {
    await handleDirectMessage({ message, say, logger, client });
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

// Handle app_home_opened event to trigger when the App Home is opened
app.event('app_home_opened', async ({ event, client, logger }) => {
  try {
    // Only update the home tab, not the messages tab
    if (event.tab !== 'home') return;

    await client.views.publish({
      user_id: event.user,
      view: appHomeView
    });
  } catch (error) {
    logger.error('Error publishing App Home:', error);
  }
});

// Handle button click to open register player modal
app.action('open_register_player_modal', async ({ ack, body, client, logger }) => {
  try {
    await ack();

    await client.views.open({
      trigger_id: body.trigger_id,
      view: registerPlayerModal
    });
  } catch (error) {
    logger.error('Error opening register player modal:', error);
  }
});

// Handle button click to open register draft modal
app.action('open_register_draft_modal', async ({ ack, body, client, logger }) => {
  try {
    await ack();

    await client.views.open({
      trigger_id: body.trigger_id,
      view: registerDraftModal
    });
  } catch (error) {
    logger.error('Error opening register draft modal:', error);
  }
});

// Handle submission of the register player modal
app.view('register_player_modal', async ({ ack, body, view, client, logger }) => {
  try {
    // Extract form values
    const sleeperUsername = view.state.values.sleeper_username_block.sleeper_username_input.value;
    const selectedUserId = view.state.values.slack_user_block.slack_user_select.selected_user;

    // Validate inputs
    if (!sleeperUsername || !selectedUserId) {
      await ack({
        response_action: 'errors',
        errors: {
          sleeper_username_block: !sleeperUsername ? 'Sleeper username is required' : '',
          slack_user_block: !selectedUserId ? 'Slack user selection is required' : ''
        }
      });
      return;
    }

    await ack();

    // Get user info for the selected user
    const userInfo = await client.users.info({ user: selectedUserId });
    const slackName = userInfo.user.real_name || userInfo.user.display_name || userInfo.user.name;

    // Create a mock command object to reuse existing registerPlayer logic
    const mockCommand = {
      text: `${sleeperUsername} ${selectedUserId}`,
      channel_id: 'APP_HOME' // Special identifier for app home registrations
    };

    // Create a mock say function that will send a DM instead
    const sayFunction = async (message) => {
      await client.chat.postMessage({
        channel: body.user.id, // Send DM to the user who submitted the form
        text: typeof message === 'string' ? message : message.text,
        blocks: typeof message === 'object' && message.blocks ? message.blocks : undefined
      });
    };

    // Reuse the existing registerPlayer handler
    await handleRegisterPlayerCommand({
      command: mockCommand,
      say: sayFunction,
      client: client,
      ack
    });

  } catch (error) {
    logger.error('Error handling register player modal submission:', error);
    await ack({
      response_action: 'errors',
      errors: {
        sleeper_username_block: 'An error occurred while registering the player. Please try again.'
      }
    });
  }
});

// Handle submission of the register draft modal
app.view('register_draft_modal', async ({ ack, body, view, client, logger }) => {
  try {
    // Extract form values
    const draftId = view.state.values.draft_id_block.draft_id_input.value;
    const selectedChannelId = view.state.values.channel_block.channel_select.selected_channel;

    // Validate inputs
    if (!draftId || !selectedChannelId) {
      await ack({
        response_action: 'errors',
        errors: {
          draft_id_block: !draftId ? 'Draft ID is required' : '',
          channel_block: !selectedChannelId ? 'Channel selection is required' : ''
        }
      });
      return;
    }

    // Basic validation for draft ID (should be numeric)
    if (!/^\d+$/.test(draftId.trim())) {
      await ack({
        response_action: 'errors',
        errors: {
          draft_id_block: 'Draft ID should be a numeric value (e.g., 987654321)'
        }
      });
      return;
    }

    await ack();

    // Get channel info for display purposes
    const channelInfo = await client.conversations.info({ channel: selectedChannelId });
    const channelName = channelInfo.channel.name;

    // Create a mock command object to reuse existing registerDraft logic
    const mockCommand = {
      text: draftId.trim(),
      channel_id: selectedChannelId
    };

    // Create a mock say function that will send a DM to the user and also post in the target channel
    const sayFunction = async (message) => {
      // Send DM to the user who submitted the form
      await client.chat.postMessage({
        channel: body.user.id,
        text: typeof message === 'string' ? message : message.text,
        blocks: typeof message === 'object' && message.blocks ? message.blocks : undefined
      });

      // Also post a notification in the target channel
      await client.chat.postMessage({
        channel: selectedChannelId,
        text: `🏈 Draft registration updated by <@${body.user.id}>: ${typeof message === 'string' ? message : message.text}`
      });
    };

    // Reuse the existing registerDraft handler
    await handleRegisterDraftCommand({
      command: mockCommand,
      say: sayFunction,
      ack
    });

  } catch (error) {
    logger.error('Error handling register draft modal submission:', error);
    await ack({
      response_action: 'errors',
      errors: {
        draft_id_block: 'An error occurred while registering the draft. Please try again.'
      }
    });
  }
});


// Simple in-memory cache for event deduplication (Lambda container lifecycle)
const processedEvents = new Set();

/**
 * Check if an event has been processed using DynamoDB
 */
async function isEventProcessed(eventId) {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: 'EVENT_DEDUP',
        SK: `EVENT#${eventId}`
      }
    }));
    return !!result.Item;
  } catch (error) {
    console.error(`[LAMBDA] Error checking event deduplication for ${eventId}:`, error);
    return false;
  }
}

/**
 * Mark an event as processed in DynamoDB
 */
async function markEventProcessed(eventId) {
  try {
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: 'EVENT_DEDUP',
        SK: `EVENT#${eventId}`,
        eventId,
        processedAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + (60 * 60) // TTL: 1 hour
      },
      ConditionExpression: 'attribute_not_exists(PK)' // Only create if not exists
    }));
    return true;
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      console.log(`[LAMBDA] Event ${eventId} already marked as processed`);
      return false; // Event was already processed
    }
    console.error(`[LAMBDA] Error marking event ${eventId} as processed:`, error);
    return false;
  }
}

// AWS Lambda handler
module.exports.handler = async (event, context, callback) => {
  const startTime = Date.now();
  
  // Extract event ID for deduplication
  let eventId = null;
  try {
    const body = JSON.parse(event.body || '{}');
    eventId = body.event?.event_id || body.event_id || `${body.team_id}-${body.event_time}-${Math.random()}`;
  } catch (e) {
    eventId = `fallback-${Date.now()}-${Math.random()}`;
  }

  console.log(`[LAMBDA] Processing event ${eventId} at ${new Date().toISOString()}`);

  // Check in-memory cache first (fast check)
  if (processedEvents.has(eventId)) {
    console.log(`[LAMBDA] Duplicate event ${eventId} detected in memory, skipping`);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Event already processed (memory)' })
    };
  }

  // Check DynamoDB for deduplication (persistent check)
  const alreadyProcessed = await isEventProcessed(eventId);
  if (alreadyProcessed) {
    console.log(`[LAMBDA] Duplicate event ${eventId} detected in DynamoDB, skipping`);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Event already processed (DynamoDB)' })
    };
  }

  // Mark event as being processed
  const marked = await markEventProcessed(eventId);
  if (!marked) {
    console.log(`[LAMBDA] Event ${eventId} was processed by another instance, skipping`);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Event processed by another instance' })
    };
  }

  // Add to in-memory cache
  processedEvents.add(eventId);

  // Clean up old events (keep last 100 to prevent memory leaks)
  if (processedEvents.size > 100) {
    const eventsArray = Array.from(processedEvents);
    processedEvents.clear();
    eventsArray.slice(-50).forEach(id => processedEvents.add(id));
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('Lambda received event:', JSON.stringify(event, null, 2));
  }

  try {
    const handler = await awsLambdaReceiver.start();
    const result = await handler(event, context, callback);
    
    const duration = Date.now() - startTime;
    console.log(`[LAMBDA] Event ${eventId} processed successfully in ${duration}ms`);
    
    return result;
  } catch (error) {
    console.error(`[LAMBDA] Event ${eventId} error:`, error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
