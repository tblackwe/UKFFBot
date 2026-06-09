// Verifies analyzeLeagueRosters degrades gracefully when non-essential upstream
// data fails to load, and still fails fast when rosters themselves are missing.
jest.mock('../../services/sleeper.js');
jest.mock('../../services/nflDataCache.js');

const sleeper = require('../../services/sleeper.js');
const cache = require('../../services/nflDataCache.js');
const { analyzeLeagueRosters } = require('../../services/rosterAnalyzer.js');

describe('analyzeLeagueRosters graceful degradation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});

        sleeper.getLeague.mockResolvedValue({
            league_id: 'L1', name: 'Test League', season: 2025, roster_positions: ['QB', 'RB']
        });
        sleeper.getNflState.mockResolvedValue({ season: '2025', week: 5, display_week: 5 });
        sleeper.getLeagueRosters.mockResolvedValue([
            { roster_id: 1, owner_id: 'U1', starters: ['p1'], players: ['p1'] }
        ]);
        sleeper.getLeagueUsers.mockResolvedValue([{ user_id: 'U1', display_name: 'Owner One' }]);

        cache.getNflByeWeeksWithCache.mockResolvedValue({ KC: 5 });
        cache.getNflScheduleWithCache.mockResolvedValue([]);
        cache.getPlayersFromCacheOrFetch.mockResolvedValue({
            p1: { full_name: 'Pat M', team: 'KC', position: 'QB', fantasy_positions: ['QB'], injury_status: null }
        });
        cache.hasTeamPlayedThisWeek.mockReturnValue(false);
    });

    it('completes when the week schedule fetch fails', async () => {
        cache.getNflScheduleWithCache.mockRejectedValue(new Error('ESPN down'));

        const result = await analyzeLeagueRosters('L1');

        expect(result).toBeDefined();
        expect(result.currentWeek).toBe(5);
        expect(result.totalRosters).toBe(1);
    });

    it('completes when bye weeks fail to load', async () => {
        cache.getNflByeWeeksWithCache.mockRejectedValue(new Error('bye weeks down'));

        const result = await analyzeLeagueRosters('L1');

        expect(result).toBeDefined();
        expect(result.totalRosters).toBe(1);
    });

    it('completes when league users fail to load', async () => {
        sleeper.getLeagueUsers.mockRejectedValue(new Error('users down'));

        const result = await analyzeLeagueRosters('L1');

        expect(result).toBeDefined();
        expect(result.totalRosters).toBe(1);
    });

    it('fails fast when rosters cannot be loaded', async () => {
        sleeper.getLeagueRosters.mockRejectedValue(new Error('rosters down'));

        await expect(analyzeLeagueRosters('L1')).rejects.toThrow(/Unable to load rosters/);
    });
});
