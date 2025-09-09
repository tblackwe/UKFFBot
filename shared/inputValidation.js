/**
 * Utility functions for parsing and handling Slack user input
 */

/**
 * Parses Slack user input to extract member ID and determine format
 * @param {string} input - The user input (mention, member ID, or username)
 * @returns {object} - Object with memberId, isValidMemberId, and originalInput
 */
function parseSlackUserInput(input) {
    // Check if it's a Slack mention format <@U1234567890> or <@U1234567890|username>
    const mentionMatch = input.match(/^<@(U[A-Z0-9]+)(?:\|.*)?>/);
    if (mentionMatch) {
        return {
            memberId: mentionMatch[1],
            isValidMemberId: true,
            originalInput: input
        };
    }
    
    // Check if it's a direct member ID format (starts with 'U' and is 11 characters)
    if (input.startsWith('U') && input.length === 11) {
        return {
            memberId: input,
            isValidMemberId: true,
            originalInput: input
        };
    }
    
    // If it's not a member ID format, treat it as a username
    return {
        memberId: input,
        isValidMemberId: false,
        originalInput: input
    };
}

/**
 * Validates command arguments and provides user-friendly error messages
 * @param {Array} args - Command arguments array
 * @param {number} expectedCount - Expected number of arguments
 * @param {string} usageExample - Usage example to show in error
 * @returns {object} - Object with isValid boolean and errorMessage string
 */
function validateCommandArgs(args, expectedCount, usageExample) {
    if (args.length < expectedCount) {
        return {
            isValid: false,
            errorMessage: `Please provide all required arguments. Usage: ${usageExample}`
        };
    }
    
    return { isValid: true };
}

/**
 * Extracts and validates draft ID from command text
 * @param {string} text - Command text
 * @returns {object} - Object with isValid, draftId, and errorMessage
 */
function parseDraftId(text) {
    const draftId = text.trim();
    
    if (!draftId) {
        return {
            isValid: false,
            errorMessage: 'Please provide a Sleeper Draft ID. Usage: `@YourBotName register draft [draft_id]`'
        };
    }
    
    // Basic validation - Sleeper draft IDs are typically numeric
    if (!/^[0-9]+$/.test(draftId)) {
        return {
            isValid: false,
            errorMessage: 'Draft ID should be numeric. Please check the ID and try again.'
        };
    }
    
    return {
        isValid: true,
        draftId: draftId
    };
}

/**
 * Extracts and validates league ID from command text
 * @param {string} text - Command text
 * @returns {object} - Object with isValid, leagueId, and errorMessage
 */
function parseLeagueId(text) {
    const leagueId = text.trim();
    
    if (!leagueId) {
        return {
            isValid: false,
            errorMessage: 'Please provide a Sleeper League ID. Usage: `@YourBotName register league [league_id]`'
        };
    }
    
    // Basic validation - Sleeper league IDs are typically numeric
    if (!/^[0-9]+$/.test(leagueId)) {
        return {
            isValid: false,
            errorMessage: 'League ID should be numeric. Please check the ID and try again.'
        };
    }
    
    return {
        isValid: true,
        leagueId: leagueId
    };
}

module.exports = {
    parseSlackUserInput,
    validateCommandArgs,
    parseDraftId,
    parseLeagueId
};
