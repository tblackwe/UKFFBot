require('dotenv').config();
const { App } = require('@slack/bolt');
const { handleLastPickCommand } = require('./handlers/lastpick.js');

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


/**
 * Responds to the /lastpick slash command.
 * Takes a Sleeper Draft ID, fetches the draft's picks, and displays the last one.
 */
app.command('/lastpick', handleLastPickCommand);

(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);

  app.logger.info('⚡️ Bolt app is running!');
})();
