const { getData } = require('../services/datastore.js');
const { handleCommandError, SUCCESS_MESSAGES, ERROR_MESSAGES } = require('../shared/messages.js');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

// Initialize DynamoDB client for direct deletion
const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1'
});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'UKFFBot';

/**
 * Handles the logic for the `unregisterdraft` command.
 * It finds and removes a draft registration associated with the current channel.
 * @param {object} payload The payload from the Slack command.
 * @param {object} payload.command The command object.
 * @param {function} payload.say The function to send a message.
 */
const handleUnregisterDraftCommand = async ({ command, say }) => {
    const channelId = command.channel_id;

    try {
        const data = await getData();

        const draftIdToRemove = Object.keys(data.drafts || {}).find(
            id => data.drafts[id].slack_channel_id === channelId
        );

        if (draftIdToRemove) {
            // Delete the draft directly from DynamoDB
            const deleteCommand = new DeleteCommand({
                TableName: TABLE_NAME,
                Key: {
                    PK: 'DRAFT',
                    SK: `DRAFT#${draftIdToRemove}`
                }
            });
            await docClient.send(deleteCommand);
            
            await say(SUCCESS_MESSAGES.DRAFT_UNREGISTERED(draftIdToRemove));
        } else {
            await say(ERROR_MESSAGES.NO_DRAFT_REGISTERED_SIMPLE);
        }
    } catch (error) {
        await handleCommandError('unregisterdraft', error, say);
    }
};

module.exports = { handleUnregisterDraftCommand };