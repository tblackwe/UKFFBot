const sleeper = require('../../services/sleeper.js');
const { resilientFetch } = sleeper;

// Helper to build a minimal fetch Response-like object.
const resp = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: `status ${status}`,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
});

describe('sleeper service resilience', () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = global.fetch;
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        global.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    describe('resilientFetch', () => {
        it('returns the response on first success', async () => {
            global.fetch = jest.fn().mockResolvedValue(resp(200, {}));

            const result = await resilientFetch('http://example', { baseDelayMs: 0 });

            expect(result.status).toBe(200);
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });

        it('retries on a transient 500 and then succeeds', async () => {
            global.fetch = jest.fn()
                .mockResolvedValueOnce(resp(500))
                .mockResolvedValueOnce(resp(200, {}));

            const result = await resilientFetch('http://example', { baseDelayMs: 0, attempts: 3 });

            expect(result.status).toBe(200);
            expect(global.fetch).toHaveBeenCalledTimes(2);
        });

        it('retries on a network error and then succeeds', async () => {
            global.fetch = jest.fn()
                .mockRejectedValueOnce(new Error('ECONNRESET'))
                .mockResolvedValueOnce(resp(200, {}));

            const result = await resilientFetch('http://example', { baseDelayMs: 0 });

            expect(result.status).toBe(200);
            expect(global.fetch).toHaveBeenCalledTimes(2);
        });

        it('retries on a timeout (AbortError) and then succeeds', async () => {
            const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
            global.fetch = jest.fn()
                .mockRejectedValueOnce(abortError)
                .mockResolvedValueOnce(resp(200, {}));

            const result = await resilientFetch('http://example', { baseDelayMs: 0 });

            expect(result.status).toBe(200);
            expect(global.fetch).toHaveBeenCalledTimes(2);
        });

        it('does not retry on a 404 and returns the response', async () => {
            global.fetch = jest.fn().mockResolvedValue(resp(404));

            const result = await resilientFetch('http://example', { baseDelayMs: 0, attempts: 3 });

            expect(result.status).toBe(404);
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });

        it('gives up after the max attempts and throws the last error', async () => {
            global.fetch = jest.fn().mockRejectedValue(new Error('service down'));

            await expect(resilientFetch('http://example', { baseDelayMs: 0, attempts: 3 }))
                .rejects.toThrow('service down');
            expect(global.fetch).toHaveBeenCalledTimes(3);
        });

        it('returns the last response when a retryable status persists', async () => {
            global.fetch = jest.fn().mockResolvedValue(resp(503));

            const result = await resilientFetch('http://example', { baseDelayMs: 0, attempts: 2 });

            expect(result.status).toBe(503);
            expect(global.fetch).toHaveBeenCalledTimes(2);
        });
    });

    describe('sleeperRequest (via getLeague)', () => {
        it('parses and returns JSON on success', async () => {
            global.fetch = jest.fn().mockResolvedValue(resp(200, { league_id: 'L1' }));

            const result = await sleeper.getLeague('L1');

            expect(result).toEqual({ league_id: 'L1' });
        });

        it('returns null when Sleeper responds 200 with a null body', async () => {
            global.fetch = jest.fn().mockResolvedValue(resp(200, null));

            const result = await sleeper.getLeague('missing');

            expect(result).toBeNull();
        });

        it('retries then throws on persistent server errors', async () => {
            global.fetch = jest.fn().mockResolvedValue(resp(500, 'boom'));

            await expect(sleeper.getLeague('L1')).rejects.toThrow(/Sleeper API request failed/);
            expect(global.fetch).toHaveBeenCalledTimes(3);
        });
    });
});
