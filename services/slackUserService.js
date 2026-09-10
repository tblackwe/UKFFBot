/**
 * Service for resolving Slack user information
 */

const { resolveSlackUsername } = require('./slackUtils.js');

const INVALID_SLACK_USER = 'INVALID_SLACK_USER';

const MENTION_REQUIRED_MESSAGE =
    'I need a Slack @mention to register a player. Try `register player sleeper_name @TheirName`, or use the Register Player button on my App Home.';

function slackUserResolutionError(message) {
    const error = new Error(message);
    error.code = INVALID_SLACK_USER;
    return error;
}

function displayNameFromUser(user) {
    return user.profile?.display_name ||
        user.profile?.real_name ||
        user.real_name ||
        user.name ||
        user.id;
}

function userMatchesName(user, query) {
    const normalized = query.toLowerCase();
    const candidates = [
        user.name,
        user.real_name,
        user.profile?.display_name,
        user.profile?.display_name_normalized,
        user.profile?.real_name,
        user.profile?.real_name_normalized
    ].filter(Boolean).map((value) => value.toLowerCase());

    return candidates.includes(normalized);
}

/**
 * Finds workspace users whose handle or display name exactly matches the query.
 * @param {object} client Slack Web API client
 * @param {string} query Username or display name
 * @returns {Promise<object[]>} Matching Slack user objects
 */
async function findSlackUsersByName(client, query) {
    const matches = [];
    let cursor;

    do {
        const result = await client.users.list({ limit: 200, cursor });
        for (const user of result.members || []) {
            if (user.deleted || user.is_bot || user.id === 'USLACKBOT') {
                continue;
            }
            if (userMatchesName(user, query)) {
                matches.push(user);
            }
        }
        cursor = result.response_metadata?.next_cursor || undefined;
    } while (cursor);

    return matches;
}

/**
 * Resolves a Slack user input to both member ID and display name
 * @param {string} userInput - The user input (mention, member ID, or username)
 * @param {object} client - Slack client for API calls
 * @returns {Promise<object>} - Object with slackMemberId and slackName
 */
async function resolveSlackUser(userInput, client = null) {
    const { parseSlackUserInput } = require('../shared/inputValidation.js');
    const { memberId, isValidMemberId } = parseSlackUserInput(userInput);

    if (isValidMemberId) {
        let slackName = memberId;

        if (client) {
            try {
                const resolvedName = await resolveSlackUsername({ client }, memberId);
                slackName = resolvedName || memberId;
            } catch (error) {
                console.warn(`Could not resolve username for ${memberId}:`, error);
            }
        }

        return {
            slackMemberId: memberId,
            slackName
        };
    }

    if (!client) {
        throw slackUserResolutionError(MENTION_REQUIRED_MESSAGE);
    }

    try {
        const matches = await findSlackUsersByName(client, memberId);

        if (matches.length === 1) {
            const user = matches[0];
            return {
                slackMemberId: user.id,
                slackName: displayNameFromUser(user)
            };
        }

        if (matches.length > 1) {
            throw slackUserResolutionError(
                `Several Slack users match \`${memberId}\`. @mention the right person, or use the Register Player button on my App Home.`
            );
        }

        throw slackUserResolutionError(
            `Couldn't find a Slack user named \`${memberId}\`. @mention them instead, or use the Register Player button on my App Home.`
        );
    } catch (error) {
        if (error.code === INVALID_SLACK_USER) {
            throw error;
        }
        console.warn('Slack username lookup failed:', error);
        throw slackUserResolutionError(MENTION_REQUIRED_MESSAGE);
    }
}

/**
 * Gets display name for a user, preferring the resolved name over member ID
 * @param {object} playerData - Player data from datastore
 * @param {boolean} forNotification - Whether this is for a notification (use mention format)
 * @returns {string} - Formatted display name
 */
function getDisplayName(playerData, forNotification = false) {
    if (!playerData) {
        return 'Unknown User';
    }

    if (forNotification && playerData.slackMemberId) {
        return `<@${playerData.slackMemberId}>`;
    }

    return playerData.slackName || playerData.slackMemberId || 'Unknown User';
}

module.exports = {
    resolveSlackUser,
    getDisplayName,
    findSlackUsersByName,
    INVALID_SLACK_USER,
    MENTION_REQUIRED_MESSAGE
};
