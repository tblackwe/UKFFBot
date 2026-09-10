jest.mock('../../services/sleeper.js');
jest.mock('../../services/datastore.js');

const sleeper = require('../../services/sleeper.js');
const datastore = require('../../services/datastore.js');
const {
    etDateString,
    firstKickoffOnDate,
    shouldRunRosterCheck,
    adjacentWeeks,
    loadUpcomingGames,
    evaluateRosterCheck,
    LEAD_MS
} = require('../../services/rosterScheduler.js');

describe('rosterScheduler gate', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        datastore.saveNflSchedule.mockResolvedValue();
        datastore.tryClaimRosterCheck.mockResolvedValue(true);
        datastore.releaseRosterCheck.mockResolvedValue();
    });

    afterEach(() => {
        console.log.mockRestore();
        console.error.mockRestore();
        console.warn.mockRestore();
    });

    describe('etDateString / firstKickoffOnDate', () => {
        it('groups Sunday Night Football as Sunday Eastern, not Monday UTC', () => {
            // 8:20pm EDT Sunday 13 Sep 2026 == 00:20 UTC Monday
            const snf = '2026-09-14T00:20:00.000Z';
            expect(etDateString(snf)).toBe('2026-09-13');
            expect(firstKickoffOnDate([{ start_time: snf }], '2026-09-13').toISOString()).toBe(snf);
            expect(firstKickoffOnDate([{ start_time: snf }], '2026-09-14')).toBeNull();
        });

        it('uses the earliest kickoff when two games share a day', () => {
            const early = { start_time: '2026-09-13T17:00:00.000Z' }; // 1:00pm EDT
            const late = { start_time: '2026-09-13T20:25:00.000Z' };
            const first = firstKickoffOnDate([late, early], '2026-09-13');
            expect(first.toISOString()).toBe(early.start_time);
        });

        it('treats a London morning kickoff as Saturday Eastern', () => {
            // 9:30am BST Saturday == 08:30 UTC == 4:30am EDT
            const london = '2026-09-12T08:30:00.000Z';
            expect(etDateString(london)).toBe('2026-09-12');
            expect(firstKickoffOnDate([{ start_time: london }], '2026-09-12').toISOString()).toBe(london);
        });

        it('ignores games without a start_time', () => {
            expect(firstKickoffOnDate([{ home_team: 'KC' }], '2026-09-13')).toBeNull();
        });
    });

    describe('shouldRunRosterCheck', () => {
        const tnfKickoff = new Date('2026-09-11T00:15:00.000Z'); // 8:15pm EDT Thu 10 Sep
        const windowStart = new Date(tnfKickoff.getTime() - LEAD_MS); // 5:15pm EDT

        it('runs at T-3h for Thursday night football, not earlier', () => {
            expect(shouldRunRosterCheck({
                now: new Date(windowStart.getTime() - 1),
                firstKickoff: tnfKickoff
            })).toBe(false);
            expect(shouldRunRosterCheck({
                now: windowStart,
                firstKickoff: tnfKickoff
            })).toBe(true);
        });

        it('does not run at or after kickoff', () => {
            expect(shouldRunRosterCheck({
                now: tnfKickoff,
                firstKickoff: tnfKickoff
            })).toBe(false);
        });

        it('does not run when the day was already claimed', () => {
            expect(shouldRunRosterCheck({
                now: windowStart,
                firstKickoff: tnfKickoff,
                alreadyRan: true
            })).toBe(false);
        });

        it('runs 3 hours before a London Saturday morning kickoff', () => {
            const kickoff = new Date('2026-09-12T08:30:00.000Z');
            const now = new Date(kickoff.getTime() - LEAD_MS);
            expect(shouldRunRosterCheck({ now, firstKickoff: kickoff })).toBe(true);
        });
    });

    describe('adjacentWeeks', () => {
        it('includes neighbours and drops week 0', () => {
            expect(adjacentWeeks(1)).toEqual([1, 2]);
            expect(adjacentWeeks(5)).toEqual([4, 5, 6]);
            expect(adjacentWeeks(18)).toEqual([17, 18, 19]);
        });
    });

    describe('flexed game days', () => {
        it('moves the game day when ESPN shifts Sunday to Saturday', () => {
            const sunday = { start_time: '2026-09-13T17:00:00.000Z' };
            const saturday = { start_time: '2026-09-12T17:00:00.000Z' };

            expect(firstKickoffOnDate([sunday], '2026-09-12')).toBeNull();
            expect(firstKickoffOnDate([sunday], '2026-09-13')).not.toBeNull();

            expect(firstKickoffOnDate([saturday], '2026-09-12')).not.toBeNull();
            expect(firstKickoffOnDate([saturday], '2026-09-13')).toBeNull();
        });
    });

    describe('loadUpcomingGames', () => {
        it('fetches adjacent weeks from ESPN and write-through caches them', async () => {
            const week4 = [{ start_time: '2026-09-10T00:20:00.000Z' }];
            const week5 = [{ start_time: '2026-09-13T17:00:00.000Z' }];
            const week6 = [{ start_time: '2026-09-17T00:20:00.000Z' }];
            sleeper.getNflSchedule
                .mockResolvedValueOnce(week4)
                .mockResolvedValueOnce(week5)
                .mockResolvedValueOnce(week6);

            const games = await loadUpcomingGames(2026, 5);

            expect(sleeper.getNflSchedule).toHaveBeenCalledTimes(3);
            expect(sleeper.getNflSchedule).toHaveBeenCalledWith(2026, 4, 2);
            expect(sleeper.getNflSchedule).toHaveBeenCalledWith(2026, 5, 2);
            expect(sleeper.getNflSchedule).toHaveBeenCalledWith(2026, 6, 2);
            expect(games).toHaveLength(3);
            expect(datastore.saveNflSchedule).toHaveBeenCalledWith(2026, 4, week4);
            expect(datastore.saveNflSchedule).toHaveBeenCalledWith(2026, 5, week5);
            expect(datastore.saveNflSchedule).toHaveBeenCalledWith(2026, 6, week6);
        });

        it('still returns games when a week fetch fails', async () => {
            sleeper.getNflSchedule
                .mockRejectedValueOnce(new Error('ESPN 404'))
                .mockResolvedValueOnce([{ start_time: '2026-09-13T17:00:00.000Z' }])
                .mockResolvedValueOnce([]);

            const games = await loadUpcomingGames(2026, 5);
            expect(games).toHaveLength(1);
        });
    });

    describe('evaluateRosterCheck', () => {
        const kickoff = new Date('2026-09-11T00:15:00.000Z');
        const windowStart = new Date(kickoff.getTime() - LEAD_MS);

        function mockRegularSeasonGames() {
            sleeper.getNflState.mockResolvedValue({
                season: '2026',
                week: 1,
                display_week: 1,
                season_type: 'regular'
            });
            sleeper.getNflSchedule.mockResolvedValue([
                { start_time: kickoff.toISOString(), home_team: 'SEA', away_team: 'NE' }
            ]);
        }

        it('skips outside the regular/post season', async () => {
            sleeper.getNflState.mockResolvedValue({ season_type: 'pre' });
            const decision = await evaluateRosterCheck(windowStart);
            expect(decision).toMatchObject({ shouldRun: false, reason: 'off_season' });
            expect(sleeper.getNflSchedule).not.toHaveBeenCalled();
        });

        it('skips when there are no games today', async () => {
            sleeper.getNflState.mockResolvedValue({
                season: '2026',
                week: 1,
                season_type: 'regular'
            });
            sleeper.getNflSchedule.mockResolvedValue([
                { start_time: '2026-09-13T17:00:00.000Z' }
            ]);
            const decision = await evaluateRosterCheck(new Date('2026-09-10T21:15:00.000Z'));
            expect(decision).toMatchObject({ shouldRun: false, reason: 'no_games', etDate: '2026-09-10' });
        });

        it('skips before the T-3h window', async () => {
            mockRegularSeasonGames();
            const decision = await evaluateRosterCheck(new Date(windowStart.getTime() - 60_000));
            expect(decision).toMatchObject({ shouldRun: false, reason: 'too_early' });
            expect(datastore.tryClaimRosterCheck).not.toHaveBeenCalled();
        });

        it('skips after the first kickoff', async () => {
            mockRegularSeasonGames();
            const decision = await evaluateRosterCheck(kickoff);
            expect(decision).toMatchObject({ shouldRun: false, reason: 'too_late' });
        });

        it('claims the lock and runs inside the window', async () => {
            mockRegularSeasonGames();
            const decision = await evaluateRosterCheck(windowStart);
            expect(decision.shouldRun).toBe(true);
            expect(decision.reason).toBe('run');
            expect(decision.etDate).toBe('2026-09-10');
            expect(datastore.tryClaimRosterCheck).toHaveBeenCalledWith('2026-09-10');
        });

        it('skips when another poll already claimed the day', async () => {
            mockRegularSeasonGames();
            datastore.tryClaimRosterCheck.mockResolvedValue(false);
            const decision = await evaluateRosterCheck(windowStart);
            expect(decision).toMatchObject({ shouldRun: false, reason: 'already_ran' });
        });

        it('fetches ESPN postseason scoreboards (seasontype 3)', async () => {
            sleeper.getNflState.mockResolvedValue({
                season: '2026',
                week: 1,
                display_week: 1,
                season_type: 'post'
            });
            sleeper.getNflSchedule.mockResolvedValue([
                { start_time: kickoff.toISOString(), home_team: 'KC', away_team: 'BUF' }
            ]);
            const decision = await evaluateRosterCheck(windowStart);
            expect(decision.shouldRun).toBe(true);
            expect(sleeper.getNflSchedule).toHaveBeenCalledWith(2026, 1, 3);
        });
    });
});
