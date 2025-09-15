/**
 * Tests for NFL Data Cache Service
 */

const { 
    getNflByeWeeksWithCache, 
    getPlayersFromCacheOrFetch,
    fetchAndCacheRosterPlayers,
    refreshNflPlayersCache,
    refreshNflByeWeeksCache,
    getCacheStatus,
    NFL_BYE_WEEKS_2025 
} = require('../../services/nflDataCache.js');

// Mock the dependencies
jest.mock('../../services/datastore.js');
jest.mock('../../services/sleeper.js');

const mockDatastore = require('../../services/datastore.js');
const mockSleeper = require('../../services/sleeper.js');

describe('NFL Data Cache Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        
        // Reset console.log and console.error to avoid cluttering test output
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        console.log.mockRestore();
        console.error.mockRestore();
    });

    describe('getNflByeWeeksWithCache', () => {
        it('should return cached bye weeks if available', async () => {
            const cachedByeWeeks = { 'KC': 6, 'LAR': 6 };
            mockDatastore.getNflByeWeeks.mockResolvedValue(cachedByeWeeks);

            const result = await getNflByeWeeksWithCache(2025);

            expect(result).toEqual(cachedByeWeeks);
            expect(mockDatastore.getNflByeWeeks).toHaveBeenCalledWith(2025);
            expect(mockDatastore.saveNflByeWeeks).not.toHaveBeenCalled();
        });

        it('should return hardcoded data and cache it if not cached', async () => {
            mockDatastore.getNflByeWeeks.mockResolvedValue(null);
            mockDatastore.saveNflByeWeeks.mockResolvedValue();

            const result = await getNflByeWeeksWithCache(2025);

            expect(result).toEqual(NFL_BYE_WEEKS_2025);
            expect(mockDatastore.getNflByeWeeks).toHaveBeenCalledWith(2025);
            expect(mockDatastore.saveNflByeWeeks).toHaveBeenCalledWith(2025, NFL_BYE_WEEKS_2025);
        });

        it('should return hardcoded data if cache fails', async () => {
            mockDatastore.getNflByeWeeks.mockRejectedValue(new Error('Cache error'));

            const result = await getNflByeWeeksWithCache(2025);

            expect(result).toEqual(NFL_BYE_WEEKS_2025);
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Error getting NFL bye weeks for 2025'),
                expect.any(Error)
            );
        });

        it('should return empty object for unknown season', async () => {
            mockDatastore.getNflByeWeeks.mockResolvedValue(null);

            const result = await getNflByeWeeksWithCache(2030);

            expect(result).toEqual({});
        });
    });

    describe('getPlayersFromCacheOrFetch', () => {
        const mockPlayers = {
            '123': { player_id: '123', full_name: 'Test Player', position: 'QB', active: true, fantasy_positions: ['QB'] },
            '456': { player_id: '456', full_name: 'Another Player', position: 'RB', active: true, fantasy_positions: ['RB'] }
        };

        // Ultra-minimal format that would be stored in cache
        const mockMinimalPlayers = {
            '123': { n: 'Test Player', t: null, p: 'QB' }
        };

        // Expected expanded format returned to caller
        const expectedExpandedPlayers = {
            '123': { 
                player_id: '123', 
                full_name: 'Test Player', 
                team: null,
                fantasy_positions: ['QB'],
                injury_status: null,
                active: true,
                position: 'QB' 
            }
        };

        it('should return cached players if available', async () => {
            mockDatastore.getNflPlayers.mockResolvedValue(mockMinimalPlayers);

            const result = await getPlayersFromCacheOrFetch(['123'], 'nfl');

            expect(result).toEqual(expectedExpandedPlayers);
            expect(mockDatastore.getNflPlayers).toHaveBeenCalledWith('nfl');
            expect(mockSleeper.getAllPlayers).not.toHaveBeenCalled();
        });

        it('should fetch missing players from API and cache them', async () => {
            mockDatastore.getNflPlayers.mockResolvedValue({});
            mockSleeper.getAllPlayers.mockResolvedValue(mockPlayers);
            mockDatastore.saveNflPlayers.mockResolvedValue();

            const result = await getPlayersFromCacheOrFetch(['123'], 'nfl');

            expect(result['123']).toBeDefined();
            expect(result['123'].full_name).toBe('Test Player');
            expect(mockSleeper.getAllPlayers).toHaveBeenCalledWith('nfl');
            expect(mockDatastore.saveNflPlayers).toHaveBeenCalled();
        });

        it('should handle mixed cached and missing players', async () => {
            // Player 123 is cached, player 456 needs to be fetched
            mockDatastore.getNflPlayers.mockResolvedValue(mockMinimalPlayers);
            mockSleeper.getAllPlayers.mockResolvedValue(mockPlayers);
            mockDatastore.saveNflPlayers.mockResolvedValue();

            const result = await getPlayersFromCacheOrFetch(['123', '456'], 'nfl');

            expect(Object.keys(result)).toHaveLength(2);
            expect(result['123'].full_name).toBe('Test Player');
            expect(result['456'].full_name).toBe('Another Player');
        });

        it('should return empty object for empty player list', async () => {
            const result = await getPlayersFromCacheOrFetch([], 'nfl');
            expect(result).toEqual({});
        });
    });

    describe('refreshNflPlayersCache', () => {
        const mockPlayers = {
            '123': { player_id: '123', full_name: 'Test Player' }
        };

        it('should fetch fresh data and update cache', async () => {
            mockSleeper.getAllPlayers.mockResolvedValue(mockPlayers);
            mockDatastore.saveNflPlayers.mockResolvedValue();

            const result = await refreshNflPlayersCache('nfl');

            expect(result).toEqual(mockPlayers);
            expect(mockSleeper.getAllPlayers).toHaveBeenCalledWith('nfl');
            
            // Should save ultra-minimal data
            const expectedMinimalData = {
                '123': {
                    n: 'Test Player',
                    t: null,
                    p: 'UNKNOWN'
                }
            };
            expect(mockDatastore.saveNflPlayers).toHaveBeenCalledWith('nfl', expectedMinimalData);
        });

        it('should throw error if API fails', async () => {
            mockSleeper.getAllPlayers.mockRejectedValue(new Error('API error'));

            await expect(refreshNflPlayersCache('nfl')).rejects.toThrow('API error');
        });
    });

    describe('refreshNflByeWeeksCache', () => {
        it('should update cache with hardcoded data', async () => {
            mockDatastore.saveNflByeWeeks.mockResolvedValue();

            const result = await refreshNflByeWeeksCache(2025);

            expect(result).toEqual(NFL_BYE_WEEKS_2025);
            expect(mockDatastore.saveNflByeWeeks).toHaveBeenCalledWith(2025, NFL_BYE_WEEKS_2025);
        });

        it('should throw error for unknown season', async () => {
            await expect(refreshNflByeWeeksCache(2030)).rejects.toThrow('No bye week data available for 2030 season');
        });
    });

    describe('getCacheStatus', () => {
        it('should return cache status for both caches', async () => {
            const mockByeWeeks = { 'KC': 6 };
            const mockPlayers = { '123': { player_id: '123' } };
            
            mockDatastore.getNflByeWeeks.mockResolvedValue(mockByeWeeks);
            mockDatastore.getNflPlayers.mockResolvedValue(mockPlayers);

            const result = await getCacheStatus();

            expect(result).toEqual({
                byeWeeks: {
                    cached: true,
                    season: 2025,
                    error: null
                },
                players: {
                    cached: true,
                    sport: 'nfl',
                    playerCount: 1,
                    error: null
                }
            });
        });

        it('should handle cache failures gracefully', async () => {
            mockDatastore.getNflByeWeeks.mockRejectedValue(new Error('Bye weeks error'));
            mockDatastore.getNflPlayers.mockRejectedValue(new Error('Players error'));

            const result = await getCacheStatus();

            expect(result.byeWeeks.cached).toBe(false);
            expect(result.byeWeeks.error).toBe('Bye weeks error');
            expect(result.players.cached).toBe(false);
            expect(result.players.error).toBe('Players error');
        });
    });
});
