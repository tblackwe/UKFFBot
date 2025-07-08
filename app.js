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

// Initializes your app with your bot token and app token
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN
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

    if (commandName === 'lastpick') {
      await handleLastPickCommand({ command: commandPayload, say });
    } else if (commandName === 'registerdraft') {
      await handleRegisterDraftCommand({ command: commandPayload, say });
    } else if (commandName === 'registerplayer') {
      await handleRegisterPlayerCommand({ command: commandPayload, say });
    } else if (commandName === 'usage' || commandName === 'help') {
      await handleUsageCommand({ say });
    } else if (commandName === 'unregisterdraft') {
      await handleUnregisterDraftCommand({ command: commandPayload, say });
    } else if (commandName === 'listdrafts') {
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

(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);

  app.logger.info('⚡️ Bolt app is running!');

  // Start the draft monitor job to check for new picks periodically.
  const monitorIntervalMs = 60 * 1000; // 1 minute
  setInterval(() => checkDraftForUpdates(app), monitorIntervalMs);
  app.logger.info(`Draft monitor started. Checking for new picks every ${monitorIntervalMs / 1000} seconds.`);
})();
