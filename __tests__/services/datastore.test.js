// Mock AWS SDK before importing the module
const mockSend = jest.fn();
const mockDynamoDBClient = jest.fn();
const mockDynamoDBDocumentClient = {
    send: mockSend
};

jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn(() => mockDynamoDBClient),
    GetCommand: jest.fn(),
    PutCommand: jest.fn(),
    QueryCommand: jest.fn(),
    ScanCommand: jest.fn(),
    CreateTableCommand: jest.fn(),
    DescribeTableCommand: jest.fn()
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: {
        from: jest.fn(() => mockDynamoDBDocumentClient)
    },
    GetCommand: jest.fn(),
    PutCommand: jest.fn(),
    QueryCommand: jest.fn(),
    ScanCommand: jest.fn()
}));

const { 
    getData, 
    saveData, 
    getPlayer, 
    savePlayer, 
    getDraft, 
    saveDraft 
} = require('../../services/datastore.js');

describe('DynamoDB Datastore Service', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        // Set environment variables for testing
        process.env.DYNAMODB_TABLE_NAME = 'UKFFBot-Test';
        process.env.AWS_REGION = 'us-east-1';
    });

    describe('getData', () => {
        it('should scan DynamoDB and return data in the original format', async () => {
            const mockItems = [
                {
                    PK: 'PLAYER',
                    SK: 'SLEEPER#12345',
                    slackName: 'TestUser'
                },
                {
                    PK: 'DRAFT',
                    SK: 'DRAFT#67890',
                    slackChannelId: 'C123456',
                    lastKnownPickCount: 10
                }
            ];

            mockSend.mockResolvedValue({ Items: mockItems });

            const result = await getData();

            expect(result).toEqual({
                player_map: {
                    '12345': 'TestUser'
                },
                drafts: {
                    '67890': {
                        slack_channel_id: 'C123456',
                        last_known_pick_count: 10
                    }
                }
            });
        });

        it('should handle empty DynamoDB response', async () => {
            mockSend.mockResolvedValue({ Items: [] });

            const result = await getData();

            expect(result).toEqual({
                player_map: {},
                drafts: {}
            });
        });

        it('should throw error when DynamoDB scan fails', async () => {
            const error = new Error('DynamoDB error');
            mockSend.mockRejectedValue(error);

            await expect(getData()).rejects.toThrow('DynamoDB error');
        });
    });

    describe('saveData', () => {
        it('should save player_map and drafts to DynamoDB', async () => {
            const testData = {
                player_map: {
                    '12345': 'TestUser',
                    '67890': 'AnotherUser'
                },
                drafts: {
                    '111': {
                        slack_channel_id: 'C123',
                        last_known_pick_count: 5
                    },
                    '222': {
                        slack_channel_id: 'C456',
                        last_known_pick_count: 15
                    }
                }
            };

            mockSend.mockResolvedValue({});

            await saveData(testData);

            // Should call PutCommand for each player and draft (4 total)
            expect(mockSend).toHaveBeenCalledTimes(4);
        });

        it('should handle partial data objects', async () => {
            const testData = {
                player_map: {
                    '12345': 'TestUser'
                }
                // drafts is undefined
            };

            mockSend.mockResolvedValue({});

            await saveData(testData);

            // Should only call PutCommand for the player
            expect(mockSend).toHaveBeenCalledTimes(1);
        });
    });

    describe('getPlayer', () => {
        it('should return player slack name when found', async () => {
            mockSend.mockResolvedValue({
                Item: {
                    PK: 'PLAYER',
                    SK: 'SLEEPER#12345',
                    slackName: 'TestUser'
                }
            });

            const result = await getPlayer('12345');

            expect(result).toBe('TestUser');
        });

        it('should return null when player not found', async () => {
            mockSend.mockResolvedValue({}); // No Item property

            const result = await getPlayer('99999');

            expect(result).toBeNull();
        });
    });

    describe('savePlayer', () => {
        it('should save a single player to DynamoDB', async () => {
            mockSend.mockResolvedValue({});

            await savePlayer('12345', 'TestUser');

            expect(mockSend).toHaveBeenCalledTimes(1);
        });
    });

    describe('getDraft', () => {
        it('should return draft data when found', async () => {
            mockSend.mockResolvedValue({
                Item: {
                    PK: 'DRAFT',
                    SK: 'DRAFT#67890',
                    slackChannelId: 'C123456',
                    lastKnownPickCount: 10
                }
            });

            const result = await getDraft('67890');

            expect(result).toEqual({
                slack_channel_id: 'C123456',
                last_known_pick_count: 10
            });
        });

        it('should return null when draft not found', async () => {
            mockSend.mockResolvedValue({}); // No Item property

            const result = await getDraft('99999');

            expect(result).toBeNull();
        });
    });

    describe('saveDraft', () => {
        it('should save a single draft to DynamoDB with default pick count', async () => {
            mockSend.mockResolvedValue({});

            await saveDraft('67890', 'C123456');

            expect(mockSend).toHaveBeenCalledTimes(1);
        });

        it('should save a single draft to DynamoDB with specified pick count', async () => {
            mockSend.mockResolvedValue({});

            await saveDraft('67890', 'C123456', 25);

            expect(mockSend).toHaveBeenCalledTimes(1);
        });
    });
});
