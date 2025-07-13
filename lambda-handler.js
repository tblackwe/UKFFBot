const { App, AwsLambdaReceiver } = require('@slack/bolt');
const { handleAppMention, handleDirectMessage } = require('./shared/commandPatterns.js');
const { handleRegisterPlayerCommand } = require('./handlers/registerPlayer.js');
const { handleRegisterDraftCommand } = require('./handlers/registerDraft.js');

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
      client: client
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
      say: sayFunction
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
