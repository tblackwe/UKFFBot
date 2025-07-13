const fs = require('fs');
const path = require('path');
const { App } = require('@slack/bolt');
const { handleAppMention, handleDirectMessage } = require('./shared/commandPatterns.js');
const { checkDraftForUpdates } = require('./services/draftMonitor.js');
const { handleRegisterPlayerCommand } = require('./handlers/registerPlayer.js');
const { handleRegisterDraftCommand } = require('./handlers/registerDraft.js');
const { handleListDraftsCommand } = require('./handlers/listDrafts.js');

// Load view templates
const appHomeView = require('./views/appHome.json');
const registerPlayerModal = require('./views/registerPlayerModal.json');
const registerDraftModal = require('./views/registerDraftModal.json');

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
    console.log(`   Loaded ${Object.keys(localEnv).length} environment variables`);
  } catch (error) {
    console.warn('⚠️  Warning: Could not parse local-env.json:', error.message);
  }
} else {
  console.log('📁 No local-env.json found, using system environment variables');
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

app.message('listdrafts', async ({ event, say }) => {
  const commandPayload = {
    text: 'listdrafts',
    channel_id: event.channel,
  };
  const channelId = commandPayload.channel_id;

  // DM channel IDs in Slack typically start with 'D'. This ensures the command is private.
  if (!channelId.startsWith('D')) {
    return;
  }
  await handleListDraftsCommand({ command: commandPayload, say });
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

// Add a catch-all event handler for debugging (exclude events we already handle)
app.event(/.+/, async ({ event, logger }) => {
  // Skip events that we already handle specifically
  const handledEvents = ['app_mention', 'message', 'team_join', 'member_joined_channel', 'app_home_opened'];
  if (!handledEvents.includes(event.type)) {
    logger.info(`Received unhandled event: ${event.type}${event.text ? ` - ${event.text}` : ''}`);
  }
  // Don't process, just log for debugging
});

// Register the slash command handler
app.command('/register_player', async ({ command, ack, respond, logger }) => {
  await ack();

  try {
    // Open the modal view
    await app.client.views.open({
      // The user ID from the command payload
      user_id: command.user_id,
      // The modal view object
      view: registerPlayerModal
    });
  } catch (error) {
    logger.error('Error opening modal:', error);
  }
});

// Handle App Home opened event
app.event('app_home_opened', async ({ event, client, logger }) => {
  try {
    // Only update the home tab, not the messages tab
    if (event.tab !== 'home') return;

    logger.info(`Publishing App Home for user: ${event.user}`);
    
    await client.views.publish({
      user_id: event.user,
      view: appHomeView
    });
    
    logger.info(`App Home published successfully for user: ${event.user}`);
  } catch (error) {
    logger.error('Error publishing App Home:', {
      message: error.message,
      code: error.code,
      data: error.data,
      stack: error.stack
    });
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

// Handle register player modal submission
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

// Handle register draft modal submission
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

// Validate Slack app configuration and permissions
async function validateSlackApp(app) {
  try {
    console.log('🔍 Validating Slack app configuration...');
    
    // Test the bot token by calling auth.test
    const authTest = await app.client.auth.test();
    console.log('✅ Bot token is valid');
    console.log(`   Bot User ID: ${authTest.user_id}`);
    console.log(`   Team: ${authTest.team}`);
    
    // Test a simple API call that requires the users:read scope
    try {
      await app.client.users.info({ user: authTest.user_id });
      console.log('✅ users:read scope is available');
    } catch (scopeError) {
      console.warn('⚠️  users:read scope may be missing:', scopeError.message);
    }
    
    // Check if we have basic API access
    if (authTest.ok) {
      console.log('✅ App has basic API access');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Slack app validation failed:', error.message);
    
    if (error.message.includes('invalid_auth')) {
      console.error('💡 Check your SLACK_BOT_TOKEN - it may be invalid or expired');
    } else if (error.message.includes('missing_scope')) {
      console.error('💡 Your app may be missing required OAuth scopes');
      console.error('   Required scopes: app_mentions:read, chat:write, im:history, users:read, channels:read');
      console.error('   Please reinstall your app or update the scopes in your Slack App settings');
    }
    
    return false;
  }
}

(async () => {
  // Only start the server if we're not in Lambda environment
  if (!isLambda) {
    try {
      // Validate Slack app configuration before starting
      const isValid = await validateSlackApp(app);
      if (!isValid) {
        console.error('❌ Slack app validation failed. Please check your configuration.');
        process.exit(1);
      }
      
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
