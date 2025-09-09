const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

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
                // Prefer slackMemberId over slackName for backward compatibility
                data.player_map[sleeperId] = item.slackMemberId || item.slackName;
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
            for (const [sleeperId, slackMemberIdOrName] of Object.entries(data.player_map)) {
                const putCommand = new PutCommand({
                    TableName: TABLE_NAME,
                    Item: {
                        PK: 'PLAYER',
                        SK: `SLEEPER#${sleeperId}`,
                        sleeperId: sleeperId,
                        slackMemberId: slackMemberIdOrName,
                        // Note: This is for backward compatibility. New registrations should use savePlayer()
                        slackName: slackMemberIdOrName
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
 * @returns {Promise<object|null>} The player data with slackMemberId and slackName, or null if not found.
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
        if (response.Item) {
            return {
                slackMemberId: response.Item.slackMemberId,
                slackName: response.Item.slackName
            };
        }
        return null;
    } catch (error) {
        console.error("Error getting player from DynamoDB:", error);
        throw error;
    }
}

/**
 * Saves a single player mapping.
 * @param {string} sleeperId The sleeper ID.
 * @param {string} slackMemberId The slack member ID.
 * @param {string} slackName The slack username (optional, can be resolved later).
 * @returns {Promise<void>}
 */
async function savePlayer(sleeperId, slackMemberId, slackName = null) {
    try {
        const command = new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                PK: 'PLAYER',
                SK: `SLEEPER#${sleeperId}`,
                sleeperId: sleeperId,
                slackMemberId: slackMemberId,
                slackName: slackName || slackMemberId // Use member ID as fallback
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

/**
 * Updates a player's slack name while keeping the member ID.
 * @param {string} sleeperId The sleeper ID.
 * @param {string} slackName The updated slack username.
 * @returns {Promise<void>}
 */
async function updatePlayerSlackName(sleeperId, slackName) {
    try {
        // First get the existing player data
        const existingPlayer = await getPlayer(sleeperId);
        if (!existingPlayer) {
            throw new Error(`Player with sleeper ID ${sleeperId} not found`);
        }

        const command = new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                PK: 'PLAYER',
                SK: `SLEEPER#${sleeperId}`,
                sleeperId: sleeperId,
                slackMemberId: existingPlayer.slackMemberId,
                slackName: slackName
            }
        });
        
        await docClient.send(command);
    } catch (error) {
        console.error("Error updating player slack name in DynamoDB:", error);
        throw error;
    }
}

/**
 * Gets all players and resolves their slack names from member IDs.
 * This function can be used to bulk update slack names using the Slack API.
 * @returns {Promise<Array>} Array of player objects with sleeperId, slackMemberId, and slackName.
 */
async function getAllPlayers() {
    try {
        const command = new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk',
            ExpressionAttributeValues: {
                ':pk': 'PLAYER'
            }
        });
        
        const response = await docClient.send(command);
        return response.Items.map(item => ({
            sleeperId: item.sleeperId,
            slackMemberId: item.slackMemberId,
            slackName: item.slackName
        }));
    } catch (error) {
        console.error("Error getting all players from DynamoDB:", error);
        throw error;
    }
}

/**
 * Save a league registration to DynamoDB.
 * @param {string} leagueId The Sleeper league ID.
 * @param {string} channelId The Slack channel ID.
 * @param {object} leagueData Additional league data from Sleeper API.
 * @returns {Promise<void>}
 * @throws {Error} if the league cannot be saved.
 */
async function saveLeague(leagueId, channelId, leagueData) {
    try {
        const putCommand = new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                PK: 'LEAGUE',
                SK: `LEAGUE#${leagueId}`,
                leagueId: leagueId,
                slackChannelId: channelId,
                leagueName: leagueData.name,
                season: leagueData.season,
                sport: leagueData.sport,
                totalRosters: leagueData.total_rosters,
                status: leagueData.status,
                registeredAt: new Date().toISOString()
            }
        });
        
        await docClient.send(putCommand);
    } catch (error) {
        console.error("Error saving league to DynamoDB:", error);
        throw error;
    }
}

/**
 * Get a league by league ID from DynamoDB.
 * @param {string} leagueId The Sleeper league ID.
 * @returns {Promise<object|null>} The league object or null if not found.
 * @throws {Error} if the league cannot be retrieved.
 */
async function getLeague(leagueId) {
    try {
        const getCommand = new GetCommand({
            TableName: TABLE_NAME,
            Key: {
                PK: 'LEAGUE',
                SK: `LEAGUE#${leagueId}`
            }
        });
        
        const response = await docClient.send(getCommand);
        return response.Item || null;
    } catch (error) {
        console.error("Error getting league from DynamoDB:", error);
        throw error;
    }
}

/**
 * Get leagues by channel ID from DynamoDB.
 * @param {string} channelId The Slack channel ID.
 * @returns {Promise<object[]>} Array of league objects registered to the channel.
 * @throws {Error} if the leagues cannot be retrieved.
 */
async function getLeaguesByChannel(channelId) {
    try {
        const scanCommand = new ScanCommand({
            TableName: TABLE_NAME,
            FilterExpression: 'PK = :pk AND slackChannelId = :channelId',
            ExpressionAttributeValues: {
                ':pk': 'LEAGUE',
                ':channelId': channelId
            }
        });
        
        const response = await docClient.send(scanCommand);
        return response.Items || [];
    } catch (error) {
        console.error("Error getting leagues by channel from DynamoDB:", error);
        throw error;
    }
}

/**
 * Get all channels that have registered leagues, grouped by channel.
 * @returns {Promise<object[]>} Array of objects with channelId and leagues array.
 * @throws {Error} if the data cannot be retrieved.
 */
async function getAllChannelsWithLeagues() {
    try {
        const scanCommand = new ScanCommand({
            TableName: TABLE_NAME,
            FilterExpression: 'PK = :pk',
            ExpressionAttributeValues: {
                ':pk': 'LEAGUE'
            }
        });
        
        const response = await docClient.send(scanCommand);
        const leagues = response.Items || [];
        
        // Group leagues by channel ID
        const channelMap = new Map();
        
        leagues.forEach(league => {
            const channelId = league.slackChannelId;
            if (!channelMap.has(channelId)) {
                channelMap.set(channelId, []);
            }
            channelMap.get(channelId).push(league);
        });
        
        // Convert map to array format
        return Array.from(channelMap.entries()).map(([channelId, leagues]) => ({
            channelId,
            leagues
        }));
        
    } catch (error) {
        console.error("Error getting all channels with leagues from DynamoDB:", error);
        throw error;
    }
}

/**
 * Save NFL bye weeks data to DynamoDB cache.
 * @param {number} season The NFL season year (e.g., 2025).
 * @param {object} byeWeeks Object mapping team abbreviations to bye week numbers.
 * @returns {Promise<void>}
 * @throws {Error} if the bye weeks cannot be saved.
 */
async function saveNflByeWeeks(season, byeWeeks) {
    try {
        const putCommand = new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                PK: 'NFL_CACHE',
                SK: `BYE_WEEKS#${season}`,
                season: season,
                byeWeeks: byeWeeks,
                cachedAt: new Date().toISOString(),
                // Cache expires after 1 year (season ends)
                expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
            }
        });
        
        await docClient.send(putCommand);
    } catch (error) {
        console.error("Error saving NFL bye weeks to DynamoDB:", error);
        throw error;
    }
}

/**
 * Get NFL bye weeks data from DynamoDB cache.
 * @param {number} season The NFL season year (e.g., 2025).
 * @returns {Promise<object|null>} The bye weeks object or null if not found/expired.
 * @throws {Error} if the bye weeks cannot be retrieved.
 */
async function getNflByeWeeks(season) {
    try {
        const getCommand = new GetCommand({
            TableName: TABLE_NAME,
            Key: {
                PK: 'NFL_CACHE',
                SK: `BYE_WEEKS#${season}`
            }
        });
        
        const response = await docClient.send(getCommand);
        if (!response.Item) {
            return null;
        }
        
        // Check if cache has expired
        const expiresAt = new Date(response.Item.expiresAt);
        if (expiresAt < new Date()) {
            return null;
        }
        
        return response.Item.byeWeeks;
    } catch (error) {
        console.error("Error getting NFL bye weeks from DynamoDB:", error);
        throw error;
    }
}

/**
 * Clean up old NFL players cache chunks.
 * @param {string} sport The sport (e.g., 'nfl').
 * @returns {Promise<void>}
 */
async function cleanupOldNflPlayersCache(sport = 'nfl') {
    try {
        console.log(`[DATASTORE] Cleaning up old cache entries for ${sport}`);
        
        // Query for all items with the players cache prefix
        const queryCommand = new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
                ':pk': 'NFL_CACHE',
                ':sk': `PLAYERS#${sport.toUpperCase()}`
            }
        });
        
        const response = await docClient.send(queryCommand);
        
        if (response.Items && response.Items.length > 0) {
            console.log(`[DATASTORE] Found ${response.Items.length} old cache items to delete`);
            
            // Delete all old cache items
            const deletePromises = response.Items.map(item => {
                const deleteCommand = new DeleteCommand({
                    TableName: TABLE_NAME,
                    Key: {
                        PK: item.PK,
                        SK: item.SK
                    }
                });
                return docClient.send(deleteCommand);
            });
            
            await Promise.all(deletePromises);
            console.log(`[DATASTORE] Cleaned up ${response.Items.length} old cache items`);
        }
    } catch (error) {
        console.error(`[DATASTORE] Error cleaning up old cache for ${sport}:`, error);
        // Don't throw here - cleanup failure shouldn't prevent caching
    }
}

/**
 * Save essential NFL players data to DynamoDB cache.
 * Now stores only essential player data in a single item to avoid chunking complexity.
 * @param {string} sport The sport (e.g., 'nfl').
 * @param {object} essentialPlayers Object containing essential players data (not full data).
 * @returns {Promise<void>}
 * @throws {Error} if the essential players data cannot be saved.
 */
async function saveNflPlayers(sport = 'nfl', essentialPlayers) {
    try {
        console.log(`[DATASTORE] Starting to save essential NFL players for ${sport}`);
        
        const playerCount = Object.keys(essentialPlayers).length;
        console.log(`[DATASTORE] Essential players to save: ${playerCount}`);
        
        // Calculate estimated size for logging
        const estimatedSize = JSON.stringify(essentialPlayers).length;
        console.log(`[DATASTORE] Estimated essential data size: ${Math.round(estimatedSize / 1024)}KB`);
        
        if (estimatedSize > 350 * 1024) { // 350KB threshold to stay well under 400KB limit
            console.warn(`[DATASTORE] Essential data size (${Math.round(estimatedSize / 1024)}KB) is close to DynamoDB item limit`);
        }
        
        // Clean up old cache entries first
        await cleanupOldNflPlayersCache(sport);
        
        // Save essential data in a single item
        const putCommand = new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                PK: 'NFL_CACHE',
                SK: `PLAYERS#${sport.toUpperCase()}#ESSENTIAL`,
                sport: sport,
                dataType: 'essential',
                playerCount: playerCount,
                players: essentialPlayers,
                cachedAt: new Date().toISOString(),
                // Cache expires after 24 hours (player data changes daily)
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            }
        });
        
        console.log(`[DATASTORE] Saving essential players data for ${sport}...`);
        const startTime = Date.now();
        await docClient.send(putCommand);
        const saveTime = Date.now() - startTime;
        
        console.log(`[DATASTORE] Successfully saved essential NFL players for ${sport} (${playerCount} players) in ${saveTime}ms`);
    } catch (error) {
        console.error(`[DATASTORE] Error saving essential NFL players for ${sport}:`, error);
        if (error.name === 'ValidationException' && error.message.includes('Item size')) {
            console.error(`[DATASTORE] Essential data too large for single DynamoDB item. Consider further reducing data.`);
        }
        throw error;
    }
}

/**
 * Get essential NFL players data from DynamoDB cache.
 * Now handles simplified single-item storage instead of chunks.
 * @param {string} sport The sport (e.g., 'nfl').
 * @returns {Promise<object|null>} The essential players object or null if not found/expired.
 * @throws {Error} if the players data cannot be retrieved.
 */
async function getNflPlayers(sport = 'nfl') {
    try {
        console.log(`[DATASTORE] Getting essential NFL players for ${sport} from cache`);
        
        // Get the essential players data
        const command = new GetCommand({
            TableName: TABLE_NAME,
            Key: {
                PK: 'NFL_CACHE',
                SK: `PLAYERS#${sport.toUpperCase()}#ESSENTIAL`
            }
        });
        
        const response = await docClient.send(command);
        if (!response.Item) {
            console.log(`[DATASTORE] No essential players cache found for ${sport}`);
            return null;
        }
        
        // Check if cache has expired
        const expiresAt = new Date(response.Item.expiresAt);
        if (expiresAt < new Date()) {
            console.log(`[DATASTORE] Cache expired for ${sport} essential players`);
            return null;
        }
        
        const { players, playerCount, cachedAt } = response.Item;
        console.log(`[DATASTORE] Successfully loaded ${playerCount} essential players (cached ${cachedAt})`);
        
        return players;
    } catch (error) {
        console.error("[DATASTORE] Error getting essential NFL players from DynamoDB:", error);
        console.error("[DATASTORE] Error stack:", error.stack);
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
    updatePlayerSlackName,
    getAllPlayers,
    saveLeague,
    getLeague,
    getLeaguesByChannel,
    getAllChannelsWithLeagues,
    saveNflByeWeeks,
    getNflByeWeeks,
    saveNflPlayers,
    getNflPlayers
};