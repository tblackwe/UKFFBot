// Mock every handler module so we can assert the routing logic in isolation.
jest.mock('../../handlers/lastpick.js', () => ({ handleLastPickCommand: jest.fn() }));
jest.mock('../../handlers/registerDraft.js', () => ({ handleRegisterDraftCommand: jest.fn() }));
jest.mock('../../handlers/registerPlayer.js', () => ({ handleRegisterPlayerCommand: jest.fn() }));
jest.mock('../../handlers/registerLeague.js', () => ({ handleRegisterLeagueCommand: jest.fn() }));
jest.mock('../../handlers/handleUsageCommand.js', () => ({ handleUsageCommand: jest.fn() }));
jest.mock('../../handlers/unregisterDraft.js', () => ({ handleUnregisterDraftCommand: jest.fn() }));
jest.mock('../../handlers/listDrafts.js', () => ({ handleListDraftsCommand: jest.fn() }));
jest.mock('../../handlers/listLeagues.js', () => ({ handleListLeaguesCommand: jest.fn() }));
jest.mock('../../handlers/updatePlayers.js', () => ({ handleUpdatePlayersCommand: jest.fn() }));
jest.mock('../../handlers/checkRosters.js', () => ({
    handleCheckRostersCommand: jest.fn(),
    handleCheckLeagueRostersCommand: jest.fn()
}));
jest.mock('../../handlers/cacheManagement.js', () => ({
    handleCacheStatusCommand: jest.fn(),
    handleCacheRefreshCommand: jest.fn()
}));

const { createCommandPayload, handleAppMention, handleDirectMessage } = require('../../shared/commandPatterns.js');
const { handleLastPickCommand } = require('../../handlers/lastpick.js');
const { handleRegisterDraftCommand } = require('../../handlers/registerDraft.js');
const { handleUsageCommand } = require('../../handlers/handleUsageCommand.js');
const { handleCheckLeagueRostersCommand } = require('../../handlers/checkRosters.js');
const { handleListDraftsCommand } = require('../../handlers/listDrafts.js');
const { handleUpdatePlayersCommand } = require('../../handlers/updatePlayers.js');

describe('commandPatterns', () => {
    let say;
    let logger;

    beforeEach(() => {
        jest.clearAllMocks();
        say = jest.fn().mockResolvedValue();
        logger = { error: jest.fn() };
    });

    describe('createCommandPayload', () => {
        it('builds a consistent payload', () => {
            expect(createCommandPayload('hi', 'C1', '123.45')).toEqual({
                text: 'hi', channel_id: 'C1', ts: '123.45'
            });
        });

        it('defaults ts to null', () => {
            expect(createCommandPayload('hi', 'C1').ts).toBeNull();
        });
    });

    describe('handleAppMention routing', () => {
        const mention = (text) => ({ event: { text: `<@U0BOT> ${text}`, channel: 'C1', ts: '99.9' }, say, logger, client: {} });

        it('routes "last pick" to the last-pick handler', async () => {
            await handleAppMention(mention('last pick'));
            expect(handleLastPickCommand).toHaveBeenCalled();
        });

        it('routes "register draft 123" with the trimmed remaining text', async () => {
            await handleAppMention(mention('register draft 123'));
            expect(handleRegisterDraftCommand).toHaveBeenCalledWith(
                expect.objectContaining({ command: expect.objectContaining({ text: '123' }) })
            );
        });

        it('routes "check league rosters 555" to the league-rosters handler', async () => {
            await handleAppMention(mention('check league rosters 555'));
            expect(handleCheckLeagueRostersCommand).toHaveBeenCalledWith(
                expect.objectContaining({ command: expect.objectContaining({ text: '555' }) })
            );
        });

        it('shows usage when the mention has no command text', async () => {
            await handleAppMention(mention(''));
            expect(handleUsageCommand).toHaveBeenCalled();
        });

        it('replies with an error and usage for an unknown command', async () => {
            await handleAppMention(mention('flibbertigibbet'));
            expect(say).toHaveBeenCalledWith(expect.stringContaining("don't understand"));
            expect(handleUsageCommand).toHaveBeenCalled();
        });

        it('logs and reports an error when a handler throws', async () => {
            handleLastPickCommand.mockRejectedValueOnce(new Error('boom'));
            await handleAppMention(mention('last pick'));
            expect(logger.error).toHaveBeenCalled();
            expect(say).toHaveBeenCalledWith(expect.stringContaining('error occurred'));
        });
    });

    describe('handleDirectMessage', () => {
        it('routes "list drafts" in a DM', async () => {
            await handleDirectMessage({ message: { channel_type: 'im', text: 'list drafts', channel: 'D1' }, say, logger, client: {} });
            expect(handleListDraftsCommand).toHaveBeenCalled();
        });

        it('routes "update players" in a DM', async () => {
            await handleDirectMessage({ message: { channel_type: 'im', text: 'update players', channel: 'D1' }, say, logger, client: {} });
            expect(handleUpdatePlayersCommand).toHaveBeenCalled();
        });

        it('ignores messages outside of a DM', async () => {
            await handleDirectMessage({ message: { channel_type: 'channel', text: 'list drafts' }, say, logger, client: {} });
            expect(handleListDraftsCommand).not.toHaveBeenCalled();
        });
    });
});
