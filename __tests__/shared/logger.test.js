const logger = require('../../shared/logger.js');

describe('logger', () => {
    let logSpy;
    let warnSpy;
    let errorSpy;

    beforeEach(() => {
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    const lastJson = (spy) => JSON.parse(spy.mock.calls[spy.mock.calls.length - 1][0]);

    it('emits a single-line JSON object with level, message and timestamp', () => {
        logger.info('hello', { foo: 'bar' });

        expect(logSpy).toHaveBeenCalledTimes(1);
        const entry = lastJson(logSpy);
        expect(entry).toMatchObject({ level: 'info', message: 'hello', foo: 'bar' });
        expect(entry.timestamp).toEqual(expect.any(String));
    });

    it('routes levels to the matching console method', () => {
        logger.warn('careful');
        logger.error('broken');

        expect(lastJson(warnSpy).level).toBe('warn');
        expect(lastJson(errorSpy).level).toBe('error');
    });

    it('serializes Error objects in context to message + stack', () => {
        const err = new Error('kaboom');
        logger.error('failed', { error: err, draftId: '123' });

        const entry = lastJson(errorSpy);
        expect(entry.draftId).toBe('123');
        expect(entry.error.message).toBe('kaboom');
        expect(entry.error.stack).toContain('kaboom');
    });

    it('works with no context argument', () => {
        expect(() => logger.debug('just a message')).not.toThrow();
        expect(lastJson(logSpy).message).toBe('just a message');
    });
});
