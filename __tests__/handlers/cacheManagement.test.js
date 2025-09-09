/**
 * Tests for Cache Management Handlers
 */

const { handleCacheStatusCommand, handleCacheRefreshCommand } = require('../../handlers/cacheManagement.js');

// Mock the dependencies
jest.mock('../../services/nflDataCache.js');
jest.mock('../../services/sleeper.js');

const mockNflDataCache = require('../../services/nflDataCache.js');
const mockSleeper = require('../../services/sleeper.js');

describe('Cache Management Handlers', () => {
    let mockAck, mockRespond, mockClient, mockCommand;

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Mock Slack API functions
        mockAck = jest.fn();
        mockRespond = jest.fn();
        mockClient = {};
        mockCommand = { channel_id: 'C123456' };

        // Reset console.log and console.error to avoid cluttering test output
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        console.log.mockRestore();
        console.error.mockRestore();
    });

    describe('handleCacheStatusCommand', () => {
        it('should return cache status successfully', async () => {
            const mockCacheStatus = {
                byeWeeks: {
                    cached: true,
                    season: 2025,
                    error: null
                },
                players: {
                    cached: true,
                    sport: 'nfl',
                    playerCount: 5000,
                    error: null
                }
            };

            mockNflDataCache.getCacheStatus.mockResolvedValue(mockCacheStatus);

            await handleCacheStatusCommand({
                ack: mockAck,
                respond: mockRespond,
                command: mockCommand,
                client: mockClient
            });

            expect(mockAck).toHaveBeenCalledTimes(1);
            expect(mockRespond).toHaveBeenCalledWith({
                text: expect.stringContaining('📊 **NFL Data Cache Status**'),
                response_type: 'in_channel'
            });

            const responseCall = mockRespond.mock.calls[0][0];
            expect(responseCall.text).toContain('**Bye Weeks (2025):**');
            expect(responseCall.text).toContain('Cached: ✅');
            expect(responseCall.text).toContain('**Players (NFL):**');
            expect(responseCall.text).toContain('Players: 5,000');
        });

        it('should handle cache status with errors', async () => {
            const mockCacheStatus = {
                byeWeeks: {
                    cached: false,
                    season: 2025,
                    error: 'Database connection failed'
                },
                players: {
                    cached: false,
                    sport: 'nfl',
                    playerCount: 0,
                    error: 'API timeout'
                }
            };

            mockNflDataCache.getCacheStatus.mockResolvedValue(mockCacheStatus);

            await handleCacheStatusCommand({
                ack: mockAck,
                respond: mockRespond,
                command: mockCommand,
                client: mockClient
            });

            expect(mockAck).toHaveBeenCalledTimes(1);
            expect(mockRespond).toHaveBeenCalledWith({
                text: expect.stringContaining('Cached: ❌'),
                response_type: 'in_channel'
            });

            const responseCall = mockRespond.mock.calls[0][0];
            expect(responseCall.text).toContain('Error: Database connection failed');
            expect(responseCall.text).toContain('Error: API timeout');
        });

        it('should handle cache status service failure', async () => {
            mockNflDataCache.getCacheStatus.mockRejectedValue(new Error('Service unavailable'));

            await handleCacheStatusCommand({
                ack: mockAck,
                respond: mockRespond,
                command: mockCommand,
                client: mockClient
            });

            expect(mockAck).toHaveBeenCalledTimes(1);
            expect(mockRespond).toHaveBeenCalledWith({
                text: '❌ Error checking cache status: Service unavailable',
                response_type: 'ephemeral'
            });
        });
    });

    describe('handleCacheRefreshCommand', () => {
        it('should refresh caches successfully', async () => {
            const mockNflState = { season: 2025 };
            const mockPlayers = {
                '123': { player_id: '123', full_name: 'Test Player' },
                '456': { player_id: '456', full_name: 'Another Player' }
            };
            const mockByeWeeks = { 'KC': 6, 'LAR': 6 };

            mockSleeper.getNflState.mockResolvedValue(mockNflState);
            mockNflDataCache.refreshNflPlayersCache.mockResolvedValue(mockPlayers);
            mockNflDataCache.refreshNflByeWeeksCache.mockResolvedValue(mockByeWeeks);

            await handleCacheRefreshCommand({
                ack: mockAck,
                respond: mockRespond,
                command: mockCommand,
                client: mockClient
            });

            expect(mockAck).toHaveBeenCalledTimes(1);
            expect(mockRespond).toHaveBeenCalledTimes(2);

            // First call should be the "working" message
            expect(mockRespond.mock.calls[0][0]).toEqual({
                text: '🔄 Refreshing NFL data caches...',
                response_type: 'ephemeral'
            });

            // Second call should be the success message
            const successCall = mockRespond.mock.calls[1][0];
            expect(successCall.text).toContain('🔄 **Cache Refresh Complete**');
            expect(successCall.text).toContain('✅ **Players Cache:** Refreshed with 2 players');
            expect(successCall.text).toContain('✅ **Bye Weeks Cache:** Refreshed for 2025 season (2 teams)');
            expect(successCall.response_type).toBe('in_channel');
        });

        it('should handle partial cache refresh failures', async () => {
            const mockNflState = { season: 2025 };
            const mockPlayers = { '123': { player_id: '123' } };

            mockSleeper.getNflState.mockResolvedValue(mockNflState);
            mockNflDataCache.refreshNflPlayersCache.mockResolvedValue(mockPlayers);
            mockNflDataCache.refreshNflByeWeeksCache.mockRejectedValue(new Error('Bye weeks failed'));

            await handleCacheRefreshCommand({
                ack: mockAck,
                respond: mockRespond,
                command: mockCommand,
                client: mockClient
            });

            expect(mockAck).toHaveBeenCalledTimes(1);
            expect(mockRespond).toHaveBeenCalledTimes(2);

            const successCall = mockRespond.mock.calls[1][0];
            expect(successCall.text).toContain('✅ **Players Cache:** Refreshed with 1 players');
            expect(successCall.text).toContain('❌ **Bye Weeks Cache:** Failed - Bye weeks failed');
        });

        it('should handle complete cache refresh failure', async () => {
            mockSleeper.getNflState.mockRejectedValue(new Error('NFL state unavailable'));

            await handleCacheRefreshCommand({
                ack: mockAck,
                respond: mockRespond,
                command: mockCommand,
                client: mockClient
            });

            expect(mockAck).toHaveBeenCalledTimes(1);
            expect(mockRespond).toHaveBeenCalledWith({
                text: '❌ Error refreshing cache: NFL state unavailable',
                response_type: 'ephemeral'
            });
        });
    });
});
