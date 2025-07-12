const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

// Initialize DynamoDB client
const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1'
});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'UKFFBot';

/**
 * Reads and returns all data in the same format as the original JSON file.
 * @returns {Promise<object>} The data object with player_map and drafts.
 * @throws {Error} if the data cannot be retrieved.
 */
async function getData() {
    try {
        // Scan the table to get all items
        const command = new ScanCommand({
            TableName: TABLE_NAME
        });
        
        const response = await docClient.send(command);
        
        // Transform DynamoDB items back to the original format
        const data = {
            player_map: {},
            drafts: {}
        };
        
        response.Items.forEach(item => {
            if (item.PK === 'PLAYER' && item.SK.startsWith('SLEEPER#')) {
                // Extract sleeper ID from SK
                const sleeperId = item.SK.replace('SLEEPER#', '');
                data.player_map[sleeperId] = item.slackMemberId ?? item.slackName;
            } else if (item.PK === 'DRAFT' && item.SK.startsWith('DRAFT#')) {
                // Extract draft ID from SK
                const draftId = item.SK.replace('DRAFT#', '');
                data.drafts[draftId] = {
                    slack_channel_id: item.slackChannelId,
                    last_known_pick_count: item.lastKnownPickCount
                };
            }
        });
        
        return data;
    } catch (error) {
        console.error("Error reading data from DynamoDB:", error);
        throw error;
    }
}

/**
 * Writes the given data object to DynamoDB.
 * @param {object} data The data object to save.
 * @returns {Promise<void>}
 * @throws {Error} if the data cannot be written.
 */
async function saveData(data) {
    try {
        // Convert player_map to DynamoDB items
        if (data.player_map) {
            for (const [sleeperId, slackName] of Object.entries(data.player_map)) {
                const putCommand = new PutCommand({
                    TableName: TABLE_NAME,
                    Item: {
                        PK: 'PLAYER',
                        SK: `SLEEPER#${sleeperId}`,
                        sleeperId: sleeperId,
                        slackName: slackName
                    }
                });
                await docClient.send(putCommand);
            }
        }
        
        // Convert drafts to DynamoDB items
        if (data.drafts) {
            for (const [draftId, draftData] of Object.entries(data.drafts)) {
                const putCommand = new PutCommand({
                    TableName: TABLE_NAME,
                    Item: {
                        PK: 'DRAFT',
                        SK: `DRAFT#${draftId}`,
                        draftId: draftId,
                        slackChannelId: draftData.slack_channel_id,
                        lastKnownPickCount: draftData.last_known_pick_count
                    }
                });
                await docClient.send(putCommand);
            }
        }
    } catch (error) {
        console.error("Error writing data to DynamoDB:", error);
        throw error;
    }
}

/**
 * Gets a specific player by sleeper ID.
 * @param {string} sleeperId The sleeper ID to look up.
 * @returns {Promise<string|null>} The slack name or null if not found.
 */
async function getPlayer(sleeperId) {
    try {
        const command = new GetCommand({
            TableName: TABLE_NAME,
            Key: {
                PK: 'PLAYER',
                SK: `SLEEPER#${sleeperId}`
            }
        });
        
        const response = await docClient.send(command);
        return response.Item ? response.Item.slackName : null;
    } catch (error) {
        console.error("Error getting player from DynamoDB:", error);
        throw error;
    }
}

/**
 * Saves a single player mapping.
 * @param {string} sleeperId The sleeper ID.
 * @param {string} slackName The slack username.
 * @returns {Promise<void>}
 */
async function savePlayer(sleeperId, slackName) {
    try {
        const command = new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                PK: 'PLAYER',
                SK: `SLEEPER#${sleeperId}`,
                sleeperId: sleeperId,
                slackName: slackName
            }
        });
        
        await docClient.send(command);
    } catch (error) {
        console.error("Error saving player to DynamoDB:", error);
        throw error;
    }
}

/**
 * Gets a specific draft by draft ID.
 * @param {string} draftId The draft ID to look up.
 * @returns {Promise<object|null>} The draft data or null if not found.
 */
async function getDraft(draftId) {
    try {
        const command = new GetCommand({
            TableName: TABLE_NAME,
            Key: {
                PK: 'DRAFT',
                SK: `DRAFT#${draftId}`
            }
        });
        
        const response = await docClient.send(command);
        if (response.Item) {
            return {
                slack_channel_id: response.Item.slackChannelId,
                last_known_pick_count: response.Item.lastKnownPickCount
            };
        }
        return null;
    } catch (error) {
        console.error("Error getting draft from DynamoDB:", error);
        throw error;
    }
}

/**
 * Saves a single draft.
 * @param {string} draftId The draft ID.
 * @param {string} slackChannelId The slack channel ID.
 * @param {number} lastKnownPickCount The last known pick count.
 * @returns {Promise<void>}
 */
async function saveDraft(draftId, slackChannelId, lastKnownPickCount = 0) {
    try {
        const command = new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                PK: 'DRAFT',
                SK: `DRAFT#${draftId}`,
                draftId: draftId,
                slackChannelId: slackChannelId,
                lastKnownPickCount: lastKnownPickCount
            }
        });
        
        await docClient.send(command);
    } catch (error) {
        console.error("Error saving draft to DynamoDB:", error);
        throw error;
    }
}

/**
 * Gets all drafts for a specific slack channel.
 * @param {string} slackChannelId The slack channel ID.
 * @returns {Promise<Array>} Array of draft objects with draft IDs.
 */
async function getDraftsByChannel(slackChannelId) {
    try {
        const command = new QueryCommand({
            TableName: TABLE_NAME,
            IndexName: 'SlackChannelIndex', // This would need to be created as a GSI
            KeyConditionExpression: 'slackChannelId = :channelId',
            ExpressionAttributeValues: {
                ':channelId': slackChannelId
            }
        });
        
        const response = await docClient.send(command);
        return response.Items.map(item => ({
            draftId: item.draftId,
            slack_channel_id: item.slackChannelId,
            last_known_pick_count: item.lastKnownPickCount
        }));
    } catch (error) {
        // If GSI doesn't exist, fall back to scan (less efficient)
        console.warn("GSI not available, falling back to scan:", error.message);
        return await getDraftsByChannelScan(slackChannelId);
    }
}

/**
 * Fallback method to get drafts by channel using scan.
 * @param {string} slackChannelId The slack channel ID.
 * @returns {Promise<Array>} Array of draft objects with draft IDs.
 */
async function getDraftsByChannelScan(slackChannelId) {
    try {
        const command = new ScanCommand({
            TableName: TABLE_NAME,
            FilterExpression: 'PK = :pk AND slackChannelId = :channelId',
            ExpressionAttributeValues: {
                ':pk': 'DRAFT',
                ':channelId': slackChannelId
            }
        });
        
        const response = await docClient.send(command);
        return response.Items.map(item => ({
            draftId: item.draftId,
            slack_channel_id: item.slackChannelId,
            last_known_pick_count: item.lastKnownPickCount
        }));
    } catch (error) {
        console.error("Error getting drafts by channel from DynamoDB:", error);
        throw error;
    }
}

module.exports = {
    getData,
    saveData,
    getPlayer,
    savePlayer,
    getDraft,
    saveDraft,
    getDraftsByChannel,
};