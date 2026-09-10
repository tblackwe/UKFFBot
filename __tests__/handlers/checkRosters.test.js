const { handleCheckRostersCommand, handleCheckLeagueRostersCommand } = require('../../handlers/checkRosters');
const { getLeaguesByChannel } = require('../../services/datastore');
const { analyzeLeagueRosters } = require('../../services/rosterAnalyzer');
const { ERROR_MESSAGES } = require('../../shared/messages');

jest.mock('../../services/datastore');
jest.mock('../../services/rosterAnalyzer');

describe('checkRosters handler', () => {
    let mockSay;

    beforeEach(() => {
        mockSay = jest.fn();
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('should handle no registered leagues', async () => {
        getLeaguesByChannel.mockResolvedValue([]);

        const command = {
            channel_id: 'C1234567890',
            ts: '1234567890.123456'
        };

        await handleCheckRostersCommand({ command, say: mockSay });

        expect(mockSay).toHaveBeenCalledWith({
            text: '📭 No leagues are registered to this channel. Use @UKFFBot register league [league_id] first to register a Sleeper league.',
            blocks: expect.arrayContaining([
                expect.objectContaining({
                    type: "section",
                    text: expect.objectContaining({
                        text: expect.stringContaining('📭 *No leagues are registered to this channel.*')
                    })
                })
            ]),
            thread_ts: '1234567890.123456'
        });
    });

    test('should analyze registered leagues', async () => {
        const mockLeagues = [{
            leagueId: '123456789',
            leagueName: 'Test League',
            season: '2025'
        }];

        const mockAnalysis = {
            currentWeek: 5,
            totalRosters: 12,
            rostersWithIssues: 0,
            rosterAnalysis: []
        };

        getLeaguesByChannel.mockResolvedValue(mockLeagues);
        analyzeLeagueRosters.mockResolvedValue(mockAnalysis);

        const command = {
            channel_id: 'C1234567890',
            ts: '1234567890.123456'
        };

        await handleCheckRostersCommand({ command, say: mockSay });

        expect(getLeaguesByChannel).toHaveBeenCalledWith('C1234567890');
        expect(analyzeLeagueRosters).toHaveBeenCalledWith('123456789');
        
        // Check for the initial "Analyzing rosters" message
        expect(mockSay).toHaveBeenCalledWith({
            text: '🔍 Analyzing rosters for issues... This may take a moment.',
            blocks: expect.arrayContaining([
                expect.objectContaining({
                    type: "section",
                    text: expect.objectContaining({
                        text: expect.stringContaining('🔍 *Analyzing rosters for issues...*')
                    })
                })
            ]),
            thread_ts: '1234567890.123456'
        });
        
        // Check that it calls say multiple times (initial message, analysis result, footer)
        expect(mockSay).toHaveBeenCalledTimes(3);
    });

    test('should handle analysis errors gracefully', async () => {
        const mockLeagues = [{
            leagueId: '123456789',
            leagueName: 'Test League',
            season: '2025'
        }];

        getLeaguesByChannel.mockResolvedValue(mockLeagues);
        analyzeLeagueRosters.mockRejectedValue(new Error('API Error'));

        const command = {
            channel_id: 'C1234567890',
            ts: '1234567890.123456'
        };

        await handleCheckRostersCommand({ command, say: mockSay });

        // Should call say multiple times: initial message, error message, footer
        expect(mockSay).toHaveBeenCalledTimes(3);
        
        // Check for error message in one of the calls
        expect(mockSay).toHaveBeenCalledWith({
            text: '❌ Failed to analyze league "Test League": API Error',
            blocks: expect.arrayContaining([
                expect.objectContaining({
                    type: "section",
                    text: expect.objectContaining({
                        text: expect.stringContaining('❌ *Failed to analyze league "Test League"*')
                    })
                })
            ]),
            thread_ts: '1234567890.123456'
        });
    });

    test('should notify the user when loading leagues fails', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        getLeaguesByChannel.mockRejectedValue(new Error('DynamoDB down'));

        const command = {
            channel_id: 'C1234567890',
            ts: '1234567890.123456'
        };

        await handleCheckRostersCommand({ command, say: mockSay });

        expect(mockSay).toHaveBeenCalledWith({
            text: ERROR_MESSAGES.CONFIGURATION_ERROR,
            thread_ts: '1234567890.123456'
        });
    });

    test('should notify the user when a specific league check fails for a non-404 error', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        analyzeLeagueRosters.mockRejectedValue(new Error('timeout'));

        const command = {
            text: '123456789',
            channel_id: 'C1234567890',
            ts: '1234567890.123456'
        };

        await handleCheckLeagueRostersCommand({ command, say: mockSay });

        expect(mockSay).toHaveBeenCalledWith({
            text: ERROR_MESSAGES.CONFIGURATION_ERROR,
            thread_ts: '1234567890.123456'
        });
    });
});
