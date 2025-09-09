const { analyzePlayer, analyzeRoster, formatAnalysisMessage, getPositionForSlot, NFL_BYE_WEEKS_2025 } = require('../../services/rosterAnalyzer');

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

            const result = analyzePlayer(player, 5); // Week 5

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

            const result = analyzePlayer(player, 1);

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

            const result = analyzePlayer(player, 1);

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

            const result = analyzePlayer(player, 1); // KC bye is week 6

            expect(result.onBye).toBe(false);
            expect(result.injured).toBe(false);
        });
    });

    describe('analyzeRoster', () => {
        test('should detect starting bye week players as critical issue', () => {
            const roster = {
                roster_id: 1,
                owner_id: 'user1',
                starters: ['player1', 'player2'],
                players: ['player1', 'player2', 'player3']
            };

            const allPlayers = {
                'player1': {
                    first_name: 'Bye',
                    last_name: 'Player',
                    position: 'QB',
                    team: 'DET', // Week 5 bye
                    injury_status: 'Healthy'
                },
                'player2': {
                    first_name: 'Good',
                    last_name: 'Player',
                    position: 'RB',
                    team: 'KC', // Week 6 bye
                    injury_status: 'Healthy'
                },
                'player3': {
                    first_name: 'Bench',
                    last_name: 'Player',
                    position: 'WR',
                    team: 'PHI', // Week 5 bye
                    injury_status: 'Healthy'
                }
            };

            const result = analyzeRoster(roster, allPlayers, 5);

            expect(result.hasIssues).toBe(true);
            expect(result.startingByeWeekPlayers).toHaveLength(1);
            expect(result.startingByeWeekPlayers[0].name).toBe('Bye Player');
            // Bench players should not be included
            expect(result.startingByeWeekPlayers.every(p => p.slotIndex)).toBe(true);
        });

        test('should detect starting injured players as critical issue', () => {
            const roster = {
                roster_id: 1,
                owner_id: 'user1',
                starters: ['player1', 'player2'],
                players: ['player1', 'player2']
            };

            const allPlayers = {
                'player1': {
                    first_name: 'Injured',
                    last_name: 'Starter',
                    position: 'QB',
                    team: 'KC',
                    injury_status: 'Out'
                },
                'player2': {
                    first_name: 'Healthy',
                    last_name: 'Player',
                    position: 'RB',
                    team: 'KC',
                    injury_status: 'Healthy'
                }
            };

            const result = analyzeRoster(roster, allPlayers, 1);

            expect(result.hasIssues).toBe(true);
            expect(result.startingInjuredPlayers).toHaveLength(1);
            expect(result.startingInjuredPlayers[0].injuryStatus).toBe('OUT');
            expect(result.startingInjuredPlayers[0].slotIndex).toBe(1);
        });

        test('should detect empty starting slots', () => {
            const roster = {
                roster_id: 1,
                owner_id: 'user1',
                starters: ['player1', '0', ''], // Empty slots
                players: ['player1']
            };

            const allPlayers = {
                'player1': {
                    first_name: 'Good',
                    last_name: 'Player',
                    position: 'QB',
                    team: 'KC',
                    injury_status: 'Healthy'
                }
            };

            const result = analyzeRoster(roster, allPlayers, 1);

            expect(result.hasIssues).toBe(true);
            expect(result.emptyStartingSlots).toHaveLength(2);
            expect(result.emptyStartingSlots[0].slotIndex).toBe(2);
            expect(result.emptyStartingSlots[1].slotIndex).toBe(3);
        });

        test('should not flag bench players', () => {
            const roster = {
                roster_id: 1,
                owner_id: 'user1',
                starters: ['player1'], // Only healthy starter
                players: ['player1', 'player2', 'player3'] // Injured/bye bench players
            };

            const allPlayers = {
                'player1': {
                    first_name: 'Healthy',
                    last_name: 'Starter',
                    position: 'QB',
                    team: 'KC',
                    injury_status: 'Healthy'
                },
                'player2': {
                    first_name: 'Injured',
                    last_name: 'Bench',
                    position: 'RB',
                    team: 'KC',
                    injury_status: 'Out'
                },
                'player3': {
                    first_name: 'Bye',
                    last_name: 'Bench',
                    position: 'WR',
                    team: 'DET', // Week 5 bye
                    injury_status: 'Healthy'
                }
            };

            const result = analyzeRoster(roster, allPlayers, 5);

            expect(result.hasIssues).toBe(false);
            expect(result.startingByeWeekPlayers).toHaveLength(0);
            expect(result.startingInjuredPlayers).toHaveLength(0);
        });
    });

    describe('formatAnalysisMessage', () => {
        test('should format clean roster message', () => {
            const analysis = {
                currentWeek: 5,
                totalRosters: 12,
                rostersWithIssues: 0,
                rosterAnalysis: []
            };

            const result = formatAnalysisMessage(analysis);

            expect(result).toContain('✅');
            expect(result).toContain('Week 5');
            expect(result).toContain('All 12 starting lineups look good');
        });

        test('should format roster issues message', () => {
            const analysis = {
                currentWeek: 5,
                totalRosters: 12,
                rostersWithIssues: 1,
                rosterAnalysis: [{
                    owner: 'Test Owner',
                    issues: {
                        startingByeWeekPlayers: [{
                            name: 'Bye Player',
                            position: 'QB',
                            team: 'DET',
                            slotIndex: 1
                        }],
                        startingInjuredPlayers: [],
                        emptyStartingSlots: [{
                            slotIndex: 2,
                            position: 'RB'
                        }]
                    }
                }],
                analyzedAt: new Date().toISOString()
            };

            const result = formatAnalysisMessage(analysis);

            expect(result).toContain('🔍');
            expect(result).toContain('Starting Lineup Analysis');
            expect(result).toContain('Week 5');
            expect(result).toContain('Test Owner');
            expect(result).toContain('Starting players on BYE');
            expect(result).toContain('Bye Player (QB, DET)');
            expect(result).toContain('Empty starting slots');
            expect(result).toContain('RB (Empty)');
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
