/**
 * Standardized error messages for consistency across handlers
 */
const ERROR_MESSAGES = {
  NO_DRAFT_REGISTERED: 'There is no draft registered for this channel. Please use `@YourBotName registerdraft [draft_id]` to get started.',
  NO_DRAFT_REGISTERED_SIMPLE: 'There is no draft registered for this channel.',
  CONFIGURATION_ERROR: ':x: Sorry, I couldn\'t complete the operation. There was an error updating my configuration.',
  API_ERROR: 'Sorry, I couldn\'t fetch the draft details. The Sleeper API might be down or the Draft ID is invalid.',
  GENERIC_ERROR: 'An error occurred while processing your request.'
};

/**
 * Standardized success messages for consistency across handlers
 */
const SUCCESS_MESSAGES = {
  DRAFT_REGISTERED: (draftId) => `:white_check_mark: Successfully registered draft \`${draftId}\` to this channel.`,
  DRAFT_UNREGISTERED: (draftId) => `:white_check_mark: Successfully unregistered draft \`${draftId}\` from this channel.`,
  PLAYER_REGISTERED: (sleeperId, slackName) => `:white_check_mark: Successfully registered player. Sleeper ID \`${sleeperId}\` is now mapped to \`${slackName}\`.`
};

/**
 * Logs errors with consistent formatting
 */
function logError(commandName, error) {
  console.error(`Error in ${commandName} command:`, error);
}

/**
 * Standardized error handling for handlers
 */
async function handleCommandError(commandName, error, say, customMessage = null) {
  logError(commandName, error);
  await say(customMessage || ERROR_MESSAGES.CONFIGURATION_ERROR);
}

module.exports = {
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  logError,
  handleCommandError
};
