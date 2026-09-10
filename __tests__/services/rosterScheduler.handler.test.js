jest.mock('../../services/rosterScheduler.js');
jest.mock('../../services/datastore.js');
jest.mock('../../services/rosterAnalyzer.js');
jest.mock('../../shared/logger.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));
jest.mock('@slack/web-api', () => {
    const postMessage = jest.fn().mockResolvedValue({});
    const WebClient = jest.fn(() => ({ chat: { postMessage } }));
    WebClient.postMessage = postMessage;
    return { WebClient };
});

const { evaluateRosterCheck } = require('../../services/rosterScheduler.js');
const datastore = require('../../services/datastore.js');
const analyzer = require('../../services/rosterAnalyzer.js');
const { WebClient } = require('@slack/web-api');
const { handler } = require('../../lambda-roster-scheduler.js');

describe('lambda-roster-scheduler handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        WebClient.postMessage.mockReset().mockResolvedValue({});
        datastore.releaseRosterCheck.mockResolvedValue();
        datastore.markRosterCheckComplete.mockResolvedValue();
        datastore.getAllChannelsWithLeagues.mockResolvedValue([]);
        analyzer.analyzeLeagueRosters.mockResolvedValue({});
        analyzer.formatAnalysisMessage.mockReturnValue({ text: 'ok', blocks: [] });
    });

    it('returns skipped without touching Slack when the gate says no', async () => {
        evaluateRosterCheck.mockResolvedValue({ shouldRun: false, reason: 'too_early', etDate: '2026-09-10' });

        const result = await handler({});

        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body).message).toBe('skipped: too_early');
        expect(datastore.getAllChannelsWithLeagues).not.toHaveBeenCalled();
        expect(datastore.releaseRosterCheck).not.toHaveBeenCalled();
        expect(datastore.markRosterCheckComplete).not.toHaveBeenCalled();
    });

    it('releases the lock when the check throws after claiming', async () => {
        evaluateRosterCheck.mockResolvedValue({
            shouldRun: true,
            reason: 'run',
            etDate: '2026-09-10',
            firstKickoff: new Date('2026-09-11T00:15:00.000Z')
        });
        datastore.getAllChannelsWithLeagues.mockRejectedValue(new Error('DynamoDB down'));

        const result = await handler({});

        expect(result.statusCode).toBe(500);
        expect(datastore.releaseRosterCheck).toHaveBeenCalledWith('2026-09-10');
        expect(datastore.markRosterCheckComplete).not.toHaveBeenCalled();
    });

    it('marks the lock complete when there are no channels to notify', async () => {
        evaluateRosterCheck.mockResolvedValue({
            shouldRun: true,
            reason: 'run',
            etDate: '2026-09-10',
            firstKickoff: new Date('2026-09-11T00:15:00.000Z')
        });

        const result = await handler({});

        expect(result.statusCode).toBe(200);
        expect(datastore.markRosterCheckComplete).toHaveBeenCalledWith('2026-09-10');
        expect(datastore.releaseRosterCheck).not.toHaveBeenCalled();
    });

    it('releases the lock when Slack posts nothing so a later poll can retry', async () => {
        evaluateRosterCheck.mockResolvedValue({
            shouldRun: true,
            reason: 'run',
            etDate: '2026-09-10',
            firstKickoff: new Date('2026-09-11T00:15:00.000Z')
        });
        datastore.getAllChannelsWithLeagues.mockResolvedValue([
            { channelId: 'C1', leagues: [{ leagueId: '1', leagueName: 'L', season: '2026' }] }
        ]);
        WebClient.postMessage.mockRejectedValue(new Error('Slack down'));

        const result = await handler({});

        expect(result.statusCode).toBe(500);
        expect(datastore.releaseRosterCheck).toHaveBeenCalledWith('2026-09-10');
        expect(datastore.markRosterCheckComplete).not.toHaveBeenCalled();
    });

    it('keeps the lock after a successful Slack post', async () => {
        evaluateRosterCheck.mockResolvedValue({
            shouldRun: true,
            reason: 'run',
            etDate: '2026-09-10',
            firstKickoff: new Date('2026-09-11T00:15:00.000Z')
        });
        datastore.getAllChannelsWithLeagues.mockResolvedValue([
            { channelId: 'C1', leagues: [{ leagueId: '1', leagueName: 'L', season: '2026' }] }
        ]);

        const result = await handler({});

        expect(result.statusCode).toBe(200);
        expect(WebClient.postMessage).toHaveBeenCalled();
        expect(datastore.markRosterCheckComplete).toHaveBeenCalledWith('2026-09-10');
        expect(datastore.releaseRosterCheck).not.toHaveBeenCalled();
    });
});
