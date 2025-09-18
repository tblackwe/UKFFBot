const { handleRegisterLeagueCommand } = require('../../handlers/registerLeague');
const { getLeague } = require('../../services/sleeper');
const { saveLeague, getLeaguesByChannel } = require('../../services/datastore');

// Mock the dependencies
jest.mock('../../services/sleeper');
jest.mock('../../services/datastore');
jest.mock('../../shared/messages');

describe('registerLeague handler', () => {
    let mockSay;

    beforeEach(() => {
        mockSay = jest.fn();
        jest.clearAllMocks();
    });

    test('should register a valid league successfully', async () => {
        // Setup mocks
        const mockLeagueData = {
            league_id: '123456789',
            name: 'Test League',
            season: '2025',
            sport: 'nfl',
            total_rosters: 12,
            status: 'in_season'
        };

        getLeaguesByChannel.mockResolvedValue([]);
        getLeague.mockResolvedValue(mockLeagueData);
        saveLeague.mockResolvedValue();

        const command = {
            text: ' 123456789 ',
            channel_id: 'C1234567890',
            ts: '1234567890.123456'
        };

        // Execute
        await handleRegisterLeagueCommand({ command, say: mockSay });

        // Verify
        expect(getLeaguesByChannel).toHaveBeenCalledWith('C1234567890');
        expect(getLeague).toHaveBeenCalledWith('123456789');
        expect(saveLeague).toHaveBeenCalledWith('123456789', 'C1234567890', mockLeagueData);
        expect(mockSay).toHaveBeenCalledWith({
            text: expect.stringContaining('Successfully registered league'),
            blocks: expect.arrayContaining([
                expect.objectContaining({
                    type: "section",
                    text: expect.objectContaining({
                        text: expect.stringContaining('✅ *League Successfully Registered!*')
                    })
                })
            ]),
            thread_ts: '1234567890.123456'
        });
    });

    test('should reject invalid league ID', async () => {
        const command = {
            text: ' invalid_id ',
            channel_id: 'C1234567890',
            ts: '1234567890.123456'
        };

        await handleRegisterLeagueCommand({ command, say: mockSay });

        expect(mockSay).toHaveBeenCalledWith({
            text: 'League ID should be numeric. Please check the ID and try again.',
            blocks: expect.arrayContaining([
                expect.objectContaining({
                    type: "section",
                    text: expect.objectContaining({
                        text: expect.stringContaining('❌ *Invalid League ID*')
                    })
                })
            ]),
            thread_ts: '1234567890.123456'
        });
        expect(getLeague).not.toHaveBeenCalled();
    });

    test('should handle league not found', async () => {
        getLeaguesByChannel.mockResolvedValue([]);
        getLeague.mockResolvedValue(null);

        const command = {
            text: ' 999999999 ',
            channel_id: 'C1234567890',
            ts: '1234567890.123456'
        };

        await handleRegisterLeagueCommand({ command, say: mockSay });

        expect(mockSay).toHaveBeenCalledWith({
            text: 'League with ID "999999999" not found.',
            blocks: expect.arrayContaining([
                expect.objectContaining({
                    type: "section",
                    text: expect.objectContaining({
                        text: expect.stringContaining('❌ *League Not Found*')
                    })
                })
            ]),
            thread_ts: '1234567890.123456'
        });
        expect(saveLeague).not.toHaveBeenCalled();
    });

    test('should prevent duplicate league registration', async () => {
        const existingLeague = {
            leagueId: '123456789',
            leagueName: 'Existing League'
        };

        getLeaguesByChannel.mockResolvedValue([existingLeague]);

        const command = {
            text: ' 123456789 ',
            channel_id: 'C1234567890',
            ts: '1234567890.123456'
        };

        await handleRegisterLeagueCommand({ command, say: mockSay });

        expect(mockSay).toHaveBeenCalledWith({
            text: 'League "Existing League" is already registered to this channel.',
            blocks: expect.arrayContaining([
                expect.objectContaining({
                    type: "section",
                    text: expect.objectContaining({
                        text: expect.stringContaining('⚠️ *League Already Registered*')
                    })
                })
            ]),
            thread_ts: '1234567890.123456'
        });
        expect(getLeague).not.toHaveBeenCalled();
        expect(saveLeague).not.toHaveBeenCalled();
    });
});
