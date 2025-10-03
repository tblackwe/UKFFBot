// Mock AWS SDK before importing the module
const mockSend = jest.fn();
const mockDynamoDBClient = jest.fn();
const mockDynamoDBDocumentClient = {
    send: mockSend
};

jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn(() => mockDynamoDBClient)
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: {
        from: jest.fn(() => mockDynamoDBDocumentClient)
    },
    ScanCommand: jest.fn()
}));

const { getAllChannelsWithLeagues } = require('../../services/datastore');

describe('getAllChannelsWithLeagues', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Set environment variables for testing
        process.env.DYNAMODB_TABLE_NAME = 'UKFFBot-Test';
        process.env.AWS_REGION = 'us-east-1';
    });

    test('should return channels grouped by league', async () => {
        // Mock DynamoDB response
        mockSend.mockResolvedValue({
            Items: [
                {
                    PK: 'LEAGUE',
                    SK: 'LEAGUE#123',
                    leagueId: '123',
                    leagueName: 'Test League 1',
                    slackChannelId: 'C1234567890',
                    season: '2025'
                },
                {
                    PK: 'LEAGUE',
                    SK: 'LEAGUE#456',
                    leagueId: '456',
                    leagueName: 'Test League 2',
                    slackChannelId: 'C1234567890',
                    season: '2025'
                },
                {
                    PK: 'LEAGUE',
                    SK: 'LEAGUE#789',
                    leagueId: '789',
                    leagueName: 'Test League 3',
                    slackChannelId: 'C0987654321',
                    season: '2025'
                }
            ]
        });

        const result = await getAllChannelsWithLeagues();

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            channelId: 'C1234567890',
            leagues: expect.arrayContaining([
                expect.objectContaining({ leagueId: '123' }),
                expect.objectContaining({ leagueId: '456' })
            ])
        });
        expect(result[1]).toEqual({
            channelId: 'C0987654321',
            leagues: expect.arrayContaining([
                expect.objectContaining({ leagueId: '789' })
            ])
        });
    });

    test('should return empty array when no leagues found', async () => {
        mockSend.mockResolvedValue({
            Items: []
        });

        const result = await getAllChannelsWithLeagues();

        expect(result).toEqual([]);
    });

    test('should handle DynamoDB errors', async () => {
        mockSend.mockRejectedValue(new Error('DynamoDB error'));

        await expect(getAllChannelsWithLeagues()).rejects.toThrow('DynamoDB error');
    });
});
