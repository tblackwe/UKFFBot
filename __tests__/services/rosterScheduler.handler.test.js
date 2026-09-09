jest.mock('../../services/rosterScheduler.js');
jest.mock('../../services/datastore.js');
jest.mock('../../services/rosterAnalyzer.js');
jest.mock('../../shared/logger.js', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));
jest.mock('@slack/web-api', () => ({
    WebClient: jest.fn(() => ({
        chat: { postMessage: jest.fn().mockResolvedValue({}) }
    }))
}));

const { evaluateRosterCheck } = require('../../services/rosterScheduler.js');
const datastore = require('../../services/datastore.js');
const { handler } = require('../../lambda-roster-scheduler.js');

describe('lambda-roster-scheduler handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        datastore.releaseRosterCheck.mockResolvedValue();
        datastore.getAllChannelsWithLeagues.mockResolvedValue([]);
    });

    it('returns skipped without touching Slack when the gate says no', async () => {
        evaluateRosterCheck.mockResolvedValue({ shouldRun: false, reason: 'too_early', etDate: '2026-09-10' });

        const result = await handler({});

        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body).message).toBe('skipped: too_early');
        expect(datastore.getAllChannelsWithLeagues).not.toHaveBeenCalled();
        expect(datastore.releaseRosterCheck).not.toHaveBeenCalled();
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
    });
});
