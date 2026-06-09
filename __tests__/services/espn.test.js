// Mock the resilient fetch so these tests don't hit the network.
jest.mock('../../services/sleeper.js', () => ({
    resilientFetch: jest.fn()
}));

const { resilientFetch } = require('../../services/sleeper.js');
const { fetchNflByeWeeks } = require('../../services/espn.js');

// ESPN core API numeric team ids for every NFL team (matches services/espn.js).
const TEAM_IDS = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 33, 34
];

// Build a fake ESPN week response with the given team ids on bye.
const weekResponse = (teamIds) => ({
    ok: true,
    status: 200,
    json: async () => ({
        teamsOnBye: teamIds.map((id) => ({ $ref: `http://x/teams/${id}?lang=en` }))
    })
});

describe('espn.fetchNflByeWeeks', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('aggregates all 32 teams across weeks into a season map', async () => {
        // Put 2 teams on bye in week 1, the rest in week 2; everything else empty.
        resilientFetch.mockImplementation((url) => {
            const week = parseInt(url.match(/weeks\/(\d+)/)[1], 10);
            if (week === 1) return Promise.resolve(weekResponse(TEAM_IDS.slice(0, 2)));
            if (week === 2) return Promise.resolve(weekResponse(TEAM_IDS.slice(2)));
            return Promise.resolve(weekResponse([]));
        });

        const result = await fetchNflByeWeeks(2026);

        expect(Object.keys(result)).toHaveLength(32);
        // ESPN id 28 (WSH) must be mapped to Sleeper's WAS.
        expect(result.WAS).toBeDefined();
        expect(result.WSH).toBeUndefined();
        // Team id 1 (ATL) was in week 1.
        expect(result.ATL).toBe(1);
    });

    it('throws when ESPN data is incomplete (not all 32 teams)', async () => {
        resilientFetch.mockImplementation((url) => {
            const week = parseInt(url.match(/weeks\/(\d+)/)[1], 10);
            // Only 30 teams ever appear on bye -> incomplete.
            if (week === 1) return Promise.resolve(weekResponse(TEAM_IDS.slice(0, 30)));
            return Promise.resolve(weekResponse([]));
        });

        await expect(fetchNflByeWeeks(2026)).rejects.toThrow(/incomplete.*30\/32/);
    });

    it('tolerates individual week failures but still throws if incomplete', async () => {
        resilientFetch.mockRejectedValue(new Error('ESPN down'));

        await expect(fetchNflByeWeeks(2026)).rejects.toThrow(/incomplete/);
    });
});
