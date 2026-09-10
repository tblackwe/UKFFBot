const { handleCommandError, ERROR_MESSAGES } = require('../../shared/messages');

describe('handleCommandError', () => {
    let say;
    let errorSpy;

    beforeEach(() => {
        say = jest.fn();
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        errorSpy.mockRestore();
    });

    test('logs the command name and replies with the default configuration error', async () => {
        const error = new Error('boom');

        await handleCommandError('listing leagues', error, say);

        expect(errorSpy).toHaveBeenCalledWith('Error in listing leagues command:', error);
        expect(say).toHaveBeenCalledWith(ERROR_MESSAGES.CONFIGURATION_ERROR);
    });

    test('replies with a custom message when provided', async () => {
        await handleCommandError('listdrafts', new Error('boom'), say, 'custom');

        expect(say).toHaveBeenCalledWith('custom');
    });
});
