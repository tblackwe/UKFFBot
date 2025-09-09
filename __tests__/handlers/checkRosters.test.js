const { handleCheckRostersCommand } = require('../../handlers/checkRosters');
const { getLeaguesByChannel } = require('../../services/datastore');
const { analyzeLeagueRosters } = require('../../services/rosterAnalyzer');

// Mock the dependencies
jest.mock('../../services/datastore');
jest.mock('../../services/rosterAnalyzer');
jest.mock('../../shared/messages');

describe('checkRosters handler', () => {
    let mockSay;

    beforeEach(() => {
        mockSay = jest.fn();
        jest.clearAllMocks();
    });

    test('should handle no registered leagues', async () => {
        getLeaguesByChannel.mockResolvedValue([]);

        const command = {
            channel_id: 'C1234567890',
            ts: '1234567890.123456'
        };

        await handleCheckRostersCommand({ command, say: mockSay });

        expect(mockSay).toHaveBeenCalledWith({
            text: expect.stringContaining('No leagues are registered to this channel'),
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
        expect(mockSay).toHaveBeenCalledWith({
            text: expect.stringContaining('Analyzing rosters'),
            thread_ts: '1234567890.123456'
        });
        expect(mockSay).toHaveBeenCalledWith({
            text: expect.stringContaining('Test League'),
            thread_ts: '1234567890.123456'
        });
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

        expect(mockSay).toHaveBeenCalledWith({
            text: expect.stringContaining('Failed to analyze league'),
            thread_ts: '1234567890.123456'
        });
    });
});
