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
    saveDraft,
    getDraftsByChannel,
    getLeaguesByChannel,
    updatePlayerSlackName,
    getAllPlayers,
    saveLeague,
    getLeague,
    getAllChannelsWithLeagues,
    saveNflByeWeeks,
    getNflByeWeeks,
    getNflSchedule,
    getNflPlayers
} = require('../../services/datastore.js');

const { QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

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
        it('should return player object when found', async () => {
            mockSend.mockResolvedValue({
                Item: {
                    PK: 'PLAYER',
                    SK: 'SLEEPER#12345',
                    slackMemberId: 'U123456',
                    slackName: 'TestUser'
                }
            });

            const result = await getPlayer('12345');

            expect(result).toEqual({
                slackMemberId: 'U123456',
                slackName: 'TestUser'
            });
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

    describe('getDraftsByChannel', () => {
        it('should query the SlackChannelIndex GSI scoped to DRAFT items', async () => {
            mockSend.mockResolvedValue({
                Items: [
                    { draftId: '67890', slackChannelId: 'C123456', lastKnownPickCount: 10 }
                ]
            });

            const result = await getDraftsByChannel('C123456');

            expect(QueryCommand).toHaveBeenCalledWith(expect.objectContaining({
                IndexName: 'SlackChannelIndex',
                KeyConditionExpression: 'slackChannelId = :channelId AND PK = :pk',
                ExpressionAttributeValues: { ':channelId': 'C123456', ':pk': 'DRAFT' }
            }));
            expect(result).toEqual([
                { draftId: '67890', slack_channel_id: 'C123456', last_known_pick_count: 10 }
            ]);
        });

        it('should fall back to a scan when the GSI is unavailable', async () => {
            mockSend
                .mockRejectedValueOnce(new Error('GSI not found'))
                .mockResolvedValueOnce({
                    Items: [
                        { draftId: '111', slackChannelId: 'C999', lastKnownPickCount: 3 }
                    ]
                });

            const result = await getDraftsByChannel('C999');

            expect(ScanCommand).toHaveBeenCalled();
            expect(result).toEqual([
                { draftId: '111', slack_channel_id: 'C999', last_known_pick_count: 3 }
            ]);
        });
    });

    describe('getLeaguesByChannel', () => {
        it('should query the SlackChannelIndex GSI scoped to LEAGUE items', async () => {
            const items = [{ PK: 'LEAGUE', leagueId: 'L1', slackChannelId: 'C123456' }];
            mockSend.mockResolvedValue({ Items: items });

            const result = await getLeaguesByChannel('C123456');

            expect(QueryCommand).toHaveBeenCalledWith(expect.objectContaining({
                IndexName: 'SlackChannelIndex',
                KeyConditionExpression: 'slackChannelId = :channelId AND PK = :pk',
                ExpressionAttributeValues: { ':channelId': 'C123456', ':pk': 'LEAGUE' }
            }));
            expect(result).toEqual(items);
        });

        it('should fall back to a scan when the GSI is unavailable', async () => {
            const items = [{ PK: 'LEAGUE', leagueId: 'L2', slackChannelId: 'C999' }];
            mockSend
                .mockRejectedValueOnce(new Error('GSI not found'))
                .mockResolvedValueOnce({ Items: items });

            const result = await getLeaguesByChannel('C999');

            expect(ScanCommand).toHaveBeenCalled();
            expect(result).toEqual(items);
        });
    });

    describe('updatePlayerSlackName', () => {
        it('updates an existing player', async () => {
            mockSend
                .mockResolvedValueOnce({ Item: { sleeperId: '123', slackMemberId: 'U1', slackName: 'Old' } }) // getPlayer
                .mockResolvedValueOnce({}); // put

            await updatePlayerSlackName('123', 'New');

            expect(mockSend).toHaveBeenCalledTimes(2);
        });

        it('throws when the player does not exist', async () => {
            mockSend.mockResolvedValueOnce({}); // getPlayer -> no Item

            await expect(updatePlayerSlackName('999', 'New')).rejects.toThrow(/not found/);
        });
    });

    describe('getAllPlayers', () => {
        it('queries the PLAYER partition and maps the results', async () => {
            mockSend.mockResolvedValue({
                Items: [{ sleeperId: '1', slackMemberId: 'U1', slackName: 'Alice' }]
            });

            const result = await getAllPlayers();

            expect(result).toEqual([{ sleeperId: '1', slackMemberId: 'U1', slackName: 'Alice' }]);
        });
    });

    describe('saveLeague / getLeague', () => {
        it('saves a league item', async () => {
            mockSend.mockResolvedValue({});

            await saveLeague('L1', 'C1', { name: 'Test', season: 2025, sport: 'nfl', total_rosters: 12, status: 'in_season' });

            expect(mockSend).toHaveBeenCalledTimes(1);
        });

        it('returns the league item when found, null otherwise', async () => {
            mockSend.mockResolvedValueOnce({ Item: { leagueId: 'L1', leagueName: 'Test' } });
            await expect(getLeague('L1')).resolves.toEqual({ leagueId: 'L1', leagueName: 'Test' });

            mockSend.mockResolvedValueOnce({});
            await expect(getLeague('missing')).resolves.toBeNull();
        });
    });

    describe('getAllChannelsWithLeagues', () => {
        it('groups leagues by channel id', async () => {
            mockSend.mockResolvedValue({
                Items: [
                    { leagueId: 'L1', slackChannelId: 'C1' },
                    { leagueId: 'L2', slackChannelId: 'C1' },
                    { leagueId: 'L3', slackChannelId: 'C2' }
                ]
            });

            const result = await getAllChannelsWithLeagues();

            expect(result).toHaveLength(2);
            const c1 = result.find((c) => c.channelId === 'C1');
            expect(c1.leagues).toHaveLength(2);
        });
    });

    describe('NFL cache expiry', () => {
        const future = new Date(Date.now() + 60_000).toISOString();
        const past = new Date(Date.now() - 60_000).toISOString();

        it('saveNflByeWeeks writes an item with a ttl', async () => {
            mockSend.mockResolvedValue({});
            await saveNflByeWeeks(2026, { KC: 5 });
            expect(mockSend).toHaveBeenCalledTimes(1);
        });

        it('getNflByeWeeks returns data when fresh', async () => {
            mockSend.mockResolvedValue({ Item: { byeWeeks: { KC: 5 }, expiresAt: future } });
            await expect(getNflByeWeeks(2026)).resolves.toEqual({ KC: 5 });
        });

        it('getNflByeWeeks returns null when expired', async () => {
            mockSend.mockResolvedValue({ Item: { byeWeeks: { KC: 5 }, expiresAt: past } });
            await expect(getNflByeWeeks(2026)).resolves.toBeNull();
        });

        it('getNflByeWeeks returns null when missing', async () => {
            mockSend.mockResolvedValue({});
            await expect(getNflByeWeeks(2026)).resolves.toBeNull();
        });

        it('getNflSchedule returns games when fresh and null when expired', async () => {
            mockSend.mockResolvedValueOnce({ Item: { season: 2026, week: 5, games: [{ home_team: 'KC' }], expiresAt: future } });
            await expect(getNflSchedule(2026, 5)).resolves.toMatchObject({ games: [{ home_team: 'KC' }] });

            mockSend.mockResolvedValueOnce({ Item: { expiresAt: past } });
            await expect(getNflSchedule(2026, 5)).resolves.toBeNull();
        });

        it('getNflPlayers returns players when fresh and null when expired', async () => {
            mockSend.mockResolvedValueOnce({ Item: { players: { p1: {} }, playerCount: 1, expiresAt: future } });
            await expect(getNflPlayers('nfl')).resolves.toEqual({ p1: {} });

            mockSend.mockResolvedValueOnce({ Item: { players: {}, expiresAt: past } });
            await expect(getNflPlayers('nfl')).resolves.toBeNull();
        });
    });
});
