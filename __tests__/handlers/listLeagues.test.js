const { handleListLeaguesCommand } = require('../../handlers/listLeagues');
const { getLeaguesByChannel } = require('../../services/datastore');
const { ERROR_MESSAGES } = require('../../shared/messages');

jest.mock('../../services/datastore');

describe('listLeagues handler', () => {
    let mockSay;

    beforeEach(() => {
        mockSay = jest.fn();
        jest.clearAllMocks();
    });

    test('should list leagues registered to the channel', async () => {
        getLeaguesByChannel.mockResolvedValue([
            {
                leagueId: '123',
                leagueName: 'Test League',
                season: '2026',
                sport: 'nfl',
                totalRosters: 12,
                status: 'in_season'
            }
        ]);

        await handleListLeaguesCommand({
            command: { channel_id: 'C123', ts: '1.2' },
            say: mockSay
        });

        expect(getLeaguesByChannel).toHaveBeenCalledWith('C123');
        expect(mockSay).toHaveBeenCalledWith({
            text: expect.stringContaining('Test League'),
            thread_ts: '1.2'
        });
    });

    test('should notify the user when loading leagues fails', async () => {
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        getLeaguesByChannel.mockRejectedValue(new Error('DynamoDB down'));

        await handleListLeaguesCommand({
            command: { channel_id: 'C123', ts: '1.2' },
            say: mockSay
        });

        expect(mockSay).toHaveBeenCalledWith({
            text: ERROR_MESSAGES.CONFIGURATION_ERROR,
            thread_ts: '1.2'
        });
        errorSpy.mockRestore();
    });
});
