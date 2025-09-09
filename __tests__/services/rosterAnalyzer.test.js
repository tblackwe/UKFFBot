const { analyzePlayer, analyzeRoster, formatAnalysisMessage, getPositionForSlot } = require('../../services/rosterAnalyzer');
const { NFL_BYE_WEEKS_2025 } = require('../../services/nflDataCache');

describe('rosterAnalyzer', () => {
    describe('analyzePlayer', () => {
        test('should detect bye week player', () => {
            const player = {
                first_name: 'Test',
                last_name: 'Player',
                position: 'QB',
                team: 'DET', // DET has bye week 5
                injury_status: 'Healthy'
            };

            const result = analyzePlayer(player, 5, NFL_BYE_WEEKS_2025); // Week 5

            expect(result.onBye).toBe(true);
            expect(result.injured).toBe(false);
        });

        test('should detect injured player', () => {
            const player = {
                first_name: 'Test',
                last_name: 'Player',
                position: 'RB',
                team: 'KC',
                injury_status: 'Out'
            };

            const result = analyzePlayer(player, 1, NFL_BYE_WEEKS_2025);

            expect(result.onBye).toBe(false);
            expect(result.injured).toBe(true);
            expect(result.injuryStatus).toBe('OUT');
        });

        test('should not flag questionable players as injured', () => {
            const player = {
                first_name: 'Test',
                last_name: 'Player',
                position: 'RB',
                team: 'KC',
                injury_status: 'Questionable'
            };

            const result = analyzePlayer(player, 1, NFL_BYE_WEEKS_2025);

            expect(result.onBye).toBe(false);
            expect(result.injured).toBe(false);
            expect(result.injuryStatus).toBe(null);
        });

        test('should handle healthy player not on bye', () => {
            const player = {
                first_name: 'Test',
                last_name: 'Player',
                position: 'WR',
                team: 'KC',
                injury_status: 'Healthy'
            };

            const result = analyzePlayer(player, 1, NFL_BYE_WEEKS_2025); // Week 1, KC bye is week 6

            expect(result.onBye).toBe(false);
            expect(result.injured).toBe(false);
        });
    });

    describe('analyzeRoster', () => {
        const mockPlayers = {
            'player1': {
                first_name: 'Test',
                last_name: 'Player1',
                position: 'QB',
                team: 'DET', // bye week 5
                injury_status: 'Healthy'
            },
            'player2': {
                first_name: 'Test',
                last_name: 'Player2',
                position: 'RB',
                team: 'KC', // bye week 6
                injury_status: 'Out'
            },
            'player3': {
                first_name: 'Bench',
                last_name: 'Player',
                position: 'WR',
                team: 'DET', // bye week 5 but on bench
                injury_status: 'Healthy'
            }
        };

        test('should detect starting bye week players as critical issue', () => {
            const roster = {
                starters: ['player1', 'player2'], // player1 is on bye
                players: ['player1', 'player2', 'player3']
            };

            const result = analyzeRoster(roster, mockPlayers, 5, NFL_BYE_WEEKS_2025); // Week 5

            expect(result.hasIssues).toBe(true);
            expect(result.startingByeWeekPlayers).toHaveLength(1);
            expect(result.startingByeWeekPlayers[0].name).toBe('Test Player1');
            expect(result.startingByeWeekPlayers[0].team).toBe('DET');
        });

        test('should detect starting injured players as critical issue', () => {
            const roster = {
                starters: ['player1', 'player2'], // player2 is injured
                players: ['player1', 'player2', 'player3']
            };

            const result = analyzeRoster(roster, mockPlayers, 1, NFL_BYE_WEEKS_2025); // Week 1

            expect(result.hasIssues).toBe(true);
            expect(result.startingInjuredPlayers).toHaveLength(1);
            expect(result.startingInjuredPlayers[0].name).toBe('Test Player2');
            expect(result.startingInjuredPlayers[0].injuryStatus).toBe('OUT');
        });

        test('should detect empty starting slots', () => {
            const roster = {
                starters: ['player1', '', '0'], // Two empty slots
                players: ['player1']
            };

            const result = analyzeRoster(roster, mockPlayers, 1, NFL_BYE_WEEKS_2025);

            expect(result.hasIssues).toBe(true);
            expect(result.emptyStartingSlots).toHaveLength(2);
            expect(result.emptyStartingSlots[0].slotIndex).toBe(2);
            expect(result.emptyStartingSlots[1].slotIndex).toBe(3);
        });

        test('should not flag bench players', () => {
            const roster = {
                starters: ['player2'], // Only player2 starting (injured)
                players: ['player1', 'player2', 'player3'] // player1 and player3 on bench with bye
            };

            const result = analyzeRoster(roster, mockPlayers, 5, NFL_BYE_WEEKS_2025); // Week 5

            // Should only flag starting injured player, not bench bye week players
            expect(result.hasIssues).toBe(true);
            expect(result.startingByeWeekPlayers).toHaveLength(0); // No starting bye players
            expect(result.startingInjuredPlayers).toHaveLength(1); // One starting injured player
        });
    });

    describe('formatAnalysisMessage', () => {
        test('should format clean roster message', () => {
            const analysis = {
                currentWeek: 5,
                totalRosters: 10,
                rostersWithIssues: 0,
                rosterAnalysis: []
            };

            const result = formatAnalysisMessage(analysis);

            expect(result).toContain('✅ **League Roster Check - Week 5**');
            expect(result).toContain('All 10 starting lineups look good!');
        });

        test('should format roster issues message', () => {
            const analysis = {
                currentWeek: 5,
                totalRosters: 10,
                rostersWithIssues: 2,
                rosterAnalysis: [
                    {
                        owner: 'Test Owner 1',
                        issues: {
                            startingByeWeekPlayers: [
                                { name: 'Test Player', position: 'QB', team: 'DET' }
                            ],
                            startingInjuredPlayers: [],
                            emptyStartingSlots: []
                        }
                    },
                    {
                        owner: 'Test Owner 2',
                        issues: {
                            startingByeWeekPlayers: [],
                            startingInjuredPlayers: [
                                { name: 'Injured Player', position: 'RB', injuryStatus: 'OUT' }
                            ],
                            emptyStartingSlots: [
                                { position: 'WR', issue: 'Empty' }
                            ]
                        }
                    }
                ],
                analyzedAt: new Date('2025-09-09T12:00:00Z').toISOString()
            };

            const result = formatAnalysisMessage(analysis);

            expect(result).toContain('🔍 **League Starting Lineup Analysis - Week 5**');
            expect(result).toContain('Found starting lineup issues with **2** out of **10** rosters');
            expect(result).toContain('**Test Owner 1:**');
            expect(result).toContain('⚠️ **Starting players on BYE:** Test Player (QB, DET)');
            expect(result).toContain('**Test Owner 2:**');
            expect(result).toContain('🚑 **Starting injured players:** Injured Player (RB, OUT)');
            expect(result).toContain('❌ **Empty starting slots:** WR (Empty)');
        });
    });

    describe('getPositionForSlot', () => {
        test('should return correct positions for common slots', () => {
            expect(getPositionForSlot(0)).toBe('QB');
            expect(getPositionForSlot(1)).toBe('RB');
            expect(getPositionForSlot(2)).toBe('RB');
            expect(getPositionForSlot(3)).toBe('WR');
            expect(getPositionForSlot(4)).toBe('WR');
            expect(getPositionForSlot(5)).toBe('TE');
            expect(getPositionForSlot(6)).toBe('FLEX');
            expect(getPositionForSlot(7)).toBe('K');
            expect(getPositionForSlot(8)).toBe('DEF');
        });

        test('should handle slots beyond common positions', () => {
            expect(getPositionForSlot(10)).toBe('Slot 11');
            expect(getPositionForSlot(15)).toBe('Slot 16');
        });
    });

    describe('NFL_BYE_WEEKS_2025', () => {
        test('should have bye weeks for all 32 teams', () => {
            const teams = Object.keys(NFL_BYE_WEEKS_2025);
            expect(teams.length).toBe(32);
        });

        test('should have valid week numbers', () => {
            const weeks = Object.values(NFL_BYE_WEEKS_2025);
            weeks.forEach(week => {
                expect(week).toBeGreaterThanOrEqual(5);
                expect(week).toBeLessThanOrEqual(14);
            });
        });
    });
});
